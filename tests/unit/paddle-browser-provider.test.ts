import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptsPaddleCheckoutUrl,
  paddleBrowserProvider,
} from "../../src/features/billing/providers/paddle";
import { selectBillingBrowserProvider } from "../../src/features/billing/providers/active-provider";
import { lemonSqueezyBrowserProvider } from "../../src/features/billing/providers/lemon-squeezy";
import { paddleCheckoutRequestSchema } from "../../src/features/billing/contracts";
import { legalSiteConfig } from "../../src/lib/legal-site";
import { redactHostedPaymentUrls } from "../../src/lib/redact-hosted-payment-urls";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/supabase", () => ({
  supabase: { functions: { invoke } },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  invoke.mockReset();
});
const body = () => ({
  planKey: "launch",
  cadence: "monthly",
  additionalCoachSeats: 0,
  legal: {
    termsAccepted: true,
    refundAcknowledged: true,
    termsVersion: legalSiteConfig.version,
    refundVersion: legalSiteConfig.version,
  },
});
describe("Paddle browser boundary", () => {
  it.each([undefined, "", "unknown", "PADDLE", "lemon_squeezy"])(
    "preserves LS default for %s",
    (value) => {
      expect(selectBillingBrowserProvider(value)).toBe(
        lemonSqueezyBrowserProvider,
      );
    },
  );
  it("explicitly selects Paddle", () =>
    expect(selectBillingBrowserProvider("paddle")).toBe(paddleBrowserProvider));
  it.each([
    "https://sandbox-pay.paddle.io/checkout/synthetic-launch?transaction_id=synthetic%2Ftransaction",
    "https://sandbox.pay.paddle.io/checkout/synthetic-launch?transaction_id=synthetic%2Ftransaction",
    "https://sandbox-pay.paddle.io/hsc_synthetic_checkout?transaction_id=synthetic_transaction",
    "https://merchant.example.test/pay?_ptxn=synthetic%2Ftransaction",
  ])("accepts reviewed destination shape %s and redacts telemetry", (url) => {
    expect(acceptsPaddleCheckoutUrl(url, "https://merchant.example.test")).toBe(
      true,
    );
    expect(redactHostedPaymentUrls({ url })).toEqual({
      url: "[redacted payment URL]",
    });
  });
  it.each([
    "https://sandbox.pay.paddle.io/hsc_synthetic?transaction_id=synthetic_transaction",
    "https://sandbox-pay.paddle.io/pay/hsc_synthetic?transaction_id=synthetic_transaction",
    "https://sandbox-pay.paddle.io/hsc_synthetic",
    "https://sandbox-pay.paddle.io/hsc_synthetic?transaction_id=",
    "https://sandbox-pay.paddle.io/hsc_synthetic?transaction_id=x&price_id=synthetic",
    "https://sandbox-pay.paddle.io/hsc_synthetic?transaction_id=x&transaction_id=y",
    "https://sandbox-pay.paddle.io/hsc_synthetic?transaction_id=x#fragment",
    "https://custom.paddle.io/hsc_synthetic?transaction_id=x",
    "https://pay.paddle.io/hsc_synthetic?transaction_id=x",
    "https://sandbox-pay.paddle.io/hsc_" +
      "x".repeat(513) +
      "?transaction_id=x",
    "https://pay.paddle.io/checkout/x?transaction_id=x",
    "https://sandbox-pay.paddle.io.evil.test/checkout/x?transaction_id=x",
    "https://evil.test/pay?_ptxn=x",
    "https://user@sandbox-pay.paddle.io/checkout/x?transaction_id=x",
    "https://sandbox-pay.paddle.io:8443/checkout/x?transaction_id=x",
    "http://sandbox-pay.paddle.io/checkout/x?transaction_id=x",
    "https://sandbox-pay.paddle.io/wrong?transaction_id=x",
    "https://sandbox-pay.paddle.io/checkout/x?transaction_id=x&transaction_id=y",
    "https://sandbox-pay.paddle.io/checkout/x?transaction_id=x&redirect=https://evil.test",
    "https://sandbox-pay.paddle.io/checkout/x?transaction_id=x#secret",
    "https://merchant.example.test/pay?_ptxn=",
    "https://merchant.example.test/pay?_ptxn=x&extra=x",
    "javascript:alert(1)",
  ])("rejects unsafe destination %s", (url) =>
    expect(acceptsPaddleCheckoutUrl(url, "https://merchant.example.test")).toBe(
      false,
    ),
  );
  it.each([
    "userId",
    "operationId",
    "priceId",
    "productId",
    "transactionId",
    "billingAccountId",
    "environment",
    "checkoutUrl",
    "provider",
  ])("forbids %s before invocation", (field) => {
    expect(
      paddleCheckoutRequestSchema.safeParse({ ...body(), [field]: "injected" })
        .success,
    ).toBe(false);
  });
  it("invokes only the Paddle function and accepts the minimal response", async () => {
    vi.stubEnv("VITE_BILLING_PROVIDER", "paddle");
    vi.resetModules();
    const api = await import("../../src/features/billing/checkout-api");
    const result = {
      status: "ready",
      checkoutUrl:
        "https://sandbox-pay.paddle.io/checkout/synthetic-launch?transaction_id=synthetic%2Ftransaction",
    };
    invoke.mockResolvedValue({ data: result, error: null });
    expect(await api.createBillingCheckout(body() as never)).toEqual(result);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      "billing-create-paddle-checkout",
      { body: body() },
    );
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(
      /apikey|priceId|operationId|transactionId|billingAccountId/,
    );
  });
  it.each(["unsafe-url", "network", "ambiguous"])(
    "blocks blind retry after %s",
    async (failure) => {
      vi.stubEnv("VITE_BILLING_PROVIDER", "paddle");
      vi.resetModules();
      const api = await import("../../src/features/billing/checkout-api");
      if (failure === "network")
        invoke.mockRejectedValue(Error("private network message"));
      else if (failure === "ambiguous")
        invoke.mockResolvedValue({
          error: {
            context: {
              json: async () => ({
                code: "PADDLE_CHECKOUT_AMBIGUOUS",
                retryable: false,
              }),
            },
          },
        });
      else
        invoke.mockResolvedValue({
          data: { status: "ready", checkoutUrl: "https://evil.test" },
        });
      await expect(
        api.createBillingCheckout(body() as never),
      ).rejects.toMatchObject({ blocksNewCheckout: true });
      expect(invoke).toHaveBeenCalledOnce();
    },
  );
});
