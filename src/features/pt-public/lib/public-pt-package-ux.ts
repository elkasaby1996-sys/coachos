import type { PTPublicPackageOption } from "../../pt-hub/types";

export function shouldRenderPublicPackagesSection(
  packageOptions: PTPublicPackageOption[],
) {
  return packageOptions.length > 0;
}

export function getPublicPackageFeatureBullets(
  packageOption: PTPublicPackageOption,
) {
  const normalizedFeatures =
    packageOption.features
      ?.map((feature) => feature.trim())
      .filter(Boolean)
      .slice(0, 4) ?? [];

  if (normalizedFeatures.length >= 2) {
    return normalizedFeatures;
  }

  const fallbackBullets = (packageOption.description ?? "")
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[-*\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);

  return fallbackBullets;
}

export function resolvePublicPackageSelection(params: {
  packageOptions: PTPublicPackageOption[];
  currentPackageId: string;
  requestedPackageId?: string | null;
}) {
  const requestedPackageId = params.requestedPackageId?.trim() || "";
  const currentPackageId = params.currentPackageId.trim();
  const hasPackages = params.packageOptions.length > 0;

  if (!hasPackages) {
    return {
      packageInterestId: "",
      packageInterestLabelSnapshot: "",
      selectedLabel: null as string | null,
      notice: null as string | null,
    };
  }

  const targetPackageId = requestedPackageId || currentPackageId;
  if (!targetPackageId) {
    return {
      packageInterestId: "",
      packageInterestLabelSnapshot: "",
      selectedLabel: null as string | null,
      notice: null as string | null,
    };
  }

  const matchingOption = params.packageOptions.find(
    (option) => option.id === targetPackageId,
  );

  if (!matchingOption) {
    return {
      packageInterestId: "",
      packageInterestLabelSnapshot: "",
      selectedLabel: null as string | null,
      notice:
        "The package you selected is no longer available. Please choose another option or continue without one.",
    };
  }

  return {
    packageInterestId: matchingOption.id,
    packageInterestLabelSnapshot: matchingOption.label,
    selectedLabel: matchingOption.label,
    notice: null as string | null,
  };
}
