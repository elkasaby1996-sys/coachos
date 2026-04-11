import type { PTLead } from "../types";

export const LEAD_PACKAGE_FILTER_ALL = "__all__";
export const LEAD_PACKAGE_FILTER_NO_SELECTION = "__none__";
const LEAD_PACKAGE_FILTER_LABEL_PREFIX = "label:";

export type LeadPackageFilterValue =
  | typeof LEAD_PACKAGE_FILTER_ALL
  | typeof LEAD_PACKAGE_FILTER_NO_SELECTION
  | `${typeof LEAD_PACKAGE_FILTER_LABEL_PREFIX}${string}`;

type LeadPackageContextInput = Pick<
  PTLead,
  "packageInterestLabelSnapshot" | "packageInterest"
>;

export type LeadPackagePrimarySource = "snapshot" | "legacy" | "none";

export type LeadPackagePrimaryContext = {
  label: string | null;
  source: LeadPackagePrimarySource;
};

export type LeadPackageFilterOption = {
  value: LeadPackageFilterValue;
  label: string;
  count: number;
};

function normalizeLeadPackageLabel(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export function getLeadPrimaryPackageContext(
  lead: LeadPackageContextInput,
): LeadPackagePrimaryContext {
  const snapshotLabel = normalizeLeadPackageLabel(
    lead.packageInterestLabelSnapshot,
  );
  if (snapshotLabel) {
    return {
      label: snapshotLabel,
      source: "snapshot",
    };
  }

  const legacyLabel = normalizeLeadPackageLabel(lead.packageInterest);
  if (legacyLabel) {
    return {
      label: legacyLabel,
      source: "legacy",
    };
  }

  return {
    label: null,
    source: "none",
  };
}

export function getLeadPrimaryPackageLabel(lead: LeadPackageContextInput) {
  return getLeadPrimaryPackageContext(lead).label;
}

export function leadHasNoPackageSelection(lead: LeadPackageContextInput) {
  return getLeadPrimaryPackageLabel(lead) === null;
}

function toPackageLabelFilterValue(label: string): LeadPackageFilterValue {
  return `${LEAD_PACKAGE_FILTER_LABEL_PREFIX}${encodeURIComponent(
    label,
  )}` as LeadPackageFilterValue;
}

function parsePackageLabelFilterValue(filterValue: string) {
  if (!filterValue.startsWith(LEAD_PACKAGE_FILTER_LABEL_PREFIX)) return null;
  const encodedLabel = filterValue.slice(LEAD_PACKAGE_FILTER_LABEL_PREFIX.length);
  if (!encodedLabel) return null;
  try {
    return normalizeLeadPackageLabel(decodeURIComponent(encodedLabel));
  } catch {
    return null;
  }
}

export function deriveLeadPackageFilterOptions(
  leads: LeadPackageContextInput[],
): LeadPackageFilterOption[] {
  const countsByLabel = new Map<string, number>();
  let noPackageCount = 0;

  for (const lead of leads) {
    const primaryLabel = getLeadPrimaryPackageLabel(lead);
    if (!primaryLabel) {
      noPackageCount += 1;
      continue;
    }
    countsByLabel.set(primaryLabel, (countsByLabel.get(primaryLabel) ?? 0) + 1);
  }

  const labelOptions = [...countsByLabel.entries()]
    .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
    .map(([label, count]) => ({
      value: toPackageLabelFilterValue(label),
      label,
      count,
    }));

  return [
    {
      value: LEAD_PACKAGE_FILTER_ALL,
      label: "All packages",
      count: leads.length,
    },
    ...labelOptions,
    {
      value: LEAD_PACKAGE_FILTER_NO_SELECTION,
      label: "No package selected",
      count: noPackageCount,
    },
  ];
}

export function filterLeadsByPackageContext<TLead extends LeadPackageContextInput>(
  leads: TLead[],
  filterValue: LeadPackageFilterValue,
) {
  if (filterValue === LEAD_PACKAGE_FILTER_ALL) return leads;
  if (filterValue === LEAD_PACKAGE_FILTER_NO_SELECTION) {
    return leads.filter((lead) => leadHasNoPackageSelection(lead));
  }

  const selectedLabel = parsePackageLabelFilterValue(filterValue);
  if (!selectedLabel) return leads;

  return leads.filter(
    (lead) => getLeadPrimaryPackageLabel(lead) === selectedLabel,
  );
}
