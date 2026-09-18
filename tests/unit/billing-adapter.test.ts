import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  opaqueProviderReference,
  type ApprovedBillingMapping,
  type BillingEnvironment,
  type CheckoutIntent,
} from "../../supabase/functions/_shared/billing-provider";
import {
  adaptLemonSqueezyProvider,
  createLemonSqueezyBillingBoundary,
  mapLemonSqueezySubscription,
} from "../../supabase/functions/_shared/lemon-squeezy-adapter";
import {
  createLemonSqueezyProvider,
  parseSubscription,
  sha256,
  type BillingProvider,
  type CheckoutOperation,
} from "../../supabase/functions/_shared/lemon-squeezy";
import {
  handleBillingCheckout,
  handleBillingWebhook,
  type BillingDependencies,
} from "../../supabase/functions/_shared/billing-handlers";
import { PUBLIC_PLAN_KEYS } from "../../src/features/commercial-catalogue/contracts";
import { billingBrowserProvider } from "../../src/features/billing/providers/active-provider";
import { hostedCheckoutUrlSchema } from "../../src/features/billing/contracts";
import { createBillingCheckout } from "../../src/features/billing/checkout-api";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabase: { functions: { invoke } },
}));

const stamp = "2026-09-18T00:00:00.000Z";
const expiry = "2099-10-18T00:00:00.000Z";
const uuid = "a0500000-0000-4000-8000-000000000001";
const secret = "contract-test-secret";
function subscription(testMode = true, quantity = 3) {
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
        test_mode: testMode,
        status: "active",
        cancelled: false,
        renews_at: expiry as string | null,
        ends_at: null as string | null,
        trial_ends_at: null,
        created_at: stamp,
        updated_at: stamp,
        payment_processor: "stripe",
        first_subscription_item: {
          id: 95009,
          subscription_id: 95005,
          price_id: 95004,
          quantity,
        },
        user_email: "private@example.test",
        urls: { customer_portal: "PRIVATE_PORTAL" },
        customer_data: { private: "RAW_PROVIDER_MARKER" },
      },
    },
  };
}
function legacy(): BillingProvider {
  return {
    retrieveSubscription: vi.fn(async () =>
      parseSubscription(subscription(), "95005"),
    ),
    createCheckout: vi.fn(async () => ({
      id: "checkout_opaque:001",
      url: "https://demo.lemonsqueezy.com/checkout/x",
      expiresAt: expiry,
    })),
  };
}
const mapping: ApprovedBillingMapping = {
  provider: "lemonsqueezy",
  environment: "test",
  merchantReference: "95001",
  productReference: "95002",
  offerReference: "95003",
  priceReference: "95004",
  planKey: "growth",
  cadence: "monthly",
};
const intent: CheckoutIntent = {
  checkoutAttemptId: uuid,
  billingAccountId: uuid,
  planVersionId: uuid,
  price: { ...mapping, unitAmountMinor: 1900 },
  expiresAt: expiry,
  creationLeaseExpiresAt: expiry,
  returnUrl: "https://app.test/return",
  customer: { email: "owner@example.test" },
};
const operation: CheckoutOperation = {
  attempt: {
    id: uuid,
    billing_account_id: uuid,
    plan_version_id: uuid,
    environment: "test",
    status: "creating",
    expected_expires_at: expiry,
    creation_lease_expires_at: expiry,
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
function checkoutResponse() {
  return {
    data: {
      type: "checkouts",
      id: "checkout_opaque:001",
      attributes: {
        store_id: 95001,
        variant_id: 95003,
        test_mode: true,
        expires_at: expiry,
        preview: { currency: "USD", subtotal: 1900, discount_total: 0 },
        product_options: { enabled_variants: [95003] },
        custom_price: null,
        url: "https://demo.lemonsqueezy.com/checkout/x",
      },
    },
  };
}
function itemResponse(quantity = 3) {
  return {
    data: {
      type: "subscription-items",
      id: "95009",
      attributes: {
        subscription_id: 95005,
        price_id: 95004,
        quantity,
        is_usage_based: false,
        created_at: stamp,
        updated_at: stamp,
      },
    },
  };
}
function invoiceResponse() {
  return {
    data: [
      {
        type: "subscription-invoices",
        id: "95010",
        attributes: {
          store_id: 95001,
          subscription_id: 95005,
          customer_id: 95006,
          test_mode: true,
          billing_reason: "updated",
          status: "paid",
          created_at: stamp,
          updated_at: stamp,
          total: 1900,
          currency: "USD",
          urls: { invoice_url: "PRIVATE_INVOICE" },
        },
      },
    ],
  };
}
function webhook(name: string, testMode = true) {
  const data = name.startsWith("subscription_payment_")
    ? {
        ...invoiceResponse().data[0]!,
        attributes: {
          ...invoiceResponse().data[0]!.attributes,
          test_mode: testMode,
        },
      }
    : subscription(testMode).data;
  const rawBody = new TextEncoder().encode(
    JSON.stringify({
      meta: { event_name: name, private: "RAW_PROVIDER_MARKER" },
      data,
    }),
  );
  return {
    rawBody,
    merchantReference: "95001",
    headers: new Headers({
      "x-event-name": name,
      "x-signature": createHmac("sha256", secret).update(rawBody).digest("hex"),
    }),
  };
}
function adapter(
  environment: BillingEnvironment = "test",
  provider = legacy(),
) {
  return adaptLemonSqueezyProvider(provider, {
    environment,
    webhookSecret: secret,
  });
}

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network forbidden in adapter tests");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe("provider-neutral observations", () => {
  it.each([
    "sub_001:AbC",
    "000001",
    "900719925474099300001",
    "customer/ref?opaque=Yes",
    " REF ",
  ])("preserves opaque string reference %s exactly", (reference) => {
    expect(opaqueProviderReference(reference)).toBe(reference);
  });
  it.each([0, 123, null, undefined, "", "  ", {}])(
    "rejects non-string or empty reference %#",
    (reference) => {
      expect(() => opaqueProviderReference(reference)).toThrow(
        "BILLING_PROVIDER_REFERENCE_INVALID",
      );
    },
  );
  it.each(
    PUBLIC_PLAN_KEYS.flatMap((planKey) =>
      ["monthly", "annual"].map((cadence) => ({ planKey, cadence })),
    ),
  )(
    "maps approved $planKey / $cadence without inferring it from provider IDs",
    async ({ planKey, cadence }) => {
      const provider = adaptLemonSqueezyProvider(legacy(), {
        environment: "test",
        webhookSecret: secret,
        resolveMapping: async () => ({
          ...mapping,
          planKey,
          cadence: cadence as "monthly" | "annual",
        }),
      });
      const result =
        await provider.capabilities.subscriptions!.retrieve("95005");
      expect(result).toMatchObject({
        provider: "lemonsqueezy",
        environment: "test",
        planKey,
        cadence,
        subscriptionReference: "95005",
        customerReference: "95006",
        itemReference: "95009",
        quantity: 3,
        quantityScope: "subscription_item",
        currentPeriodEnd: expiry,
        scheduledCancellation: { requested: false },
      });
      expect(result).not.toHaveProperty("currentPeriodStart");
      expect(result).not.toHaveProperty("paymentState");
      expect(result).not.toHaveProperty("raw");
      expect(JSON.stringify(result)).not.toMatch(
        /RAW_PROVIDER_MARKER|private@|PRIVATE_PORTAL|payment_processor|first_subscription_item|attributes/,
      );
    },
  );
  it("leaves unknown plan/cadence absent and rejects a cross-environment/price mapping", async () => {
    const result =
      await adapter().capabilities.subscriptions!.retrieve("95005");
    expect(result).not.toHaveProperty("planKey");
    expect(result).not.toHaveProperty("cadence");
    for (const wrong of [
      { ...mapping, environment: "live" as const },
      { ...mapping, priceReference: "other" },
      { ...mapping, merchantReference: "other" },
    ]) {
      expect(() =>
        mapLemonSqueezySubscription(
          parseSubscription(subscription(), "95005"),
          "test",
          wrong,
        ),
      ).toThrow("BILLING_VARIANT_MAPPING_MISMATCH");
    }
  });
  it.each([true, false])(
    "keeps explicit test/live context (%s)",
    (testMode) => {
      const source = parseSubscription(subscription(testMode), "95005");
      const expected = testMode ? "test" : "live";
      expect(mapLemonSqueezySubscription(source, expected).environment).toBe(
        expected,
      );
      expect(() =>
        mapLemonSqueezySubscription(source, testMode ? "live" : "test"),
      ).toThrow("BILLING_WEBHOOK_ENVIRONMENT_MISMATCH");
    },
  );
  it.each([1, 2, 6])(
    "preserves billed item quantity %i without granting coach capacity",
    (quantity) => {
      const result = mapLemonSqueezySubscription(
        parseSubscription(subscription(true, quantity), "95005"),
        "test",
      );
      expect(result.quantity).toBe(quantity);
      expect(result).not.toHaveProperty("includedSeats");
      expect(result).not.toHaveProperty("additionalSeats");
      expect(result).not.toHaveProperty("entitlements");
    },
  );
  it.each(["cancelled", "expired"])(
    "preserves %s cancellation/end observations without applying access rules",
    (status) => {
      const source = subscription();
      Object.assign(source.data.attributes, {
        status,
        cancelled: true,
        renews_at: null,
        ends_at: expiry,
      });
      const result = mapLemonSqueezySubscription(
        parseSubscription(source, "95005"),
        "test",
      );
      expect(result.status).toBe(
        status === "cancelled" ? "canceled" : "expired",
      );
      expect(result.currentPeriodEnd).toBe(expiry);
      expect(result.scheduledCancellation).toEqual({
        requested: true,
        effectiveAt: expiry,
      });
    },
  );
  it("does not invent a cancellation date and distinguishes payment debt from payment proof", () => {
    const source = subscription();
    Object.assign(source.data.attributes, {
      status: "past_due",
      cancelled: false,
      renews_at: null,
    });
    const result = mapLemonSqueezySubscription(
      parseSubscription(source, "95005"),
      "test",
    );
    expect(result.paymentState).toBe("past_due");
    expect(result.scheduledCancellation).toEqual({ requested: false });
    expect(result).not.toHaveProperty("currentPeriodEnd");
  });
});

describe("conservative verified event envelope", () => {
  it.each([
    ["subscription_created", "subscription_created"],
    ["subscription_updated", "subscription_updated"],
    ["subscription_cancelled", "subscription_canceled"],
    ["subscription_payment_success", "transaction_paid"],
    ["subscription_payment_recovered", "transaction_paid"],
    ["subscription_payment_failed", "transaction_failed"],
  ])("maps %s only to %s", async (name, type) => {
    const result = await adapter().capabilities.webhooks!.verifyAndNormalize(
      webhook(name!),
    );
    expect(result.event).toMatchObject({
      kind: "normalized",
      type,
      provider: "lemonsqueezy",
      environment: "test",
    });
    expect(result.event.resourceType).toBe(
      name!.startsWith("subscription_payment") ? "transaction" : "subscription",
    );
    expect(result.event).not.toHaveProperty("providerEventReference");
    expect(result.event).not.toHaveProperty("occurredAt");
    expect(JSON.stringify(result)).not.toMatch(
      /attributes|payload|urls|RAW_PROVIDER_MARKER|private@/,
    );
    if (result.transaction) {
      expect(result.transaction.transactionReference).toBe("95010");
      expect(result.transaction.billingReason).toBe("adjustment");
      expect(result.transaction).not.toHaveProperty("amountMinor");
      expect(result.transaction).not.toHaveProperty("currency");
    }
  });
  it.each([
    "not_mapped",
    "subscription_payment_refunded",
    "subscription_resumed",
    "subscription_plan_changed",
    "constructor",
    "to_string",
  ])(
    "keeps %s explicitly provider-specific, never inventing canonical meaning",
    async (name) => {
      const result = await adapter().capabilities.webhooks!.verifyAndNormalize(
        webhook(name),
      );
      expect(result.event).toMatchObject({
        kind: "provider_specific",
        providerEventType: name,
        resourceType: "provider_specific",
      });
      expect(result.event).not.toHaveProperty("type");
    },
  );
  it("preserves the historical fingerprint byte-for-byte across duplicate delivery", async () => {
    const input = webhook("subscription_updated");
    const port = adapter().capabilities.webhooks!;
    const one = await port.verifyAndNormalize(input);
    const two = await port.verifyAndNormalize(input);
    expect(one).toEqual(two);
    expect(one.event.replayKey).toBe(
      await sha256(
        `test\nsubscription_updated\n${await sha256(input.rawBody)}`,
      ),
    );
    const live = await adapter(
      "live",
    ).capabilities.webhooks!.verifyAndNormalize(
      webhook("subscription_updated", false),
    );
    expect(live.event.replayKey).not.toBe(one.event.replayKey);
  });
  it("rejects forged signatures, body changes, wrong environment and wrong store", async () => {
    const port = adapter().capabilities.webhooks!;
    const input = webhook("subscription_created");
    const badHeaders = new Headers(input.headers);
    badHeaders.set("x-signature", "0".repeat(64));
    await expect(
      port.verifyAndNormalize({ ...input, headers: badHeaders }),
    ).rejects.toThrow("BILLING_WEBHOOK_INVALID_SIGNATURE");
    await expect(
      port.verifyAndNormalize({
        ...input,
        rawBody: new TextEncoder().encode("{}"),
      }),
    ).rejects.toThrow("BILLING_WEBHOOK_INVALID_SIGNATURE");
    await expect(
      port.verifyAndNormalize(webhook("subscription_created", false)),
    ).rejects.toThrow("BILLING_WEBHOOK_ENVIRONMENT_MISMATCH");
    await expect(
      port.verifyAndNormalize({ ...input, merchantReference: "999" }),
    ).rejects.toThrow("BILLING_WEBHOOK_STORE_MISMATCH");
  });
  it("rejects header/body event mismatch without interpreting another event", async () => {
    const input = webhook("subscription_created");
    input.headers.set("x-event-name", "subscription_updated");
    await expect(
      adapter().capabilities.webhooks!.verifyAndNormalize(input),
    ).rejects.toThrow("BILLING_WEBHOOK_EVENT_MISMATCH");
  });
  it("retains byte-sensitive replay identity and bounds webhook input", async () => {
    const input = webhook("subscription_updated");
    const changed = new TextEncoder().encode(
      new TextDecoder().decode(input.rawBody) + " ",
    );
    const headers = new Headers(input.headers);
    headers.set(
      "x-signature",
      createHmac("sha256", secret).update(changed).digest("hex"),
    );
    const port = adapter().capabilities.webhooks!;
    const original = await port.verifyAndNormalize(input);
    const reserialized = await port.verifyAndNormalize({
      ...input,
      rawBody: changed,
      headers,
    });
    expect(reserialized.event.replayKey).not.toBe(original.event.replayKey);
    await expect(
      port.verifyAndNormalize({ ...input, rawBody: new Uint8Array(262_145) }),
    ).rejects.toThrow("BILLING_INVALID_INPUT");
  });
});

describe("thin compatibility delegation", () => {
  it("binds the configured environment and webhook secret at construction", async () => {
    const options = {
      environment: "test" as BillingEnvironment,
      webhookSecret: secret,
    };
    const port = adaptLemonSqueezyProvider(legacy(), options);
    options.environment = "live";
    options.webhookSecret = "different";
    expect(port.environment).toBe("test");
    expect(
      (await port.capabilities.subscriptions!.retrieve("95005")).environment,
    ).toBe("test");
    await expect(
      port.capabilities.webhooks!.verifyAndNormalize(
        webhook("subscription_created"),
      ),
    ).resolves.toMatchObject({ event: { environment: "test" } });
  });
  function transport() {
    return vi.fn(async (url: string | URL | Request) =>
      Response.json(
        String(url).includes("subscription-invoices?")
          ? invoiceResponse()
          : String(url).includes("subscription-items/")
            ? itemResponse()
            : String(url).endsWith("checkouts")
              ? checkoutResponse()
              : subscription(),
      ),
    );
  }
  it("does not contact a provider at construction and exposes only implemented neutral capabilities", () => {
    const http = transport();
    const boundary = createLemonSqueezyBillingBoundary(
      "not-a-real-key",
      { environment: "test", webhookSecret: secret },
      http,
    );
    expect(http).not.toHaveBeenCalled();
    expect(boundary.adapter.capabilities.customerPortal).toBeUndefined();
    expect(boundary.adapter.capabilities.cancellation).toBeUndefined();
    expect(boundary.compatibility.retrieveSubscriptionForPortal).toBeTypeOf(
      "function",
    );
    expect(boundary.adapter).not.toHaveProperty("compatibility");
    expect(JSON.stringify(boundary.adapter)).not.toMatch(
      /contract-test-secret|not-a-real-key|webhookSecret|apiKey/,
    );
    expect(adapter().capabilities.planChanges).toBeUndefined();
    expect(adapter().capabilities.quantities).toBeUndefined();
    expect(adapter().capabilities.transactions).toBeUndefined();
    expect(
      adaptLemonSqueezyProvider(legacy(), {
        environment: "test",
        webhookSecret: "",
      }).capabilities.webhooks,
    ).toBeUndefined();
  });
  it.each(["immediate", "period_end"] as const)(
    "preserves checkout, subscription, plan and quantity HTTP semantics (%s)",
    async (timing) => {
      const oldHttp = transport(),
        newHttp = transport();
      const old = createLemonSqueezyProvider("not-a-real-key", oldHttp);
      const next = createLemonSqueezyBillingBoundary(
        "not-a-real-key",
        { environment: "test", webhookSecret: secret },
        newHttp,
      ).adapter;
      await old.createCheckout(operation, intent.returnUrl, intent.customer);
      expect(await next.capabilities.checkout!.create(intent)).toMatchObject({
        checkoutReference: "checkout_opaque:001",
      });
      await old.retrieveSubscription("95005");
      await next.capabilities.subscriptions!.retrieve("95005");
      await old.updateSubscriptionVariant!("95005", "95003", timing);
      await next.capabilities.planChanges!.change({
        subscriptionReference: "95005",
        targetOfferReference: "95003",
        timing,
      });
      await old.updateSubscriptionItemQuantity!("95009", 3, timing);
      expect(
        await next.capabilities.quantities!.change({
          itemReference: "95009",
          quantity: 3,
          timing,
        }),
      ).toMatchObject({ quantity: 3, quantityScope: "subscription_item" });
      await old.listSubscriptionInvoices!("95005");
      const invoices =
        await next.capabilities.transactions!.listRecent("95005");
      expect(invoices.completeness).toBe("reconciliation_window");
      expect(invoices.transactions[0]).toMatchObject({
        status: "paid",
        billingReason: "adjustment",
      });
      expect(invoices.transactions[0]).not.toHaveProperty(
        "transactionReference",
      );
      expect(invoices.transactions[0]).not.toHaveProperty("amountMinor");
      expect(newHttp.mock.calls.map((args) => JSON.stringify(args))).toEqual(
        oldHttp.mock.calls.map((args) => JSON.stringify(args)),
      );
    },
  );
  it("preserves existing provider-specific numeric validation inside the reference adapter", async () => {
    const http = transport();
    const boundary = createLemonSqueezyBillingBoundary(
      "not-a-real-key",
      { environment: "test", webhookSecret: secret },
      http,
    );
    await expect(
      boundary.adapter.capabilities.subscriptions!.retrieve("future_opaque_id"),
    ).rejects.toThrow("BILLING_SUBSCRIPTION_IDENTITY_MISMATCH");
    expect(http).not.toHaveBeenCalled();
  });
  it.each([400, 429, 503])(
    "preserves error and ambiguity semantics for provider HTTP %i",
    async (status) => {
      const http = vi.fn(
        async () => new Response("private provider error", { status }),
      );
      const old = createLemonSqueezyProvider("not-a-real-key", http);
      const next = createLemonSqueezyBillingBoundary(
        "not-a-real-key",
        { environment: "test", webhookSecret: secret },
        http,
      ).adapter;
      const calls = [
        [
          () =>
            old.createCheckout(operation, intent.returnUrl, intent.customer),
          () => next.capabilities.checkout!.create(intent),
        ],
        [
          () => old.retrieveSubscription("95005"),
          () => next.capabilities.subscriptions!.retrieve("95005"),
        ],
        [
          () => old.updateSubscriptionVariant!("95005", "95003", "immediate"),
          () =>
            next.capabilities.planChanges!.change({
              subscriptionReference: "95005",
              targetOfferReference: "95003",
              timing: "immediate",
            }),
        ],
        [
          () => old.updateSubscriptionItemQuantity!("95009", 3, "period_end"),
          () =>
            next.capabilities.quantities!.change({
              itemReference: "95009",
              quantity: 3,
              timing: "period_end",
            }),
        ],
      ];
      for (const [before, after] of calls) {
        const oldResult = await before!().catch((error) => error);
        const newResult = await after!().catch((error) => error);
        expect(newResult).toBeInstanceOf(Error);
        expect({
          code: newResult.code,
          status: newResult.httpStatus,
          ambiguous: newResult.ambiguous,
        }).toEqual({
          code: oldResult.code,
          status: oldResult.httpStatus,
          ambiguous: oldResult.ambiguous,
        });
        expect(newResult.message).not.toContain("private provider error");
      }
    },
  );
  it("preserves browser checkout routing and URL trust policy", () => {
    expect(billingBrowserProvider.checkoutFunction).toBe(
      "billing-create-lemon-squeezy-checkout",
    );
    expect(
      hostedCheckoutUrlSchema.parse("https://demo.lemonsqueezy.com/checkout/x"),
    ).toBe("https://demo.lemonsqueezy.com/checkout/x");
    expect(
      hostedCheckoutUrlSchema.safeParse(
        "https://another-provider.test/checkout/x",
      ).success,
    ).toBe(false);
  });
  it("invokes the unchanged browser checkout endpoint and returns only the validated response", async () => {
    invoke.mockReset();
    const data = {
      checkoutUrl: "https://demo.lemonsqueezy.com/checkout/x",
      checkoutAttemptId: uuid,
      expiresAt: expiry,
    };
    invoke.mockResolvedValue({ data, error: null });
    const input = {
      planKey: "growth" as const,
      cadence: "annual" as const,
      operationId: uuid,
    };
    await expect(createBillingCheckout(input)).resolves.toEqual(data);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      "billing-create-lemon-squeezy-checkout",
      { body: input },
    );
  });
  it("still rejects untrusted checkout destinations returned by the server", async () => {
    invoke.mockReset();
    invoke.mockResolvedValue({
      data: {
        checkoutUrl: "https://evil.test/checkout/x",
        checkoutAttemptId: uuid,
        expiresAt: expiry,
      },
      error: null,
    });
    await expect(
      createBillingCheckout({
        planKey: "growth",
        cadence: "monthly",
        operationId: uuid,
      }),
    ).rejects.toThrow();
  });
  it("keeps handler output and durable RPC arguments identical via the compatibility path", async () => {
    async function run(useBoundary: boolean) {
      const http = transport();
      const boundary = createLemonSqueezyBillingBoundary(
        "not-a-real-key",
        { environment: "test", webhookSecret: secret },
        http,
      );
      const rpc = vi.fn(async (name: string) => {
        if (name === "get_billing_checkout_operation") return operation;
        if (name === "get_billing_provider_store") return "95001";
        if (name === "record_billing_webhook_delivery") return "delivery";
        if (name === "reconcile_billing_provider_subscription")
          return "processed";
        return null;
      });
      const deps: BillingDependencies = {
        config: () => ({
          environment: "test",
          appBaseUrl: "https://app.test",
          webhookSecret: secret,
          provider: useBoundary
            ? boundary.compatibility
            : createLemonSqueezyProvider("not-a-real-key", http),
          ...(useBoundary ? { adapter: boundary.adapter } : {}),
        }),
        authenticate: async () => ({ id: uuid }),
        ownerRpc: () => async () => ({
          checkoutAttemptId: uuid,
          shouldCreate: true,
        }),
        serviceRpc: rpc,
      };
      const checkout = await handleBillingCheckout(
        new Request("https://local.test/checkout", {
          method: "POST",
          headers: { authorization: "Bearer test-only" },
          body: JSON.stringify({
            operationId: uuid,
            planKey: "growth",
            cadence: "monthly",
          }),
        }),
        deps,
      );
      const signed = webhook("subscription_updated");
      const delivery = await handleBillingWebhook(
        new Request("https://local.test/webhook", {
          method: "POST",
          headers: signed.headers,
          body: signed.rawBody,
        }),
        deps,
      );
      return {
        checkout: [checkout.status, await checkout.json()],
        delivery: [delivery.status, await delivery.json()],
        calls: rpc.mock.calls,
        http: http.mock.calls.map((args) => JSON.stringify(args)),
      };
    }
    const before = await run(false),
      after = await run(true);
    expect(after).toEqual(before);
    expect(after.checkout[0]).toBe(200);
    expect(after.delivery).toEqual([200, { status: "processed" }]);
  });
});
