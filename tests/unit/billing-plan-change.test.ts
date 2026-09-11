import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  handlePlanChange,
  planChangeRequest,
} from "../../supabase/functions/_shared/billing-plan-change";
import {
  BillingError,
  createLemonSqueezyProvider,
  normalizePaymentProcessor,
  subscriptionVariantRequest,
  type SubscriptionSnapshot,
} from "../../supabase/functions/_shared/lemon-squeezy";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";
import {
  planChangePreviewSchema,
  safePlanChangeError,
} from "../../src/features/billing/plan-change-contracts";
const input = {
  targetPlanKey: "growth",
  targetCadence: "monthly",
  operationId: "a0700000-0000-4000-8000-000000000001",
};
const snapshot: SubscriptionSnapshot = {
  provider: "lemonsqueezy",
  environment: "test",
  store_id: "1",
  customer_id: "2",
  subscription_id: "3",
  product_id: "4",
  variant_id: "5",
  price_id: "6",
  order_id: "7",
  order_item_id: "8",
  first_subscription_item_id: "9",
  quantity: 1,
  status: "active",
  cancelled: false,
  renews_at: "2027-01-01T00:00:00Z",
  ends_at: null,
  trial_ends_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-09-11T00:00:00Z",
  payment_processor: "card",
};
function fixture() {
  let current = { ...snapshot };
  const update = vi.fn(async () => {
    current = { ...current, variant_id: "15", price_id: "16" };
    return current;
  });
  const service = vi.fn(async (name: string) => {
    if (name === "billing_plan_change_context")
      return {
        subscription: {
          provider_subscription_id: "3",
          provider_customer_id: "2",
          provider_store_id: "1",
          provider_variant_id: "5",
          provider_price_id: "6",
        },
      };
    if (
      name === "begin_billing_plan_change" ||
      name === "begin_cancel_billing_plan_change"
    )
      return {
        id: "op",
        dispatch: true,
        variant: "15",
        product: "4",
        price: "16",
        timing: "immediate",
      };
    if (name === "finish_billing_plan_change") return "processed";
    return {};
  });
  const deps: BillingDependencies = {
    authenticate: async () => ({ id: "owner" }),
    config: () => ({
      environment: "test",
      appBaseUrl: "http://localhost",
      webhookSecret: "fake",
      provider: {
        createCheckout: async () => {
          throw new Error("unused");
        },
        retrieveSubscription: async () => current,
        updateSubscriptionVariant: update,
      },
    }),
    ownerRpc: () => async () => ({
      linked: true,
      cadence: "monthly",
      eligible: false,
      operation: { status: "awaiting_payment" },
    }),
    serviceRpc: service,
    log: vi.fn(),
  };
  const request = (body: unknown = input) =>
    new Request("http://local.test", {
      method: "POST",
      headers: { authorization: "Bearer fake" },
      body: JSON.stringify(body),
    });
  return {
    deps,
    request,
    update,
    service,
    setCurrent: (value: SubscriptionSnapshot) => {
      current = value;
    },
  };
}
describe("controlled plan change boundary", () => {
  it("retrieves only this subscription's invoices and discards PII", async () => {
    const transport = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                type: "subscription-invoices",
                id: "44",
                attributes: {
                  store_id: 1,
                  subscription_id: 3,
                  customer_id: 2,
                  test_mode: true,
                  billing_reason: "updated",
                  status: "paid",
                  created_at: snapshot.created_at,
                  updated_at: snapshot.updated_at,
                  user_email: "private@example.test",
                  urls: { invoice_url: "secret" },
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const p = createLemonSqueezyProvider("fake", transport);
    const invoices = await p.listSubscriptionInvoices!("3");
    expect(transport).toHaveBeenCalledWith(
      expect.stringContaining("filter[subscription_id]=3"),
      expect.anything(),
    );
    expect(JSON.stringify(invoices)).not.toMatch(
      /private@example|invoice_url|secret|44/,
    );
    expect(invoices[0]).toMatchObject({
      billing_reason: "updated",
      status: "paid",
      subscription_id: "3",
    });
  });
  it.each([
    "subscriptionId",
    "amount",
    "currency",
    "invoice_immediately",
    "disable_prorations",
    "classification",
    "effectiveAt",
    "billingAccountId",
    "sourcePlan",
    "paymentProcessor",
  ])("rejects browser %s", (key) =>
    expect(() => planChangeRequest({ ...input, [key]: "forged" })).toThrow(
      "BILLING_INVALID_INPUT",
    ),
  );
  it.each([
    ["stripe", "card"],
    ["paypal", "paypal"],
    ["wallet", "unknown"],
    [undefined, "unknown"],
  ])("normalizes %s conservatively", (raw, expected) =>
    expect(normalizePaymentProcessor(raw)).toBe(expected),
  );
  it.each(["immediate", "period_end"] as const)(
    "builds exact %s PATCH attributes",
    (timing) => {
      expect(subscriptionVariantRequest("3", "15", timing)).toEqual({
        data: {
          type: "subscriptions",
          id: "3",
          attributes: {
            variant_id: 15,
            invoice_immediately: timing === "immediate",
            disable_prorations: timing === "period_end",
          },
        },
      });
    },
  );
  it("preview never begins or mutates", async () => {
    const f = fixture();
    expect(
      (await handlePlanChange(f.request(), f.deps, "preview")).status,
    ).toBe(200);
    expect(f.update).not.toHaveBeenCalled();
    expect(f.service.mock.calls.map((c) => c[0])).toEqual([
      "billing_plan_change_context",
      "preview_billing_plan_change",
    ]);
  });
  it("denies anonymous before provider access", async () => {
    const f = fixture();
    f.deps.authenticate = async () => null;
    expect((await handlePlanChange(f.request(), f.deps, "apply")).status).toBe(
      401,
    );
    expect(f.service).not.toHaveBeenCalled();
  });
  it("PayPal never creates an operation or calls PATCH", async () => {
    const f = fixture();
    f.setCurrent({ ...snapshot, payment_processor: "paypal" });
    const r = await handlePlanChange(f.request(), f.deps, "apply");
    expect(await r.json()).toEqual({
      code: "BILLING_PLAN_CHANGE_PAYPAL_UNSUPPORTED",
    });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.service.mock.calls).toHaveLength(1);
  });
  it("persists dispatch before provider mutation", async () => {
    const f = fixture();
    const r = await handlePlanChange(f.request(), f.deps, "apply");
    expect(r.status).toBe(200);
    expect(f.service.mock.calls.map((c) => c[0])).toEqual([
      "billing_plan_change_context",
      "begin_billing_plan_change",
      "finish_billing_plan_change",
    ]);
    expect(await r.json()).not.toHaveProperty("variant");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("replay never calls PATCH", async () => {
    const f = fixture();
    const original = f.deps.serviceRpc;
    f.deps.serviceRpc = async (n, a) =>
      n === "begin_billing_plan_change"
        ? { id: "op", dispatch: false }
        : original(n, a);
    await handlePlanChange(f.request(), f.deps, "apply");
    expect(f.update).not.toHaveBeenCalled();
  });
  it("capacity denial never calls PATCH", async () => {
    const f = fixture();
    const original = f.deps.serviceRpc;
    f.deps.serviceRpc = async (n, a) => {
      if (n === "begin_billing_plan_change")
        throw new BillingError("BILLING_PLAN_CHANGE_CAPACITY_BLOCKED", 409);
      return original(n, a);
    };
    expect((await handlePlanChange(f.request(), f.deps, "apply")).status).toBe(
      409,
    );
    expect(f.update).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "persists provider ambiguous=%s without raw error",
    async (ambiguous) => {
      const f = fixture();
      f.update.mockRejectedValue(
        new BillingError(
          ambiguous
            ? "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS"
            : "BILLING_PLAN_CHANGE_PROVIDER_FAILED",
          503,
          ambiguous,
        ),
      );
      const r = await handlePlanChange(f.request(), f.deps, "apply");
      expect(r.status).toBe(503);
      expect(f.service).toHaveBeenCalledWith("fail_billing_plan_change", {
        p_owner: "owner",
        p_operation: "op",
        p_ambiguous: ambiguous,
      });
    },
  );
  it("rejects mismatched PATCH response", async () => {
    const f = fixture();
    f.update.mockResolvedValue({ ...snapshot, customer_id: "999" });
    const r = await handlePlanChange(f.request(), f.deps, "apply");
    expect(await r.json()).toEqual({
      code: "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS",
    });
    expect(f.service.mock.calls.map((c) => c[0])).not.toContain(
      "finish_billing_plan_change",
    );
  });
  it("provider adapter uses PATCH and marks timeout ambiguous", async () => {
    const transport = vi.fn(async () => {
      throw new Error("secret signed URL");
    });
    const p = createLemonSqueezyProvider("fake", transport);
    await expect(
      p.updateSubscriptionVariant!("3", "15", "immediate"),
    ).rejects.toMatchObject({
      code: "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS",
      ambiguous: true,
    });
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      cache: "no-store",
    });
  });
  it("safe frontend errors cannot render raw provider data", () =>
    expect(
      safePlanChangeError({ message: "secret", code: "raw" }).message,
    ).not.toContain("secret"));
  it("rejects provider identifiers in previews", () =>
    expect(
      planChangePreviewSchema.safeParse({ provider_subscription_id: "3" })
        .success,
    ).toBe(false));
  it.each([
    "src/lib/auth.tsx",
    "src/lib/theme.ts",
    "src/routes/app.tsx",
    "src/lib/auth-callback.ts",
    "src/pages/public/login.tsx",
  ])("does not couple provider plan change state to %s", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(
      /from\s+["'][^"']*(?:plan-change-api|billing-plan-change|plan-change-panel)/,
    );
  });
});
