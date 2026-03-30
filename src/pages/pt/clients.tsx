import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { ClientsKpiRow } from "../../components/pt/clients/ClientsKpiRow";
import { ClientsFilters } from "../../components/pt/clients/ClientsFilters";
import { ClientListRow } from "../../components/pt/clients/ClientListRow";
import { EmptyState } from "../../components/ui/coachos";
import { useAuth } from "../../lib/auth";
import {
  matchesClientSegment,
  normalizeClientLifecycleState,
  type ClientSegmentKey,
} from "../../lib/client-lifecycle";
import { formatRelativeTime } from "../../lib/relative-time";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";

type ClientRecord = {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  status: string | null;
  lifecycle_state: string | null;
  lifecycle_changed_at: string | null;
  paused_reason: string | null;
  churn_reason: string | null;
  display_name: string | null;
  goal: string | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  onboarding_status: string | null;
  onboarding_incomplete: boolean | null;
  last_session_at: string | null;
  last_checkin_at: string | null;
  last_message_at: string | null;
  last_client_reply_at: string | null;
  last_activity_at: string | null;
  overdue_checkins_count: number | null;
  has_overdue_checkin: boolean | null;
  risk_flags: string[] | null;
};

const lifecycleOptions = [
  { value: "all", label: "All lifecycles" },
  { value: "invited", label: "Invited" },
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Active" },
  { value: "at_risk", label: "At risk" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "churned", label: "Churned" },
] as const;

export function PtClientsPage() {
  const { user } = useAuth();
  const {
    workspaceId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [segment, setSegment] = useState<ClientSegmentKey>("all");
  const [lifecycleFilter, setLifecycleFilter] = useState("all");
  const pageSize = 50;

  useEffect(() => {
    let isMounted = true;

    const loadClients = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      if (workspaceLoading) {
        setIsLoading(true);
        return;
      }

      try {
        setIsLoading(true);
        if (!workspaceId) throw new Error("Workspace not found.");

        const { data, error: clientsError } = await supabase.rpc(
          "pt_clients_summary",
          {
            p_workspace_id: workspaceId,
            p_limit: pageSize,
            p_offset: page * pageSize,
          },
        );

        if (clientsError) throw clientsError;
        if (!isMounted) return;

        const rows = ((data ?? []) as ClientRecord[]).map((row) => ({
          ...row,
          risk_flags: row.risk_flags ?? [],
        }));

        setClients((prev) => (page === 0 ? rows : [...prev, ...rows]));
        setHasMore(rows.length === pageSize);
        setError(null);
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load clients.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadClients();

    return () => {
      isMounted = false;
    };
  }, [user?.id, workspaceId, workspaceLoading, page]);

  useEffect(() => {
    if (workspaceError) {
      setError(workspaceError.message);
    }
  }, [workspaceError]);

  const formattedClients = useMemo(() => {
    return clients.map((client) => {
      const lifecycleState = normalizeClientLifecycleState(
        client.lifecycle_state,
      );
      const lastActivityRaw =
        client.last_activity_at ??
        client.last_client_reply_at ??
        client.last_session_at ??
        client.last_checkin_at ??
        client.created_at;

      return {
        ...client,
        lifecycleState,
        name: client.display_name?.trim() || "Client",
        program: client.tags?.[0] ?? client.goal ?? "No program assigned",
        week:
          client.has_overdue_checkin && (client.overdue_checkins_count ?? 0) > 0
            ? `${client.overdue_checkins_count} overdue check-in${(client.overdue_checkins_count ?? 0) > 1 ? "s" : ""}`
            : client.goal?.trim() || "Operationally healthy",
        riskFlags: client.risk_flags ?? [],
        lastActivityLabel: lastActivityRaw
          ? formatRelativeTime(lastActivityRaw)
          : "No recent activity",
      };
    });
  }, [clients]);

  const filteredClients = useMemo(() => {
    const search = searchValue.trim().toLowerCase();

    return formattedClients.filter((client) => {
      const matchesSearch = search
        ? [
            client.name,
            client.program,
            client.week,
            client.lifecycleState,
            ...(client.riskFlags ?? []),
            client.onboarding_status ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(search)
        : true;

      const matchesSegment = matchesClientSegment(client, segment);
      const matchesLifecycle =
        lifecycleFilter === "all"
          ? true
          : client.lifecycleState === lifecycleFilter;

      return matchesSearch && matchesSegment && matchesLifecycle;
    });
  }, [formattedClients, lifecycleFilter, searchValue, segment]);

  const stats = useMemo(() => {
    const total = formattedClients.length;
    const onboardingIncomplete = formattedClients.filter((client) =>
      matchesClientSegment(client, "onboarding_incomplete"),
    ).length;
    const atRisk = formattedClients.filter((client) =>
      matchesClientSegment(client, "at_risk"),
    ).length;
    const overdue = formattedClients.filter((client) =>
      matchesClientSegment(client, "checkin_overdue"),
    ).length;
    const paused = formattedClients.filter((client) =>
      matchesClientSegment(client, "paused"),
    ).length;

    return [
      { label: "Total Clients", value: total },
      {
        label: "Onboarding Incomplete",
        value: onboardingIncomplete,
        tone: "text-warning",
      },
      { label: "At Risk", value: atRisk, tone: "text-destructive" },
      { label: "Check-in Overdue", value: overdue, tone: "text-warning" },
      { label: "Paused", value: paused, tone: "text-muted-foreground" },
    ];
  }, [formattedClients]);

  return (
    <div className="space-y-8">
      {error ? (
        <Alert className="border-destructive/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <WorkspacePageHeader
        title="Clients"
        description="Work the roster by lifecycle, risk, and operational attention instead of scanning raw rows."
        actions={<InviteClientDialog trigger={<Button>+ Add Client</Button>} />}
      />

      <ClientsKpiRow stats={stats} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClientsFilters
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          activeSegment={segment}
          onSegmentChange={setSegment}
        />
        <select
          className="workspace-filter-chip w-auto"
          value={lifecycleFilter}
          onChange={(event) => setLifecycleFilter(event.target.value)}
        >
          {lifecycleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredClients.length > 0 ? (
          <>
            {filteredClients.map((client) => (
              <ClientListRow
                key={client.id}
                name={client.name}
                program={client.program}
                week={client.week}
                status={client.lifecycleState}
                onboardingStatus={client.onboarding_status}
                riskFlags={client.riskFlags}
                lastActivity={client.lastActivityLabel}
                pausedReason={client.paused_reason}
                churnReason={client.churn_reason}
                onClick={() =>
                  navigate(
                    client.onboarding_incomplete
                      ? `/pt/clients/${client.id}?tab=onboarding`
                      : `/pt/clients/${client.id}`,
                  )
                }
              />
            ))}
            {hasMore ? (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            centered
            title="No clients in this view yet"
            description="Invite a new client or change the lifecycle and smart filters."
            action={
              <InviteClientDialog
                trigger={
                  <Button className="mt-4" size="sm">
                    Invite client
                  </Button>
                }
              />
            }
          />
        )}
      </div>
    </div>
  );
}
