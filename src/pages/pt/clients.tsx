import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";
import { ClientsKpiRow } from "../../components/pt/clients/ClientsKpiRow";
import { ClientsFilters } from "../../components/pt/clients/ClientsFilters";
import { ClientListRow } from "../../components/pt/clients/ClientListRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";
import { formatRelativeTime } from "../../lib/relative-time";

type ClientRecord = {
  id: string;
  user_id: string;
  status: string | null;
  display_name: string | null;
  tags: string[] | null;
  created_at: string | null;
};

const stages = ["All", "Onboarding", "Active", "At Risk", "Paused"];

const formatStatus = (value: string | null) =>
  value
    ? value
        .replace(/_/g, " ")
        .replace(/(^|\s)([a-z])/g, (_match, prefix, char) => `${prefix}${char.toUpperCase()}`)
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
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("All");

  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadClients = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const workspaceId = await getWorkspaceIdForUser(user.id);
        if (!workspaceId) {
          throw new Error("Workspace not found.");
        }

        const { data, error: clientsError } = await supabase
          .from("clients")
          .select("id, user_id, status, display_name, tags, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (clientsError) throw clientsError;
        if (!isMounted) return;

        setClients((data as ClientRecord[]) ?? []);
        setError(null);

        channel = supabase
          .channel(`clients-updates-${workspaceId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "clients", filter: `workspace_id=eq.${workspaceId}` },
            (payload) => {
              setClients((prev) => {
                const record = payload.new as ClientRecord;
                if (payload.eventType === "INSERT") {
                  return [record, ...prev];
                }
                if (payload.eventType === "UPDATE") {
                  return prev.map((client) => (client.id === record.id ? record : client));
                }
                if (payload.eventType === "DELETE") {
                  return prev.filter((client) => client.id !== (payload.old as ClientRecord).id);
                }
                return prev;
              });
            }
          )
          .subscribe();
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load clients.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadClients();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const formattedClients = useMemo(() => {
    return clients.map((client) => {
      const name = client.display_name?.trim() ? client.display_name : "Client";
      const statusLabel = formatStatus(client.status);
      const program = client.tags?.[0] ?? "No program assigned";
      const week = client.tags?.[1] ?? "Week —";
      const adherenceValue = makeAdherence(client.id);
      return {
        ...client,
        name,
        status: statusLabel,
        program,
        week,
        adherence: `${adherenceValue}%`,
        trend: makeTrend(client.id),
        lastActivity: client.created_at ? formatRelativeTime(client.created_at) : "Never",
      };
    });
  }, [clients]);

  const filteredClients = useMemo(() => {
    if (stage === "All") return formattedClients;
    return formattedClients.filter((client) => client.status === stage);
  }, [formattedClients, stage]);

  const stats = useMemo(() => {
    const total = formattedClients.length;
    const active = formattedClients.filter((client) => client.status === "Active").length;
    const onboarding = formattedClients.filter((client) => client.status === "Onboarding").length;
    const atRisk = formattedClients.filter((client) => client.status === "At Risk").length;
    return [
      { label: "Total Clients", value: total },
      { label: "Active", value: active, tone: "text-success" },
      { label: "Pending Onboard", value: onboarding, tone: "text-warning" },
      { label: "Needs Attention", value: atRisk, tone: "text-danger" },
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Clients</h2>
          <p className="text-sm text-muted-foreground">
            Manage your client roster and track their progress.
          </p>
        </div>
        <InviteClientDialog
          trigger={
            <Button>
              + Add Client
            </Button>
          }
        />
      </div>

      <ClientsKpiRow stats={stats} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClientsFilters />
        <select
          className="h-9 rounded-full border border-border/70 bg-secondary/40 px-4 text-xs text-muted-foreground"
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
          filteredClients.map((client) => (
            <ClientListRow
              key={client.id}
              name={client.name}
              program={client.program}
              week={client.week}
              status={client.status}
              adherence={client.adherence}
              lastActivity={client.lastActivity}
              trend={client.trend}
              onClick={() => navigate(`/pt/clients/${client.id}`)}
            />
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/40 p-8 text-center">
            <p className="text-sm font-semibold">No clients in this view yet.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Invite a new client or adjust their status.
            </p>
            <InviteClientDialog
              trigger={
                <Button className="mt-4" size="sm">
                  Invite client
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}