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
import { portalLinkRequestSchema } from "../../src/features/billing/portal-contracts";
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
      customerPortal: url(),
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
      expect(Object.keys(data).sort()).toEqual([
        "expiresAt",
        "portalUrl",
        "purpose",
      ]);
      expect(data.purpose).toBe(purpose);
      expect(typeof data.portalUrl).toBe("string");
      await handleCustomerPortalLink(request({ purpose }), deps);
      expect(provider.retrieveSubscriptionForPortal).toHaveBeenCalledTimes(2);
      expect(serviceRpc).toHaveBeenCalledWith(
        "get_billing_portal_subscription",
        { p_owner: owner, p_environment: "test" },
      );
      expect(deps.log).not.toHaveBeenCalled();
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
    provider.retrieveSubscriptionForPortal.mockRejectedValue(new Error(url()));
    expect(
      await (await handleCustomerPortalLink(request(), deps)).json(),
    ).toEqual({ code: "BILLING_PORTAL_RETRIEVAL_FAILED" });
    expect(
      JSON.stringify(vi.mocked(deps.log).mock.calls).includes("signature"),
    ).toBe(false);
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
  it.each([
    "protocol",
    "host",
    "credentials",
    "expired",
    "signature",
    "duplicate",
    "path",
    "fragment",
    "port",
    "redirect",
    "encoded-path",
    "empty",
    "missing",
  ])("rejects %s without exposing URL", (kind) => {
    let value: unknown = url();
    const u = new URL(url());
    if (kind === "protocol") u.protocol = "http:";
    if (kind === "host") u.hostname = "fake.lemonsqueezy.com.evil.test";
    if (kind === "credentials") u.username = "private";
    if (kind === "expired") u.searchParams.set("expires", "1");
    if (kind === "signature") u.searchParams.set("signature", "bad");
    if (kind === "duplicate")
      u.searchParams.append("signature", "b".repeat(64));
    if (kind === "path") u.pathname = "/billing/3/update";
    if (kind === "fragment") u.hash = "secret";
    if (kind === "port") u.port = "8443";
    if (kind === "redirect")
      u.searchParams.set("redirect", "https://evil.test");
    if (kind === "encoded-path") u.pathname = "/%62illing";
    value = kind === "empty" ? "" : kind === "missing" ? null : u.toString();
    let code = "";
    try {
      validatePortalUrl(
        value,
        "manage_billing",
        ["fake.lemonsqueezy.com"],
        "3",
      );
    } catch (error) {
      code = (error as BillingError).code;
    }
    expect(code.startsWith("BILLING_PORTAL_")).toBe(true);
  });
  it("accepts exact provider/custom host and optional valid expiry", () => {
    for (const host of ["fake.lemonsqueezy.com", "billing.example.test"]) {
      const result = validatePortalUrl(
        url("/billing", host),
        "manage_billing",
        portalHosts(host),
        "3",
      );
      expect(result.expiresAt).toBeDefined();
      const noExpiry = new URL(url("/billing", host));
      noExpiry.searchParams.delete("expires");
      expect(
        validatePortalUrl(noExpiry.toString(), "manage_billing", [host], "3")
          .expiresAt,
      ).toBeUndefined();
    }
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
  it("scrubs messages, exception strings, breadcrumbs, console and structured logs", () => {
    const signed = url(
      "/subscription/3/payment-details",
      "billing.example.test",
    );
    const value = {
      message: `Failure ${signed}`,
      exception: { values: [{ value: signed }] },
      breadcrumbs: [{ category: "console", message: signed }],
      attributes: { url: signed, signature: "a".repeat(64) },
    };
    const clean = JSON.stringify(redactHostedPaymentUrls(value));
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
  });
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
