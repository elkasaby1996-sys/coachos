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
    expect(marketingSignupMode).toBe("direct_signup");
    expect(getMarketingCtaDestination("primary")).toBe("/start-trial");
    expect(getMarketingCtaDestination("switch")).toBe("/switch");
    expect(getMarketingCtaDestination("product")).toBe("/product");
  });

  it("hides not-available features from marketed capability lists", () => {
    const active = getActiveMarketingFeatures();

    expect(active.map((feature) => feature.label)).toContain("Programs");
    expect(active.map((feature) => feature.label)).toContain(
      "Team roles and permissions",
    );
    expect(active.map((feature) => feature.label)).not.toContain(
      "Native mobile apps",
    );
    expect(active.map((feature) => feature.label)).not.toContain(
      "Automated billing",
    );
    expect(marketingFeatureAvailability.nativeMobileApps.status).toBe(
      "not_available",
    );
    expect(marketingFeatureAvailability.automatedMigration.status).toBe(
      "not_available",
    );
    expect(marketingFeatureAvailability.messageAttachments.status).toBe(
      "not_available",
    );
  });

  it("keeps lifecycle and attention examples separate", () => {
    const retainGroup = productPreviewGroups.find(
      (group) => group.key === "retain",
    );

    expect(retainGroup?.facts).toContain("Lifecycle: Active");
    expect(retainGroup?.facts).toContain("Attention: At risk");
    expect(retainGroup?.facts).toContain("Reason: Missed latest check-in");
    expect(retainGroup?.timeline.map((item) => item.label)).toContain(
      "Lifecycle: Onboarding",
    );
    expect(retainGroup?.timeline.map((item) => item.detail)).toContain(
      "Attention: Clear. Next step: Complete intake",
    );
    expect(retainGroup?.facts.join(" ")).not.toMatch(/Lifecycle: At risk/i);
    expect(retainGroup?.facts.join(" ")).not.toMatch(/Lifecycle: Inactive/i);
  });

  it("stores comparison content with last-reviewed dates and disclaimers", () => {
    expect(getComparisonPageData("truecoach").lastReviewed).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(getComparisonPageData("fitr").trademarkDisclaimer).toMatch(
      /trademarks/i,
    );
    expect(
      getComparisonPageData("truecoach").features.length,
    ).toBeGreaterThanOrEqual(4);
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
      "RepSync Product | The Whole Coaching Relationship",
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
      "/cookies",
    ].forEach((route) => {
      const expected =
        route === "/"
          ? "https://www.repsync.com/"
          : `https://www.repsync.com${route}`;
      expect(sitemap).toContain(expected);
    });
    expect(sitemap).not.toContain("https://www.repsync.com/privacy");
    expect(sitemap).not.toContain("https://www.repsync.com/terms");
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
    expect(publicClaims.every((claim) => claim.status === "verified")).toBe(
      true,
    );
    expect(publicClaims.every((claim) => claim.public)).toBe(true);
    expect(
      trustClaims.find((claim) => claim.id === "security_certifications")
        ?.public,
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
  const marketingSource = readSource(
    "src",
    "pages",
    "public",
    "marketing-content.tsx",
  );

  it("uses the requested CTA labels consistently", () => {
    expect(marketingSource).toContain("Start 7-day trial");
    expect(marketingSource).toContain("Explore the product");
    expect(marketingSource).toContain("Plan your switch");
    expect(marketingSource).not.toContain("Book a demo");
    expect(marketingSource).not.toContain("Book a switching demo");
    expect(marketingSource).not.toContain("Request switch help");
    expect(marketingSource).not.toContain("See product");
  });

  it("uses finished product motion without production placeholders", () => {
    expect(marketingSource).toContain("/media/repsync-workflow-motion.webm");
    expect(marketingSource).toContain("/media/repsync-workflow-poster.png");
    expect(marketingSource).toContain("/media/repsync-client-experience.webm");
    expect(marketingSource).toContain(
      "/media/repsync-client-experience-poster.png",
    );
    expect(marketingSource).not.toContain("Planned media");
    expect(marketingSource).not.toContain("MEDIA PLACEHOLDER");
    expect(marketingSource).not.toContain("Replace with");
  });

  it("keeps unavailable capabilities out of public product claims", () => {
    expect(marketingSource).toContain(
      "does not currently claim HIPAA, SOC 2, or ISO certification",
    );
    expect(marketingSource).not.toContain("Full automated migration");
    expect(
      unavailableMarketingCapabilities.map((feature) => feature.label),
    ).toContain("Full automated migration");
  });

  it("wires client join paths to existing public routes", () => {
    expect(marketingSource).toContain('"I have an invitation"');
    expect(marketingSource).toContain('"/login"');
    expect(marketingSource).toContain('"/coaches"');
    expect(marketingSource).toContain('"/signup/client"');
  });

  it("uses the shared public shell and per-route SEO metadata", () => {
    const shellSource = readSource(
      "src",
      "pages",
      "public",
      "public-site-shell.tsx",
    );
    const seoSource = readSource("src", "pages", "public", "public-seo.ts");

    expect(marketingSource).toContain("<PublicLayout>");
    expect(shellSource).toContain("Public navigation");
    expect(shellSource).toContain('linkSet="marketing"');
    expect(seoSource).toContain("application/ld+json");
    expect(seoSource).toContain('link[rel="canonical"]');
  });

  it("sets public profile metadata and noindex fallback", () => {
    const profileSource = readSource(
      "src",
      "pages",
      "public",
      "coach-profile.tsx",
    );

    expect(profileSource).toContain("Coach profile unavailable | RepSync");
    expect(profileSource).toContain("noindex,nofollow");
    expect(profileSource).toContain("index,follow");
    expect(profileSource).toContain("canonicalPath: `/p/${profile.slug}`");
  });
});
