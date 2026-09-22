import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  handlePaddleCheckout,
  checkoutAccessMode,
} from "../../supabase/functions/_shared/paddle-checkout-handler";
import { sandboxCheckoutAuthorization } from "../../supabase/functions/_shared/paddle-checkout/config";
import { sandboxAuthorization } from "../../supabase/functions/_shared/paddle-catalogue/config";
import { checkoutLegalVersion } from "../../supabase/functions/_shared/paddle-checkout-orchestration";
import { paddleCheckoutRpcError } from "../../supabase/functions/_shared/paddle-checkout-rpc";

const key = () =>
  [
    "pdl_sdbx_apikey",
    randomBytes(13).toString("hex"),
    randomBytes(11).toString("hex"),
    "Tst",
  ].join("_");
const intent = () => ({
  planKey: "growth",
  cadence: "monthly",
  additionalCoachSeats: 0,
  legal: {
    termsAccepted: true,
    refundAcknowledged: true,
    termsVersion: checkoutLegalVersion,
    refundVersion: checkoutLegalVersion,
  },
});
function setup(overrides: Record<string, string | undefined> = {}) {
  const actor = randomUUID(),
    attempt = randomUUID(),
    secret = key();
  const env: Record<string, string | undefined> = {
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_SANDBOX_CHECKOUT_API_KEY: secret,
    PADDLE_CHECKOUT_ACCESS_MODE: "pilot",
    PADDLE_CHECKOUT_PILOT_USER_ID: actor,
    PADDLE_SANDBOX_PAYMENT_PAGE_URL: "https://merchant.example.test/pay",
    PADDLE_SANDBOX_HOSTED_CHECKOUT_LAUNCH_URL:
      "https://sandbox-pay.paddle.io/checkout/synthetic-launch",
    ...overrides,
  };
  let beginError = "",
    failReady = false,
    failAmbiguous = false,
    open = false;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "begin_paddle_checkout_v1") {
      if (beginError)
        throw Error(paddleCheckoutRpcError(name, { message: beginError })!);
      if (open) throw Error("PADDLE_CHECKOUT_AMBIGUOUS");
      open = true;
      return {
        dispatch: true,
        status: "creating",
        attemptReference: attempt,
        operationReference: args.p_operation,
        base: {
          priceReference: "synthetic/base",
          productReference: "synthetic/product",
          quantity: 1,
        },
        seats: null,
      };
    }
    if (name === "mark_paddle_checkout_ready_v1" && failReady)
      throw Error("private persistence detail");
    if (name === "mark_paddle_checkout_ambiguous_v1" && failAmbiguous)
      throw Error("private persistence detail");
    return null;
  });
  const http = vi.fn<typeof fetch>(async (_url, options) => {
    const sent = JSON.parse(String(options?.body));
    return new Response(
      JSON.stringify({
        data: {
          id: "synthetic/transaction",
          status: "ready",
          collection_mode: "automatic",
          currency_code: "USD",
          custom_data: sent.custom_data,
          items: [
            {
              quantity: 1,
              price: { id: "synthetic/base", product_id: "synthetic/product" },
            },
          ],
          created_at: "2026-09-20T00:00:00Z",
          updated_at: "2026-09-20T00:00:01Z",
          billed_at: null,
          details: null,
          checkout: {
            url: "https://merchant.example.test/pay?_ptxn=synthetic%2Ftransaction",
          },
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
  const auth = vi.fn(
    async (_token: string): Promise<{ id: string } | null> => ({ id: actor }),
  );
  const deps = {
    authenticate: auth,
    serviceRpc: rpc,
    fetch: http,
    readEnvironment: (n: string) => env[n],
  };
  const run = (
    body: unknown = intent(),
    method = "POST",
    token: string | null = "synthetic-session",
  ) =>
    handlePaddleCheckout(
      new Request("https://local.test/checkout", {
        method,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
      () => deps,
    );
  return {
    env,
    actor,
    secret,
    rpc,
    http,
    auth,
    deps,
    run,
    deny: (c: string) => {
      beginError = c;
    },
    uncertain: (mark = false) => {
      failReady = true;
      failAmbiguous = mark;
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("dedicated checkout authorization", () => {
  it("uses only the dedicated credential while catalogue keeps its own", () => {
    const dedicated = key(),
      generic = key();
    const env: Record<string, string> = {
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_SANDBOX_CHECKOUT_API_KEY: dedicated,
      PADDLE_SANDBOX_API_KEY: generic,
    };
    expect(sandboxCheckoutAuthorization((n) => env[n])()).toBe(
      `Bearer ${dedicated}`,
    );
    expect(sandboxAuthorization((n) => env[n])()).toBe(`Bearer ${generic}`);
    expect(
      JSON.stringify(sandboxCheckoutAuthorization((n) => env[n])),
    ).toBeUndefined();
  });
  it.each([undefined, "invalid", "live", "generic"])(
    "rejects %s checkout credentials",
    (variant) => {
      const env: Record<string, string | undefined> = {
        PADDLE_ENVIRONMENT: "sandbox",
        PADDLE_SANDBOX_API_KEY: key(),
        PADDLE_SANDBOX_CHECKOUT_API_KEY:
          variant === "live"
            ? key().replace("sdbx", "live")
            : variant === "generic"
              ? undefined
              : variant,
      };
      expect(() => sandboxCheckoutAuthorization((n) => env[n])).toThrow(
        "configuration",
      );
    },
  );
  it("rejects browser access and returns only a static error", () => {
    vi.stubGlobal("window", {});
    expect(() => sandboxCheckoutAuthorization(() => key())).toThrow(
      "configuration",
    );
  });
});
describe("Paddle HTTP runtime with real orchestration and mocked provider HTTP", () => {
  it.each([undefined, "", "disabled", "ALL", " pilot", "invalid"])(
    "fails closed for mode %s before persistence",
    async (mode) => {
      const x = setup({ PADDLE_CHECKOUT_ACCESS_MODE: mode });
      expect(checkoutAccessMode(x.deps.readEnvironment)).toBe("disabled");
      expect(await (await x.run()).json()).toEqual({
        code: "PADDLE_CHECKOUT_ROLLOUT_DISABLED",
        retryable: false,
      });
      expect(x.rpc).not.toHaveBeenCalled();
      expect(x.http).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "", "not-an-actor"])(
    "rejects missing/mismatched pilot %s",
    async (pilot) => {
      const x = setup({ PADDLE_CHECKOUT_PILOT_USER_ID: pilot });
      expect((await x.run()).status).toBe(403);
      expect(x.rpc).not.toHaveBeenCalled();
      expect(x.http).not.toHaveBeenCalled();
    },
  );
  it.each(["pilot", "all"])(
    "admits %s only through trusted auth and DB owner gate, persists before response",
    async (mode) => {
      const x = setup({ PADDLE_CHECKOUT_ACCESS_MODE: mode });
      const response = await x.run(),
        result = await response.json();
      expect(response.status).toBe(200);
      expect(result).toEqual({
        status: "ready",
        checkoutUrl:
          "https://sandbox-pay.paddle.io/checkout/synthetic-launch?transaction_id=synthetic%2Ftransaction",
      });
      expect(x.auth).toHaveBeenCalledExactlyOnceWith("synthetic-session");
      expect(x.rpc.mock.calls[0]![1].p_actor).toBe(x.actor);
      expect(x.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        x.http.mock.invocationCallOrder[0]!,
      );
      expect(x.rpc.mock.calls[1]![0]).toBe("mark_paddle_checkout_ready_v1");
      expect(x.http).toHaveBeenCalledOnce();
      expect(
        new Headers(x.http.mock.calls[0]![1]?.headers).get("authorization"),
      ).toBe(`Bearer ${x.secret}`);
      expect(JSON.stringify(x.rpc.mock.calls)).not.toMatch(
        /checkoutUrl|https:|_ptxn|transaction_id/,
      );
      expect(JSON.stringify(result)).not.toContain(x.secret);
      expect(Object.keys(result).sort()).toEqual(["checkoutUrl", "status"]);
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
  it.each([
    "PADDLE_CHECKOUT_FORBIDDEN",
    "PADDLE_CHECKOUT_DISABLED",
    "PADDLE_CHECKOUT_SEAT_POLICY",
    "PADDLE_CHECKOUT_MAPPING",
    "PADDLE_CHECKOUT_CONFLICT",
  ])("DB %s prevents POST", async (code) => {
    const x = setup({ PADDLE_CHECKOUT_ACCESS_MODE: "all" });
    x.deny(code);
    expect((await (await x.run()).json()).code).toBe(code);
    expect(x.http).not.toHaveBeenCalled();
  });
  it("requires authentication even in all mode", async () => {
    const x = setup({ PADDLE_CHECKOUT_ACCESS_MODE: "all" });
    x.auth.mockResolvedValue(null);
    expect((await x.run()).status).toBe(401);
    expect((await x.run(intent(), "POST", null)).status).toBe(401);
    expect(x.rpc).not.toHaveBeenCalled();
    expect(x.http).not.toHaveBeenCalled();
  });
  it.each([
    "userId",
    "billingAccountId",
    "priceId",
    "productId",
    "operationId",
    "transactionId",
    "environment",
    "checkoutUrl",
    "provider",
    "successUrl",
  ])("rejects browser authority field %s", async (field) => {
    const x = setup();
    expect((await x.run({ ...intent(), [field]: "injected" })).status).toBe(
      400,
    );
    expect(x.rpc).not.toHaveBeenCalled();
    expect(x.http).not.toHaveBeenCalled();
  });
  it.each([-1, 6, 0.5, "2"])(
    "rejects invalid seats %s without dispatch",
    async (seats) => {
      const x = setup();
      expect(
        (await x.run({ ...intent(), additionalCoachSeats: seats })).status,
      ).toBe(400);
      expect(x.http).not.toHaveBeenCalled();
    },
  );
  it("rejects unacknowledged legal terms", async () => {
    const x = setup(),
      body = intent();
    body.legal.termsAccepted = false;
    expect((await (await x.run(body)).json()).code).toBe(
      "PADDLE_CHECKOUT_LEGAL_REQUIRED",
    );
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it.each([
    "PADDLE_SANDBOX_CHECKOUT_API_KEY",
    "PADDLE_SANDBOX_PAYMENT_PAGE_URL",
    "PADDLE_SANDBOX_HOSTED_CHECKOUT_LAUNCH_URL",
  ])("invalid configuration %s precedes persistence", async (name) => {
    const x = setup({ [name]: "unsafe" });
    expect((await (await x.run()).json()).code).toBe(
      "PADDLE_CHECKOUT_CONFIGURATION",
    );
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it("supports validated merchant links when no hosted launch is configured", async () => {
    const x = setup({ PADDLE_SANDBOX_HOSTED_CHECKOUT_LAUNCH_URL: undefined });
    expect((await (await x.run()).json()).checkoutUrl).toBe(
      "https://merchant.example.test/pay?_ptxn=synthetic%2Ftransaction",
    );
  });
  it.each([false, true])(
    "lost ready persistence requires recovery (mark fails=%s)",
    async (mark) => {
      const x = setup();
      x.uncertain(mark);
      expect(await (await x.run()).json()).toEqual({
        code: mark
          ? "PADDLE_CHECKOUT_RECOVERY_REQUIRED"
          : "PADDLE_CHECKOUT_AMBIGUOUS",
        retryable: false,
      });
      expect((await x.run()).status).toBe(409);
      expect(x.http).toHaveBeenCalledOnce();
    },
  );
  it("network ambiguity never retries POST, including a repeated browser call", async () => {
    const x = setup();
    x.http.mockRejectedValue(Error("private provider response"));
    expect(await (await x.run()).json()).toEqual({
      code: "PADDLE_CHECKOUT_AMBIGUOUS",
      retryable: false,
    });
    await x.run();
    expect(x.http).toHaveBeenCalledOnce();
  });
  it("records a non-dispatched outcome for unusable admitted mapping facts", async () => {
    const x = setup();
    x.rpc.mockImplementationOnce(async (_name, args) => ({
      dispatch: true,
      status: "creating",
      attemptReference: randomUUID(),
      operationReference: args.p_operation,
      base: {
        priceReference: "",
        productReference: "synthetic/product",
        quantity: 1,
      },
      seats: null,
    }));
    expect(await (await x.run()).json()).toEqual({
      code: "PADDLE_CHECKOUT_NOT_DISPATCHED",
      retryable: false,
    });
    expect(x.rpc.mock.calls[1]![0]).toBe("mark_paddle_checkout_failed_v1");
    expect(x.http).not.toHaveBeenCalled();
  });
  it("sanitizes provider rejection and unsafe destination", async () => {
    for (const status of [422, 503]) {
      const x = setup();
      x.http.mockResolvedValue(new Response("private body", { status }));
      const result = await (await x.run()).json();
      expect(result.code).toBe("PADDLE_CHECKOUT_AMBIGUOUS");
      expect(JSON.stringify(result)).not.toContain("private");
      expect(x.http).toHaveBeenCalledOnce();
    }
    const x = setup();
    x.http.mockResolvedValue(
      new Response(
        JSON.stringify({ data: { checkout: { url: "https://evil.test" } } }),
        { status: 201 },
      ),
    );
    expect((await (await x.run()).json()).code).toBe(
      "PADDLE_CHECKOUT_AMBIGUOUS",
    );
  });
  it.each(["creating", "ready", "failed", "expired", "completed"])(
    "reused %s never fabricates a destination",
    async (status) => {
      const x = setup();
      x.rpc.mockResolvedValueOnce({ dispatch: false, status } as never);
      expect(await (await x.run()).json()).toEqual({
        code: "PADDLE_CHECKOUT_RECOVERY_REQUIRED",
        status,
        retryable: false,
      });
      expect(x.http).not.toHaveBeenCalled();
    },
  );
  it("bounds bodies and handles preflight without creating dependencies", async () => {
    const factory = vi.fn(() => {
      throw Error("must not run");
    });
    for (const method of ["GET", "OPTIONS"]) {
      const r = await handlePaddleCheckout(
        new Request("https://local.test", { method }),
        factory,
      );
      expect(r.status).toBe(method === "GET" ? 405 : 200);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
    expect(factory).not.toHaveBeenCalled();
    const x = setup();
    expect((await x.run("x".repeat(5000))).status).toBe(400);
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it("registers JWT and preserves reviewed DB error codes at the service adapter", () => {
    expect(readFileSync("supabase/config.toml", "utf8")).toMatch(
      /\[functions.billing-create-paddle-checkout\]\s+verify_jwt = true/,
    );
    for (const code of [
      "DISABLED",
      "FORBIDDEN",
      "SEAT_POLICY",
      "MAPPING",
      "CONFLICT",
      "AMBIGUOUS",
    ])
      expect(
        paddleCheckoutRpcError("begin_paddle_checkout_v1", {
          message: `PADDLE_CHECKOUT_${code}`,
        }),
      ).toBe(`PADDLE_CHECKOUT_${code}`);
    expect(
      readFileSync("supabase/functions/_shared/billing-runtime.ts", "utf8"),
    ).toContain("paddleCheckoutRpcError(name, error)");
  });
  it.each([
    ["BILLING_CATALOGUE_INCOMPLETE", "MAPPING"],
    ["BILLING_CATALOGUE_EVIDENCE_REQUIRED", "MAPPING"],
    ["BILLING_V2_MAPPING_UNAVAILABLE", "MAPPING"],
    ["BILLING_GUARD_CHECKOUT_ALREADY_OPEN", "CONFLICT"],
    ["BILLING_GUARD_OPERATION_ALREADY_OPEN", "CONFLICT"],
    ["BILLING_ALREADY_SUBSCRIBED", "CONFLICT"],
    ["BILLING_GUARD_FORBIDDEN", "FORBIDDEN"],
    ["private DB detail", "PERSISTENCE"],
  ])(
    "classifies underlying DB %s without exposing it",
    async (dbCode, suffix) => {
      const x = setup();
      x.deny(dbCode);
      expect((await (await x.run()).json()).code).toBe(
        `PADDLE_CHECKOUT_${suffix}`,
      );
      expect(x.http).not.toHaveBeenCalled();
      expect(
        paddleCheckoutRpcError("begin_my_billing_checkout_attempt", {
          message: dbCode,
        }),
      ).toBeNull();
    },
  );
});
