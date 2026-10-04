import { describe, expect, it, vi } from "vitest";
import { createPaddlePaymentMethodTransport } from "../../supabase/functions/_shared/paddle-payment-method";
import type { PaymentMethodUpdateExpectation } from "../../supabase/functions/_shared/billing-provider";

const ref = (prefix: string, digit = "1") => `${prefix}_${digit.repeat(26)}`;
const expected: PaymentMethodUpdateExpectation = {
  identity: {
    provider: "paddle",
    environment: "test",
    subscriptionReference: ref("sub"),
    customerReference: ref("ctm"),
  },
  mode: "update_only",
  items: [
    {
      priceReference: ref("pri"),
      productReference: ref("pro"),
      quantity: 1,
      unitAmountMinor: "5900",
    },
  ],
};
function response(mode: "active" | "past_due" = "active") {
  const due = mode === "past_due";
  return {
    id: ref("txn"),
    status: due ? "past_due" : "ready",
    customer_id: ref("ctm"),
    subscription_id: ref("sub"),
    origin: due
      ? "subscription_recurring"
      : "subscription_payment_method_change",
    collection_mode: "automatic",
    currency_code: "USD",
    discount_id: null,
    billing_period: {
      starts_at: "2026-10-01T00:00:00Z",
      ends_at: "2026-11-01T00:00:00Z",
    },
    items: [
      {
        price: {
          id: ref("pri"),
          product_id: ref("pro"),
          unit_price: { amount: "5900", currency_code: "USD" },
        },
        quantity: 1,
      },
    ],
    details: {
      totals: {
        subtotal: due ? "5900" : "0",
        tax: "0",
        discount: "0",
        total: due ? "5900" : "0",
        credit: "0",
        credit_to_balance: "0",
        grand_total: due ? "5900" : "0",
        balance: due ? "5900" : "0",
      },
    },
    payments: due ? [{ status: "failed", amount: "5900" }] : [],
    adjustments: [],
  };
}
function setup(data: unknown = response(), status = 200) {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ data }, { status }),
  );
  return {
    fetcher,
    transport: createPaddlePaymentMethodTransport(
      "test",
      "pdl_sdbx_synthetic",
      fetcher,
    ),
  };
}
describe("Paddle payment method transport", () => {
  it("requires the dedicated sandbox configuration before dispatch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const [environment, key] of [
      ["live", "pdl_sdbx_synthetic"],
      ["test", "missing"],
    ]) {
      const transport = createPaddlePaymentMethodTransport(
        environment!,
        key!,
        fetcher,
      );
      expect(() => transport.validateConfiguration()).toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("consumes one committed permit for one creation GET and releases once", async () => {
    const { fetcher, transport } = setup();
    let used = false;
    const prepared = await transport.prepare(expected, {
      consume: () => !used && (used = true),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `https://sandbox-api.paddle.com/subscriptions/${ref("sub")}/update-payment-method-transaction`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "error",
    });
    expect(prepared.effect).toEqual({ kind: "update_only" });
    expect(prepared.release()).toEqual({
      kind: "provider_checkout",
      provider: "paddle",
      environment: "test",
      token: ref("txn"),
    });
    expect(() => prepared.release()).toThrow();
    await expect(
      transport.prepare(expected, { consume: () => false }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("ready reuse inspects the stored transaction without creation", async () => {
    const { fetcher, transport } = setup();
    const prepared = await transport.inspect(expected, ref("txn"));
    expect(prepared.status).toBe("checkout_ready");
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `https://sandbox-api.paddle.com/transactions/${ref("txn")}`,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("validates exact retained past-due identity and amount", async () => {
    const debt: PaymentMethodUpdateExpectation = {
      ...expected,
      mode: "settle_existing_balance",
      obligation: {
        transactionReference: ref("txn"),
        amountMinor: "5900",
        currency: "USD",
        period: {
          startsAt: "2026-10-01T00:00:00Z",
          endsAt: "2026-11-01T00:00:00Z",
        },
      },
    };
    const { transport } = setup(response("past_due"));
    const prepared = await transport.prepare(debt, { consume: () => true });
    expect(prepared.effect).toEqual({
      kind: "settle_existing_balance",
      amountMinor: "5900",
      currency: "USD",
    });
    const wrong = setup({ ...response("past_due"), id: ref("txn", "2") });
    await expect(
      wrong.transport.prepare(debt, { consume: () => true }),
    ).rejects.toThrow();
  });
  it("fails closed on identity, amount, content type and HTTP failures without retry", async () => {
    for (const data of [
      { ...response(), customer_id: ref("ctm", "2") },
      { ...response(), subscription_id: ref("sub", "2") },
      { ...response(), origin: "subscription_update" },
      {
        ...response(),
        details: { totals: { ...response().details.totals, grand_total: "1" } },
      },
    ]) {
      const { fetcher, transport } = setup(data);
      await expect(
        transport.prepare(expected, { consume: () => true }),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const http = setup(response(), 503);
    await expect(
      http.transport.prepare(expected, { consume: () => true }),
    ).rejects.toThrow();
    expect(http.fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects redirects, non-JSON, malformed JSON, oversized bodies and network failures", async () => {
    const bodies = [
      () =>
        new Response("", {
          status: 302,
          headers: { location: "https://example.invalid" },
        }),
      () =>
        new Response("not json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      () =>
        new Response("{", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      () =>
        new Response("x".repeat(1_048_577), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ];
    for (const make of bodies) {
      const fetcher = vi.fn<typeof fetch>(async () => make());
      const transport = createPaddlePaymentMethodTransport(
        "test",
        "pdl_sdbx_synthetic",
        fetcher,
      );
      await expect(
        transport.prepare(expected, { consume: () => true }),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network gone");
    });
    const transport = createPaddlePaymentMethodTransport(
      "test",
      "pdl_sdbx_synthetic",
      fetcher,
    );
    await expect(
      transport.prepare(expected, { consume: () => true }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("withholds checkout for a paid or completed past-due transaction", async () => {
    const debt: PaymentMethodUpdateExpectation = {
      ...expected,
      mode: "settle_existing_balance",
      obligation: {
        transactionReference: ref("txn"),
        amountMinor: "5900",
        currency: "USD",
        period: {
          startsAt: "2026-10-01T00:00:00Z",
          endsAt: "2026-11-01T00:00:00Z",
        },
      },
    };
    for (const status of ["paid", "completed"]) {
      const { transport, fetcher } = setup({ ...response("past_due"), status });
      const paid = {
        ...response("past_due"),
        status,
        details: {
          totals: { ...response("past_due").details.totals, balance: "0" },
        },
        payments: [
          { status: "failed", amount: "5900" },
          { status: "captured", amount: "5900" },
        ],
      };
      fetcher.mockResolvedValueOnce(Response.json({ data: paid }));
      const prepared = await transport.prepare(debt, { consume: () => true });
      expect(prepared.status).toBe("settlement_pending");
      expect(() => prepared.release()).toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("requires the complete expected item multiset and exact debt fields", async () => {
    const debt: PaymentMethodUpdateExpectation = {
      ...expected,
      mode: "settle_existing_balance",
      obligation: {
        transactionReference: ref("txn"),
        amountMinor: "5900",
        currency: "USD",
        period: {
          startsAt: "2026-10-01T00:00:00Z",
          endsAt: "2026-11-01T00:00:00Z",
        },
      },
    };
    for (const bad of [
      { ...response("past_due"), currency_code: "EUR" },
      {
        ...response("past_due"),
        details: {
          totals: { ...response("past_due").details.totals, balance: "0" },
        },
      },
      {
        ...response("past_due"),
        billing_period: {
          starts_at: "2026-10-02T00:00:00Z",
          ends_at: "2026-11-01T00:00:00Z",
        },
      },
      {
        ...response("past_due"),
        items: [{ ...response("past_due").items[0], quantity: 2 }],
      },
      (() => {
        const row = { ...response("past_due"), adjustments: undefined };
        return row;
      })(),
    ]) {
      const { transport, fetcher } = setup(bad);
      await expect(
        transport.prepare(debt, { consume: () => true }),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("times out a mutation-sensitive response without retrying", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Promise<Response>(() => {}),
      );
      const transport = createPaddlePaymentMethodTransport(
        "test",
        "pdl_sdbx_synthetic",
        fetcher,
      );
      const pending = transport.prepare(expected, { consume: () => true });
      const rejected = expect(pending).rejects.toThrow(
        "BILLING_PAYMENT_METHOD_PROVIDER_AMBIGUOUS",
      );
      await vi.advanceTimersByTimeAsync(30_001);
      await rejected;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
