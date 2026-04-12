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

  it("keeps public-preview affordance on the packages page", () => {
    const packagesPage = readSource("src/pages/pt-hub/packages.tsx");

    expect(packagesPage).toContain('to="/pt-hub/profile/preview"');
    expect(packagesPage).toContain("Public visibility sync");
  });

  it("keeps canonical manager semantics for draft/public/archive/reorder behavior", () => {
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );

    expect(packageManager).toContain('status: "draft"');
    expect(packageManager).toContain('disabled={createState.status !== "active"}');
    expect(packageManager).toContain('disabled={editState.status !== "active"}');
    expect(packageManager).toContain("getReorderedNonArchivedPackageIds");
    expect(packageManager).toContain("Archived packages");
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
    expect(packageManager).toContain("no leads currently reference this package");
    expect(packageManager).toContain("<Trash2");
  });

  it("shows compact package usage indicators and keeps usage/delete logic in sync", () => {
    const packageManager = readSource(
      "src/features/pt-hub/components/pt-hub-package-manager.tsx",
    );

    expect(packageManager).toContain("function getPackageUsageLabel");
    expect(packageManager).toContain('return "Unused";');
    expect(packageManager).toContain('return `Used by ${leadReferenceCount} ${');
    expect(packageManager).toContain(
      'const hasLeadReferences = resolvedLeadReferenceCount > 0;',
    );
    expect(packageManager).toContain(
      '!packageLeadReferenceCountsQuery.isLoading && !hasLeadReferences',
    );
  });
});
