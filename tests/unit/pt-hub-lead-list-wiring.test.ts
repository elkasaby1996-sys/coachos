import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("pt hub lead list package wiring", () => {
  it("uses shared helper-based package filtering and compact row package context", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain("deriveLeadPackageFilterOptions");
    expect(leadsPage).toContain("filterLeadsByPackageContext");
    expect(leadsPage).toContain('htmlFor="lead-package-filter"');
    expect(leadsPage).toContain("getLeadPrimaryPackageLabel(lead)");
    expect(leadsPage).toContain("No package selected");
  });

  it("keeps loading and error states distinct from true empty lead results", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain("leadsQuery.isLoading");
    expect(leadsPage).toContain("leadsQuery.isError");
    expect(leadsPage).toContain("leadsQuery.isFetching");
    expect(leadsPage).toContain("leadsQuery.refetch");
    expect(leadsPage).toContain("Loading leads");
    expect(leadsPage).toContain("Unable to load leads");
    expect(leadsPage).toContain("Try again");
    expect(leadsPage).toContain("showEmptyState");
    expect(leadsPage).not.toContain("{filteredLeads.length === 0 ? (");
  });

  it("keeps the lead summary before the pipeline work surface", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain("<PtHubPageHeader");
    expect(leadsPage).toContain("leadKpiMetrics");
    expect(leadsPage).toContain('aria-label="Lead intake summary"');
    expect(leadsPage).toContain("page-kpi-block pt-hub-kpi-grid");
    expect(leadsPage).toContain("<StatCard");
    expect(leadsPage.indexOf('aria-label="Lead intake summary"')).toBeLessThan(
      leadsPage.indexOf('title="Lead Pipeline"'),
    );
  });

  it("uses visible labels for lead filters instead of placeholder-only controls", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain('htmlFor="lead-search-filter"');
    expect(leadsPage).toContain('id="lead-search-filter"');
    expect(leadsPage).toContain('htmlFor="lead-triage-filter"');
    expect(leadsPage).toContain('id="lead-triage-filter"');
    expect(leadsPage).toContain('htmlFor="lead-status-filter"');
    expect(leadsPage).toContain('id="lead-status-filter"');
    expect(leadsPage).toContain('htmlFor="lead-package-filter"');
    expect(leadsPage).toContain('id="lead-package-filter"');
    expect(leadsPage).toMatch(/>\s*Search\s*</);
    expect(leadsPage).toMatch(/>\s*Triage\s*</);
    expect(leadsPage).toMatch(/>\s*Status\s*</);
    expect(leadsPage).toMatch(/>\s*Package\s*</);
    expect(leadsPage).toContain('placeholder="e.g. Sara or 8-week strength"');
    expect(leadsPage).not.toContain(
      'placeholder="Search lead name or package"',
    );
  });

  it("makes the row review action explicit while preserving full-row navigation", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain('data-lead-review-row=""');
    expect(leadsPage).toContain("Review");
    expect(leadsPage).toContain("Status / Action");
    expect(leadsPage).toContain("inline-flex rounded-[10px]");
    expect(leadsPage).toContain(
      "onClick={() => navigate(`/pt-hub/leads/${lead.id}`)}",
    );
  });

  it("adds power triage filters and a row-level mark contacted action", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain("type LeadTriageFilter");
    expect(leadsPage).toContain("triageFilterLabels");
    expect(leadsPage).toContain("lead-triage-filter");
    expect(leadsPage).toContain("Waiting 24h");
    expect(leadsPage).toContain("Unread");
    expect(leadsPage).toContain('triageFilter === "waiting24h"');
    expect(leadsPage).toContain("lead.leadUnreadCount > 0");
    expect(leadsPage).toContain("updatePtHubLeadStatus");
    expect(leadsPage).toContain("Mark contacted");
    expect(leadsPage).toContain('queryKey: ["pt-hub-leads"]');
  });

  it("keeps lead pipeline layout flat and gives row actions stable room", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain("leadPipelineGridClass");
    expect(leadsPage).toContain("minmax(260px,auto)");
    expect(leadsPage).toContain("lead-triage-filter");
    expect(leadsPage).toContain("pt-hub-leads-filter-toolbar");
    expect(leadsPage).toContain('data-columns="4"');
    expect(leadsPage).toContain('aria-label="Reset lead filters"');
    expect(leadsPage).not.toContain(
      'className="block text-xs font-medium text-transparent"',
    );
    expect(leadsPage).not.toContain(
      "rounded-[20px] border border-border/60 bg-background/45 p-3",
    );
  });

  it("uses meaningful KPI metrics instead of a command strip", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain("leadKpiMetrics");
    expect(leadsPage).toContain("Needs response");
    expect(leadsPage).toContain("New leads");
    expect(leadsPage).toContain("Active pipeline");
    expect(leadsPage).toContain("Converted");
    expect(leadsPage).toContain('surface="pt-hub"');
    expect(leadsPage).toContain('module="leads"');
    expect(leadsPage).not.toContain("leadCommandMetrics");
    expect(leadsPage).not.toContain('aria-label="Power triage filters"');
    expect(leadsPage).not.toContain("border-l border-border/65 pl-3");
    expect(leadsPage).not.toContain("Response command");
    expect(leadsPage).not.toContain("leadSummaryCounters");
    expect(leadsPage).not.toContain(
      "shadow-[0_24px_80px_oklch(var(--foreground)/0.08)]",
    );
  });

  it("uses a flatter operational table instead of nested row cards", () => {
    const leadsPage = readSource("src/pages/pt-hub/leads.tsx");

    expect(leadsPage).toContain("divide-y divide-border/45");
    expect(leadsPage).toContain("rounded-[14px]");
    expect(leadsPage).toContain("group-hover:bg-[var(--module-leads-bg-soft)]");
    expect(leadsPage).not.toContain(
      "bg-[linear-gradient(135deg,oklch(var(--background)/0.78)",
    );
    expect(leadsPage).not.toContain(
      "hover:shadow-[0_14px_38px_oklch(var(--foreground)/0.055)]",
    );
  });
});
