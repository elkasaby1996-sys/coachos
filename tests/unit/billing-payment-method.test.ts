import { describe, expect, it, vi } from "vitest";
import {
  handlePaymentMethodUpdate,
  paymentMethodRequest,
} from "../../supabase/functions/_shared/billing-payment-method";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";
import type { PaymentMethodUpdateCapability } from "../../supabase/functions/_shared/billing-provider";

const transaction = `txn_${"1".repeat(26)}`;
const context = {
  provider: "paddle",
  environment: "test",
  mode: "update_only",
  subscriptionRef: `sub_${"1".repeat(26)}`,
  customerRef: `ctm_${"1".repeat(26)}`,
  items: [
    {
      priceRef: `pri_${"1".repeat(26)}`,
      productRef: `pro_${"1".repeat(26)}`,
      quantity: 1,
      amount: "5900",
    },
  ],
};
function request(
  body: unknown = { intent: "update_payment_method" },
  authorization = true,
) {
  return new Request("https://example.invalid/billing-update-payment-method", {
    method: "POST",
    headers: {
      ...(authorization ? { Authorization: "Bearer synthetic" } : {}),
    },
    body: JSON.stringify(body),
  });
}
function fixture(state: "creating" | "ready" = "creating") {
  const release = vi.fn(() => ({
    kind: "provider_checkout" as const,
    provider: "paddle",
    environment: "test" as const,
    token: transaction,
  }));
  const prepared = {
    transactionReference: transaction,
    effect: { kind: "update_only" as const },
    normalizedResultSha256: "a".repeat(64),
    status: "checkout_ready" as const,
    release,
  };
  const transport: PaymentMethodUpdateCapability = {
    validateConfiguration: vi.fn(),
    prepare: vi.fn(async () => prepared),
    inspect: vi.fn(async () => prepared),
  };
  const serviceRpc = vi.fn(async (name: string) => {
    switch (name) {
      case "resolve_owned_billing_payment_method_context_v1":
        return context;
      case "begin_billing_payment_method_preparation_v1":
        return {
          preparationId: "synthetic-preparation",
          status: state,
          context,
          ...(state === "ready" ? { transactionRef: transaction } : {}),
        };
      case "claim_billing_payment_method_dispatch_v1":
        return { dispatch: true, context };
      case "record_billing_payment_method_preparation_result_v1":
        return { status: "ready" };
      case "authorize_billing_payment_method_continuation_v1":
        return { status: "ready", transactionRef: transaction };
      case "fail_billing_payment_method_preparation_v1":
        return { status: "ambiguous" };
      default:
        throw new Error(`Unexpected RPC ${name}`);
    }
  });
  const paymentMethodTransport = vi.fn(() => transport);
  const log = vi.fn();
  const deps = {
    authenticate: vi.fn(async () => ({ id: "synthetic-owner" })),
    serviceRpc,
    paymentMethodTransport,
    log,
    config: () => null,
    ownerRpc: () => serviceRpc,
  } as unknown as BillingDependencies;
  return {
    deps,
    serviceRpc,
    transport,
    prepared,
    release,
    paymentMethodTransport,
    log,
  };
}
describe("payment-method server boundary", () => {
  it("accepts only the closed intent body", () => {
    expect(paymentMethodRequest({ intent: "update_payment_method" })).toBe(
      "update_payment_method",
    );
    for (const body of [
      { intent: "update_payment_method", provider: "paddle" },
      { intent: "other" },
      [],
    ])
      expect(() => paymentMethodRequest(body)).toThrow();
  });
  it("denies unauthenticated callers before any database or provider work", async () => {
    const f = fixture();
    const response = await handlePaymentMethodUpdate(
      request(undefined, false),
      f.deps,
    );
    expect(response.status).toBe(401);
    expect(f.serviceRpc).not.toHaveBeenCalled();
    expect(f.paymentMethodTransport).not.toHaveBeenCalled();
  });
  it("rejects browser-supplied identity before provider selection", async () => {
    const f = fixture();
    const response = await handlePaymentMethodUpdate(
      request({ intent: "update_payment_method", subscription: "forged" }),
      f.deps,
    );
    expect(response.status).toBe(400);
    expect(f.serviceRpc).not.toHaveBeenCalled();
  });
  it("claims before exactly one provider creation call and returns only safe fields", async () => {
    const f = fixture();
    const response = await handlePaymentMethodUpdate(request(), f.deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toEqual({
      intent: "update_payment_method",
      effect: { kind: "update_only" },
      continuation: {
        kind: "provider_checkout",
        provider: "paddle",
        environment: "test",
        token: transaction,
      },
    });
    expect(f.serviceRpc.mock.calls.map(([name]) => name)).toEqual([
      "resolve_owned_billing_payment_method_context_v1",
      "begin_billing_payment_method_preparation_v1",
      "claim_billing_payment_method_dispatch_v1",
      "record_billing_payment_method_preparation_result_v1",
      "authorize_billing_payment_method_continuation_v1",
    ]);
    expect(f.transport.prepare).toHaveBeenCalledTimes(1);
    expect(f.transport.inspect).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.paymentMethodTransport).toHaveBeenCalledWith("paddle", "test");
  });
  it("inspects a ready transaction and never calls the creation endpoint", async () => {
    const f = fixture("ready");
    const response = await handlePaymentMethodUpdate(request(), f.deps);
    expect(response.status).toBe(200);
    expect(f.transport.inspect).toHaveBeenCalledTimes(1);
    expect(f.transport.prepare).not.toHaveBeenCalled();
    expect(f.serviceRpc.mock.calls.map(([name]) => name)).not.toContain(
      "claim_billing_payment_method_dispatch_v1",
    );
  });
  it("withholds continuation if the post-provider authority recheck fails", async () => {
    const f = fixture();
    f.serviceRpc.mockImplementation(async (name: string) => {
      if (name === "authorize_billing_payment_method_continuation_v1")
        throw new Error("BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED");
      if (name === "resolve_owned_billing_payment_method_context_v1")
        return context;
      if (name === "begin_billing_payment_method_preparation_v1")
        return {
          preparationId: "synthetic-preparation",
          status: "creating",
          context,
        };
      if (name === "claim_billing_payment_method_dispatch_v1")
        return { dispatch: true, context };
      if (name === "record_billing_payment_method_preparation_result_v1")
        return { status: "ready" };
      if (name === "fail_billing_payment_method_preparation_v1")
        return { status: "ambiguous" };
      throw new Error("unexpected");
    });
    const response = await handlePaymentMethodUpdate(request(), f.deps);
    expect(response.status).toBe(503);
    expect(f.release).not.toHaveBeenCalled();
    expect(f.transport.prepare).toHaveBeenCalledTimes(1);
    expect(f.log.mock.calls[0]?.[0]).not.toHaveProperty("transactionReference");
  });
  it("never dispatches for unknown or historical provider identity", async () => {
    for (const provider of ["unknown", "lemonsqueezy"]) {
      const f = fixture();
      f.serviceRpc.mockResolvedValueOnce({ ...context, provider });
      f.paymentMethodTransport.mockImplementation(() => {
        throw new Error("unregistered");
      });
      const response = await handlePaymentMethodUpdate(request(), f.deps);
      expect(response.status).toBe(503);
      expect(f.transport.prepare).not.toHaveBeenCalled();
      expect(f.serviceRpc.mock.calls.map(([name]) => name)).not.toContain(
        "begin_billing_payment_method_preparation_v1",
      );
    }
  });
  it("rejects missing dedicated configuration before creating a reservation", async () => {
    const f = fixture();
    vi.mocked(f.transport.validateConfiguration).mockImplementation(() => {
      throw new Error("configuration unavailable");
    });
    const response = await handlePaymentMethodUpdate(request(), f.deps);
    expect(response.status).toBe(503);
    expect(f.serviceRpc.mock.calls.map(([name]) => name)).toEqual([
      "resolve_owned_billing_payment_method_context_v1",
    ]);
    expect(f.transport.prepare).not.toHaveBeenCalled();
  });
  it("records a claimed provider failure as ambiguous without a second dispatch", async () => {
    const f = fixture();
    vi.mocked(f.transport.prepare).mockRejectedValue(
      new Error("network uncertain"),
    );
    const response = await handlePaymentMethodUpdate(request(), f.deps);
    expect(response.status).toBe(503);
    expect(f.transport.prepare).toHaveBeenCalledTimes(1);
    expect(f.serviceRpc.mock.calls.map(([name]) => name)).toContain(
      "fail_billing_payment_method_preparation_v1",
    );
    expect(f.release).not.toHaveBeenCalled();
  });
  it("withholds ready reuse on inspection failure and never claims a new dispatch", async () => {
    const f = fixture("ready");
    vi.mocked(f.transport.inspect).mockRejectedValue(
      new Error("inspection unavailable"),
    );
    const response = await handlePaymentMethodUpdate(request(), f.deps);
    expect(response.status).toBe(503);
    expect(f.transport.inspect).toHaveBeenCalledTimes(1);
    expect(f.transport.prepare).not.toHaveBeenCalled();
    expect(f.serviceRpc.mock.calls.map(([name]) => name)).not.toContain(
      "fail_billing_payment_method_preparation_v1",
    );
    expect(f.release).not.toHaveBeenCalled();
  });
});
