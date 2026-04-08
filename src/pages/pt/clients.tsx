import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { PtHubClientTable } from "../../features/pt-hub/components/pt-hub-client-table";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import {
  getPtClientBaseStats,
  usePtHubClientsPage,
} from "../../features/pt-hub/lib/pt-hub";
import type { PTClientSummary } from "../../features/pt-hub/types";
import { type ClientSegmentKey } from "../../lib/client-lifecycle";
import { useWorkspace } from "../../lib/use-workspace";

const WORKSPACE_PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

export function PtClientsPage() {
  const navigate = useNavigate();
  const {
    workspaceId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
  const [searchValue, setSearchValue] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<ClientSegmentKey>("all");
  const [page, setPage] = useState(0);
  const deferredSearchValue = useDeferredValue(searchValue);
  const scopedWorkspaceId = workspaceId ?? WORKSPACE_PLACEHOLDER_ID;
  const clientsQuery = usePtHubClientsPage({
    page,
    pageSize: 25,
    workspaceId: scopedWorkspaceId,
    lifecycle: lifecycleFilter,
    segment: segmentFilter,
    search: deferredSearchValue,
  });
  const statsQuery = usePtHubClientsPage({
    page: 0,
    pageSize: 5000,
    workspaceId: scopedWorkspaceId,
  });

  const stats = useMemo(
    () => getPtClientBaseStats(statsQuery.data?.clients ?? []),
    [statsQuery.data],
  );
  const clients = clientsQuery.data?.clients ?? [];
  const totalCount = clientsQuery.data?.totalCount ?? 0;
  const pageSize = clientsQuery.data?.pageSize ?? 25;
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min((page + 1) * pageSize, totalCount);
  const isTableLoading =
    workspaceLoading ||
    clientsQuery.isLoading ||
    (clientsQuery.isFetching && !clientsQuery.data);
  const hasAnyClients = stats.totalClients > 0;
  const isEmpty = totalCount === 0;
  const queryError =
    clientsQuery.error instanceof Error ? clientsQuery.error.message : null;
  const errorMessage = workspaceError?.message ?? queryError;

  useEffect(() => {
    setPage(0);
  }, [deferredSearchValue, lifecycleFilter, segmentFilter, workspaceId]);

  const openClient = (client: PTClientSummary) => {
    navigate(
      client.onboardingIncomplete
        ? `/pt/clients/${client.id}?tab=onboarding`
        : `/pt/clients/${client.id}`,
    );
  };

  return (
    <section className="space-y-6">
      {errorMessage ? (
        <Alert className="border-destructive/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <PtHubPageHeader
        eyebrow="Clients"
        title="Manage your clients"
        description="View every client in your active coaching space."
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Total Clients"
          value={stats.totalClients}
          helper="In this coaching space"
          icon={UsersRound}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="Active"
          value={stats.activeClients}
          helper="Currently in training"
        />
        <StatCard
          surface="pt-hub"
          label="At Risk"
          value={stats.atRiskClients}
          helper="Needs your attention"
        />
        <StatCard
          surface="pt-hub"
          label="Paused"
          value={stats.pausedClients}
          helper="Currently paused"
        />
      </div>

      <PtHubSectionCard
        title="Client List"
        actions={
          <InviteClientDialog
            trigger={<Button variant="secondary">Invite client</Button>}
          />
        }
        contentClassName="space-y-6"
      >
        <div className="rounded-[24px] border border-border/70 bg-background/55 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_220px]">
            <div className="relative">
              <Search className="app-search-icon h-4 w-4" />
              <Input
                className="app-search-input"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search clients, goals, or status"
              />
            </div>
            <select
              className="app-filter-control"
              value={lifecycleFilter}
              onChange={(event) => setLifecycleFilter(event.target.value)}
            >
              <option value="all">All lifecycles</option>
              <option value="invited">Invited</option>
              <option value="onboarding">Onboarding</option>
              <option value="paused">Paused</option>
              <option value="active">Active</option>
              <option value="at_risk">At risk</option>
              <option value="completed">Completed</option>
              <option value="churned">Churned</option>
            </select>
            <select
              className="app-filter-control"
              value={segmentFilter}
              onChange={(event) =>
                setSegmentFilter(event.target.value as ClientSegmentKey)
              }
            >
              <option value="all">All segments</option>
              <option value="onboarding_incomplete">
                Onboarding incomplete
              </option>
              <option value="checkin_overdue">Check-in overdue</option>
              <option value="at_risk">At-risk clients</option>
              <option value="paused">Paused clients</option>
            </select>
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
            title="No clients found"
            description={
              hasAnyClients
                ? "No clients match the current filters."
                : "You do not have any client records yet."
            }
            icon={<UsersRound className="h-5 w-5 [stroke-width:1.7]" />}
          />
        ) : (
          <PtHubClientTable clients={clients} onOpen={openClient} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            {isEmpty
              ? hasAnyClients
                ? "No clients match the current filters."
                : "No client records yet."
              : `Showing ${rangeStart}-${rangeEnd} of ${totalCount} clients`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0 || clientsQuery.isFetching || workspaceLoading}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((current) => current + 1)}
              disabled={
                !clientsQuery.data?.hasMore ||
                clientsQuery.isFetching ||
                workspaceLoading
              }
            >
              Next
            </Button>
          </div>
        </div>
      </PtHubSectionCard>
    </section>
  );
}
