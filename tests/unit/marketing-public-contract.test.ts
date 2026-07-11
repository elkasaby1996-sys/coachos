import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getActiveMarketingFeatures,
  getComparisonPageData,
  getMarketingCtaDestination,
  marketingFeatureAvailability,
  marketingRouteMetadata,
  marketingSignupMode,
  productPreviewGroups,
} from "../../src/lib/marketing-public";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

describe("marketing public configuration", () => {
  it("centralizes signup-mode CTA destinations", () => {
    expect(marketingSignupMode).toBe("request_access");
    expect(getMarketingCtaDestination("primary")).toBe("/request-access");
    expect(getMarketingCtaDestination("switch")).toBe("/switch");
    expect(getMarketingCtaDestination("product")).toBe("/product");
  });

  it("hides not-available features from marketed capability lists", () => {
    const active = getActiveMarketingFeatures();

    expect(active.map((feature) => feature.label)).toContain("Programs");
    expect(active.map((feature) => feature.label)).toContain("Team roles and permissions");
    expect(active.map((feature) => feature.label)).not.toContain("Native mobile apps");
    expect(active.map((feature) => feature.label)).not.toContain("Automated billing");
    expect(marketingFeatureAvailability.nativeMobileApps.status).toBe("not_available");
    expect(marketingFeatureAvailability.automatedMigration.status).toBe("not_available");
    expect(marketingFeatureAvailability.messageAttachments.status).toBe("not_available");
  });

  it("keeps lifecycle and attention examples separate", () => {
    const retainGroup = productPreviewGroups.find((group) => group.key === "retain");

    expect(retainGroup?.facts).toContain("Lifecycle: Active");
    expect(retainGroup?.facts).toContain("Attention: At risk");
    expect(retainGroup?.facts).toContain("Reason: Missed latest check-in");
    expect(retainGroup?.timeline.map((item) => item.label)).toContain("Lifecycle: Onboarding");
    expect(retainGroup?.timeline.map((item) => item.detail)).toContain(
      "Attention: Clear. Next step: Complete intake",
    );
    expect(retainGroup?.facts.join(" ")).not.toMatch(/Lifecycle: At risk/i);
    expect(retainGroup?.facts.join(" ")).not.toMatch(/Lifecycle: Inactive/i);
  });

  it("stores comparison content with last-reviewed dates and disclaimers", () => {
    expect(getComparisonPageData("truecoach").lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getComparisonPageData("fitr").trademarkDisclaimer).toMatch(/trademarks/i);
    expect(getComparisonPageData("truecoach").rows.length).toBeGreaterThanOrEqual(4);
  });

  it("covers required public route metadata", () => {
    const requiredRoutes = [
      "/",
      "/product",
      "/for-coaches",
      "/for-clients",
      "/switch",
      "/compare/truecoach",
      "/compare/fitr",
      "/faq",
      "/security",
      "/request-access",
      "/privacy",
      "/terms",
      "/cookies",
    ];

    for (const route of requiredRoutes) {
      expect(marketingRouteMetadata[route]?.title).toBeTruthy();
      expect(marketingRouteMetadata[route]?.description).toBeTruthy();
      expect(marketingRouteMetadata[route]?.canonicalPath).toBe(route);
    }
  });

  it("covers required public routes in the static sitemap", () => {
    const sitemap = readSource("public", "sitemap.xml");
    [
      "/",
      "/product",
      "/for-coaches",
      "/for-clients",
      "/switch",
      "/compare/truecoach",
      "/compare/fitr",
      "/faq",
      "/security",
      "/request-access",
      "/privacy",
      "/terms",
      "/cookies",
    ].forEach((route) => {
      const expected = route === "/" ? "https://www.repsync.com/" : `https://www.repsync.com${route}`;
      expect(sitemap).toContain(expected);
    });
  });
});

describe("marketing public page source contract", () => {
  const marketingSource = readSource("src", "pages", "public", "marketing-content.tsx");

  it("renders the complete request-access and switch form fields", () => {
    [
      "First name",
      "Last name",
      "Email",
      "Business name",
      "Coaching model",
      "Active clients",
      "Current platform",
      "Primary reason",
      "Switching timeline",
      "Team size",
      "Data to move",
      "Migration concerns",
    ].forEach((label) => expect(marketingSource).toContain(label));
  });

  it("uses the requested CTA labels consistently", () => {
    expect(marketingSource).toContain("Request early access");
    expect(marketingSource).toContain("See the product");
    expect(marketingSource).toContain("Plan your switch");
    expect(marketingSource).not.toContain("Request switch help");
    expect(marketingSource).not.toContain("See product");
  });

  it("uses seeded product preview data instead of blank screenshot frames", () => {
    const marketingConfigSource = readSource("src", "lib", "marketing-public.ts");

    expect(marketingSource).toContain("rs-preview-metrics");
    expect(marketingSource).toContain("rs-preview-timeline");
    expect(marketingConfigSource).toContain(
      "Seeded clients, delivery queue, and check-in workload",
    );
    expect(marketingSource).not.toContain("feature-coach-dashboard.png");
  });

  it("guards duplicate lead submissions in the client form", () => {
    expect(marketingSource).toContain('if (status !== "idle") return;');
    expect(marketingSource).toContain('aria-live="polite"');
  });
});
