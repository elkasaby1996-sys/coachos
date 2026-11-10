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
      effectiveCoachSeatLimit: 2,
      currentPeriodEndsAt: "2026-12-10T12:00:00+00:00",
    },
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
    s.subscription.effectiveCoachSeatLimit = 3;
    s.providerSubscriptions[0].approvedExtraSeats = 1;
    s.payments.push({ kind: "seat_increase", count: 1 });
    expect(summarizeSandboxPayment(s)).toMatchObject({
      subscriptionPaymentVerified: true,
      subscription: { effectiveCoachSeatLimit: 3 },
      fullPaymentSuiteVerified: false,
    });
  });
  it("distinguishes missing accounts and checkout not started", () => {
    const s = {
      ...paid(),
      accountCount: 0,
      subscription: null,
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
