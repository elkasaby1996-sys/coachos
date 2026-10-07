import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  sha256,
  validateBackupEnvironment,
  writeBackupEvidence,
  captureBackupLedger,
} from "../../scripts/staging-logical-backup.mjs";
import {
  LEDGER_QUERY,
  ledgerRowsDigest,
  validateLedgerArtifact,
  verifyRestoredLedger,
} from "../../scripts/staging-backup-ledger.mjs";
import {
  MANAGED_COMPATIBILITY_EXCLUSIONS,
  filterManagedCopyBlocks,
  inspectCopyData,
  managedExclusionArgument,
  validateManagedExclusions,
  validatePortableData,
} from "../../scripts/staging-logical-backup-data.mjs";

const expectedExclusions = [
  "auth.mfa_recovery_code_sets",
  "auth.mfa_recovery_codes",
  "auth.scim_tokens",
  "auth.scim_users",
  "auth.one_time_tokens",
];
const copy = (relation: string, rows = "", eol = "\n") =>
  `COPY ${relation} ("id") FROM stdin;${eol}${rows}\\.${eol}`;
const retainedData =
  copy('"auth"."users"', "private fixture user\r\n", "\r\n") +
  copy('"public"."billing_subscriptions"', "private fixture billing\n");
const rawData =
  retainedData + expectedExclusions.map((r) => copy(r, "managed\n")).join("");

const staging = "s".repeat(20),
  production = "p".repeat(20);
const env = {
  STAGING_SUPABASE_PROJECT_REF: staging,
  STAGING_APPLICATION_ORIGIN: "https://replacement-staging.example.com",
  PRODUCTION_SUPABASE_PROJECT_REF: production,
  PRODUCTION_APPLICATION_ORIGIN: "https://production.example.com",
  CONFIRM_PROJECT_REF: staging,
  STAGING_SUPABASE_DB_URL: `postgresql://postgres.${staging}:sensitive-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
  EVIDENCE_LABEL: "pre-commercial-apply",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_RUN_ID: "12345",
};
const directories: string[] = [];
const ledgerRows = JSON.parse(
  readFileSync("config/staging-commercial-certification.json", "utf8"),
)
  .migrations.approved.slice(0, 180)
  .map((m) => ({
    version: m.filename.slice(0, 14),
    name: m.filename.slice(15, -4),
    statements: ["-- private ledger fixture"],
  }));
const protectedEnv = {
  ...env,
  GITHUB_ACTIONS: "true",
  GITHUB_REF: "refs/heads/main",
  GITHUB_WORKFLOW: "Supabase Staging Logical Backup",
};
function ledgerFixture(directory: string) {
  const stamp = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    executionCommit: env.GITHUB_SHA,
    projectSha256: sha256(staging),
    startedAt: stamp,
    completedAt: stamp,
    rows: ledgerRows,
  };
  writeFileSync(
    join(directory, "migration-ledger.json"),
    JSON.stringify(artifact),
  );
  return artifact;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("staging backup offline validation", () => {
  it("captures and compares full ledger rows around dumps with a read-only session", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const execute = vi.fn(() => JSON.stringify(ledgerRows));
    captureBackupLedger("ledger-before", protectedEnv, directory, execute);
    captureBackupLedger("ledger-after", protectedEnv, directory, execute);
    const bytes = readFileSync(join(directory, "migration-ledger.json"));
    expect(existsSync(join(directory, "migration-ledger-before.json"))).toBe(
      false,
    );
    const result = verifyRestoredLedger(bytes, ledgerRows, {
      commit: env.GITHUB_SHA,
      projectSha256: sha256(staging),
    });
    expect(result).toEqual({
      migrationLedgerSha256: sha256(bytes),
      restoredLedgerRowsSha256: ledgerRowsDigest(ledgerRows),
      ledgerCount: 180,
    });
    expect(execute).toHaveBeenCalledTimes(2);
    const [command, args, options] = execute.mock.calls[0] as any;
    expect(command).toBe("psql");
    expect(args).toContain("-X");
    expect(args.join(" ")).not.toContain("sensitive-password");
    expect(options.input).toBe(LEDGER_QUERY);
    expect(options.env.PGOPTIONS).toContain("default_transaction_read_only=on");
    expect(options.env).toMatchObject({
      PGHOST: "aws-0-eu-west-1.pooler.supabase.com",
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: `postgres.${staging}`,
      PGPASSWORD: "sensitive-password",
      PGSSLMODE: "require",
      PGCLIENTENCODING: "UTF8",
    });
    for (const key of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"])
      expect(Object.hasOwn(options.env, key)).toBe(false);
    expect(options.stdio).toEqual(["pipe", "pipe", "pipe"]);
  });
  it("decodes validated credentials only into the private environment and clears routing overrides", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const execute = vi.fn(() => JSON.stringify(ledgerRows));
    captureBackupLedger(
      "ledger-before",
      {
        ...protectedEnv,
        STAGING_SUPABASE_DB_URL: `postgres://postgres:encoded%40password@db.${staging}.supabase.co:5432/postgres`,
        PGHOSTADDR: "192.0.2.1",
        PGSERVICE: "other-target",
        PGSERVICEFILE: "other-service",
      },
      directory,
      execute,
    );
    const [, args, options] = execute.mock.calls[0] as any;
    expect(args.join(" ")).not.toContain("password");
    expect(options.env).toMatchObject({
      PGHOST: `db.${staging}.supabase.co`,
      PGUSER: "postgres",
      PGPASSWORD: "encoded@password",
      PGDATABASE: "postgres",
    });
    for (const key of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"])
      expect(Object.hasOwn(options.env, key)).toBe(false);
  });
  it("rejects changed historical statements even when both prefix counts agree", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const execute = vi.fn(() => JSON.stringify(ledgerRows));
    captureBackupLedger("ledger-before", protectedEnv, directory, execute);
    const changed = structuredClone(ledgerRows);
    changed[0].statements = ["-- changed"];
    execute.mockReturnValue(JSON.stringify(changed));
    expect(() =>
      captureBackupLedger("ledger-after", protectedEnv, directory, execute),
    ).toThrow("LEDGER_DRIFT");
    expect(existsSync(join(directory, "migration-ledger.json"))).toBe(false);
  });
  it.each([
    "missing",
    "wrong project",
    "wrong commit",
    "reordered",
    "modified statements",
    "stale",
  ])("rejects %s recovery ledger", (kind) => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const artifact = ledgerFixture(directory),
      binding = { commit: env.GITHUB_SHA, projectSha256: sha256(staging) };
    if (kind === "missing") artifact.rows = [];
    if (kind === "wrong project") artifact.projectSha256 = sha256(production);
    if (kind === "wrong commit") artifact.executionCommit = "b".repeat(40);
    if (kind === "stale")
      artifact.startedAt = new Date(
        Date.now() - 25 * 60 * 60_000,
      ).toISOString();
    const restored = structuredClone(ledgerRows);
    if (kind === "reordered") restored.reverse();
    if (kind === "modified statements")
      restored[0].statements = ["-- reconstructed"];
    expect(() =>
      verifyRestoredLedger(
        Buffer.from(JSON.stringify(artifact)),
        restored,
        binding,
      ),
    ).toThrow();
  });
  it("does not launch a ledger query outside the protected backup workflow", () => {
    const execute = vi.fn();
    expect(() =>
      captureBackupLedger("ledger-before", env, "unused", execute),
    ).toThrow("AUTHORIZATION");
    expect(execute).not.toHaveBeenCalled();
  });
  it("rejects a backup with no ledger artifact before publishing evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    expect(() => writeBackupEvidence(env, directory)).toThrow();
    expect(existsSync(join(directory, "backup-evidence.json"))).toBe(false);
  });
  it("ages recovery evidence from the first ledger read, including collection time", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const began = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(began);
    try {
      const execute = vi.fn(() => {
        vi.setSystemTime(Date.now() + 20_000);
        return JSON.stringify(ledgerRows);
      });
      captureBackupLedger("ledger-before", protectedEnv, directory, execute);
      for (const filename of ["roles.sql", "schema.sql", "data.sql"])
        writeFileSync(
          join(directory, filename),
          filename === "data.sql"
            ? retainedData
            : "-- local synthetic fixture\n",
        );
      vi.setSystemTime(Date.now() + 10 * 60_000);
      captureBackupLedger("ledger-after", protectedEnv, directory, execute);
      const evidence = writeBackupEvidence(env, directory);
      expect(Date.parse(evidence.createdAt)).toBe(began);
      expect(Date.now() - Date.parse(evidence.createdAt)).toBe(640_000);
    } finally {
      vi.useRealTimers();
    }
  });
  it("ignores JSON key order but preserves complete restored values", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const artifact = ledgerFixture(directory);
    const reorderedKeys = ledgerRows.map((row) =>
      Object.fromEntries(Object.entries(row).reverse()),
    );
    expect(
      validateLedgerArtifact(artifact, {
        commit: env.GITHUB_SHA,
        projectSha256: sha256(staging),
      }).rowsSha256,
    ).toBe(ledgerRowsDigest(reorderedKeys));
  });
  it("accepts only bound direct or session pooler URLs", () => {
    expect(validateBackupEnvironment(env)).toEqual({
      staging,
      label: env.EVIDENCE_LABEL,
    });
    expect(() =>
      validateBackupEnvironment({
        ...env,
        STAGING_SUPABASE_DB_URL: `postgres://postgres:encoded%40password@db.${staging}.supabase.co:5432/postgres`,
      }),
    ).not.toThrow();
  });
  it.each([
    { CONFIRM_PROJECT_REF: production },
    { CONFIRM_PROJECT_REF: `${staging} ` },
    { STAGING_SUPABASE_PROJECT_REF: staging.toUpperCase() },
    { STAGING_SUPABASE_PROJECT_REF: "short" },
    { PRODUCTION_SUPABASE_PROJECT_REF: staging },
    { PRODUCTION_SUPABASE_PROJECT_REF: "" },
    { STAGING_SUPABASE_DB_URL: "" },
    { EVIDENCE_LABEL: "../../escape" },
    { EVIDENCE_LABEL: staging },
    { EVIDENCE_LABEL: "label\ncommand" },
  ])("fails closed on invalid configuration %j", (override) => {
    expect(() => validateBackupEnvironment({ ...env, ...override })).toThrow(
      "boundary validation failed",
    );
  });
  it.each([
    "not-a-url",
    "https://example.com",
    "postgres://postgres:pass@localhost/postgres",
    "postgres://postgres:pass@127.0.0.1/postgres",
    "postgres://postgres:pass@db.local/postgres",
    "postgres://postgres:pass@host.docker.internal/postgres",
    `postgres://postgres:pass@db.${production}.supabase.co/postgres`,
    `postgres://postgres.${production}:pass@aws-0-eu-west-1.pooler.supabase.com/postgres`,
    `postgres://postgres.${staging}:pass@attacker.com/postgres`,
    `postgres://postgres:pass@db.${staging}.supabase.co.attacker.com/postgres`,
    env.STAGING_SUPABASE_DB_URL.replace("5432", "6543"),
    env.STAGING_SUPABASE_DB_URL.replace("sensitive-password", production),
    env.STAGING_SUPABASE_DB_URL.replace("sensitive-password", "placeholder"),
    env.STAGING_SUPABASE_DB_URL.replace("sensitive-password", "%ZZ"),
    env.STAGING_SUPABASE_DB_URL.replace("sensitive-password", ""),
    `${env.STAGING_SUPABASE_DB_URL}?host=attacker.com`,
    `${env.STAGING_SUPABASE_DB_URL}#fragment`,
  ])("rejects unsafe URL fixture %#", (url) => {
    expect(() =>
      validateBackupEnvironment({ ...env, STAGING_SUPABASE_DB_URL: url }),
    ).toThrow("boundary validation failed");
  });
  it("never prints secret values on CLI success or failure", () => {
    // Exercise the real success path with a source-reviewed synthetic target in
    // an isolated checkout. The repository's unset registry must stay disarmed.
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-policy-"));
    directories.push(directory);
    mkdirSync(join(directory, "scripts"));
    mkdirSync(join(directory, "config"));
    for (const name of [
      "staging-logical-backup.mjs",
      "staging-logical-backup-data.mjs",
      "staging-backup-ledger.mjs",
      "staging-replacement-target.mjs",
    ])
      writeFileSync(
        join(directory, "scripts", name),
        readFileSync(join("scripts", name)),
      );
    const policy = JSON.parse(
      readFileSync("config/staging-replacement-target.json", "utf8"),
    );
    policy.productionOrigin = env.PRODUCTION_APPLICATION_ORIGIN;
    policy.archivedOrigins = ["https://archived-staging.example.com"];
    policy.replacement = {
      project: staging,
      origin: env.STAGING_APPLICATION_ORIGIN,
    };
    writeFileSync(
      join(directory, "config/staging-replacement-target.json"),
      JSON.stringify(policy),
    );
    for (const url of [
      env.STAGING_SUPABASE_DB_URL,
      `invalid-${env.STAGING_SUPABASE_DB_URL}`,
    ]) {
      const result = spawnSync(
        process.execPath,
        ["scripts/staging-logical-backup.mjs", "validate"],
        {
          cwd: directory,
          env: { ...process.env, ...env, STAGING_SUPABASE_DB_URL: url },
          encoding: "utf8",
        },
      );
      expect(result.status).toBe(url.startsWith("invalid") ? 1 : 0);
      const output = result.stdout + result.stderr;
      for (const secret of [
        url,
        staging,
        production,
        "sensitive-password",
        "pooler.supabase.com",
      ])
        expect(output).not.toContain(secret);
    }
  });
  it.each(["equal-env", "equal-source", "missing", "mismatch"])(
    "rejects production origin collision with a configured target: %s",
    (kind) => {
      const directory = mkdtempSync(join(tmpdir(), "staging-backup-policy-"));
      directories.push(directory);
      mkdirSync(join(directory, "scripts"));
      mkdirSync(join(directory, "config"));
      for (const name of [
        "staging-logical-backup.mjs",
        "staging-logical-backup-data.mjs",
        "staging-backup-ledger.mjs",
        "staging-replacement-target.mjs",
      ])
        writeFileSync(
          join(directory, "scripts", name),
          readFileSync(join("scripts", name)),
        );
      const policy = JSON.parse(
        readFileSync("config/staging-replacement-target.json", "utf8"),
      );
      policy.productionOrigin =
        kind === "equal-source"
          ? env.STAGING_APPLICATION_ORIGIN
          : env.PRODUCTION_APPLICATION_ORIGIN;
      policy.archivedOrigins = ["https://archived-staging.example.com"];
      policy.replacement = {
        project: staging,
        origin: env.STAGING_APPLICATION_ORIGIN,
      };
      writeFileSync(
        join(directory, "config/staging-replacement-target.json"),
        JSON.stringify(policy),
      );
      const productionOrigin =
        kind === "equal-env"
          ? env.STAGING_APPLICATION_ORIGIN
          : kind === "missing"
            ? ""
            : kind === "mismatch"
              ? "https://other-production.example.com"
              : env.PRODUCTION_APPLICATION_ORIGIN;
      const result = spawnSync(
        process.execPath,
        ["scripts/staging-logical-backup.mjs", "validate"],
        {
          cwd: directory,
          env: {
            ...process.env,
            ...env,
            PRODUCTION_APPLICATION_ORIGIN: productionOrigin,
          },
          encoding: "utf8",
        },
      );
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(
        env.STAGING_APPLICATION_ORIGIN,
      );
    },
  );
  it("hashes exact file and JSON bytes and emits only safe metadata", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const summary = join(directory, "summary.txt");
    ledgerFixture(directory);
    for (const filename of ["roles.sql", "schema.sql", "data.sql"])
      writeFileSync(
        join(directory, filename),
        filename === "data.sql"
          ? retainedData
          : `private fixture ${filename}\r\n`,
      );
    const evidence = writeBackupEvidence(
      { ...env, GITHUB_STEP_SUMMARY: summary },
      directory,
    );
    expect(Object.keys(evidence)).toEqual([
      "schemaVersion",
      "environment",
      "commitSha",
      "githubRunId",
      "evidenceLabel",
      "createdAt",
      "projectRefSha256",
      "files",
      "migrationLedgerIncluded",
      "migrationLedgerSha256",
      "ledgerVersions",
      "ledgerRowsSha256",
      "portableRestoreData",
      "managedCompatibilityExclusions",
      "authUsersIncluded",
      "publicCopyTargetCount",
      "copyTargetCount",
      "applicationSchemasExcluded",
      "storageObjectsIncluded",
      "remoteMutationPerformed",
    ]);
    expect(evidence).toMatchObject({
      schemaVersion: 3,
      environment: "staging",
      commitSha: env.GITHUB_SHA,
      githubRunId: env.GITHUB_RUN_ID,
      projectRefSha256: sha256(staging),
      portableRestoreData: true,
      managedCompatibilityExclusions: expectedExclusions,
      authUsersIncluded: true,
      publicCopyTargetCount: 1,
      copyTargetCount: 2,
      applicationSchemasExcluded: false,
      storageObjectsIncluded: false,
      remoteMutationPerformed: false,
    });
    for (const file of evidence.files) {
      const bytes = readFileSync(join(directory, file.filename));
      expect(file).toEqual({
        filename: file.filename,
        sha256: sha256(bytes),
        byteLength: bytes.length,
      });
    }
    expect(readFileSync(join(directory, "SHA256SUMS.txt"), "utf8")).toBe(
      evidence.files.map((f) => `${f.sha256}  ${f.filename}\n`).join(""),
    );
    const json = readFileSync(join(directory, "backup-evidence.json"));
    expect(
      readFileSync(join(directory, "backup-evidence.sha256"), "utf8"),
    ).toBe(`${sha256(json)}\n`);
    for (const secret of [
      staging,
      production,
      env.STAGING_SUPABASE_DB_URL,
      "sensitive-password",
      "private fixture",
    ]) {
      expect(json.toString()).not.toContain(secret);
      expect(readFileSync(summary, "utf8")).not.toContain(secret);
    }
    writeFileSync(join(directory, "data.sql"), "");
    expect(() => writeBackupEvidence(env, directory)).toThrow("empty");
  });
});

describe("managed compatibility boundary", () => {
  it("uses exactly the reviewed relations in the native CLI argument", () => {
    expect(MANAGED_COMPATIBILITY_EXCLUSIONS).toEqual(expectedExclusions);
    expect(Object.isFrozen(MANAGED_COMPATIBILITY_EXCLUSIONS)).toBe(true);
    expect(managedExclusionArgument()).toBe(expectedExclusions.join(","));
    const result = spawnSync(
      process.execPath,
      ["scripts/staging-logical-backup.mjs", "exclusions"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${expectedExclusions.join(",")}\n`);
    expect(result.stderr).toBe("");
  });

  it.each([
    ["public.billing_subscriptions"],
    ["tenant.invoices"],
    ["auth.users"],
    ["auth.identities"],
    ["storage.objects"],
    ["auth.*"],
    ["auth.scim_users; DROP TABLE public.accounts"],
    ['"auth"."scim_users"'],
    ["auth.scim_users "],
    ["AUTH.scim_users"],
    ["auth..scim_users"],
    ["auth.scim_users", "auth.scim_users"],
  ])("rejects unsafe exclusions %#", (...exclusions) => {
    expect(() => validateManagedExclusions(exclusions)).toThrow(
      "Portable backup data validation failed.",
    );
    expect(() =>
      filterManagedCopyBlocks(Buffer.from(rawData), exclusions),
    ).toThrow();
  });

  it.each(expectedExclusions)(
    "removes a complete %s block, retaining auth.users and application bytes",
    (relation) => {
      const input = Buffer.from(retainedData + copy(relation, "managed\n"));
      const original = Buffer.from(input);
      expect(filterManagedCopyBlocks(input, [relation])).toEqual(
        Buffer.from(retainedData),
      );
      expect(input).toEqual(original);
    },
  );

  it("removes multiple managed blocks without changing retained bytes or the 108 application targets", () => {
    const header =
      "-- private fixture\r\nSET session_replication_role = replica;\r\n";
    const users = copy('"auth"."users"', "é\\tvalue\t\\N\r\n", "\r\n");
    const application = Array.from({ length: 108 }, (_, i) =>
      copy(`"public"."table_${i}"`, `${i}\t東京\t\\\\\n`),
    );
    const custom = copy('"tenant"."invoices"') + copy('"auth"."identities"');
    const footer =
      "SELECT pg_catalog.setval('public.seq', 108, true);\nRESET ALL;\n";
    const retained = header + users + application.join("") + custom + footer;
    const input = Buffer.from(
      header +
        expectedExclusions
          .map((r) => copy(r, "sensitive managed row\r\n", "\r\n"))
          .join("") +
        users +
        application.join("") +
        custom +
        footer,
    );
    const result = filterManagedCopyBlocks(input);
    expect(result).toEqual(Buffer.from(retained));
    expect(
      inspectCopyData(input).filter((b) => b.schema === "public"),
    ).toHaveLength(108);
    expect(validatePortableData(result)).toMatchObject({
      authUsersIncluded: true,
      publicCopyTargetCount: 108,
      copyTargetCount: 111,
      managedCompatibilityExclusions: expectedExclusions,
    });
  });

  it("defines empty and no-match behavior separately for native validation and offline filtering", () => {
    expect(validateManagedExclusions([])).toEqual([]);
    expect(filterManagedCopyBlocks(Buffer.from(rawData), [])).toEqual(
      Buffer.from(rawData),
    );
    expect(() => filterManagedCopyBlocks(Buffer.from(retainedData))).toThrow();
    expect(() =>
      filterManagedCopyBlocks(
        Buffer.from(retainedData + copy(expectedExclusions[0])),
      ),
    ).toThrow();
    // Missing managed tables are expected in native output, even on older platforms.
    expect(
      validatePortableData(Buffer.from(retainedData))
        .managedCompatibilityExclusions,
    ).toEqual(expectedExclusions);
    expect(() => validatePortableData(Buffer.from(rawData))).toThrow();
  });

  it.each([
    "",
    retainedData + "COPY auth.scim_users (id) FROM stdin;\nunterminated\n",
    retainedData +
      "COPY auth.scim_users (id) FROM stdin;\n" +
      copy("public.swallowed"),
    retainedData + "COPY auth.scim_users FROM stdin;\n\\.\n",
    retainedData + "COPY auth.scim_users (id) FROM '/tmp/data';\n",
    retainedData + "COPY auth.scim_users (id)\nFROM stdin;\n\\.\n",
    retainedData + "\\.\n",
    retainedData + copy('"public"."billing_subscriptions"'),
    retainedData + "INSERT INTO public.accounts VALUES (1);\n",
    retainedData + copy("auth.scim_users") + copy('"auth"."scim_users"'),
    copy("public.accounts"),
    copy("auth.users"),
  ])("fails closed on malformed or incomplete recovery data %#", (sql) => {
    expect(() => validatePortableData(Buffer.from(sql))).toThrow(
      "Portable backup data validation failed.",
    );
    expect(() => filterManagedCopyBlocks(Buffer.from(sql), [])).toThrow(
      "Portable backup data validation failed.",
    );
  });

  it("recognizes quoted identifiers without treating dots or COPY text in rows as targets", () => {
    const sql =
      retainedData + copy('"tenant.schema"."a""b"', "ordinary COPY text\n");
    expect(inspectCopyData(Buffer.from(sql)).at(-1)).toMatchObject({
      schema: "tenant.schema",
      table: 'a"b',
    });
  });

  it("does not generate evidence for an unfiltered managed block", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    ledgerFixture(directory);
    for (const filename of ["roles.sql", "schema.sql", "data.sql"])
      writeFileSync(
        join(directory, filename),
        filename === "data.sql" ? rawData : "-- fixture\n",
      );
    expect(() => writeBackupEvidence(env, directory)).toThrow();
    for (const filename of [
      "SHA256SUMS.txt",
      "backup-evidence.json",
      "backup-evidence.sha256",
    ])
      expect(existsSync(join(directory, filename))).toBe(false);
  });

  it("creates an offline derivative exclusively, preserving the immutable source and suppressing rows", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const source = join(directory, "original.sql"),
      destination = join(directory, "portable.sql");
    writeFileSync(source, rawData);
    const run = (target: string) =>
      spawnSync(
        process.execPath,
        ["scripts/staging-logical-backup.mjs", "portable-copy", source, target],
        { encoding: "utf8" },
      );
    const success = run(destination);
    expect(success.status).toBe(0);
    expect(success.stdout + success.stderr).toBe("");
    expect(readFileSync(destination)).toEqual(Buffer.from(retainedData));
    for (const target of [source, destination]) {
      const failure = run(target);
      expect(failure.status).toBe(1);
      expect(failure.stdout + failure.stderr).not.toMatch(
        /private fixture|managed|original.sql|portable.sql/,
      );
    }
    expect(readFileSync(source)).toEqual(Buffer.from(rawData));
    expect(readFileSync(destination)).toEqual(Buffer.from(retainedData));
    writeFileSync(source, retainedData);
    const missing = join(directory, "missing.sql");
    expect(run(missing).status).toBe(1);
    expect(existsSync(missing)).toBe(false);
  });
});

describe("staging backup workflow contract", () => {
  it("enforces the protected manual read-only dump and artifact contract", () => {
    const source = readFileSync(
      ".github/workflows/supabase-manual-backup.yml",
      "utf8",
    );
    const workflow = createRequire(import.meta.url)("js-yaml").load(source);
    expect(workflow.name).toBe("Supabase Staging Logical Backup");
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.on.workflow_dispatch.inputs).toEqual({
      confirm_project_ref: { required: true, type: "string" },
      evidence_label: {
        required: true,
        type: "string",
        default: "pre-commercial-apply",
      },
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(Object.keys(workflow.jobs)).toEqual(["logical-backup"]);
    const job = workflow.jobs["logical-backup"];
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(job.environment).toBe("supabase-staging");
    expect(job["timeout-minutes"]).toBe(30);
    expect(job.permissions).toBeUndefined();
    expect(job.env).toMatchObject({
      STAGING_SUPABASE_DB_URL: "${{ secrets.STAGING_SUPABASE_DB_URL }}",
      PRODUCTION_APPLICATION_ORIGIN:
        "${{ vars.PRODUCTION_APPLICATION_ORIGIN }}",
      STAGING_SUPABASE_PROJECT_REF: "${{ vars.STAGING_SUPABASE_PROJECT_REF }}",
      PRODUCTION_SUPABASE_PROJECT_REF:
        "${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}",
      CONFIRM_PROJECT_REF: "${{ inputs.confirm_project_ref }}",
    });
    expect(source).not.toMatch(
      /\bSUPABASE_DB_URL\b|\bwrite\b|supabase\s+(?:link|db\s+(?:push|reset)|functions\s+deploy)/,
    );
    const runs = job.steps.filter((step) => step.run).map((step) => step.run);
    expect(runs[0]).toBe("node scripts/staging-logical-backup.mjs validate");
    expect(runs[2]).toBe("node scripts/staging-logical-backup.mjs evidence");
    expect(runs[1]).toContain("set +x");
    expect(runs[1].indexOf("ledger-before")).toBeLessThan(
      runs[1].indexOf("supabase db dump"),
    );
    expect(runs[1].indexOf("ledger-after")).toBeGreaterThan(
      runs[1].lastIndexOf("supabase db dump"),
    );
    expect(runs[1]).toContain(
      'exclusions="$(node scripts/staging-logical-backup.mjs exclusions)"',
    );
    const dumps = runs[1]
      .split("\n")
      .filter((line) => line.startsWith("supabase "));
    expect(dumps).toEqual([
      'supabase db dump --db-url "$STAGING_SUPABASE_DB_URL" -f backup/roles.sql --role-only > /dev/null 2>&1',
      'supabase db dump --db-url "$STAGING_SUPABASE_DB_URL" -f backup/schema.sql > /dev/null 2>&1',
      'supabase db dump --db-url "$STAGING_SUPABASE_DB_URL" -f backup/data.sql --use-copy --data-only --exclude "$exclusions" > /dev/null 2>&1',
    ]);
    expect(source).not.toMatch(/(?:echo|printf).*\$STAGING_SUPABASE_DB_URL/);
    expect(
      job.steps.find((step) => step.uses?.startsWith("supabase/setup-cli")).with
        .version,
    ).toBe("v2.109.1");
    const artifact = job.steps.at(-1);
    expect(artifact.uses).toBe("actions/upload-artifact@v4");
    expect(artifact.with).toEqual({
      name: "supabase-staging-logical-backup-${{ github.run_id }}-${{ inputs.evidence_label }}",
      path: "backup/",
      "if-no-files-found": "error",
      "retention-days": 7,
    });
    expect(artifact.if).toBeUndefined();
  });
});

it.each([
  undefined,
  "https://replacement-staging.example.com/path",
  "http://replacement-staging.example.com",
])("requires a canonical backup origin %s", (origin) => {
  expect(() =>
    validateBackupEnvironment({ ...env, STAGING_APPLICATION_ORIGIN: origin }),
  ).toThrow("Staging backup boundary validation failed.");
});
