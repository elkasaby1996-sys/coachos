import { describe, it, expect, vi } from "vitest";
import {
  comparePaddleResourceRevisions,
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
  resourceUpdatedAt: "2026-09-27T00:00:00Z",
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
// These golden vectors also appear in paddle_seat_resource_freshness.sql.
// Ordering is GET relative to authority; no full epoch value is a JS Number.
const exactRevisionVectors = [
  ["offset-positive", "2026-09-29T10:00:00Z", "2026-09-29T13:00:00+03:00", 0],
  ["offset-negative", "2026-09-29T10:00:00Z", "2026-09-29T05:00:00-05:00", 0],
  [
    "fraction-spelling",
    "2026-09-29T10:00:00.1Z",
    "2026-09-29T10:00:00.100000000Z",
    0,
  ],
  [
    "stale-99ns",
    "2026-09-29T10:00:00.123456799Z",
    "2026-09-29T10:00:00.123456700Z",
    -1,
  ],
  [
    "exact-current",
    "2026-09-29T10:00:00.123456799Z",
    "2026-09-29T10:00:00.123456799Z",
    0,
  ],
  [
    "newer-1ns",
    "2026-09-29T10:00:00.123456799Z",
    "2026-09-29T10:00:00.123456800Z",
    1,
  ],
  [
    "rounding-boundary",
    "2026-09-29T10:00:00.123999999Z",
    "2026-09-29T10:00:00.123999999Z",
    0,
  ],
  [
    "offset-rollover",
    "2026-09-29T23:00:00.123456789Z",
    "2026-09-30T02:00:00.123456789+03:00",
    0,
  ],
  [
    "negative-rollover",
    "2026-09-29T00:00:00.123456789Z",
    "2026-09-28T19:00:00.123456789-05:00",
    0,
  ],
  [
    "stale-sub-millisecond",
    "2026-09-29T10:00:00.123900Z",
    "2026-09-29T10:00:00.123800Z",
    -1,
  ],
  [
    "pre-epoch",
    "1960-01-01T00:00:00.123456789Z",
    "1959-12-31T19:00:00.123456789-05:00",
    0,
  ],
  [
    "fraction-1",
    "2026-09-29T10:00:00.1Z",
    "2026-09-29T13:00:00.100000000+03:00",
    0,
  ],
  [
    "fraction-2",
    "2026-09-29T10:00:00.12Z",
    "2026-09-29T13:00:00.120000000+03:00",
    0,
  ],
  [
    "fraction-3",
    "2026-09-29T10:00:00.123Z",
    "2026-09-29T13:00:00.123000000+03:00",
    0,
  ],
  [
    "fraction-4",
    "2026-09-29T10:00:00.1234Z",
    "2026-09-29T13:00:00.123400000+03:00",
    0,
  ],
  [
    "fraction-5",
    "2026-09-29T10:00:00.12345Z",
    "2026-09-29T13:00:00.123450000+03:00",
    0,
  ],
  [
    "fraction-6",
    "2026-09-29T10:00:00.123456Z",
    "2026-09-29T13:00:00.123456000+03:00",
    0,
  ],
  [
    "fraction-7",
    "2026-09-29T10:00:00.1234567Z",
    "2026-09-29T13:00:00.123456700+03:00",
    0,
  ],
  [
    "fraction-8",
    "2026-09-29T10:00:00.12345678Z",
    "2026-09-29T13:00:00.123456780+03:00",
    0,
  ],
  [
    "fraction-9",
    "2026-09-29T10:00:00.123456789Z",
    "2026-09-29T13:00:00.123456789+03:00",
    0,
  ],
] as const;
describe("exact Paddle resource revision contract", () => {
  it.each(exactRevisionVectors)(
    "%s comparator preserves full precision",
    (_label, authority, snapshot, expected) => {
      expect(comparePaddleResourceRevisions(snapshot, authority)).toBe(
        expected,
      );
      expect(comparePaddleResourceRevisions(authority, snapshot)).toBe(
        expected === 0 ? 0 : -expected,
      );
    },
  );
  it.each(exactRevisionVectors)(
    "%s retrieve enforces exact freshness",
    async (_label, authority, snapshot, expected) => {
      const c = { ...context, resourceUpdatedAt: authority };
      const { transport, fetcher } = setup({
        ...data(0, c),
        updated_at: snapshot,
      });
      const result = transport.retrieve(c);
      if (expected < 0) await expect(result).rejects.toThrow();
      else await expect(result).resolves.toBeDefined();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    null,
    undefined,
    "",
    "2026-02-30T00:00:00Z",
    "2026-09-29T10:00:00.1234567890Z",
    "2026-09-29T10:00:00",
    "2026-09-29T10:00:60Z",
  ])("rejects invalid revision %s on either side", (value) => {
    expect(() =>
      comparePaddleResourceRevisions(value, context.providerUpdatedAt),
    ).toThrow();
    expect(() =>
      comparePaddleResourceRevisions(context.providerUpdatedAt, value),
    ).toThrow();
  });
});
describe("Paddle seat transport", () => {
  it.each([null, "2026-09-27T00:00:00Z"])(
    "ignores a later event watermark with resource watermark %s",
    async (resourceUpdatedAt) => {
      const c = {
        ...context,
        providerUpdatedAt: "2026-09-28T00:00:00Z",
        resourceUpdatedAt,
      };
      await expect(setup(data()).transport.retrieve(c)).resolves.toBeDefined();
    },
  );
  it("rejects a GET behind a comparable authenticated resource revision", async () => {
    const c = { ...context, resourceUpdatedAt: "2026-09-28T00:00:00Z" };
    await expect(setup(data()).transport.retrieve(c)).rejects.toThrow();
  });
  it.each([undefined, null, "", "invalid", "2026-02-30T00:00:00Z"])(
    "requires a real GET updated_at even with no historical resource revision (%s)",
    async (updated_at) => {
      await expect(
        setup({ ...data(), updated_at }).transport.retrieve({
          ...context,
          resourceUpdatedAt: null,
        }),
      ).rejects.toThrow();
    },
  );
  it("fails closed against an old database context missing the new contract", async () => {
    const c = { ...context };
    Reflect.deleteProperty(c, "resourceUpdatedAt");
    await expect(setup(data()).transport.retrieve(c)).rejects.toThrow();
  });
  it.each([
    ["subscription", "id", "different"],
    ["customer", "customer_id", "different"],
    ["status", "status", "past_due"],
    ["collection", "collection_mode", "manual"],
    ["schedule", "scheduled_change", {}],
    ["cancellation", "canceled_at", context.periodStart],
    ["pause", "paused_at", context.periodStart],
    ["frequency", "billing_cycle.frequency", 2],
    ["interval", "billing_cycle.interval", "year"],
    ["period start", "current_billing_period.starts_at", context.periodEnd],
    ["period end", "current_billing_period.ends_at", context.periodStart],
    ["next billed", "next_billed_at", context.periodStart],
    ["items array", "items", {}],
    ["quantity", "items.0.quantity", 2],
    ["item status", "items.0.status", "inactive"],
    ["price identity", "items.0.price.id", "different"],
    ["product identity", "items.0.price.product_id", "different"],
    ["currency", "items.0.price.unit_price.currency_code", "EUR"],
    ["amount", "items.0.price.unit_price.amount", "1"],
    ["recurrence frequency", "items.0.price.billing_cycle.frequency", 2],
    ["recurrence interval", "items.0.price.billing_cycle.interval", "year"],
    ["custom type", "custom_data", []],
    ["custom size", "custom_data", { value: "x".repeat(8193) }],
  ])(
    "historical fallback still rejects independent %s drift",
    async (_name, path, value) => {
      // Each case starts from an independently cloned, otherwise valid snapshot.
      const d = structuredClone(data());
      const keys = String(path).split(".");
      let parent: object = d;
      for (const key of keys.slice(0, -1)) parent = Reflect.get(parent, key);
      Reflect.set(parent, keys.at(-1)!, value);
      await expect(
        setup(d).transport.retrieve({ ...context, resourceUpdatedAt: null }),
      ).rejects.toThrow();
    },
  );
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
      const f = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
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
  it.each(["stale", "missing", "malformed"])(
    "%s GET creates no durable operation or PATCH",
    async (kind) => {
      const { deps } = dependencies();
      const d = data();
      if (kind === "stale") d.updated_at = "2026-09-26T00:00:00Z";
      if (kind === "missing") Reflect.deleteProperty(d, "updated_at");
      if (kind === "malformed") d.updated_at = "invalid";
      const { transport, fetcher } = setup(d);
      deps.paddleSeats = () => transport;
      await expect(
        handlePaddleSeatAction(deps, operation, "synthetic", "apply", {
          targetAdditionalSeats: 1,
          operationId: operation,
        }),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]![1]?.method).toBe("GET");
      const begins = vi
        .mocked(deps.serviceRpc)
        .mock.calls.filter(
          ([name]) => name === "begin_paddle_seat_quantity_v1",
        );
      expect(begins).toHaveLength(1);
      expect(begins[0]![1].p_snapshot).toBeNull();
    },
  );
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
