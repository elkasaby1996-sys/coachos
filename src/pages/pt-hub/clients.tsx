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
import { useWorkspace } from "../../lib/use-workspace";

export function PtHubClientsPage() {
  const navigate = useNavigate();
  const { switchWorkspace } = useWorkspace();
  const clientsQuery = usePtHubClients();
  const workspacesQuery = usePtHubWorkspaces();
  const [searchValue, setSearchValue] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const clients = clientsQuery.data ?? [];
  const workspaces = workspacesQuery.data ?? [];
  const stats = getPtClientBaseStats(clients);

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    return clients.filter((client) => {
      const matchesWorkspace =
        workspaceFilter === "all" ? true : client.workspaceId === workspaceFilter;
      const matchesStatus =
        statusFilter === "all"
          ? true
          : client.status.trim().toLowerCase() === statusFilter;
      const haystack = [
        client.displayName,
        client.goal ?? "",
        client.workspaceName,
        client.status,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = normalizedSearch
        ? haystack.includes(normalizedSearch)
        : true;
      return matchesWorkspace && matchesStatus && matchesSearch;
    });
  }, [clients, searchValue, workspaceFilter, statusFilter]);

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
          label="Paused / Inactive"
          value={stats.pausedClients}
          helper="Needs reactivation or cleanup"
        />
        <StatCard
          surface="pt-hub"
          label="Recently Onboarded"
          value={stats.recentlyOnboardedClients}
          helper="Created in the last 30 days"
        />
      </div>

      <PtHubSectionCard
        title="Client portfolio"
        description="Search by client, workspace, goal, or status and jump directly back into the correct coaching context."
        contentClassName="space-y-6"
      >
        <div className="rounded-[24px] border border-border/60 bg-background/35 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
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
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {filteredClients.length === 0 ? (
          <EmptyState
            title="No clients found"
            description={
              clients.length === 0
                ? "No client records exist across your owned workspaces yet."
                : "No clients match the current workspace, status, and search filters."
            }
            icon={<Users2 className="h-5 w-5" />}
          />
        ) : (
          <PtHubClientTable clients={filteredClients} onOpen={openClientWorkspace} />
        )}
      </PtHubSectionCard>
    </section>
  );
}
