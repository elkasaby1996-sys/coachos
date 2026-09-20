import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPaddleSandboxWebhookVerifier,
  PADDLE_WEBHOOK_LIMITS,
  PaddleWebhookError,
  type PaddleWebhookConfiguration,
  type PaddleWebhookRequest,
} from "../../supabase/functions/_shared/paddle-webhook/index";
import { constantTimeSignatureEqual } from "../../supabase/functions/_shared/paddle-webhook/signature";
import {
  createVerifiedEvidenceBoundaryV2,
  type VerifiedEventV2,
  type VerifiedTransactionV2,
  type VerifiedSubscriptionV2,
} from "../../supabase/functions/_shared/billing-verified-receipts-v2";

// Deliberately nonfunctional deterministic values, not Paddle-issued credentials.
const secret = "synthetic-webhook-notification-secret-for-tests-only";
const rotatedSecret = "synthetic-rotated-notification-secret-for-tests-only";
const now = Date.parse("2026-09-19T12:00:00.000Z");
const timestamp = String(now / 1000);
const encode = (value: string) => new TextEncoder().encode(value);
const config = (): PaddleWebhookConfiguration => ({
  environment: "test",
  secrets: [{ environment: "sandbox", value: secret }],
  now: () => now,
});
function item() {
  return {
    status: "active",
    quantity: 2,
    price: {
      id: "synthetic/Price-A",
      product_id: "synthetic/Product-A",
      unit_price: { amount: "1900", currency_code: "USD" },
      custom_data: { private: "drop" },
    },
  };
}
function event(eventType = "transaction.completed") {
  return {
    event_id: "synthetic/Event-A",
    notification_id: "synthetic/Notification-A",
    event_type: eventType,
    occurred_at: "2026-09-18T09:10:11.123456Z",
    data: eventType.startsWith("subscription.")
      ? {
          id: "synthetic/Subscription-A",
          customer_id: "synthetic/Customer-A",
          status: "active",
          transaction_id: "synthetic/Transaction-A",
          items: [item()],
        }
      : {
          id: "synthetic/Transaction-A",
          customer_id: "synthetic/Customer-A",
          subscription_id: "synthetic/Subscription-A",
          status: "completed",
          currency_code: "USD",
          items: [item()],
        },
  };
}
const bytes = (value: unknown = event()) => encode(JSON.stringify(value));
function signature(raw: Uint8Array, key = secret, ts = timestamp) {
  return createHmac("sha256", key)
    .update(ts + ":")
    .update(raw)
    .digest("hex");
}
function request(
  raw: Uint8Array = bytes(),
  header = `ts=${timestamp};h1=${signature(raw)}`,
): PaddleWebhookRequest {
  return {
    method: "POST",
    headers: [
      ["Content-Type", "application/json"],
      ["Paddle-Signature", header],
    ],
    rawBody: raw,
  };
}
const verify = (input = request()) =>
  createPaddleSandboxWebhookVerifier(config()).verify(input);
afterEach(() => vi.unstubAllGlobals());

describe("Paddle sandbox configuration", () => {
  it("supports Supabase Edge Runtime's window compatibility global", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Deno", {
      version: { deno: "supabase-edge-runtime" },
      serve: vi.fn(),
      env: { get: vi.fn() },
    });
    expect((await verify()).kind).toBe("supported");
  });
  it("does not accept a browser with an incomplete Deno marker", () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("Deno", { version: { deno: "incomplete" } });
    expect(() => createPaddleSandboxWebhookVerifier(config())).toThrow();
  });
  it.each([
    { environment: "live" },
    { environment: undefined },
    { secrets: [] },
    { secrets: [{ environment: "live", value: secret }] },
    {
      secrets: [
        { environment: "sandbox", value: secret },
        { environment: "live", value: rotatedSecret },
      ],
    },
    { secrets: [{ environment: "sandbox", value: "" }] },
    { secrets: [{ environment: "sandbox", value: " " + secret }] },
    { secrets: [{ environment: "sandbox", value: secret + "\n" }] },
    {
      secrets: [
        { environment: "sandbox", value: secret },
        { environment: "sandbox", value: secret },
      ],
    },
    { liveSecret: rotatedSecret },
    { now: "not a clock" },
  ])("fails closed on missing/mixed/ambiguous configuration %#", (override) => {
    expect(() =>
      createPaddleSandboxWebhookVerifier({
        ...config(),
        ...override,
      } as PaddleWebhookConfiguration),
    ).toThrow("configuration");
  });
  it("snapshots trusted configuration and supports a sandbox rotation key", async () => {
    const options = config();
    options.secrets = [
      ...options.secrets,
      { environment: "sandbox", value: rotatedSecret },
    ];
    const verifier = createPaddleSandboxWebhookVerifier(options);
    options.environment = "live" as "test";
    options.secrets[0]!.value = "changed secret";
    options.now = () => 0;
    const raw = bytes();
    expect(
      (
        await verifier.verify(
          request(raw, `ts=${timestamp};h1=${signature(raw, rotatedSecret)}`),
        )
      ).kind,
    ).toBe("supported");
    expect((await verifier.verify(request())).kind).toBe("supported");
  });
  it("rejects browser execution and does not read environment variables", () => {
    vi.stubGlobal("window", {});
    expect(() => createPaddleSandboxWebhookVerifier(config())).toThrow(
      "configuration",
    );
  });
  it("rejects invalid trusted clocks with sanitized errors", async () => {
    const verifier = createPaddleSandboxWebhookVerifier({
      ...config(),
      now: () => Number.NaN,
    });
    await expect(verifier.verify(request())).rejects.toMatchObject({
      code: "configuration",
    });
  });
});

describe("raw-body HMAC verification", () => {
  it("issues a receipt for a valid signature and hashes exact original bytes", async () => {
    const raw = bytes(),
      verifier = createPaddleSandboxWebhookVerifier(config());
    const result = await verifier.verify(request(raw));
    expect(result.kind).toBe("supported");
    if (result.kind !== "supported")
      throw new Error("expected supported fixture");
    const facts = verifier.readReplayFacts(result.receipt);
    expect(facts.rawPayloadSha256).toBe(
      createHash("sha256").update(raw).digest("hex"),
    );
    expect(facts).toMatchObject({
      provider: "paddle",
      environment: "test",
      eventRef: "synthetic/Event-A",
      notificationRef: "synthetic/Notification-A",
      occurredAt: "2026-09-18T09:10:11.123456Z",
      eventType: "transaction.completed",
    });
  });
  it("rejects a wrong secret", async () => {
    const raw = bytes();
    await expect(
      verify(
        request(raw, `ts=${timestamp};h1=${signature(raw, rotatedSecret)}`),
      ),
    ).rejects.toMatchObject({ code: "signature_invalid" });
  });
  it("rejects a modified byte and whitespace-only JSON changes", async () => {
    const raw = bytes(),
      header = `ts=${timestamp};h1=${signature(raw)}`;
    const modified = raw.slice();
    modified[modified.length - 2] = 32;
    await expect(verify(request(modified, header))).rejects.toMatchObject({
      code: "signature_invalid",
    });
    await expect(
      verify(request(encode(JSON.stringify(event(), null, 2)), header)),
    ).rejects.toMatchObject({ code: "signature_invalid" });
  });
  it("accepts whitespace when the exact whitespace was signed", async () => {
    expect(
      (
        await verify(
          request(encode(" \n" + JSON.stringify(event(), null, 2) + "\n")),
        )
      ).kind,
    ).toBe("supported");
  });
  it("checks signature before parsing JSON", async () => {
    const raw = encode("not JSON");
    await expect(
      verify(request(raw, `ts=${timestamp};h1=${"0".repeat(64)}`)),
    ).rejects.toMatchObject({ code: "signature_invalid" });
    await expect(verify(request(raw))).rejects.toMatchObject({
      code: "event_invalid",
    });
  });
  it.each([
    `h1=${"0".repeat(64)}`,
    `ts=;h1=${"0".repeat(64)}`,
    `ts=abc;h1=${"0".repeat(64)}`,
    `ts=-1;h1=${"0".repeat(64)}`,
    `ts=1.5;h1=${"0".repeat(64)}`,
    `ts=01;h1=${"0".repeat(64)}`,
    `ts=1e9;h1=${"0".repeat(64)}`,
    `ts=${timestamp}`,
    `ts=${timestamp};h1=bad`,
    `ts=${timestamp};h1=${"g".repeat(64)}`,
    `ts=${timestamp};ts=${timestamp};h1=${"0".repeat(64)}`,
    `ts=${timestamp};h1=${"0".repeat(64)};unknown=value`,
    `ts=${timestamp};h1=${"0".repeat(64)},ts=${timestamp};h1=${"0".repeat(64)}`,
    `ts=${timestamp};h1=${"0".repeat(64)};`,
    `ts=${timestamp}${`;h1=${"0".repeat(64)}`.repeat(9)}`,
    "x".repeat(1025),
  ])(
    "rejects missing or malformed ts/h1/header representation %#",
    async (header) => {
      await expect(verify(request(bytes(), header))).rejects.toMatchObject({
        code: "signature_header_invalid",
      });
    },
  );
  it.each([-6, 6, -1000, 1000])(
    "rejects signed timestamps outside tolerance (%i seconds)",
    async (offset) => {
      const ts = String(now / 1000 + offset),
        raw = bytes();
      await expect(
        verify(request(raw, `ts=${ts};h1=${signature(raw, secret, ts)}`)),
      ).rejects.toMatchObject({ code: "timestamp_outside_tolerance" });
    },
  );
  it.each([-5, 5])(
    "accepts the trusted tolerance edge (%i seconds)",
    async (offset) => {
      const ts = String(now / 1000 + offset),
        raw = bytes();
      expect(
        (
          await verify(
            request(raw, `ts=${ts};h1=${signature(raw, secret, ts)}`),
          )
        ).kind,
      ).toBe("supported");
    },
  );
  it.each(["first", "middle", "last"])(
    "accepts one valid h1 in %s position",
    async (position) => {
      const raw = bytes(),
        valid = signature(raw),
        invalid = "0".repeat(64);
      const values =
        position === "first"
          ? [valid, invalid, invalid]
          : position === "middle"
            ? [invalid, valid, invalid]
            : [invalid, invalid, valid];
      expect(
        (
          await verify(
            request(
              raw,
              `ts=${timestamp}` + values.map((s) => `;h1=${s}`).join(""),
            ),
          )
        ).kind,
      ).toBe("supported");
    },
  );
  it("handles duplicate h1 without bypassing verification", async () => {
    const raw = bytes(),
      valid = signature(raw),
      invalid = "0".repeat(64);
    expect(
      (await verify(request(raw, `ts=${timestamp};h1=${valid};h1=${valid}`)))
        .kind,
    ).toBe("supported");
    await expect(
      verify(request(raw, `ts=${timestamp};h1=${invalid};h1=${invalid}`)),
    ).rejects.toMatchObject({ code: "signature_invalid" });
  });
  it("uses the native constant-time helper for fixed-length SHA256 digests", () => {
    const expected = new Uint8Array(32).fill(42);
    expect(constantTimeSignatureEqual(expected, expected.slice())).toBe(true);
    for (const index of [0, 15, 31]) {
      const changed = expected.slice();
      changed[index] ^= 1;
      expect(constantTimeSignatureEqual(expected, changed)).toBe(false);
    }
    expect(constantTimeSignatureEqual(expected, new Uint8Array(31))).toBe(
      false,
    );
    expect(constantTimeSignatureEqual(new Uint8Array(), new Uint8Array())).toBe(
      false,
    );
    const source = readFileSync(
      "supabase/functions/_shared/paddle-webhook/signature.ts",
      "utf8",
    );
    expect(source).toContain('from "node:crypto"');
    expect(source).toContain("return timingSafeEqual(expected, candidate)");
  });
});

describe("request bounds and immutable snapshots", () => {
  it.each(["GET", "PATCH", "post"])(
    "requires POST, rejects %s",
    async (method) => {
      await expect(verify({ ...request(), method })).rejects.toMatchObject({
        code: "request_invalid",
      });
    },
  );
  it("rejects empty and oversized bodies", async () => {
    await expect(verify(request(new Uint8Array()))).rejects.toMatchObject({
      code: "request_invalid",
    });
    await expect(
      verify(request(new Uint8Array(PADDLE_WEBHOOK_LIMITS.bodyBytes + 1))),
    ).rejects.toMatchObject({ code: "body_too_large" });
  });
  it("rejects shared mutable backing memory", async () => {
    await expect(
      verify(request(new Uint8Array(new SharedArrayBuffer(1)))),
    ).rejects.toMatchObject({ code: "request_invalid" });
  });
  it("requires one raw signature header entry, rejects absent, repeated and coalesced values", async () => {
    const input = request();
    await expect(
      verify({ ...input, headers: [input.headers[0]!] }),
    ).rejects.toMatchObject({ code: "signature_header_invalid" });
    await expect(
      verify({
        ...input,
        headers: [...input.headers, ["paddle-signature", input.headers[1]![1]]],
      }),
    ).rejects.toMatchObject({ code: "signature_header_invalid" });
    await expect(
      verify({
        ...input,
        headers: new Headers(
          input.headers as [string, string][],
        ) as unknown as PaddleWebhookRequest["headers"],
      }),
    ).rejects.toMatchObject({ code: "request_invalid" });
  });
  it.each([
    ["Content-Encoding", "gzip"],
    ["Content-Length", "1"],
    ["Content-Length", "invalid"],
    ["Content-Length", "-1"],
    ["Bad Header", "x"],
    ["X-Extra", "x\r\ny"],
    ["X-Extra", "x".repeat(16385)],
  ])("rejects malformed headers/encoding %#", async (name, value) => {
    const input = request();
    await expect(
      verify({
        ...input,
        headers: [...input.headers, [name, value]],
      }),
    ).rejects.toMatchObject({ code: "request_invalid" });
  });
  it.each(["text/plain", "application/json;charset=iso-8859-1"])(
    "rejects %s content-type",
    async (type) => {
      const input = request();
      await expect(
        verify({
          ...input,
          headers: [["Content-Type", type], input.headers[1]!],
        }),
      ).rejects.toMatchObject({ code: "request_invalid" });
    },
  );
  it("accepts case-insensitive header names and explicit UTF8 with correct length", async () => {
    const input = request();
    expect(
      (
        await verify({
          ...input,
          headers: [
            ["content-type", "application/json; charset=UTF-8"],
            ["pAdDlE-sIgNaTuRe", input.headers[1]![1]],
            ["Content-Length", String(input.rawBody.byteLength)],
          ],
        })
      ).kind,
    ).toBe("supported");
  });
  it("rejects signed invalid UTF8 and BOM rather than decoding with replacement", async () => {
    for (const raw of [
      new Uint8Array([0xff, 0xfe]),
      new Uint8Array([0xef, 0xbb, 0xbf, ...bytes()]),
    ]) {
      await expect(verify(request(raw))).rejects.toMatchObject({
        code: "event_invalid",
      });
    }
  });
  it.each(["Uint8Array", "Buffer"])(
    "copies %s and headers before the first await",
    async (kind) => {
      const raw = kind === "Buffer" ? Buffer.from(bytes()) : bytes();
      const expected = createHash("sha256").update(raw).digest("hex");
      const input = request(raw),
        verifier = createPaddleSandboxWebhookVerifier(config());
      const pending = verifier.verify(input);
      raw.fill(0);
      (input.headers as [string, string][])[1]![1] = "invalid";
      const result = await pending;
      if (result.kind !== "supported") throw new Error("fixture unsupported");
      expect(verifier.readReplayFacts(result.receipt).rawPayloadSha256).toBe(
        expected,
      );
    },
  );
});

describe("event envelope and conservative observations", () => {
  it.each(["event_id", "notification_id", "event_type", "occurred_at", "data"])(
    "rejects missing %s",
    async (field) => {
      const value: Record<string, unknown> = event();
      delete value[field];
      await expect(verify(request(bytes(value)))).rejects.toMatchObject({
        code: "event_invalid",
      });
    },
  );
  it.each([
    "",
    "today",
    "2026-02-30T10:00:00Z",
    "2026-09-19",
    "2026-09-19T25:00:00Z",
    "2026-09-19T00:00:60Z",
    "0000-01-01T00:00:00Z",
    "2026-09-19T12:00:00+25:00",
  ])("rejects malformed occurred_at %#", async (occurred_at) => {
    await expect(
      verify(request(bytes({ ...event(), occurred_at }))),
    ).rejects.toMatchObject({ code: "event_invalid" });
  });
  it("preserves timestamp offsets, microseconds, refs and provider type exactly", async () => {
    const value = {
      ...event(),
      event_id: "opaque/Event:CASE",
      notification_id: "opaque/Notification:CASE",
      occurred_at: "2026-09-01T12:34:56.123456789+03:00",
    };
    const result = await verify(request(bytes(value)));
    expect(result.observation).toMatchObject({
      eventRef: value.event_id,
      notificationRef: value.notification_id,
      eventType: value.event_type,
      occurredAt: value.occurred_at,
    });
  });
  it("transaction.completed retains only transaction observation facts", async () => {
    const result = await verify();
    expect(result.observation).toMatchObject({
      kind: "transaction.completed",
      transactionRef: "synthetic/Transaction-A",
      status: "completed",
      currency: "USD",
      items: [
        {
          priceRef: "synthetic/Price-A",
          productRef: "synthetic/Product-A",
          quantity: 2,
          unitPrice: { amount: "1900", currency: "USD" },
        },
      ],
    });
    expect(result.observation).not.toHaveProperty("paidMinor");
    expect(result.observation).not.toHaveProperty("completedAt");
  });
  it("subscription.created preserves transaction correlation outside receipt identity", async () => {
    const result = await verify(request(bytes(event("subscription.created"))));
    expect(result.observation).toMatchObject({
      kind: "subscription.created",
      transactionCorrelationRef: "synthetic/Transaction-A",
      subscriptionRef: "synthetic/Subscription-A",
      status: "active",
    });
    expect(result.kind).toBe("supported");
  });
  it("subscription.created can observe absent correlation without inventing it", async () => {
    const value = event("subscription.created");
    delete value.data.transaction_id;
    expect((await verify(request(bytes(value)))).observation).toMatchObject({
      transactionCorrelationRef: null,
    });
  });
  it("subscription.updated retains safe state/items and ignores noncontract correlation", async () => {
    const result = await verify(request(bytes(event("subscription.updated"))));
    expect(result.observation).toMatchObject({
      kind: "subscription.updated",
      status: "active",
      transactionCorrelationRef: null,
      items: [{ status: "active", quantity: 2 }],
    });
  });
  it.each([
    "customer.created",
    "transaction.payment_failed",
    "subscription.activated",
    "Provider.Future:Case",
  ])("returns authenticated unsupported observation for %s", async (type) => {
    const value = {
      ...event(type),
      data: { private: "drop", status: "active", paid: true },
    };
    const result = await verify(request(bytes(value)));
    expect(result.kind).toBe("unsupported");
    expect(result.receipt).toBeNull();
    expect(result.observation).toEqual({
      provider: "paddle",
      environment: "test",
      eventRef: value.event_id,
      notificationRef: value.notification_id,
      eventType: type,
      occurredAt: value.occurred_at,
      kind: "unsupported",
      reason: "event_type_not_supported",
    });
  });
  it("drops all unknown top-level and nested fields from retained facts", async () => {
    const value = event();
    const raw = bytes({
      ...value,
      private: "sensitive-marker",
      __proto__: { injected: true },
      data: {
        ...value.data,
        customer_email: "sensitive-marker",
        checkout: "sensitive-marker",
        custom_data: { plan: "sensitive-marker" },
      },
    });
    const verifier = createPaddleSandboxWebhookVerifier(config()),
      result = await verifier.verify(request(raw));
    if (result.kind !== "supported") throw new Error("fixture unsupported");
    expect(
      JSON.stringify(verifier.readReplayFacts(result.receipt)),
    ).not.toContain("sensitive-marker");
    expect(JSON.stringify(result.observation)).not.toContain("custom_data");
    expect(result.observation).not.toHaveProperty("injected");
  });
  it.each([
    { id: "" },
    { items: [] },
    { items: Array.from({ length: 33 }, item) },
    { items: [{ ...item(), quantity: 0 }] },
    { currency_code: "usd" },
    { status: "pending" },
  ])("fails closed on malformed supported event fields %#", async (change) => {
    const value = event();
    await expect(
      verify(request(bytes({ ...value, data: { ...value.data, ...change } }))),
    ).rejects.toMatchObject({ code: "event_invalid" });
  });
});

describe("receipt provenance, replay and absence of payment authority", () => {
  it("returns a genuine merged V2 event token that cannot serialize or be cloned", async () => {
    const verifier = createPaddleSandboxWebhookVerifier(config()),
      result = await verifier.verify(request());
    if (result.kind !== "supported") throw new Error("fixture unsupported");
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(Object.getPrototypeOf(result.receipt)).toBeNull();
    expect(Object.keys(result.receipt)).toEqual(["toJSON"]);
    expect(() => JSON.stringify(result.receipt)).toThrow(
      "BILLING_RECEIPT_NOT_SERIALIZABLE",
    );
    expect(() => structuredClone(result.receipt)).toThrow();
    expect(() =>
      verifier.readReplayFacts({ ...result.receipt } as VerifiedEventV2),
    ).toThrow("receipt_invalid");
  });
  it.each([
    {},
    { verified: true },
    { provider: "paddle", environment: "test", kind: "event" },
  ])("rejects forged receipts %#", (token) => {
    expect(() =>
      createPaddleSandboxWebhookVerifier(config()).readReplayFacts(
        token as VerifiedEventV2,
      ),
    ).toThrow("receipt_invalid");
  });
  it("rejects cross-instance and cross-environment receipts", async () => {
    const a = createPaddleSandboxWebhookVerifier(config()),
      b = createPaddleSandboxWebhookVerifier(config());
    const result = await a.verify(request());
    if (result.kind !== "supported") throw new Error("fixture unsupported");
    expect(() => b.readReplayFacts(result.receipt)).toThrow("receipt_invalid");
    expect(() =>
      a.readReplayFacts(result.receipt, {
        provider: "paddle",
        environment: "live",
      }),
    ).toThrow("receipt_invalid");
  });
  it("preserves replay identity separately from delivery notification and byte evidence", async () => {
    const verifier = createPaddleSandboxWebhookVerifier(config());
    const value = event();
    const results = await Promise.all([
      verifier.verify(request(bytes(value))),
      verifier.verify(
        request(
          bytes({ ...value, notification_id: "synthetic/Notification-B" }),
        ),
      ),
      verifier.verify(request(encode(JSON.stringify(value, null, 2)))),
    ]);
    const facts = results.map((result) => {
      if (result.kind !== "supported") throw new Error("fixture unsupported");
      return verifier.readReplayFacts(result.receipt);
    });
    expect(new Set(facts.map((f) => f.eventRef)).size).toBe(1);
    expect(new Set(facts.map((f) => f.notificationRef)).size).toBe(2);
    expect(new Set(facts.map((f) => f.rawPayloadSha256)).size).toBe(3);
    expect(new Set(facts.map((f) => f.occurredAt))).toEqual(
      new Set([value.occurred_at]),
    );
  });
  it("isolates concurrent verifications and returned mutable observations", async () => {
    const verifier = createPaddleSandboxWebhookVerifier(config());
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        verifier.verify(
          request(bytes({ ...event(), event_id: `synthetic/Event-${i}` })),
        ),
      ),
    );
    results.forEach((result, i) => {
      if (result.kind !== "supported") throw new Error("fixture unsupported");
      result.observation.eventRef = "tampered";
      const facts = verifier.readReplayFacts(result.receipt);
      expect(facts.eventRef).toBe(`synthetic/Event-${i}`);
      facts.observation.eventRef = "tampered-again";
      expect(
        verifier.readReplayFacts(result.receipt).observation.eventRef,
      ).toBe(`synthetic/Event-${i}`);
    });
  });
  it("a valid signature alone cannot issue an event receipt", async () => {
    await expect(
      verify(request(bytes({ status: "active", paid: true }))),
    ).rejects.toMatchObject({ code: "event_invalid" });
  });
  it.each([
    "transaction.completed",
    "subscription.created",
    "subscription.updated",
    "provider.future",
  ])("%s never grants payment or access", async (type) => {
    const verifier = createPaddleSandboxWebhookVerifier(config());
    expect(Object.keys(verifier).sort()).toEqual([
      "ingestionArguments",
      "readReplayFacts",
      "verify",
    ]);
    const result = await verifier.verify(request(bytes(event(type))));
    expect(result.observation).not.toHaveProperty("entitlements");
    expect(result.observation).not.toHaveProperty("paymentApplication");
    const separateBoundary = createVerifiedEvidenceBoundaryV2({
      provider: "paddle",
      environment: "test",
      async verifyEvent() {
        throw new Error("not installed");
      },
      async retrieveSubscription() {
        throw new Error("not installed");
      },
      async retrieveTransaction() {
        throw new Error("not installed");
      },
    });
    if (result.kind === "supported") {
      expect(() =>
        separateBoundary.transactionArguments(
          result.receipt as unknown as VerifiedTransactionV2,
        ),
      ).toThrow("BILLING_RECEIPT_INVALID");
      expect(() =>
        separateBoundary.subscriptionArguments(
          result.receipt as unknown as VerifiedSubscriptionV2,
        ),
      ).toThrow("BILLING_RECEIPT_INVALID");
      expect(() =>
        verifier.readReplayFacts(
          result.observation as unknown as VerifiedEventV2,
        ),
      ).toThrow("receipt_invalid");
    } else expect(result.receipt).toBeNull();
  });
  it("has no reachable network, writer, entitlement, checkout or webhook deployment code", () => {
    const seen = new Set<string>();
    function visit(file: string) {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /fetch\(|\.rpc\(|createEvidenceWriter|createCatalogueWriter|Deno\.serve|grant.*Access|apply.*Payment/,
      );
      for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g))
        visit(resolve(dirname(file), match[1]!));
    }
    visit(resolve("supabase/functions/_shared/paddle-webhook/index.ts"));
    expect(
      [...seen].every(
        (path) => !/writer|runtime|handler|lemon-squeezy/i.test(path),
      ),
    ).toBe(true);
    const visitBrowser = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? visitBrowser(join(dir, entry.name))
          : [join(dir, entry.name)],
      );
    for (const path of visitBrowser("src").filter((path) =>
      /\.[jt]sx?$/.test(path),
    ))
      expect(readFileSync(path, "utf8")).not.toContain("paddle-webhook");
  });
  it("redacts secret, signature and raw body from public errors and replay facts", async () => {
    const marker = "private-raw-body-marker",
      raw = encode(marker),
      sig = signature(raw);
    for (const input of [
      request(raw),
      request(raw, `ts=${timestamp};h1=${"0".repeat(64)}`),
    ]) {
      const error = await verify(input).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(PaddleWebhookError);
      const exposed = `${String(error)}${JSON.stringify(error)}${(error as Error).stack}`;
      for (const value of [marker, sig, secret])
        expect(exposed.includes(value)).toBe(false);
      expect((error as Error).cause).toBeUndefined();
    }
    const verifier = createPaddleSandboxWebhookVerifier(config()),
      result = await verifier.verify(request());
    if (result.kind !== "supported") throw new Error("fixture unsupported");
    const exposed = JSON.stringify(verifier.readReplayFacts(result.receipt));
    expect(exposed.includes(secret)).toBe(false);
    expect(exposed.includes(signature(bytes()))).toBe(false);
    expect(exposed).not.toMatch(/rawBody|signature|Authorization/);
  });
  it("sanitizes unexpected secret-bearing exceptions", async () => {
    const verifier = createPaddleSandboxWebhookVerifier({
      ...config(),
      now: () => {
        throw new Error(secret);
      },
    });
    await expect(verifier.verify(request())).rejects.toThrow(
      "Paddle webhook: verification_failed",
    );
  });
  it("cannot reach ambient network", async () => {
    expect(() => fetch("https://example.invalid")).toThrow(
      "Unit network boundary",
    );
    expect(() => new Socket().connect(443, "example.invalid")).toThrow(
      "Unit network boundary",
    );
    expect((await verify()).kind).toBe("supported");
  });
});
