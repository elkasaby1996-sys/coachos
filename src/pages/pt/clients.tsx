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
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { formatRelativeTime } from "../../lib/relative-time";
import { useWorkspace } from "../../lib/use-workspace";
import type { ClientOnboardingStatus } from "../../features/client-onboarding/types";

type ClientRecord = {
  id: string;
  user_id: string;
  status: string | null;
  display_name: string | null;
  tags: string[] | null;
  created_at: string | null;
  last_session_at?: string | null;
  last_checkin_at?: string | null;
};

type ClientOnboardingStatusRow = {
  client_id: string;
  status: ClientOnboardingStatus;
};

const stages = ["All", "Onboarding", "Active", "At Risk", "Paused"];

const formatStatus = (value: string | null) =>
  value
    ? value
        .replace(/_/g, " ")
        .replace(
          /(^|\s)([a-z])/g,
          (_match, prefix, char) => `${prefix}${char.toUpperCase()}`,
        )
    : "Active";

const makeAdherence = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000;
  }
  return 60 + (hash % 41);
};

const makeTrend = (seed: string) => {
  const base = makeAdherence(seed) / 10;
  return [
    base - 3,
    base - 1,
    base + 1,
    base - 2,
    base + 2,
    base + 1,
    base + 3,
  ].map((value) => Math.max(2, Math.round(value)));
};

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
  const [stage, setStage] = useState("All");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [onboardingByClient, setOnboardingByClient] = useState<
    Record<string, ClientOnboardingStatus | null>
  >({});
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

        const rows = (data as ClientRecord[]) ?? [];
        const clientIds = rows.map((row) => row.id);
        let onboardingRows: ClientOnboardingStatusRow[] = [];
        if (clientIds.length > 0) {
          const { data: onboardingData, error: onboardingError } =
            await supabase.rpc("ensure_workspace_client_onboardings", {
              p_workspace_id: workspaceId,
              p_client_ids: clientIds,
            });

          if (onboardingError) throw onboardingError;
          onboardingRows = (onboardingData ??
            []) as ClientOnboardingStatusRow[];
        }

        setClients((prev) => (page === 0 ? rows : [...prev, ...rows]));
        setOnboardingByClient((prev) => {
          const next = page === 0 ? {} : { ...prev };
          onboardingRows.forEach((row) => {
            next[row.client_id] = row.status;
          });
          return next;
        });
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
      const name = client.display_name?.trim() ? client.display_name : "Client";
      const statusLabel = formatStatus(client.status);
      const program = client.tags?.[0] ?? "No program assigned";
      const week = client.tags?.[1] ?? "Week —";
      const adherenceValue = makeAdherence(client.id);
      const lastActivityRaw =
        client.last_session_at ??
        client.last_checkin_at ??
        client.created_at ??
        null;
      return {
        ...client,
        name,
        status: statusLabel,
        program,
        week,
        adherence: `${adherenceValue}%`,
        trend: makeTrend(client.id),
        lastActivity: lastActivityRaw
          ? formatRelativeTime(lastActivityRaw)
          : "Never",
        onboardingStatus: onboardingByClient[client.id] ?? null,
      };
    });
  }, [clients, onboardingByClient]);

  const filteredClients = useMemo(() => {
    if (stage === "All") return formattedClients;
    if (stage === "Onboarding") {
      return formattedClients.filter(
        (client) =>
          client.onboardingStatus && client.onboardingStatus !== "completed",
      );
    }
    return formattedClients.filter((client) => client.status === stage);
  }, [formattedClients, stage]);

  const stats = useMemo(() => {
    const total = formattedClients.length;
    const reviewQueue = formattedClients.filter(
      (client) =>
        client.onboardingStatus === "review_needed" ||
        client.onboardingStatus === "submitted" ||
        client.onboardingStatus === "partially_activated",
    ).length;
    const completed = formattedClients.filter(
      (client) => client.onboardingStatus === "completed",
    ).length;
    return [
      { label: "Total Clients", value: total },
      { label: "Review Queue", value: reviewQueue, tone: "text-warning" },
      { label: "Completed", value: completed, tone: "text-success" },
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
        description="Manage the roster, scan adherence and stage changes, and open client work without extra clicks."
        actions={<InviteClientDialog trigger={<Button>+ Add Client</Button>} />}
      />

      <ClientsKpiRow stats={stats} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClientsFilters />
        <select
          className="workspace-filter-chip w-auto"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
        >
          {stages.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
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
                status={client.status}
                onboardingStatus={client.onboardingStatus}
                adherence={client.adherence}
                lastActivity={client.lastActivity}
                trend={client.trend}
                onClick={() =>
                  navigate(
                    client.onboardingStatus &&
                      client.onboardingStatus !== "completed"
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
            description="Invite a new client or adjust their status."
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
