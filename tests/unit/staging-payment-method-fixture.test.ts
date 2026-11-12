import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync, privateDecrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  preparePaymentMethodFixture,
  fixtureIdentity,
  protectedOwnerQuery,
  encryptFixture,
} from "../../scripts/staging-payment-method-fixture.mjs";
const owner = "00000000-0000-4000-8000-000000000101";
const original = "00000000-0000-4000-8000-000000000099";
const sha = "a".repeat(40);
const keys = generateKeyPairSync("rsa", { modulusLength: 4096 });
const publicKey = keys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
function fixture() {
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
    STAGING_SUPABASE_PROJECT_REF: "dgogugyuyfourdttvwuy",
    SUPABASE_PROJECT_REF: "dgogugyuyfourdttvwuy",
    PADDLE_ENVIRONMENT: "sandbox",
    ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
    SUPABASE_ACCESS_TOKEN: "private-management-token",
    STAGING_PILOT_USER_ID: original,
    STAGING_FIXTURE_USER_ID: owner,
    STAGING_FIXTURE_PUBLIC_KEY: publicKey,
    RUNNER_TEMP: "/tmp/repsync-fixture-unit",
  };
  const source = {
    clean: true,
    commit: sha,
    identity: {
      manifest: { migrations: { approved: Array(188).fill({}) } },
      functions: Array(17).fill({}),
      payload: { digest: "bound-payload" },
    },
  };
  const effects: string[] = [];
  let snapshots = 0;
  const state = {
    occupied: false,
    changedAt: Infinity,
    fail: "",
    pauseFails: false,
    enableFails: false,
    wrongUser: false,
    missingKeys: false,
  };
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.redirect).toBe("error");
    expect(url).toMatch(
      /^https:\/\/(api\.supabase\.com\/v1\/projects\/dgogugyuyfourdttvwuy\/|dgogugyuyfourdttvwuy\.supabase\.co\/)/,
    );
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (state.fail && url.includes(state.fail))
      return new Response("private token or provider body", { status: 503 });
    if (url.includes("database/query/read-only")) {
      expect(body.query).not.toMatch(/\b(delete|update|insert|truncate)\s/i);
      if (body.query.includes("as occupied"))
        return Response.json([{ occupied: state.occupied }]);
      if (body.query.includes("as confirmed"))
        return Response.json([
          {
            confirmed: true,
            accounts: 1,
            workspaces: 1,
            provider_subscriptions: 0,
            paid_subscriptions: 0,
            pending_checkouts: 0,
          },
        ]);
      snapshots++;
      return Response.json([
        {
          environment: "test",
          accounts: 1,
          users: 1,
          reductions: 1,
          fingerprint: (snapshots >= state.changedAt ? "c" : "b").repeat(64),
        },
      ]);
    }
    if (url.includes("api-keys?reveal=true"))
      return Response.json(
        state.missingKeys
          ? []
          : [
              { name: "service_role", api_key: "eyJ-private-service-key" },
              { name: "anon", api_key: "eyJ-public-anon-key" },
            ],
      );
    const headers = init.headers as Record<string, string>;
    if (url.includes("auth/v1/admin/users")) {
      effects.push("create-user");
      expect(body.id).toBe(owner);
      expect(body.email).toBe(fixtureIdentity(owner).email);
      expect(body.email_confirm).toBe(true);
      expect(body.role).toBeUndefined();
      expect(headers.Authorization).toBe("Bearer eyJ-private-service-key");
      return Response.json({ id: state.wrongUser ? original : owner });
    }
    expect(headers.apikey).toBe("eyJ-public-anon-key");
    if (url.includes("token?grant_type=password"))
      return Response.json({
        user: { id: owner },
        access_token: "private-owner-token",
      });
    expect(headers.Authorization).toBe("Bearer private-owner-token");
    if (url.endsWith("pt_profiles")) {
      effects.push("profile");
      expect(body.user_id).toBe(owner);
      return Response.json([{ user_id: owner }]);
    }
    if (url.endsWith("create_workspace")) {
      effects.push("workspace");
      return Response.json([{ workspace_id: owner }]);
    }
    throw Error("unexpected endpoint");
  });
  const pilot = vi.fn(async ({ mode, env: scoped }: any) => {
    effects.push(mode);
    expect(scoped.STAGING_PILOT_USER_ID).toBe(
      mode === "pause_checkout" ? original : owner,
    );
    return {
      status:
        mode === "pause_checkout"
          ? state.pauseFails
            ? "blocked"
            : "checkout_paused"
          : state.enableFails
            ? "blocked"
            : "pilot_enabled",
    };
  });
  const saveEncrypted = vi.fn();
  const readSource = vi.fn(() => source);
  const run = () =>
    preparePaymentMethodFixture({
      env,
      source,
      transport,
      pilot,
      readSource,
      saveEncrypted,
    } as any);
  return {
    env,
    source,
    state,
    effects,
    transport,
    pilot,
    saveEncrypted,
    readSource,
    run,
  };
}
describe("reviewed isolated staging payment-method fixture", () => {
  it("encrypts only the fresh login and delegates a bounded pilot handoff", async () => {
    const f = fixture(),
      report = await f.run();
    expect(report.status).toBe("fixture_ready_for_sandbox_checkout");
    expect(report.originalPreserved).toBe(true);
    expect(report.paymentsCreated).toBe(false);
    expect(f.effects).toEqual([
      "create-user",
      "profile",
      "workspace",
      "pause_checkout",
      "enable_pilot",
    ]);
    const cipher = f.saveEncrypted.mock.calls[0][0];
    const login = JSON.parse(
      privateDecrypt(
        { key: keys.privateKey, oaepHash: "sha256" },
        Buffer.from(cipher, "base64"),
      ).toString(),
    );
    expect(login.owner).toBe(owner);
    expect(login.password.length).toBeGreaterThan(40);
    expect(login.email).toBe(fixtureIdentity(owner).email);
    expect(JSON.stringify(report)).not.toMatch(
      /eyJ|private-management|private-owner|@repsync|password/,
    );
    expect(JSON.stringify(report)).not.toContain(login.password);
    expect(
      f.transport.mock.calls.some(([url]) =>
        String(url).includes("paddle.com"),
      ),
    ).toBe(false);
  });
  it.each([
    ["GITHUB_REF", "refs/heads/main"],
    ["STAGING_PILOT_ENVIRONMENT", "production"],
    ["CONFIRM_COMMIT_SHA", "f".repeat(40)],
    ["SUPABASE_PROJECT_REF", "other"],
    ["PADDLE_ENVIRONMENT", "production"],
    ["STAGING_FIXTURE_USER_ID", original],
    ["STAGING_FIXTURE_USER_ID", "not-a-uuid"],
    ["STAGING_FIXTURE_PUBLIC_KEY", "not-a-key"],
  ])("rejects context drift %s before any writes", async (key, value) => {
    const f = fixture();
    f.env[key] = value;
    const r = await f.run();
    expect(r.status).toBe("blocked");
    expect(r.remoteWritesMayHaveOccurred).toBe(false);
    expect(f.effects).toEqual([]);
  });
  it.each(["occupied", "missingKeys"] as const)(
    "refuses %s before writes",
    async (field) => {
      const f = fixture();
      f.state[field] = true;
      const r = await f.run();
      expect(r.status).toBe("blocked");
      expect(f.effects).toEqual([]);
      expect(f.saveEncrypted).not.toHaveBeenCalled();
    },
  );
  it("retains uncertainty after an admin request without automatic retry", async () => {
    const f = fixture();
    f.state.fail = "admin/users";
    const r = await f.run();
    expect(r.remoteWritesMayHaveOccurred).toBe(true);
    expect(r.fixtureCreated).toBe(false);
    expect(f.pilot).not.toHaveBeenCalled();
    expect(
      f.transport.mock.calls.filter(([url]) =>
        String(url).includes("admin/users"),
      ),
    ).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("provider body");
    expect(f.saveEncrypted).toHaveBeenCalledTimes(1);
  });
  it.each([2, 3, 4])(
    "stops when original hashes change at preservation boundary %s",
    async (changedAt) => {
      const f = fixture();
      f.state.changedAt = changedAt;
      const r = await f.run();
      expect(r.code).toBe("FIXTURE_ORIGINAL_CHANGED");
      expect(r.originalPreserved).toBe(false);
      expect(f.pilot).toHaveBeenCalledTimes(changedAt - 2);
    },
  );
  it.each(["pauseFails", "enableFails"] as const)(
    "reports partial setup on %s without retry",
    async (field) => {
      const f = fixture();
      f.state[field] = true;
      const r = await f.run();
      expect(r.status).toBe("blocked");
      expect(r.fixtureCreated).toBe(true);
      expect(f.pilot).toHaveBeenCalledTimes(field === "pauseFails" ? 1 : 2);
    },
  );
  it("stops on mismatched created identity without onboarding or pilot changes", async () => {
    const f = fixture();
    f.state.wrongUser = true;
    const r = await f.run();
    expect(r.code).toBe("FIXTURE_CREATED_OWNER_MISMATCH");
    expect(f.effects).toEqual(["create-user"]);
  });
  it("rechecks source immediately before the first remote write", async () => {
    const f = fixture();
    f.readSource
      .mockReturnValueOnce(f.source)
      .mockReturnValue({ ...f.source, commit: "f".repeat(40) });
    const r = await f.run();
    expect(r.status).toBe("blocked");
    expect(f.effects).toEqual([]);
  });
  it("keeps retention SQL strictly scoped and rejects injected identifiers", () => {
    expect(() => protectedOwnerQuery("' or true --")).toThrow();
    expect(protectedOwnerQuery(original)).toContain("auth.users");
    expect(() =>
      encryptFixture(
        { password: "private" },
        generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({
          type: "spki",
          format: "pem",
        }),
      ),
    ).toThrow("FIXTURE_PUBLIC_KEY_INVALID");
  });
  it("retains required environment review and ciphertext-only artifact scope", () => {
    const workflow = readFileSync(
      ".github/workflows/paddle-staging-readiness.yml",
      "utf8",
    );
    const job = workflow.slice(workflow.indexOf("  payment-method-fixture:"));
    expect(job).toContain("environment: supabase-staging");
    expect(job).toContain("inputs.mode == 'prepare_payment_method_test'");
    expect(job).toContain(
      '"$RUNNER_TEMP/staging-payment-method-fixture/report.json"',
    );
    expect(job).not.toMatch(/secrets\.(?:PADDLE_LIVE|VITE_)/);
    expect(job).toContain("retention-days: 1");
  });
});
