import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChevronRight, MessageSquarePlus, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { PtHubLeadStatusBadge } from "../../features/pt-hub/components/pt-hub-lead-status-badge";
import { ptHubLeadStatuses } from "../../features/pt-hub/components/pt-hub-lead-statuses";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import {
  deriveLeadPackageFilterOptions,
  filterLeadsByPackageContext,
  getLeadPrimaryPackageLabel,
  LEAD_PACKAGE_FILTER_ALL,
  type LeadPackageFilterValue,
} from "../../features/pt-hub/lib/pt-hub-lead-package-context";
import { usePtHubLeads } from "../../features/pt-hub/lib/pt-hub";
import type { PTLeadStatus } from "../../features/pt-hub/types";
import { formatRelativeTime } from "../../lib/relative-time";
import {
  getSemanticToneClasses,
  type SemanticTone,
} from "../../lib/semantic-status";

type LeadStatusFilter = PTLeadStatus | "all" | "approved_group";

const statusOptions: LeadStatusFilter[] = [
  "all",
  ...ptHubLeadStatuses,
  "approved_group",
];

const statusOptionLabels: Record<LeadStatusFilter, string> = {
  all: "All",
  new: "New",
  contacted: "Contacted",
  approved_pending_workspace: "Approved pending workspace",
  converted: "Converted",
  declined: "Declined",
  approved_group: "Approved or converted",
};

const leadStatusTone: Record<PTLeadStatus, SemanticTone> = {
  new: "warning",
  contacted: "info",
  approved_pending_workspace: "warning",
  converted: "success",
  declined: "danger",
};

export function PtHubLeadsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const leadsQuery = usePtHubLeads();
  const [searchValue, setSearchValue] = useState(
    () => searchParams.get("search") ?? "",
  );
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>(() => {
    const status = searchParams.get("status");
    if (!status) return "all";
    return statusOptions.includes(status as LeadStatusFilter)
      ? (status as LeadStatusFilter)
      : "all";
  });
  const [packageFilterValue, setPackageFilterValue] =
    useState<LeadPackageFilterValue>(
      () =>
        (searchParams.get("package") as LeadPackageFilterValue | null) ??
        LEAD_PACKAGE_FILTER_ALL,
    );
  const deferredSearchValue = useDeferredValue(searchValue);
  const attentionFilter = searchParams.get("attention");

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const packageFilterOptions = useMemo(
    () => deriveLeadPackageFilterOptions(leads),
    [leads],
  );
  const filteredLeads = useMemo(() => {
    const packageFilteredLeads = filterLeadsByPackageContext(
      leads,
      packageFilterValue,
    );
    const normalizedSearch = deferredSearchValue.trim().toLowerCase();
    const now = Date.now();
    return packageFilteredLeads.filter((lead) => {
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "approved_group"
            ? ["approved_pending_workspace", "converted"].includes(lead.status)
            : lead.status === statusFilter;
      const haystack = [
        lead.fullName,
        lead.email ?? "",
        lead.phone ?? "",
        getLeadPrimaryPackageLabel(lead) ?? "",
        lead.leadLastMessagePreview ?? "",
        lead.notesPreview ?? "",
        lead.sourceLabel,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = normalizedSearch
        ? haystack.includes(normalizedSearch)
        : true;
      const submittedAt = new Date(lead.submittedAt).getTime();
      const matchesAttention =
        attentionFilter === "waiting24h"
          ? lead.status === "new" &&
            !Number.isNaN(submittedAt) &&
            now - submittedAt >= 1000 * 60 * 60 * 24
          : true;
      return matchesStatus && matchesSearch && matchesAttention;
    });
  }, [
    attentionFilter,
    deferredSearchValue,
    leads,
    packageFilterValue,
    statusFilter,
  ]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (deferredSearchValue.trim()) {
      nextParams.set("search", deferredSearchValue.trim());
    }
    if (statusFilter !== "all") {
      nextParams.set("status", statusFilter);
    }
    if (packageFilterValue !== LEAD_PACKAGE_FILTER_ALL) {
      nextParams.set("package", packageFilterValue);
    }
    if (attentionFilter === "waiting24h" && statusFilter === "new") {
      nextParams.set("attention", "waiting24h");
    }
    setSearchParams(nextParams, { replace: true });
  }, [
    attentionFilter,
    deferredSearchValue,
    packageFilterValue,
    setSearchParams,
    statusFilter,
  ]);

  const stats = useMemo(
    () => ({
      total: leads.length,
      fresh: leads.filter((lead) => lead.status === "new").length,
      activePipeline: leads.filter((lead) =>
        ["contacted", "approved_pending_workspace"].includes(lead.status),
      ).length,
      converted: leads.filter((lead) => lead.status === "converted").length,
    }),
    [leads],
  );

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="Leads"
        title="Review new inquiries"
        description='See "Apply to Work With Me" submissions and decide who to follow up with next.'
      />

      <div className="page-kpi-block grid gap-4 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Total Leads"
          value={stats.total}
          helper="All inquiries in PT Hub"
          icon={MessageSquarePlus}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="New"
          value={stats.fresh}
          helper="Waiting for review"
        />
        <StatCard
          surface="pt-hub"
          label="In Progress"
          value={stats.activePipeline}
          helper="Contacted or awaiting workspace"
        />
        <StatCard
          surface="pt-hub"
          label="Converted"
          value={stats.converted}
          helper="Approved and assigned"
        />
      </div>

      <PtHubSectionCard
        title="Lead Pipeline"
        description="Search, filter, and open any inquiry."
        contentClassName="space-y-6"
      >
        <div className="rounded-[24px] border border-border/70 bg-background/55 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="app-search-icon h-4 w-4" />
              <Input
                className="app-search-input"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search lead name or package"
              />
            </div>
            <div className="w-full lg:w-[220px] lg:flex-none">
              <Select
                size="sm"
                className="w-full"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as LeadStatusFilter)
                }
                aria-label="Filter by lead status"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusOptionLabels[status]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full lg:w-[240px] lg:flex-none">
              <Select
                size="sm"
                className="w-full"
                value={packageFilterValue}
                onChange={(event) =>
                  setPackageFilterValue(
                    event.target.value as LeadPackageFilterValue,
                  )
                }
                aria-label="Filter by package interest"
              >
                {packageFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {filteredLeads.length === 0 ? (
          <EmptyState
            title="No leads found"
            description={
              leads.length === 0
                ? "New inquiries will appear here when someone applies to work with you."
                : "No leads match the current filters."
            }
            icon={<MessageSquarePlus className="h-5 w-5 [stroke-width:1.7]" />}
          />
        ) : (
          <div className="space-y-2 rounded-[30px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.82),oklch(var(--bg-surface)/0.74))] p-2">
            <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_160px_170px] gap-4 rounded-[22px] border border-border/60 bg-background/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid">
              <span>Lead</span>
              <span>Package</span>
              <span>Submitted</span>
              <span>Status</span>
            </div>
            <div className="space-y-2">
              {filteredLeads.map((lead) => {
                const packageLabel = getLeadPrimaryPackageLabel(lead);
                const statusMarkerTone = getSemanticToneClasses(
                  leadStatusTone[lead.status],
                ).marker;
                return (
                  <button
                    key={lead.id}
                    type="button"
                    className="relative grid w-full gap-4 rounded-[24px] border border-transparent bg-background/55 px-5 py-4 text-left transition-colors hover:border-primary/18 hover:bg-background/75 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_160px_170px] lg:items-center"
                    onClick={() => navigate(`/pt-hub/leads/${lead.id}`)}
                  >
                    <span
                      aria-hidden
                      className={`absolute bottom-4 left-1 top-4 w-[2px] rounded-full ${statusMarkerTone}`}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {lead.fullName}
                      </p>
                    </div>

                    <div>
                      {packageLabel ? (
                        <p className="text-sm text-foreground">
                          {packageLabel}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No package selected
                        </p>
                      )}
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>
                        {formatRelativeTime(
                          lead.leadLastMessageAt ?? lead.submittedAt,
                        )}
                      </p>
                      <p className="text-xs">Submitted</p>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      {lead.leadUnreadCount > 0 ? (
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {lead.leadUnreadCount} unread
                        </span>
                      ) : null}
                      <PtHubLeadStatusBadge status={lead.status} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground [stroke-width:1.7]" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </PtHubSectionCard>
    </section>
  );
}
