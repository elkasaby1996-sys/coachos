import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPaddleSandboxCheckoutTransport,
  PaddleCheckoutError,
  PADDLE_CHECKOUT_LIMITS,
  type PaddleCheckoutDependencies,
  type PaddleCheckoutInput,
} from "../../supabase/functions/_shared/paddle-checkout/index";
import { checkoutHttp } from "../../supabase/functions/_shared/paddle-checkout/http";

const paymentPageUrl = "https://merchant.example.test/pay";
const transactionRef = "synthetic/Transaction:CASE";
const input = (seats = false): PaddleCheckoutInput => ({
  base: { priceReference: "synthetic/Base:CASE", quantity: 1 },
  ...(seats
    ? { seats: { priceReference: "synthetic/Seat:CASE", quantity: 7 } }
    : {}),
  correlation: {
    operationReference: "synthetic/Operation-A",
    attemptReference: "synthetic/Attempt-A",
  },
});
const paymentLink = (ref = transactionRef) =>
  `${paymentPageUrl}?_ptxn=${encodeURIComponent(ref)}`;
function providerData(expected = input()) {
  return {
    id: transactionRef,
    status: "draft",
    collection_mode: "automatic",
    currency_code: "USD",
    custom_data: {
      repsync_operation_id: expected.correlation.operationReference,
      repsync_attempt_id: expected.correlation.attemptReference,
      private: "drop",
    },
    items: [expected.base, ...(expected.seats ? [expected.seats] : [])].map(
      (item) => ({
        quantity: item.quantity,
        price: {
          id: item.priceReference,
          product_id: "synthetic/Product-A",
          name: "do not infer identity",
        },
      }),
    ),
    details: {
      totals: { total: "900719925474099312345", tax: "0", unknown: "drop" },
    },
    created_at: "2026-09-20T00:00:00.123456Z",
    updated_at: "2026-09-20T00:00:01.123456Z",
    billed_at: null,
    checkout: { url: paymentLink() },
    customer_email: "discard@example.test",
  };
}
const json = (data: unknown, status = 201) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function setup(
  responses: (Response | (() => Promise<Response>))[] = [],
  env: Record<string, string | undefined> = {},
  options: Partial<PaddleCheckoutDependencies> = {},
) {
  // Generated nonfunctional synthetic material; never load a developer API key.
  const key = [
    "pdl",
    "sdbx",
    "apikey",
    randomBytes(13).toString("hex"),
    randomBytes(11).toString("hex"),
    "Tst",
  ].join("_");
  const fetcher = vi.fn<typeof fetch>();
  responses.forEach((response) =>
    fetcher.mockImplementationOnce(
      typeof response === "function" ? response : async () => response,
    ),
  );
  const dependencies: PaddleCheckoutDependencies = {
    fetch: fetcher,
    paymentPageUrl,
    readEnvironment: (name) =>
      ({ PADDLE_ENVIRONMENT: "sandbox", PADDLE_SANDBOX_API_KEY: key, ...env })[
        name
      ],
    ...options,
  };
  const transport = createPaddleSandboxCheckoutTransport(dependencies);
  return { transport, fetcher, key, dependencies };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Paddle checkout configuration and authority boundary", () => {
  it.each([
    { PADDLE_ENVIRONMENT: "live" },
    { PADDLE_ENVIRONMENT: undefined },
    { PADDLE_SANDBOX_API_KEY: undefined },
    { PADDLE_SANDBOX_API_KEY: "invalid" },
    { PADDLE_LIVE_API_KEY: "present" },
    { PADDLE_API_KEY: "present" },
    { PADDLE_API_BASE_URL: "https://api.paddle.com" },
  ])("rejects incomplete/mixed environment %#", (env) => {
    expect(() => setup([], env)).toThrow("configuration");
  });
  it("requires injected transport and trusted environment reader", () => {
    expect(() => setup([], {}, { fetch: undefined })).toThrow("configuration");
    expect(() => setup([], {}, { readEnvironment: undefined })).toThrow(
      "configuration",
    );
    expect(() =>
      setup([], {}, {
        environment: "live",
      } as unknown as Partial<PaddleCheckoutDependencies>),
    ).toThrow("configuration");
  });
  it("rejects browser execution", () => {
    vi.stubGlobal("window", {});
    expect(() => setup()).toThrow("configuration");
  });
  it("only exposes create/retrieve and serializes no credentials or URLs", () => {
    const { transport, key } = setup();
    expect(Object.keys(transport).sort()).toEqual([
      "createCheckoutTransaction",
      "retrieveCheckoutTransaction",
    ]);
    expect(JSON.stringify(transport)).toBe("{}");
    expect(JSON.stringify(transport).includes(key)).toBe(false);
  });
  it("imports only the merged CORE configuration, with no webhook, DB, active provider or authority wiring", () => {
    const seen = new Set<string>();
    function visit(file: string) {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /\.rpc\(|createClient|createVerifiedEvidence|billing-runtime|active-provider|lemon-squeezy|paddle-webhook|Deno\.serve|console\./,
      );
      for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g))
        visit(resolve(dirname(file), match[1]!));
    }
    visit(resolve("supabase/functions/_shared/paddle-checkout/index.ts"));
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : [join(dir, entry.name)],
      );
    for (const file of walk("src").filter((p) => /\.[jt]sx?$/.test(p)))
      expect(readFileSync(file, "utf8")).not.toContain("paddle-checkout");
  });
});

describe("resolved inputs and wire contract", () => {
  it.each([false, true])(
    "POSTs exact resolved base/seat quantities (seats=%s)",
    async (seats) => {
      const expected = input(seats),
        { transport, fetcher, key } = setup([json(providerData(expected))]);
      const result = await transport.createCheckoutTransaction(expected);
      const [url, options] = fetcher.mock.calls[0]!;
      expect(String(url)).toBe("https://sandbox-api.paddle.com/transactions");
      expect(options?.method).toBe("POST");
      expect(options?.redirect).toBe("error");
      expect(
        new Headers(options?.headers).get("Authorization") === `Bearer ${key}`,
      ).toBe(true);
      expect(new Headers(options?.headers).has("Idempotency-Key")).toBe(false);
      const body = JSON.parse(String(options?.body));
      expect(body).toEqual({
        items: [
          { price_id: expected.base.priceReference, quantity: 1 },
          ...(seats
            ? [{ price_id: expected.seats!.priceReference, quantity: 7 }]
            : []),
        ],
        collection_mode: "automatic",
        checkout: { url: paymentPageUrl },
        custom_data: {
          repsync_operation_id: expected.correlation.operationReference,
          repsync_attempt_id: expected.correlation.attemptReference,
        },
      });
      expect(result.items.map((item) => item.quantity)).toEqual(
        seats ? [1, 7] : [1],
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("GETs an encoded opaque transaction reference without request body", async () => {
    const id = "opaque/Transaction?CASE#x",
      data = { ...providerData(), id, checkout: { url: paymentLink(id) } };
    const { transport, fetcher } = setup([json(data, 200)]);
    expect(
      (
        await transport.retrieveCheckoutTransaction({
          transactionReference: id,
          expected: input(),
        })
      ).transactionReference,
    ).toBe(id);
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      `https://sandbox-api.paddle.com/transactions/${encodeURIComponent(id)}`,
    );
    expect(fetcher.mock.calls[0]![1]?.method).toBe("GET");
    expect(fetcher.mock.calls[0]![1]?.body).toBeUndefined();
  });
  it.each([
    { base: { priceReference: "opaque", quantity: 2 } },
    { base: { priceReference: "", quantity: 1 } },
    { seats: { priceReference: "synthetic/Seat", quantity: 0 } },
    { seats: { priceReference: "synthetic/Seat", quantity: "2" } },
    { seats: { priceReference: "synthetic/Seat", quantity: 1.5 } },
    { seats: { priceReference: "synthetic/Seat", quantity: 1000000000 } },
    { seats: { priceReference: input().base.priceReference, quantity: 1 } },
    { seats: null },
    { correlation: { operationReference: "", attemptReference: "x" } },
    {
      correlation: {
        operationReference: "a",
        attemptReference: "b",
        custom: "c",
      },
    },
    { base: { priceReference: "x".repeat(257), quantity: 1 } },
    { planKey: "growth" },
    { billingAccountId: "account" },
    { entitlementLimit: 99 },
    { environment: "live" },
    { returnUrl: "https://evil.example.test" },
    { custom_data: { arbitrary: true } },
    { successUrl: "https://evil.example.test" },
  ])(
    "rejects malformed inputs and commercial/browser authority fields %#",
    async (change) => {
      const { transport, fetcher } = setup();
      await expect(
        transport.createCheckoutTransaction({
          ...input(),
          ...change,
        } as unknown as PaddleCheckoutInput),
      ).rejects.toMatchObject({
        code: "invalid_input",
        mutationMayHaveSucceeded: false,
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("does not infer canonical identity from opaque price values", async () => {
    const expected = input();
    expected.base.priceReference = "growth";
    const { transport, fetcher } = setup([json(providerData(expected))]);
    await transport.createCheckoutTransaction(expected);
    expect(
      JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).items[0].price_id,
    ).toBe("growth");
  });
  it("snapshots resolved input before async work", async () => {
    const expected = input(true),
      { transport } = setup([json(providerData(expected))]);
    const pending = transport.createCheckoutTransaction(expected);
    expected.base.priceReference = "changed";
    expected.seats!.quantity = 99;
    expected.correlation.operationReference = "changed";
    expect((await pending).correlation.operationReference).toBe(
      "synthetic/Operation-A",
    );
  });
  it("preserves operation and attempt values without inventing provider idempotency", async () => {
    const expected = input(),
      { transport, fetcher } = setup([
        json(providerData()),
        json(providerData()),
      ]);
    await transport.createCheckoutTransaction(expected);
    await transport.createCheckoutTransaction(expected);
    expect(
      fetcher.mock.calls[0]![1]?.body === fetcher.mock.calls[1]![1]?.body,
    ).toBe(true);
    // Two EXPLICIT calls send twice. Deduplication/locking belongs to the future core.
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("bounds serialized outbound UTF8 bytes before dispatch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const send = checkoutHttp(fetcher, () => "synthetic");
    await expect(
      send(
        "POST",
        "/transactions",
        "x".repeat(PADDLE_CHECKOUT_LIMITS.requestBytes + 1),
      ),
    ).rejects.toMatchObject({
      code: "body_too_large",
      mutationMayHaveSucceeded: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("sanitized observations and drift rejection", () => {
  it("retains only exact provider facts, with no payment authority or expiry invented", async () => {
    const { transport } = setup([json(providerData())]);
    const { checkout, ...facts } =
      await transport.createCheckoutTransaction(input());
    expect(facts).toEqual({
      provider: "paddle",
      environment: "test",
      transactionReference: transactionRef,
      status: "draft",
      correlation: input().correlation,
      items: [
        {
          priceReference: input().base.priceReference,
          productReference: "synthetic/Product-A",
          quantity: 1,
        },
      ],
      currency: "USD",
      total: { amount: "900719925474099312345", currency: "USD" },
      createdAt: "2026-09-20T00:00:00.123456Z",
      updatedAt: "2026-09-20T00:00:01.123456Z",
      billedAt: null,
    });
    expect(checkout?.kind).toBe("merchant_payment_link");
    expect(facts).not.toHaveProperty("expiresAt");
    expect(facts).not.toHaveProperty("entitlements");
  });
  it("permits absent checkout and calculation facts without inventing them", async () => {
    const { transport } = setup([
      json({ ...providerData(), details: null, checkout: null }),
    ]);
    const result = await transport.createCheckoutTransaction(input());
    expect(result.checkout).toBeNull();
    expect(result.total).toBeNull();
  });
  it("accepts reordered items while preserving exact quantities", async () => {
    const expected = input(true),
      data = providerData(expected);
    data.items.reverse();
    expect(
      (await setup([json(data)]).transport.createCheckoutTransaction(expected))
        .items,
    ).toHaveLength(2);
  });
  it.each(["billed", "paid", "completed", "past_due", "canceled"])(
    "observes retrieved %s without granting access",
    async (status) => {
      const result = await setup([
        json({ ...providerData(), status }, 200),
      ]).transport.retrieveCheckoutTransaction({
        transactionReference: transactionRef,
        expected: input(),
      });
      expect(result.status).toBe(status);
      expect(result).not.toHaveProperty("verified");
      expect(result).not.toHaveProperty("paymentApplication");
    },
  );
  it.each([
    {
      custom_data: {
        repsync_operation_id: "wrong",
        repsync_attempt_id: "synthetic/Attempt-A",
      },
    },
    {
      custom_data: {
        repsync_operation_id: "synthetic/Operation-A",
        repsync_attempt_id: "wrong",
      },
    },
    { items: [] },
    { items: [{ quantity: 2, price: { id: input().base.priceReference } }] },
    { items: [{ quantity: 1, price: { id: "another-price" } }] },
    { collection_mode: "manual" },
  ])("rejects item or correlation drift %#", async (change) => {
    await expect(
      setup([
        json({ ...providerData(), ...change }),
      ]).transport.createCheckoutTransaction(input()),
    ).rejects.toMatchObject({
      code: "response_drift",
      mutationMayHaveSucceeded: true,
    });
  });
  it("rejects duplicate returned items", async () => {
    const expected = input(true),
      data = providerData(expected);
    data.items[1] = data.items[0]!;
    await expect(
      setup([json(data)]).transport.createCheckoutTransaction(expected),
    ).rejects.toMatchObject({ code: "response_drift" });
  });
  it("rejects a mismatched retrieved transaction ref", async () => {
    await expect(
      setup([json(providerData(), 200)]).transport.retrieveCheckoutTransaction({
        transactionReference: "different",
        expected: input(),
      }),
    ).rejects.toMatchObject({
      code: "response_drift",
      mutationMayHaveSucceeded: false,
    });
  });
  it.each([
    { status: "unknown" },
    { currency_code: "usd" },
    { created_at: "2026-02-30T00:00:00Z" },
    { updated_at: "yesterday" },
    { details: { totals: { total: "1.5" } } },
    { details: { totals: { total: 100 } } },
    { details: { totals: { total: "-1" } } },
    { id: "" },
  ])("rejects malformed provider facts %#", async (change) => {
    await expect(
      setup([
        json({ ...providerData(), ...change }),
      ]).transport.createCheckoutTransaction(input()),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });
});

describe("Paddle and merchant destination policies", () => {
  it.each(["sandbox-pay.paddle.io", "sandbox.pay.paddle.io"])(
    "constructs hosted destination only from trusted %s launch configuration",
    async (host) => {
      const { transport } = setup(
        [json(providerData())],
        {},
        {
          hostedCheckoutLaunchUrl: `https://${host}/checkout/synthetic-launch`,
        },
      );
      const result = await transport.createCheckoutTransaction(input());
      expect(result.checkout?.kind).toBe("paddle_hosted");
      const destination = new URL(result.checkout!.destination().url);
      expect(destination.hostname === host).toBe(true);
      expect(
        destination.searchParams.get("transaction_id") === transactionRef,
      ).toBe(true);
      expect([...destination.searchParams.keys()]).toEqual(["transaction_id"]);
      expect(() => JSON.stringify(result)).toThrow(
        "PADDLE_CHECKOUT_DESTINATION_NOT_SERIALIZABLE",
      );
    },
  );
  it("keeps merchant payment link distinct and binds _ptxn to the exact transaction", async () => {
    const result = await setup([
      json(providerData()),
    ]).transport.createCheckoutTransaction(input());
    expect(result.checkout?.kind).toBe("merchant_payment_link");
    expect(
      new URL(result.checkout!.destination().url).searchParams.get("_ptxn") ===
        transactionRef,
    ).toBe(true);
    expect(() => JSON.stringify(result.checkout)).toThrow("NOT_SERIALIZABLE");
  });
  it.each([
    "https://pay.paddle.io/checkout/synthetic",
    "https://sandbox-pay.paddle.io.evil.test/checkout/synthetic",
    "https://custom.sandbox.paddle.io/pay/synthetic",
    "http://sandbox-pay.paddle.io/checkout/synthetic",
    "https://user@sandbox-pay.paddle.io/checkout/synthetic",
    "https://sandbox-pay.paddle.io/checkout/synthetic#",
    "https://sandbox-pay.paddle.io:444/checkout/synthetic",
    "https://sandbox-pay.paddle.io/checkout/synthetic?transaction_id=injected",
    "https://sandbox-pay.paddle.io/not-checkout/synthetic",
    "https://sandbox-pay.paddle.io/checkout/" + "x".repeat(2048),
  ])("rejects unapproved hosted config %#", (hostedCheckoutLaunchUrl) => {
    expect(() => setup([], {}, { hostedCheckoutLaunchUrl })).toThrow(
      "configuration",
    );
  });
  it.each([
    "http://merchant.example.test/pay",
    "https://merchant.example.test/pay#",
    "https://user@merchant.example.test/pay",
    "https://pay.paddle.io/checkout/synthetic",
    "https://merchant.example.test/pay?success=evil",
  ])("rejects unsafe merchant config %#", (paymentPageUrl) => {
    expect(() => setup([], {}, { paymentPageUrl })).toThrow("configuration");
  });
  it.each([
    "http://merchant.example.test/pay?_ptxn=x",
    "https://evil.example.test/pay?_ptxn=x",
    "https://merchant.example.test/other?_ptxn=x",
    paymentLink() + "#",
    paymentLink() + "&redirect=https://evil.example.test",
    paymentLink() + "&_ptxn=x",
    "https://user@merchant.example.test/pay?_ptxn=x",
    paymentLink("wrong"),
    "https://merchant.example.test/pay",
    "https://sandbox-pay.paddle.io/checkout/injected?transaction_id=x",
    "https://merchant.example.test:444/pay?_ptxn=x",
    "https://merchant.example.test/" + "x".repeat(2049),
  ])("rejects provider destination drift %#", async (url) => {
    await expect(
      setup([
        json({ ...providerData(), checkout: { url } }),
      ]).transport.createCheckoutTransaction(input()),
    ).rejects.toMatchObject({
      code: "unsafe_destination",
      mutationMayHaveSucceeded: true,
    });
  });
  it("does not ignore a malicious provider payment link when hosted launch is configured", async () => {
    const { transport } = setup(
      [
        json({
          ...providerData(),
          checkout: { url: "https://evil.example.test" },
        }),
      ],
      {},
      {
        hostedCheckoutLaunchUrl:
          "https://sandbox-pay.paddle.io/checkout/synthetic-launch",
      },
    );
    await expect(
      transport.createCheckoutTransaction(input()),
    ).rejects.toMatchObject({ code: "unsafe_destination" });
  });
});

describe("bounded HTTP and non-idempotent mutation safety", () => {
  it.each([401, 403, 404, 409, 422, 429, 500, 502, 503, 504, 302])(
    "surfaces sanitized HTTP %i with no automatic create or GET retry",
    async (status) => {
      for (const method of ["POST", "GET"]) {
        const { transport, fetcher } = setup([
          new Response("private raw response", {
            status,
            headers: { "Retry-After": "0" },
          }),
        ]);
        const pending =
          method === "POST"
            ? transport.createCheckoutTransaction(input())
            : transport.retrieveCheckoutTransaction({
                transactionReference: transactionRef,
                expected: input(),
              });
        await expect(pending).rejects.toMatchObject({
          status,
          mutationMayHaveSucceeded: method === "POST",
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
      }
    },
  );
  it.each(["headers", "body"])(
    "bounds timeout through stalled %s and never retries POST",
    async (stage) => {
      vi.useFakeTimers();
      const response =
        stage === "headers"
          ? () => new Promise<Response>(() => {})
          : new Response(new ReadableStream({ start() {} }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
      const { transport, fetcher } = setup([response]);
      const pending = expect(
        transport.createCheckoutTransaction(input()),
      ).rejects.toMatchObject({
        code: "timeout",
        mutationMayHaveSucceeded: true,
      });
      await vi.advanceTimersByTimeAsync(PADDLE_CHECKOUT_LIMITS.timeoutMs);
      await pending;
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    },
  );
  it.each([true, false])(
    "bounds declared/streamed response bytes (declared=%s)",
    async (declared) => {
      const headers = {
        "Content-Type": "application/json",
        ...(declared
          ? {
              "Content-Length": String(
                PADDLE_CHECKOUT_LIMITS.responseBytes + 1,
              ),
            }
          : {}),
      };
      const { transport } = setup([
        new Response(" ".repeat(PADDLE_CHECKOUT_LIMITS.responseBytes + 1), {
          status: 201,
          headers,
        }),
      ]);
      await expect(
        transport.createCheckoutTransaction(input()),
      ).rejects.toMatchObject({
        code: "response_too_large",
        mutationMayHaveSucceeded: true,
      });
    },
  );
  it.each([
    new Response("broken json", {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    new Response("{}", {
      status: 201,
      headers: { "Content-Type": "text/html" },
    }),
    json(null),
    new Response(new Uint8Array([0xff]), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  ])("rejects malformed HTTP response %#", async (response) => {
    await expect(
      setup([response]).transport.createCheckoutTransaction(input()),
    ).rejects.toMatchObject({
      code: "malformed_response",
      mutationMayHaveSucceeded: true,
    });
  });
  it("redacts exceptions, credentials, provider response and destination from errors", async () => {
    const marker = "synthetic-private-marker";
    for (const response of [
      new Response(marker, { status: 422 }),
      () => Promise.reject(new Error(marker)),
      json({
        ...providerData(),
        checkout: { url: `https://evil.test/${marker}` },
      }),
    ]) {
      const { transport, fetcher, key } = setup([response]);
      const error = await transport
        .createCheckoutTransaction(input())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PaddleCheckoutError);
      const rendered = `${String(error)}${JSON.stringify(error)}${(error as Error).stack}`;
      expect(rendered.includes(marker)).toBe(false);
      expect(rendered.includes(key)).toBe(false);
      expect(rendered.includes("https://")).toBe(false);
      expect((error as Error).cause).toBeUndefined();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("blocks alternate HTTP operations even inside the narrow transport module", async () => {
    const fetcher = vi.fn<typeof fetch>(),
      send = checkoutHttp(fetcher, () => "synthetic");
    await expect(send("POST", "/customers", "{}")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      send("DELETE" as "GET", "/transactions/synthetic"),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      send("GET", "/transactions/../customers"),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("forbids ambient network in unit tests", () => {
    expect(() => fetch("https://example.invalid")).toThrow(
      "Unit network boundary",
    );
  });
});
