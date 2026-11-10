// Run the upgrade's database checks in a unique disposable LOCAL project.
// Existing stacks, the tracked configuration and hosted projects are untouched.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "./billing-retirement-release.mjs";
import { releaseIdentity } from "./staging-release-artifacts.mjs";
import { localReferenceEnvironment } from "./staging-schema-reference.mjs";

async function availablePorts() {
  const servers = [];
  try {
    // Hold all six reservations together so the selected ports are distinct.
    // Probe Docker's IPv4 bind address, including ports occupied by other stacks.
    for (let i = 0; i < 6; i++) {
      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "0.0.0.0", resolve);
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

async function main() {
  if (!process.argv[2]) throw new Error("UPGRADE_LOCAL_CHECKS_OUTPUT_REQUIRED");
  const output = resolve(process.argv[2]);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const identity = releaseIdentity(root);
  const env = localReferenceEnvironment(process.env);
  const run = (stage, command, args, capture = false) => {
    console.log(`Local upgrade checks: ${stage}`);
    try {
      return execFileSync(command, args, {
        cwd: root,
        env,
        encoding: "utf8",
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
        timeout: 10 * 60_000,
      });
    } catch (cause) {
      // These jobs use only repository SQL and synthetic fixtures. Stream their
      // diagnostics above, and retain a bounded stage annotation on failure.
      console.error(
        `::error title=Local upgrade checks::stage=${stage}; code=UPGRADE_LOCAL_CHECKS_COMMAND_FAILED${Number.isInteger(cause.status) ? `; exitStatus=${cause.status}` : ""}`,
      );
      throw new Error("UPGRADE_LOCAL_CHECKS_COMMAND_FAILED");
    }
  };
  if (run("cli_version", "supabase", ["--version"], true).trim() !== "2.109.1")
    throw new Error("UPGRADE_LOCAL_CHECKS_PINNED_CLI_REQUIRED");

  const directory = mkdtempSync(join(tmpdir(), "repsync-upgrade-ci-"));
  const project = `repsync_upgrade_ci_${randomBytes(8).toString("hex")}`;
  let started = false;
  try {
    const [api, db, shadow, studio, inbucket, analytics] =
      await availablePorts();
    const migrations = join(directory, "supabase/migrations");
    mkdirSync(migrations, { recursive: true });
    writeFileSync(
      join(directory, "supabase/config.toml"),
      `project_id = "${project}"
[api]
port = ${api}
[db]
port = ${db}
shadow_port = ${shadow}
major_version = 17
[db.migrations]
enabled = true
[db.seed]
enabled = false
[studio]
port = ${studio}
[inbucket]
port = ${inbucket}
[analytics]
port = ${analytics}
`,
    );
    for (const migration of identity.manifest.migrations.approved) {
      const bytes = readFileSync(
        join(root, "supabase/migrations", migration.filename),
        "utf8",
      ).replace(/\r\n/g, "\n");
      if (hash(bytes) !== migration.sha256)
        throw new Error("UPGRADE_LOCAL_CHECKS_SOURCE_DRIFT");
      writeFileSync(join(migrations, migration.filename), bytes);
    }
    cpSync(join(root, "supabase/tests"), join(directory, "supabase/tests"), {
      recursive: true,
    });
    console.log(`Isolated local project: ${project}; database port: ${db}`);
    started = true;
    run("database_start", "supabase", [
      "db",
      "start",
      "--workdir",
      directory,
      "--yes",
    ]);
    run("database_lint", "supabase", [
      "db",
      "lint",
      "--local",
      "--workdir",
      directory,
      "--level",
      "error",
      "--fail-on",
      "error",
    ]);
    run("database_tests", "supabase", [
      "test",
      "db",
      "--local",
      "--workdir",
      directory,
    ]);
    run("source_checkpoints", process.execPath, [
      join(root, "scripts/staging-schema-reference.mjs"),
      output,
    ]);
    run("populated_recovery", process.execPath, [
      join(root, "scripts/staging-upgrade-recovery-test.mjs"),
      output,
      `supabase_db_${project}`,
    ]);
  } finally {
    try {
      // Never stop another project, even if startup failed partway through.
      if (started)
        run("database_cleanup", "supabase", [
          "stop",
          "--workdir",
          directory,
          "--no-backup",
          "--yes",
        ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  console.log("Isolated local upgrade checks passed; test database removed.");
}

try {
  await main();
} catch (error) {
  const code = [
    "UPGRADE_LOCAL_CHECKS_COMMAND_FAILED",
    "UPGRADE_LOCAL_CHECKS_PINNED_CLI_REQUIRED",
    "UPGRADE_LOCAL_CHECKS_OUTPUT_REQUIRED",
    "UPGRADE_LOCAL_CHECKS_SOURCE_DRIFT",
  ].includes(error.message)
    ? error.message
    : "UPGRADE_LOCAL_CHECKS_FAILED";
  console.error(`::error title=Local upgrade checks::code=${code}`);
  process.exitCode = 1;
}
