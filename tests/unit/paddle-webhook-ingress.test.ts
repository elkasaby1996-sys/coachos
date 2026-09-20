import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import {
  createPaddleWebhookIngress,
  webhookConfiguration,
} from "../../supabase/functions/_shared/paddle-webhook/ingress";
import { createPaddleSandboxWebhookVerifier } from "../../supabase/functions/_shared/paddle-webhook/index";
const secret = "synthetic-webhook-secret-no-provider-authority";
const now = Date.parse("2026-09-20T10:00:00Z");
const config = {
  environment: "test" as const,
  secrets: [{ environment: "sandbox" as const, value: secret }],
  now: () => now,
};
const event = () => ({
  event_id: "synthetic/event",
  notification_id: "synthetic/delivery",
  event_type: "transaction.completed",
  occurred_at: "2026-09-20T09:00:00.000Z",
  data: {
    id: "synthetic/transaction",
    customer_id: null,
    subscription_id: null,
    status: "completed",
    currency_code: "USD",
    items: [
      {
        quantity: 1,
        price: {
          id: "synthetic/price",
          product_id: "synthetic/product",
          unit_price: { amount: "1900", currency_code: "USD" },
        },
      },
    ],
  },
});
function request(value: unknown = event(), signature?: string) {
  const raw = JSON.stringify(value);
  const ts = String(now / 1000);
  return new Request("https://example.invalid/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paddle-signature":
        signature ??
        `ts=${ts};h1=${createHmac("sha256", secret)
          .update(ts + ":" + raw)
          .digest("hex")}`,
    },
    body: raw,
  });
}
describe("trusted Paddle ingress", () => {
  it("preserves duplicate signature ambiguity for PREP rejection", async () => {
    const req = request();
    req.headers.append(
      "Paddle-Signature",
      req.headers.get("Paddle-Signature")!,
    );
    const rpc = vi.fn();
    expect(
      (await createPaddleWebhookIngress(config, { rpc })(req)).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("serializes private receipt facts, never caller-mutated observations", async () => {
    const req = request();
    const verifier = createPaddleSandboxWebhookVerifier(config);
    const result = await verifier.verify({
      method: "POST",
      headers: Array.from(req.headers.entries()),
      rawBody: new Uint8Array(await req.arrayBuffer()),
    });
    expect(result.kind).toBe("supported");
    if (result.kind !== "supported") throw new Error("test fixture");
    result.observation.items[0]!.quantity = 99;
    const args = verifier.ingestionArguments(result.receipt);
    expect(
      (args.p_observation as { items: { quantity: number }[] }).items[0]!
        .quantity,
    ).toBe(1);
    expect(() =>
      createPaddleSandboxWebhookVerifier(config).ingestionArguments(
        result.receipt,
      ),
    ).toThrow();
  });
  it("waits for durable persistence and only returns static text", async () => {
    let release!: (x: { error: null; data: { accepted: true } }) => void;
    const rpc = vi.fn(
      (_name: string, _args: Record<string, unknown>) =>
        new Promise<{ error: null; data: { accepted: true } }>(
          (r) => (release = r),
        ),
    );
    const handler = createPaddleWebhookIngress(config, { rpc });
    let finished = false;
    const pending = handler(request()).then((r) => {
      finished = true;
      return r;
    });
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    release({ error: null, data: { accepted: true } });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("accepted");
    expect(rpc.mock.calls[0]?.[0]).toBe("ingest_verified_paddle_event_v1");
  });
  it.each([null, new Error("private failure")])(
    "retries persistence failure",
    async (error) => {
      const rpc = vi.fn(async () => {
        if (error) throw error;
        return { error: "private", data: null };
      });
      expect(
        (await createPaddleWebhookIngress(config, { rpc })(request())).status,
      ).toBe(503);
    },
  );
  it.each([
    "ts=1;h1=" + "0".repeat(64),
    "ts=" + now / 1000 + ";h1=" + "0".repeat(64),
    "ts=1;h1=" + "0".repeat(64) + ", ts=1;h1=" + "0".repeat(64),
  ])("rejects bad or coalesced signatures without writing", async (sig) => {
    const rpc = vi.fn();
    expect(
      (await createPaddleWebhookIngress(config, { rpc })(request(event(), sig)))
        .status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("acknowledges authenticated unsupported events without evidence", async () => {
    const rpc = vi.fn();
    const value = { ...event(), event_type: "transaction.updated" };
    expect(
      (await createPaddleWebhookIngress(config, { rpc })(request(value)))
        .status,
    ).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed supported event", async () => {
    const rpc = vi.fn();
    expect(
      (
        await createPaddleWebhookIngress(config, { rpc })(
          request({ ...event(), data: {} }),
        )
      ).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects non-POST", async () => {
    const rpc = vi.fn();
    expect(
      (
        await createPaddleWebhookIngress(config, { rpc })(
          new Request("https://example.invalid"),
        )
      ).status,
    ).toBe(405);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("bounds chunked allocation and cancels the stream", async () => {
    const rpc = vi.fn(),
      cancel = vi.fn();
    const body = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(262145));
      },
      cancel,
    });
    const req = new Request("https://example.invalid", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    expect(
      (await createPaddleWebhookIngress(config, { rpc })(req)).status,
    ).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("bounds declared size before reading", async () => {
    const rpc = vi.fn();
    const req = request();
    req.headers.set("content-length", "262145");
    expect(
      (await createPaddleWebhookIngress(config, { rpc })(req)).status,
    ).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses forged receipts at serialization boundary", () => {
    const verifier = createPaddleSandboxWebhookVerifier(config);
    expect(() => verifier.ingestionArguments({} as never)).toThrow();
  });
  it("loads one/two dedicated sandbox secrets", () => {
    for (const rotation of [false, true]) {
      const env: Record<string, string> = {
        PADDLE_ENVIRONMENT: "sandbox",
        PADDLE_SANDBOX_WEBHOOK_SECRET: secret,
        ...(rotation
          ? { PADDLE_SANDBOX_WEBHOOK_SECRET_PREVIOUS: secret + "-old" }
          : {}),
      };
      expect(webhookConfiguration((k) => env[k]).secrets).toHaveLength(
        rotation ? 2 : 1,
      );
    }
  });
  it.each([
    {},
    { PADDLE_ENVIRONMENT: "live" },
    {
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_SANDBOX_WEBHOOK_SECRET: secret,
      PADDLE_LIVE_WEBHOOK_SECRET: "mixed",
    },
  ])("rejects missing/mixed config", (env) => {
    expect(() =>
      webhookConfiguration((k) => (env as Record<string, string>)[k]),
    ).toThrow();
  });
});
