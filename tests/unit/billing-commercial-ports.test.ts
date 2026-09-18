import { configureTestBillingPorts } from "./helpers/billing-test-ports";
import { createLemonSqueezyCommercialPorts } from "../../supabase/functions/_shared/lemon-squeezy-reconciliation";
import type {
  VerifiedSubscription,
  VerifiedInvoice,
  VerifiedEvent,
} from "../../supabase/functions/_shared/billing-commercial-ports";
import { canonicalSubscriptionIdentity } from "../../supabase/functions/_shared/billing-legacy-records";
import { createHmac } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  handleBillingWebhook,
  type BillingConfig,
  type BillingDependencies,
} from "../../supabase/functions/_shared/billing-handlers";
import { handlePlanChange } from "../../supabase/functions/_shared/billing-plan-change";
import { handleSeatQuantity } from "../../supabase/functions/_shared/billing-seat-quantity";
import { handleCustomerPortalLink } from "../../supabase/functions/_shared/billing-portal";
import {
  type BillingProvider,
  type SubscriptionSnapshot,
} from "../../supabase/functions/_shared/lemon-squeezy";

// Synthetic fixtures only. These snapshots are captured from merged ADAPTER-01
// before changing handlers; they lock responses, request order and exact RPC proof.
const stamp = "2026-09-18T00:00:00.000Z";
const uuid = "a0700000-0000-4000-8000-000000000001";
const secret = "synthetic-proof-secret";
function configure(config: BillingConfig): BillingConfig {
  return configureTestBillingPorts(config);
}
export function commercialFixture() {
  let current: SubscriptionSnapshot = {
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
    renews_at: "2027-01-01T00:00:00.000Z",
    ends_at: null,
    trial_ends_at: null,
    created_at: stamp,
    updated_at: stamp,
    payment_processor: "card",
  };
  const trace: unknown[] = [];
  const item = () => ({
    item_id: "9",
    subscription_id: "3",
    price_id: current.price_id,
    quantity: current.quantity,
    is_usage_based: false as const,
    created_at: stamp,
    updated_at: stamp,
  });
  const invoice = {
    store_id: "1",
    subscription_id: "3",
    customer_id: "2",
    test_mode: true,
    billing_reason: "updated",
    status: "paid",
    created_at: stamp,
    updated_at: stamp,
  };
  const link = {
    provider: "lemonsqueezy",
    environment: "test",
    store_id: "1",
    customer_id: "2",
    subscription_id: "3",
    local_subscription_id: uuid,
    local_status: "past_due",
  };
  const provider: BillingProvider = {
    createCheckout: vi.fn(),
    retrieveSubscription: vi.fn(async (id) => {
      trace.push(["getSubscription", id]);
      return { ...current };
    }),
    retrieveSubscriptionItem: vi.fn(async (id) => {
      trace.push(["getItem", id]);
      return item();
    }),
    listSubscriptionInvoices: vi.fn(async (id) => {
      trace.push(["getInvoices", id]);
      return [{ ...invoice, status: "pending" }, invoice];
    }),
    updateSubscriptionVariant: vi.fn(async (id, variant, timing) => {
      trace.push(["changePlan", id, variant, timing]);
      current = { ...current, variant_id: variant, price_id: "16" };
      return { ...current };
    }),
    updateSubscriptionItemQuantity: vi.fn(async (id, quantity, timing) => {
      trace.push(["changeQuantity", id, quantity, timing]);
      current = { ...current, quantity };
      return item();
    }),
    retrieveSubscriptionForPortal: vi.fn(async (id) => {
      trace.push(["getPortal", id]);
      return {
        ...link,
        provider: "lemonsqueezy" as const,
        environment: "test" as const,
        status: "past_due",
        customerPortal:
          "https://fixture.lemonsqueezy.com/billing?opaque=synthetic-only",
        updatePaymentMethod:
          "https://fixture.lemonsqueezy.com/subscription/3/payment-details?opaque=synthetic-only",
      };
    }),
  };
  const serviceRpc = vi.fn(
    async (name: string, args: Record<string, unknown>) => {
      trace.push([name, structuredClone(args)]);
      if (name === "get_billing_provider_store") return "1";
      if (name === "record_billing_webhook_delivery")
        return "synthetic-delivery";
      if (name === "get_billing_portal_subscription") return { ...link };
      if (name.endsWith("_context"))
        return {
          subscription: {
            provider_subscription_id: "3",
            provider_customer_id: "2",
            provider_store_id: "1",
            provider_variant_id: "5",
            provider_price_id: "6",
            first_subscription_item_id: "9",
            approved_additional_coach_seats: 0,
          },
        };
      if (name.startsWith("begin_"))
        return {
          id: uuid,
          dispatch: true,
          variant: "15",
          product: "4",
          price: "16",
          quantity: 2,
          timing: "immediate",
        };
      if (name.startsWith("finish_") || name.startsWith("reconcile_"))
        return "processed";
      return { synthetic: "state" };
    },
  );
  const config: BillingConfig = {
    environment: "test",
    appBaseUrl: "https://app.test",
    webhookSecret: secret,
    provider,
    portalAllowedHosts: "fixture.lemonsqueezy.com",
  };
  const deps: BillingDependencies = {
    config: () => configure(config),
    authenticate: async () => ({ id: "synthetic-owner" }),
    serviceRpc,
    ownerRpc: () => async (name, args) => {
      trace.push([name, args]);
      return { synthetic: "state" };
    },
    log: vi.fn(),
  };
  return {
    deps,
    provider,
    config,
    serviceRpc,
    trace,
    current: () => current,
    setCurrent: (next: Partial<SubscriptionSnapshot>) => {
      current = { ...current, ...next };
    },
  };
}
function request(body: unknown) {
  return new Request("https://local.test", {
    method: "POST",
    headers: { authorization: "Bearer synthetic" },
    body: JSON.stringify(body),
  });
}
function event(name: string, spaced = false) {
  const raw = JSON.stringify(
    {
      meta: { event_name: name },
      data: {
        type: "subscriptions",
        id: "3",
        attributes: {
          store_id: 1,
          customer_id: 2,
          order_id: 7,
          order_item_id: 8,
          product_id: 4,
          variant_id: 5,
          test_mode: true,
          status: "active",
          cancelled: false,
          renews_at: "2027-01-01T00:00:00Z",
          ends_at: null,
          trial_ends_at: null,
          created_at: stamp,
          updated_at: stamp,
        },
      },
    },
    null,
    spaced ? 2 : undefined,
  );
  return new Request("https://local.test", {
    method: "POST",
    body: raw,
    headers: {
      "x-event-name": name,
      "x-signature": createHmac("sha256", secret).update(raw).digest("hex"),
    },
  });
}
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network forbidden");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
describe("merged ADAPTER-01 durable parity", () => {
  it.each(["preview", "apply", "cancel", "refresh"] as const)(
    "plan %s",
    async (action) => {
      const f = commercialFixture();
      const body =
        action === "refresh"
          ? {}
          : action === "cancel"
            ? { operationId: uuid }
            : {
                operationId: uuid,
                targetPlanKey: "growth",
                targetCadence: "monthly",
              };
      const response = await handlePlanChange(request(body), f.deps, action);
      expect(response.status).toBe(200);
      expect({
        status: response.status,
        body: await response.json(),
        trace: f.trace,
      }).toMatchSnapshot();
    },
  );
  it.each(["preview", "apply", "cancel", "refresh"] as const)(
    "seat %s",
    async (action) => {
      const f = commercialFixture();
      const body =
        action === "refresh"
          ? {}
          : action === "cancel"
            ? { operationId: uuid }
            : action === "preview"
              ? { targetAdditionalSeats: 1 }
              : { operationId: uuid, targetAdditionalSeats: 1 };
      const response = await handleSeatQuantity(request(body), f.deps, action);
      expect(response.status).toBe(200);
      expect({
        status: response.status,
        body: await response.json(),
        trace: f.trace,
      }).toMatchSnapshot();
    },
  );
  it.each(["subscription_updated", "subscription_resumed", "unknown_event"])(
    "webhook %s",
    async (name) => {
      const f = commercialFixture();
      const response = await handleBillingWebhook(event(name), f.deps);
      expect(response.status).toBe(200);
      expect({
        status: response.status,
        body: await response.json(),
        trace: f.trace,
      }).toMatchSnapshot();
    },
  );
  it.each(["manage_billing", "update_payment_method"])(
    "portal %s",
    async (purpose) => {
      const f = commercialFixture();
      const response = await handleCustomerPortalLink(
        request({ purpose }),
        f.deps,
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.portalUrl).toContain("opaque=synthetic-only");
      expect({
        status: response.status,
        purpose: body.purpose,
        cache: response.headers.get("cache-control"),
        trace: f.trace,
      }).toMatchSnapshot();
      expect(
        JSON.stringify([f.trace, vi.mocked(f.deps.log!).mock.calls]),
      ).not.toContain("opaque=");
    },
  );
});

describe("verified evidence boundary", () => {
  it("rejects neutral observations, serialized receipts, and receipts from another instance", async () => {
    const f = commercialFixture();
    const first = createLemonSqueezyCommercialPorts(f.provider, f.config);
    const other = createLemonSqueezyCommercialPorts(f.provider, f.config);
    const token = await first.subscriptions.retrieve("3");
    expect(JSON.stringify(token)).toBe("{}");
    for (const forged of [
      { status: "paid", quantity: 6 },
      JSON.parse(JSON.stringify(token)),
    ]) {
      expect(() =>
        first.reconciliation.snapshotArguments(forged as VerifiedSubscription),
      ).toThrow("BILLING_RECONCILIATION_FAILED");
      expect(() =>
        first.reconciliation.invoiceArguments(forged as VerifiedInvoice),
      ).toThrow("BILLING_RECONCILIATION_FAILED");
      await expect(
        first.reconciliation.deliveryArguments(forged as VerifiedEvent, "1"),
      ).rejects.toThrow("BILLING_RECONCILIATION_FAILED");
    }
    expect(() => other.reconciliation.snapshotArguments(token)).toThrow(
      "BILLING_RECONCILIATION_FAILED",
    );
    const args = first.reconciliation.snapshotArguments(token);
    (args.p_snapshot as Record<string, unknown>).quantity = 999;
    expect(
      first.reconciliation.snapshotArguments(token).p_snapshot,
    ).toMatchObject({ quantity: 1 });
    expect(f.serviceRpc).not.toHaveBeenCalled();
  });
  it("keeps raw-byte, event-name and environment identity; cannot use an event before normalization", async () => {
    const f = commercialFixture();
    const port = createLemonSqueezyCommercialPorts(
      f.provider,
      f.config,
    ).reconciliation;
    async function proof(spaced: boolean) {
      const req = event("subscription_updated", spaced);
      const raw = new Uint8Array(await req.arrayBuffer());
      const token = await port.verifyEvent(raw, req.headers);
      raw.fill(0);
      await expect(port.eventSubscription(token)).rejects.toThrow(
        "BILLING_RECONCILIATION_FAILED",
      );
      return port.deliveryArguments(token, "1");
    }
    const first = await proof(false);
    expect(await proof(false)).toEqual(first);
    expect((await proof(true)).p_fingerprint).not.toBe(first.p_fingerprint);
    const req = event("subscription_updated");
    const raw = new Uint8Array(await req.arrayBuffer());
    const live = createLemonSqueezyCommercialPorts(f.provider, {
      ...f.config,
      environment: "live",
    }).reconciliation;
    const token = await live.verifyEvent(raw, req.headers);
    await expect(live.deliveryArguments(token, "1")).rejects.toThrow(
      "BILLING_WEBHOOK_ENVIRONMENT_MISMATCH",
    );
    await expect(
      port.deliveryArguments(await port.verifyEvent(raw, req.headers), "999"),
    ).rejects.toThrow("BILLING_WEBHOOK_STORE_MISMATCH");
    req.headers.set("x-signature", "forged");
    await expect(port.verifyEvent(raw, req.headers)).rejects.toThrow(
      "BILLING_WEBHOOK_INVALID_SIGNATURE",
    );
  });
  it("retains SQL duplicate handling and persists the same fingerprint on replay", async () => {
    const f = commercialFixture();
    const rpc = f.deps.serviceRpc;
    let deliveries = 0;
    f.deps.serviceRpc = async (name, args) => {
      const result = await rpc(name, args);
      return name === "reconcile_billing_provider_subscription" &&
        deliveries++ > 0
        ? "replayed"
        : result;
    };
    expect(
      await (
        await handleBillingWebhook(event("subscription_updated"), f.deps)
      ).json(),
    ).toEqual({ status: "processed" });
    expect(
      await (
        await handleBillingWebhook(event("subscription_updated"), f.deps)
      ).json(),
    ).toEqual({ status: "replayed" });
    const records = f.serviceRpc.mock.calls.filter(
      ([name]) => name === "record_billing_webhook_delivery",
    );
    expect(records[1]).toEqual(records[0]);
  });
  it("preserves failure persistence after a verified delivery", async () => {
    const f = commercialFixture();
    vi.mocked(f.provider.retrieveSubscription).mockRejectedValue(
      new Error("private payload"),
    );
    const response = await handleBillingWebhook(
      event("subscription_updated"),
      f.deps,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "BILLING_RECONCILIATION_FAILED",
    });
    expect(f.serviceRpc).toHaveBeenCalledWith("fail_billing_webhook_delivery", {
      p_delivery: "synthetic-delivery",
    });
    expect(JSON.stringify(vi.mocked(f.deps.log!).mock.calls)).not.toContain(
      "private payload",
    );
  });
});

describe("explicit capability selection", () => {
  it.each(["plans", "seats"] as const)(
    "%s preview consumes only explicit neutral ports",
    async (kind) => {
      const f = commercialFixture();
      const config = configure(f.config);
      const token = Object.freeze({}) as VerifiedSubscription;
      const serialized = { p_snapshot: { synthetic: "verified-by-test-port" } };
      const retrieve = vi.fn(async () => token);
      config.commercial!.subscriptions = {
        retrieve,
        withItem: async (value) => value,
      };
      config.commercial!.reconciliation.snapshotArguments = vi.fn(
        () => serialized,
      );
      const eligible = vi.fn();
      config.commercial!.plans = {
        canChange: false,
        assertEligible: eligible,
        assertCancelable: vi.fn(),
        change: vi.fn(),
        assertResult: vi.fn(),
      };
      config.commercial!.seats = {
        canChange: false,
        assertCancelable: vi.fn(),
        change: vi.fn(),
        assertResult: vi.fn(),
      };
      f.deps.config = () => config;
      const response =
        kind === "plans"
          ? await handlePlanChange(
              request({
                operationId: uuid,
                targetPlanKey: "growth",
                targetCadence: "monthly",
              }),
              f.deps,
              "preview",
            )
          : await handleSeatQuantity(
              request({ targetAdditionalSeats: 1 }),
              f.deps,
              "preview",
            );
      expect(response.status).toBe(200);
      expect(f.provider.retrieveSubscription).not.toHaveBeenCalled();
      expect(retrieve).toHaveBeenCalledWith("3");
      expect(
        config.commercial!.reconciliation.snapshotArguments,
      ).toHaveBeenCalledWith(token);
      expect(f.serviceRpc).toHaveBeenCalledWith(
        kind === "plans"
          ? "preview_billing_plan_change"
          : "preview_billing_seat_quantity",
        expect.objectContaining(serialized),
      );
      if (kind === "plans") expect(eligible).toHaveBeenCalledWith(token);
    },
  );
  it.each(["portal", "plan", "seat", "webhook"])(
    "missing %s port fails closed without a legacy fallback",
    async (kind) => {
      const f = commercialFixture();
      // A legacy transport exists, but is never implicitly used by these handlers.
      f.deps.config = () => ({
        ...f.config,
        adapter: { provider: "unknown", environment: "test", capabilities: {} },
      });
      const response =
        kind === "portal"
          ? await handleCustomerPortalLink(
              request({ purpose: "manage_billing" }),
              f.deps,
            )
          : kind === "plan"
            ? await handlePlanChange(request({}), f.deps, "refresh")
            : kind === "seat"
              ? await handleSeatQuantity(request({}), f.deps, "refresh")
              : await handleBillingWebhook(
                  event("subscription_updated"),
                  f.deps,
                );
      expect(response.status).toBe(503);
      expect(f.trace).toEqual([]);
    },
  );
  it.each(["plans", "seats"] as const)(
    "absent %s policy fails before database/provider work",
    async (kind) => {
      const f = commercialFixture();
      const config = configure(f.config);
      delete config.commercial![kind];
      f.deps.config = () => config;
      const response =
        kind === "plans"
          ? await handlePlanChange(request({}), f.deps, "refresh")
          : await handleSeatQuantity(request({}), f.deps, "refresh");
      expect(response.status).toBe(503);
      expect(f.trace).toEqual([]);
    },
  );
  it("allows a neutral portal with different destination semantics without legacy access", async () => {
    const f = commercialFixture();
    const release = vi.fn(() => ({
      url: "https://portal.example.test/session?opaque=synthetic-only",
    }));
    f.deps.config = () => ({
      ...f.config,
      adapter: {
        provider: "future-test",
        environment: "test",
        capabilities: {
          customerPortal: {
            validateConfiguration: vi.fn(),
            prepare: async () => ({
              identity: {
                provider: "future-test",
                environment: "test",
                merchantReference: "opaque-store",
                customerReference: "opaque-customer",
                subscriptionReference: "opaque-subscription",
              },
              destination: release,
            }),
          },
        },
      },
    });
    f.deps.serviceRpc = vi.fn(async () => ({
      provider: "future-test",
      environment: "test",
      store_id: "opaque-store",
      customer_id: "opaque-customer",
      subscription_id: "opaque-subscription",
      local_status: "past_due",
    }));
    const response = await handleCustomerPortalLink(
      request({ purpose: "manage_billing" }),
      f.deps,
    );
    expect(response.status).toBe(200);
    expect(f.provider.retrieveSubscriptionForPortal).not.toHaveBeenCalled();
    expect(f.deps.serviceRpc).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("does not release a portal destination when canonical ownership changes", async () => {
    const f = commercialFixture();
    const config = configure(f.config);
    const capability = config.adapter!.capabilities.customerPortal!;
    const prepare = capability.prepare;
    const release = vi.fn();
    capability.prepare = async (input) => {
      const pending = await prepare(input);
      expect(JSON.stringify(pending)).not.toContain("opaque=");
      return { ...pending, destination: release };
    };
    f.deps.config = () => config;
    f.serviceRpc
      .mockResolvedValueOnce({
        provider: "lemonsqueezy" as const,
        environment: "test" as const,
        store_id: "1",
        customer_id: "2",
        subscription_id: "3",
      } as never)
      .mockResolvedValueOnce({
        provider: "lemonsqueezy" as const,
        environment: "test" as const,
        store_id: "1",
        customer_id: "999",
        subscription_id: "3",
      } as never);
    const response = await handleCustomerPortalLink(
      request({ purpose: "manage_billing" }),
      f.deps,
    );
    expect(response.status).toBe(409);
    expect(release).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("opaque=");
  });
});

describe("provider policy isolation", () => {
  it.each(["paypal", "unknown"])(
    "plan eligibility rejects %s with the historical error",
    async (processor) => {
      const f = commercialFixture();
      f.setCurrent({
        payment_processor:
          processor as SubscriptionSnapshot["payment_processor"],
      });
      const response = await handlePlanChange(request({}), f.deps, "refresh");
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        code:
          processor === "paypal"
            ? "BILLING_PLAN_CHANGE_PAYPAL_UNSUPPORTED"
            : "BILLING_PLAN_CHANGE_NOT_ELIGIBLE",
      });
      expect(f.trace.some((v) => String(v).includes("finish_"))).toBe(false);
    },
  );
  it("keeps item validation out of orchestration and preserves refresh drift reconciliation", async () => {
    const f = commercialFixture();
    vi.mocked(f.provider.retrieveSubscriptionItem!).mockResolvedValue({
      item_id: "9",
      subscription_id: "3",
      price_id: "6",
      quantity: 99,
      is_usage_based: false,
      created_at: stamp,
      updated_at: stamp,
    });
    const denied = await handleSeatQuantity(
      request({ targetAdditionalSeats: 1 }),
      f.deps,
      "preview",
    );
    expect(await denied.json()).toEqual({
      code: "BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT",
    });
    const refreshed = await handleSeatQuantity(request({}), f.deps, "refresh");
    expect(refreshed.status).toBe(200);
    expect(f.serviceRpc).toHaveBeenCalledWith(
      "finish_billing_plan_change",
      expect.objectContaining({
        p_snapshot: expect.objectContaining({
          verified_item: expect.objectContaining({ quantity: 99 }),
        }),
      }),
    );
  });
  it.each(["plans", "seats"] as const)(
    "%s mutation capability missing never begins an operation",
    async (kind) => {
      const f = commercialFixture();
      if (kind === "plans") delete f.provider.updateSubscriptionVariant;
      else delete f.provider.updateSubscriptionItemQuantity;
      const response =
        kind === "plans"
          ? await handlePlanChange(
              request({
                operationId: uuid,
                targetPlanKey: "growth",
                targetCadence: "monthly",
              }),
              f.deps,
              "apply",
            )
          : await handleSeatQuantity(
              request({ operationId: uuid, targetAdditionalSeats: 1 }),
              f.deps,
              "apply",
            );
      expect(response.status).toBe(503);
      expect(
        f.serviceRpc.mock.calls.some(([name]) => name.startsWith("begin_")),
      ).toBe(false);
    },
  );
  it.each([
    "store_id",
    "customer_id",
    "variant_id",
    "price_id",
    "environment",
    "payment_processor",
    "quantity",
    "first_subscription_item_id",
  ])("rejects seat result drift in %s", async (field) => {
    const f = commercialFixture();
    const ports = createLemonSqueezyCommercialPorts(f.provider, f.config);
    const before = await ports.subscriptions.retrieve("3");
    f.setCurrent({ [field]: field === "quantity" ? 99 : "wrong" });
    const after = await ports.subscriptions.retrieve("3");
    expect(() => ports.seats!.assertResult(after, before, 1)).toThrow(
      "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
    );
  });
  it.each([
    "subscription_id",
    "environment",
    "store_id",
    "customer_id",
    "order_id",
    "order_item_id",
    "first_subscription_item_id",
    "quantity",
    "payment_processor",
    "variant_id",
    "product_id",
    "price_id",
    "trial_ends_at",
    "updated_at",
    "renews_at",
  ])("rejects plan result drift in %s", async (field) => {
    const f = commercialFixture();
    const ports = createLemonSqueezyCommercialPorts(f.provider, f.config);
    const before = await ports.subscriptions.retrieve("3");
    f.setCurrent({
      [field]:
        field === "quantity"
          ? 99
          : field === "updated_at"
            ? "2020-01-01T00:00:00Z"
            : "wrong",
    });
    const after = await ports.subscriptions.retrieve("3");
    expect(() =>
      ports.plans!.assertResult(after, before, {
        subscriptionReference: "3",
        offerReference: "5",
        productReference: "4",
        priceReference: "6",
        expectedQuantity: 1,
        timing: "period_end",
      }),
    ).toThrow("BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS");
  });
  it.each(["plans", "seats"] as const)(
    "%s cancellation preserves canonical linkage validation",
    async (kind) => {
      const f = commercialFixture();
      const ports = createLemonSqueezyCommercialPorts(f.provider, f.config);
      const token = await ports.subscriptions.retrieve("3");
      const identity = canonicalSubscriptionIdentity(
        {
          provider_subscription_id: "3",
          provider_customer_id: "2",
          provider_store_id: "1",
          provider_variant_id: "5",
          provider_price_id: "6",
          first_subscription_item_id: "9",
        },
        "test",
      );
      expect(() =>
        ports[kind]!.assertCancelable(token, identity),
      ).not.toThrow();
      expect(() =>
        ports[kind]!.assertCancelable(token, {
          ...identity,
          customerReference: "wrong",
        }),
      ).toThrow("CANNOT_CANCEL");
    },
  );
});
