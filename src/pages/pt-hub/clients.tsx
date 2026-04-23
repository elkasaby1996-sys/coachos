import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { PtHubClientTable } from "../../features/pt-hub/components/pt-hub-client-table";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import {
  usePtHubClientStats,
  usePtHubClientsPage,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import type { PTClientSummary } from "../../features/pt-hub/types";
import { type ClientSegmentKey } from "../../lib/client-lifecycle";
import { useI18n } from "../../lib/i18n";
import { useWorkspace } from "../../lib/use-workspace";

export function PtHubClientsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { switchWorkspace } = useWorkspace();
  const statsQuery = usePtHubClientStats();
  const workspacesQuery = usePtHubWorkspaces();
  const [searchValue, setSearchValue] = useState(
    () => searchParams.get("search") ?? "",
  );
  const [workspaceFilter, setWorkspaceFilter] = useState<string>(
    () => searchParams.get("workspace") ?? "all",
  );
  const [lifecycleFilter, setLifecycleFilter] = useState<string>(
    () => searchParams.get("lifecycle") ?? "all",
  );
  const [segmentFilter, setSegmentFilter] = useState<ClientSegmentKey>(() => {
    const value = searchParams.get("segment");
    return value === "onboarding_incomplete" ||
      value === "checkin_overdue" ||
      value === "at_risk" ||
      value === "paused"
      ? value
      : "all";
  });
  const [page, setPage] = useState(0);
  const deferredSearchValue = useDeferredValue(searchValue);
  const clientsQuery = usePtHubClientsPage({
    page,
    pageSize: 25,
    workspaceId: workspaceFilter,
    lifecycle: lifecycleFilter,
    segment: segmentFilter,
    search: deferredSearchValue,
  });

  const workspaces = useMemo(
    () => workspacesQuery.data ?? [],
    [workspacesQuery.data],
  );
  const clients = clientsQuery.data?.clients ?? [];
  const stats = statsQuery.data;
  const totalCount = clientsQuery.data?.totalCount ?? 0;
  const pageSize = clientsQuery.data?.pageSize ?? 25;
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd =
    totalCount === 0 ? 0 : Math.min((page + 1) * pageSize, totalCount);
  const isTableLoading =
    clientsQuery.isLoading || (clientsQuery.isFetching && !clientsQuery.data);
  const isEmpty = totalCount === 0;
  const hasAnyClients = (stats?.totalClients ?? 0) > 0;

  useEffect(() => {
    setPage(0);
  }, [deferredSearchValue, lifecycleFilter, segmentFilter, workspaceFilter]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (deferredSearchValue.trim()) {
      nextParams.set("search", deferredSearchValue.trim());
    }
    if (workspaceFilter !== "all") {
      nextParams.set("workspace", workspaceFilter);
    }
    if (lifecycleFilter !== "all") {
      nextParams.set("lifecycle", lifecycleFilter);
    }
    if (segmentFilter !== "all") {
      nextParams.set("segment", segmentFilter);
    }
    setSearchParams(nextParams, { replace: true });
  }, [
    deferredSearchValue,
    lifecycleFilter,
    segmentFilter,
    setSearchParams,
    workspaceFilter,
  ]);

  const openClientWorkspace = (client: PTClientSummary) => {
    switchWorkspace(client.workspaceId);
    navigate(`/pt/clients/${client.id}`);
  };

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow={t("ptHub.clients.eyebrow", "Clients")}
        title={t("ptHub.clients.title", "Manage your clients")}
        description={t(
          "ptHub.clients.description",
          "View every client across your coaching spaces.",
        )}
        actions={
          <InviteClientDialog
            trigger={
              <Button variant="secondary">
                {t("ptHub.clients.invite", "Invite client")}
              </Button>
            }
          />
        }
      />

      <div className="page-kpi-block grid gap-4 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label={t("ptHub.clients.kpi.total", "Total Clients")}
          value={stats?.totalClients ?? 0}
          helper={t(
            "ptHub.clients.kpi.totalHelper",
            "Across all coaching spaces",
          )}
          icon={UsersRound}
          accent
        />
        <StatCard
          surface="pt-hub"
          label={t("ptHub.clients.kpi.active", "Active")}
          value={stats?.activeClients ?? 0}
          helper={t("ptHub.clients.kpi.activeHelper", "Currently in training")}
        />
        <StatCard
          surface="pt-hub"
          label={t("ptHub.clients.kpi.atRisk", "At Risk")}
          value={stats?.atRiskClients ?? 0}
          helper={t("ptHub.clients.kpi.atRiskHelper", "Needs your attention")}
        />
        <StatCard
          surface="pt-hub"
          label={t("ptHub.clients.kpi.paused", "Paused")}
          value={stats?.pausedClients ?? 0}
          helper={t("ptHub.clients.kpi.pausedHelper", "Currently paused")}
        />
      </div>

      <PtHubSectionCard
        title={t("ptHub.clients.listTitle", "Client List")}
        contentClassName="space-y-6"
      >
        <div className="rounded-[24px] border border-border/70 bg-background/55 p-4">
          <div className="app-filter-grid">
            <div className="app-filter-search relative">
              <Search className="app-search-icon h-4 w-4" />
              <Input
                className="app-search-input"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={t(
                  "ptHub.clients.searchPlaceholder",
                  "Search clients, goals, or coaching space",
                )}
              />
            </div>
            <Select
              className="app-filter-control"
              variant="filter"
              value={workspaceFilter}
              onChange={(event) => setWorkspaceFilter(event.target.value)}
            >
              <option value="all">
                {t("ptHub.clients.allCoachingSpaces", "All coaching spaces")}
              </option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>
            <Select
              className="app-filter-control-sm"
              variant="filter"
              value={lifecycleFilter}
              onChange={(event) => setLifecycleFilter(event.target.value)}
            >
              <option value="all">
                {t("ptHub.clients.allLifecycles", "All lifecycles")}
              </option>
              <option value="invited">
                {t("ptHub.clients.lifecycle.invited", "Invited")}
              </option>
              <option value="onboarding">
                {t("ptHub.clients.lifecycle.onboarding", "Onboarding")}
              </option>
              <option value="paused">
                {t("ptHub.clients.lifecycle.paused", "Paused")}
              </option>
              <option value="active">
                {t("ptHub.clients.lifecycle.active", "Active")}
              </option>
              <option value="completed">
                {t("ptHub.clients.lifecycle.completed", "Completed")}
              </option>
              <option value="churned">
                {t("ptHub.clients.lifecycle.churned", "Churned")}
              </option>
            </Select>
            <Select
              className="app-filter-control"
              variant="filter"
              value={segmentFilter}
              onChange={(event) =>
                setSegmentFilter(event.target.value as ClientSegmentKey)
              }
            >
              <option value="all">
                {t("ptHub.clients.allSegments", "All segments")}
              </option>
              <option value="onboarding_incomplete">
                {t(
                  "ptHub.clients.segment.onboardingIncomplete",
                  "Onboarding incomplete",
                )}
              </option>
              <option value="checkin_overdue">
                {t("ptHub.clients.segment.checkinOverdue", "Check-in overdue")}
              </option>
              <option value="at_risk">
                {t("ptHub.clients.segment.atRisk", "At-risk clients")}
              </option>
              <option value="paused">
                {t("ptHub.clients.segment.paused", "Paused clients")}
              </option>
            </Select>
          </div>
        </div>

        {isTableLoading ? (
          <div className="space-y-3 rounded-[30px] border border-border/70 bg-[linear-gradient(180deg,oklch(var(--bg-surface-elevated)/0.82),oklch(var(--bg-surface)/0.74))] p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-[24px]" />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            title={t("ptHub.clients.emptyTitle", "No clients found")}
            description={
              hasAnyClients
                ? t(
                    "ptHub.clients.emptyFiltered",
                    "No clients match the current filters.",
                  )
                : t(
                    "ptHub.clients.emptyNone",
                    "You do not have any client records yet.",
                  )
            }
            icon={<UsersRound className="h-5 w-5 [stroke-width:1.7]" />}
          />
        ) : (
          <PtHubClientTable clients={clients} onOpen={openClientWorkspace} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            {isEmpty
              ? hasAnyClients
                ? t(
                    "ptHub.clients.emptyFiltered",
                    "No clients match the current filters.",
                  )
                : t("ptHub.clients.emptyNoneShort", "No client records yet.")
              : `${t("ptHub.clients.showing", "Showing")} ${rangeStart}-${rangeEnd} ${t("ptHub.clients.of", "of")} ${totalCount} ${t("ptHub.clients.clientCount", "clients")}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0 || clientsQuery.isFetching}
            >
              {t("ptHub.clients.previous", "Previous")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((current) => current + 1)}
              disabled={!clientsQuery.data?.hasMore || clientsQuery.isFetching}
            >
              {t("ptHub.clients.next", "Next")}
            </Button>
          </div>
        </div>
      </PtHubSectionCard>
    </section>
  );
}
