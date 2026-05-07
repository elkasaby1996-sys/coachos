import { describe, expect, it } from "vitest";
import {
  deriveLeadPackageFilterOptions,
  filterLeadsByPackageContext,
  getLeadPrimaryPackageContext,
  getLeadPrimaryPackageLabel,
  LEAD_PACKAGE_FILTER_NO_SELECTION,
  leadHasNoPackageSelection,
} from "../../src/features/pt-hub/lib/pt-hub-lead-package-context";

type LeadPackageFixture = {
  id: string;
  packageInterestLabelSnapshot: string | null;
  packageInterest: string | null;
};

function createLead(
  id: string,
  values: Partial<Omit<LeadPackageFixture, "id">>,
): LeadPackageFixture {
  return {
    id,
    packageInterestLabelSnapshot: values.packageInterestLabelSnapshot ?? null,
    packageInterest: values.packageInterest ?? null,
  };
}

describe("pt hub lead package context helper", () => {
  it("uses snapshot label as the primary package value", () => {
    const lead = createLead("lead-1", {
      packageInterestLabelSnapshot: "Strength Accelerator",
      packageInterest: "Legacy Starter",
    });

    expect(getLeadPrimaryPackageContext(lead)).toEqual({
      label: "Strength Accelerator",
      source: "snapshot",
    });
    expect(getLeadPrimaryPackageLabel(lead)).toBe("Strength Accelerator");
  });

  it("keeps historical snapshot label even if legacy/current text differs", () => {
    const renamedLead = createLead("lead-rename", {
      packageInterestLabelSnapshot: "Strength Build",
      packageInterest: "Strength Build v2",
    });

    expect(getLeadPrimaryPackageLabel(renamedLead)).toBe("Strength Build");
  });

  it("detects no-package leads cleanly", () => {
    const noPackageLead = createLead("lead-2", {});

    expect(leadHasNoPackageSelection(noPackageLead)).toBe(true);
    expect(getLeadPrimaryPackageContext(noPackageLead)).toEqual({
      label: null,
      source: "none",
    });
  });

  it("falls back to legacy package_interest only when snapshot is absent", () => {
    const legacyLead = createLead("lead-3", {
      packageInterest: "Legacy Recomp Package",
    });

    expect(getLeadPrimaryPackageContext(legacyLead)).toEqual({
      label: "Legacy Recomp Package",
      source: "legacy",
    });
  });

  it("derives filter options from lead-stored historical labels", () => {
    const leads = [
      createLead("lead-1", { packageInterestLabelSnapshot: "Strength Build" }),
      createLead("lead-2", { packageInterestLabelSnapshot: "Strength Build" }),
      createLead("lead-3", { packageInterestLabelSnapshot: "Nutrition Reset" }),
      createLead("lead-4", {}),
    ];

    const options = deriveLeadPackageFilterOptions(leads);
    const optionLabels = options.map((option) => option.label);

    expect(optionLabels).toEqual([
      "All packages",
      "Nutrition Reset",
      "Strength Build",
      "No package selected",
    ]);
    expect(
      options.find((option) => option.label === "Strength Build")?.count,
    ).toBe(2);
    expect(
      options.find((option) => option.label === "No package selected")?.count,
    ).toBe(1);
  });

  it("filters leads by a specific historical package label", () => {
    const leads = [
      createLead("lead-1", { packageInterestLabelSnapshot: "Strength Build" }),
      createLead("lead-2", { packageInterestLabelSnapshot: "Nutrition Reset" }),
      createLead("lead-3", { packageInterest: "Strength Build" }),
    ];
    const options = deriveLeadPackageFilterOptions(leads);
    const strengthFilter = options.find(
      (option) => option.label === "Strength Build",
    );

    expect(strengthFilter).toBeTruthy();
    const filtered = filterLeadsByPackageContext(
      leads,
      strengthFilter!.value,
    ).map((lead) => lead.id);
    expect(filtered).toEqual(["lead-1", "lead-3"]);
  });

  it("filters leads with no selected package", () => {
    const leads = [
      createLead("lead-1", { packageInterestLabelSnapshot: "Strength Build" }),
      createLead("lead-2", {}),
    ];

    const filtered = filterLeadsByPackageContext(
      leads,
      LEAD_PACKAGE_FILTER_NO_SELECTION,
    ).map((lead) => lead.id);
    expect(filtered).toEqual(["lead-2"]);
  });
});
