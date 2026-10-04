import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { safePaymentMethodError } from "../../src/features/billing/payment-method-errors";
import { redactHostedPaymentUrls } from "../../src/lib/redact-hosted-payment-urls";
const expiry = Math.floor(Date.now() / 1000) + 3600;
const url = (path = "/billing", host = "fake.lemonsqueezy.com") =>
  `https://${host}${path}?expires=${expiry}&signature=${"a".repeat(64)}`;
const providerUser = "60000";
const urlWithUser = () => `${url()}&user=${providerUser}`;
describe("retained historical capability redaction", () => {
  it.each([
    "/billing",
    "/billing/",
    "/subscription/3/payment-details",
    "/subscription/3/payment-details/",
  ])("redacts opaque or absent query on custom-domain path %s", (path) => {
    for (const query of [
      "",
      "?token=opaque-private-value&future=value&future=second",
    ]) {
      const capability = `https://billing.example.test${path}${query}`;
      const clean = redactHostedPaymentUrls({
        message: capability,
        breadcrumbs: [{ message: capability }],
        attributes: { portalUrl: capability },
        exception: { values: [{ value: capability }] },
      });
      expect(JSON.stringify(clean)).not.toMatch(
        /billing\.example|opaque-private-value|future=/,
      );
      expect(JSON.stringify(clean)).toContain("[redacted payment URL]");
    }
  });
  it.each(["manage_billing", "update_payment_method"])(
    "scrubs %s messages, exception strings, breadcrumbs, console and structured logs",
    (purpose) => {
      const signed =
        purpose === "manage_billing"
          ? urlWithUser().replace(
              "fake.lemonsqueezy.com",
              "billing.example.test",
            )
          : url("/subscription/3/payment-details", "billing.example.test");
      const value = {
        message: `Failure ${signed}`,
        exception: { values: [{ value: signed }] },
        breadcrumbs: [{ category: "console", message: signed }],
        attributes: { url: signed, signature: "a".repeat(64) },
      };
      const clean = JSON.stringify(redactHostedPaymentUrls(value));
      expect(clean).not.toContain(providerUser);
      expect(/signature.*a{64}|billing\.example|expires=/.test(clean)).toBe(
        false,
      );
      expect(
        JSON.stringify(safePaymentMethodError({ message: signed })).includes(
          "signature",
        ),
      ).toBe(false);
      expect(readFileSync("src/lib/sentry.ts", "utf8")).toContain(
        "beforeSendLog: (log) => redactHostedPaymentUrls(log)",
      );
    },
  );
});
describe("billing browser isolation", () => {
  it.each([
    "src/lib/auth.tsx",
    "src/lib/auth-callback.ts",
    "src/components/common/theme-provider.tsx",
    "src/components/common/bootstrap-gate.tsx",
    "src/main.tsx",
    "src/routes/app.tsx",
  ])("portal isolation from %s", (path) => {
    expect(
      /features\/billing|billing_provider|customer-portal/.test(
        readFileSync(path, "utf8"),
      ),
    ).toBe(false);
  });
  it("mutation cache and storage never receive the continuation", () => {
    const source = readFileSync(
      "src/features/billing/use-payment-method-update.ts",
      "utf8",
    );
    expect(source).not.toMatch(
      /return result|localStorage|sessionStorage|setQueryData/,
    );
    expect(source).toContain("gcTime: 0");
  });
});
