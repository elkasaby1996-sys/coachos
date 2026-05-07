import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MessageSquarePlus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
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
import {
  updatePtHubLeadStatus,
  usePtHubLeads,
} from "../../features/pt-hub/lib/pt-hub";
import type { PTLeadStatus } from "../../features/pt-hub/types";
import { formatRelativeTime } from "../../lib/relative-time";
import {
  getSemanticToneClasses,
  type SemanticTone,
} from "../../lib/semantic-status";

type LeadStatusFilter =
  | PTLeadStatus
  | "all"
  | "active_pipeline"
  | "approved_group";
type LeadTriageFilter = "all" | "new" | "waiting24h" | "unread";

const statusOptions: LeadStatusFilter[] = [
  "all",
  "active_pipeline",
  ...ptHubLeadStatuses,
  "approved_group",
];

const statusOptionLabels: Record<LeadStatusFilter, string> = {
  all: "All",
  active_pipeline: "Active pipeline",
  new: "New",
  contacted: "Contacted",
  approved_pending_workspace: "Approved pending workspace",
  converted: "Converted",
  declined: "Declined",
  approved_group: "Approved or converted",
};

const triageFilterLabels: Record<LeadTriageFilter, string> = {
  all: "All triage",
  new: "New",
  waiting24h: "Waiting 24h",
  unread: "Unread",
};

const triageFilterOptions = ["new", "waiting24h", "unread"] satisfies Array<
  Exclude<LeadTriageFilter, "all">
>;

const leadStatusTone: Record<PTLeadStatus, SemanticTone> = {
  new: "warning",
  contacted: "info",
  approved_pending_workspace: "warning",
  converted: "success",
  declined: "danger",
};

const leadPipelineGridClass =
  "lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.75fr)_140px_minmax(260px,auto)]";

function PtHubLeadListSkeleton() {
  return (
    <div
      className="pt-hub-data-shell p-2"
      aria-label="Loading leads"
      aria-busy="true"
    >
      <p className="sr-only">Loading leads...</p>
      <div
        className={`hidden gap-4 rounded-[14px] border border-border/60 bg-background/60 px-5 py-3 lg:grid ${leadPipelineGridClass}`}
      >
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="mt-2 divide-y divide-border/45 overflow-hidden rounded-[14px] border border-border/50 bg-background/35">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={`grid gap-4 px-4 py-4 lg:items-center ${leadPipelineGridClass}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-4 w-40 max-w-full" />
            </div>
            <Skeleton className="h-4 w-36 max-w-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex items-center gap-3 lg:justify-end">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PtHubLeadListErrorState({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-[22px] border border-destructive/20 bg-destructive/5 p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            Unable to load leads
          </h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Lead data did not come through. Try again before assuming the
            pipeline is empty.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw
            className={`h-4 w-4 [stroke-width:1.7] ${
              isRetrying ? "animate-spin" : ""
            }`}
          />
          {isRetrying ? "Retrying..." : "Try again"}
        </Button>
      </div>
    </div>
  );
}

export function PtHubLeadsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const leadsQuery = usePtHubLeads();
  const [leadStatusActionById, setLeadStatusActionById] = useState<
    Record<string, "saving" | "error">
  >({});
  const [triageActionMessage, setTriageActionMessage] = useState<string | null>(
    null,
  );
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
  const [triageFilter, setTriageFilter] = useState<LeadTriageFilter>(() => {
    const triage = searchParams.get("triage");
    return triage === "new" || triage === "waiting24h" || triage === "unread"
      ? triage
      : "all";
  });
  const deferredSearchValue = useDeferredValue(searchValue);

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
          : statusFilter === "active_pipeline"
            ? ["contacted", "approved_pending_workspace"].includes(lead.status)
            : statusFilter === "approved_group"
              ? ["approved_pending_workspace", "converted"].includes(
                  lead.status,
                )
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
      const isWaiting24h =
        lead.status === "new" &&
        !Number.isNaN(submittedAt) &&
        now - submittedAt >= 1000 * 60 * 60 * 24;
      const matchesTriage =
        triageFilter === "all"
          ? true
          : triageFilter === "new"
            ? lead.status === "new"
            : triageFilter === "waiting24h"
              ? isWaiting24h
              : lead.leadUnreadCount > 0;
      return matchesStatus && matchesSearch && matchesTriage;
    });
  }, [
    deferredSearchValue,
    leads,
    packageFilterValue,
    statusFilter,
    triageFilter,
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
    if (triageFilter !== "all") {
      nextParams.set("triage", triageFilter);
    }
    setSearchParams(nextParams, { replace: true });
  }, [
    deferredSearchValue,
    packageFilterValue,
    setSearchParams,
    statusFilter,
    triageFilter,
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
  const triageCounts = useMemo(() => {
    const now = Date.now();
    return {
      new: leads.filter((lead) => lead.status === "new").length,
      waiting24h: leads.filter((lead) => {
        const submittedAt = new Date(lead.submittedAt).getTime();
        return (
          lead.status === "new" &&
          !Number.isNaN(submittedAt) &&
          now - submittedAt >= 1000 * 60 * 60 * 24
        );
      }).length,
      unread: leads.filter((lead) => lead.leadUnreadCount > 0).length,
    };
  }, [leads]);
  const hasActiveFilters =
    searchValue.trim().length > 0 ||
    statusFilter !== "all" ||
    packageFilterValue !== LEAD_PACKAGE_FILTER_ALL ||
    triageFilter !== "all";
  const isInitialLeadsLoading = leadsQuery.isLoading;
  const isRefreshingLeads =
    leadsQuery.isFetching && !isInitialLeadsLoading && !leadsQuery.isError;
  const showErrorState = leadsQuery.isError && leads.length === 0;
  const showRefreshError = leadsQuery.isError && leads.length > 0;
  const showEmptyState =
    !isInitialLeadsLoading && !showErrorState && filteredLeads.length === 0;
  const leadKpiMetrics = [
    {
      label: "Needs response",
      value: triageCounts.waiting24h + triageCounts.unread,
      detail: "Waiting 24h or unread",
      icon: Clock3,
      accent: true,
    },
    {
      label: "New leads",
      value: stats.fresh,
      detail: "Unreviewed applications",
      icon: MessageSquarePlus,
      iconClassName: "text-[var(--state-warning-text)]",
    },
    {
      label: "Active pipeline",
      value: stats.activePipeline,
      detail: "Contacted or approved",
      icon: Activity,
      iconClassName: "text-[var(--state-info-text)]",
    },
    {
      label: "Converted",
      value: stats.converted,
      detail: "Assigned clients",
      icon: CheckCircle2,
      iconClassName: "text-[var(--state-success-text)]",
    },
  ];

  const resetFilters = () => {
    setSearchValue("");
    setStatusFilter("all");
    setPackageFilterValue(LEAD_PACKAGE_FILTER_ALL);
    setTriageFilter("all");
  };

  const handleMarkContacted = async (leadId: string) => {
    setLeadStatusActionById((current) => ({
      ...current,
      [leadId]: "saving",
    }));
    setTriageActionMessage(null);

    try {
      await updatePtHubLeadStatus({ leadId, status: "contacted" });
      await queryClient.invalidateQueries({ queryKey: ["pt-hub-leads"] });
      setLeadStatusActionById((current) => {
        const next = { ...current };
        delete next[leadId];
        return next;
      });
      setTriageActionMessage("Lead marked contacted.");
    } catch {
      setLeadStatusActionById((current) => ({
        ...current,
        [leadId]: "error",
      }));
      setTriageActionMessage("Could not mark lead contacted. Try again.");
    }
  };

  return (
    <section className="pt-hub-page-stack">
      <PtHubPageHeader
        eyebrow="Leads"
        title="Review new inquiries"
        description='See "Apply to Work With Me" submissions and decide who to follow up with next.'
      />

      <div
        className="page-kpi-block pt-hub-kpi-grid"
        data-columns="4"
        aria-label="Lead intake summary"
      >
        {leadKpiMetrics.map((metric) => (
          <StatCard
            key={metric.label}
            surface="pt-hub"
            module="leads"
            label={metric.label}
            value={metric.value}
            helper={metric.detail}
            icon={metric.icon}
            iconClassName={metric.iconClassName}
            accent={metric.accent}
          />
        ))}
      </div>

      <PtHubSectionCard
        title="Lead Pipeline"
        description="Search, filter, and open the next inquiry to review."
        contentClassName="space-y-5"
      >
        <div className="app-filter-grid pt-hub-management-toolbar pt-hub-leads-filter-toolbar">
          <div className="space-y-1.5">
            <label
              htmlFor="lead-search-filter"
              className="text-xs font-medium text-muted-foreground"
            >
              Search
            </label>
            <div className="app-filter-search relative min-w-0">
              <Search className="app-search-icon h-4 w-4" />
              <Input
                id="lead-search-filter"
                className="app-search-input"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="e.g. Sara or 8-week strength"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="lead-triage-filter"
              className="text-xs font-medium text-muted-foreground"
            >
              Triage
            </label>
            <Select
              id="lead-triage-filter"
              size="sm"
              variant="filter"
              className="app-filter-control"
              value={triageFilter}
              onChange={(event) =>
                setTriageFilter(event.target.value as LeadTriageFilter)
              }
            >
              <option value="all">{triageFilterLabels.all}</option>
              {triageFilterOptions.map((filter) => (
                <option key={filter} value={filter}>
                  {triageFilterLabels[filter]} ({triageCounts[filter]})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="lead-status-filter"
              className="text-xs font-medium text-muted-foreground"
            >
              Status
            </label>
            <Select
              id="lead-status-filter"
              size="sm"
              variant="filter"
              className="app-filter-control"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as LeadStatusFilter)
              }
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {statusOptionLabels[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="lead-package-filter"
              className="text-xs font-medium text-muted-foreground"
            >
              Package
            </label>
            <Select
              id="lead-package-filter"
              size="sm"
              variant="filter"
              className="app-filter-control"
              value={packageFilterValue}
              onChange={(event) =>
                setPackageFilterValue(
                  event.target.value as LeadPackageFilterValue,
                )
              }
            >
              {packageFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex h-full items-end lg:self-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 min-h-11 rounded-full border border-border/55 bg-background/45 px-4 text-xs font-semibold text-muted-foreground shadow-[inset_0_1px_0_oklch(var(--background)/0.55)] transition-colors hover:border-primary/20 hover:bg-background/70 hover:text-foreground disabled:border-border/35 disabled:bg-background/25 disabled:text-muted-foreground/45"
              aria-label="Reset lead filters"
              disabled={!hasActiveFilters}
              onClick={resetFilters}
            >
              Reset
            </Button>
          </div>
        </div>

        {isRefreshingLeads ? (
          <p
            role="status"
            aria-live="polite"
            className="text-xs font-medium text-muted-foreground"
          >
            Refreshing leads...
          </p>
        ) : null}

        {triageActionMessage ? (
          <p
            role="status"
            aria-live="polite"
            className="text-xs font-medium text-muted-foreground"
          >
            {triageActionMessage}
          </p>
        ) : null}

        {showRefreshError ? (
          <div
            role="status"
            className="rounded-[18px] border border-destructive/15 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground"
          >
            Unable to refresh leads. Showing the last loaded results.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-2 h-auto px-2 py-1 text-xs"
              onClick={() => void leadsQuery.refetch()}
              disabled={leadsQuery.isFetching}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {isInitialLeadsLoading ? (
          <PtHubLeadListSkeleton />
        ) : showErrorState ? (
          <PtHubLeadListErrorState
            isRetrying={leadsQuery.isFetching}
            onRetry={() => void leadsQuery.refetch()}
          />
        ) : showEmptyState ? (
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
          <div className="pt-hub-data-shell p-2">
            <div
              className={`hidden gap-4 rounded-[14px] border border-border/60 bg-background/60 px-5 py-3 text-xs font-semibold normal-case tracking-normal text-muted-foreground lg:grid ${leadPipelineGridClass}`}
            >
              <span>Lead</span>
              <span>Package</span>
              <span>Submitted</span>
              <span>Status / Action</span>
            </div>
            <div className="mt-2 divide-y divide-border/45 overflow-hidden rounded-[14px] border border-border/45 bg-background/35">
              {filteredLeads.map((lead) => {
                const packageLabel = getLeadPrimaryPackageLabel(lead);
                const statusMarkerTone = getSemanticToneClasses(
                  leadStatusTone[lead.status],
                ).marker;
                const statusActionState = leadStatusActionById[lead.id];
                return (
                  <div
                    key={lead.id}
                    data-lead-review-row=""
                    className={`group grid w-full cursor-pointer gap-4 px-4 py-4 text-left transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-background/70 lg:items-center ${leadPipelineGridClass}`}
                    onClick={() => navigate(`/pt-hub/leads/${lead.id}`)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={`pt-hub-row-status-dot ${statusMarkerTone} transition-colors group-hover:bg-[var(--module-leads-bg-soft)]`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {lead.fullName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lead.email ?? lead.phone ?? lead.sourceLabel}
                        </p>
                      </div>
                    </div>

                    <div>
                      {packageLabel ? (
                        <p className="text-sm font-medium text-foreground">
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

                    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                      {lead.leadUnreadCount > 0 ? (
                        <span className="rounded-[8px] border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {lead.leadUnreadCount} unread
                        </span>
                      ) : null}
                      <PtHubLeadStatusBadge status={lead.status} />
                      {lead.status === "new" ? (
                        <button
                          type="button"
                          className="rounded-[10px] border border-border/70 bg-background/75 px-3 py-1.5 text-xs font-semibold text-foreground shadow-[inset_0_1px_0_oklch(var(--background)/0.7)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-primary/20 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={statusActionState === "saving"}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMarkContacted(lead.id);
                          }}
                        >
                          {statusActionState === "saving"
                            ? "Marking..."
                            : "Mark contacted"}
                        </button>
                      ) : null}
                      {statusActionState === "error" ? (
                        <span className="text-xs font-medium text-destructive">
                          Retry failed
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex rounded-[10px] border border-border/70 bg-background/75 px-3 py-1.5 text-xs font-semibold text-foreground shadow-[inset_0_1px_0_oklch(var(--background)/0.7)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-primary/20 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/pt-hub/leads/${lead.id}`);
                        }}
                      >
                        {lead.status === "converted" ? "View" : "Review"}
                      </button>
                      <ChevronRight className="h-4 w-4 text-[var(--module-leads-text)] [stroke-width:1.7]" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PtHubSectionCard>
    </section>
  );
}
