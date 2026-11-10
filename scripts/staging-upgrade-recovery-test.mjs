// Local-only regression for hosted/local managed-column differences. All
// source fixture changes run in one rolled-back transaction. Captured rows stay
// in memory; only aggregate results are printed. No hosted credentials or APIs.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localReferenceEnvironment } from "./staging-schema-reference.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import { releaseIdentity } from "./staging-release-artifacts.mjs";
import { verifyUpgradeSchema } from "./staging-upgrade-schema.mjs";
import { STAGING_PROJECT } from "./staging-billing-status.mjs";
import { INVENTORY_QUERY } from "./billing-retirement-remote-inventory.mjs";
import {
  MANAGED_COLUMNS_QUERY,
  backupRowsQuery,
  restoreRowsSql,
  verifyUpgradeBackupLocally,
  encryptUpgradeBackup,
  decryptUpgradeBackup,
  BACKUP_DATA_ENCODING,
  readBackupRows,
  verifyCapturedHistory,
  recoveryHistoryQuery as historyQuery,
} from "./staging-upgrade-backup.mjs";
try {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const container = process.argv[3] ?? "supabase_db_coachos";
  if (!/^supabase_db_[a-z0-9_]+$/.test(container) || !process.argv[2])
    throw Error("LOCAL_RECOVERY_TEST_ARGUMENTS_INVALID");
  const env = localReferenceEnvironment(process.env);
  const identity = releaseIdentity(root);
  const reference = JSON.parse(readFileSync(process.argv[2]));
  const checkpoints = JSON.parse(
    readFileSync(join(root, "config/staging-release-checkpoints.json")),
  );
  const fixtureId = randomUUID();
  const run = (query) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-h",
        "/var/run/postgresql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
      ],
      {
        input:
          "set standard_conforming_strings=on; set search_path=public,extensions; set timezone='UTC';\n" +
          query,
        encoding: "utf8",
        env,
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 60_000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  const read = (query) => JSON.parse(run(query));
  const facts = read(INVENTORY_QUERY);
  verifyUpgradeSchema(facts, reference, identity, checkpoints, STAGING_PROJECT);
  const tables = facts.tables.map((t) => t.name).sort();
  const names = [
    ...tables.map((t) => "public." + t),
    "auth.users",
    "supabase_migrations.schema_migrations",
  ];
  const originalHistory = read(historyQuery(tables));
  const originalManaged = read(MANAGED_COLUMNS_QUERY);
  const ledgerQuery =
    "select jsonb_agg(to_jsonb(m) order by version)::text from supabase_migrations.schema_migrations m;";
  const originalLedger = run(ledgerQuery).trim();
  const queries = [];
  for (let i = 0; i < names.length; i += 8)
    queries.push(backupRowsQuery(names.slice(i, i + 8)));
  const scenario = `begin;
set local session_replication_role=replica;
insert into auth.users (id,email) values ('${fixtureId}','managed-recovery@example.test');
alter table auth.users add column recovery_source_metadata jsonb;
alter table auth.users add column recovery_source_tag text;
alter table auth.users drop column is_anonymous restrict;
update auth.users set recovery_source_metadata=jsonb_build_object('private','synthetic metadata','nested',jsonb_build_array(null,true,'unicode Ω'),'precision','{"scaled":1.00,"large":9007199254740993,"fraction":0.12345678901234567890123456789}'::jsonb),recovery_source_tag='synthetic O''Brien';
update public.commercial_plan_feature_entitlements set configuration=configuration || '{"recovery_numeric_fixture":{"scaled":1.00,"large":9007199254740993,"fraction":0.12345678901234567890123456789}}'::jsonb;
alter table supabase_migrations.schema_migrations add column created_by text;
alter table supabase_migrations.schema_migrations add column rollback text[];
alter table supabase_migrations.schema_migrations add column idempotency_key uuid;
alter table supabase_migrations.schema_migrations add column source_metadata jsonb;
update supabase_migrations.schema_migrations set created_by='synthetic O''Brien',rollback=array['select 1;','synthetic recovery text'],idempotency_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',source_metadata='{"scaled":1.00,"large":9007199254740993,"fraction":0.12345678901234567890123456789}'::jsonb;
${MANAGED_COLUMNS_QUERY}
${historyQuery(tables)};
${queries.join("\n")}
rollback;`;
  const results = run(scenario)
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  const managedColumns = results.shift(),
    history = results.shift(),
    data = Object.assign({}, ...results);
  let numericFailureReproduced = false;
  try {
    const lossy = JSON.stringify(JSON.parse(data["auth.users"]));
    // Canonicalize in PostgreSQL again to remove whitespace/key-order effects;
    // the remaining difference demonstrates lost numeric values/decimal scale.
    const canonicalLossy = run(
      `select '${lossy.replaceAll("'", "''")}'::jsonb::text;`,
    ).trim();
    verifyCapturedHistory(
      { "auth.users": canonicalLossy },
      { "auth.users": history["auth.users"] },
    );
  } catch (error) {
    numericFailureReproduced =
      error.message === "UPGRADE_CAPTURED_HISTORY_DIFFERS";
  }
  if (!numericFailureReproduced) throw Error("NUMERIC_FAILURE_NOT_REPRODUCED");
  let reproduced = false;
  try {
    restoreRowsSql(
      Object.fromEntries(
        ["auth.users", "supabase_migrations.schema_migrations"].map((n) => [
          n,
          data[n],
        ]),
      ),
      originalManaged,
    );
  } catch (e) {
    reproduced = e.message === "UPGRADE_BACKUP_MANAGED_COLUMNS_DIFFER";
  }
  if (!reproduced) throw Error("ORIGINAL_FAILURE_NOT_REPRODUCED");
  const binding = {
    project: STAGING_PROJECT,
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    runId: "local-recovery-test",
    attempt: "1",
  };
  const snapshot = {
    ...binding,
    dataEncoding: BACKUP_DATA_ENCODING,
    facts,
    managedColumns,
    history,
    data,
  };
  const recovery = await verifyUpgradeBackupLocally(snapshot, {
    root,
    identity,
    reference,
    checkpoints,
  });
  const passphrase = randomBytes(32).toString("hex");
  const encrypted = encryptUpgradeBackup({ ...snapshot, recovery }, passphrase);
  const restored = decryptUpgradeBackup(encrypted, passphrase, binding);
  if (JSON.stringify(restored.data) !== JSON.stringify(data))
    throw Error("ENCRYPTED_VALUES_DIFFER");
  if (
    JSON.stringify(read(historyQuery(tables))) !==
      JSON.stringify(originalHistory) ||
    JSON.stringify(read(MANAGED_COLUMNS_QUERY)) !==
      JSON.stringify(originalManaged) ||
    run(ledgerQuery).trim() !== originalLedger
  )
    throw Error("LOCAL_SOURCE_CHANGED");
  const report = {
    localOnly: true,
    status: "passed",
    originalFailureReproduced: reproduced,
    numericFailureReproduced,
    numericPublicTable: "commercial_plan_feature_entitlements",
    recovery,
    authUserCount: readBackupRows(data["auth.users"]).length,
    ledgerRowCount: readBackupRows(
      data["supabase_migrations.schema_migrations"],
    ).length,
    sourceOnlyAuthColumns: 2,
    sourceOnlyLedgerColumns: 4,
    localOnlyAuthColumns: 1,
    encryptedBytes: encrypted.length,
    sourceUnchanged: true,
  };
  mkdirSync(join(root, "output/staging-upgrade"), { recursive: true });
  writeFileSync(
    join(root, "output/staging-upgrade/recovery-test.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (e) {
  console.error(
    JSON.stringify({
      status: "failed",
      code: /^[A-Z0-9_]+$/.test(e.message)
        ? e.message
        : "LOCAL_REHEARSAL_FAILED",
      localStage: e.localStage,
      sqlState: e.sqlState,
    }),
  );
  process.exitCode = 1;
}
