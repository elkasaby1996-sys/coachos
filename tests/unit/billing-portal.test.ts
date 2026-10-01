import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  validatePortalUrl,
  portalHosts,
} from "../../supabase/functions/_shared/billing-portal";
import {
  BillingError,
  parsePortalSubscription,
} from "../../supabase/functions/_shared/lemon-squeezy";
import { safePaymentMethodError } from "../../src/features/billing/payment-method-errors";
import { redactHostedPaymentUrls } from "../../src/lib/redact-hosted-payment-urls";

const expiry = Math.floor(Date.now() / 1000) + 3600;
const url = (path = "/billing", host = "fake.lemonsqueezy.com") =>
  `https://${host}${path}?expires=${expiry}&signature=${"a".repeat(64)}`;
const providerUser = "60000";
const urlWithUser = () => `${url()}&user=${providerUser}`;
describe("historical inactive portal URL validation and telemetry", () => {
  const queryShapes = [
    ["expires/signature", `?expires=${expiry}&signature=${"a".repeat(64)}`],
    [
      "expires/user/signature",
      `?expires=${expiry}&user=60000&signature=${"a".repeat(64)}`,
    ],
    [
      "future fields and encoding",
      "?token=opaque%2fValue+Value%20&future[]=one&empty=&flag",
    ],
    ["different order", "?signature=opaque&user=60000&expires=1"],
    [
      "repeated fields",
      "?user=one&user=two&signature=a&signature=b&expires=0&expires=never",
    ],
    [
      "routing-looking fields",
      "?redirect=https%3A%2F%2Fother.example.test&environment=live&subscription=999",
    ],
    ["no query", ""],
    ["empty query", "?"],
  ];
  describe.each([
    ["manage_billing", "/billing"],
    ["update_payment_method", "/subscription/3/payment-details"],
  ] as const)("%s provider capability", (purpose, path) => {
    it.each(queryShapes)(
      "preserves %s exactly, including a single trailing slash",
      (_name, query) => {
        for (const trailing of ["", "/"]) {
          const value = `https://fake.lemonsqueezy.com${path}${trailing}${query}`;
          const result = validatePortalUrl(
            value,
            purpose,
            ["fake.lemonsqueezy.com"],
            "3",
          );
          expect(result).toEqual({ purpose, portalUrl: value });
        }
      },
    );
    it.each(["fake.lemonsqueezy.com", "billing.example.test"])(
      "accepts exact allowed host %s",
      (host) => {
        const value = `https://${host}${path}`;
        expect(
          validatePortalUrl(value, purpose, portalHosts(host), "3").portalUrl,
        ).toBe(value);
      },
    );
    it.each([
      ["HTTP", "http://fake.lemonsqueezy.com"],
      ["username", "https://private@fake.lemonsqueezy.com"],
      ["password", "https://:private@fake.lemonsqueezy.com"],
      ["empty credentials", "https://@fake.lemonsqueezy.com"],
      ["port", "https://fake.lemonsqueezy.com:8443"],
      ["default port", "https://fake.lemonsqueezy.com:443"],
      ["padded default port", "https://fake.lemonsqueezy.com:0443"],
      ["empty port", "https://fake.lemonsqueezy.com:"],
      ["wrong host", "https://evil.test"],
      ["host suffix", "https://fake.lemonsqueezy.com.evil.test"],
      ["unapproved subdomain", "https://child.fake.lemonsqueezy.com"],
    ])("rejects %s", (_name, origin) => {
      expect(() =>
        validatePortalUrl(
          `${origin}${path}?token=opaque`,
          purpose,
          ["fake.lemonsqueezy.com"],
          "3",
        ),
      ).toThrow(BillingError);
    });
    it.each(["#private", "#"])("rejects fragment %s", (fragment) => {
      expect(() =>
        validatePortalUrl(
          `https://fake.lemonsqueezy.com${path}?token=opaque${fragment}`,
          purpose,
          ["fake.lemonsqueezy.com"],
          "3",
        ),
      ).toThrow("BILLING_PORTAL_URL_INVALID");
    });
  });
  it.each([
    ["manage_billing", "/billing/anything"],
    ["manage_billing", "/billing/3/update"],
    ["manage_billing", "/billing//"],
    ["manage_billing", "/%62illing"],
    ["manage_billing", "/billing%2f"],
    ["manage_billing", "/billing/%252e%252e/other"],
    ["manage_billing", "/billing/%2e%2e/other"],
    ["manage_billing", "/unrelated"],
    ["update_payment_method", "/subscription/4/payment-details"],
    ["update_payment_method", "/subscription/4/payment-details/"],
    ["update_payment_method", "/subscription/%33/payment-details"],
    ["update_payment_method", "/subscription/3/payment-details/anything"],
    ["update_payment_method", "/subscription/3/payment-details//"],
    ["update_payment_method", "/billing"],
  ] as const)("rejects %s path %s", (purpose, path) => {
    expect(() =>
      validatePortalUrl(
        `https://fake.lemonsqueezy.com${path}?token=opaque`,
        purpose,
        ["fake.lemonsqueezy.com"],
        "3",
      ),
    ).toThrow("BILLING_PORTAL_URL_INVALID");
  });
  it.each([
    null,
    undefined,
    "",
    123,
    {},
    [],
    "not a URL",
    " https://fake.lemonsqueezy.com/billing",
    "https://fake.lemonsqueezy.com/billing\\other",
    "https://fake.lemonsqueezy.com/billing?token=" + "a".repeat(4096),
  ])(
    "rejects missing, non-string, malformed or oversized input case %#",
    (value) => {
      expect(() =>
        validatePortalUrl(
          value,
          "manage_billing",
          ["fake.lemonsqueezy.com"],
          "3",
        ),
      ).toThrow(BillingError);
    },
  );
  it("accepts the maximum bounded URL length", () => {
    const prefix = "https://fake.lemonsqueezy.com/billing?token=";
    const value = prefix + "a".repeat(4096 - prefix.length);
    expect(
      validatePortalUrl(value, "manage_billing", ["fake.lemonsqueezy.com"], "3")
        .portalUrl,
    ).toBe(value);
    expect(() => portalHosts("*.lemonsqueezy.com")).toThrow();
  });
  it("adapter returns only minimal identity and selected URL fields", () => {
    const result = parsePortalSubscription(
      {
        data: {
          type: "subscriptions",
          id: "3",
          attributes: {
            store_id: 1,
            customer_id: 2,
            test_mode: true,
            status: "active",
            user_email: "private@example.test",
            urls: { customer_portal: url(), update_payment_method: null },
          },
        },
      },
      "3",
    );
    expect(Object.keys(result).sort()).toEqual([
      "customerPortal",
      "customer_id",
      "environment",
      "provider",
      "status",
      "store_id",
      "subscription_id",
      "updatePaymentMethod",
    ]);
  });
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
