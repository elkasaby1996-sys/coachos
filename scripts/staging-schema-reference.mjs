// Reconstruct canonical schemas on a new disposable LOCAL database. No hosted
// credentials, links, resets, or Supabase Management API requests are used.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
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
import { releaseIdentity } from "./staging-release-artifacts.mjs";
import { INVENTORY_QUERY } from "./billing-retirement-remote-inventory.mjs";
import { hash } from "./billing-retirement-release.mjs";
import { verifySchemaReference } from "./staging-schema-diagnostics.mjs";

export function localReferenceEnvironment(env) {
  return {
    ...Object.fromEntries(
      [
        "PATH",
        "HOME",
        "TMPDIR",
        "TEMP",
        "TMP",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "no_proxy",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "NODE_EXTRA_CA_CERTS",
      ]
        .filter((name) => typeof env[name] === "string")
        .map((name) => [name, env[name]]),
    ),
    CI: "true",
    NO_COLOR: "1",
    SUPABASE_TELEMETRY_DISABLED: "1",
    // Force the local Docker socket, ignoring inherited remote Docker contexts.
    DOCKER_HOST: "unix:///var/run/docker.sock",
  };
}

async function localPorts() {
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

export async function buildSchemaReference(output, root = process.cwd()) {
  const identity = releaseIdentity(root);
  const checkpoints = JSON.parse(
    readFileSync(join(root, "config/staging-release-checkpoints.json"), "utf8"),
  );
  const env = localReferenceEnvironment(process.env);
  let stage = "cli_version";
  const run = (command, args, input) => {
    try {
      return execFileSync(command, args, {
        cwd: root,
        env,
        input,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10 * 60_000,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (cause) {
      const error = new Error("SCHEMA_REFERENCE_COMMAND_FAILED");
      error.stage = stage;
      if (Number.isInteger(cause.status)) error.exitStatus = cause.status;
      throw error;
    }
  };
  if (run("supabase", ["--version"]).trim() !== "2.109.1")
    throw new Error("SCHEMA_REFERENCE_PINNED_CLI_REQUIRED");
  const directory = mkdtempSync(join(tmpdir(), "repsync-schema-reference-"));
  const project = `repsync_schema_${randomBytes(8).toString("hex")}`;
  const migrations = join(directory, "supabase/migrations");
  let started = false;
  try {
    const [api, db, shadow, studio, inbucket, analytics] = await localPorts();
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
    const copyMigration = (index) => {
      const migration = identity.manifest.migrations.approved[index];
      const bytes = readFileSync(
        join(root, "supabase/migrations", migration.filename),
        "utf8",
      ).replace(/\r\n/g, "\n");
      if (hash(bytes) !== migration.sha256)
        throw new Error("SCHEMA_REFERENCE_SOURCE_DRIFT");
      writeFileSync(join(migrations, migration.filename), bytes);
    };
    for (let i = 0; i < 180; i++) copyMigration(i);
    stage = "local_database_start";
    console.log("Reconstructing source migrations on isolated local Postgres");
    started = true;
    run("supabase", ["db", "start", "--workdir", directory, "--yes"]);
    const reference = {
      schemaVersion: 1,
      frozenPayloadCommit: identity.payload.frozenCommit,
      manifestDigest: hash(JSON.stringify(identity.manifest)),
      checkpoints: {},
    };
    for (let count = 180; count <= 188; count++) {
      stage = `checkpoint_${count}`;
      const facts = JSON.parse(
        run(
          "docker",
          [
            "exec",
            "-i",
            `supabase_db_${project}`,
            "psql",
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
          ],
          `begin read only; set local search_path to public, extensions; ${INVENTORY_QUERY} rollback;`,
        ),
      );
      reference.checkpoints[String(count)] = Object.fromEntries(
        ["versions", "functions", "tables", "schema"].map((key) => [
          key,
          facts[key],
        ]),
      );
      verifySchemaReference(reference, identity, checkpoints, count);
      console.log(`Verified local source schema at migration ${count}/188`);
      if (count < 188) {
        copyMigration(count);
        run("supabase", [
          "migration",
          "up",
          "--local",
          "--workdir",
          directory,
          "--yes",
        ]);
      }
    }
    mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(output, JSON.stringify(reference), { mode: 0o600 });
  } finally {
    try {
      if (started) {
        stage = "local_database_cleanup";
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

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!process.argv[2]) throw new Error("SCHEMA_REFERENCE_OUTPUT_REQUIRED");
    await buildSchemaReference(process.argv[2]);
  } catch (error) {
    // Command output may contain SQL; keep CI output bounded and sanitized.
    const code = [
      "SCHEMA_REFERENCE_COMMAND_FAILED",
      "SCHEMA_REFERENCE_PINNED_CLI_REQUIRED",
      "SCHEMA_REFERENCE_OUTPUT_REQUIRED",
      "SCHEMA_REFERENCE_SOURCE_DRIFT",
      "UPGRADE_SCHEMA_REFERENCE_INVALID",
    ].includes(error.message)
      ? error.message
      : "SCHEMA_REFERENCE_RECONSTRUCTION_FAILED";
    console.error(
      `::error title=Local schema reference::code=${code}; stage=${error.stage ?? "source_validation"}${error.exitStatus === undefined ? "" : `; exitStatus=${error.exitStatus}`}`,
    );
    process.exitCode = 1;
  }
}
