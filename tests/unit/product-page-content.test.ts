import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPublicMarketingIntegrations,
  marketingIntegrations,
  productLifecycleValues,
  productMediaAssets,
  productMediaIds,
  productPageContent,
  productPageRoutes,
  visibleProductChapters,
  type MarketingIntegration,
} from "../../src/lib/product-page-content";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

const expectedChapterIds = [
  "acquire",
  "onboard",
  "training",
  "nutrition-habits",
  "messaging",
  "check-ins",
  "client-attention",
  "operations-analytics",
  "client-experience",
  "team-access",
  "integrations",
];

describe("product page content architecture", () => {
  it("defines exactly eleven ordered and available chapters", () => {
    expect(productPageContent.chapters).toHaveLength(11);
    expect(productPageContent.chapters.map((chapter) => chapter.id)).toEqual(
      expectedChapterIds,
    );
    expect(visibleProductChapters.map((chapter) => chapter.id)).toEqual(
      expectedChapterIds,
    );
  });

  it("keeps training, nutrition and habits, messaging, and integrations separate", () => {
    const variants = new Map(
      productPageContent.chapters.map((chapter) => [
        chapter.id,
        chapter.componentVariant,
      ]),
    );
    expect(variants.get("training")).toBe("training");
    expect(variants.get("nutrition-habits")).toBe("nutrition_habits");
    expect(variants.get("messaging")).toBe("messaging");
    expect(variants.get("integrations")).toBe("integrations");
  });

  it("uses the canonical lifecycle without treating risk as lifecycle", () => {
    const lifecycleLabels = productLifecycleValues.map((state) => state.label);
    expect(lifecycleLabels).toEqual([
      "Invited",
      "Onboarding",
      "Active",
      "Paused",
      "Completed",
      "Churned",
    ]);
    expect(lifecycleLabels).not.toContain("At risk");
    expect(lifecycleLabels).not.toContain("Inactive");
  });

  it("filters integration availability and never exposes hidden providers", () => {
    const fixtures: MarketingIntegration[] = [
      {
        id: "available",
        name: "Available provider",
        category: "wearable",
        status: "available",
        publicDescription: "Available",
        public: true,
      },
      {
        id: "beta",
        name: "Beta provider",
        category: "calendar",
        status: "beta",
        publicDescription: "Beta",
        public: true,
      },
      {
        id: "hidden",
        name: "Internal exercise API",
        category: "developer",
        status: "hidden",
        publicDescription: "Internal",
        public: true,
      },
    ];
    expect(
      getPublicMarketingIntegrations(fixtures).map((item) => item.id),
    ).toEqual(["available", "beta"]);
    expect(getPublicMarketingIntegrations()).toEqual([]);
    expect(
      marketingIntegrations.find((item) => item.id === "garmin")?.status,
    ).toBe("hidden");
    expect(
      marketingIntegrations.some((item) => item.id === "exercise_api"),
    ).toBe(false);
  });

  it("centralizes trial routes and unique media identifiers", () => {
    expect(productPageRoutes.trial).toBe("/start-trial");
    expect(new Set(productMediaIds).size).toBe(productMediaIds.length);
    expect(
      productPageContent.chapters.every((chapter) =>
        productMediaIds.includes(chapter.mediaId),
      ),
    ).toBe(true);
    expect(productMediaAssets["UI-03-lead-pipeline"]?.width).toBe(960);
    expect(productMediaAssets["UI-08-client-home"]?.alt).toContain(
      "active workout timer",
    );
  });

  it("does not render legacy or unsupported product claims", () => {
    const source = [
      readSource("src", "pages", "public", "product-page.tsx"),
      readSource("src", "lib", "product-page-content.ts"),
    ].join("\n");
    for (const unsupported of [
      "Book a demo",
      "Watch demo",
      "Deep Diagnostics",
      "Predict Churn",
      "Pulse Engine",
      "Tactile Intelligence",
      "Smart Programming",
      "Dynamic Nutrition",
      "Habit Stacking",
      "Revenue tracking",
      "Automated qualification",
      "contracts and payments",
      "MEDIA PLACEHOLDER",
    ]) {
      expect(source).not.toContain(unsupported);
    }
  });
});
