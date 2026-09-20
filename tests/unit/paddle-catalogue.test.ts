import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPaddleSandboxCatalogue,
  PaddleCatalogueError,
  PADDLE_CATALOGUE_LIMITS,
} from "../../supabase/functions/_shared/paddle-catalogue/index";

// Generated synthetic material only; never read developer credentials in unit tests.
const synthetic = () =>
  [
    "pdl",
    "sdbx",
    "apikey",
    randomBytes(13).toString("hex"),
    randomBytes(11).toString("hex"),
    "Tst",
  ].join("_");
const origin = "https://sandbox-api.paddle.com";
function product(id = "Opaque-Product") {
  return {
    id,
    status: "active",
    tax_category: "standard",
    name: "Discard me",
    custom_data: { private: "discard" },
  };
}
function price() {
  return {
    id: "Opaque-Price",
    product_id: "Opaque-Product",
    status: "active",
    unit_price: { amount: "1900", currency_code: "USD" },
    billing_cycle: { interval: "month", frequency: 1 },
    trial_period: null as unknown,
    quantity: { minimum: 1, maximum: 100 },
    tax_mode: "account_setting",
    unit_price_overrides: [] as unknown[],
  };
}
const page = (data: unknown[], next: string | null = null) => ({
  data,
  meta: { pagination: { has_more: next !== null, next } },
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
function setup(
  responses: (Response | (() => Promise<Response>))[] = [],
  env: Record<string, string | undefined> = {},
) {
  const key = synthetic();
  const readEnvironment = (name: string) =>
    ({ PADDLE_ENVIRONMENT: "sandbox", PADDLE_SANDBOX_API_KEY: key, ...env })[
      name
    ];
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses)
    fetcher.mockImplementationOnce(
      typeof response === "function" ? response : async () => response,
    );
  const adapter = createPaddleSandboxCatalogue({
    readEnvironment,
    fetch: fetcher,
  });
  return { adapter, fetcher, key };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Paddle configuration and surface", () => {
  it.each([
    { PADDLE_ENVIRONMENT: undefined },
    { PADDLE_ENVIRONMENT: "test" },
    { PADDLE_ENVIRONMENT: "live" },
    { PADDLE_SANDBOX_API_KEY: undefined },
    { PADDLE_SANDBOX_API_KEY: "invalid" },
    { PADDLE_SANDBOX_API_KEY: synthetic().replace("sdbx", "live") },
    { PADDLE_API_KEY: synthetic() },
    { PADDLE_LIVE_API_KEY: synthetic() },
    { PADDLE_API_BASE_URL: "https://api.paddle.com" },
  ])("fails closed on incomplete/mixed configuration %#", (env) => {
    expect(() => setup([], env)).toThrow("Paddle catalogue: configuration");
  });
  it("sanitizes secret-store failures", () => {
    expect(() =>
      createPaddleSandboxCatalogue({
        readEnvironment: () => {
          throw new Error(synthetic());
        },
      }),
    ).toThrow("Paddle catalogue: configuration");
  });
  it("rejects browser execution before reading secrets", () => {
    vi.stubGlobal("window", {});
    const readEnvironment = vi.fn();
    expect(() => createPaddleSandboxCatalogue({ readEnvironment })).toThrow(
      "configuration",
    );
    expect(readEnvironment).not.toHaveBeenCalled();
  });
  it("exposes only a sandbox catalogue capability and GET methods", async () => {
    const { adapter, fetcher, key } = setup([
      json(page([product()])),
      json(page([price()])),
      json({ data: product() }),
      json({ data: price() }),
    ]);
    expect(Object.keys(adapter).sort()).toEqual([
      "environment",
      "listPrices",
      "listProducts",
      "provider",
      "retrievePrice",
      "retrieveProduct",
    ]);
    expect(adapter.provider).toBe("paddle");
    expect(adapter.environment).toBe("test");
    await adapter.listProducts();
    await adapter.listPrices();
    await adapter.retrieveProduct("Opaque-Product");
    await adapter.retrievePrice("Opaque-Price");
    for (const [url, options] of fetcher.mock.calls) {
      expect(new URL(String(url)).origin).toBe(origin);
      expect(options?.method).toBe("GET");
      expect(options?.redirect).toBe("error");
      expect(options?.body).toBeUndefined();
      // Boolean assertion avoids including authorization material in failure diffs.
      expect(
        new Headers(options?.headers).get("Authorization") === `Bearer ${key}`,
      ).toBe(true);
    }
    expect(JSON.stringify(adapter).includes(key)).toBe(false);
  });
  it("has no browser imports or database/payment boundary dependencies", () => {
    const visit = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((f) =>
        f.isDirectory() ? visit(join(dir, f.name)) : [join(dir, f.name)],
      );
    for (const file of visit("src").filter((f) => /\.[jt]sx?$/.test(f)))
      expect(readFileSync(file, "utf8")).not.toMatch(/paddle-catalogue/);
    for (const file of visit("supabase/functions/_shared/paddle-catalogue")) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(
        /\.rpc\(|createClient|billing-verified|billing-commercial|lemon-squeezy|console\./,
      );
    }
  });
});

describe("sanitized catalogue observations", () => {
  it.each(["account_setting", "internal", "external", "location"])(
    "preserves documented tax mode %s",
    async (tax_mode) => {
      const { adapter } = setup([json(page([{ ...price(), tax_mode }]))]);
      expect((await adapter.listPrices())[0]?.taxMode).toBe(tax_mode);
    },
  );
  it.each(["undocumented", null, undefined])(
    "rejects unknown, null or missing tax mode %#",
    async (tax_mode) => {
      const { adapter } = setup([json(page([{ ...price(), tax_mode }]))]);
      await expect(adapter.listPrices()).rejects.toThrow("malformed_response");
    },
  );
  it.each([false, true])(
    "keeps location tax mode independent of monetary overrides: %s",
    async (hasOverrides) => {
      const { adapter } = setup([
        json(
          page([
            {
              ...price(),
              tax_mode: "location",
              unit_price_overrides: hasOverrides
                ? [
                    {
                      country_codes: ["US"],
                      unit_price: { amount: "2000", currency_code: "USD" },
                    },
                  ]
                : [],
            },
          ]),
        ),
      ]);
      const observation = (await adapter.listPrices())[0];
      expect(observation?.taxMode).toBe("location");
      expect(observation?.hasUnitPriceOverrides).toBe(hasOverrides);
    },
  );
  it("lists products and drops unknown fields and descriptive identity hints", async () => {
    const { adapter } = setup([json(page([product()]))]);
    expect(await adapter.listProducts()).toEqual([
      {
        productReference: "Opaque-Product",
        status: "active",
        taxCategory: "standard",
      },
    ]);
  });
  it("lists prices with exact integer money and monthly recurrence", async () => {
    const raw = {
      ...price(),
      unknown: "discard",
      unit_price: {
        amount: "900719925474099312345",
        currency_code: "USD",
        secret: "discard",
      },
    };
    const { adapter } = setup([json(page([raw]))]);
    expect(await adapter.listPrices()).toEqual([
      {
        priceReference: "Opaque-Price",
        productReference: "Opaque-Product",
        status: "active",
        unitPrice: { amount: "900719925474099312345", currency: "USD" },
        billingCycle: { interval: "month", frequency: 1 },
        trial: null,
        quantity: { minimum: 1, maximum: 100 },
        taxMode: "account_setting",
        hasUnitPriceOverrides: false,
      },
    ]);
  });
  it("preserves annual recurrence and paid/cardless trial facts", async () => {
    const raw = {
      ...price(),
      billing_cycle: { interval: "year", frequency: 1 },
      trial_period: {
        interval: "day",
        frequency: 14,
        requires_payment_method: false,
        unit_price: { amount: "100", currency_code: "EUR" },
        unit_price_overrides: [{}],
      },
      unit_price_overrides: [{}],
    };
    const { adapter } = setup([json(page([raw]))]);
    expect((await adapter.listPrices())[0]).toMatchObject({
      billingCycle: { interval: "year", frequency: 1 },
      trial: {
        interval: "day",
        frequency: 14,
        requiresPaymentMethod: false,
        unitPrice: { amount: "100", currency: "EUR" },
        hasUnitPriceOverrides: true,
      },
      hasUnitPriceOverrides: true,
    });
  });
  it("represents free trials and non-recurring prices", async () => {
    const { adapter } = setup([
      json(
        page([
          {
            ...price(),
            trial_period: {
              interval: "week",
              frequency: 2,
              requires_payment_method: true,
            },
          },
        ]),
      ),
      json(page([{ ...price(), billing_cycle: null }])),
    ]);
    expect((await adapter.listPrices())[0]?.trial).toEqual({
      interval: "week",
      frequency: 2,
      requiresPaymentMethod: true,
      unitPrice: null,
      hasUnitPriceOverrides: false,
    });
    expect((await adapter.listPrices())[0]?.billingCycle).toBeNull();
  });
  it("includes archived products and prices without treating them as active", async () => {
    const { adapter, fetcher } = setup([
      json(page([{ ...product(), status: "archived" }])),
      json(page([{ ...price(), status: "archived" }])),
    ]);
    expect((await adapter.listProducts())[0]?.status).toBe("archived");
    expect((await adapter.listPrices())[0]?.status).toBe("archived");
    for (const [url] of fetcher.mock.calls)
      expect(new URL(String(url)).searchParams.get("status")).toBe(
        "active,archived",
      );
  });
  it.each(["inactive", "deleted", null])(
    "rejects undocumented status %s",
    async (status) => {
      const { adapter } = setup([json(page([{ ...product(), status }]))]);
      await expect(adapter.listProducts()).rejects.toMatchObject({
        code: "malformed_response",
      });
    },
  );
  it.each(["-1", "1.5", "1e3", " 10", "01", "", "1".repeat(36), 100, null])(
    "rejects invalid amount %#",
    async (amount) => {
      const { adapter } = setup([
        json(
          page([{ ...price(), unit_price: { amount, currency_code: "USD" } }]),
        ),
      ]);
      await expect(adapter.listPrices()).rejects.toMatchObject({
        code: "malformed_response",
      });
    },
  );
  it.each(["usd", "US", "$", 840, { code: "USD" }, null])(
    "rejects invalid currency representation %#",
    async (currency_code) => {
      const { adapter } = setup([
        json(
          page([{ ...price(), unit_price: { amount: "100", currency_code } }]),
        ),
      ]);
      await expect(adapter.listPrices()).rejects.toMatchObject({
        code: "malformed_response",
      });
    },
  );
  it.each([
    { quantity: { minimum: 3, maximum: 2 } },
    { quantity: { minimum: 0, maximum: 1 } },
    { billing_cycle: { interval: "month", frequency: 0 } },
    { billing_cycle: { interval: "quarter", frequency: 1 } },
    { trial_period: {} },
    {
      trial_period: {
        interval: "day",
        frequency: 1,
        requires_payment_method: "true",
      },
    },
    {
      trial_period: {
        interval: "day",
        frequency: 1,
        requires_payment_method: true,
      },
      billing_cycle: null,
    },
    { tax_mode: "unknown" },
    { unit_price_overrides: null },
    { product_id: "" },
  ])("rejects malformed price facts %#", async (change) => {
    const { adapter } = setup([json(page([{ ...price(), ...change }]))]);
    await expect(adapter.listPrices()).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
  it("preserves opaque references and encodes them as one path component", async () => {
    const id = "Case/Sensitive?opaque#value";
    const { adapter, fetcher } = setup([json({ data: product(id) })]);
    expect((await adapter.retrieveProduct(id)).productReference).toBe(id);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `${origin}/products/${encodeURIComponent(id)}`,
    );
  });
  it.each(["", ".", "..", "bad\nref"])(
    "rejects invalid reference before HTTP %#",
    async (ref) => {
      const { adapter, fetcher } = setup();
      await expect(adapter.retrieveProduct(ref)).rejects.toMatchObject({
        code: "invalid_reference",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects mismatched retrieve identity", async () => {
    const { adapter } = setup([json({ data: product("other") })]);
    await expect(adapter.retrieveProduct("requested")).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
});

describe("pagination and bounded HTTP", () => {
  it("enforces a total deadline across otherwise successful pages", async () => {
    vi.useFakeTimers();
    const responses = Array.from(
      { length: 10 },
      (_, i) => () =>
        new Promise<Response>((resolve) =>
          setTimeout(
            () =>
              resolve(
                json(
                  page(
                    [product(`id-${i}`)],
                    `${origin}/products?after=cursor-${i}`,
                  ),
                ),
              ),
            9000,
          ),
        ),
    );
    const { adapter, fetcher } = setup(responses);
    const result = expect(adapter.listProducts()).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.advanceTimersByTimeAsync(
      PADDLE_CATALOGUE_LIMITS.operationTimeoutMs,
    );
    await result;
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
  it("returns an empty catalogue", async () => {
    const { adapter } = setup([json(page([])), json(page([]))]);
    expect(await adapter.listProducts()).toEqual([]);
    expect(await adapter.listPrices()).toEqual([]);
  });
  it.each(["products", "prices"])(
    "paginates %s while retaining fixed filters",
    async (kind) => {
      const items =
        kind === "products"
          ? [product("one"), product("two")]
          : [
              { ...price(), id: "one" },
              { ...price(), id: "two" },
            ];
      const { adapter, fetcher } = setup([
        json(
          page([items[0]], `${origin}/${kind}?after=cursor&include=private`),
        ),
        json(page([items[1]])),
      ]);
      const result = await (kind === "products"
        ? adapter.listProducts()
        : adapter.listPrices());
      expect(result).toHaveLength(2);
      const second = new URL(String(fetcher.mock.calls[1]?.[0]));
      expect(second.searchParams.get("after")).toBe("cursor");
      expect(second.searchParams.has("include")).toBe(false);
      expect(second.searchParams.get("status")).toBe("active,archived");
    },
  );
  it.each([
    "https://evil.test/products?after=x",
    "https://api.paddle.com/products?after=x",
    `${origin}/prices?after=x`,
    `${origin}/products`,
    `${origin}/products?after=x&after=y`,
    `${origin}/products?after=x#fragment`,
    "bad url",
  ])("rejects unsafe pagination %#", async (next) => {
    const { adapter, fetcher } = setup([json(page([product()], next))]);
    await expect(adapter.listProducts()).rejects.toMatchObject({
      code: "malformed_response",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects repeated cursors and duplicate records", async () => {
    const next = `${origin}/products?after=x`;
    const a = setup([
      json(page([product("a")], next)),
      json(page([product("b")], next)),
    ]);
    await expect(a.adapter.listProducts()).rejects.toMatchObject({
      code: "malformed_response",
    });
    const b = setup([json(page([product(), product()]))]);
    await expect(b.adapter.listProducts()).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
  it("rejects incomplete pagination rather than returning a partial catalogue", async () => {
    const { adapter, fetcher } = setup(
      Array.from({ length: 100 }, (_, i) =>
        json(
          page([product(`id-${i}`)], `${origin}/products?after=cursor-${i}`),
        ),
      ),
    );
    await expect(adapter.listProducts()).rejects.toMatchObject({
      code: "pagination_limit",
    });
    expect(fetcher).toHaveBeenCalledTimes(100);
  });
  it.each([
    null,
    {},
    { data: {} },
    { data: [], meta: {} },
    page([{}]),
    { data: [], meta: { pagination: { has_more: "false" } } },
    page([], `${origin}/products?after=x`),
    page(Array.from({ length: 201 }, (_, i) => product(String(i)))),
  ])("rejects malformed envelope %#", async (body) => {
    const { adapter } = setup([json(body)]);
    await expect(adapter.listProducts()).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
  it.each([401, 403, 404, 400, 500, 302])(
    "handles HTTP %i without retries or raw error data",
    async (status) => {
      const { adapter, fetcher } = setup([
        new Response("private response", { status }),
      ]);
      await expect(adapter.listProducts()).rejects.toMatchObject({ status });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([429, 502, 503, 504])(
    "retries transient GET HTTP %i within bounds",
    async (status) => {
      vi.useFakeTimers();
      const { adapter, fetcher } = setup([
        new Response(null, { status }),
        new Response(null, { status }),
        json(page([])),
      ]);
      const result = adapter.listProducts();
      await vi.runAllTimersAsync();
      expect(await result).toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
  it("exhausts retries with a sanitized status error", async () => {
    vi.useFakeTimers();
    const { adapter, fetcher } = setup(
      Array.from({ length: 3 }, () => new Response(null, { status: 429 })),
    );
    const result = expect(adapter.listProducts()).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
    await vi.runAllTimersAsync();
    await result;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("respects bounded Retry-After and refuses long cooldown retries", async () => {
    vi.useFakeTimers();
    const a = setup([
      new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
      json(page([])),
    ]);
    const promise = a.adapter.listProducts();
    await vi.advanceTimersByTimeAsync(1999);
    expect(a.fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toEqual([]);
    const b = setup([
      new Response(null, { status: 429, headers: { "Retry-After": "60" } }),
    ]);
    await expect(b.adapter.listProducts()).rejects.toMatchObject({
      code: "rate_limited",
    });
    expect(b.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["headers", "body"])(
    "bounds timeout including stalled %s",
    async (stage) => {
      vi.useFakeTimers();
      const response =
        stage === "headers"
          ? () => new Promise<Response>(() => {})
          : new Response(new ReadableStream({ start() {} }), {
              headers: { "Content-Type": "application/json" },
            });
      const { adapter, fetcher } = setup([response]);
      const result = expect(adapter.listProducts()).rejects.toMatchObject({
        code: "timeout",
      });
      await vi.advanceTimersByTimeAsync(PADDLE_CATALOGUE_LIMITS.timeoutMs);
      await result;
      expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([true, false])(
    "bounds declared and streamed response size (declared=%s)",
    async (declared) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (declared)
        headers["Content-Length"] = String(
          PADDLE_CATALOGUE_LIMITS.responseBytes + 1,
        );
      const { adapter } = setup([
        new Response(" ".repeat(PADDLE_CATALOGUE_LIMITS.responseBytes + 1), {
          headers,
        }),
      ]);
      await expect(adapter.listProducts()).rejects.toMatchObject({
        code: "response_too_large",
      });
    },
  );
  it.each([
    new Response("invalid", {
      headers: { "Content-Type": "application/json" },
    }),
    new Response("{}", { headers: { "Content-Type": "text/html" } }),
  ])("sanitizes JSON/content-type failures %#", async (response) => {
    const { adapter } = setup([response]);
    await expect(adapter.listProducts()).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
  it("redacts credentials, raw bodies and thrown fetch exceptions", async () => {
    const secret = synthetic();
    for (const response of [
      new Response(secret, { status: 401 }),
      () => Promise.reject(new Error(`Authorization: Bearer ${secret}`)),
      new Response(secret, { headers: { "Content-Type": "application/json" } }),
    ]) {
      const { adapter } = setup([response]);
      const error = await adapter.listProducts().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PaddleCatalogueError);
      expect(
        `${String(error)}${JSON.stringify(error)}${(error as Error).stack}`.includes(
          secret,
        ),
      ).toBe(false);
      expect((error as Error).cause).toBeUndefined();
    }
  });
});
