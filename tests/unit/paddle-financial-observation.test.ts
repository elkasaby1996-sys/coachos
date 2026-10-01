import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { financialMinor } from "../../supabase/functions/_shared/paddle-webhook/financial-observation";
import { observeEvent } from "../../supabase/functions/_shared/paddle-webhook/observation";
import { createPaddleSandboxWebhookVerifier } from "../../supabase/functions/_shared/paddle-webhook/index";
import { createPaddleWebhookIngress } from "../../supabase/functions/_shared/paddle-webhook/ingress";

const secret = "synthetic-recovery-webhook-secret";
const now = Date.parse("2026-10-20T12:00:00Z");
const config = {
  environment: "test" as const,
  secrets: [{ environment: "sandbox" as const, value: secret }],
  now: () => now,
};
function fixture(kind = "transaction.past_due", seats = false) {
  const paid = ["transaction.paid", "transaction.completed"].includes(kind);
  const amount = seats ? "7100" : "5900";
  const item = (suffix: string, price: string) => ({
    quantity: 1,
    price: {
      id: `synthetic/price/${suffix}`,
      product_id: `synthetic/product/${suffix}`,
      unit_price: { amount: price, currency_code: "USD" },
    },
  });
  return {
    event_id: "synthetic/event",
    notification_id: "synthetic/delivery",
    event_type: kind,
    occurred_at: "2026-10-20T12:00:00Z",
    data: {
      id: "synthetic/transaction",
      customer_id: "synthetic/customer",
      subscription_id: "synthetic/subscription",
      status:
        kind === "transaction.canceled"
          ? "canceled"
          : paid
            ? kind.slice(12)
            : "past_due",
      origin: "subscription_recurring",
      collection_mode: "automatic",
      currency_code: "USD",
      updated_at: "2026-10-20T11:59:59.123456799Z",
      billing_period: {
        starts_at: "2026-10-20T00:00:00Z",
        ends_at: "2026-11-20T00:00:00Z",
      },
      items: [item("base", "5900"), ...(seats ? [item("seat", "1200")] : [])],
      details: {
        totals: {
          subtotal: amount,
          tax: "0",
          discount: "0",
          total: amount,
          credit: "0",
          credit_to_balance: "0",
          grand_total: amount,
          balance: paid ? "0" : amount,
        },
      },
      payments: [
        {
          payment_attempt_id: "synthetic/attempt",
          amount,
          status: paid ? "captured" : "error",
        },
      ],
      custom_data: { private: "must-drop" },
    },
  };
}
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const signature = (value: unknown) =>
  `ts=${now / 1000};h1=${createHmac("sha256", secret)
    .update(`${now / 1000}:`)
    .update(raw(value))
    .digest("hex")}`;
const signed = (value: unknown) => ({
  method: "POST",
  headers: [
    ["content-type", "application/json"],
    ["paddle-signature", signature(value)],
  ] as [string, string][],
  rawBody: raw(value),
});

describe("retained Paddle recurring financial facts", () => {
  it("retains a strictly zero-valued payment-method completion without payment authority", () => {
    const f = fixture("transaction.completed");
    f.data.origin = "subscription_payment_method_change";
    f.data.payments = [];
    for (const key of ["subtotal", "total", "grand_total", "balance"] as const)
      f.data.details.totals[key] = "0";
    const o = observeEvent(raw(f));
    expect(o.kind).toBe("transaction.completed");
    if (o.kind !== "transaction.completed") throw new Error("fixture");
    expect(o.origin).toBe("subscription_payment_method_change");
    expect(o.financial?.totals.grandTotal).toBe("0");
    expect(o.financial?.captured).toBe("0");
    expect(o.financial?.payments).toEqual([]);
  });
  it("retains cancellation as invalidation when voided totals are no longer collectible", () => {
    const f = fixture("transaction.canceled");
    f.data.details.totals.balance = "0";
    const o = observeEvent(raw(f));
    expect(o.kind).toBe("transaction.canceled");
    expect(o).not.toHaveProperty("financial");
    expect(o).not.toHaveProperty("paymentTotals");
  });
  it.each([
    "transaction.past_due",
    "transaction.payment_failed",
    "transaction.updated",
    "transaction.paid",
    "transaction.completed",
    "transaction.canceled",
  ])("authenticates and preserves exact event %s", async (kind) => {
    const v = createPaddleSandboxWebhookVerifier(config);
    const result = await v.verify(signed(fixture(kind)));
    expect(result.kind).toBe("supported");
    if (result.kind !== "supported") throw new Error("fixture");
    expect(result.observation.kind).toBe(kind);
    expect(
      v.ingestionArguments(result.receipt).p_proof.eventEvidence.eventName,
    ).toBe(kind);
    expect(JSON.stringify(result.observation)).not.toContain("must-drop");
  });
  it.each([false, true])(
    "retains complete recurring totals without operation markers: seats=%s",
    (seats) => {
      const o = observeEvent(raw(fixture("transaction.past_due", seats)));
      expect(o).toMatchObject({
        financial: {
          captured: "0",
          resourceUpdatedAt: "2026-10-20T11:59:59.123456799Z",
          totals: { grandTotal: seats ? "7100" : "5900" },
        },
        paymentTotals: {
          total: seats ? 7100 : 5900,
          paid: 0,
          balance: seats ? 7100 : 5900,
        },
      });
      expect(o).not.toHaveProperty("planChangeOperationId");
      expect(o).not.toHaveProperty("seatQuantityOperationId");
    },
  );
  it.each([
    0,
    -1,
    1.1,
    "-1",
    "01",
    "1.1",
    "1e3",
    "9007199254740992",
    "10000000000000000",
    null,
    {},
    "",
    true,
  ])("rejects unsafe money %#", (v) =>
    expect(() => financialMinor(v)).toThrow("event_invalid"),
  );
  it.each(["0", "1", "9007199254740991"])(
    "preserves exact bounded money %s",
    (v) => expect(financialMinor(v)).toBe(v),
  );
  it.each([
    (f: ReturnType<typeof fixture>) => {
      f.data.details.totals.total = "1";
    },
    (f: ReturnType<typeof fixture>) => {
      f.data.details.totals.balance = "1";
    },
    (f: ReturnType<typeof fixture>) => {
      f.data.payments.push({ ...f.data.payments[0]! });
    },
    (f: ReturnType<typeof fixture>) => {
      f.data.updated_at = "2026-02-30T00:00:00Z";
    },
    (f: ReturnType<typeof fixture>) => {
      f.data.updated_at = "2026-10-20T00:00:00.1234567891Z";
    },
    (f: ReturnType<typeof fixture>) => {
      f.data.payments[0]!.amount = "-1";
    },
    (f: ReturnType<typeof fixture>) => {
      f.data.payments[0]!.status = "private message";
    },
    (f: ReturnType<typeof fixture>) => {
      f.data.collection_mode = "unknown";
    },
    (f: ReturnType<typeof fixture>) => {
      f.data.payments = Array.from({ length: 33 }, (_, i) => ({
        ...f.data.payments[0]!,
        payment_attempt_id: `synthetic/attempt/${i}`,
      }));
    },
  ])("rejects malformed/inconsistent financial facts %#", (mutate) => {
    const f = fixture();
    mutate(f);
    expect(() => observeEvent(raw(f))).toThrow("event_invalid");
  });
  it("preserves sparse historical evidence without fabricating financial authority", () => {
    const { details: _details, ...data } = fixture().data;
    expect(_details).toBeDefined();
    expect(observeEvent(raw({ ...fixture(), data }))).not.toHaveProperty(
      "financial",
    );
  });
  it("payment-method-only transaction never becomes recurring debt", () => {
    const f = fixture("transaction.completed");
    f.data.origin = "subscription_payment_method_change";
    f.data.items = [];
    f.data.payments = [];
    f.data.details.totals = {
      subtotal: "0",
      tax: "0",
      discount: "0",
      total: "0",
      credit: "0",
      credit_to_balance: "0",
      grand_total: "0",
      balance: "0",
    };
    const observed = observeEvent(raw(f));
    expect(observed).toHaveProperty("financial.totals.grandTotal", "0");
    expect(observed).toHaveProperty("financial.captured", "0");
  });
  it.each(["adjustment.created", "adjustment.updated"])(
    "retains only invalidation facts for %s",
    async (kind) => {
      const f = {
        ...fixture(),
        event_type: kind,
        data: {
          id: "synthetic/adjustment",
          transaction_id: "synthetic/transaction",
          customer_id: "synthetic/customer",
          status: "approved",
          updated_at: "2026-10-20T12:00:00Z",
          items: [{ private: "drop" }],
        },
      };
      const r = await createPaddleSandboxWebhookVerifier(config).verify(
        signed(f),
      );
      expect(r.kind).toBe("supported");
      expect(r.observation).toMatchObject({
        kind,
        transactionRef: "synthetic/transaction",
        subscriptionRef: null,
      });
      expect(r.observation).not.toHaveProperty("items");
    },
  );
  it("does not rename subscription.past_due", () => {
    const f = fixture();
    const data = {
      ...f.data,
      id: "synthetic/subscription",
      items: f.data.items.map((i) => ({ ...i, status: "active" })),
      current_billing_period: f.data.billing_period,
      next_billed_at: null,
      canceled_at: null,
      paused_at: null,
      scheduled_change: null,
    };
    expect(
      observeEvent(raw({ ...f, event_type: "subscription.past_due", data })),
    ).toMatchObject({
      kind: "subscription.past_due",
      eventType: "subscription.past_due",
      status: "past_due",
    });
  });
  it.each([
    "transaction.past_due",
    "transaction.payment_failed",
    "transaction.updated",
    "transaction.paid",
    "transaction.completed",
    "transaction.canceled",
  ])("routes %s to private evidence RPCs only", async (kind) => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        error: null,
        data: {
          accepted: true,
          reused: false,
          eventId: "00000000-0000-4000-8000-000000000001",
          eventType: kind,
        },
      })
      .mockResolvedValueOnce({ error: null, data: { status: "pending" } })
      .mockResolvedValueOnce({
        error: null,
        data: { status: "not_applicable" },
      });
    const f = fixture(kind);
    const req = new Request("https://example.invalid/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "paddle-signature": signature(f),
      },
      body: JSON.stringify(f),
    });
    const response = await createPaddleWebhookIngress(config, { rpc })(req);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("accepted");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "ingest_verified_paddle_recovery_event_v1",
      "reconcile_paddle_payment_recovery_event_v1",
      ...(kind === "transaction.completed"
        ? ["reconcile_billing_payment_method_preparation_v1"]
        : []),
    ]);
  });
  it("rejects unsigned recovery evidence before database dispatch", async () => {
    const rpc = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await createPaddleWebhookIngress(config, { rpc })(
        new Request("https://example.invalid/webhook", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(fixture()),
        }),
      );
      expect(response.status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        "synthetic/transaction",
      );
    } finally {
      warn.mockRestore();
    }
  });
});
