import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  handleCustomerPortalLink,
  validatePortalUrl,
  portalHosts,
  portalPurpose,
} from "../../supabase/functions/_shared/billing-portal";
import {
  BillingError,
  createLemonSqueezyProvider,
  parsePortalSubscription,
} from "../../supabase/functions/_shared/lemon-squeezy";
import type { BillingDependencies } from "../../supabase/functions/_shared/billing-handlers";
import {
  customerPortalLinkResponseSchema,
  portalLinkRequestSchema,
} from "../../src/features/billing/portal-contracts";
import { safePortalError } from "../../src/features/billing/portal-errors";
import { redactHostedPaymentUrls } from "../../src/lib/redact-hosted-payment-urls";
import {
  cleanPortalReturn,
  portalReturnState,
  PORTAL_POLL_DURATION_MS,
  PORTAL_POLL_MS,
} from "../../src/features/billing/portal-return-state";

const owner = "a0600000-0000-4000-8000-000000000001";
const expiry = Math.floor(Date.now() / 1000) + 3600;
const url = (path = "/billing", host = "fake.lemonsqueezy.com") =>
  `https://${host}${path}?expires=${expiry}&signature=${"a".repeat(64)}`;
const providerUser = "60000";
const urlWithUser = () => `${url()}&user=${providerUser}`;
const link = {
  provider: "lemonsqueezy" as const,
  environment: "test" as const,
  store_id: "1",
  customer_id: "2",
  subscription_id: "3",
  local_subscription_id: owner,
  local_status: "past_due",
};
function fixture() {
  const provider = {
    retrieveSubscriptionForPortal: vi.fn(async () => ({
      ...link,
      status: "past_due",
      customerPortal: urlWithUser(),
      updatePaymentMethod: url("/subscription/3/payment-details"),
    })),
    createCheckout: vi.fn(),
    retrieveSubscription: vi.fn(),
  };
  const serviceRpc = vi.fn(async () => ({ ...link }));
  const deps: BillingDependencies = {
    authenticate: vi.fn(async () => ({ id: owner })),
    ownerRpc: () => vi.fn(),
    serviceRpc,
    log: vi.fn(),
    config: () => ({
      provider,
      environment: "test",
      appBaseUrl: "https://app.test",
      webhookSecret: "fake",
      portalAllowedHosts: "fake.lemonsqueezy.com,billing.example.test",
    }),
  };
  return { deps, provider, serviceRpc };
}
function request(body: unknown = { purpose: "manage_billing" }) {
  return new Request("https://local.test/portal", {
    method: "POST",
    headers: { authorization: "Bearer fake" },
    body: JSON.stringify(body),
  });
}
describe("customer portal server boundary", () => {
  it.each(["manage_billing", "update_payment_method"])(
    "owner retrieves fresh %s with no-store",
    async (purpose) => {
      const { deps, provider, serviceRpc } = fixture();
      const res = await handleCustomerPortalLink(request({ purpose }), deps);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store, private");
      expect(res.headers.get("pragma")).toBe("no-cache");
      const data = await res.json();
      expect(Object.keys(data).sort()).toEqual(["portalUrl", "purpose"]);
      expect(data.purpose).toBe(purpose);
      expect(typeof data.portalUrl).toBe("string");
      await handleCustomerPortalLink(request({ purpose }), deps);
      expect(provider.retrieveSubscriptionForPortal).toHaveBeenCalledTimes(2);
      expect(serviceRpc).toHaveBeenCalledWith(
        "get_billing_portal_subscription",
        { p_owner: owner, p_environment: "test" },
      );
      expect(deps.log).not.toHaveBeenCalled();
      expect(serviceRpc.mock.calls).toEqual(
        Array.from({ length: 4 }, () => [
          "get_billing_portal_subscription",
          { p_owner: owner, p_environment: "test" },
        ]),
      );
    },
  );
  it.each(["non-owner", "client", "anonymous", "no-history"])(
    "denies %s before provider retrieval",
    async (role) => {
      const { deps, provider, serviceRpc } = fixture();
      if (role === "anonymous") deps.authenticate = async () => null;
      else
        serviceRpc.mockRejectedValue(
          new BillingError(
            role === "no-history"
              ? "BILLING_PORTAL_SUBSCRIPTION_NOT_FOUND"
              : "BILLING_PORTAL_OWNER_REQUIRED",
            403,
          ),
        );
      const res = await handleCustomerPortalLink(request(), deps);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(provider.retrieveSubscriptionForPortal).not.toHaveBeenCalled();
    },
  );
  it.each([
    "billingAccountId",
    "customerId",
    "subscriptionId",
    "storeId",
    "url",
    "redirectUrl",
    "planKey",
    "variantId",
    "environment",
    "extra",
    "user",
    "host",
    "destination",
  ])("rejects extra %s", async (key) => {
    const input = { purpose: "manage_billing", [key]: "forged" };
    expect(portalLinkRequestSchema.safeParse(input).success).toBe(false);
    expect(() => portalPurpose(input)).toThrow();
    const { deps, provider } = fixture();
    expect((await handleCustomerPortalLink(request(input), deps)).status).toBe(
      400,
    );
    expect(provider.retrieveSubscriptionForPortal).not.toHaveBeenCalled();
  });
  it.each([
    "provider",
    "environment",
    "store_id",
    "customer_id",
    "subscription_id",
  ])("rejects mismatched %s", async (key) => {
    const { deps, provider } = fixture();
    const snapshot = await provider.retrieveSubscriptionForPortal();
    provider.retrieveSubscriptionForPortal.mockResolvedValue({
      ...snapshot,
      [key]: "wrong",
    });
    const res = await handleCustomerPortalLink(request(), deps);
    expect(await res.json()).toEqual({
      code: "BILLING_PORTAL_IDENTITY_MISMATCH",
    });
  });
  it("rechecks current linkage after retrieval", async () => {
    const { deps, serviceRpc } = fixture();
    serviceRpc
      .mockResolvedValueOnce({ ...link })
      .mockResolvedValueOnce({ ...link, local_subscription_id: "changed" });
    expect(
      await (await handleCustomerPortalLink(request(), deps)).json(),
    ).toEqual({ code: "BILLING_PORTAL_IDENTITY_MISMATCH" });
  });
  it("never turns repeated provider fields into ownership or routing inputs", async () => {
    const { deps, provider, serviceRpc } = fixture();
    const value = `${urlWithUser()}&user=another&subscription_id=999&environment=live&redirect=https%3A%2F%2Fother.example.test`;
    provider.retrieveSubscriptionForPortal.mockResolvedValue({
      ...link,
      status: "past_due",
      customerPortal: value,
      updatePaymentMethod: url("/subscription/3/payment-details"),
    });
    const response = await handleCustomerPortalLink(request(), deps);
    expect(await response.json()).toEqual({
      purpose: "manage_billing",
      portalUrl: value,
    });
    expect(serviceRpc.mock.calls).toEqual(
      Array.from({ length: 2 }, () => [
        "get_billing_portal_subscription",
        { p_owner: owner, p_environment: "test" },
      ]),
    );
    expect(provider.retrieveSubscriptionForPortal).toHaveBeenCalledWith("3");
    expect(deps.log).not.toHaveBeenCalled();
  });
  it("rejects a failed post-retrieval owner recheck without returning capability data", async () => {
    const { deps, serviceRpc } = fixture();
    serviceRpc
      .mockResolvedValueOnce({ ...link })
      .mockRejectedValueOnce(
        new BillingError("BILLING_PORTAL_OWNER_REQUIRED", 403),
      );
    const response = await handleCustomerPortalLink(request(), deps);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: "BILLING_PORTAL_OWNER_REQUIRED",
    });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(vi.mocked(deps.log).mock.calls).toEqual([
      [{ code: "BILLING_PORTAL_OWNER_REQUIRED", processingStatus: "failed" }],
    ]);
  });
  it("does not claim payment recovery for expired history", async () => {
    const { deps, serviceRpc } = fixture();
    serviceRpc.mockResolvedValue({ ...link, local_status: "expired" });
    expect(
      await (
        await handleCustomerPortalLink(
          request({ purpose: "update_payment_method" }),
          deps,
        )
      ).json(),
    ).toEqual({ code: "BILLING_PORTAL_NOT_AVAILABLE" });
  });
  it("maps unavailable provider and configuration safely", async () => {
    const { deps, provider } = fixture();
    provider.retrieveSubscriptionForPortal.mockRejectedValue(
      new Error(urlWithUser()),
    );
    expect(
      await (await handleCustomerPortalLink(request(), deps)).json(),
    ).toEqual({ code: "BILLING_PORTAL_RETRIEVAL_FAILED" });
    expect(
      JSON.stringify(vi.mocked(deps.log).mock.calls).includes("signature"),
    ).toBe(false);
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toContain(
      providerUser,
    );
    deps.config = () => null;
    expect(
      await (await handleCustomerPortalLink(request(), deps)).json(),
    ).toEqual({ code: "BILLING_PORTAL_PROVIDER_NOT_CONFIGURED" });
  });
  it.each([429, 503, "timeout"])(
    "sanitizes provider %s through the real adapter",
    async (failure) => {
      const { deps } = fixture();
      const config = deps.config()!;
      config.provider = createLemonSqueezyProvider(
        "fake",
        vi.fn(async () => {
          if (failure === "timeout") throw new Error(url());
          return new Response("private data", { status: failure });
        }),
      );
      deps.config = () => config;
      expect(
        await (await handleCustomerPortalLink(request(), deps)).json(),
      ).toEqual({ code: "BILLING_PORTAL_RETRIEVAL_FAILED" });
    },
  );
});
describe("signed URL validation and telemetry", () => {
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
          expect(customerPortalLinkResponseSchema.parse(result)).toEqual(
            result,
          );
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
        JSON.stringify(safePortalError({ message: signed })).includes(
          "signature",
        ),
      ).toBe(false);
      expect(readFileSync("src/lib/sentry.ts", "utf8")).toContain(
        "beforeSendLog: (log) => redactHostedPaymentUrls(log)",
      );
    },
  );
});
describe("portal return and isolation", () => {
  const current = {
    linked: true,
    status: "active" as const,
    cancelAtPeriodEnd: false,
    currentPeriodEndsAt: null,
    reconciliationStatus: "processed" as const,
    errorCode: null,
    revision: "one",
    pending: false,
  };
  it("query hint never means success and cleanup preserves unrelated params", () => {
    expect(portalReturnState(undefined, current, true)).toBe("checking");
    expect(portalReturnState(current, current, false)).toBe(
      "no_detected_change",
    );
    expect(
      cleanPortalReturn(
        new URLSearchParams("portal=return&tab=billing"),
      ).toString(),
    ).toBe("tab=billing");
  });
  it("uses canonical transitions and bounded polling", () => {
    expect(
      portalReturnState({ ...current, cancelAtPeriodEnd: true }, current, true),
    ).toBe("resumed");
    expect(
      portalReturnState(current, { ...current, pending: true }, false),
    ).toBe("reconciliation_pending");
    expect(PORTAL_POLL_DURATION_MS / PORTAL_POLL_MS).toBe(15);
  });
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
  it("mutation cache and storage never receive the returned URL", () => {
    const source = readFileSync(
      "src/features/billing/use-customer-portal.ts",
      "utf8",
    );
    expect(source).not.toMatch(
      /return result|localStorage|sessionStorage|setQueryData/,
    );
    expect(source).toContain("gcTime: 0");
  });
});
