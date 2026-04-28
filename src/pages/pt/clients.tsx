import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  Search,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
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
  getPtClientBaseStats,
  usePtHubClientsPage,
} from "../../features/pt-hub/lib/pt-hub";
import type { PTClientSummary } from "../../features/pt-hub/types";
import { type ClientSegmentKey } from "../../lib/client-lifecycle";
import { useWorkspace } from "../../lib/use-workspace";

export function PtClientsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    workspaceId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
  const [searchValue, setSearchValue] = useState("");
  const lifecycleParam = searchParams.get("lifecycle");
  const segmentParam = searchParams.get("segment") as ClientSegmentKey | null;
  const initialLifecycleFilter =
    lifecycleParam &&
    [
      "invited",
      "onboarding",
      "paused",
      "active",
      "completed",
      "churned",
    ].includes(lifecycleParam)
      ? lifecycleParam
      : "all";
  const initialSegmentFilter =
    segmentParam &&
    ["onboarding_incomplete", "checkin_overdue", "at_risk", "paused"].includes(
      segmentParam,
    )
      ? segmentParam
      : "all";
  const [lifecycleFilter, setLifecycleFilter] = useState<string>(
    initialLifecycleFilter,
  );
  const [segmentFilter, setSegmentFilter] =
    useState<ClientSegmentKey>(initialSegmentFilter);
  const [page, setPage] = useState(0);
  const deferredSearchValue = useDeferredValue(searchValue);
  const hasWorkspaceContext = Boolean(workspaceId);
  const clientsQuery = usePtHubClientsPage({
    page,
    pageSize: 25,
    workspaceId: workspaceId ?? undefined,
    lifecycle: lifecycleFilter,
    segment: segmentFilter,
    search: deferredSearchValue,
    enabled: hasWorkspaceContext,
  });
  const statsQuery = usePtHubClientsPage({
    page: 0,
    pageSize: 5000,
    workspaceId: workspaceId ?? undefined,
    enabled: hasWorkspaceContext,
  });

  const stats = useMemo(
    () => getPtClientBaseStats(statsQuery.data?.clients ?? []),
    [statsQuery.data],
  );
  const clients = clientsQuery.data?.clients ?? [];
  const totalCount = clientsQuery.data?.totalCount ?? 0;
  const pageSize = clientsQuery.data?.pageSize ?? 25;
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd =
    totalCount === 0 ? 0 : Math.min((page + 1) * pageSize, totalCount);
  const isTableLoading =
    workspaceLoading ||
    !hasWorkspaceContext ||
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

  useEffect(() => {
    setLifecycleFilter(initialLifecycleFilter);
    setSegmentFilter(initialSegmentFilter);
  }, [initialLifecycleFilter, initialSegmentFilter]);

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

      <div className="page-kpi-block grid gap-4 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          module="clients"
          label="Total Clients"
          value={stats.totalClients}
          helper="In this coaching space"
          icon={UsersRound}
          accent
        />
        <StatCard
          surface="pt-hub"
          module="clients"
          label="Active"
          value={stats.activeClients}
          helper="Currently in training"
          icon={Activity}
          iconClassName="text-[var(--state-success-text)]"
        />
        <StatCard
          surface="pt-hub"
          module="clients"
          label="At Risk"
          value={stats.atRiskClients}
          helper="Needs your attention"
          icon={ShieldAlert}
          iconClassName="text-[var(--state-danger-text)]"
        />
        <StatCard
          surface="pt-hub"
          module="clients"
          label="Paused"
          value={stats.pausedClients}
          helper="Currently paused"
          icon={PauseCircle}
          iconClassName="text-[var(--state-warning-text)]"
        />
      </div>

      <PtHubSectionCard title="Client List" contentClassName="space-y-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(270px,0.75fr)_150px] lg:gap-4 lg:px-2">
          <div className="relative">
            <Search className="app-search-icon h-4 w-4" />
            <Input
              className="app-search-input"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search clients, goals, or status"
            />
          </div>
          <Select
            variant="filter"
            value={lifecycleFilter}
            onChange={(event) => setLifecycleFilter(event.target.value)}
          >
            <option value="all">All lifecycles</option>
            <option value="invited">Invited</option>
            <option value="onboarding">Onboarding</option>
            <option value="paused">Paused</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="churned">Churned</option>
          </Select>
          <Select
            variant="filter"
            value={segmentFilter}
            onChange={(event) =>
              setSegmentFilter(event.target.value as ClientSegmentKey)
            }
          >
            <option value="all">All segments</option>
            <option value="onboarding_incomplete">Onboarding incomplete</option>
            <option value="checkin_overdue">Check-in overdue</option>
            <option value="at_risk">At-risk clients</option>
            <option value="paused">Paused clients</option>
          </Select>
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
          <PtHubClientTable
            clients={clients}
            onOpen={openClient}
            showWorkspaceColumn={false}
          />
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
              className="h-11 w-11 p-0"
              aria-label="Previous page"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={
                page === 0 || clientsQuery.isFetching || workspaceLoading
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-11 w-11 p-0"
              aria-label="Next page"
              onClick={() => setPage((current) => current + 1)}
              disabled={
                !clientsQuery.data?.hasMore ||
                clientsQuery.isFetching ||
                workspaceLoading
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PtHubSectionCard>
    </section>
  );
}
