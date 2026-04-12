import type { PTPackage, PTPackageStatus } from "../types";

export type PTPackageDisplayState =
  | "Draft"
  | "Active • Hidden"
  | "Active • Public"
  | "Archived";

export type PTPackageManagementFilter =
  | "all"
  | "public"
  | "hidden"
  | "draft"
  | "archived";

export const PT_PACKAGE_FILTER_OPTIONS: Array<{
  value: PTPackageManagementFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "public", label: "Public" },
  { value: "hidden", label: "Hidden" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

export const PACKAGE_ARCHIVE_CONFIRMATION_LINES = [
  "This package will be removed from your public profile.",
  "It will be removed from Apply-form selection.",
  "Historical leads remain unchanged.",
] as const;

type PackageStateValues = {
  status: PTPackageStatus;
  isPublic: boolean;
};

export function getPackageDisplayState(
  values: PackageStateValues,
): PTPackageDisplayState {
  if (values.status === "archived") return "Archived";
  if (values.status === "draft") return "Draft";
  return values.isPublic ? "Active • Public" : "Active • Hidden";
}

export function isPackagePubliclySelectable(values: PackageStateValues) {
  return values.status === "active" && values.isPublic;
}

export function normalizePackageVisibilityForStatus(values: PackageStateValues) {
  if (values.status !== "active") return false;
  return values.isPublic;
}

export function normalizePackageStateForPersistence<TValue extends PackageStateValues>(
  values: TValue,
): TValue {
  const normalizedIsPublic = normalizePackageVisibilityForStatus(values);
  if (normalizedIsPublic === values.isPublic) return values;
  return {
    ...values,
    isPublic: normalizedIsPublic,
  };
}

export function getPackageStateHelperCopy(values: PackageStateValues) {
  const displayState = getPackageDisplayState(values);

  if (displayState === "Draft") {
    return "Draft packages are internal only and are never shown publicly.";
  }

  if (displayState === "Active • Hidden") {
    return "This package is active but hidden, so it is not shown on your public profile or Apply form.";
  }

  if (displayState === "Active • Public") {
    return "This package is live on your public profile and selectable in the Apply form.";
  }

  return "Archived packages are retired, removed from public selection, and kept for historical lead context.";
}

export function packageMatchesManagementFilter(
  pkg: PackageStateValues,
  filter: PTPackageManagementFilter,
) {
  if (filter === "all") return true;
  if (filter === "draft") return pkg.status === "draft";
  if (filter === "archived") return pkg.status === "archived";
  if (filter === "public") return pkg.status === "active" && pkg.isPublic;
  return pkg.status === "active" && !pkg.isPublic;
}

export function filterPackagesForManagement(
  packages: PTPackage[],
  filter: PTPackageManagementFilter,
) {
  return packages.filter((pkg) =>
    packageMatchesManagementFilter(pkg, filter),
  );
}

export function splitPackagesByLifecycle(packages: PTPackage[]) {
  const archived: PTPackage[] = [];
  const reorderable: PTPackage[] = [];

  for (const pkg of packages) {
    if (pkg.status === "archived") {
      archived.push(pkg);
      continue;
    }
    reorderable.push(pkg);
  }

  return { archived, reorderable };
}

export function getReorderedNonArchivedPackageIds(params: {
  packages: PTPackage[];
  packageId: string;
  direction: "up" | "down";
}) {
  const reorderable = params.packages.filter((pkg) => pkg.status !== "archived");
  const currentIndex = reorderable.findIndex((pkg) => pkg.id === params.packageId);
  if (currentIndex < 0) return null;

  const targetIndex =
    params.direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= reorderable.length) return null;

  const reordered = [...reorderable];
  const [moved] = reordered.splice(currentIndex, 1);
  if (!moved) return null;
  reordered.splice(targetIndex, 0, moved);
  return reordered.map((pkg) => pkg.id);
}

export function summarizePackageDisplayStates(packages: PTPackage[]) {
  const summary: Record<PTPackageDisplayState, number> = {
    Draft: 0,
    "Active • Hidden": 0,
    "Active • Public": 0,
    Archived: 0,
  };

  for (const pkg of packages) {
    summary[getPackageDisplayState(pkg)] += 1;
  }

  return ([
    "Draft",
    "Active • Hidden",
    "Active • Public",
    "Archived",
  ] as const).map((label) => ({
    label,
    count: summary[label],
  }));
}
