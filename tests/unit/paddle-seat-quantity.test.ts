import { describe, it, expect, vi } from "vitest";
import {
  createPaddleSeatTransport,
  handlePaddleSeatAction,
  type PaddleSeatContext,
} from "../../supabase/functions/_shared/paddle-seat-quantity";
import { handleSeatQuantity } from "../../supabase/functions/_shared/billing-seat-quantity";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";
import { observeEvent } from "../../supabase/functions/_shared/paddle-webhook/observation";
const ref = (prefix: string, n = "1") => `${prefix}_${n.repeat(26)}`;
const operation = "a0700000-0000-4000-8000-000000000001";
const context: PaddleSeatContext = {
  subscriptionRef: ref("sub"),
  customerRef: ref("ctm"),
  cadence: "monthly",
  base: { priceRef: ref("pri"), productRef: ref("pro"), amount: 5900 },
  seat: {
    priceRef: ref("pri", "2"),
    productRef: ref("pro", "2"),
    amount: 1200,
  },
  additionalSeats: 0,
  maximumAdditionalSeats: 3,
  periodStart: "2026-09-20T00:00:00Z",
  periodEnd: "2026-10-20T00:00:00Z",
  providerUpdatedAt: "2026-09-27T00:00:00Z",
};
function data(n = 0, c = context) {
  const cycle = {
    interval: c.cadence === "monthly" ? "month" : "year",
    frequency: 1,
  };
  return {
    id: c.subscriptionRef,
    customer_id: c.customerRef,
    status: "active",
    collection_mode: "automatic",
    scheduled_change: null,
    canceled_at: null,
    paused_at: null,
    billing_cycle: cycle,
    current_billing_period: { starts_at: c.periodStart, ends_at: c.periodEnd },
    next_billed_at: c.periodEnd,
    updated_at: c.providerUpdatedAt,
    custom_data: { retained: "synthetic" },
    items: [
      { ...c.base, quantity: 1 },
      ...(n ? [{ ...c.seat, quantity: n }] : []),
    ].map((x) => ({
      quantity: x.quantity,
      status: "active",
      price: {
        id: x.priceRef,
        product_id: x.productRef,
        unit_price: { amount: String(x.amount), currency_code: "USD" },
        billing_cycle: cycle,
      },
    })),
  };
}
function setup(value: unknown = data()) {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ data: value }),
  );
  return {
    fetcher,
    transport: createPaddleSeatTransport("test", "pdl_sdbx_synthetic", fetcher),
  };
}
describe("Paddle seat transport", () => {
  it.each([0, 1, 2, 3, 4, 5])(
    "target %i uses additional-only quantity",
    async (n) => {
      const c = {
        ...context,
        additionalSeats: n === 0 ? 1 : 0,
        maximumAdditionalSeats: 5,
      };
      const { fetcher, transport } = setup(data(n, c));
      await transport.update(c, n, operation, {
        retained: "synthetic",
        repsync_plan_change_operation: operation,
      });
      const [url, init] = fetcher.mock.calls[0]!;
      const body = JSON.parse(String(init?.body));
      expect(url).toBe(
        `https://sandbox-api.paddle.com/subscriptions/${c.subscriptionRef}`,
      );
      expect(body.items).toEqual([
        { price_id: c.base.priceRef, quantity: 1 },
        ...(n ? [{ price_id: c.seat.priceRef, quantity: n }] : []),
      ]);
      expect(body.proration_billing_mode).toBe(
        n ? "prorated_immediately" : "do_not_bill",
      );
      expect(body.on_payment_failure).toBe("prevent_change");
      expect(body.custom_data).toEqual({
        retained: "synthetic",
        repsync_seat_quantity_operation: operation,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("annual mapping and recurring item remain yearly", async () => {
    const c = {
      ...context,
      cadence: "annual" as const,
      periodEnd: "2027-09-20T00:00:00Z",
      seat: { ...context.seat, amount: 12000 },
    };
    await expect(
      setup(data(1, c)).transport.update(c, 1, operation, {}),
    ).resolves.toBeUndefined();
  });
  it("preview is nonmutating path", async () => {
    const { transport, fetcher } = setup(data(1));
    await transport.preview(context, 1, operation, {});
    expect(String(fetcher.mock.calls[0]![0])).toMatch(/\/preview$/);
  });
  it.each(["live", "sandbox", ""])("rejects environment %s", (environment) => {
    const f = vi.fn();
    expect(() =>
      createPaddleSeatTransport(environment, "pdl_sdbx_synthetic", f),
    ).toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it.each([
    "duplicate",
    "unknown",
    "wrong-price",
    "wrong-product",
    "wrong-cadence",
    "wrong-quantity",
    "missing-base",
    "canceled",
    "paused",
    "period",
  ])("rejects %s source drift", async (kind) => {
    const c = { ...context, additionalSeats: 1 };
    const d = data(1, c);
    if (kind === "duplicate") d.items.push(d.items[1]!);
    if (kind === "unknown")
      d.items.push({
        ...d.items[1]!,
        price: { ...d.items[1]!.price, id: ref("pri", "3") },
      });
    if (kind === "wrong-price") d.items[1]!.price.id = ref("pri", "3");
    if (kind === "wrong-product")
      d.items[1]!.price.product_id = ref("pro", "3");
    if (kind === "wrong-cadence")
      d.items[1]!.price.billing_cycle = { interval: "year", frequency: 1 };
    if (kind === "wrong-quantity") d.items[1]!.quantity = 2;
    if (kind === "missing-base") d.items.shift();
    if (kind === "canceled" || kind === "paused") d.status = kind;
    if (kind === "period")
      d.current_billing_period.ends_at = "2026-11-20T00:00:00Z";
    const { transport, fetcher } = setup(d);
    await expect(transport.retrieve(c)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["malformed", "content-type", "oversized", "network"])(
    "%s accepted PATCH is ambiguous with no retry",
    async (kind) => {
      const f = vi.fn<typeof fetch>(async () => {
        if (kind === "network") throw Error("private provider response");
        return new Response(
          kind === "oversized" ? "x".repeat(1048577) : "bad",
          {
            headers: {
              "content-type":
                kind === "content-type" ? "text/html" : "application/json",
            },
          },
        );
      });
      await expect(
        createPaddleSeatTransport("test", "pdl_sdbx_synthetic", f).update(
          context,
          1,
          operation,
          {},
        ),
      ).rejects.toMatchObject({
        code: "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
      });
      expect(f).toHaveBeenCalledTimes(1);
    },
  );
  it("timeout is non-dispatchable and never retried", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn<typeof fetch>(() => new Promise(() => {}));
      const result = createPaddleSeatTransport(
        "test",
        "pdl_sdbx_synthetic",
        f,
      ).update(context, 1, operation, {});
      const check = expect(result).rejects.toMatchObject({
        code: "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
      });
      await vi.advanceTimersByTimeAsync(30000);
      await check;
      expect(f).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("definite rejection is payment failure", async () => {
    const f = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 422 }),
    );
    await expect(
      createPaddleSeatTransport("test", "pdl_sdbx_synthetic", f).update(
        context,
        1,
        operation,
        {},
      ),
    ).rejects.toMatchObject({ code: "BILLING_SEAT_QUANTITY_PAYMENT_FAILED" });
  });
});
function dependencies() {
  const calls: string[] = [];
  const state = { available: true };
  const transport = {
    retrieve: vi.fn(async () => {
      calls.push("GET");
      return { snapshot: {}, custom: {} };
    }),
    preview: vi.fn(async () => {}),
    update: vi.fn(async () => {
      calls.push("PATCH");
    }),
  };
  const deps = {
    authenticate: vi.fn(async () => ({ id: operation })),
    paddleSeats: () => transport,
    config: vi.fn(() => {
      throw Error("legacy route");
    }),
    serviceRpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === "paddle_plan_change_route_v1") return true;
      if (name === "begin_paddle_seat_quantity_v1")
        return args.p_snapshot === null
          ? { needsSnapshot: true }
          : { dispatch: true, id: operation, context };
      if (name === "paddle_seat_quantity_context_v1") return context;
      return {};
    }),
    ownerRpc: () => vi.fn(async () => state),
    log: vi.fn(),
  } as unknown as BillingDependencies;
  return { deps, transport, calls };
}
describe("Paddle seat orchestration", () => {
  it("routes before LS config and commits before PATCH", async () => {
    const { deps, calls } = dependencies();
    const r = await handleSeatQuantity(
      new Request("https://local.invalid", {
        method: "POST",
        headers: { authorization: "Bearer synthetic" },
        body: JSON.stringify({
          targetAdditionalSeats: 1,
          operationId: operation,
        }),
      }),
      deps,
      "apply",
    );
    expect(r.status).toBe(200);
    expect(calls.indexOf("PATCH")).toBeGreaterThan(
      calls.lastIndexOf("begin_paddle_seat_quantity_v1"),
    );
    expect(deps.config).not.toHaveBeenCalled();
    expect(calls.filter((x) => x === "PATCH")).toHaveLength(1);
  });
  it("preview validates through GET and preview only without durable begin", async () => {
    const { deps, transport, calls } = dependencies();
    const original = deps.serviceRpc;
    deps.serviceRpc = async (name, args) =>
      name === "preview_paddle_seat_quantity_v1"
        ? { eligible: true, direction: "increase" }
        : original(name, args);
    await handlePaddleSeatAction(deps, operation, "synthetic", "preview", {
      targetAdditionalSeats: 1,
    });
    expect(transport.retrieve).toHaveBeenCalledTimes(1);
    expect(transport.preview).toHaveBeenCalledTimes(1);
    expect(transport.update).not.toHaveBeenCalled();
    expect(calls).not.toContain("begin_paddle_seat_quantity_v1");
  });
  it("dispatch uses the target mapping committed with the operation", async () => {
    const { deps, transport } = dependencies();
    const committed = {
      ...context,
      seat: { ...context.seat, priceRef: ref("pri", "3") },
    };
    const original = deps.serviceRpc;
    deps.serviceRpc = async (name, args) =>
      name === "begin_paddle_seat_quantity_v1" && args.p_snapshot !== null
        ? { dispatch: true, id: operation, context: committed }
        : original(name, args);
    await handlePaddleSeatAction(deps, operation, "synthetic", "apply", {
      targetAdditionalSeats: 1,
      operationId: operation,
    });
    expect(transport.update).toHaveBeenCalledWith(committed, 1, operation, {});
  });
  it("exact retry needs no GET or PATCH", async () => {
    const { deps, transport } = dependencies();
    deps.serviceRpc = vi.fn(async () => ({ dispatch: false }));
    await handlePaddleSeatAction(deps, operation, "synthetic", "apply", {
      operationId: operation,
      targetAdditionalSeats: 1,
    });
    expect(transport.retrieve).not.toHaveBeenCalled();
    expect(transport.update).not.toHaveBeenCalled();
  });
  it("refresh has no provider or service writes", async () => {
    const { deps, transport } = dependencies();
    await handlePaddleSeatAction(deps, operation, "synthetic", "refresh", {});
    expect(deps.serviceRpc).not.toHaveBeenCalled();
    expect(transport.retrieve).not.toHaveBeenCalled();
    expect(transport.update).not.toHaveBeenCalled();
  });
  it("Paddle cancellation fails before provider access", async () => {
    const { deps, transport } = dependencies();
    await expect(
      handlePaddleSeatAction(deps, operation, "synthetic", "cancel", {
        operationId: operation,
      }),
    ).rejects.toMatchObject({ code: "BILLING_SEAT_QUANTITY_CANNOT_CANCEL" });
    expect(transport.update).not.toHaveBeenCalled();
  });
  it("ambiguous response records state once and sanitizes output", async () => {
    const { deps, transport } = dependencies();
    transport.update.mockRejectedValueOnce(Error("private response"));
    await expect(
      handlePaddleSeatAction(deps, operation, "synthetic", "apply", {
        operationId: operation,
        targetAdditionalSeats: 1,
      }),
    ).rejects.toMatchObject({
      code: "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
    });
    expect(deps.serviceRpc).toHaveBeenCalledWith(
      "fail_paddle_seat_quantity_v1",
      { p_owner: operation, p_operation: operation, p_ambiguous: true },
    );
    expect(transport.update).toHaveBeenCalledTimes(1);
  });
  it.each([
    { targetAdditionalSeats: 1, subscriptionRef: ref("sub") },
    { targetAdditionalSeats: 1, priceRef: ref("pri") },
    { targetAdditionalSeats: 1, accountId: operation },
  ])("rejects browser authority %#", async (body) => {
    const { deps, transport } = dependencies();
    const r = await handleSeatQuantity(
      new Request("https://local.invalid", {
        method: "POST",
        headers: { authorization: "Bearer synthetic" },
        body: JSON.stringify(body),
      }),
      deps,
      "preview",
    );
    expect(r.status).not.toBe(200);
    expect(transport.retrieve).not.toHaveBeenCalled();
  });
  it("unauthenticated owner cannot route", async () => {
    const { deps } = dependencies();
    const r = await handleSeatQuantity(
      new Request("https://local.invalid", { method: "POST", body: "{}" }),
      deps,
      "refresh",
    );
    expect(r.status).toBe(401);
    expect(deps.serviceRpc).not.toHaveBeenCalled();
  });
});
describe("seat event correlation", () => {
  const event = () => ({
    event_id: "synthetic/event",
    notification_id: "synthetic/notification",
    event_type: "transaction.completed",
    occurred_at: "2026-09-27T01:00:00Z",
    data: {
      id: "synthetic/transaction",
      status: "completed",
      currency_code: "USD",
      origin: "subscription_update",
      subscription_id: context.subscriptionRef,
      customer_id: context.customerRef,
      custom_data: { repsync_seat_quantity_operation: operation },
      items: data(2).items.slice(1),
      details: { totals: { grand_total: "1200", balance: "0" } },
      payments: [{ status: "captured", amount: "1200" }],
    },
  });
  it("retains explicit seat correlation and captured totals", () => {
    const r = observeEvent(new TextEncoder().encode(JSON.stringify(event())));
    expect(r).toMatchObject({
      seatQuantityOperationId: operation,
      paymentTotals: { total: 1200, paid: 1200, balance: 0 },
    });
    expect(r).not.toHaveProperty("planChangeOperationId");
  });
  it("rejects mixed plan and seat markers", () => {
    const e = event();
    Object.assign(e.data.custom_data, {
      repsync_plan_change_operation: operation,
    });
    expect(() =>
      observeEvent(new TextEncoder().encode(JSON.stringify(e))),
    ).toThrow();
  });
  it("negative seat line requires the distinct settlement marker and origin", () => {
    const e = event();
    e.data.items[0]!.quantity = -1;
    expect(
      observeEvent(new TextEncoder().encode(JSON.stringify(e))),
    ).toMatchObject({ items: [{ quantity: -1 }] });
    e.data.origin = "subscription_recurring";
    expect(() =>
      observeEvent(new TextEncoder().encode(JSON.stringify(e))),
    ).toThrow();
  });
});
