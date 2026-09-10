import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkoutRequestSchema,
  hostedCheckoutUrlSchema,
} from "../../src/features/billing/contracts";
import {
  checkoutReturnAttempt,
  checkoutReturnState,
} from "../../src/features/billing/checkout-return-state";
import { safeBillingError } from "../../src/features/billing/checkout-errors";
import { redactHostedPaymentUrls } from "../../src/lib/redact-hosted-payment-urls";
const id = "a0500000-0000-4000-8000-000000000001";
describe("billing browser boundaries", () => {
  it("redacts hosted payment capabilities from telemetry", () => {
    const value = {
      data: {
        to: "https://fake.lemonsqueezy.com/checkout/custom/id?signature=SECRET",
      },
    };
    expect(JSON.stringify(redactHostedPaymentUrls(value))).not.toMatch(
      /SECRET|lemonsqueezy/,
    );
    expect(value.data.to).toContain("SECRET");
  });
  it.each([
    "storeId",
    "productId",
    "variantId",
    "priceId",
    "amount",
    "currency",
    "billingAccountId",
    "providerCustomerId",
    "redirectUrl",
    "customPrice",
    "trial",
    "discountCode",
  ])("rejects browser %s", (key) => {
    expect(
      checkoutRequestSchema.safeParse({
        planKey: "launch",
        cadence: "monthly",
        operationId: id,
        [key]: "forged",
      }).success,
    ).toBe(false);
  });
  it.each([
    "http://fake.lemonsqueezy.com/checkout/x",
    "https://lemonsqueezy.com.evil.test/checkout/x",
    "https://user@fake.lemonsqueezy.com/checkout/x",
    "https://evil.test",
    "javascript:alert(1)",
  ])("rejects unsafe URL %s", (url) =>
    expect(hostedCheckoutUrlSchema.safeParse(url).success).toBe(false),
  );
  it("query string alone never establishes payment", () => {
    const attempt = checkoutReturnAttempt(
      new URLSearchParams(`checkout=return&attempt=${id}`),
    );
    expect(attempt).toBe(id);
    expect(checkoutReturnState(attempt, undefined, undefined)).toBe(
      "finalizing",
    );
    expect(
      checkoutReturnState(
        attempt,
        {
          checkoutAttemptId: id,
          status: "completed",
          expiresAt: null,
          errorCode: null,
        },
        { kind: "trial", effectiveStatus: "trialing" },
      ),
    ).toBe("finalizing");
    expect(
      checkoutReturnState(
        attempt,
        {
          checkoutAttemptId: id,
          status: "completed",
          expiresAt: null,
          errorCode: null,
        },
        { kind: "paid", effectiveStatus: "active" },
      ),
    ).toBe("confirmed");
  });
  it("sanitizes unknown codes and provider errors", () =>
    expect(
      safeBillingError({ code: "PRIVATE", message: "secret" }).message,
    ).not.toContain("secret"));
  it.each([
    "src/lib/auth.tsx",
    "src/lib/auth-callback.ts",
    "src/components/common/theme-provider.tsx",
    "src/components/common/bootstrap-gate.tsx",
    "src/main.tsx",
    "src/routes/app.tsx",
  ])("isolates billing from %s", (path) =>
    expect(readFileSync(path, "utf8")).not.toMatch(
      /features\/billing|billing-create-lemon|billing_provider/,
    ),
  );
  it("has no public provider secret", () => {
    const runtime = readFileSync(
      "supabase/functions/_shared/billing-runtime.ts",
      "utf8",
    );
    expect(runtime).not.toMatch(
      /(?:VITE_|PUBLIC_|NEXT_PUBLIC_)(?:LEMON|BILLING)/,
    );
    expect(readFileSync(".gitignore", "utf8")).toContain("supabase/.env.local");
  });
});
