import { describe, expect, it } from "vitest";
import {
  mapPublicPtPackageOptions,
  mapPublicPtPackageOptionsFromPackages,
} from "../../src/features/pt-hub/lib/pt-hub";

describe("mapPublicPtPackageOptions", () => {
  it("returns only active public packages", () => {
    const options = mapPublicPtPackageOptions([
      {
        id: "pkg-active-public",
        title: "12 Week Strength",
        status: "active",
        is_public: true,
        sort_order: 20,
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "pkg-draft",
        title: "Draft Package",
        status: "draft",
        is_public: true,
        sort_order: 10,
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "pkg-hidden",
        title: "Hidden Package",
        status: "active",
        is_public: false,
        sort_order: 10,
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "pkg-archived",
        title: "Archived Package",
        status: "archived",
        is_public: true,
        sort_order: 10,
        created_at: "2026-04-01T00:00:00.000Z",
      },
    ]);

    expect(options).toEqual([
      {
        id: "pkg-active-public",
        label: "12 Week Strength",
        subtitle: null,
        description: null,
        priceLabel: null,
        billingCadenceLabel: null,
        features: null,
        ctaLabel: null,
      },
    ]);
  });

  it("orders by sort_order then created_at then id", () => {
    const options = mapPublicPtPackageOptions([
      {
        id: "pkg-b",
        title: "Package B",
        status: "active",
        is_public: true,
        sort_order: 20,
        created_at: "2026-04-02T00:00:00.000Z",
      },
      {
        id: "pkg-c",
        title: "Package C",
        status: "active",
        is_public: true,
        sort_order: 10,
        created_at: "2026-04-03T00:00:00.000Z",
      },
      {
        id: "pkg-a",
        title: "Package A",
        status: "active",
        is_public: true,
        sort_order: 10,
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "pkg-d",
        title: "Package D",
        status: "active",
        is_public: true,
        sort_order: 10,
        created_at: "2026-04-01T00:00:00.000Z",
      },
    ]);

    expect(options.map((option) => option.id)).toEqual([
      "pkg-a",
      "pkg-d",
      "pkg-c",
      "pkg-b",
    ]);
  });

  it("keeps package card metadata for the public profile cards", () => {
    const [option] = mapPublicPtPackageOptions([
      {
        id: "pkg-card",
        title: "Hybrid Coaching",
        subtitle: "Programming + weekly check-ins",
        description: "Custom plan\nWeekly async feedback",
        price_label: "$280",
        billing_cadence_label: "every 4 weeks",
        cta_label: "Apply now",
        features: ["Custom plan", "Weekly async feedback"],
        status: "active",
        is_public: true,
        sort_order: 0,
        created_at: "2026-04-01T00:00:00.000Z",
      },
    ]);

    expect(option).toMatchObject({
      id: "pkg-card",
      label: "Hybrid Coaching",
      subtitle: "Programming + weekly check-ins",
      priceLabel: "$280",
      billingCadenceLabel: "every 4 weeks",
      features: ["Custom plan", "Weekly async feedback"],
      ctaLabel: "Apply now",
    });
  });
});

describe("mapPublicPtPackageOptionsFromPackages", () => {
  it("applies the same active+public visibility rules for preview rendering", () => {
    const options = mapPublicPtPackageOptionsFromPackages([
      {
        id: "pkg-active-public",
        ptUserId: "coach-1",
        title: "12 Week Strength",
        subtitle: null,
        description: null,
        priceLabel: null,
        billingCadenceLabel: null,
        ctaLabel: null,
        features: null,
        status: "active",
        isPublic: true,
        sortOrder: 10,
        currencyCode: null,
        archivedAt: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: null,
      },
      {
        id: "pkg-draft",
        ptUserId: "coach-1",
        title: "Draft",
        subtitle: null,
        description: null,
        priceLabel: null,
        billingCadenceLabel: null,
        ctaLabel: null,
        features: null,
        status: "draft",
        isPublic: true,
        sortOrder: 20,
        currencyCode: null,
        archivedAt: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: null,
      },
      {
        id: "pkg-hidden",
        ptUserId: "coach-1",
        title: "Hidden",
        subtitle: null,
        description: null,
        priceLabel: null,
        billingCadenceLabel: null,
        ctaLabel: null,
        features: null,
        status: "active",
        isPublic: false,
        sortOrder: 30,
        currencyCode: null,
        archivedAt: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: null,
      },
    ]);

    expect(options.map((option) => option.id)).toEqual(["pkg-active-public"]);
  });

  it("keeps preview package order aligned with the public resolver order", () => {
    const rows = [
      {
        id: "pkg-c",
        title: "Package C",
        status: "active",
        is_public: true,
        sort_order: 20,
        created_at: "2026-04-03T00:00:00.000Z",
      },
      {
        id: "pkg-a",
        title: "Package A",
        status: "active",
        is_public: true,
        sort_order: 10,
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "pkg-b",
        title: "Package B",
        status: "active",
        is_public: true,
        sort_order: 10,
        created_at: "2026-04-02T00:00:00.000Z",
      },
    ];

    const publicIds = mapPublicPtPackageOptions(rows).map((option) => option.id);
    const previewIds = mapPublicPtPackageOptionsFromPackages(
      rows.map((row) => ({
        id: row.id,
        ptUserId: "coach-1",
        title: row.title,
        subtitle: null,
        description: null,
        priceLabel: null,
        billingCadenceLabel: null,
        ctaLabel: null,
        features: null,
        status: "active" as const,
        isPublic: true,
        sortOrder: row.sort_order,
        currencyCode: null,
        archivedAt: null,
        createdAt: row.created_at,
        updatedAt: null,
      })),
    ).map((option) => option.id);

    expect(previewIds).toEqual(publicIds);
    expect(previewIds).toEqual(["pkg-a", "pkg-b", "pkg-c"]);
  });
});
