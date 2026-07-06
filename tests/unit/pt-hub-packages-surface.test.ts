import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("pt hub packages surface wiring", () => {
  it("registers /pt-hub/packages route and sidebar nav", () => {
    const appRoutes = readSource("src/routes/app.tsx");
    const hubLayout = readSource("src/components/layouts/pt-hub-layout.tsx");

    expect(appRoutes).toContain('<Route path="packages"');
    expect(hubLayout).toContain('label: "Packages"');
    expect(hubLayout).toContain('to: "/pt-hub/packages"');
  });

  it("keeps marketplace tab as thin wrapper to canonical packages surface", () => {
    const profileEditor = readSource(
      "src/features/pt-hub/components/pt-hub-profile-editor.tsx",
    );

    expect(profileEditor).toContain('to="/pt-hub/packages"');
    expect(profileEditor).not.toContain("<PtHubPackageManager />");
  });

  it("keeps package manager as the dominant packages-page workflow", () => {
    const packagesPage = readSource("src/pages/pt-hub/packages.tsx");

    expect(packagesPage).toContain("<PtHubPackageManager />");
    expect(packagesPage).not.toContain("page-kpi-block");
    expect(packagesPage).not.toContain("pt-hub-kpi-grid");
  });

  it("keeps package state counters out of the packages page", () => {
    const packagesPage = readSource("src/pages/pt-hub/packages.tsx");

    expect(packagesPage).not.toContain("PACKAGE_KPI_META");
    expect(packagesPage).not.toContain("summarizePackageDisplayStates");
    expect(packagesPage).not.toContain("<StatCard");
    expect(packagesPage).not.toContain("before:h-1");
    expect(packagesPage).not.toContain("after:blur");
    expect(packagesPage).not.toContain("after:bg-");
  });

  it("keeps the packages page header and empty state concise", () => {
    const packagesPage = readSource("src/pages/pt-hub/packages.tsx");
    const hubLayout = readSource("src/components/layouts/pt-hub-layout.tsx");
    const i18nSource = readSource("src/lib/i18n.tsx");
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );
    const emptyStateStart = packageManager.indexOf(
      "{packages.length === 0 && packagesQuery.isSuccess ? (",
    );
    const emptyStateEnd = packageManager.indexOf(
      "{splitFiltered.reorderable.length > 0 ? (",
    );
    const emptyStateSource = packageManager.slice(
      emptyStateStart,
      emptyStateEnd,
    );

    expect(packagesPage).not.toContain(
      "Manage package visibility and ordering for public lead intake.",
    );
    expect(hubLayout).not.toContain(
      "Manage package visibility and ordering for public lead intake.",
    );
    expect(i18nSource).not.toContain(
      "Manage package visibility and ordering for public lead intake.",
    );
    expect(packageManager).toContain("Control package visibility and order.");
    expect(emptyStateSource).toContain("No packages yet.");
    expect(emptyStateSource).not.toContain(
      "Create your first offer to show on your public",
    );
    expect(emptyStateSource).not.toContain("<Button");
    expect(emptyStateSource).not.toContain("setIsCreating(true)");
  });

  it("keeps canonical manager semantics for draft/public/archive/reorder behavior", () => {
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );

    expect(packageManager).toContain('status: "draft"');
    expect(packageManager).toContain(
      'disabled={createState.status !== "active"}',
    );
    expect(packageManager).toContain(
      'disabled={editState.status !== "active"}',
    );
    expect(packageManager).toContain("getReorderedNonArchivedPackageIds");
    expect(packageManager).toContain("Archived packages");
  });

  it("labels row edit work explicitly and keeps quick actions on the row", () => {
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );

    expect(packageManager).toContain("<Pencil");
    expect(packageManager).toContain("Edit");
    expect(packageManager).toContain("setEditingPackageId(pkg.id)");
    expect(packageManager).toContain("handleToggleVisibility(pkg.id, checked)");
    expect(packageManager).toContain("aria-label={`Move ${pkg.title} up`}");
    expect(packageManager).toContain("aria-label={`Move ${pkg.title} down`}");
    expect(packageManager).not.toContain("<Eye");
    expect(packageManager).not.toContain("View");
    expect(packageManager).not.toContain("viewingPackage");
  });

  it("keeps guarded delete UX with explicit archive guidance for referenced packages", () => {
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );

    expect(packageManager).toContain("usePtPackageLeadReferenceCounts");
    expect(packageManager).toContain(
      "This package is referenced by existing leads and cannot be permanently deleted. Archive it instead.",
    );
    expect(packageManager).toContain("Delete package permanently?");
    expect(packageManager).toContain(
      "no leads currently reference this package",
    );
    expect(packageManager).toContain("<Trash2");
  });

  it("shows compact package usage indicators and keeps usage/delete logic in sync", () => {
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );

    expect(packageManager).toContain("function getPackageUsageLabel");
    expect(packageManager).toContain('return "Unused";');
    expect(packageManager).toContain(
      "return `Used by ${leadReferenceCount} ${",
    );
    expect(packageManager).toContain(
      "const hasLeadReferences = resolvedLeadReferenceCount > 0;",
    );
    expect(packageManager).toContain("const canDelete =");
    expect(packageManager).toContain(
      "!packageLeadReferenceCountsQuery.isLoading &&",
    );
    expect(packageManager).toContain("!hasLeadReferences");
  });

  it("preserves dirty modal edits across package data refreshes", () => {
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );

    expect(packageManager).toContain("dirtyEditPackageIds");
    expect(packageManager).toContain("setDirtyEditPackageIds");
    expect(packageManager).toContain("dirtyEditPackageIdsRef");
    expect(packageManager).toContain("function updatePackageEditState");
    expect(packageManager).toContain("new Set(packages.map((pkg) => pkg.id))");
    expect(packageManager).toContain(
      "if (currentState && dirtyIds.has(pkg.id))",
    );
    expect(packageManager).toContain("nextState[pkg.id] = currentState");
    expect(packageManager).not.toContain("setEditStateById(nextState);");
    expect(packageManager).toContain("next.delete(packageId)");
  });

  it("keeps package create and edit fields visibly labeled", () => {
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );

    expect(packageManager).toContain("function PackageFormField");
    expect(packageManager).toContain('label="Package title"');
    expect(packageManager).toContain('label="Subtitle"');
    expect(packageManager).toContain('label="Price"');
    expect(packageManager).toContain('label="Currency"');
    expect(packageManager).toContain('label="Billing frequency"');
    expect(packageManager).toContain('label="Status"');
    expect(packageManager).toContain('label="Display order"');
    expect(packageManager).toContain('label="Description"');
    expect(packageManager).toContain("Required");
    expect(packageManager).toContain("aria-describedby");
  });
});
