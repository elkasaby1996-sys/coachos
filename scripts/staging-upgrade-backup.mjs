// A private, targeted recovery snapshot for this in-place upgrade: every public
// table, Auth users, migration ledger, and verified schema. Other managed Auth
// tables, storage objects, hosted settings and provider resources are untouched.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
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
const literal = (jsonText) => `'${jsonText.replaceAll("'", "''")}'::jsonb`;
export const BACKUP_DATA_ENCODING = "postgres-jsonb-text-v1";
export const recoveryHistoryQuery = (tables) =>
  historyQuery(tables).replaceAll(
    "order by to_jsonb(t)::text",
    'order by to_jsonb(t)::text collate "C"',
  );
export function readBackupRows(jsonText) {
  check(
    typeof jsonText === "string" && Buffer.byteLength(jsonText) <= MAX_BYTES,
    "UPGRADE_BACKUP_ENCODING_INVALID",
  );
  let rows;
  try {
    rows = JSON.parse(jsonText);
  } catch {
    throw new Error("UPGRADE_BACKUP_ENCODING_INVALID");
  }
  check(
    Array.isArray(rows) &&
      rows.every(
        (row) => row && typeof row === "object" && !Array.isArray(row),
      ),
    "UPGRADE_BACKUP_ENCODING_INVALID",
  );
  // Decode only for field names/counts. Restoration always uses the ORIGINAL
  // PostgreSQL text, never JSON.stringify(rows), which loses numeric precision.
  return rows;
}

export function verifyCapturedHistory(data, history) {
  for (const [name, expected] of Object.entries(history)) {
    const relationName = name === "auth.users" ? name : `public.${name}`;
    const bytes = data[relationName];
    readBackupRows(bytes);
    check(
      createHash("md5").update(bytes).digest("hex") === expected,
      "UPGRADE_CAPTURED_HISTORY_DIFFERS",
    );
  }
}
const sorted = (value) =>
  Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
const MANAGED_RELATIONS = [
  "auth.users",
  "supabase_migrations.schema_migrations",
];
const managedFilter =
  "(n.nspname='auth' and c.relname='users') or (n.nspname='supabase_migrations' and c.relname='schema_migrations')";
const columnQuery = (filter) =>
  `select jsonb_object_agg(name,columns) as columns from (select n.nspname||'.'||c.relname name,jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'typeSchema',tn.nspname,'generated',a.attgenerated<>'') order by a.attnum) columns from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid join pg_type ty on ty.oid=a.atttypid join pg_namespace tn on tn.oid=ty.typnamespace where c.relkind='r' and a.attnum>0 and not a.attisdropped and (${filter}) group by n.nspname,c.relname) q;`;
export const MANAGED_COLUMNS_QUERY = columnQuery(managedFilter);
const RESTORE_COLUMNS_QUERY = columnQuery(
  `n.nspname='public' or ${managedFilter}`,
);
// Only PostgreSQL built-in row types are admitted. Never execute hosted defaults,
// generated expressions, custom type names, or other supplied SQL during recovery.
const builtinType =
  /^(?:uuid|text|boolean|smallint|integer|bigint|real|double precision|bytea|jsonb?|date|inet|cidr|(?:timestamp|time)(?:\([0-6]\))? (?:with|without) time zone|character(?: varying)?(?:\([1-9][0-9]{0,7}\))?|numeric(?:\([1-9][0-9]{0,3}(?:,-?[0-9]{1,4})?\))?)(?:\[\])?$/;

export function validateManagedColumns(columns) {
  check(
    columns &&
      JSON.stringify(Object.keys(columns).sort()) ===
        JSON.stringify(MANAGED_RELATIONS),
    "UPGRADE_BACKUP_MANAGED_SCHEMA_INVALID",
  );
  for (const name of MANAGED_RELATIONS) {
    const rows = columns[name];
    check(
      Array.isArray(rows) && rows.length > 0 && rows.length <= 128,
      "UPGRADE_BACKUP_MANAGED_SCHEMA_INVALID",
    );
    const names = new Set();
    for (const column of rows) {
      check(
        column &&
          /^[a-z_][a-z0-9_]*$/.test(column.name) &&
          column.name.length <= 63 &&
          !names.has(column.name) &&
          typeof column.generated === "boolean",
        "UPGRADE_BACKUP_MANAGED_SCHEMA_INVALID",
      );
      check(
        column.typeSchema === "pg_catalog" &&
          typeof column.type === "string" &&
          builtinType.test(column.type),
        "UPGRADE_BACKUP_MANAGED_TYPE_UNSUPPORTED",
      );
      names.add(column.name);
    }
    const key = name === "auth.users" ? ["id", "uuid"] : ["version", "text"];
    check(
      rows.some((column) => column.name === key[0] && column.type === key[1]),
      "UPGRADE_BACKUP_MANAGED_SCHEMA_INVALID",
    );
  }
  return columns;
}

export function managedRestoreSql(source, local) {
  validateManagedColumns(source);
  const statements = ["begin; set local search_path=pg_catalog;"];
  for (const name of MANAGED_RELATIONS) {
    const columns = local[name];
    check(Array.isArray(columns), "UPGRADE_BACKUP_RESTORE_COLUMNS_INVALID");
    for (const column of source[name]) {
      const existing = columns.find((item) => item.name === column.name);
      if (existing)
        check(
          existing.type === column.type &&
            existing.typeSchema === column.typeSchema,
          "UPGRADE_BACKUP_MANAGED_TYPE_MISMATCH",
        );
      else
        statements.push(
          `alter table ${relation(name)} add column ${identifier(column.name)} ${column.type};`,
        );
    }
    // This SQL is used only on the uniquely named, disposable local database.
    // Remove local-version-only fields so FULL row hashes can match the source;
    // RESTRICT refuses to remove fields referenced by the application schema.
    for (const column of columns)
      if (!source[name].some((item) => item.name === column.name))
        statements.push(
          `alter table ${relation(name)} drop column ${identifier(column.name)} restrict;`,
        );
  }
  statements.push("commit;");
  return statements.join("\n");
}

export function validateManagedRows(data, columns) {
  validateManagedColumns(columns);
  for (const name of MANAGED_RELATIONS) {
    const keys = columns[name].map((column) => column.name).sort();
    check(
      readBackupRows(data[name]).every(
        (row) =>
          row &&
          JSON.stringify(Object.keys(row).sort()) === JSON.stringify(keys),
      ),
      "UPGRADE_BACKUP_MANAGED_COLUMNS_DIFFER",
    );
  }
}
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
  // Text survives JSON decoding by both the Management API and this process.
  // JSON-valued responses would round large integers and remove decimal scale.
  return `select jsonb_build_object(${names.map((name) => `'${name}',(select coalesce(jsonb_agg(to_jsonb(t) order by ${name === "supabase_migrations.schema_migrations" ? "t.version" : 'to_jsonb(t)::text collate "C"'}),'[]'::jsonb)::text from ${relation(name)} t)`).join(",")}) as data;`;
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
      readBackupRows(rows[0].data[name]);
      data[name] = rows[0].data[name];
      bytes += Buffer.byteLength(data[name]);
      check(bytes <= MAX_BYTES, "UPGRADE_BACKUP_TOO_LARGE");
    }
  }
  ledgerRowsDigest(
    readBackupRows(data["supabase_migrations.schema_migrations"]),
  );
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
    const rows = readBackupRows(data[name]);
    for (const row of rows)
      check(
        row && Object.keys(row).every((column) => allowed.has(column)),
        "UPGRADE_BACKUP_MANAGED_COLUMNS_DIFFER",
      );
    if (rows.length)
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
  check(
    snapshot.dataEncoding === BACKUP_DATA_ENCODING,
    "UPGRADE_BACKUP_ENCODING_INVALID",
  );
  verifyCapturedHistory(snapshot.data, snapshot.history);
  validateManagedRows(snapshot.data, snapshot.managedColumns);
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
  const sql = (query, role = "postgres") =>
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
        role,
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
    let columns = JSON.parse(sql(RESTORE_COLUMNS_QUERY));
    stage = "restore_managed_column_shapes";
    // Auth tables belong to supabase_auth_admin. Use the disposable container's
    // local administrator for column alignment, never a hosted connection.
    sql(managedRestoreSql(snapshot.managedColumns, columns), "supabase_admin");
    columns = JSON.parse(sql(RESTORE_COLUMNS_QUERY));
    stage = "restore_retained_rows";
    sql(restoreRowsSql(snapshot.data, columns));
    stage = "verify_restored_history";
    const tables = snapshot.facts.tables.map((table) => table.name).sort();
    const history = JSON.parse(sql(recoveryHistoryQuery(tables)));
    if (
      JSON.stringify(sorted(history)) !==
      JSON.stringify(sorted(snapshot.history))
    ) {
      const error = new Error("UPGRADE_RESTORED_HISTORY_DIFFERS");
      // Fixed source-table positions identify mismatches without exposing rows,
      // IDs, values, or even hosted-only managed column names.
      error.recoveryMismatch = {
        publicTableIndexes: tables.flatMap((name, index) =>
          history[name] === snapshot.history[name] ? [] : [index],
        ),
        authUsers: history["auth.users"] !== snapshot.history["auth.users"],
      };
      throw error;
    }
    stage = "verify_restored_ledger";
    const ledgerText = sql(
      "select jsonb_agg(to_jsonb(m) order by version)::text from supabase_migrations.schema_migrations m;",
    ).trim();
    check(
      ledgerText === snapshot.data["supabase_migrations.schema_migrations"],
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
      managedSchemaCaptured: true,
      dataEncoding: BACKUP_DATA_ENCODING,
      allRetainedRowsIdentical: true,
      schemaProfile: restored.profile,
    };
  } catch (error) {
    error.localStage ??= stage;
    throw error;
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
