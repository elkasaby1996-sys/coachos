import { observeEvent } from "../../supabase/functions/_shared/paddle-webhook/observation";
import { describe, expect, it, vi } from "vitest";
import {
  createPaddlePlanTransport,
  handlePaddlePlanAction,
} from "../../supabase/functions/_shared/paddle-plan-change";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";

const ref = (prefix: string, digit = "1") => `${prefix}_${digit.repeat(26)}`;
const context = {
  subscriptionRef: ref("sub"),
  customerRef: ref("ctm"),
  sourcePriceRef: ref("pri"),
  sourceProductRef: ref("pro"),
  sourceAmount: 3900,
  periodStart: "2026-09-20T00:00:00Z",
  periodEnd: "2026-10-20T00:00:00Z",
  cadence: "monthly" as const,
};
const target = {
  priceRef: ref("pri", "2"),
  productRef: ref("pro", "2"),
  amount: 6900,
};
const operation = "a0700000-0000-4000-8000-000000000001";
function data(changed = false) {
  return {
    id: context.subscriptionRef,
    customer_id: context.customerRef,
    status: "active",
    collection_mode: "automatic",
    scheduled_change: null,
    canceled_at: null,
    paused_at: null,
    billing_cycle: { frequency: 1, interval: "month" },
    current_billing_period: {
      starts_at: "2026-09-20T00:00:00Z",
      ends_at: "2026-10-20T00:00:00Z",
    },
    next_billed_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-09-24T00:00:00Z",
    custom_data: { retained: "synthetic" },
    items: [
      {
        quantity: 1,
        status: "active",
        price: {
          id: changed ? target.priceRef : context.sourcePriceRef,
          product_id: changed ? target.productRef : context.sourceProductRef,
          unit_price: {
            amount: changed ? "6900" : "3900",
            currency_code: "USD",
          },
        },
      },
    ],
    immediate_transaction: { details: { totals: { grand_total: "2700" } } },
  };
}
function setup(value: unknown = data(true), status = 200) {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: value }), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  return {
    fetcher,
    transport: createPaddlePlanTransport("test", "pdl_sdbx_synthetic", fetcher),
  };
}
describe("server-only Paddle plan transport", () => {
  it("rejects live configuration before IO", () => {
    const f = vi.fn();
    expect(() =>
      createPaddlePlanTransport("live", "pdl_sdbx_synthetic", f),
    ).toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it("annual transport preserves the yearly cadence", async () => {
    const value = {
      ...data(true),
      billing_cycle: { frequency: 1, interval: "year" },
      current_billing_period: {
        starts_at: context.periodStart,
        ends_at: "2027-09-20T00:00:00Z",
      },
      next_billed_at: "2027-09-20T00:00:00Z",
    };
    const { transport } = setup(value);
    await expect(
      transport.update(
        { ...context, cadence: "annual", periodEnd: "2027-09-20T00:00:00Z" },
        target,
        "immediate",
        operation,
        {},
      ),
    ).resolves.toBeUndefined();
  });
  it("retrieves a validated current snapshot", async () => {
    const { transport } = setup(data());
    expect((await transport.retrieve(context)).snapshot.quantity).toBe(1);
  });
  it.each(["immediate", "period_end"])(
    "sends one complete replacement with %s billing",
    async (timing) => {
      const { transport, fetcher } = setup();
      await transport.update(context, target, timing, operation, {
        retained: "synthetic",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(
        `https://sandbox-api.paddle.com/subscriptions/${context.subscriptionRef}`,
      );
      expect(init.redirect).toBe("error");
      expect(JSON.parse(init.body as string)).toEqual({
        items: [{ price_id: target.priceRef, quantity: 1 }],
        proration_billing_mode:
          timing === "immediate" ? "prorated_immediately" : "do_not_bill",
        on_payment_failure: "prevent_change",
        custom_data: {
          retained: "synthetic",
          repsync_plan_change_operation: operation,
        },
      });
    },
  );
  it("preview uses the preview endpoint", async () => {
    const { transport, fetcher } = setup();
    await transport.preview(context, target, "immediate", operation, {});
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toMatch(
      /\/preview$/,
    );
  });
  it.each([null, {}, { ...data(true), items: [] }])(
    "malformed mutation response is ambiguous",
    async (value) => {
      const { transport, fetcher } = setup(value);
      await expect(
        transport.update(context, target, "immediate", operation, {}),
      ).rejects.toMatchObject({
        code: "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("payment rejection never retries", async () => {
    const { transport, fetcher } = setup({}, 400);
    await expect(
      transport.update(context, target, "immediate", operation, {}),
    ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PAYMENT_FAILED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("server uncertainty never retries", async () => {
    const { transport, fetcher } = setup({}, 503);
    await expect(
      transport.update(context, target, "immediate", operation, {}),
    ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("connection loss remains ambiguous", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("synthetic private response");
    });
    const transport = createPaddlePlanTransport(
      "test",
      "pdl_sdbx_synthetic",
      fetcher,
    );
    await expect(
      transport.update(context, target, "immediate", operation, {}),
    ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("exact retry and refresh perform no provider calls", async () => {
    const provider = vi.fn();
    const read = vi.fn(async () => ({ linked: true }));
    const deps = {
      paddlePlans: provider,
      serviceRpc: vi.fn(async () => ({ dispatch: false })),
      ownerRpc: () => read,
    } as unknown as BillingDependencies;
    const input = {
      targetPlanKey: "scale",
      targetCadence: "monthly",
      operationId: operation,
    };
    await handlePaddlePlanAction(deps, "owner", "token", "apply", input);
    await handlePaddlePlanAction(deps, "owner", "token", "refresh", {});
    expect(provider).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe("Paddle plan settlement projection", () => {
  function event(payments: unknown[]) {
    return {
      event_id: "synthetic/event",
      notification_id: "synthetic/notice",
      event_type: "transaction.completed",
      occurred_at: "2026-09-24T00:00:00Z",
      data: {
        id: "synthetic/transaction",
        subscription_id: context.subscriptionRef,
        customer_id: context.customerRef,
        status: "completed",
        currency_code: "USD",
        items: data(true).items,
        custom_data: {
          repsync_plan_change_operation: operation,
          private: "must-drop",
        },
        details: { totals: { grand_total: "3000", balance: "0" } },
        payments,
      },
    };
  }
  const project = (value: unknown) =>
    observeEvent(new TextEncoder().encode(JSON.stringify(value)));
  it("retains only operation UUID and captured settlement totals", () => {
    const observed = project(
      event([
        { status: "captured", amount: "3000", private: "must-drop" },
        { status: "failed", amount: "3000" },
      ]),
    );
    expect(observed).toMatchObject({
      planChangeOperationId: operation,
      paymentTotals: { total: 3000, paid: 3000, balance: 0 },
    });
    expect(JSON.stringify(observed)).not.toContain("must-drop");
  });
  it("failed payment supplies no captured authority", () => {
    expect(
      project(event([{ status: "failed", amount: "3000" }])),
    ).toMatchObject({ paymentTotals: { paid: 0 } });
  });
  it("rejects invalid captured money", () => {
    expect(() =>
      project(event([{ status: "captured", amount: "-1" }])),
    ).toThrow();
  });
});
