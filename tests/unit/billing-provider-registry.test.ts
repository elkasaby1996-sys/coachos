import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBillingProviderRegistry } from "../../supabase/functions/_shared/billing-provider-registry";
import { paddleProviderRegistry } from "../../supabase/functions/_shared/paddle-runtime-provider";
import { handleDisabledLegacyCheckout } from "../../supabase/functions/_shared/billing-disabled-checkout";

describe("active billing provider registry", () => {
  it("registers Paddle as the only new-sales factory", () => {
    const paddle = paddleProviderRegistry.forNewSales();
    expect(paddle).toBe(paddleProviderRegistry.forSubscription("paddle"));
    expect(paddle.createCheckoutTransport).toBeTypeOf("function");
    expect(paddle.createPlanTransport).toBeTypeOf("function");
    expect(paddle.createSeatTransport).toBeTypeOf("function");
    expect(paddle.createWebhookIngress).toBeTypeOf("function");
    for (const name of [
      undefined,
      "",
      "unknown",
      "lemon_squeezy",
      "lemonsqueezy",
    ])
      expect(() => paddleProviderRegistry.forSubscription(name)).toThrowError(
        "BILLING_PROVIDER_NOT_CONFIGURED",
      );
  });

  it("rejects missing active registration and duplicate provider keys", () => {
    expect(() => createBillingProviderRegistry([], "paddle")).toThrowError(
      "BILLING_PROVIDER_NOT_CONFIGURED",
    );
    expect(() =>
      createBillingProviderRegistry(
        [
          { provider: "paddle", factory: 1 },
          { provider: "paddle", factory: 2 },
        ],
        "paddle",
      ),
    ).toThrowError("BILLING_PROVIDER_NOT_CONFIGURED");
  });

  it("closes the historical new-sales endpoint without provider IO", async () => {
    const reply = handleDisabledLegacyCheckout(
      new Request("https://local.test/checkout", { method: "POST" }),
    );
    expect(reply.status).toBe(410);
    expect(await reply.json()).toEqual({
      code: "BILLING_PROVIDER_RETIRED",
      message: "This billing provider has been permanently retired.",
    });
    expect(
      readFileSync(
        "supabase/functions/billing-create-lemon-squeezy-checkout/index.ts",
        "utf8",
      ),
    ).toContain("Deno.serve(handleDisabledLegacyCheckout)");
  });

  it("keeps fundamental core primitives in the neutral module", () => {
    for (const path of [
      "supabase/functions/_shared/billing-runtime-dependencies.ts",
      "supabase/functions/_shared/paddle-checkout-handler.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/from "\.\/billing-common\.ts"/);
      expect(source).not.toMatch(
        /import \{[^}]*\b(?:BillingError|boundedBody|object)\b[^}]*\} from "\.\/lemon-squeezy\.ts"/s,
      );
    }
  });
});
