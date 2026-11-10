import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  PILOT_SNAPSHOT_QUERY,
  PAUSE_CHECKOUT_QUERY,
  pilotOwnerQuery,
  pilotPolicyQuery,
  runSandboxPilot,
  validatePilotOwner,
} from "../../scripts/staging-sandbox-pilot.mjs";
import {
  STAGING_PROJECT,
  STAGING_ORIGIN,
} from "../../scripts/staging-billing-status.mjs";
import { guardedArgs } from "../../scripts/supabase-remote-guard.mjs";

const uid = "00000000-0000-4000-8000-000000000099";
const secret = "synthetic-credential-never-logged";
const sha = "a".repeat(40);
const fingerprint = "b".repeat(64);
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
function fixture(mode = "enable_pilot") {
  const env: Record<string, string> = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "elkasaby1996-sys/coachos",
    GITHUB_REF: "refs/heads/Ahmed-billing",
    GITHUB_WORKFLOW: "Paddle Staging Readiness",
    GITHUB_WORKFLOW_REF:
      "elkasaby1996-sys/coachos/.github/workflows/paddle-staging-readiness.yml@refs/heads/Ahmed-billing",
    STAGING_PILOT_ENVIRONMENT: "supabase-staging",
    GITHUB_SHA: sha,
    CONFIRM_COMMIT_SHA: sha,
    STAGING_SUPABASE_PROJECT_REF: STAGING_PROJECT,
    SUPABASE_PROJECT_REF: STAGING_PROJECT,
    PADDLE_ENVIRONMENT: "sandbox",
    ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
    SUPABASE_ACCESS_TOKEN: secret,
    STAGING_PILOT_USER_ID: uid,
    PADDLE_SANDBOX_API_KEY: secret,
    SUPABASE_DB_PASSWORD: "must-not-inherit-db-password",
  };
  const source = {
    clean: true,
    commit: sha,
    identity: {
      manifest: { migrations: { approved: Array(188).fill({}) } },
      functions: Array(17).fill({}),
      payload: { digest: "payload" },
    },
  };
  const settings: Record<string, string> = {
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_CHECKOUT_ACCESS_MODE: "disabled",
    PADDLE_SANDBOX_PAYMENT_PAGE_URL: `${STAGING_ORIGIN}/billing/checkout`,
  };
  const owner = {
    confirmed: true,
    accounts: 1,
    workspaces: 1,
    provider_subscriptions: 0,
    paid_subscriptions: 0,
    pending_checkouts: 0,
  };
  const inventory = {
    status: "inspected",
    project: STAGING_PROJECT,
    migrations: { appliedCount: 188, matchesApprovedVersionPrefix: true },
    functions: { missing: [] as string[], inactive: [], jwtMismatch: [] },
    configuration: { missingServerSettings: [], livePaddleSettingCount: 0 },
    billingPolicy: {
      environment: "test",
      salesEnabled: false,
      reconciliationEnabled: false,
    },
  };
  const catalogue = {
    readiness: "existing_mappings_match_provider_facts",
    matchedActiveMappings: 8,
  };
  const events: string[] = [];
  const execute = vi.fn((command: string, args: string[], options: any) => {
    expect(options.shell).toBe(false);
    expect(options.env.SUPABASE_DB_PASSWORD).toBeUndefined();
    expect(options.env.PADDLE_SANDBOX_API_KEY).toBeUndefined();
    if (command === "supabase") return { status: 0, stdout: "2.109.1\n" };
    events.push("settings-write");
    expect(args[0]).toMatch(/scripts\/supabase-remote-guard.mjs$/);
    expect(guardedArgs(args.slice(1), options.env)).toEqual(args.slice(1));
    for (const a of args.slice(3)) {
      const n = a.indexOf("=");
      if (n > 0) settings[a.slice(0, n)] = a.slice(n + 1);
    }
    return { status: 0, stdout: secret, stderr: secret };
  });
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    expect(
      url.startsWith(
        `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/`,
      ),
    ).toBe(true);
    expect(init.redirect).toBe("error");
    if (url.endsWith("/secrets")) {
      events.push("settings-read");
      return Response.json(
        Object.entries(settings).map(([name, value]) => ({
          name,
          value: digest(value),
        })),
      );
    }
    const query = JSON.parse(init.body as string).query;
    if (url.endsWith("/database/query")) {
      events.push("policy-write");
      expect(query).toBe(
        mode === "enable_pilot"
          ? pilotPolicyQuery(uid, fingerprint)
          : PAUSE_CHECKOUT_QUERY,
      );
      return Response.json([]);
    }
    if (query === pilotOwnerQuery(uid)) return Response.json([owner]);
    if (query === PILOT_SNAPSHOT_QUERY) return Response.json([{ fingerprint }]);
    return Response.json([
      {
        environment: "test",
        sales: mode === "enable_pilot",
        reconciliation:
          mode === "enable_pilot" ||
          inventory.billingPolicy.reconciliationEnabled,
      },
    ]);
  });
  const readiness = vi.fn(async () => {
    events.push("provider-readiness");
    return { status: "inspected", catalogue };
  });
  const readSource = vi.fn(() => structuredClone(source));
  const run = () =>
    runSandboxPilot({
      mode,
      env,
      readSource,
      transport,
      execute,
      inspect: async () => inventory,
      readiness,
    });
  return {
    env,
    source,
    settings,
    owner,
    inventory,
    catalogue,
    events,
    execute,
    transport,
    readiness,
    readSource,
    run,
  };
}

describe("staging pilot activation", () => {
  it("verifies owner, fresh prices and setting digests before the atomic policy write", async () => {
    const f = fixture();
    const result = await f.run();
    expect(result).toMatchObject({
      status: "pilot_enabled",
      checkoutConfigured: true,
      policyConfigured: true,
      policy: { environment: "test", sales: true, reconciliation: true },
      paymentsVerified: false,
    });
    expect(f.events).toEqual([
      "settings-read",
      "provider-readiness",
      "settings-write",
      "settings-read",
      "policy-write",
    ]);
    expect(f.settings.PADDLE_CHECKOUT_PILOT_USER_ID).toBe(uid);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(uid);
  });
  it.each([
    ["GITHUB_EVENT_NAME", "push"],
    ["GITHUB_REF", "refs/heads/main"],
    [
      "GITHUB_WORKFLOW_REF",
      "fork/repo/.github/workflows/paddle-staging-readiness.yml@refs/heads/Ahmed-billing",
    ],
    ["STAGING_PILOT_ENVIRONMENT", "production"],
    ["CONFIRM_COMMIT_SHA", "c".repeat(40)],
    ["SUPABASE_PROJECT_REF", "btrfmxjpjzbyowtvncnc"],
    ["STAGING_SUPABASE_PROJECT_REF", "exmrksgdikfprtfeltzu"],
    ["PADDLE_ENVIRONMENT", "live"],
    ["ALLOW_REMOTE_SUPABASE", ""],
    ["STAGING_PILOT_USER_ID", "'; delete from auth.users;--"],
  ])(
    "blocks unauthorized context %s before any remote access",
    async (key, value) => {
      const f = fixture();
      f.env[key] = value;
      expect((await f.run()).status).toBe("blocked");
      expect(f.transport).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it.each([
    "confirmed",
    "accounts",
    "workspaces",
    "pending_checkouts",
    "paid_subscriptions",
    "provider_subscriptions",
  ])("blocks an ineligible owner: %s", async (key) => {
    const f = fixture();
    (f.owner as any)[key] =
      key === "confirmed"
        ? false
        : ["accounts", "workspaces"].includes(key)
          ? 0
          : 1;
    expect((await f.run()).status).toBe("blocked");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.readiness).not.toHaveBeenCalled();
  });
  it("rejects incomplete backend and unmapped provider prices without writes", async () => {
    const f = fixture();
    f.inventory.functions.missing.push("billing-paddle-webhook");
    expect((await f.run()).code).toBe("PILOT_BACKEND_NOT_READY");
    expect(f.transport).not.toHaveBeenCalled();
    f.inventory.functions.missing = [];
    f.catalogue.matchedActiveMappings = 7;
    expect((await f.run()).code).toBe("PILOT_CATALOGUE_NOT_READY");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each([
    ["PADDLE_ENVIRONMENT", "live"],
    ["PADDLE_CHECKOUT_ACCESS_MODE", "all"],
    [
      "PADDLE_SANDBOX_PAYMENT_PAGE_URL",
      "https://production.example.test/billing/checkout",
    ],
    ["PADDLE_LIVE_API_KEY", secret],
    ["PADDLE_API_BASE_URL", "https://example.test"],
  ])("blocks runtime drift %s without writes", async (key, value) => {
    const f = fixture();
    f.settings[key] = value;
    expect((await f.run()).status).toBe("blocked");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("does not replace another pilot account", async () => {
    const f = fixture();
    f.settings.PADDLE_CHECKOUT_ACCESS_MODE = "pilot";
    f.settings.PADDLE_CHECKOUT_PILOT_USER_ID =
      "00000000-0000-4000-8000-000000000098";
    expect((await f.run()).code).toBe("PILOT_CHECKOUT_SCOPE_MISMATCH");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("stops before policy activation when the CLI fails or setting confirmation differs", async () => {
    const f = fixture();
    f.execute.mockImplementation((command: string) =>
      command === "supabase"
        ? { status: 0, stdout: "2.109.1" }
        : { status: 1, stdout: secret },
    );
    expect(await f.run()).toMatchObject({
      code: "PILOT_SETTING_UPDATE_FAILED",
      remoteWritesMayHaveOccurred: true,
      policyConfigured: false,
    });
    expect(f.events).not.toContain("policy-write");
    f.execute.mockImplementation(() => ({ status: 0, stdout: "2.109.1" }));
    expect((await f.run()).code).toBe("PILOT_CHECKOUT_SCOPE_MISMATCH");
    expect(f.events).not.toContain("policy-write");
  });
  it("keeps checkout paused and reconciliation enabled for in-flight payments", async () => {
    const f = fixture("pause_checkout");
    f.settings.PADDLE_CHECKOUT_ACCESS_MODE = "pilot";
    f.settings.PADDLE_CHECKOUT_PILOT_USER_ID = uid;
    f.inventory.billingPolicy.reconciliationEnabled = true;
    expect(await f.run()).toMatchObject({
      status: "checkout_paused",
      policy: { sales: false, reconciliation: true },
    });
    expect(f.readiness).not.toHaveBeenCalled();
    expect(PAUSE_CHECKOUT_QUERY).not.toMatch(
      /set.*paddle_reconciliation_enabled/,
    );
  });
  it("reports uncertain HTTP writes without exposing their body or retrying", async () => {
    const f = fixture();
    const transport = f.transport.getMockImplementation()!;
    f.transport.mockImplementation(async (url, init) =>
      url.endsWith("/database/query")
        ? new Response(secret, { status: 500 })
        : transport(url, init),
    );
    const result = await f.run();
    expect(result).toMatchObject({
      status: "blocked",
      httpStatus: 500,
      remoteWritesMayHaveOccurred: true,
      checkoutConfigured: true,
      policyConfigured: false,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(
      f.transport.mock.calls.filter(([u]) => u.endsWith("/database/query")),
    ).toHaveLength(1);
  });
  it("rechecks source immediately before writes", async () => {
    const f = fixture();
    const originalSource = structuredClone(f.source);
    f.readSource.mockImplementationOnce(() => originalSource);
    f.source.clean = false;
    expect((await f.run()).code).toBe("PILOT_COMMIT_MISMATCH");
    expect(f.readiness).toHaveBeenCalledOnce();
    expect(f.events).not.toContain("settings-write");
  });
  it("rejects malformed SQL inputs and fails closed on missing owner observations", () => {
    expect(() => pilotOwnerQuery("not-a-uuid")).toThrow(
      "PILOT_USER_ID_INVALID",
    );
    expect(() => pilotPolicyQuery(uid, "';update--")).toThrow(
      "PILOT_SNAPSHOT_INVALID",
    );
    expect(() => validatePilotOwner([])).toThrow(
      "PILOT_OWNER_RESPONSE_INVALID",
    );
  });
  it("offers explicit protected dispatch; pushes cannot activate or inspect remotely", () => {
    const workflow = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(".github/workflows/paddle-staging-readiness.yml", "utf8"),
    );
    expect(workflow.on.workflow_dispatch.inputs.mode.default).toBe("inspect");
    expect(workflow.jobs.pilot.environment).toBe("supabase-staging");
    expect(workflow.jobs.pilot.needs).toBe("validate");
    const applyStep = workflow.jobs.pilot.steps.find(
      (step: any) => step.env?.STAGING_PILOT_MODE,
    );
    expect(applyStep.run).toContain(
      '> "$RUNNER_TEMP/staging-sandbox-pilot/pilot-report.json"',
    );
    expect(workflow.jobs.pilot.steps.at(-1).with.path).toBe(
      "${{ runner.temp }}/staging-sandbox-pilot/pilot-report.json",
    );
    expect(workflow.jobs.pilot.if).toContain(
      "github.event_name == 'workflow_dispatch'",
    );
    expect(workflow.jobs.catalogue.if).toContain(
      "github.event_name == 'workflow_dispatch'",
    );
    expect(JSON.stringify(workflow.jobs.validate)).not.toContain("secrets.");
    expect(JSON.stringify(workflow)).not.toMatch(
      /SUPABASE_DB_PASSWORD|functions deploy|db push/,
    );
  });
});
