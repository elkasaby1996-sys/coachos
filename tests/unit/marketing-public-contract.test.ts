import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getActiveMarketingFeatures,
  getComparisonPageData,
  getMarketingCtaDestination,
  getPublicTrustClaims,
  getVisibleFaqItems,
  legalReviewRequired,
  legalSiteConfig,
  marketingFeatureAvailability,
  marketingRouteMetadata,
  marketingSignupMode,
  publicFaqGroups,
  productPreviewGroups,
  trustClaims,
  unavailableMarketingCapabilities,
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
    expect(getComparisonPageData("truecoach").features.length).toBeGreaterThanOrEqual(4);
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
    expect(marketingRouteMetadata["/product"].title).toBe(
      "RepSync Product | Coaching Business and Client Management",
    );
    expect(marketingRouteMetadata["/for-coaches"].title).toBe(
      "RepSync for Personal Trainers and Online Coaches",
    );
    expect(marketingRouteMetadata["/for-clients"].title).toBe(
      "RepSync for Coaching Clients",
    );
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

  it("declares robots and sitemap behavior for public launch", () => {
    const robots = readSource("public", "robots.txt");

    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://www.repsync.com/sitemap.xml");
  });

  it("centralizes trust claims and excludes unsupported certifications", () => {
    const publicClaims = getPublicTrustClaims();

    expect(publicClaims.map((claim) => claim.title)).toContain(
      "Supabase authentication",
    );
    expect(publicClaims.map((claim) => claim.title)).toContain(
      "Workspace role access",
    );
    expect(publicClaims.every((claim) => claim.status === "verified")).toBe(true);
    expect(publicClaims.every((claim) => claim.public)).toBe(true);
    expect(
      trustClaims.find((claim) => claim.id === "security_certifications")?.public,
    ).toBe(false);
  });

  it("keeps legal site configuration centralized and review status explicit", () => {
    expect(legalSiteConfig.contactEmail).toBe("support@repsync.com");
    expect(legalSiteConfig.privacyEmail).toBe("privacy@repsync.com");
    expect(legalSiteConfig.securityEmail).toBe("security@repsync.com");
    expect(legalReviewRequired).toBe(true);
  });

  it("groups visible FAQ answers for structured data", () => {
    expect(publicFaqGroups.map((group) => group.category)).toEqual([
      "Product",
      "Coaches and teams",
      "Clients",
      "Switching",
      "Availability",
      "Data and integrations",
      "Security and privacy",
    ]);
    expect(getVisibleFaqItems().length).toBeGreaterThanOrEqual(30);
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
      "Migration needs",
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

  it("keeps product and audience page claims tied to central availability", () => {
    expect(marketingSource).toContain("getMarketingFeaturesByAudience");
    expect(marketingSource).toContain("getMarketingFeaturesByCategory");
    expect(marketingSource).toContain("ProductPreviewById");
    expect(unavailableMarketingCapabilities.map((feature) => feature.label)).toContain(
      "Full automated migration",
    );
  });

  it("wires client join paths to existing public routes", () => {
    expect(marketingSource).toContain('"I have an invitation"');
    expect(marketingSource).toContain('"/login"');
    expect(marketingSource).toContain('"/coaches"');
    expect(marketingSource).toContain('"/signup/client"');
  });

  it("guards duplicate lead submissions in the client form", () => {
    expect(marketingSource).toContain('if (status !== "idle") return;');
    expect(marketingSource).toContain('aria-live="polite"');
  });

  it("gates marketing analytics on optional consent", () => {
    expect(marketingSource).toContain("repsync_analytics_consent");
    expect(marketingSource).toContain('readAnalyticsConsent() !== "accepted"');
    expect(marketingSource).toContain("Accept analytics");
    expect(marketingSource).toContain("Reject optional");
    expect(marketingSource).toContain("Manage cookies");
  });

  it("sets public profile metadata and noindex fallback", () => {
    const profileSource = readSource("src", "pages", "public", "coach-profile.tsx");

    expect(profileSource).toContain("Coach profile unavailable | RepSync");
    expect(profileSource).toContain("noindex,nofollow");
    expect(profileSource).toContain("index,follow");
    expect(profileSource).toContain("canonicalPath: `/p/${profile.slug}`");
  });
});
