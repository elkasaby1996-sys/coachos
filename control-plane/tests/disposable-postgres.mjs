// Test tooling only. No URLs, .env files, credentials, ports or image pulls.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TEST_IMAGE =
  "postgres@sha256:7e32e9833a6fb1c92c32552794cb6ed569d51b445a54907d35fc112ef39684db";
export function rejectDatabaseUrl(input) {
  // No caller-selected database is supported, even a localhost developer DB.
  if (input !== undefined)
    throw new Error("LEDGER_TEST_DATABASE_SELECTION_DENIED");
}
export class DisposablePostgres {
  constructor(options = {}) {
    if (Object.keys(options).length)
      throw new Error("LEDGER_TEST_DATABASE_SELECTION_DENIED");
    const token = randomUUID().replaceAll("-", "");
    this.name = `bill04c-${token}`;
    this.database = `bill04c_${token}`;
    this.owner = token;
    this.config = mkdtempSync(join(tmpdir(), "bill04c-docker-"));
    writeFileSync(join(this.config, "config.json"), "{}", { mode: 0o600 });
    this.created = false;
  }
  docker(args, input) {
    const r = spawnSync("docker", ["--config", this.config, ...args], {
      input,
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    });
    if (r.error || r.status !== 0)
      throw new Error(
        `LEDGER_TEST_DOCKER_FAILED: ${r.stderr?.slice(0, 400) ?? "process unavailable"}`,
      );
    return r.stdout.trim();
  }
  assertOwned() {
    this.requireOwned();
    const record = JSON.parse(this.docker(["inspect", this.id]))[0];
    if (
      record.Id !== this.id ||
      record.Config.Labels?.["repsync.bill04c.owner"] !== this.owner ||
      record.HostConfig.NetworkMode !== "none" ||
      Object.keys(record.HostConfig.PortBindings ?? {}).length ||
      record.Mounts.some((m) => m.Type === "bind")
    )
      throw new Error("LEDGER_TEST_NOT_ISOLATED");
  }
  requireOwned() {
    if (!this.created || !/^[a-f0-9]{64}$/.test(this.id ?? ""))
      throw new Error("LEDGER_TEST_NOT_OWNED");
  }
  async start() {
    // --pull=never and immutable cached image: no registry/network request.
    this.id = this.docker([
      "run",
      "--detach",
      "--rm",
      "--pull=never",
      "--network=none",
      "--name",
      this.name,
      "--label",
      `repsync.bill04c.owner=${this.owner}`,
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env",
      `POSTGRES_DB=${this.database}`,
      TEST_IMAGE,
    ]);
    this.created = true;
    this.assertOwned();
    const until = Date.now() + 20_000;
    while (true) {
      try {
        // The image briefly starts a temporary init server. Require the final
        // PID-1 postmaster, rather than accepting temporary pg_isready success.
        if (
          this.docker(["exec", this.id, "cat", "/proc/1/comm"]) !== "postgres"
        )
          throw new Error("LEDGER_TEST_INITIALIZING");
        this.docker([
          "exec",
          this.id,
          "pg_isready",
          "-U",
          "postgres",
          "-d",
          this.database,
        ]);
        break;
      } catch {
        if (Date.now() >= until)
          throw new Error("LEDGER_TEST_POSTGRES_UNAVAILABLE");
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    this.admin(
      readFileSync(
        new URL("../migrations/001_replay_ledger.sql", import.meta.url),
        "utf8",
      ),
    );
    this.admin(
      "CREATE ROLE bill04c_test_client LOGIN; GRANT bill04c_runtime TO bill04c_test_client;",
    );
    return this;
  }
  admin(sql) {
    this.requireOwned();
    return this.docker(
      [
        "exec",
        "-i",
        this.id,
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        this.database,
      ],
      sql,
    );
  }
  async sql(sql, role = "bill04c_test_client") {
    this.requireOwned();
    return new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "--config",
          this.config,
          "exec",
          "-i",
          this.id,
          "psql",
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-qAt",
          "-U",
          role,
          "-d",
          this.database,
        ],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      );
      let out = "",
        err = "";
      const timer = setTimeout(() => child.kill(), 10_000);
      child.stdout.on("data", (b) => {
        out += b;
      });
      child.stderr.on("data", (b) => {
        err += b;
      });
      child.on("error", () => {
        clearTimeout(timer);
        reject(new Error("LEDGER_TEST_CONNECTION_FAILED"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const fixed = err.match(/(?:ERROR:\s+)(LEDGER_[A-Z_]+)/)?.[1];
          reject(new Error(fixed ?? "LEDGER_DATABASE_REJECTED"));
        } else resolve(out.trim());
      });
      child.stdin.end(sql);
    });
  }
  // pg-compatible injected adapter; every call opens an independent PostgreSQL
  // session/process. The production repository never imports this adapter.
  query = async (statement, values) => {
    if (values.length > 1 || values.some((v) => typeof v !== "string"))
      throw new Error("LEDGER_TEST_PARAMETER_INVALID");
    const parameter = values.length
      ? `convert_from(decode('${Buffer.from(values[0]).toString("hex")}','hex'),'UTF8')`
      : "";
    const output = await this.sql(statement.replace(/\$1\b/g, parameter));
    return { rows: [{ result: output ? JSON.parse(output) : null }] };
  };
  snapshot() {
    this.requireOwned();
    return this.docker([
      "exec",
      this.id,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      this.database,
      "--no-owner",
      "--no-privileges",
      "--data-only",
    ]);
  }
  resetData() {
    this.admin(
      "TRUNCATE ledger_private.audit_events, ledger_private.command_reservations, ledger_private.transition_permits, ledger_private.target_ownership, ledger_private.operation_states, ledger_private.consumptions, ledger_private.admission_permits, ledger_private.epochs CASCADE; UPDATE ledger_private.control SET disposition='DISARMED',epoch=NULL,policy_digest=NULL,authoritative_head=NULL,activated_at=NULL,test_now=NULL;",
    );
  }
  restore(snapshot) {
    this.resetData();
    this.admin("TRUNCATE ledger_private.control;");
    // A restoration must disarm before the instance is exposed to consumers.
    this.admin(snapshot + "\nSELECT ledger_api.disarm();");
  }
  close() {
    if (this.created) {
      this.assertOwned();
      this.docker(["rm", "--force", "--volumes", this.id]);
      this.created = false;
    }
    // Only the uniquely created temporary config directory; no credentials.
    rmSync(this.config, { recursive: true });
  }
}
