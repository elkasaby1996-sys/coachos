import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  BillingError,
  buildCheckout,
  createLemonSqueezyProvider,
  normalizeWebhook,
  parseCheckout,
  parseSubscription,
  sha256,
  validSignature,
  type CheckoutOperation,
} from "../../supabase/functions/_shared/lemon-squeezy";
import {
  handleBillingCheckout,
  handleBillingWebhook,
  type BillingDependencies,
} from "../../supabase/functions/_shared/billing-handlers";

const id = "a0500000-0000-4000-8000-000000000001";
const expiry = new Date(Date.now() + 1_800_000).toISOString();
export const operation: CheckoutOperation = {
  attempt: {
    id,
    billing_account_id: id,
    plan_version_id: id,
    environment: "test",
    status: "creating",
    expected_expires_at: expiry,
    creation_lease_expires_at: new Date(Date.now() + 120000).toISOString(),
    provider_checkout_url: null,
  },
  mapping: {
    provider_store_id: "95001",
    provider_product_id: "95002",
    provider_variant_id: "95003",
    provider_price_id: "95004",
    unit_amount_minor: 1900,
  },
};
function checkout() {
  return {
    data: {
      type: "checkouts",
      id: "fake-checkout",
      attributes: {
        store_id: 95001,
        variant_id: 95003,
        test_mode: true,
        expires_at: expiry,
        preview: { currency: "USD", subtotal: 1900, discount_total: 0 },
        product_options: { enabled_variants: [95003] },
        custom_price: null,
        url: "https://fake-store.lemonsqueezy.com/checkout/custom/fake",
      },
    },
  };
}
function subscription() {
  return {
    data: {
      type: "subscriptions",
      id: "95005",
      attributes: {
        store_id: 95001,
        customer_id: 95006,
        order_id: 95007,
        order_item_id: 95008,
        product_id: 95002,
        variant_id: 95003,
        test_mode: true,
        status: "active",
        cancelled: false,
        renews_at: expiry,
        ends_at: null,
        trial_ends_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        first_subscription_item: {
          id: 95009,
          subscription_id: 95005,
          price_id: 95004,
          quantity: 1,
        },
        user_email: "private@example.test",
        urls: { customer_portal: "PRIVATE" },
      },
    },
  };
}
function event(name = "subscription_created") {
  return {
    meta: {
      event_name: name,
      custom_data: {
        billing_account_id: id,
        checkout_attempt_id: id,
        plan_version_id: id,
        email: "discard@example.test",
      },
    },
    ...subscription(),
  };
}
function signed(body: unknown, header = "subscription_created") {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://local.test/webhook", {
    method: "POST",
    body: raw,
    headers: {
      "x-event-name": header,
      "x-signature": createHmac("sha256", "test-secret")
        .update(raw)
        .digest("hex"),
    },
  });
}
function dependencies() {
  const records = new Map<string, string>();
  let delivered = false;
  const serviceRpc = vi.fn(async (name: string, args: Record<string, any>) => {
    if (name === "get_billing_provider_store") return "95001";
    if (name === "record_billing_webhook_delivery") {
      records.set(args.p_fingerprint, "delivery");
      return "delivery";
    }
    if (name === "reconcile_billing_provider_subscription") {
      const status = delivered ? "replayed" : "processed";
      delivered = true;
      return status;
    }
    if (name === "get_billing_checkout_operation")
      return structuredClone(operation);
    return null;
  });
  const provider = {
    createCheckout: vi.fn(async () => parseCheckout(checkout(), operation)),
    retrieveSubscription: vi.fn(async () =>
      parseSubscription(subscription(), "95005"),
    ),
  };
  const deps: BillingDependencies = {
    config: () => ({
      environment: "test",
      appBaseUrl: "http://localhost:5173",
      webhookSecret: "test-secret",
      provider,
    }),
    authenticate: async () => ({ id }),
    ownerRpc: () => async () => ({ checkoutAttemptId: id, shouldCreate: true }),
    serviceRpc,
    log: vi.fn(),
  };
  return { deps, provider, records, serviceRpc };
}
describe("Lemon Squeezy adapter contracts", () => {
  it("locks Variant, quantity, trial, discount, custom data and receipt routing", () => {
    const value = buildCheckout(operation, "https://app.test/return", {
      email: "verified@example.test",
    });
    expect(value.data.attributes.checkout_options).toEqual({
      embed: false,
      discount: false,
      skip_trial: true,
      subscription_preview: true,
    });
    expect(value.data.attributes.product_options.enabled_variants).toEqual([
      95003,
    ]);
    expect(value.data.attributes.checkout_data.variant_quantities).toEqual([
      { variant_id: 95003, quantity: 1 },
    ]);
    expect(value.data.attributes).not.toHaveProperty("custom_price");
    expect(value.data.attributes.preview).toBe(true);
    expect(value.data.relationships.store.data.id).toBe("95001");
    expect(value.data.attributes.product_options.receipt_link_url).toBe(
      "https://app.test/return",
    );
  });
  it("accepts exact preview and strips all provider details", () => {
    expect(parseCheckout(checkout(), operation)).toEqual({
      id: "fake-checkout",
      url: checkout().data.attributes.url,
      expiresAt: expiry,
    });
  });
  it.each([
    "price",
    "currency",
    "discount",
    "store",
    "variant",
    "environment",
    "expiry",
    "variants",
    "url",
    "custom",
  ])("rejects mismatched %s", (key) => {
    const value = checkout();
    const a = value.data.attributes;
    if (key === "price") a.preview.subtotal++;
    if (key === "currency") a.preview.currency = "EUR";
    if (key === "discount") a.preview.discount_total = 100;
    if (key === "store") a.store_id++;
    if (key === "variant") a.variant_id++;
    if (key === "environment") a.test_mode = false;
    if (key === "expiry") a.expires_at = new Date(0).toISOString();
    if (key === "variants") a.product_options.enabled_variants.push(99);
    if (key === "url") a.url = "https://evil.test/checkout/";
    if (key === "custom") Object.assign(a, { custom_price: 1 });
    expect(() => parseCheckout(value, operation)).toThrow(
      "BILLING_VARIANT_MAPPING_MISMATCH",
    );
  });
  it("allows only official API calls and sanitizes failures", async () => {
    const transport = vi.fn(
      async () => new Response("private error", { status: 422 }),
    );
    const provider = createLemonSqueezyProvider("not-a-real-key", transport);
    await expect(
      provider.createCheckout(operation, "https://app.test", {}),
    ).rejects.toMatchObject({
      code: "BILLING_CHECKOUT_CREATION_FAILED",
      ambiguous: false,
    });
    expect(transport.mock.calls[0][0]).toBe(
      "https://api.lemonsqueezy.com/v1/checkouts",
    );
  });
  it.each([429, 500, 503])(
    "treats %s as uncertain without retry",
    async (status) => {
      const transport = vi.fn(async () => new Response("private", { status }));
      await expect(
        createLemonSqueezyProvider("fake", transport).createCheckout(
          operation,
          "https://app.test",
          {},
        ),
      ).rejects.toMatchObject({ ambiguous: true });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("network failure stays ambiguous", async () => {
    await expect(
      createLemonSqueezyProvider("fake", async () => {
        throw new Error("private");
      }).createCheckout(operation, "https://app.test", {}),
    ).rejects.toMatchObject({ code: "BILLING_CHECKOUT_CREATION_AMBIGUOUS" });
  });
  it("normalizes subscription without PII or signed URLs", () => {
    const result = parseSubscription(subscription(), "95005");
    expect(JSON.stringify(result)).not.toMatch(
      /private|user_email|urls|portal/,
    );
    expect(result.price_id).toBe("95004");
  });
});
describe("verified webhook handler", () => {
  it("verifies HMAC bytes and rejects modifications and missing signatures", async () => {
    const raw = new TextEncoder().encode("original");
    const signature = createHmac("sha256", "secret").update(raw).digest("hex");
    expect(await validSignature(raw, signature, "secret")).toBe(true);
    expect(
      await validSignature(
        new TextEncoder().encode("modified"),
        signature,
        "secret",
      ),
    ).toBe(false);
    expect(await validSignature(raw, null, "secret")).toBe(false);
    expect(await validSignature(raw, "a".repeat(64), "secret")).toBe(false);
  });
  it("fingerprints verified raw body and handles duplicate delivery", async () => {
    const { deps, records } = dependencies(),
      body = event();
    expect((await handleBillingWebhook(signed(body), deps)).status).toBe(200);
    const replay = await handleBillingWebhook(signed(body), deps);
    expect(await replay.json()).toEqual({ status: "replayed" });
    expect(records.size).toBe(1);
    expect(
      records.has(
        await sha256(
          `test\nsubscription_created\n${await sha256(JSON.stringify(body))}`,
        ),
      ),
    ).toBe(true);
  });
  it.each([
    "signature",
    "event",
    "malformed",
    "oversized",
    "environment",
    "store",
  ])("rejects %s before persistence", async (kind) => {
    const { deps, serviceRpc } = dependencies();
    let req = signed(event());
    if (kind === "signature") req.headers.delete("x-signature");
    if (kind === "event")
      req.headers.set("x-event-name", "subscription_updated");
    if (kind === "malformed") req = signed("{");
    if (kind === "oversized") req = signed("x".repeat(262145));
    if (kind === "environment") {
      const e = event();
      e.data.attributes.test_mode = false;
      req = signed(e);
    }
    if (kind === "store") {
      const e = event();
      e.data.attributes.store_id++;
      req = signed(e);
    }
    expect((await handleBillingWebhook(req, deps)).status).toBe(400);
    expect(
      serviceRpc.mock.calls.some(
        (c) => c[0] === "record_billing_webhook_delivery",
      ),
    ).toBe(false);
  });
  it("unknown events do not retrieve subscriptions", async () => {
    const { deps, provider } = dependencies();
    expect(
      (
        await handleBillingWebhook(
          signed(event("order_created"), "order_created"),
          deps,
        )
      ).status,
    ).toBe(200);
    expect(provider.retrieveSubscription).not.toHaveBeenCalled();
  });
  it("normalizes only allowlisted signed custom data", () => {
    expect(
      JSON.stringify(
        normalizeWebhook(event(), "subscription_created", "test", "95001"),
      ),
    ).not.toMatch(/email|PRIVATE/);
  });
});
describe("authenticated Checkout handler", () => {
  const request = () =>
    new Request("https://local.test/checkout", {
      method: "POST",
      headers: { authorization: "Bearer fake" },
      body: JSON.stringify({
        planKey: "launch",
        cadence: "monthly",
        operationId: id,
      }),
    });
  it("returns only safe hosted checkout result", async () => {
    const { deps, provider } = dependencies();
    const result = await handleBillingCheckout(request(), deps);
    expect(result.status).toBe(200);
    expect(Object.keys(await result.json()).sort()).toEqual([
      "checkoutAttemptId",
      "checkoutUrl",
      "expiresAt",
    ]);
    expect(provider.createCheckout).toHaveBeenCalledOnce();
  });
  it("requires authenticated owner", async () => {
    const { deps, provider } = dependencies();
    deps.authenticate = async () => null;
    expect((await handleBillingCheckout(request(), deps)).status).toBe(401);
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });
  it("provider unavailable returns a safe code", async () => {
    const { deps } = dependencies();
    deps.config = () => null;
    expect(await (await handleBillingCheckout(request(), deps)).json()).toEqual(
      { code: "BILLING_PROVIDER_NOT_CONFIGURED" },
    );
  });
  it("persistence failure after provider creation remains ambiguous", async () => {
    const { deps, serviceRpc } = dependencies();
    deps.serviceRpc = async (name, args) => {
      if (name === "complete_billing_checkout_attempt")
        throw new BillingError("BILLING_RECONCILIATION_FAILED", 503);
      return serviceRpc(name, args);
    };
    const result = await handleBillingCheckout(request(), deps);
    expect(await result.json()).toEqual({
      code: "BILLING_CHECKOUT_CREATION_AMBIGUOUS",
    });
    expect(
      serviceRpc.mock.calls.find(
        (c) => c[0] === "fail_billing_checkout_attempt",
      )?.[1].p_ambiguous,
    ).toBe(true);
  });
  it("ambiguous failure persists a blocked attempt without logging provider details", async () => {
    const { deps, provider, serviceRpc } = dependencies();
    provider.createCheckout.mockRejectedValue(
      new BillingError("BILLING_CHECKOUT_CREATION_AMBIGUOUS", 503, true),
    );
    expect((await handleBillingCheckout(request(), deps)).status).toBe(503);
    expect(
      serviceRpc.mock.calls.find(
        (c) => c[0] === "fail_billing_checkout_attempt",
      )?.[1].p_ambiguous,
    ).toBe(true);
    expect(deps.log).toHaveBeenCalledWith({
      code: "BILLING_CHECKOUT_CREATION_AMBIGUOUS",
      processingStatus: "failed",
    });
  });
});
