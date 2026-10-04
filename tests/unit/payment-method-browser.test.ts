import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { InitializePaddleOptions, Paddle } from "@paddle/paddle-js";
import {
  paymentMethodRequestSchema,
  paymentMethodStateSchema,
  paymentMethodResponseSchema,
} from "../../src/features/billing/payment-method-contracts";
import {
  createPaddlePaymentMethodBrowser,
  sandboxClientToken,
} from "../../src/features/billing/providers/paddle-payment-method";
import { createPaymentMethodBrowserRegistry } from "../../src/features/billing/providers/payment-method-browser";
import { activatePaymentMethodUpdate } from "../../src/features/billing/payment-method-api";
import { safePaymentMethodError } from "../../src/features/billing/payment-method-errors";
import {
  paymentMethodRecoveryConfirmed,
  PAYMENT_METHOD_POLL_DURATION_MS,
  PAYMENT_METHOD_POLL_MS,
} from "../../src/features/billing/payment-method-verification";

const token = `txn_${"a".repeat(26)}`;
const continuation = {
  kind: "provider_checkout" as const,
  provider: "paddle" as const,
  environment: "test" as const,
  token,
};
const response = {
  intent: "update_payment_method",
  effect: { kind: "update_only" },
  continuation,
};
function fixture(fail = false) {
  let options: InitializePaddleOptions | undefined;
  const open = vi.fn(() => {
    if (fail) throw new Error(token);
  });
  const initialize = vi.fn(
    async (value: InitializePaddleOptions | undefined) => {
      options = value;
      return {
        Initialized: true,
        Checkout: {
          open,
          close: vi.fn(),
          updateCheckout: vi.fn(),
          updateItems: vi.fn(),
        },
      } as Pick<Paddle, "Initialized" | "Checkout">;
    },
  );
  const adapter = createPaddlePaymentMethodBrowser(
    `test_${"a".repeat(27)}`,
    initialize,
  );
  return {
    adapter,
    initialize,
    open,
    signal: (name: string) =>
      options?.eventCallback?.({ name } as Parameters<
        NonNullable<InitializePaddleOptions["eventCallback"]>
      >[0]),
  };
}
describe("strict frontend payment-method boundary", () => {
  it.each([
    "provider",
    "customer",
    "subscription",
    "account",
    "workspace",
    "transaction",
    "destination",
    "url",
    "environment",
  ])("rejects browser %s", (key) => {
    expect(
      paymentMethodRequestSchema.safeParse({
        intent: "update_payment_method",
        [key]: "forged",
      }).success,
    ).toBe(false);
  });
  it("parses exact reference-free safe states", () => {
    expect(
      paymentMethodStateSchema.safeParse({
        available: true,
        status: "past_due",
        maySettleExistingBalance: true,
      }).success,
    ).toBe(true);
    expect(
      paymentMethodStateSchema.safeParse({
        available: false,
        reason: "not_available",
        maySettleExistingBalance: false,
      }).success,
    ).toBe(true);
    expect(
      paymentMethodStateSchema.safeParse({
        available: true,
        status: "active",
        maySettleExistingBalance: true,
      }).success,
    ).toBe(false);
  });
  it.each([
    "customer",
    "preparationId",
    "authorityRevision",
    "portalUrl",
    "evidence",
  ])("rejects response %s", (key) =>
    expect(
      paymentMethodResponseSchema.safeParse({ ...response, [key]: token })
        .success,
    ).toBe(false),
  );
  it.each([
    { provider: "lemonsqueezy" },
    { provider: "unknown" },
    { environment: "live" },
    { token: "https://example.test" },
    { token: "" },
    { token: "opaque\u0000token" },
    { token: "opaque\u001ftoken" },
    { token: "opaque\u007ftoken" },
    { token: "opaque token" },
    { token: "a".repeat(257) },
    { destination: "https://example.test" },
  ])(
    "rejects unsupported continuation at the registered adapter boundary %j",
    (delta) => {
      const f = fixture();
      const registry = createPaymentMethodBrowserRegistry(
        new Map([["paddle", f.adapter]]),
      );
      expect(() =>
        registry.forContinuation({ ...continuation, ...delta }),
      ).toThrow();
      expect(f.initialize).not.toHaveBeenCalled();
      expect(f.open).not.toHaveBeenCalled();
    },
  );
  it.each(["-1", "1.2", "01", "0", "9".repeat(17)])(
    "rejects unsafe collection amount %s",
    (amountMinor) =>
      expect(
        paymentMethodResponseSchema.safeParse({
          ...response,
          effect: {
            kind: "settle_existing_balance",
            amountMinor,
            currency: "USD",
          },
        }).success,
      ).toBe(false),
  );
});
describe("Paddle existing-transaction browser capability", () => {
  it.each([
    undefined,
    "",
    "live_fake",
    "pdl_sdbx_fake",
    "test_ short",
    "test_short",
  ])(
    "invalid client configuration fails before initialization",
    async (value) => {
      const initialize = vi.fn();
      const adapter = createPaddlePaymentMethodBrowser(value, initialize);
      await expect(adapter.ready()).rejects.toThrow("not configured");
      expect(initialize).not.toHaveBeenCalled();
      expect(() => sandboxClientToken(value)).toThrow();
    },
  );
  it("initializes once and passes only the exact transaction", async () => {
    const f = fixture();
    await Promise.all([f.adapter.ready(), f.adapter.ready()]);
    await f.adapter.open(continuation);
    await f.adapter.open(continuation);
    expect(f.initialize).toHaveBeenCalledTimes(1);
    expect(f.initialize.mock.calls[0][0]).toMatchObject({
      environment: "sandbox",
      token: `test_${"a".repeat(27)}`,
    });
    expect(f.open.mock.calls).toEqual([
      [{ transactionId: token }],
      [{ transactionId: token }],
    ]);
  });
  it("routes by continuation and rejects unknown/live/LS without new-sales selection", () => {
    const f = fixture();
    const registry = createPaymentMethodBrowserRegistry(
      new Map([["paddle", f.adapter]]),
    );
    expect(registry.forContinuation(continuation)).toBe(f.adapter);
    for (const delta of [
      { provider: "unknown" },
      { provider: "lemonsqueezy" },
      { environment: "live" },
    ])
      expect(() =>
        registry.forContinuation({ ...continuation, ...delta }),
      ).toThrow();
  });
  it("SDK launch failure is safe and never retried", async () => {
    const f = fixture(true);
    await expect(f.adapter.open(continuation)).rejects.toThrow(
      "could not be opened",
    );
    expect(f.open).toHaveBeenCalledTimes(1);
  });
  it("SDK load failure is safe, retained, and never retried", async () => {
    const initialize = vi.fn(async () => {
      throw new Error(token);
    });
    const adapter = createPaddlePaymentMethodBrowser(
      `test_${"a".repeat(27)}`,
      initialize,
    );
    await expect(adapter.ready()).rejects.toThrow("could not be opened");
    await expect(adapter.ready()).rejects.toThrow("could not be opened");
    expect(initialize).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, { Initialized: false, Checkout: { open: vi.fn() } }])(
    "missing or uninitialized SDK fails closed",
    async (sdk) => {
      const adapter = createPaddlePaymentMethodBrowser(
        `test_${"a".repeat(27)}`,
        vi.fn(
          async () =>
            sdk as Pick<Paddle, "Initialized" | "Checkout"> | undefined,
        ),
      );
      await expect(adapter.ready()).rejects.toThrow("could not be opened");
    },
  );
  it("SDK loading is finitely bounded", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createPaddlePaymentMethodBrowser(
        `test_${"a".repeat(27)}`,
        () => new Promise(() => {}),
      );
      const assertion = expect(adapter.ready()).rejects.toThrow(
        "could not be opened",
      );
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
  it("checkout events expose only UI signals and unsubscribe", async () => {
    const f = fixture();
    const listener = vi.fn();
    const remove = f.adapter.subscribe(listener);
    await f.adapter.ready();
    f.signal("checkout.loaded");
    f.signal("checkout.completed");
    f.signal("checkout.closed");
    f.signal("checkout.error");
    f.signal("checkout.failed");
    remove();
    f.signal("checkout.completed");
    expect(listener.mock.calls).toEqual([
      ["completed"],
      ["closed"],
      ["failed"],
      ["failed"],
    ]);
  });
});
describe("immediate launch privacy and authority", () => {
  it.each([
    { ...response, intent: "manage_billing" },
    { ...response, continuation: { ...continuation, environment: "live" } },
    {
      ...response,
      continuation: { ...continuation, provider: "lemonsqueezy" },
    },
    { ...response, continuation: { ...continuation, token: "invalid" } },
    { ...response, customerReference: "synthetic-customer" },
  ])(
    "malformed server continuation never launches or retries",
    async (data) => {
      const f = fixture();
      const invoke = vi.fn(async () => ({ data, error: null }));
      await expect(
        activatePaymentMethodUpdate({
          ready: () => f.adapter.ready(),
          invoke,
          registry: createPaymentMethodBrowserRegistry(
            new Map([["paddle", f.adapter]]),
          ),
        }),
      ).rejects.toThrow("temporarily unavailable");
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(f.open).not.toHaveBeenCalled();
    },
  );
  it("parses a server-approved balance effect without deriving an amount", async () => {
    const f = fixture();
    const invoke = vi.fn(async () => ({
      data: {
        ...response,
        effect: {
          kind: "settle_existing_balance",
          amountMinor: "1234567890123456",
          currency: "USD",
        },
      },
      error: null,
    }));
    expect(
      await activatePaymentMethodUpdate({
        ready: () => f.adapter.ready(),
        invoke,
        registry: createPaymentMethodBrowserRegistry(
          new Map([["paddle", f.adapter]]),
        ),
      }),
    ).toBeUndefined();
    expect(f.open.mock.calls).toEqual([[{ transactionId: token }]]);
  });
  it("sends only intent, launches once and returns no cacheable continuation", async () => {
    const f = fixture();
    const invoke = vi.fn(async () => ({ data: response, error: null }));
    const result = await activatePaymentMethodUpdate({
      ready: () => f.adapter.ready(),
      invoke,
      registry: createPaymentMethodBrowserRegistry(
        new Map([["paddle", f.adapter]]),
      ),
    });
    expect(result).toBeUndefined();
    expect(invoke.mock.calls).toEqual([[{ intent: "update_payment_method" }]]);
    expect(f.open).toHaveBeenCalledTimes(1);
  });
  it("configuration failure prevents server preparation", async () => {
    const f = fixture();
    const invoke = vi.fn();
    await expect(
      activatePaymentMethodUpdate({
        ready: async () => {
          sandboxClientToken(null);
        },
        invoke,
        registry: createPaymentMethodBrowserRegistry(
          new Map([["paddle", f.adapter]]),
        ),
      }),
    ).rejects.toThrow("not configured");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("provider failure never retries preparation or leaks a raw token", async () => {
    const f = fixture();
    const invoke = vi.fn(async () => {
      throw new Error(token);
    });
    await expect(
      activatePaymentMethodUpdate({
        ready: () => f.adapter.ready(),
        invoke,
        registry: createPaymentMethodBrowserRegistry(
          new Map([["paddle", f.adapter]]),
        ),
      }),
    ).rejects.toThrow("temporarily unavailable");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(f.open).not.toHaveBeenCalled();
    expect(
      safePaymentMethodError({ code: token, message: token }).message,
    ).not.toContain(token);
  });
  it("safe known server outcomes remain allowlisted", () => {
    expect(
      safePaymentMethodError({
        code: "BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED",
        message: token,
      }).message,
    ).toContain("Refresh billing");
    expect(
      safePaymentMethodError({
        code: "BILLING_PAYMENT_METHOD_PROVIDER_AMBIGUOUS",
      }).message,
    ).toContain("do not submit");
  });
  it("only authenticated backend recovery facts can end pending verification", () => {
    const state = {
      available: true as const,
      status: "active" as const,
      maySettleExistingBalance: false,
    };
    expect(paymentMethodRecoveryConfirmed(false, state)).toBe(false);
    expect(paymentMethodRecoveryConfirmed(true, state)).toBe(true);
    expect(
      paymentMethodRecoveryConfirmed(true, {
        available: false,
        reason: "not_available",
        maySettleExistingBalance: false,
      }),
    ).toBe(false);
    expect(
      paymentMethodRecoveryConfirmed(true, {
        available: true,
        status: "past_due",
        maySettleExistingBalance: true,
      }),
    ).toBe(false);
    expect(PAYMENT_METHOD_POLL_DURATION_MS / PAYMENT_METHOD_POLL_MS).toBe(15);
  });
  it("browser path has no storage, navigation, telemetry or server-key consultation", () => {
    const paths = [
      "payment-method-api.ts",
      "use-payment-method-update.ts",
      "providers/payment-method-browser.ts",
      "providers/paddle-payment-method.ts",
      "billing-management-panel.tsx",
    ];
    for (const path of paths) {
      const source = readFileSync(`src/features/billing/${path}`, "utf8");
      expect(source).not.toMatch(
        /localStorage|sessionStorage|indexedDB|setQueryData|location\.assign|console\.|Sentry|forNewSales|PADDLE_SANDBOX_API_KEY|PAYMENT_METHOD_API_KEY|CHECKOUT_API_KEY|portal=return/,
      );
    }
    for (const path of [...paths, "payment-method-verification.ts"]) {
      expect(readFileSync(`src/features/billing/${path}`, "utf8")).not.toMatch(
        /get_my_billing_provider_summary|useBillingProviderSummary|fetchBillingProviderSummary/,
      );
    }
    const hook = readFileSync(
      "src/features/billing/use-payment-method-update.ts",
      "utf8",
    );
    expect(hook).toContain("retry: false");
    expect(hook).toContain("gcTime: 0");
  });
});
