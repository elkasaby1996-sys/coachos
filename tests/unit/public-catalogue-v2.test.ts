import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COMMERCIAL_FEATURE_KEYS,
  PLAN_FEATURE_KEYS,
} from "../../src/features/commercial-catalogue/contracts";
import { fetchPublicCommercialCatalogueV2 } from "../../src/features/commercial-catalogue/catalogue-api";
import { describe, expect, it } from "vitest";
import { PUBLIC_CATALOGUE_V2 } from "../../src/features/commercial-catalogue/public-catalogue-snapshot";
import {
  publicCommercialCatalogueV2Schema,
  groupCatalogueFeatures,
} from "../../src/features/commercial-catalogue/catalogue-v2";
import {
  PricingComparison,
  PublicSeatAddons,
} from "../../src/pages/public/pricing-comparison";
import {
  formatCommercialPrice,
  formatPublishedPackageCapacity,
} from "../../src/features/commercial-catalogue/public-plan-snapshot";

const clone = () => JSON.parse(JSON.stringify(PUBLIC_CATALOGUE_V2));
describe("reviewed public catalogue v2", () => {
  it("audits all 63 keys, their exact mappings and every published label", () => {
    const audit = JSON.parse(
      readFileSync("docs/commercial-readiness-audit.json", "utf8"),
    ) as Array<{
      featureKey: (typeof COMMERCIAL_FEATURE_KEYS)[number];
      intendedPlans: string[];
      recommendedReadiness: string;
      recommendedVisibility: string;
      marketingLabel: string | null;
      implementationSource: string;
      unitComponentEvidence: string;
      browserEvidence: string;
    }>;
    expect(audit.map((row) => row.featureKey)).toEqual(COMMERCIAL_FEATURE_KEYS);
    for (const row of audit) {
      expect(row.intendedPlans).toEqual(
        Object.entries(PLAN_FEATURE_KEYS)
          .filter(([, keys]) =>
            (keys as readonly string[]).includes(row.featureKey),
          )
          .map(([key]) => key),
      );
      if (row.recommendedReadiness !== "DRAFT") {
        expect(row.implementationSource).not.toContain("No complete");
        expect(row.unitComponentEvidence.length).toBeGreaterThan(0);
      }
      if (row.recommendedVisibility === "public") {
        expect(row.recommendedReadiness).toBe("COMMERCIALLY_SALEABLE");
        expect(row.marketingLabel).toBeTruthy();
        expect(row.browserEvidence).toContain(
          "commercial-catalogue-v2.spec.ts",
        );
      }
    }
    const approved = audit.filter(
      (row) => row.recommendedVisibility === "public",
    );
    expect(
      PUBLIC_CATALOGUE_V2.plans[0].features.map((f) => [
        f.featureKey,
        f.marketingLabel,
      ]),
    ).toEqual(approved.map((r) => [r.featureKey, r.marketingLabel]));
  });
  it("validates the explicit v2 API and returns safe failures", async () => {
    expect(
      (
        await fetchPublicCommercialCatalogueV2({
          rpc: async () => ({ data: PUBLIC_CATALOGUE_V2, error: null }),
        })
      ).data,
    ).toEqual(PUBLIC_CATALOGUE_V2);
    expect(
      (
        await fetchPublicCommercialCatalogueV2({
          rpc: async () => ({ data: { schemaVersion: 1 }, error: null }),
        })
      ).error?.code,
    ).toBe("INVALID_PAYLOAD");
    expect(
      (
        await fetchPublicCommercialCatalogueV2({
          rpc: async () => {
            throw new Error("private provider detail");
          },
        })
      ).error?.message,
    ).toBe("Commercial catalogue is unavailable.");
  });
  it("removes unconditional feature and seat promises from pricing and signup", () => {
    const source = readFileSync(
      "src/pages/public/marketing-content.tsx",
      "utf8",
    );
    for (const stale of [
      "pricingCoreFeatures",
      "$12 monthly",
      "$120 annually",
      "Every RepSync plan includes the core",
      "seven-day Growth",
      "advanced reporting, and operating controls",
    ])
      expect(source).not.toContain(stale);
    expect(readFileSync("src/pages/public/pt-signup.tsx", "utf8")).toContain(
      "10 clients, 2 coach seats, 1 workspace and 3 published packages",
    );
  });
  it("is recursively frozen and strictly valid", () => {
    expect(
      publicCommercialCatalogueV2Schema.parse(PUBLIC_CATALOGUE_V2),
    ).toEqual(PUBLIC_CATALOGUE_V2);
    function frozen(value: unknown) {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(frozen);
      }
    }
    frozen(PUBLIC_CATALOGUE_V2);
  });
  it.each(["providerId", "description", "billingAccountId"])(
    "rejects private field %s",
    (field) => {
      const value = clone();
      value.plans[0][field] = "private";
      expect(publicCommercialCatalogueV2Schema.safeParse(value).success).toBe(
        false,
      );
    },
  );
  it("rejects unknown keys, domain mismatch, duplicates, fractional prices and unapproved add-ons", () => {
    for (const mutate of [
      (v: ReturnType<typeof clone>) => {
        v.plans[0].features[0].featureKey = "integration.wearables";
        v.plans[0].features[0].domain = "integration";
      },
      (v: ReturnType<typeof clone>) => {
        v.plans[0].features[0].featureKey = "core.unapproved_unknown";
      },
      (v: ReturnType<typeof clone>) => {
        v.plans[0].features[0].domain = "team";
      },
      (v: ReturnType<typeof clone>) => {
        v.plans[0].features.push(v.plans[0].features[0]);
      },
      (v: ReturnType<typeof clone>) => {
        v.plans[0].monthlyPriceMinor = 19.5;
      },
      (v: ReturnType<typeof clone>) => {
        v.addons.push({
          addonKey: "additional_coach_seat",
          displayName: "Additional coach seat",
          currencyCode: "USD",
          monthlyPriceMinor: 1200,
          annualPriceMinor: 12000,
        });
      },
    ]) {
      const value = clone();
      mutate(value);
      expect(publicCommercialCatalogueV2Schema.safeParse(value).success).toBe(
        false,
      );
    }
  });
  it("detects every required snapshot drift dimension", () => {
    const mutations = [
      (v: ReturnType<typeof clone>) => v.plans[0].features.pop(),
      (v: ReturnType<typeof clone>) =>
        v.plans[0].features.push(v.plans[0].features[0]),
      (v: ReturnType<typeof clone>) => {
        v.plans[0].features[0].marketingLabel = "Changed";
      },
      (v: ReturnType<typeof clone>) => {
        v.plans[0].monthlyPriceMinor++;
      },
      (v: ReturnType<typeof clone>) => {
        v.plans[0].capacities.countedClients++;
      },
      (v: ReturnType<typeof clone>) => v.plans[0].features.reverse(),
      (v: ReturnType<typeof clone>) => {
        v.trial.durationDays++;
      },
      (v: ReturnType<typeof clone>) => v.addons.push({ addonKey: "unknown" }),
    ];
    mutations.forEach((mutate) => {
      const value = clone();
      mutate(value);
      expect(value).not.toEqual(PUBLIC_CATALOGUE_V2);
    });
  });
  it("formats full annual charges, savings and unlimited capacity", () => {
    expect(
      PUBLIC_CATALOGUE_V2.plans.map((p) =>
        formatCommercialPrice(p.annualPriceMinor),
      ),
    ).toEqual(["$190", "$590", "$1,190"]);
    PUBLIC_CATALOGUE_V2.plans.forEach((p) =>
      expect(p.annualPriceMinor).toBe(p.monthlyPriceMinor * 10),
    );
    expect(formatPublishedPackageCapacity(null)).toBe(
      "Unlimited published packages",
    );
    expect(PUBLIC_CATALOGUE_V2.trial.capacities).toEqual({
      countedClients: 10,
      coachSeats: 2,
      activeWorkspaces: 1,
      publishedPackages: 3,
    });
  });
  it("renders only nonempty canonical groups and explicit inclusion text", () => {
    expect(
      groupCatalogueFeatures(PUBLIC_CATALOGUE_V2.plans).map((g) => g.domain),
    ).toEqual(["core"]);
    const html = renderToStaticMarkup(createElement(PricingComparison));
    expect(html.match(/>Included<\/td>/g)).toHaveLength(6);
    expect(html).toContain('scope="row"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Maximum total coach seats");
    expect(html).toContain("Unlimited");
    expect(html).not.toContain("Integration");
  });
  it("hides unapproved seats but renders the future approved presentation completely", () => {
    expect(
      renderToStaticMarkup(
        createElement(PublicSeatAddons, { period: "monthly" }),
      ),
    ).toBe("");
    const html = renderToStaticMarkup(
      createElement(PublicSeatAddons, {
        period: "annual",
        addons: [
          {
            addonKey: "additional_coach_seat",
            displayName: "Additional coach seat",
            currencyCode: "USD",
            monthlyPriceMinor: 1200,
            annualPriceMinor: 12000,
          },
        ],
      }),
    );
    for (const text of [
      "$120",
      "per year",
      "owner purchase",
      "automatic charge",
      "Taxes and proration",
      "maximum 10",
      "5 included",
    ])
      expect(html).toContain(text);
  });
  it("keeps startup independent of the marketing snapshot", () => {
    for (const path of [
      "src/pages/public/login.tsx",
      "src/pages/public/auth-callback.tsx",
      "src/main.tsx",
      "src/providers/AuthProvider.tsx",
      "src/components/common/theme-provider.tsx",
      "src/components/common/bootstrap-gate.tsx",
      "src/lib/auth.tsx",
      "src/lib/use-workspace.ts",
      "src/lib/theme.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(
        /public-catalogue-snapshot|get_public_commercial_catalogue/,
      );
    }
  });
});
