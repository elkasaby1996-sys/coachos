import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  sha256,
  validateBackupEnvironment,
  writeBackupEvidence,
} from "../../scripts/staging-logical-backup.mjs";

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
        `private fixture ${filename}\r\n`,
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
      "storageObjectsIncluded",
      "remoteMutationPerformed",
    ]);
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      environment: "staging",
      commitSha: env.GITHUB_SHA,
      githubRunId: env.GITHUB_RUN_ID,
      projectRefSha256: sha256(staging),
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
    const dumps = runs[1]
      .split("\n")
      .filter((line) => line.startsWith("supabase "));
    expect(dumps).toEqual([
      'supabase db dump --db-url "$STAGING_SUPABASE_DB_URL" -f backup/roles.sql --role-only > /dev/null 2>&1',
      'supabase db dump --db-url "$STAGING_SUPABASE_DB_URL" -f backup/schema.sql > /dev/null 2>&1',
      'supabase db dump --db-url "$STAGING_SUPABASE_DB_URL" -f backup/data.sql --use-copy --data-only > /dev/null 2>&1',
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
