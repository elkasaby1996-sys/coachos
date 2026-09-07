import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Globe2,
  Search,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { PtHubClientTable } from "../../features/pt-hub/components/pt-hub-client-table";
import { getPtHubFirstClientApplicationPath } from "../../features/pt-hub/lib/overview-dashboard";
import {
  usePtHubActivationSummary,
  usePtHubClientStats,
  usePtHubClientsPage,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import type { PTClientSummary } from "../../features/pt-hub/types";
import { type ClientSegmentKey } from "../../lib/client-lifecycle";
import { useI18n } from "../../lib/i18n-context";
import { useWorkspace } from "../../lib/use-workspace";

import "../../styles/pt-hub-analytics.css";
import "../../styles/pt-hub-clients.css";

function FirstClientGuidanceActions({
  applicationHref,
  applicationCtaLabel,
}: {
  applicationHref: string;
  applicationCtaLabel: string;
}) {
  return (
    <div className="grid w-full max-w-3xl gap-3 text-left sm:grid-cols-2">
      <div className="ui-panel border border-border/60 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-success/22 bg-success/10 text-success">
            <UserPlus className="h-4 w-4 [stroke-width:1.8]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Invite an existing client
            </p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Already coach someone? Send them an invite and bring them into
              this workspace.
            </p>
            <InviteClientDialog
              trigger={
                <Button type="button" size="sm" className="mt-3">
                  Invite client
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <div className="ui-panel border border-border/60 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/22 bg-primary/10 text-primary">
            <Globe2 className="h-4 w-4 [stroke-width:1.8]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Get new applications
            </p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Use your public profile so new clients can apply to work with you.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <Link to={applicationHref}>{applicationCtaLabel}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PtHubClientsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { switchWorkspace } = useWorkspace();
  const statsQuery = usePtHubClientStats();
  const workspacesQuery = usePtHubWorkspaces();
  const activationSummaryQuery = usePtHubActivationSummary();
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
    relationshipScope: "all",
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
  const firstClientApplicationPath = getPtHubFirstClientApplicationPath({
    profileComplete: activationSummaryQuery.data?.profileComplete ?? false,
    profilePublished: activationSummaryQuery.data?.profilePublished ?? false,
  });
  const hasActiveFilters =
    searchValue.trim().length > 0 ||
    workspaceFilter !== "all" ||
    lifecycleFilter !== "all" ||
    segmentFilter !== "all";

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

  const resetFilters = () => {
    setSearchValue("");
    setWorkspaceFilter("all");
    setLifecycleFilter("all");
    setSegmentFilter("all");
  };

  return (
    <section className="analytics-page clients-page" aria-label="Clients">
      <header className="analytics-heading">
        <div>
          <h1>{t("ptHub.clients.eyebrow", "Clients")}</h1>
          <p>
            {t(
              "ptHub.clients.description",
              "View every client across your coaching spaces.",
            )}
          </p>
        </div>
        <Link to="/pt-hub/analytics" className="client-outline-link">
          View analytics <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <div className="analytics-metrics" aria-label="Client summary">
        {[
          {
            label: t("ptHub.clients.kpi.total", "Total clients"),
            value: stats?.totalClients,
            detail: t(
              "ptHub.clients.kpi.totalHelper",
              "Across all coaching spaces",
            ),
          },
          {
            label: t("ptHub.clients.kpi.active", "Active"),
            value: stats?.activeClients,
            detail: t(
              "ptHub.clients.kpi.activeHelper",
              "Currently in training",
            ),
          },
          {
            label: t("ptHub.clients.kpi.atRisk", "At risk"),
            value: stats?.atRiskClients,
            detail: t("ptHub.clients.kpi.atRiskHelper", "Needs your attention"),
          },
          {
            label: t("ptHub.clients.kpi.paused", "Paused"),
            value: stats?.pausedClients,
            detail: t("ptHub.clients.kpi.pausedHelper", "Currently paused"),
          },
        ].map(({ label, value, detail }) => (
          <div className="analytics-metric" key={label}>
            <div className="analytics-metric-label">{label}</div>
            <strong>
              {statsQuery.isLoading || statsQuery.isError
                ? "—"
                : (value ?? "—")}
            </strong>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <section className="analytics-panel client-directory-panel">
        <header>
          <div>
            <h2>{t("ptHub.clients.listTitle", "Client list")}</h2>
            <p>
              Find a client, review their status, and open their coaching
              profile.
            </p>
          </div>
          <span className="analytics-tag">
            {isTableLoading
              ? "Loading"
              : clientsQuery.isError
                ? "Unavailable"
                : `${totalCount} clients`}
          </span>
        </header>
        <div className="space-y-5">
          <div className="client-filter-toolbar">
            <div className="client-filter-search space-y-1.5">
              <label
                htmlFor="client-search-filter"
                className="client-filter-label"
              >
                Search
              </label>
              <div className="app-filter-search relative min-w-0">
                <Search className="app-search-icon h-4 w-4" />
                <Input
                  id="client-search-filter"
                  className="app-search-input"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t(
                    "ptHub.clients.searchPlaceholder",
                    "Search clients, goals, or coaching space",
                  )}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="client-workspaceFilter"
                className="client-filter-label"
              >
                Coaching space
              </label>
              <Select
                id="client-workspaceFilter"
                aria-label="Coaching space"
                className="w-full"
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
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="client-lifecycleFilter"
                className="client-filter-label"
              >
                Lifecycle
              </label>
              <Select
                id="client-lifecycleFilter"
                aria-label="Lifecycle"
                className="w-full"
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
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="client-segmentFilter"
                className="client-filter-label"
              >
                Attention
              </label>
              <Select
                id="client-segmentFilter"
                aria-label="Attention"
                className="w-full"
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
                  {t(
                    "ptHub.clients.segment.checkinOverdue",
                    "Check-in overdue",
                  )}
                </option>
                <option value="at_risk">
                  {t("ptHub.clients.segment.atRisk", "At-risk clients")}
                </option>
                <option value="paused">
                  {t("ptHub.clients.segment.paused", "Paused clients")}
                </option>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-11 whitespace-nowrap"
              disabled={!hasActiveFilters}
              onClick={resetFilters}
            >
              Reset
            </Button>
          </div>

          {isTableLoading ? (
            <div className="pt-hub-data-shell space-y-3 p-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-24 w-full rounded-[var(--ui-radius-card)]"
                />
              ))}
            </div>
          ) : clientsQuery.isError ? (
            <div className="analytics-error" role="alert">
              <p>Clients could not be loaded. Please try again.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void clientsQuery.refetch()}
                disabled={clientsQuery.isFetching}
              >
                Try again
              </Button>
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
              action={
                hasAnyClients ? null : (
                  <FirstClientGuidanceActions
                    applicationHref={firstClientApplicationPath.href}
                    applicationCtaLabel={firstClientApplicationPath.ctaLabel}
                  />
                )
              }
            />
          ) : (
            <PtHubClientTable clients={clients} onOpen={openClientWorkspace} />
          )}

          {!clientsQuery.isError && (
            <div className="client-directory-footer flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                {isEmpty
                  ? hasAnyClients
                    ? t(
                        "ptHub.clients.emptyFiltered",
                        "No clients match the current filters.",
                      )
                    : t(
                        "ptHub.clients.emptyNoneShort",
                        "No client records yet.",
                      )
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
                  disabled={
                    !clientsQuery.data?.hasMore || clientsQuery.isFetching
                  }
                >
                  {t("ptHub.clients.next", "Next")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
