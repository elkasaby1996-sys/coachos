import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  inspectUpgradeReadiness,
  readinessAnnotation,
  WORK_DETAIL_QUERY,
  diagnosticAnnotations,
} from "../../scripts/staging-upgrade-readiness.mjs";
import {
  STAGING_PROJECT,
  STATUS_QUERIES,
} from "../../scripts/staging-billing-status.mjs";
import {
  INVENTORY_QUERY,
  LS_ROOT_KEYS,
} from "../../scripts/billing-retirement-remote-inventory.mjs";
import {
  databaseContract,
  historyQuery,
  workQuery,
} from "../../scripts/staging-release-observation.mjs";
import { releaseIdentity } from "../../scripts/staging-release-artifacts.mjs";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import { CONFIGURATION_CLASSES } from "../../scripts/billing-deployment-contract.mjs";

const privateValue = "private-provider-data-never-exported";
let identity: any;
beforeAll(() => {
  identity = releaseIdentity();
}, 30_000);
function fixture() {
  const versions = identity.manifest.migrations.approved
    .slice(0, 180)
    .map((m: any) => m.filename.slice(0, 14));
  const tables = ["billing_accounts", "billing_customers_v2"];
  const state = {
    versions,
    facts: {
      versions,
      policy: { sales: false, reconciliation: false },
      functions: [
        {
          signature: "example()",
          definition: privateValue,
          applicationExecutable: false,
          publicExecutable: false,
          acl: null,
        },
      ],
      tables: tables.map((name) => ({ name, acl: null, rls: true })),
      schema: {
        columns: [],
        constraints: [],
        indexes: [],
        triggers: [],
        policies: [],
      },
      lsRoots: Object.fromEntries(LS_ROOT_KEYS.map((k) => [k, 0])),
    },
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
        status: "ACTIVE",
        verify_jwt: f.verifyJwt,
        privateValue,
      })),
    secretNames: CONFIGURATION_CLASSES.PADDLE_REQUIRED.filter((n) =>
      n.startsWith("PADDLE_"),
    ),
    policy: {
      environment: "test",
      sales_enabled: false,
      reconciliation_enabled: false,
    },
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
    scheduled: {
      count: 0,
      invalidBoundaries: 0,
      earliest: null as string | null,
    },
    history: Object.fromEntries(
      [...tables, "auth.users"].map((t) => [t, "a".repeat(32)]),
    ),
    historyReads: 0,
    changeHistory: false,
    time: 1_700_000_000_000,
  };
  const checkpoints = {
    frozenPayloadCommit: identity.payload.frozenCommit,
    manifestDigest: hash(JSON.stringify(identity.manifest)),
    checkpoints: { "180": { digest: databaseContract(state.facts) } },
  };
  const env = {
    STAGING_SUPABASE_PROJECT_REF: STAGING_PROJECT,
    SUPABASE_ACCESS_TOKEN: privateValue,
  };
  const transport = vi.fn(async (url: string, options: RequestInit) => {
    expect(
      url.startsWith(
        `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/`,
      ),
    ).toBe(true);
    expect(options.redirect).toBe("error");
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${privateValue}`,
    });
    if (url.endsWith("/functions")) {
      expect(options.method).toBe("GET");
      return Response.json(state.functions);
    }
    if (url.endsWith("/secrets")) {
      expect(options.method).toBe("GET");
      return Response.json(
        state.secretNames.map((name) => ({ name, digest: privateValue })),
      );
    }
    expect(url.endsWith("/database/query/read-only")).toBe(true);
    expect(options.method).toBe("POST");
    const { query } = JSON.parse(options.body as string);
    expect(query).toMatch(/^select\s/);
    if (query === STATUS_QUERIES.schema)
      return Response.json([
        {
          has_migration_history: state.versions.length > 0,
          has_billing_policy: state.versions.length > 0,
        },
      ]);
    if (query === STATUS_QUERIES.migrations)
      return Response.json(state.versions.map((version) => ({ version })));
    if (query === STATUS_QUERIES.policy) return Response.json([state.policy]);
    if (query === INVENTORY_QUERY)
      return Response.json([{ facts: state.facts }]);
    if (query === workQuery(false))
      return Response.json([{ work: state.work, scheduled: state.scheduled }]);
    if (query === WORK_DETAIL_QUERY)
      return Response.json([
        {
          details: {
            webhooks: state.work.paddleWebhooks
              ? [
                  {
                    environment: "test",
                    status: "deferred",
                    count: state.work.paddleWebhooks,
                  },
                ]
              : [],
            scheduled: state.scheduled.count
              ? [
                  {
                    source: "paddle",
                    environment: "test",
                    timing: "future",
                    count: state.scheduled.count,
                  },
                ]
              : [],
            subscriptions: [],
          },
          rendering: {
            postgresVersion: 170006,
            searchPath: "public, extensions",
            sessionRole: "postgres",
          },
        },
      ]);
    if (query === historyQuery(tables)) {
      state.historyReads++;
      if (state.changeHistory && state.historyReads === 2)
        state.history["auth.users"] = "b".repeat(32);
      return Response.json([{ history: state.history }]);
    }
    throw new Error(privateValue);
  });
  return {
    state,
    checkpoints,
    env,
    transport,
    run: (overrides = {}) =>
      inspectUpgradeReadiness({
        env,
        transport,
        readLocal: () => ({ identity, checkpoints }),
        now: () => state.time,
        ...overrides,
      }),
  };
}

describe("read-only assessment before upgrading installed staging", () => {
  it("binds the eight pending migrations and reports schema/history facts without authorizing writes", async () => {
    const f = fixture();
    const result = await f.run();
    expect(result).toMatchObject({
      status: "inspected",
      project: STAGING_PROJECT,
      remoteChangesPerformed: false,
      upgradeReadiness: {
        status: "ready_for_upgrade_preparation",
        stable: true,
        deploymentAuthorized: false,
        recoveryVerified: false,
        deployedSourceVerified: false,
        migrations: {
          from: 180,
          to: 188,
          pending: identity.manifest.migrations.approved.slice(180),
        },
        schema: { matchesCheckpoint: true },
        retainedHistory: { publicTableCount: 2, authUsersIncluded: true },
        blockers: [],
      },
    });
    expect(f.state.historyReads).toBe(2);
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(readinessAnnotation(result)).toContain("schemaMatches=true");
    expect(readinessAnnotation(result)).toContain("deploymentAuthorized=false");
  });
  it("reports legacy history, unfinished work, scheduled changes, and missing settings without treating them as disposable", async () => {
    const f = fixture();
    f.state.facts.lsRoots.subscriptions = 2;
    f.state.work.paddleWebhooks = 3;
    f.state.scheduled = {
      count: 1,
      invalidBoundaries: 0,
      earliest: "2027-01-01T00:00:00Z",
    };
    f.state.secretNames = f.state.secretNames.filter(
      (n) => n !== "PADDLE_SANDBOX_PORTAL_API_KEY",
    );
    const result = await f.run();
    expect(result.upgradeReadiness).toMatchObject({
      status: "review_required",
      legacyRoots: { subscriptions: 2 },
      inFlightWork: { paddleWebhooks: 3 },
      blockers: [
        "PADDLE_SETTINGS_MISSING",
        "RETAINED_LEGACY_BILLING_REVIEW_REQUIRED",
        "RETAINED_IN_FLIGHT_WORK_REVIEW_REQUIRED",
        "SCHEDULED_OPERATION_REVIEW_REQUIRED",
      ],
    });
    expect(result.remoteChangesPerformed).toBe(false);
    expect(JSON.stringify(result)).not.toContain(privateValue);
  });
  it("separates a schema mismatch from a matching version prefix", async () => {
    const f = fixture();
    f.state.facts.functions[0].definition += " changed";
    expect((await f.run()).upgradeReadiness).toMatchObject({
      status: "review_required",
      schema: { matchesCheckpoint: false },
      blockers: ["DATABASE_SCHEMA_DIFFERS_FROM_CHECKPOINT"],
    });
  });
  it("reports exact source object/field differences but keeps the mismatch blocker", async () => {
    const f = fixture();
    const schemaReference = {
      schemaVersion: 1,
      frozenPayloadCommit: identity.payload.frozenCommit,
      manifestDigest: hash(JSON.stringify(identity.manifest)),
      checkpoints: { "180": structuredClone(f.state.facts) },
    };
    f.state.facts.functions[0].definition = `${privateValue}-altered`;
    const result = await f.run({
      readLocal: () => ({
        identity,
        checkpoints: f.checkpoints,
        schemaReference,
      }),
    });
    expect(result.upgradeReadiness).toMatchObject({
      status: "review_required",
      blockers: ["DATABASE_SCHEMA_DIFFERS_FROM_CHECKPOINT"],
      schema: {
        matchesCheckpoint: false,
        diagnostics: {
          changedObjectCount: 1,
          changes: [
            { kind: "functions", object: "example()", fields: ["definition"] },
          ],
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(privateValue);
  });
  it("rejects a substituted reference before reading the remote schema", async () => {
    const f = fixture();
    const result = await f.run({
      readLocal: () => ({
        identity,
        checkpoints: f.checkpoints,
        schemaReference: { schemaVersion: 1 },
      }),
    });
    expect(result.upgradeReadiness).toMatchObject({
      code: "UPGRADE_SCHEMA_REFERENCE_INVALID",
    });
    expect(
      f.transport.mock.calls.some(
        ([, options]) =>
          options.body &&
          JSON.parse(options.body as string).query === INVENTORY_QUERY,
      ),
    ).toBe(false);
  });
  it("publishes actionable diagnostics in bounded notices without raw definitions", () => {
    const report = {
      upgradeReadiness: {
        stable: true,
        status: "review_required",
        schema: {
          rendering: { postgresVersion: 170006 },
          diagnostics: {
            status: "compared",
            exactMatch: false,
            changedObjectCount: 25,
            truncated: false,
            sections: {},
            changes: Array.from({ length: 25 }, () => ({
              kind: "functions",
              object: "example()",
              change: "changed",
              fields: ["acl"],
            })),
          },
        },
        retainedWorkDetails: {
          webhooks: [{ environment: "test", status: "deferred", count: 28 }],
          scheduled: [],
          subscriptions: [],
        },
      },
    };
    const notices = diagnosticAnnotations(report);
    expect(notices).toHaveLength(6);
    expect(notices[1]).toContain('"object":"example()"');
    expect(notices[3]).toContain('"count":28');
    expect(
      notices.every(
        (notice: string) => notice.length < 10_000 && !notice.includes("\n"),
      ),
    ).toBe(true);
    expect(
      diagnosticAnnotations({
        upgradeReadiness: { status: "inspection_failed" },
      }),
    ).toEqual([]);
  });
  it("keeps a blocker for live-labelled records when other work is drained", async () => {
    const f = fixture();
    const result = await f.run({
      transport: async (url: string, options: RequestInit) => {
        if (
          options.body &&
          JSON.parse(options.body as string).query === WORK_DETAIL_QUERY
        )
          return Response.json([
            {
              details: {
                webhooks: [],
                scheduled: [],
                subscriptions: [
                  {
                    provider: "paddle",
                    environment: "live",
                    status: "active",
                    count: 1,
                  },
                ],
              },
              rendering: {
                postgresVersion: 170006,
                searchPath: "public",
                sessionRole: "postgres",
              },
            },
          ]);
        return f.transport(url, options);
      },
    });
    expect(result.upgradeReadiness.blockers).toEqual([
      "RETAINED_NON_SANDBOX_BILLING_REVIEW_REQUIRED",
    ]);
    expect(result.remoteChangesPerformed).toBe(false);
  });
  it("rejects private aggregate categories without reporting them", async () => {
    const f = fixture();
    const result = await f.run({
      transport: async (url: string, options: RequestInit) => {
        if (
          options.body &&
          JSON.parse(options.body as string).query === WORK_DETAIL_QUERY
        )
          return Response.json([
            {
              details: {
                webhooks: [
                  { environment: "test", status: privateValue, count: 1 },
                ],
                scheduled: [],
                subscriptions: [],
              },
              rendering: {
                postgresVersion: 170006,
                searchPath: "public",
                sessionRole: "postgres",
              },
            },
          ]);
        return f.transport(url, options);
      },
    });
    expect(result.upgradeReadiness).toMatchObject({
      code: "UPGRADE_RESPONSE_INVALID",
    });
    expect(JSON.stringify(result)).not.toContain(privateValue);
  });
  it.each(["btrfmxjpjzbyowtvncnc", "exmrksgdikfprtfeltzu"])(
    "never queries another target %s",
    async (project) => {
      const f = fixture();
      expect(
        await f.run({
          env: { ...f.env, STAGING_SUPABASE_PROJECT_REF: project },
        }),
      ).toMatchObject({ status: "blocked", code: "STAGING_PROJECT_MISMATCH" });
      expect(f.transport).not.toHaveBeenCalled();
    },
  );
  it("does not run installed-schema queries against an empty project", async () => {
    const f = fixture();
    f.state.versions = [];
    expect((await f.run()).upgradeReadiness).toMatchObject({
      status: "not_assessed",
      reason: "INITIAL_INSTALLATION_REQUIRED",
    });
    expect(f.transport).toHaveBeenCalledTimes(3);
  });
  it("rejects local checkpoints bound to another payload", async () => {
    const f = fixture();
    f.checkpoints.frozenPayloadCommit = "f".repeat(40);
    expect((await f.run()).upgradeReadiness).toMatchObject({
      status: "inspection_failed",
      stage: "local_contract",
      code: "UPGRADE_LOCAL_CONTRACT_INVALID",
    });
  });
  it("rejects a changing ledger during schema inspection", async () => {
    const f = fixture();
    f.state.facts.versions = f.state.versions.slice(1);
    expect((await f.run()).upgradeReadiness).toMatchObject({
      status: "inspection_failed",
      code: "UPGRADE_LEDGER_CHANGED",
    });
  });
  it("rejects retained-data drift between the opening and closing observations", async () => {
    const f = fixture();
    f.state.changeHistory = true;
    expect((await f.run()).upgradeReadiness).toMatchObject({
      status: "inspection_failed",
      code: "UPGRADE_OBSERVATION_CHANGED",
    });
  });
  it("rejects observations older than one minute", async () => {
    const f = fixture();
    expect(
      (
        await f.run({
          now: vi
            .fn()
            .mockReturnValueOnce(f.state.time)
            .mockReturnValue(f.state.time + 60_000),
        })
      ).upgradeReadiness,
    ).toMatchObject({ code: "UPGRADE_OBSERVATION_TOO_OLD" });
  });
  it("rejects malformed count and history evidence", async () => {
    const f = fixture();
    f.state.history["auth.users"] = privateValue;
    const result = await f.run();
    expect(result.upgradeReadiness).toMatchObject({
      status: "inspection_failed",
      code: "UPGRADE_RESPONSE_INVALID",
    });
    expect(JSON.stringify(result)).not.toContain(privateValue);
  });
  it("rejects unsafe table names before constructing a history query", async () => {
    const f = fixture();
    f.state.facts.tables[0].name = 'x"; delete from auth.users; --';
    expect((await f.run()).upgradeReadiness).toMatchObject({
      status: "inspection_failed",
      code: "UPGRADE_RESPONSE_INVALID",
    });
    expect(f.state.historyReads).toBe(0);
  });
  it("detects an enabled policy and unexpected function without granting deployment authority", async () => {
    const f = fixture();
    f.state.policy.sales_enabled = true;
    f.state.facts.policy.sales = true;
    f.state.functions.push({
      name: "custom-function",
      id: "custom-function",
      version: 1,
      status: "ACTIVE",
      verify_jwt: true,
      privateValue,
    });
    expect((await f.run()).upgradeReadiness).toMatchObject({
      blockers: [
        "SANDBOX_DISABLED_POLICY_REQUIRED",
        "UNCLASSIFIED_FUNCTIONS_PRESENT",
      ],
      unclassifiedFunctionCount: 1,
      deploymentAuthorized: false,
    });
  });
  it("sanitizes rejected schema reads", async () => {
    const f = fixture();
    const result = await f.run({
      transport: async (url: string, options: RequestInit) => {
        if (
          options.body &&
          JSON.parse(options.body as string).query === INVENTORY_QUERY
        )
          return new Response(privateValue, { status: 403 });
        return f.transport(url, options);
      },
    });
    expect(result.upgradeReadiness).toMatchObject({
      status: "inspection_failed",
      code: "UPGRADE_READ_ONLY_REQUEST_FAILED",
      httpStatus: 403,
    });
    expect(readinessAnnotation(result)).toContain("httpStatus=403");
    expect(JSON.stringify(result)).not.toContain(privateValue);
  });
  it("accepts the larger schema definition response without publishing its contents", async () => {
    const f = fixture();
    f.state.facts.functions[0].definition =
      privateValue + " ".repeat(1_200_000);
    f.checkpoints.checkpoints["180"].digest = databaseContract(f.state.facts);
    const result = await f.run();
    expect(result.upgradeReadiness.status).toBe(
      "ready_for_upgrade_preparation",
    );
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(JSON.stringify(result).length).toBeLessThan(20_000);
  });
  it("rejects schema responses exceeding the fixed 8 MiB bound", async () => {
    const f = fixture();
    const result = await f.run({
      transport: async (url: string, options: RequestInit) => {
        if (
          options.body &&
          JSON.parse(options.body as string).query === INVENTORY_QUERY
        )
          return Response.json("x".repeat(8 * 1024 * 1024));
        return f.transport(url, options);
      },
    });
    expect(result.upgradeReadiness).toMatchObject({
      status: "inspection_failed",
      code: "UPGRADE_READ_ONLY_RESPONSE_UNAVAILABLE",
    });
  });
  it("runs only the read-only assessment on relevant Ahmed-billing pushes under the protected staging environment", () => {
    const workflow = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(".github/workflows/supabase-migration-status.yml", "utf8"),
    );
    expect(workflow.on.push.branches).toEqual(["Ahmed-billing"]);
    expect(workflow.on.push.paths).toContain(
      "scripts/staging-upgrade-readiness.mjs",
    );
    const job = workflow.jobs["migration-status"];
    expect(job.needs).toBe("schema-reference");
    const localJob = workflow.jobs["schema-reference"];
    expect(localJob.environment).toBeUndefined();
    expect(JSON.stringify(localJob)).not.toContain("secrets.");
    expect(
      localJob.steps.some((s: any) =>
        s.run?.includes("staging-schema-reference.mjs"),
      ),
    ).toBe(true);
    expect(job.environment).toBe("supabase-staging");
    expect(
      job.steps.find((s: any) => s.name === "Checkout selected branch").with[
        "fetch-depth"
      ],
    ).toBe(0);
    const step = job.steps.find((s: any) =>
      s.run?.includes("staging-upgrade-readiness.mjs"),
    );
    expect(step.env.STAGING_SUPABASE_PROJECT_REF).toBe(STAGING_PROJECT);
    expect(step.env.STAGING_SCHEMA_REFERENCE_PATH).toContain(
      "staging-schema-reference.json",
    );
    expect(JSON.stringify(job)).not.toContain("SUPABASE_DB_PASSWORD");
    expect(JSON.stringify(job)).not.toContain("ALLOW_REMOTE_SUPABASE");
  });
});
