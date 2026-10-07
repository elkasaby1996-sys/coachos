import { createHash } from "node:crypto";
import {
  appendFileSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertReplacementTarget,
  replacementPolicy,
} from "./staging-replacement-target.mjs";
import {
  filterManagedCopyBlocks,
  managedExclusionArgument,
  validatePortableData,
} from "./staging-logical-backup-data.mjs";
import {
  LEDGER_QUERY,
  ledgerRowsDigest,
  validateLedgerArtifact,
} from "./staging-backup-ledger.mjs";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export function captureBackupLedger(
  mode,
  env,
  directory = "backup",
  execute = execFileSync,
) {
  const { staging } = validateBackupEnvironment(env);
  if (
    !["ledger-before", "ledger-after"].includes(mode) ||
    env.GITHUB_ACTIONS !== "true" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_WORKFLOW !== "Supabase Staging Logical Backup" ||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")
  )
    throw new Error("BACKUP_LEDGER_AUTHORIZATION_REQUIRED");
  // URL stays out of argv/logs; -X disables user startup SQL, and the session is read-only.
  // PGDATABASE does not expand connection URIs. Use explicit validated libpq fields.
  const connection = new URL(env.STAGING_SUPABASE_DB_URL);
  const childEnv = {
    ...env,
    PGHOST: connection.hostname,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGSSLMODE: "require",
    PGCLIENTENCODING: "UTF8",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=30000",
    PGCONNECT_TIMEOUT: "15",
  };
  // An empty PGSERVICEFILE is still interpreted as a filename by libpq.
  for (const key of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"])
    delete childEnv[key];
  const startedAt = new Date().toISOString();
  const rows = JSON.parse(
    execute("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      input: LEDGER_QUERY,
      env: childEnv,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 45_000,
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  ledgerRowsDigest(rows);
  const stamp = new Date().toISOString();
  const beforePath = join(directory, "migration-ledger-before.json");
  const value = {
    schemaVersion: 1,
    executionCommit: env.GITHUB_SHA,
    projectSha256: sha256(staging),
    startedAt,
    completedAt: stamp,
    rows,
  };
  if (mode === "ledger-before") {
    writeFileSync(beforePath, JSON.stringify(value) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return;
  }
  const before = JSON.parse(readFileSync(beforePath, "utf8"));
  const checked = validateLedgerArtifact(before, {
    commit: env.GITHUB_SHA,
    projectSha256: sha256(staging),
  });
  if (checked.rowsSha256 !== ledgerRowsDigest(rows))
    throw new Error("BACKUP_LEDGER_DRIFT");
  value.startedAt = before.startedAt;
  writeFileSync(
    join(directory, "migration-ledger.json"),
    JSON.stringify(value) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  unlinkSync(beforePath);
}

// All failures are deliberately static: never expose parser errors or input values.
export function validateBackupEnvironment(env) {
  const staging = env.STAGING_SUPABASE_PROJECT_REF;
  const production = env.PRODUCTION_SUPABASE_PROJECT_REF;
  const raw = env.STAGING_SUPABASE_DB_URL;
  const fail = () => {
    throw new Error("Staging backup boundary validation failed.");
  };
  try {
    const origin = new URL(env.STAGING_APPLICATION_ORIGIN);
    const productionOrigin = new URL(env.PRODUCTION_APPLICATION_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== env.STAGING_APPLICATION_ORIGIN ||
      origin.username ||
      origin.password ||
      origin.port ||
      productionOrigin.protocol !== "https:" ||
      productionOrigin.origin !== env.PRODUCTION_APPLICATION_ORIGIN ||
      productionOrigin.username ||
      productionOrigin.password ||
      productionOrigin.port ||
      origin.origin === productionOrigin.origin
    )
      fail();
    const policy = assertReplacementTarget(
      staging,
      env.STAGING_APPLICATION_ORIGIN,
    );
    if (
      policy.productionOrigin !== null &&
      policy.productionOrigin !== productionOrigin.origin
    )
      fail();
  } catch {
    fail();
  }
  if (
    !/^[a-z]{20}$/.test(staging ?? "") ||
    !/^[a-z]{20}$/.test(production ?? "") ||
    staging === production ||
    env.CONFIRM_PROJECT_REF !== staging ||
    !raw ||
    raw !== raw.trim()
  )
    fail();
  let url, decoded;
  try {
    url = new URL(raw);
    decoded = decodeURIComponent(raw);
  } catch {
    fail();
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.password ||
    url.pathname !== "/postgres" ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "5432") ||
    decoded.toLowerCase().includes(production) ||
    /localhost|\.local\b|\.internal\b|placeholder|your[-_ ]|\[|\]|<|>|changeme|replace[-_ ]?me|example\.(com|org|net)/i.test(
      decoded,
    )
  )
    fail();
  const direct =
    url.hostname === `db.${staging}.supabase.co` && url.username === "postgres";
  const sessionPooler =
    /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    url.username === `postgres.${staging}`;
  if (!direct && !sessionPooler) fail();
  const label = env.EVIDENCE_LABEL ?? "";
  if (
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(label) ||
    label.includes(staging) ||
    label.includes(production)
  )
    fail();
  return { staging, label };
}

export function writeBackupEvidence(env, directory = "backup") {
  const { staging, label } = validateBackupEnvironment(env);
  if (
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "") ||
    !/^[0-9]+$/.test(env.GITHUB_RUN_ID ?? "")
  ) {
    throw new Error("Invalid backup run metadata.");
  }
  let portability;
  const ledgerBytes = readFileSync(join(directory, "migration-ledger.json"));
  const ledgerArtifact = JSON.parse(ledgerBytes);
  const ledger = validateLedgerArtifact(ledgerArtifact, {
    commit: env.GITHUB_SHA,
    projectSha256: sha256(staging),
  });
  const files = [
    "roles.sql",
    "schema.sql",
    "data.sql",
    "migration-ledger.json",
  ].map((filename) => {
    const bytes = readFileSync(join(directory, filename));
    if (!bytes.length) throw new Error("A required logical dump is empty.");
    if (filename === "data.sql") portability = validatePortableData(bytes);
    return { filename, sha256: sha256(bytes), byteLength: bytes.length };
  });
  writeFileSync(
    join(directory, "SHA256SUMS.txt"),
    files.map((f) => `${f.sha256}  ${f.filename}\n`).join(""),
  );
  const evidence = {
    schemaVersion: 3,
    environment: "staging",
    commitSha: env.GITHUB_SHA,
    githubRunId: env.GITHUB_RUN_ID,
    evidenceLabel: label,
    // Recovery age includes all component collection time, not only publication.
    createdAt: ledgerArtifact.startedAt,
    projectRefSha256: sha256(staging),
    files,
    migrationLedgerIncluded: true,
    migrationLedgerSha256: sha256(ledgerBytes),
    ledgerVersions: ledger.versions,
    ledgerRowsSha256: ledger.rowsSha256,
    ...portability,
    storageObjectsIncluded: false,
    remoteMutationPerformed: false,
  };
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  writeFileSync(join(directory, "backup-evidence.json"), bytes);
  const digest = sha256(bytes);
  writeFileSync(join(directory, "backup-evidence.sha256"), `${digest}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      [
        ...files,
        {
          filename: "backup-evidence.json",
          byteLength: bytes.length,
          sha256: digest,
        },
      ]
        .map(
          (f) =>
            `${f.filename}: ${f.byteLength} bytes; SHA-256 ${f.sha256}\n\n`,
        )
        .join(""),
    );
  }
  return evidence;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (
      ["validate", "ledger-before", "ledger-after", "evidence"].includes(
        process.argv[2],
      )
    )
      assertReplacementTarget(
        process.env.STAGING_SUPABASE_PROJECT_REF,
        process.env.STAGING_APPLICATION_ORIGIN,
        replacementPolicy(),
        true,
      );
    if (process.argv[2] === "validate") validateBackupEnvironment(process.env);
    else if (["ledger-before", "ledger-after"].includes(process.argv[2]))
      captureBackupLedger(process.argv[2], process.env);
    else if (process.argv[2] === "evidence") writeBackupEvidence(process.env);
    else if (process.argv[2] === "exclusions")
      console.log(managedExclusionArgument());
    else if (process.argv[2] === "portable-copy" && process.argv.length === 5) {
      const [, , , source, destination] = process.argv;
      const bytes = filterManagedCopyBlocks(readFileSync(source));
      // Exclusive creation protects the source and any existing derivative,
      // including aliases/symlinks. SQL stays private and outside stdout.
      writeFileSync(destination, bytes, { flag: "wx", mode: 0o600 });
    } else throw new Error("Unsupported mode.");
  } catch {
    console.error(
      "Staging backup validation or evidence generation failed; details suppressed.",
    );
    process.exitCode = 1;
  }
}
