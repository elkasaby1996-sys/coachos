import { describe, expect, it, vi } from "vitest";
import { opaqueProviderReference } from "../../supabase/functions/_shared/billing-provider";
import { selectBillingBrowserProvider } from "../../src/features/billing/providers/active-provider";
import { hostedCheckoutUrlSchema } from "../../src/features/billing/contracts";
import { legalSiteConfig } from "../../src/lib/legal-site";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabase: { functions: { invoke } },
}));
describe("shared provider boundaries after retirement", () => {
  it.each([
    "sub_001:AbC",
    "000001",
    "900719925474099300001",
    "customer/ref?opaque=Yes",
    " REF ",
  ])("preserves opaque reference %s exactly", (reference) =>
    expect(opaqueProviderReference(reference)).toBe(reference),
  );
  it.each([0, 123, null, undefined, "", "  ", {}])(
    "rejects empty or non-string reference %#",
    (reference) =>
      expect(() => opaqueProviderReference(reference)).toThrow(
        "BILLING_PROVIDER_REFERENCE_INVALID",
      ),
  );
  it.each(["lemonsqueezy", "lemon_squeezy", "unknown", undefined])(
    "does not select retired or unknown browser provider %s",
    (provider) => expect(selectBillingBrowserProvider(provider)).toBeNull(),
  );
  it.each([
    "https://demo.lemonsqueezy.com/checkout/x",
    "https://another-provider.test/checkout/x",
  ])("rejects untrusted checkout destination %s", (url) =>
    expect(hostedCheckoutUrlSchema.safeParse(url).success).toBe(false),
  );
  it("rejects retired-provider browser checkout without an endpoint call", async () => {
    invoke.mockReset();
    vi.stubEnv("VITE_BILLING_PROVIDER", "lemon_squeezy");
    vi.resetModules();
    try {
      const { createBillingCheckout } =
        await import("../../src/features/billing/checkout-api");
      await expect(
        createBillingCheckout({
          planKey: "growth",
          cadence: "annual",
          operationId: crypto.randomUUID(),
        } as never),
      ).rejects.toMatchObject({ code: "BILLING_PROVIDER_NOT_CONFIGURED" });
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("rejects an untrusted Paddle checkout destination returned by the server", async () => {
    invoke.mockReset();
    vi.stubEnv("VITE_BILLING_PROVIDER", "paddle");
    vi.resetModules();
    invoke.mockResolvedValue({
      data: { status: "ready", checkoutUrl: "https://evil.test/checkout/x" },
      error: null,
    });
    try {
      const { createBillingCheckout } =
        await import("../../src/features/billing/checkout-api");
      await expect(
        createBillingCheckout({
          planKey: "growth",
          cadence: "monthly",
          additionalCoachSeats: 0,
          legal: {
            termsAccepted: true,
            refundAcknowledged: true,
            termsVersion: legalSiteConfig.version,
            refundVersion: legalSiteConfig.version,
          },
        }),
      ).rejects.toMatchObject({ code: "PADDLE_CHECKOUT_RECOVERY_REQUIRED" });
      expect(invoke).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
