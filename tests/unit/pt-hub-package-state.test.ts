import { describe, expect, it } from "vitest";
import {
  filterPackagesForManagement,
  getPackageDisplayState,
  getReorderedNonArchivedPackageIds,
  isPackagePubliclySelectable,
  normalizePackageStateForPersistence,
  PACKAGE_ARCHIVE_CONFIRMATION_LINES,
  summarizePackageDisplayStates,
  type PTPackageManagementFilter,
} from "../../src/features/pt-hub/lib/pt-hub-package-state";
import type { PTPackage } from "../../src/features/pt-hub/types";

function createPackage(
  id: string,
  params: Partial<Pick<PTPackage, "status" | "isPublic" | "sortOrder">>,
): PTPackage {
  return {
    id,
    ptUserId: "coach-1",
    title: id,
    subtitle: null,
    description: null,
    priceLabel: null,
    billingCadenceLabel: null,
    ctaLabel: null,
    features: null,
    status: params.status ?? "draft",
    isPublic: params.isPublic ?? false,
    sortOrder: params.sortOrder ?? 0,
    currencyCode: null,
    archivedAt: params.status === "archived" ? "2026-04-11T00:00:00.000Z" : null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

describe("pt hub package state helpers", () => {
  it("maps display states from lifecycle and visibility", () => {
    expect(getPackageDisplayState({ status: "draft", isPublic: false })).toBe(
      "Draft",
    );
    expect(getPackageDisplayState({ status: "active", isPublic: false })).toBe(
      "Active • Hidden",
    );
    expect(getPackageDisplayState({ status: "active", isPublic: true })).toBe(
      "Active • Public",
    );
    expect(getPackageDisplayState({ status: "archived", isPublic: false })).toBe(
      "Archived",
    );
  });

  it("filters packages by all/public/hidden/draft/archived", () => {
    const packages = [
      createPackage("pkg-public", { status: "active", isPublic: true }),
      createPackage("pkg-hidden", { status: "active", isPublic: false }),
      createPackage("pkg-draft", { status: "draft", isPublic: false }),
      createPackage("pkg-archived", { status: "archived", isPublic: false }),
    ];

    const idsFor = (filter: PTPackageManagementFilter) =>
      filterPackagesForManagement(packages, filter).map((pkg) => pkg.id);

    expect(idsFor("all")).toEqual([
      "pkg-public",
      "pkg-hidden",
      "pkg-draft",
      "pkg-archived",
    ]);
    expect(idsFor("public")).toEqual(["pkg-public"]);
    expect(idsFor("hidden")).toEqual(["pkg-hidden"]);
    expect(idsFor("draft")).toEqual(["pkg-draft"]);
    expect(idsFor("archived")).toEqual(["pkg-archived"]);
  });

  it("keeps archived packages out of reorder ids", () => {
    const packages = [
      createPackage("pkg-active-1", { status: "active", isPublic: true, sortOrder: 0 }),
      createPackage("pkg-archived", { status: "archived", isPublic: false, sortOrder: 10 }),
      createPackage("pkg-draft", { status: "draft", isPublic: false, sortOrder: 20 }),
    ];

    const reorderedIds = getReorderedNonArchivedPackageIds({
      packages,
      packageId: "pkg-draft",
      direction: "up",
    });

    expect(reorderedIds).toEqual(["pkg-draft", "pkg-active-1"]);
    expect(reorderedIds).not.toContain("pkg-archived");
  });

  it("treats only Active + Public packages as publicly selectable", () => {
    expect(
      isPackagePubliclySelectable({
        status: "active",
        isPublic: true,
      }),
    ).toBe(true);

    expect(
      isPackagePubliclySelectable({
        status: "draft",
        isPublic: true,
      }),
    ).toBe(false);

    expect(
      isPackagePubliclySelectable({
        status: "active",
        isPublic: false,
      }),
    ).toBe(false);

    expect(
      isPackagePubliclySelectable({
        status: "archived",
        isPublic: true,
      }),
    ).toBe(false);
  });

  it("handles Active Public -> Draft transition as non-public", () => {
    const fromActivePublic = { status: "active" as const, isPublic: true };
    const transitioned = normalizePackageStateForPersistence({
      ...fromActivePublic,
      status: "draft" as const,
    });

    expect(transitioned).toEqual({
      status: "draft",
      isPublic: false,
    });
  });

  it("handles Active Public -> Archived transition as non-public", () => {
    const fromActivePublic = { status: "active" as const, isPublic: true };
    const transitioned = normalizePackageStateForPersistence({
      ...fromActivePublic,
      status: "archived" as const,
    });

    expect(transitioned).toEqual({
      status: "archived",
      isPublic: false,
    });
  });

  it("handles Draft -> Active Hidden transition while remaining non-public", () => {
    const fromDraft = { status: "draft" as const, isPublic: false };
    const transitioned = normalizePackageStateForPersistence({
      ...fromDraft,
      status: "active" as const,
      isPublic: false,
    });

    expect(transitioned).toEqual({
      status: "active",
      isPublic: false,
    });
  });

  it("returns deterministic state summary counts for preview and manager surfaces", () => {
    const summary = summarizePackageDisplayStates([
      createPackage("pkg-public", { status: "active", isPublic: true }),
      createPackage("pkg-hidden", { status: "active", isPublic: false }),
      createPackage("pkg-draft", { status: "draft", isPublic: false }),
      createPackage("pkg-archived", { status: "archived", isPublic: false }),
    ]);

    expect(summary).toEqual([
      { label: "Draft", count: 1 },
      { label: "Active • Hidden", count: 1 },
      { label: "Active • Public", count: 1 },
      { label: "Archived", count: 1 },
    ]);
  });

  it("keeps required archive confirmation safety copy", () => {
    const copy = PACKAGE_ARCHIVE_CONFIRMATION_LINES.join(" ").toLowerCase();

    expect(copy).toContain("removed from your public profile");
    expect(copy).toContain("removed from apply-form selection");
    expect(copy).toContain("historical leads remain unchanged");
  });
});
