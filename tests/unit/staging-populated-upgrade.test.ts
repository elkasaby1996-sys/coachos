import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  runPopulatedUpgrade,
  UPGRADE_SCOPE,
  SEQUENCE_QUERY,
  LEDGER_ROWS_QUERY,
} from "../../scripts/staging-populated-upgrade.mjs";
import {
  encryptUpgradeBackup,
  decryptUpgradeBackup,
  backupRowsQuery,
  restoreRowsSql,
  MANAGED_COLUMNS_QUERY,
  validateManagedColumns,
  validateManagedRows,
  managedRestoreSql,
} from "../../scripts/staging-upgrade-backup.mjs";
import {
  verifyUpgradeSchema,
  PRESERVED_GRANT_TABLES,
} from "../../scripts/staging-upgrade-schema.mjs";
import {
  releaseIdentity,
  disposableArtifact,
} from "../../scripts/staging-release-artifacts.mjs";
import {
  databaseContract,
  historyQuery,
  workQuery,
} from "../../scripts/staging-release-observation.mjs";
import {
  INVENTORY_QUERY,
  LS_ROOT_KEYS,
} from "../../scripts/billing-retirement-remote-inventory.mjs";
import { WORK_DETAIL_QUERY } from "../../scripts/staging-upgrade-readiness.mjs";
import { STATUS_QUERIES } from "../../scripts/staging-billing-status.mjs";
import { CONFIGURATION_CLASSES } from "../../scripts/billing-deployment-contract.mjs";
import { hash } from "../../scripts/billing-retirement-release.mjs";

const secret = "private-backup-data-do-not-print";
const emptyDigest = "d751713988987e9331980363e24189ce";
const managedColumn = (name: string, type: string) => ({
  name,
  type,
  typeSchema: "pg_catalog",
  generated: false,
});
const managedColumns = () => ({
  "auth.users": [managedColumn("id", "uuid")],
  "supabase_migrations.schema_migrations": [
    managedColumn("version", "text"),
    managedColumn("statements", "text[]"),
    managedColumn("name", "text"),
  ],
});
let identity: any;
beforeAll(() => {
  identity = releaseIdentity();
}, 30_000);

function fixture(start = 180) {
  const reference: any = {
    schemaVersion: 1,
    frozenPayloadCommit: identity.payload.frozenCommit,
    manifestDigest: hash(JSON.stringify(identity.manifest)),
    checkpoints: {},
  };
  const checkpoints: any = {
    frozenPayloadCommit: reference.frozenPayloadCommit,
    manifestDigest: reference.manifestDigest,
    checkpoints: {},
  };
  for (let count = 180; count <= 188; count++) {
    const facts = {
      versions: identity.manifest.migrations.approved
        .slice(0, count)
        .map((m: any) => m.filename.slice(0, 14)),
      policy: { sales: false, reconciliation: false },
      functions: [
        {
          signature: "example()",
          definition: `${secret}-${count}`,
          acl: null,
          applicationExecutable: false,
          publicExecutable: false,
        },
      ],
      tables: [
        ...PRESERVED_GRANT_TABLES,
        "billing_accounts",
        ...(count >= 183 ? ["billing_payment_method_preparations_v2"] : []),
      ]
        .sort()
        .map((name) => ({
          name,
          acl: "{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
          rls: true,
        })),
      schema: {
        columns: [
          {
            table: "clients",
            column: "id",
            type: "uuid",
            default: "uuid_generate_v4()",
            notNull: true,
          },
        ],
        constraints: [],
        indexes: [],
        triggers: [],
        policies: [],
      },
      lsRoots: Object.fromEntries(LS_ROOT_KEYS.map((key) => [key, 0])),
    };
    reference.checkpoints[String(count)] = facts;
    checkpoints.checkpoints[String(count)] = {
      digest: databaseContract(facts),
    };
  }
  const env: any = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REPOSITORY: UPGRADE_SCOPE.repository,
    GITHUB_REF: "refs/heads/Ahmed-billing",
    GITHUB_WORKFLOW: UPGRADE_SCOPE.workflow,
    GITHUB_WORKFLOW_REF: `${UPGRADE_SCOPE.repository}/${UPGRADE_SCOPE.workflowPath}@refs/heads/Ahmed-billing`,
    STAGING_UPGRADE_ENVIRONMENT: "supabase-staging",
    STAGING_SUPABASE_PROJECT_REF: UPGRADE_SCOPE.project,
    STAGING_APPLICATION_ORIGIN: UPGRADE_SCOPE.origin,
    GITHUB_SHA: "a".repeat(40),
    GITHUB_RUN_ID: "100",
    GITHUB_RUN_ATTEMPT: "1",
    SUPABASE_ACCESS_TOKEN: secret,
    SUPABASE_DB_PASSWORD: secret,
    ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
    SUPABASE_PROJECT_REF: UPGRADE_SCOPE.project,
    STAGING_BACKUP_ARTIFACT_ID: "101",
    STAGING_BACKUP_ARTIFACT_DIGEST: "a".repeat(64),
    PGHOST: "unwanted",
    SUPABASE_API_URL: "unwanted",
  };
  const state: any = {
    count: start,
    data: {},
    backup: null,
    commands: [],
    stages: [],
    failMigration: false,
    failFunction: null,
    historyChange: false,
    ledgerChange: false,
    managedColumns: managedColumns(),
    functions: identity.functions
      .filter(
        (f: any) =>
          ![
            "billing-create-paddle-portal",
            "billing-update-payment-method",
          ].includes(f.name),
      )
      .map((f: any) => ({
        name: f.name,
        id: f.name,
        version: 1,
        verify_jwt: f.verifyJwt,
        status: "ACTIVE",
      })),
    work: {
      legacyCheckouts: 0,
      paddleCheckouts: 0,
      legacyPlans: 0,
      legacySeats: 0,
      paddleOperations: 0,
      paymentMethods: 0,
      legacyWebhooks: 0,
      paddleWebhooks: 0,
      certificationFixtures: 0,
    },
    scheduled: { count: 0, invalidBoundaries: 0, earliest: null },
    details: { webhooks: [], scheduled: [], subscriptions: [] },
  };
  const facts = () =>
    structuredClone(reference.checkpoints[String(state.count)]);
  const tables = () => facts().tables.map((t: any) => t.name);
  const ledger = () =>
    facts().versions.map((version: string, i: number) => ({
      version,
      statements: [state.ledgerChange && i === 0 ? "changed" : secret],
      name: "synthetic",
    }));
  const history = () =>
    Object.fromEntries(
      [...tables(), "auth.users"].map((name) => [
        name,
        state.historyChange && name === "auth.users"
          ? "b".repeat(32)
          : emptyDigest,
      ]),
    );
  const transport = vi.fn(async (url: string, options: any) => {
    expect(
      url.startsWith(
        `https://api.supabase.com/v1/projects/${UPGRADE_SCOPE.project}/`,
      ),
    ).toBe(true);
    expect(options.redirect).toBe("error");
    if (url.endsWith("/functions")) return Response.json(state.functions);
    if (url.endsWith("/secrets"))
      return Response.json(
        CONFIGURATION_CLASSES.PADDLE_REQUIRED.filter((name) =>
          name.startsWith("PADDLE_"),
        ).map((name) => ({ name, digest: secret })),
      );
    expect(url.endsWith("/database/query/read-only")).toBe(true);
    const { query } = JSON.parse(options.body);
    expect(query).toMatch(/^select\s/);
    if (query === STATUS_QUERIES.schema)
      return Response.json([
        { has_migration_history: true, has_billing_policy: true },
      ]);
    if (query === STATUS_QUERIES.migrations)
      return Response.json(
        facts().versions.map((version: string) => ({ version })),
      );
    if (query === STATUS_QUERIES.policy)
      return Response.json([
        {
          environment: "test",
          sales_enabled: false,
          reconciliation_enabled: false,
        },
      ]);
    if (query === INVENTORY_QUERY) return Response.json([{ facts: facts() }]);
    if (query === historyQuery(tables()))
      return Response.json([{ history: history() }]);
    if (query === workQuery(state.count >= 183))
      return Response.json([{ work: state.work, scheduled: state.scheduled }]);
    if (query === WORK_DETAIL_QUERY)
      return Response.json([{ details: state.details }]);
    if (query === SEQUENCE_QUERY) return Response.json([{ count: 0 }]);
    if (query === LEDGER_ROWS_QUERY) return Response.json([{ rows: ledger() }]);
    if (query === MANAGED_COLUMNS_QUERY)
      return Response.json([{ columns: state.managedColumns }]);
    const names = [
      ...tables().map((name: string) => `public.${name}`),
      "auth.users",
      "supabase_migrations.schema_migrations",
    ];
    for (let i = 0; i < names.length; i += 8) {
      const batch = names.slice(i, i + 8);
      if (query === backupRowsQuery(batch))
        return Response.json([
          {
            data: Object.fromEntries(
              batch.map((name: string) => [
                name,
                name === "supabase_migrations.schema_migrations"
                  ? ledger()
                  : [],
              ]),
            ),
          },
        ]);
    }
    throw new Error(secret);
  });
  const artifacts = new Map();
  const artifactFactory = (...args: any[]) => {
    const artifact = disposableArtifact(...args);
    artifacts.set(artifact.directory, artifact.artifact.target);
    return artifact;
  };
  const execute = vi.fn((command: string, args: string[], options: any) => {
    if (command === "supabase")
      return { status: 0, stdout: "2.109.1", stderr: "" };
    expect(args[0]).toMatch(/supabase-remote-guard\.mjs$/);
    expect(options.shell).toBe(false);
    expect(options.env.PGHOST).toBeUndefined();
    expect(options.env.SUPABASE_API_URL).toBeUndefined();
    expect(args.join(" ")).not.toContain(secret);
    const actual = args.slice(1);
    state.commands.push(actual);
    const target = artifacts.get(options.cwd);
    if (actual[0] === "db" && actual.includes("--dry-run"))
      return {
        status: 0,
        stdout:
          identity.manifest.migrations.approved
            .slice(state.count, target)
            .map((m: any) => m.filename)
            .join("\n") || "No pending migrations",
        stderr: "",
      };
    if (actual[0] === "db" && actual.includes("--yes")) {
      if (state.failMigration) {
        state.count = 182;
        return { status: 1, stdout: secret, stderr: secret };
      }
      state.count = target;
    }
    if (actual[0] === "functions") {
      if (state.failFunction === actual[2])
        return { status: 1, stdout: secret, stderr: secret };
      const existing = state.functions.find((f: any) => f.name === actual[2]);
      if (existing) existing.version++;
      else
        state.functions.push({
          name: actual[2],
          id: actual[2],
          version: 1,
          verify_jwt: !actual.includes("--no-verify-jwt"),
          status: "ACTIVE",
        });
    }
    return { status: 0, stdout: "ok", stderr: "" };
  });
  const verifyRecovery = vi.fn(async () => ({
    verified: true,
    verifiedAt: new Date().toISOString(),
    publicTableCount: tables().length,
    authUsersIncluded: true,
    migrationLedgerIncluded: true,
    managedSchemaCaptured: true,
    allRetainedRowsIdentical: true,
  }));
  const run = (action: string, overrides = {}) =>
    runPopulatedUpgrade({
      action,
      env,
      transport,
      execute,
      artifactFactory,
      readSource: () => ({ commit: env.GITHUB_SHA, clean: true, identity }),
      readReference: () => reference,
      readCheckpoints: () => checkpoints,
      verifyRecovery,
      saveBackup: (bytes: Buffer) => {
        state.backup = bytes;
      },
      loadBackup: () => state.backup,
      onProgress: (report: any) => state.stages.push(structuredClone(report)),
      ...overrides,
    });
  return {
    env,
    state,
    reference,
    checkpoints,
    facts,
    transport,
    execute,
    verifyRecovery,
    run,
  };
}

describe("GitHub-reviewed populated staging upgrade", () => {
  it("produces a complete local plan without credentials or remote calls", async () => {
    const f = fixture();
    const report = await f.run("plan", { env: {} });
    expect(report).toMatchObject({
      status: "plan",
      remoteWritesMayHaveOccurred: false,
      plan: { targetMigrations: 188 },
    });
    expect(report.plan.functions).toHaveLength(17);
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each([
    ["GITHUB_REF", "refs/heads/main"],
    ["GITHUB_REPOSITORY", "other/coachos"],
    ["STAGING_UPGRADE_ENVIRONMENT", "production"],
    ["STAGING_SUPABASE_PROJECT_REF", "btrfmxjpjzbyowtvncnc"],
    ["STAGING_SUPABASE_PROJECT_REF", "exmrksgdikfprtfeltzu"],
    ["STAGING_APPLICATION_ORIGIN", "https://repsync-production.netlify.app"],
    ["GITHUB_EVENT_NAME", "pull_request"],
    ["GITHUB_WORKFLOW", "Unprotected job"],
    ["SUPABASE_DB_PASSWORD", ""],
    ["GITHUB_RUN_ATTEMPT", ""],
  ])("rejects an invalid %s before remote access", async (field, value) => {
    const f = fixture();
    f.env[field] = value;
    expect((await f.run("prepare")).status).toBe("blocked");
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("prepares an encrypted, restore-verified backup without hosted writes", async () => {
    const f = fixture();
    const report = await f.run("prepare");
    expect(report).toMatchObject({
      status: "prepared",
      backupVerified: true,
      remoteWritesMayHaveOccurred: false,
    });
    expect(f.verifyRecovery).toHaveBeenCalledOnce();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.state.backup.toString()).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(f.state.stages)).not.toContain(secret);
  });
  it("contains billing, applies the bounded phases, preserves rows, and deploys all 17 functions", async () => {
    const f = fixture();
    expect((await f.run("prepare")).status).toBe("prepared");
    const report = await f.run("apply");
    expect(report).toMatchObject({
      status: "backend_upgraded_sandbox_disabled",
      migrationCount: 188,
      backupVerified: true,
      gatesEnabled: false,
      providerCalls: 0,
    });
    expect(report.containedFunctions).toHaveLength(15);
    expect(report.deployedFunctions).toHaveLength(17);
    expect(report.containedFunctions[0]).toBe("billing-paddle-webhook");
    expect(report.deployedFunctions.at(-1)).toBe("billing-paddle-webhook");
    expect(
      f.state.commands.filter(
        (args: string[]) => args[0] === "db" && args.includes("--yes"),
      ),
    ).toHaveLength(3);
    expect(
      f.state.commands.some((args: string[]) => args.includes("reset")),
    ).toBe(false);
    expect(JSON.stringify(report)).not.toContain(secret);
  }, 30_000);
  it.each([181, 184, 185, 188])(
    "continues from verified checkpoint %i with a fresh backup",
    async (count) => {
      const f = fixture(count);
      expect((await f.run("prepare")).status).toBe("prepared");
      const report = await f.run("apply");
      expect(report.status).toBe("backend_upgraded_sandbox_disabled");
      expect(report.migrationCount).toBe(188);
    },
    30_000,
  );
  it("refuses apply before the encrypted backup has been uploaded", async () => {
    const f = fixture();
    delete f.env.STAGING_BACKUP_ARTIFACT_ID;
    expect((await f.run("apply")).code).toBe(
      "UPGRADE_UPLOADED_BACKUP_REQUIRED",
    );
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("does not save or use a backup whose restoration failed", async () => {
    const f = fixture();
    const report = await f.run("prepare", {
      verifyRecovery: async () => {
        throw new Error(secret);
      },
    });
    expect(report).toMatchObject({
      status: "blocked",
      remoteWritesMayHaveOccurred: false,
    });
    expect(f.state.backup).toBeNull();
    expect(f.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain(secret);
  });
  it.each(["history", "ledger", "functions", "managed schema"])(
    "blocks writes when %s changed after the recovery snapshot",
    async (kind) => {
      const f = fixture();
      await f.run("prepare");
      if (kind === "history") f.state.historyChange = true;
      if (kind === "ledger") f.state.ledgerChange = true;
      if (kind === "functions") f.state.functions[0].version++;
      if (kind === "managed schema")
        f.state.managedColumns["auth.users"].push(
          managedColumn("new_platform_field", "text"),
        );
      const report = await f.run("apply");
      expect(report).toMatchObject({
        status: "blocked",
        remoteWritesMayHaveOccurred: false,
      });
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it("preserves deferred/manual-review test webhooks and overdue Paddle operations", async () => {
    const f = fixture();
    f.state.work.paddleWebhooks = 28;
    f.state.details.webhooks = [
      { environment: "test", status: "deferred", count: 17 },
      { environment: "test", status: "manual_review", count: 11 },
    ];
    f.state.scheduled = {
      count: 1,
      invalidBoundaries: 0,
      earliest: "2026-10-23T10:01:34Z",
    };
    f.state.details.scheduled = [
      { source: "paddle", environment: "test", timing: "overdue", count: 1 },
    ];
    expect((await f.run("prepare")).status).toBe("prepared");
    expect((await f.run("apply")).status).toBe(
      "backend_upgraded_sandbox_disabled",
    );
    expect(f.state.work.paddleWebhooks).toBe(28);
    expect(f.state.scheduled.count).toBe(1);
  }, 30_000);
  it.each(["received", "live", "future", "running"])(
    "rejects unreviewed %s work before recovery or writes",
    async (kind) => {
      const f = fixture();
      if (kind === "received") {
        f.state.work.paddleWebhooks = 1;
        f.state.details.webhooks = [
          { environment: "test", status: "received", count: 1 },
        ];
      }
      if (kind === "live")
        f.state.details.subscriptions = [
          {
            provider: "paddle",
            environment: "live",
            status: "active",
            count: 1,
          },
        ];
      if (kind === "future") {
        f.state.scheduled.count = 1;
        f.state.details.scheduled = [
          { source: "paddle", environment: "test", timing: "future", count: 1 },
        ];
      }
      if (kind === "running") f.state.work.paddleOperations = 1;
      const report = await f.run("prepare");
      expect(report.status).toBe("blocked");
      expect(f.verifyRecovery).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it("reports partial migration failure without retrying or exposing CLI output", async () => {
    const f = fixture();
    await f.run("prepare");
    f.state.failMigration = true;
    const report = await f.run("apply");
    expect(report).toMatchObject({
      status: "blocked",
      stage: "migrate_to_184",
      code: "UPGRADE_GUARDED_CLI_FAILED",
      remoteWritesMayHaveOccurred: true,
    });
    expect(f.state.count).toBe(182);
    expect(
      f.state.commands.filter(
        (args: string[]) => args[0] === "db" && args.includes("--yes"),
      ),
    ).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain(secret);
  }, 30_000);
});

describe("private backup integrity and schema compatibility", () => {
  const binding = {
    project: UPGRADE_SCOPE.project,
    commit: "a".repeat(40),
    runId: "1",
    attempt: "1",
  };
  it("reconstructs hosted managed fields locally without filtering captured values", () => {
    const local = managedColumns();
    local["auth.users"].push(managedColumn("local_only_flag", "boolean"));
    const hosted = managedColumns();
    hosted["auth.users"].push(managedColumn("source_metadata", "jsonb"));
    hosted["supabase_migrations.schema_migrations"].push(
      managedColumn("created_by", "text"),
      managedColumn("rollback", "text[]"),
      managedColumn("idempotency_key", "uuid"),
    );
    const query = managedRestoreSql(hosted, local);
    expect(query).toContain(
      'alter table "auth"."users" add column "source_metadata" jsonb;',
    );
    expect(query).toContain(
      'alter table "supabase_migrations"."schema_migrations" add column "rollback" text[];',
    );
    expect(query).toContain('drop column "local_only_flag" restrict;');
    expect(query).not.toMatch(/cascade|public\./i);
    const data = {
      "auth.users": [{ id: "synthetic", source_metadata: { private: secret } }],
      "supabase_migrations.schema_migrations": [
        {
          version: "synthetic",
          statements: [],
          name: "test",
          created_by: secret,
          rollback: [secret],
          idempotency_key: null,
        },
      ],
    };
    expect(() => validateManagedRows(data, hosted)).not.toThrow();
    const insert = restoreRowsSql(data, hosted);
    expect(insert).toContain('"created_by","rollback","idempotency_key"');
    expect(insert).toContain(secret);
    expect(data["auth.users"][0].source_metadata.private).toBe(secret);
  });
  it("requires every source-managed field, including null fields, to be captured", () => {
    const columns = managedColumns();
    const data = {
      "auth.users": [{ id: "synthetic" }],
      "supabase_migrations.schema_migrations": [
        { version: "synthetic", statements: null, name: null },
      ],
    };
    expect(() => validateManagedRows(data, columns)).not.toThrow();
    expect(() =>
      validateManagedRows({ ...data, "auth.users": [{}] }, columns),
    ).toThrow("UPGRADE_BACKUP_MANAGED_COLUMNS_DIFFER");
    expect(() =>
      validateManagedRows(
        { ...data, "auth.users": [{ id: "synthetic", unexpected: secret }] },
        columns,
      ),
    ).toThrow("UPGRADE_BACKUP_MANAGED_COLUMNS_DIFFER");
  });
  it.each([
    { type: "text; delete from auth.users; --" },
    { type: "text /* SQL */" },
    { typeSchema: "public" },
    { name: 'id"; drop table public.clients; --' },
  ])("rejects executable or custom managed column metadata: %j", (change) => {
    const columns = managedColumns();
    Object.assign(columns["auth.users"][0], change);
    expect(() => managedRestoreSql(columns, managedColumns())).toThrow();
  });
  it("rejects unknown managed tables, missing identity fields and type changes", () => {
    expect(() =>
      validateManagedColumns({ ...managedColumns(), "public.clients": [] }),
    ).toThrow("UPGRADE_BACKUP_MANAGED_SCHEMA_INVALID");
    const columns = managedColumns();
    columns["auth.users"] = [managedColumn("different", "uuid")];
    expect(() => validateManagedColumns(columns)).toThrow(
      "UPGRADE_BACKUP_MANAGED_SCHEMA_INVALID",
    );
    const local = managedColumns();
    local["auth.users"][0].type = "text";
    expect(() => managedRestoreSql(managedColumns(), local)).toThrow(
      "UPGRADE_BACKUP_MANAGED_TYPE_MISMATCH",
    );
  });
  it("round-trips the encrypted snapshot and authenticates its target, commit and attempt", () => {
    const snapshot = { ...binding, data: { value: secret } };
    const bytes = encryptUpgradeBackup(snapshot, secret);
    expect(bytes.toString()).not.toContain(secret);
    expect(decryptUpgradeBackup(bytes, secret, binding)).toEqual(snapshot);
    expect(() => decryptUpgradeBackup(bytes, "wrong", binding)).toThrow(
      "UPGRADE_BACKUP_DECRYPTION_FAILED",
    );
    expect(() =>
      decryptUpgradeBackup(bytes, secret, { ...binding, project: "wrong" }),
    ).toThrow("UPGRADE_BACKUP_DECRYPTION_FAILED");
    expect(() =>
      decryptUpgradeBackup(bytes, secret, { ...binding, attempt: "2" }),
    ).toThrow("UPGRADE_BACKUP_DECRYPTION_FAILED");
    const tampered = JSON.parse(bytes.toString());
    tampered.tag = Buffer.alloc(16).toString("base64");
    expect(() =>
      decryptUpgradeBackup(
        Buffer.from(JSON.stringify(tampered)),
        secret,
        binding,
      ),
    ).toThrow("UPGRADE_BACKUP_DECRYPTION_FAILED");
  });
  it("uses exact relation names and restores generated columns through their source values", () => {
    expect(() =>
      backupRowsQuery(["public.clients'; delete from auth.users; --"]),
    ).toThrow();
    const query = restoreRowsSql(
      {
        "auth.users": [
          { email: "O'Brien@example.test", confirmed_at: "generated" },
        ],
      },
      {
        "auth.users": [
          { name: "email", generated: false },
          { name: "confirmed_at", generated: true },
        ],
      },
    );
    expect(query).toContain('insert into "auth"."users" ("email")');
    expect(query).toContain("O''Brien@example.test");
    expect(() =>
      restoreRowsSql(
        { "auth.users": [{ unexpected: secret }] },
        { "auth.users": [{ name: "id", generated: false }] },
      ),
    ).toThrow("UPGRADE_BACKUP_MANAGED_COLUMNS_DIFFER");
  });
  it("accepts only the known extension qualification and rejects function/grant drift", () => {
    const f = fixture();
    const facts = f.facts();
    facts.schema.columns[0].default = "extensions.uuid_generate_v4()";
    expect(
      verifyUpgradeSchema(
        facts,
        f.reference,
        identity,
        f.checkpoints,
        UPGRADE_SCOPE.project,
      ).profile,
    ).toBe("canonical");
    facts.schema.columns[0].default = "untrusted.uuid_generate_v4()";
    expect(() =>
      verifyUpgradeSchema(
        facts,
        f.reference,
        identity,
        f.checkpoints,
        UPGRADE_SCOPE.project,
      ),
    ).toThrow("UPGRADE_DATABASE_SCHEMA_NOT_REVIEWED");
    const altered = f.facts();
    altered.tables[0].acl += secret;
    expect(() =>
      verifyUpgradeSchema(
        altered,
        f.reference,
        identity,
        f.checkpoints,
        UPGRADE_SCOPE.project,
      ),
    ).toThrow("UPGRADE_DATABASE_SCHEMA_NOT_REVIEWED");
  });
  it("keeps generated progress reports outside the clean-checkout comparison", () => {
    expect(
      execFileSync("git", ["check-ignore", "--stdin"], {
        input: "output/staging-upgrade/report.json\n",
        encoding: "utf8",
      }).trim(),
    ).toBe("output/staging-upgrade/report.json");
  });
  it("requires quality/database checks, environment review and uploaded encrypted recovery before apply", () => {
    const workflow = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(
        ".github/workflows/supabase-staging-billing-upgrade.yml",
        "utf8",
      ),
    );
    expect(workflow.on.push.branches).toEqual(["Ahmed-billing"]);
    const job = workflow.jobs.upgrade;
    expect(job.environment).toBe("supabase-staging");
    expect(job.needs).toEqual(["quality", "database"]);
    expect(job.if).toContain("refs/heads/Ahmed-billing");
    expect(job.env.STAGING_SUPABASE_PROJECT_REF).toBe(UPGRADE_SCOPE.project);
    const prepare = job.steps.findIndex((step: any) =>
      step.run?.endsWith(" prepare"),
    );
    const upload = job.steps.findIndex(
      (step: any) => step.id === "backup-upload",
    );
    const apply = job.steps.findIndex((step: any) =>
      step.run?.endsWith(" apply"),
    );
    expect(prepare).toBeLessThan(upload);
    expect(upload).toBeLessThan(apply);
    expect(job.steps[prepare].env.ALLOW_REMOTE_SUPABASE).toBeUndefined();
    expect(job.steps[upload].with.path).toMatch(/\.json\.aes$/);
    expect(job.steps[apply].env.STAGING_BACKUP_ARTIFACT_ID).toContain(
      "steps.backup-upload.outputs.artifact-id",
    );
  });
});
