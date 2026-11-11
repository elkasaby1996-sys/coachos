import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  inspectSandboxPayment,
  sandboxPaymentQuery,
  summarizeSandboxPayment,
} from "../../scripts/staging-sandbox-payment-status.mjs";
import { STAGING_PROJECT } from "../../scripts/staging-billing-status.mjs";

const uid = "00000000-0000-4000-8000-000000000099";
const credential = "synthetic-credential-must-not-appear";
const env = {
  STAGING_SUPABASE_PROJECT_REF: STAGING_PROJECT,
  PADDLE_ENVIRONMENT: "sandbox",
  STAGING_PILOT_USER_ID: uid,
  SUPABASE_ACCESS_TOKEN: credential,
};
function paid() {
  return {
    accountCount: 1,
    environment: "test",
    subscription: {
      kind: "paid",
      status: "active",
      plan: "growth",
      includedCoachSeats: 2,
      maxCoachSeats: 20,
      approvedExtraSeats: 0,
      storedCoachSeatLimit: 2,
      cancelAtPeriodEnd: false,
      currentPeriodEndsAt: "2026-12-10T12:00:00+00:00",
    },
    seatOperations: [] as Array<{
      status: string;
      timing: string;
      sourceExtraSeats: number;
      targetExtraSeats: number;
      effectiveAt: string | null;
      completedAt: string | null;
      error: string | null;
    }>,
    providerSubscriptions: [
      {
        status: "active",
        reconciliation: "processed",
        shadow: "current",
        linked: true,
        approvedExtraSeats: 0,
        cadence: "monthly",
        error: null,
      },
    ],
    checkouts: [
      { status: "completed", cadence: "monthly", extraSeats: 0, count: 1 },
    ],
    payments: [{ kind: "initial_purchase", count: 1 }],
    events: [
      {
        name: "transaction.completed",
        status: "processed",
        error: null,
        count: 1,
      },
    ],
    verifiedInitialPayments: 1,
  };
}
describe("single-owner sandbox payment inspection", () => {
  it("recognizes a linked paid subscription with retained signed payment evidence", () => {
    expect(summarizeSandboxPayment(paid())).toMatchObject({
      subscriptionPaymentVerified: true,
      outcome: "paid_subscription_active",
      fullPaymentSuiteVerified: false,
    });
  });
  it.each([
    "no-proof",
    "multiple-proofs",
    "trial",
    "past-due",
    "unlinked",
    "manual-review",
    "multiple-current",
    "provider-canceled",
  ])("does not certify %s", (change) => {
    const s = paid();
    if (change === "no-proof") s.verifiedInitialPayments = 0;
    if (change === "multiple-proofs") s.verifiedInitialPayments = 2;
    if (change === "trial") s.subscription.kind = "trial";
    if (change === "past-due") s.subscription.status = "past_due";
    if (change === "unlinked") s.providerSubscriptions[0].linked = false;
    if (change === "manual-review")
      s.providerSubscriptions[0].reconciliation = "manual_review";
    if (change === "multiple-current")
      s.providerSubscriptions.push(s.providerSubscriptions[0]);
    if (change === "provider-canceled")
      s.providerSubscriptions[0].status = "canceled";
    expect(summarizeSandboxPayment(s).subscriptionPaymentVerified).toBe(false);
  });
  it("reports later seat capacity without claiming the whole payment suite passed", () => {
    const s = paid();
    s.subscription.storedCoachSeatLimit = 3;
    s.subscription.approvedExtraSeats = 1;
    s.seatOperations = [
      {
        status: "scheduled",
        timing: "period_end",
        sourceExtraSeats: 1,
        targetExtraSeats: 0,
        effectiveAt: "2026-12-11T12:00:00+00:00",
        completedAt: null,
        error: null,
      },
    ];
    s.providerSubscriptions[0].approvedExtraSeats = 1;
    s.payments.push({ kind: "seat_increase", count: 1 });
    expect(summarizeSandboxPayment(s)).toMatchObject({
      subscriptionPaymentVerified: true,
      subscription: { storedCoachSeatLimit: 3, approvedExtraSeats: 1 },
      observationBasis: "stored_records",
      runtimeEntitlementsEvaluated: false,
      seatOperations: [
        {
          status: "scheduled",
          targetExtraSeats: 0,
          effectiveAt: "2026-12-11T12:00:00+00:00",
        },
      ],
      fullPaymentSuiteVerified: false,
    });
  });
  it("distinguishes missing accounts and checkout not started", () => {
    const s = {
      ...paid(),
      accountCount: 0,
      subscription: null,
      seatOperations: [] as Array<{
        status: string;
        timing: string;
        sourceExtraSeats: number;
        targetExtraSeats: number;
        effectiveAt: string | null;
        completedAt: string | null;
        error: string | null;
      }>,
      providerSubscriptions: [],
      checkouts: [],
      payments: [],
      events: [],
      verifiedInitialPayments: 0,
    };
    expect(summarizeSandboxPayment(s).outcome).toBe("account_missing");
    expect(summarizeSandboxPayment({ ...s, accountCount: 1 }).outcome).toBe(
      "checkout_not_started",
    );
  });
  it.each(["';drop table auth.users;--", "", "not-a-uuid", uid + "\n"])(
    "rejects invalid owner input",
    (value) => {
      expect(() => sandboxPaymentQuery(value)).toThrow(
        "PAYMENT_STATUS_OWNER_INVALID",
      );
    },
  );
  it("uses one bounded read-only request to the fixed staging target", async () => {
    const transport = vi.fn(async (url, init) => {
      expect(url).toBe(
        `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/database/query/read-only`,
      );
      expect(init.redirect).toBe("error");
      expect(JSON.parse(init.body).query).toBe(sandboxPaymentQuery(uid));
      return Response.json([{ payment_status: paid() }]);
    });
    const r = await inspectSandboxPayment({ env, transport });
    expect(r).toMatchObject({
      status: "inspected",
      readOnly: true,
      payment: { subscriptionPaymentVerified: true },
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(JSON.stringify(r)).not.toContain(credential);
    expect(JSON.stringify(r)).not.toContain(uid);
    expect(sandboxPaymentQuery(uid)).not.toMatch(
      /\b(insert|update|delete|alter|drop|truncate|grant|revoke)\b/i,
    );
  });
  it.each([
    ["STAGING_SUPABASE_PROJECT_REF", "btrfmxjpjzbyowtvncnc"],
    ["PADDLE_ENVIRONMENT", "live"],
    ["STAGING_PILOT_USER_ID", "invalid"],
    ["SUPABASE_ACCESS_TOKEN", ""],
  ])("fails before network access for invalid %s", async (key, value) => {
    const transport = vi.fn();
    const r = await inspectSandboxPayment({
      env: { ...env, [key]: value },
      transport,
    });
    expect(r.status).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
  });
  it("rejects live facts, extra identity fields and malformed observations", () => {
    expect(() =>
      summarizeSandboxPayment({ ...paid(), environment: "live" }),
    ).toThrow("PAYMENT_STATUS_RESPONSE_INVALID");
    expect(() =>
      summarizeSandboxPayment({ ...paid(), ownerEmail: credential }),
    ).toThrow("PAYMENT_STATUS_RESPONSE_INVALID");
    expect(() =>
      summarizeSandboxPayment({ ...paid(), verifiedInitialPayments: -1 }),
    ).toThrow("PAYMENT_STATUS_RESPONSE_INVALID");
  });
  it("does not leak HTTP bodies, raw exceptions or unexpected account fields", async () => {
    for (const transport of [
      async () => new Response(credential, { status: 401 }),
      async () => {
        throw new Error(credential);
      },
      async () =>
        Response.json([{ payment_status: { ...paid(), raw: credential } }]),
    ]) {
      const r = await inspectSandboxPayment({ env, transport });
      expect(r.status).toBe("blocked");
      expect(JSON.stringify(r)).not.toContain(credential);
    }
  });
  it.each(["resolve_account_entitlements", "billing_seat_effective_limit"])(
    "classifies permission failure for %s without sharing raw context",
    async (dependency) => {
      for (const body of [
        {
          code: "42501",
          message: `permission denied for function ${dependency}`,
          details: credential,
          query: sandboxPaymentQuery(uid),
        },
        {
          message: `Failed to run sql query: ERROR: 42501: permission denied for function public.${dependency}(uuid)\nCONTEXT: ${uid} ${credential}`,
        },
      ]) {
        const r = await inspectSandboxPayment({
          env,
          transport: async () => Response.json(body, { status: 400 }),
        });
        expect(r).toMatchObject({
          status: "blocked",
          code: "PAYMENT_STATUS_DATABASE_ERROR",
          httpStatus: 400,
          diagnostic: {
            category: "insufficient_privilege",
            sqlstate: "42501",
            dependency,
          },
        });
        expect(JSON.stringify(r)).not.toContain(uid);
        expect(JSON.stringify(r)).not.toContain(credential);
        expect(JSON.stringify(r)).not.toContain("select");
      }
    },
  );
  it.each([
    ["42P01", "undefined_table"],
    ["42703", "undefined_column"],
    ["25006", "read_only_violation"],
    ["57014", "query_canceled"],
    ["21000", "cardinality_violation"],
  ])("retains safe SQLSTATE %s", async (code, category) => {
    const r = await inspectSandboxPayment({
      env,
      transport: async () =>
        Response.json(
          { code, message: `${uid} ${credential}` },
          { status: 400 },
        ),
    });
    expect(r.diagnostic).toEqual({ category, sqlstate: code });
    expect(JSON.stringify(r)).not.toContain(credential);
  });
  it("bounds and redacts malformed, non-JSON, oversized and unrecognized errors", async () => {
    for (const response of [
      new Response(`${credential} ${uid}`, { status: 502 }),
      new Response("{", {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
      Response.json({ code: "SECRET", message: credential }, { status: 400 }),
      Response.json(
        { code: "42501", message: "x".repeat(17000) + uid },
        { status: 400 },
      ),
      Response.json({ message: `42501 ${uid} ${credential}` }, { status: 400 }),
      Response.json(
        {
          code: "42501",
          message: `permission denied for function ${credential}`,
        },
        { status: 400 },
      ),
    ]) {
      const r = await inspectSandboxPayment({
        env,
        transport: async () => response,
      });
      expect(r.status).toBe("blocked");
      expect(JSON.stringify(r)).not.toContain(uid);
      expect(JSON.stringify(r)).not.toContain(credential);
      expect(r.diagnostic).not.toHaveProperty("dependency");
    }
  });
  it("projects stored records without executing private entitlement helpers", () => {
    const query = sandboxPaymentQuery(uid);
    expect(query).not.toMatch(
      /public\.(resolve_account_entitlements|billing_seat_effective_limit)\s*\(/,
    );
    expect(query).toContain("public.account_subscriptions");
    expect(query).toContain("public.billing_operations_v2");
    expect(query).not.toMatch(/\b(grant|revoke|update|insert|delete)\b/i);
  });
  it("routes the optional owner through the existing protected inspect job", () => {
    const w = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(".github/workflows/paddle-staging-readiness.yml", "utf8"),
    );
    const read = w.jobs.catalogue.steps.find(
      (s: any) => s.env?.SUPABASE_ACCESS_TOKEN,
    );
    expect(read.env.STAGING_PILOT_USER_ID).toBe("${{ inputs.pilot_user_id }}");
    expect(w.jobs.catalogue.environment).toBe("supabase-staging");
    expect(JSON.stringify(w.jobs.catalogue)).not.toMatch(
      /ALLOW_REMOTE_SUPABASE|SUPABASE_DB_PASSWORD|secrets set|db push/,
    );
  });
});
