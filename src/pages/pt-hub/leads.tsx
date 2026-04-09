import { useDeferredValue, useMemo, useState } from "react";
import { ChevronRight, MessageSquarePlus, Search, UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PtHubLeadStatusBadge } from "../../features/pt-hub/components/pt-hub-lead-status-badge";
import { ptHubLeadStatuses } from "../../features/pt-hub/components/pt-hub-lead-statuses";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import { usePtHubLeads } from "../../features/pt-hub/lib/pt-hub";
import type { PTLeadStatus } from "../../features/pt-hub/types";
import { formatRelativeTime } from "../../lib/relative-time";

const statusOptions: Array<PTLeadStatus | "all"> = [
  "all",
  ...ptHubLeadStatuses,
];

export function PtHubLeadsPage() {
  const navigate = useNavigate();
  const leadsQuery = usePtHubLeads();
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<PTLeadStatus | "all">("all");
  const deferredSearchValue = useDeferredValue(searchValue);

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const filteredLeads = useMemo(() => {
    const normalizedSearch = deferredSearchValue.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesStatus =
        statusFilter === "all" ? true : lead.status === statusFilter;
      const haystack = [
        lead.fullName,
        lead.email ?? "",
        lead.phone ?? "",
        lead.goalSummary,
        lead.trainingExperience ?? "",
        lead.budgetInterest ?? "",
        lead.packageInterestLabelSnapshot ?? "",
        lead.packageInterest ?? "",
        lead.notesPreview ?? "",
        lead.sourceLabel,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = normalizedSearch
        ? haystack.includes(normalizedSearch)
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [deferredSearchValue, leads, statusFilter]);

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
        title="Lead Inbox"
        description="Search, filter, and open any inquiry."
        contentClassName="space-y-6"
      >
        <div className="rounded-[24px] border border-border/70 bg-background/55 p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="relative">
              <Search className="app-search-icon h-4 w-4" />
              <Input
                className="app-search-input"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search name, contact, goal, or notes"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={statusFilter === status ? "default" : "secondary"}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "all" ? "All" : status.replace(/_/g, " ")}
                </Button>
              ))}
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
            <div className="hidden grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_160px_150px] gap-4 rounded-[22px] border border-border/60 bg-background/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid">
              <span>Lead</span>
              <span>Goal and interest</span>
              <span>Submitted</span>
              <span>Status</span>
            </div>
            <div className="space-y-2">
              {filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className="grid w-full gap-4 rounded-[24px] border border-transparent bg-background/55 px-5 py-4 text-left transition-colors hover:border-primary/18 hover:bg-background/75 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_160px_150px] lg:items-center"
                  onClick={() => navigate(`/pt-hub/leads/${lead.id}`)}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {lead.fullName}
                      </p>
                      <span className="rounded-full border border-border/70 bg-background/72 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {lead.sourceLabel}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {lead.email || lead.phone || "No contact info"}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {lead.notesPreview || "No internal notes yet"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="line-clamp-2 text-sm text-foreground">
                      {lead.goalSummary}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lead.packageInterestLabelSnapshot ||
                        lead.packageInterest ||
                        lead.budgetInterest ||
                        "Package not specified"}
                    </p>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>{formatRelativeTime(lead.submittedAt)}</p>
                    <p className="text-xs">
                      {lead.trainingExperience || "Experience not specified"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:justify-end">
                    <PtHubLeadStatusBadge status={lead.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground [stroke-width:1.7]" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </PtHubSectionCard>
    </section>
  );
}
