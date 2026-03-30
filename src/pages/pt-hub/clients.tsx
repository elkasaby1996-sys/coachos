import { useMemo, useState } from "react";
import { Search, Users2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/ui/coachos/empty-state";
import { StatCard } from "../../components/ui/coachos/stat-card";
import { Input } from "../../components/ui/input";
import { PtHubClientTable } from "../../features/pt-hub/components/pt-hub-client-table";
import { PtHubPageHeader } from "../../features/pt-hub/components/pt-hub-page-header";
import { PtHubSectionCard } from "../../features/pt-hub/components/pt-hub-section-card";
import {
  getPtClientBaseStats,
  usePtHubClients,
  usePtHubWorkspaces,
} from "../../features/pt-hub/lib/pt-hub";
import type { PTClientSummary } from "../../features/pt-hub/types";
import {
  matchesClientSegment,
  normalizeClientLifecycleState,
  type ClientSegmentKey,
} from "../../lib/client-lifecycle";
import { useWorkspace } from "../../lib/use-workspace";

export function PtHubClientsPage() {
  const navigate = useNavigate();
  const { switchWorkspace } = useWorkspace();
  const clientsQuery = usePtHubClients();
  const workspacesQuery = usePtHubWorkspaces();
  const [searchValue, setSearchValue] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<ClientSegmentKey>("all");

  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const workspaces = useMemo(
    () => workspacesQuery.data ?? [],
    [workspacesQuery.data],
  );
  const stats = getPtClientBaseStats(clients);

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesWorkspace =
        workspaceFilter === "all"
          ? true
          : client.workspaceId === workspaceFilter;
      const matchesLifecycle =
        lifecycleFilter === "all"
          ? true
          : normalizeClientLifecycleState(client.lifecycleState) ===
            lifecycleFilter;
      const matchesSegment = matchesClientSegment(client, segmentFilter);
      const haystack = [
        client.displayName,
        client.goal ?? "",
        client.workspaceName,
        client.lifecycleState,
        ...(client.riskFlags ?? []),
        client.onboardingStatus ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = normalizedSearch
        ? haystack.includes(normalizedSearch)
        : true;
      return (
        matchesWorkspace &&
        matchesLifecycle &&
        matchesSegment &&
        matchesSearch
      );
    });
  }, [
    clients,
    lifecycleFilter,
    searchValue,
    segmentFilter,
    workspaceFilter,
  ]);

  const openClientWorkspace = (client: PTClientSummary) => {
    switchWorkspace(client.workspaceId);
    navigate(`/pt/clients/${client.id}`);
  };

  return (
    <section className="space-y-6">
      <PtHubPageHeader
        eyebrow="Client Base"
        title="Monitor the client portfolio across workspaces"
        description="This is the trainer-level business view of your client base. It gives you portfolio visibility without duplicating workspace-specific client operations."
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <StatCard
          surface="pt-hub"
          label="Total Clients"
          value={stats.totalClients}
          helper="Across owned workspaces"
          icon={Users2}
          accent
        />
        <StatCard
          surface="pt-hub"
          label="Active"
          value={stats.activeClients}
          helper="Currently coached"
        />
        <StatCard
          surface="pt-hub"
          label="At Risk"
          value={stats.atRiskClients}
          helper="Flagged for coach attention"
        />
        <StatCard
          surface="pt-hub"
          label="Onboarding Incomplete"
          value={stats.onboardingIncompleteClients}
          helper="Not fully activated yet"
        />
        <StatCard
          surface="pt-hub"
          label="Paused"
          value={stats.pausedClients}
          helper="Intentional hold or retention risk"
        />
      </div>

      <PtHubSectionCard
        title="Client portfolio"
        description="Search by client, workspace, goal, or status and jump directly back into the correct coaching context."
        contentClassName="space-y-6"
      >
        <div className="rounded-[24px] border border-border/60 bg-background/35 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search clients, goals, or workspace"
              />
            </div>
            <select
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              value={workspaceFilter}
              onChange={(event) => setWorkspaceFilter(event.target.value)}
            >
              <option value="all">All workspaces</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
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
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
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

        {filteredClients.length === 0 ? (
          <EmptyState
            title="No clients found"
            description={
              clients.length === 0
                ? "No client records exist across your owned workspaces yet."
                : "No clients match the current workspace, lifecycle, segment, and search filters."
            }
            icon={<Users2 className="h-5 w-5" />}
          />
        ) : (
          <PtHubClientTable
            clients={filteredClients}
            onOpen={openClientWorkspace}
          />
        )}
      </PtHubSectionCard>
    </section>
  );
}
