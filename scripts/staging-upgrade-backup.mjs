// A private, targeted recovery snapshot for this in-place upgrade: every public
// table, Auth users, migration ledger, and verified schema. Other managed Auth
// tables, storage objects, hosted settings and provider resources are untouched.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localReferenceEnvironment } from "./staging-schema-reference.mjs";
import { hash } from "./billing-retirement-release.mjs";
import { historyQuery } from "./staging-release-observation.mjs";
import { INVENTORY_QUERY } from "./billing-retirement-remote-inventory.mjs";
import { ledgerRowsDigest } from "./staging-backup-ledger.mjs";
import {
  restoreLocalGrantSql,
  verifyUpgradeSchema,
} from "./staging-upgrade-schema.mjs";

const check = (ok, code = "UPGRADE_BACKUP_INVALID") => {
  if (!ok) throw new Error(code);
};
const MAX_BYTES = 64 * 1024 * 1024;
const identifier = (name) => {
  check(/^[a-z_][a-z0-9_]*$/.test(name));
  return `"${name}"`;
};
const relation = (name) => {
  const [schema, table, extra] = name.split(".");
  check(!extra && ["public", "auth", "supabase_migrations"].includes(schema));
  return `${identifier(schema)}.${identifier(table)}`;
};
const literal = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const sorted = (value) =>
  Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
const key = (password, salt) => {
  check(
    typeof password === "string" && password.length > 0,
    "SUPABASE_DB_PASSWORD_MISSING",
  );
  return scryptSync(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
};

export function encryptUpgradeBackup(snapshot, password) {
  const plain = Buffer.from(JSON.stringify(snapshot));
  check(plain.length <= MAX_BYTES, "UPGRADE_BACKUP_TOO_LARGE");
  const salt = randomBytes(32),
    iv = randomBytes(12);
  const metadata = {
    purpose: "repsync-staging-upgrade",
    schemaVersion: 1,
    project: snapshot.project,
    commit: snapshot.commit,
    runId: snapshot.runId,
    attempt: snapshot.attempt,
  };
  const cipher = createCipheriv("aes-256-gcm", key(password, salt), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(metadata)));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      metadata,
      algorithm: "aes-256-gcm",
      kdf: "scrypt-N32768-r8-p1",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: encrypted.toString("base64"),
    }),
  );
}

export function decryptUpgradeBackup(bytes, password, binding) {
  try {
    check(Buffer.isBuffer(bytes) && bytes.length <= MAX_BYTES * 1.5);
    const value = JSON.parse(bytes);
    check(
      value.algorithm === "aes-256-gcm" && value.kdf === "scrypt-N32768-r8-p1",
    );
    check(
      value.metadata?.schemaVersion === 1 &&
        value.metadata.purpose === "repsync-staging-upgrade",
    );
    check(
      ["project", "commit", "runId", "attempt"].every(
        (field) => value.metadata[field] === binding[field],
      ),
    );
    const salt = Buffer.from(value.salt, "base64"),
      iv = Buffer.from(value.iv, "base64"),
      tag = Buffer.from(value.tag, "base64");
    check(salt.length === 32 && iv.length === 12 && tag.length === 16);
    const decipher = createDecipheriv("aes-256-gcm", key(password, salt), iv);
    decipher.setAAD(Buffer.from(JSON.stringify(value.metadata)));
    decipher.setAuthTag(tag);
    const snapshot = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, "base64")),
        decipher.final(),
      ]),
    );
    check(
      ["project", "commit", "runId", "attempt"].every(
        (field) => snapshot[field] === binding[field],
      ),
    );
    return snapshot;
  } catch {
    throw new Error("UPGRADE_BACKUP_DECRYPTION_FAILED");
  }
}

export function backupRowsQuery(names) {
  check(
    Array.isArray(names) &&
      names.length > 0 &&
      names.length <= 8 &&
      new Set(names).size === names.length,
  );
  return `select jsonb_build_object(${names.map((name) => `'${name}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${relation(name)} t)`).join(",")}) as data;`;
}

export async function captureUpgradeRows(sql, tables) {
  const names = [
    ...tables.map((name) => `public.${name}`),
    "auth.users",
    "supabase_migrations.schema_migrations",
  ];
  const data = {};
  let bytes = 0;
  for (let i = 0; i < names.length; i += 8) {
    const batch = names.slice(i, i + 8);
    const rows = await sql(backupRowsQuery(batch));
    check(
      Array.isArray(rows) &&
        rows.length === 1 &&
        rows[0].data &&
        JSON.stringify(Object.keys(rows[0].data).sort()) ===
          JSON.stringify([...batch].sort()),
    );
    for (const name of batch) {
      check(Array.isArray(rows[0].data[name]));
      data[name] = rows[0].data[name];
      bytes += Buffer.byteLength(JSON.stringify(data[name]));
      check(bytes <= MAX_BYTES, "UPGRADE_BACKUP_TOO_LARGE");
    }
  }
  data["supabase_migrations.schema_migrations"].sort((a, b) =>
    a.version.localeCompare(b.version),
  );
  ledgerRowsDigest(data["supabase_migrations.schema_migrations"]);
  return data;
}

async function ports() {
  const servers = [];
  try {
    for (let i = 0; i < 6; i++) {
      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      servers.push(server);
    }
    return servers.map((server) => server.address().port);
  } finally {
    await Promise.all(
      servers.map((server) => new Promise((resolve) => server.close(resolve))),
    );
  }
}

export function restoreRowsSql(data, columns) {
  const names = Object.keys(data).sort();
  const statements = [
    "begin; set local standard_conforming_strings=on; set local timezone='UTC'; set local session_replication_role=replica;",
    `truncate table ${names.map(relation).join(",")} cascade;`,
  ];
  for (const name of names) {
    const schemaColumns = columns[name];
    check(
      Array.isArray(schemaColumns) && schemaColumns.length > 0,
      "UPGRADE_BACKUP_RESTORE_COLUMNS_INVALID",
    );
    const allowed = new Set(schemaColumns.map((column) => column.name));
    const insertColumns = schemaColumns
      .filter((column) => !column.generated)
      .map((column) => identifier(column.name));
    for (const row of data[name])
      check(
        row && Object.keys(row).every((column) => allowed.has(column)),
        "UPGRADE_BACKUP_MANAGED_COLUMNS_DIFFER",
      );
    if (data[name].length)
      statements.push(
        `insert into ${relation(name)} (${insertColumns.join(",")}) overriding system value select ${insertColumns.join(",")} from jsonb_populate_recordset(null::${relation(name)},${literal(data[name])});`,
      );
  }
  statements.push("commit;");
  return statements.join("\n");
}

export async function verifyUpgradeBackupLocally(
  snapshot,
  { identity, reference, checkpoints, root = process.cwd() },
) {
  const count = snapshot.facts.versions.length;
  const sourceSchema = verifyUpgradeSchema(
    snapshot.facts,
    reference,
    identity,
    checkpoints,
    snapshot.project,
  );
  const env = localReferenceEnvironment(process.env);
  const directory = mkdtempSync(join(tmpdir(), "repsync-upgrade-recovery-"));
  const project = `repsync_recovery_${randomBytes(8).toString("hex")}`;
  let started = false,
    stage = "cli_version";
  const run = (command, args, input) => {
    try {
      return execFileSync(command, args, {
        cwd: root,
        env,
        input,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10 * 60_000,
        maxBuffer: MAX_BYTES,
      });
    } catch (cause) {
      const error = new Error("UPGRADE_LOCAL_RESTORE_FAILED");
      error.localStage = stage;
      const code = cause.stderr?.toString().match(/ERROR:\s+([0-9A-Z]{5}):/);
      if (code) error.sqlState = code[1];
      throw error;
    }
  };
  const sql = (query) =>
    run(
      "docker",
      [
        "exec",
        "-i",
        `supabase_db_${project}`,
        "psql",
        "-h",
        "/var/run/postgresql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "VERBOSITY=verbose",
        "-U",
        "postgres",
        "-d",
        "postgres",
      ],
      query,
    );
  try {
    check(
      run("supabase", ["--version"]).trim() === "2.109.1",
      "UPGRADE_PINNED_CLI_REQUIRED",
    );
    const [api, db, shadow, studio, inbucket, analytics] = await ports();
    mkdirSync(join(directory, "supabase/migrations"), { recursive: true });
    writeFileSync(
      join(directory, "supabase/config.toml"),
      `project_id = "${project}"\n[api]\nport = ${api}\n[db]\nport = ${db}\nshadow_port = ${shadow}\nmajor_version = 17\n[db.migrations]\nenabled = true\n[db.seed]\nenabled = false\n[studio]\nport = ${studio}\n[inbucket]\nport = ${inbucket}\n[analytics]\nport = ${analytics}\n`,
    );
    for (const migration of identity.manifest.migrations.approved.slice(
      0,
      count,
    )) {
      const source = readFileSync(
        join(root, "supabase/migrations", migration.filename),
        "utf8",
      ).replace(/\r\n/g, "\n");
      check(hash(source) === migration.sha256, "UPGRADE_SOURCE_DRIFT");
      writeFileSync(
        join(directory, "supabase/migrations", migration.filename),
        source,
      );
    }
    stage = "create_isolated_database";
    started = true;
    run("supabase", ["db", "start", "--workdir", directory, "--yes"]);
    stage = "restore_table_permissions";
    sql(restoreLocalGrantSql(sourceSchema.grants));
    stage = "inspect_restore_columns";
    const columns = JSON.parse(
      sql(
        `select jsonb_object_agg(name,columns) from (select n.nspname||'.'||c.relname name,jsonb_agg(jsonb_build_object('name',a.attname,'generated',a.attgenerated<>'') order by a.attnum) columns from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid where c.relkind='r' and a.attnum>0 and not a.attisdropped and (n.nspname='public' or (n.nspname='auth' and c.relname='users') or (n.nspname='supabase_migrations' and c.relname='schema_migrations')) group by n.nspname,c.relname) q;`,
      ),
    );
    stage = "restore_retained_rows";
    sql(restoreRowsSql(snapshot.data, columns));
    stage = "verify_restored_history";
    const tables = snapshot.facts.tables.map((table) => table.name).sort();
    const history = JSON.parse(sql(historyQuery(tables)));
    check(
      JSON.stringify(sorted(history)) ===
        JSON.stringify(sorted(snapshot.history)),
      "UPGRADE_RESTORED_HISTORY_DIFFERS",
    );
    stage = "verify_restored_ledger";
    const ledger = JSON.parse(
      sql(
        "select jsonb_agg(to_jsonb(m) order by version) from supabase_migrations.schema_migrations m;",
      ),
    );
    check(
      ledgerRowsDigest(ledger) ===
        ledgerRowsDigest(
          snapshot.data["supabase_migrations.schema_migrations"],
        ),
      "UPGRADE_RESTORED_LEDGER_DIFFERS",
    );
    stage = "verify_restored_schema";
    const facts = JSON.parse(
      sql(
        `begin read only; set local search_path=public,extensions; ${INVENTORY_QUERY} rollback;`,
      ),
    );
    const restored = verifyUpgradeSchema(
      facts,
      reference,
      identity,
      checkpoints,
      snapshot.project,
    );
    check(
      JSON.stringify(restored.grants) === JSON.stringify(sourceSchema.grants),
      "UPGRADE_RESTORED_GRANTS_DIFFER",
    );
    return {
      verified: true,
      verifiedAt: new Date().toISOString(),
      publicTableCount: tables.length,
      authUsersIncluded: true,
      migrationLedgerIncluded: true,
      allRetainedRowsIdentical: true,
      schemaProfile: restored.profile,
    };
  } finally {
    try {
      if (started) {
        stage = "remove_isolated_database";
        run("supabase", [
          "stop",
          "--workdir",
          directory,
          "--no-backup",
          "--yes",
        ]);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
