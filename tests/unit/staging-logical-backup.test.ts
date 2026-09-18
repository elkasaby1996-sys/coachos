import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdtempSync,
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
} from "../../scripts/staging-logical-backup.mjs";
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
  PRODUCTION_SUPABASE_PROJECT_REF: production,
  CONFIRM_PROJECT_REF: staging,
  STAGING_SUPABASE_DB_URL: `postgresql://postgres.${staging}:sensitive-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
  EVIDENCE_LABEL: "pre-commercial-apply",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_RUN_ID: "12345",
};
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("staging backup offline validation", () => {
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
    for (const url of [
      env.STAGING_SUPABASE_DB_URL,
      `invalid-${env.STAGING_SUPABASE_DB_URL}`,
    ]) {
      const result = spawnSync(
        process.execPath,
        ["scripts/staging-logical-backup.mjs", "validate"],
        {
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
  it("hashes exact file and JSON bytes and emits only safe metadata", () => {
    const directory = mkdtempSync(join(tmpdir(), "staging-backup-"));
    directories.push(directory);
    const summary = join(directory, "summary.txt");
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
      schemaVersion: 2,
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
