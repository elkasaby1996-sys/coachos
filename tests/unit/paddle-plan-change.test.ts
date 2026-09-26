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
    immediate_transaction: {
      details: { totals: { grand_total: "2700", currency_code: "USD" } },
    },
    update_summary: {
      result: { action: "charge", amount: "2700", currency_code: "USD" },
    },
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
    const quote = await transport.preview(
      context,
      target,
      "immediate",
      operation,
      {},
    );
    expect(quote).toEqual({
      action: "charge",
      amountMinor: 2700,
      currencyCode: "USD",
    });
    expect(JSON.stringify(quote)).not.toMatch(/sub_|ctm_|pri_|pro_|txn_/);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toMatch(
      /\/preview$/,
    );
  });
  it("accepts a documented preview without a subscription id", async () => {
    const { id: _id, ...preview } = data(true);
    const { transport, fetcher } = setup(preview);
    await expect(
      transport.preview(context, target, "immediate", operation, {}),
    ).resolves.toEqual({
      action: "charge",
      amountMinor: 2700,
      currencyCode: "USD",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toMatch(
      /\/preview$/,
    );
  });
  it.each([
    { field: "id", value: ref("sub", "3") },
    { field: "customer_id", value: ref("ctm", "3") },
    { field: "items", value: [] },
    { field: "status", value: "paused" },
  ])("rejects a mismatched preview $field", async ({ field, value }) => {
    const { id: _id, ...preview } = data(true);
    const { transport } = setup({ ...preview, [field]: value });
    await expect(
      transport.preview(context, target, "immediate", operation, {}),
    ).rejects.toMatchObject({
      code: "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS",
    });
  });
  it("distinguishes preview HTTP and transport failures", async () => {
    const rejected = setup({}, 422);
    await expect(
      rejected.transport.preview(context, target, "immediate", operation, {}),
    ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PROVIDER_FAILED" });
    const lost = vi.fn(async () => {
      throw new Error("synthetic transport failure");
    });
    const transport = createPaddlePlanTransport(
      "test",
      "pdl_sdbx_synthetic",
      lost,
    );
    await expect(
      transport.preview(context, target, "immediate", operation, {}),
    ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PROVIDER_FAILED" });
  });
  it.each([
    { label: "missing summary", update_summary: undefined },
    { label: "null summary", update_summary: null },
    {
      label: "missing result",
      update_summary: { result: null },
    },
    {
      label: "zero charge",
      update_summary: {
        result: { action: "charge", amount: "0", currency_code: "USD" },
      },
    },
    {
      label: "credit for paid upgrade",
      update_summary: {
        result: { action: "credit", amount: "2700", currency_code: "USD" },
      },
    },
    {
      label: "currency mismatch",
      update_summary: {
        result: { action: "charge", amount: "2700", currency_code: "EUR" },
      },
    },
    {
      label: "invalid amount",
      update_summary: {
        result: { action: "charge", amount: "27.00", currency_code: "USD" },
      },
    },
    {
      label: "unsafe amount",
      update_summary: {
        result: {
          action: "charge",
          amount: "9007199254740992",
          currency_code: "USD",
        },
      },
    },
  ])(
    "rejects $label for an immediate paid preview",
    async ({ update_summary }) => {
      const { transport } = setup({ ...data(true), update_summary });
      await expect(
        transport.preview(context, target, "immediate", operation, {}),
      ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PROVIDER_FAILED" });
    },
  );
  it.each([undefined, null])(
    "accepts an absent scheduled update summary (%s)",
    async (update_summary) => {
      const { transport } = setup({ ...data(true), update_summary });
      await expect(
        transport.preview(context, target, "period_end", operation, {}),
      ).resolves.toBeUndefined();
    },
  );
  it.each([
    { label: "array summary", summary: [] },
    { label: "string summary", summary: "invalid" },
    { label: "boolean summary", summary: false },
    { label: "numeric summary", summary: 0 },
    { label: "missing result", summary: {} },
    { label: "null result", summary: { result: null } },
    { label: "array result", summary: { result: [] } },
    { label: "string result", summary: { result: "invalid" } },
    { label: "boolean result", summary: { result: false } },
    { label: "numeric result", summary: { result: 0 } },
    {
      label: "missing action",
      summary: { result: { amount: "125", currency_code: "USD" } },
    },
    {
      label: "invalid action",
      summary: {
        result: { action: "refund", amount: "125", currency_code: "USD" },
      },
    },
    {
      label: "decimal amount",
      summary: {
        result: { action: "credit", amount: "1.25", currency_code: "USD" },
      },
    },
    {
      label: "numeric amount",
      summary: {
        result: { action: "credit", amount: 125, currency_code: "USD" },
      },
    },
    {
      label: "missing amount",
      summary: { result: { action: "credit", currency_code: "USD" } },
    },
    {
      label: "missing currency",
      summary: { result: { action: "credit", amount: "125" } },
    },
    {
      label: "invalid currency",
      summary: {
        result: { action: "credit", amount: "125", currency_code: "EUR" },
      },
    },
  ])(
    "rejects a present malformed scheduled quote: $label",
    async ({ summary }) => {
      const { transport } = setup({ ...data(true), update_summary: summary });
      await expect(
        transport.preview(context, target, "period_end", operation, {}),
      ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PROVIDER_FAILED" });
    },
  );
  it("retains a valid credit quote for a scheduled change", async () => {
    const { transport } = setup({
      ...data(true),
      update_summary: {
        result: { action: "credit", amount: "125", currency_code: "USD" },
      },
    });
    await expect(
      transport.preview(context, target, "period_end", operation, {}),
    ).resolves.toEqual({
      action: "credit",
      amountMinor: 125,
      currencyCode: "USD",
    });
  });
  it("still requires an id on the actual update response", async () => {
    const { id: _id, ...response } = data(true);
    const { transport } = setup(response);
    await expect(
      transport.update(context, target, "immediate", operation, {}),
    ).rejects.toMatchObject({ code: "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS" });
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
  it("preview does not begin a durable operation or invoke update", async () => {
    const retrieve = vi.fn(async () => ({
      snapshot: { subscriptionRef: context.subscriptionRef },
      custom: {},
    }));
    const quote = { action: "charge", amountMinor: 2700, currencyCode: "USD" };
    const preview = vi.fn(async () => quote);
    const update = vi.fn();
    const serviceRpc = vi.fn(async (name: string) => {
      if (name === "paddle_plan_change_context_v1") return context;
      if (name === "preview_paddle_plan_change_v1")
        return {
          targetPriceRef: target.priceRef,
          targetProductRef: target.productRef,
          preview: {
            targetPriceMinor: target.amount,
            effectiveTiming: "immediate",
          },
        };
      throw new Error(`unexpected RPC: ${name}`);
    });
    const deps = {
      paddlePlans: () => ({ retrieve, preview, update }),
      serviceRpc,
    } as unknown as BillingDependencies;
    const result = await handlePaddlePlanAction(
      deps,
      "owner",
      "token",
      "preview",
      {
        targetPlanKey: "scale",
        targetCadence: "monthly",
        operationId: operation,
      },
    );
    expect(serviceRpc.mock.calls.map(([name]) => name)).toEqual([
      "paddle_plan_change_context_v1",
      "preview_paddle_plan_change_v1",
    ]);
    expect(preview).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(result).toEqual({
      targetPriceMinor: target.amount,
      effectiveTiming: "immediate",
      quote,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /sub_|ctm_|pri_|pro_|transaction/,
    );
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
