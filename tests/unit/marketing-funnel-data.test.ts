import { describe, expect, it } from "vitest";
import {
  comparisonPages,
  getComparisonCategories,
  getMarketingFeaturesByAudience,
  getMarketingFeaturesByCategory,
  marketingProductFeatures,
  migrationMatrix,
  productPreviewGroups,
  unavailableMarketingCapabilities,
} from "../../src/lib/marketing-public";

describe("marketing funnel comparison data", () => {
  it("renders only competitor rows with verified evidence or explicit non-RepSync limitation", () => {
    for (const page of Object.values(comparisonPages)) {
      expect(page.features.length).toBeGreaterThan(0);
      for (const feature of page.features) {
        expect(feature.competitor.availability).not.toBe("unknown");
        if (feature.competitor.availability !== "not_available") {
          expect(feature.competitor.evidence?.sourceUrl).toMatch(/^https:\/\//);
          expect(feature.competitor.evidence?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    }
  });

  it("groups comparison rows by readable categories", () => {
    const trueCoachCategories = getComparisonCategories(
      comparisonPages.truecoach.features,
    );
    const fitrCategories = getComparisonCategories(comparisonPages.fitr.features);

    expect(trueCoachCategories).toContain("Delivery");
    expect(trueCoachCategories).toContain("Acquisition");
    expect(fitrCategories).toContain("Business");
    expect(fitrCategories).toContain("Operations");
  });

  it("keeps unsupported migration areas honest", () => {
    expect(
      migrationMatrix.find((item) => item.id === "billing_history")?.support,
    ).toBe("not_supported");
    expect(
      migrationMatrix.find((item) => item.id === "wearable_history")?.support,
    ).toBe("not_supported");
    expect(
      migrationMatrix.find((item) => item.id === "active_programs")?.support,
    ).toBe("evaluate");
  });

  it("centralizes product and audience feature claims", () => {
    expect(getMarketingFeaturesByCategory("acquire").map((item) => item.id)).toContain(
      "public_profile",
    );
    expect(getMarketingFeaturesByAudience("client").map((item) => item.id)).toContain(
      "client_home",
    );
    expect(marketingProductFeatures.map((item) => item.availability)).not.toContain(
      undefined,
    );
    expect(
      marketingProductFeatures.filter((item) => item.availability === "not_available"),
    ).toHaveLength(0);
  });

  it("keeps unavailable capabilities explicit without rendering them as active features", () => {
    expect(unavailableMarketingCapabilities.map((item) => item.label)).toContain(
      "Automated billing",
    );
    expect(unavailableMarketingCapabilities.map((item) => item.label)).toContain(
      "Native mobile apps",
    );
    expect(unavailableMarketingCapabilities.map((item) => item.label)).toContain(
      "Garmin",
    );
  });

  it("provides deterministic previews for primary product sections", () => {
    const previewKeys = new Set(productPreviewGroups.map((group) => group.key));

    [
      "pt_hub",
      "public_profile",
      "lead_pipeline",
      "client_detail",
      "program_assignment",
      "nutrition_assignment",
      "checkin",
      "client_attention",
      "client_home",
      "team_permissions",
    ].forEach((key) => expect(previewKeys.has(key)).toBe(true));
  });
});
