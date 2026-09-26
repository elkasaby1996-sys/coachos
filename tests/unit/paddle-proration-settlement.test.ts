import { createHmac, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPaddleSandboxWebhookVerifier,
  PaddleWebhookError,
} from "../../supabase/functions/_shared/paddle-webhook/index";
import {
  createPaddleWebhookIngress,
  logPaddleWebhookRejection,
} from "../../supabase/functions/_shared/paddle-webhook/ingress";

const secret = "synthetic-proration-webhook-secret-no-provider-authority";
const now = Date.parse("2026-09-26T12:00:00Z");
const config = {
  environment: "test" as const,
  secrets: [{ environment: "sandbox" as const, value: secret }],
  now: () => now,
};
const canary = "SYNTHETIC_PRIVATE_MUST_NEVER_APPEAR_IN_LOGS";
function event() {
  return {
    event_id: "synthetic/event",
    notification_id: "synthetic/notification",
    event_type: "transaction.completed",
    occurred_at: "2026-09-26T12:00:00.123456Z",
    data: {
      id: "synthetic/transaction",
      customer_id: "synthetic/customer",
      subscription_id: "synthetic/subscription",
      status: "completed",
      origin: "subscription_update",
      currency_code: "USD",
      custom_data: {
        repsync_plan_change_operation: randomUUID(),
        private: canary,
      },
      billing_period: {
        starts_at: "2026-09-26T12:00:00Z",
        ends_at: "2026-10-20T00:00:00Z",
      },
      items: [
        {
          quantity: 1,
          price: {
            id: "synthetic/target",
            product_id: "synthetic/target-product",
            unit_price: { amount: "15900", currency_code: "USD" },
          },
        },
        {
          quantity: -1,
          price: {
            id: "synthetic/source",
            product_id: "synthetic/source-product",
            unit_price: { amount: "9900", currency_code: "USD" },
          },
        },
      ],
      details: { totals: { grand_total: "5798", balance: "0" } },
      payments: [
        {
          status: "captured",
          amount: "5798",
          method_details: { private: canary },
        },
        { status: "error", amount: "5798" },
      ],
    },
  };
}
function request(value: unknown) {
  const rawBody = new TextEncoder().encode(JSON.stringify(value));
  const timestamp = String(now / 1000);
  const headers: [string, string][] = [
    ["content-type", "application/json"],
    [
      "paddle-signature",
      `ts=${timestamp};h1=${createHmac("sha256", secret)
        .update(timestamp + ":")
        .update(rawBody)
        .digest("hex")}`,
    ],
  ];
  return { method: "POST", headers, rawBody };
}
const verify = (value: unknown) =>
  createPaddleSandboxWebhookVerifier(config).verify(request(value));
const http = (value: unknown) => {
  const r = request(value);
  return new Request("https://example.invalid/webhook", {
    method: r.method,
    headers: r.headers,
    body: r.rawBody,
  });
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("correlated proration observation", () => {
  it.each([false, true])(
    "preserves signed delta and captured authority in either order (reverse=%s)",
    async (reverse) => {
      vi.stubGlobal("fetch", () => {
        throw new Error("Provider network forbidden");
      });
      const value = event();
      if (reverse) value.data.items.reverse();
      const result = await verify(value);
      expect(result.kind).toBe("supported");
      if (
        result.kind !== "supported" ||
        result.observation.kind !== "transaction.completed"
      )
        throw new Error("Expected transaction");
      expect(result.observation.items.map((i) => i.quantity)).toEqual(
        reverse ? [-1, 1] : [1, -1],
      );
      expect(result.observation.paymentTotals).toEqual({
        total: 5798,
        paid: 5798,
        balance: 0,
      });
      expect(JSON.stringify(result.observation)).not.toContain(canary);
    },
  );
  it.each([
    0,
    -0,
    0.5,
    -0.5,
    2147483648,
    -2147483648,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid quantity %s", async (quantity) => {
    const value = event();
    value.data.items[1]!.quantity = quantity;
    await expect(verify(value)).rejects.toMatchObject({
      code: "event_invalid",
    });
  });
  it.each([2147483647, -2147483647])(
    "bounds signed structural magnitude at %s; SQL owns exact quantity",
    async (quantity) => {
      const value = event();
      value.data.items[1]!.quantity = quantity;
      expect((await verify(value)).kind).toBe("supported");
    },
  );
  it.each(["subscription.created", "subscription.updated"])(
    "keeps %s positive even with marker",
    async (event_type) => {
      const value = event();
      await expect(
        verify({
          ...value,
          event_type,
          data: {
            ...value.data,
            status: "active",
            items: value.data.items.map((i) => ({ ...i, status: "active" })),
          },
        }),
      ).rejects.toMatchObject({ code: "event_invalid" });
    },
  );
  it.each([null, {}, { repsync_plan_change_operation: "invalid" }])(
    "rejects negative uncorrelated/malformed marker",
    async (custom_data) => {
      const value = event();
      await expect(
        verify({ ...value, data: { ...value.data, custom_data } }),
      ).rejects.toMatchObject({ code: "event_invalid" });
    },
  );
  it.each(["subscription_recurring", "web", undefined])(
    "rejects negative ordinary origin %s",
    async (origin) => {
      const value = event();
      await expect(
        verify({ ...value, data: { ...value.data, origin } }),
      ).rejects.toMatchObject({ code: "event_invalid" });
    },
  );
  it.each([
    { price: null },
    {
      price: {
        id: "",
        product_id: "synthetic/product",
        unit_price: { amount: "100", currency_code: "USD" },
      },
    },
    {
      price: {
        id: "synthetic/price",
        product_id: {},
        unit_price: { amount: "100", currency_code: "USD" },
      },
    },
    {
      price: {
        id: "synthetic/price",
        product_id: "synthetic/product",
        unit_price: { amount: "-100", currency_code: "USD" },
      },
    },
    {
      price: {
        id: "synthetic/price",
        product_id: "synthetic/product",
        unit_price: { amount: "100", currency_code: "usd" },
      },
    },
  ])("rejects malformed price/product/amount/currency", async (item) => {
    const value = event();
    await expect(
      verify({
        ...value,
        data: {
          ...value.data,
          items: [{ quantity: 1, ...item }, value.data.items[1]],
        },
      }),
    ).rejects.toMatchObject({ code: "event_invalid" });
  });
  // Structural parsing cannot know which provider reference is source or target.
  // Swapped/same signs MUST fail the operation-bound SQL tests, not be guessed here.
  it("does not derive payment from catalogue difference", async () => {
    const value = event();
    value.data.details.totals.grand_total = "6123";
    value.data.payments[0]!.amount = "6123";
    const result = await verify(value);
    if (
      result.kind !== "supported" ||
      result.observation.kind !== "transaction.completed"
    )
      throw new Error("Expected transaction");
    expect(result.observation.paymentTotals?.total).toBe(6123);
  });
});

describe("signed proration ingress and private diagnostics", () => {
  const stored = {
    accepted: true,
    reused: false,
    eventId: randomUUID(),
    eventType: "transaction.completed",
  };
  it("ingests once and dispatches a valid signed delta", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: null, data: stored })
      .mockResolvedValueOnce({ error: null, data: { status: "applied" } });
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await createPaddleWebhookIngress(config, { rpc })(
      http(event()),
    );
    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "ingest_verified_paddle_event_v1",
      "reconcile_paddle_initial_purchase_event_v1",
    ]);
    expect(log).not.toHaveBeenCalled();
  });
  it("rejects signed zero before DB and logs only allowlisted primitives", async () => {
    const rpc = vi.fn();
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const value = event();
    value.data.items[1]!.quantity = 0;
    const response = await createPaddleWebhookIngress(config, { rpc })(
      http(value),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("rejected");
    expect(rpc).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([
      [
        JSON.stringify({
          event: "paddle_webhook_rejected",
          stage: "verification",
          code: "event_invalid",
          status: 400,
        }),
      ],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /synthetic\/|SYNTHETIC_PRIVATE|custom_data|h1=|5798/,
    );
  });
  it.each(["ingestion", "dispatch"] as const)(
    "never logs private %s errors",
    async (stage) => {
      const rpc = vi.fn();
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});
      if (stage === "dispatch")
        rpc.mockResolvedValueOnce({ error: null, data: stored });
      rpc.mockRejectedValueOnce({
        message: canary,
        details: event(),
        signature: secret,
      });
      expect(
        (await createPaddleWebhookIngress(config, { rpc })(http(event())))
          .status,
      ).toBe(503);
      expect(log.mock.calls).toEqual([
        [
          JSON.stringify({
            event: "paddle_webhook_rejected",
            stage,
            code: "verification_failed",
            status: 503,
          }),
        ],
      ]);
    },
  );
  it("does not log a forged code, stack or error message", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    logPaddleWebhookRejection(
      "verification",
      new PaddleWebhookError(canary as never),
      400,
    );
    expect(log.mock.calls).toEqual([
      [
        JSON.stringify({
          event: "paddle_webhook_rejected",
          stage: "verification",
          code: "verification_failed",
          status: 400,
        }),
      ],
    ]);
  });
  it("logging failure cannot alter the rejection response", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error(canary);
    });
    const value = event();
    value.data.items[1]!.quantity = 0;
    const rpc = vi.fn();
    expect(
      (await createPaddleWebhookIngress(config, { rpc })(http(value))).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
