import { describe, expect, it } from "vitest";
import { mapPublicPtPackageOptions } from "../../src/features/pt-hub/lib/pt-hub";

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
});
