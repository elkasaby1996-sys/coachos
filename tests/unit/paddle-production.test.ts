import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { paddleEnvironment } from "../../supabase/functions/_shared/paddle-environment";
import { createPaddleCheckoutTransport } from "../../supabase/functions/_shared/paddle-checkout";
import { createPaddleWebhookVerifier } from "../../supabase/functions/_shared/paddle-webhook";
import { webhookConfiguration } from "../../supabase/functions/_shared/paddle-webhook/ingress";
import { handlePaddleCustomerPortal } from "../../supabase/functions/_shared/paddle-customer-portal";
import { createPaddleCatalogueVerifier } from "../../supabase/functions/_shared/paddle-catalogue-verifier";
import { syntheticCatalogue } from "../fixtures/paddle-catalogue-verifier";
import { paddleBrowserConfiguration } from "../../src/features/billing/paddle-browser-config";
import { acceptsPaddleCheckoutUrl } from "../../src/features/billing/providers/paddle";
import { acceptsPaddlePortalUrl } from "../../src/features/billing/portal-url";

const key = (realm: "test" | "live") =>
  `pdl_${realm === "test" ? "sdbx" : "live"}_apikey_${randomBytes(13).toString("hex")}_${randomBytes(11).toString("hex")}_Tst`;
function config(realm: "test" | "live", suffix = "CHECKOUT_API_KEY") {
  const values: Record<string, string> = {
    PADDLE_ENVIRONMENT: realm === "test" ? "sandbox" : "production",
    [`PADDLE_${realm === "test" ? "SANDBOX" : "LIVE"}_${suffix}`]: key(realm),
  };
  return { values, read: (name: string) => values[name] };
}

describe.each(["test", "live"] as const)("Paddle %s deployment", (realm) => {
  it("uses only its fixed API host and server-resolved prices", async () => {
    const env = config(realm);
    const input = {
      base: { priceReference: "pri_base", quantity: 1 as const },
      seats: { priceReference: "pri_seat", quantity: 2 },
      correlation: {
        operationReference: "operation",
        attemptReference: "attempt",
      },
    };
    const http = vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      expect(body.items).toEqual([
        { price_id: "pri_base", quantity: 1 },
        { price_id: "pri_seat", quantity: 2 },
      ]);
      return new Response(
        JSON.stringify({
          data: {
            id: "txn_synthetic",
            status: "ready",
            collection_mode: "automatic",
            currency_code: "USD",
            custom_data: body.custom_data,
            items: body.items.map(
              (item: { price_id: string; quantity: number }) => ({
                quantity: item.quantity,
                price: { id: item.price_id, product_id: "pro_synthetic" },
              }),
            ),
            created_at: "2026-11-09T00:00:00Z",
            updated_at: "2026-11-09T00:00:00Z",
            billed_at: null,
            details: null,
            checkout: {
              url: "https://repsync.example/billing/checkout?_ptxn=txn_synthetic",
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    const transport = createPaddleCheckoutTransport({
      readEnvironment: env.read,
      fetch: http,
      paymentPageUrl: "https://repsync.example/billing/checkout",
    });
    expect((await transport.createCheckoutTransaction(input)).environment).toBe(
      realm,
    );
    expect(String(http.mock.calls[0]![0])).toBe(
      `${realm === "test" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com"}/transactions`,
    );
    expect(http.mock.calls[0]![1]?.redirect).toBe("error");
  });
  it("rejects mixed credentials and never allows a custom API host", () => {
    const env = config(realm);
    env.values[`PADDLE_${realm === "test" ? "LIVE" : "SANDBOX"}_API_KEY`] = key(
      realm === "test" ? "live" : "test",
    );
    expect(() => paddleEnvironment(env.read)).toThrow("PADDLE_CONFIGURATION");
    const custom = config(realm);
    custom.values.PADDLE_API_BASE_URL = "https://example.invalid";
    expect(() => paddleEnvironment(custom.read)).toThrow(
      "PADDLE_CONFIGURATION",
    );
  });
  it("binds authenticated webhook proofs to the configured secret's realm", async () => {
    const env = config(realm, "API_KEY");
    const secret = `synthetic-notification-${realm}-secret-for-unit-tests`;
    env.values[
      `PADDLE_${realm === "test" ? "SANDBOX" : "LIVE"}_WEBHOOK_SECRET`
    ] = secret;
    const time = Date.parse("2026-11-09T00:00:00Z");
    const raw = new TextEncoder().encode(
      JSON.stringify({
        event_id: "evt_synthetic",
        notification_id: "ntf_synthetic",
        event_type: "transaction.completed",
        occurred_at: "2026-11-09T00:00:00Z",
        data: {
          id: "txn_synthetic",
          customer_id: "ctm_synthetic",
          subscription_id: "sub_synthetic",
          status: "completed",
          currency_code: "USD",
          items: [
            {
              quantity: 1,
              price: {
                id: "pri_synthetic",
                product_id: "pro_synthetic",
                unit_price: { amount: "5900", currency_code: "USD" },
              },
            },
          ],
        },
      }),
    );
    const header = `ts=${time / 1000};h1=${createHmac("sha256", secret)
      .update(`${time / 1000}:`)
      .update(raw)
      .digest("hex")}`;
    const verifier = createPaddleWebhookVerifier({
      ...webhookConfiguration(env.read),
      now: () => time,
    });
    const result = await verifier.verify({
      method: "POST",
      headers: [
        ["Content-Type", "application/json"],
        ["Paddle-Signature", header],
      ],
      rawBody: raw,
    });
    expect(result.kind).toBe("supported");
    if (result.kind !== "supported") throw new Error();
    expect(
      verifier.ingestionArguments(result.receipt).p_observation.environment,
    ).toBe(realm);
    expect(() =>
      verifier.readReplayFacts(result.receipt, {
        provider: "paddle",
        environment: realm === "test" ? "live" : "test",
      }),
    ).toThrow();
    expect(() =>
      createPaddleWebhookVerifier({
        environment: realm,
        secrets: [
          {
            environment: realm === "test" ? "production" : "sandbox",
            value: secret,
          },
        ],
      }),
    ).toThrow();
  });
});

it("verifies all eight live catalogue prices and rejects a sandbox binding", async () => {
  const fixture = syntheticCatalogue();
  fixture.binding.environment = "live";
  const capability = { ...fixture.capability, environment: "live" as const };
  const verifier = createPaddleCatalogueVerifier(
    capability,
    fixture.binding,
    fixture.binding.expectedCatalogue,
  );
  expect((await verifier.verify()).receiptCount).toBe(8);
  fixture.binding.environment = "test";
  expect(
    (
      await createPaddleCatalogueVerifier(
        capability,
        fixture.binding,
        fixture.binding.expectedCatalogue,
      ).verify()
    ).receiptCount,
  ).toBe(0);
});

it("isolates browser tokens and hosted URLs by realm", () => {
  const token = "a".repeat(26);
  expect(
    paddleBrowserConfiguration("production", undefined, `live_${token}`).realm,
  ).toBe("live");
  expect(() =>
    paddleBrowserConfiguration("production", `test_${token}`, `test_${token}`),
  ).toThrow();
  expect(() =>
    paddleBrowserConfiguration("invalid", `test_${token}`, undefined),
  ).toThrow();
  expect(
    acceptsPaddleCheckoutUrl(
      "https://pay.paddle.io/hsc_example?transaction_id=txn_synthetic",
      "https://repsync.example",
      "live",
    ),
  ).toBe(true);
  expect(
    acceptsPaddleCheckoutUrl(
      "https://sandbox-pay.paddle.io/hsc_example?transaction_id=txn_synthetic",
      "https://repsync.example",
      "live",
    ),
  ).toBe(false);
});

function portal() {
  const env = config("live", "PORTAL_API_KEY");
  const customerId = `ctm_${"a".repeat(26)}`,
    subscriptionId = `sub_${"b".repeat(26)}`;
  const portalUrl =
    "https://customer-portal.paddle.com/cpl_synthetic?token=private-session";
  const rpc = vi.fn(async () => ({
    environment: "live",
    customerId,
    subscriptionId,
  }));
  const http = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          data: {
            customer_id: customerId,
            urls: { general: { overview: portalUrl } },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
  );
  const authenticate = vi.fn(
    async (_token: string): Promise<{ id: string } | null> => ({
      id: "verified-owner",
    }),
  );
  const run = (body: unknown = {}, token = "user-session") =>
    handlePaddleCustomerPortal(
      new Request("https://local.test/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      () => ({ authenticate, serviceRpc: rpc, env: env.read, fetch: http }),
    );
  return {
    run,
    rpc,
    http,
    authenticate,
    customerId,
    subscriptionId,
    portalUrl,
  };
}
it("creates an ephemeral portal session only for the authenticated owner's subscription", async () => {
  const p = portal();
  const response = await p.run();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    portalUrl: p.portalUrl,
    environment: "live",
  });
  expect(p.rpc).toHaveBeenCalledWith("paddle_customer_portal_context_v1", {
    p_owner: "verified-owner",
  });
  expect(JSON.parse(String(p.http.mock.calls[0]![1]?.body))).toEqual({
    subscription_ids: [p.subscriptionId],
  });
});
it("rejects client-supplied portal identity, anonymous users, and cross-realm records before contacting Paddle", async () => {
  const p = portal();
  expect((await p.run({ customerId: "other-customer" })).status).toBe(400);
  p.authenticate.mockResolvedValueOnce(null);
  expect((await p.run()).status).toBe(401);
  p.rpc.mockResolvedValueOnce({
    environment: "test",
    customerId: p.customerId,
    subscriptionId: p.subscriptionId,
  });
  expect((await p.run()).status).toBe(403);
  expect(p.http).not.toHaveBeenCalled();
});
it.each([
  "https://customer-portal.paddle.com.evil.test/cpl_x",
  "https://evil.test/cpl_x",
  "https://sandbox-customer-portal.paddle.com/cpl_x",
  "https://user@customer-portal.paddle.com/cpl_x",
  "javascript:alert(1)",
])("rejects unsafe portal destination %s", (url) => {
  expect(acceptsPaddlePortalUrl(url, "live")).toBe(false);
});
