import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Skeleton } from "../../components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";

type ClientRecord = {
  id: string;
  user_id: string;
  status: string | null;
  display_name: string | null;
  tags: string[] | null;
  created_at: string | null;
};

const stages = ["All", "Onboarding", "Active", "At Risk", "Paused"];

const statusDot: Record<string, string> = {
  Active: "bg-success",
  "At Risk": "bg-danger",
  Onboarding: "bg-warning",
  Paused: "bg-muted-foreground",
};

export function PtClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        console.log("clients fetch", { workspaceId, data, error: clientsError });

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
        console.error("Failed to load clients", err);
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
      const statusLabel = client.status
        ? client.status
            .replace(/_/g, " ")
            .replace(
              /(^|\\s)([a-z])/g,
              (_match, prefix, char) => `${prefix}${char.toUpperCase()}`
            )
        : "Active";
      return {
        ...client,
        name,
        status: statusLabel,
        tags: client.tags ?? [],
        lastWorkout: "Not yet scheduled",
        lastCheckIn: "Not yet submitted",
        adherence: "\u2014",
      };
    });
  }, [clients]);
  return (
    <div className="space-y-8">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        PT CLIENTS PAGE ACTIVE (v1)
      </div>
      {error ? (
        <Alert className="border-destructive/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Clients pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Track onboarding, adherence, and at-risk athletes.
          </p>
        </div>
        <InviteClientDialog trigger={<Button>Create invite code</Button>} />
      </div>

      <Tabs defaultValue="All">
        <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {stages.map((stage) => (
            <TabsTrigger key={stage} value={stage} className="border border-border bg-muted/50">
              {stage}
            </TabsTrigger>
          ))}
        </TabsList>

        {stages.map((stage) => {
          const filtered =
            stage === "All" ? formattedClients : formattedClients.filter((client) => client.status === stage);
          return (
            <TabsContent key={stage} value={stage}>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{stage === "All" ? "All clients" : `${stage} clients`}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {stage === "All"
                        ? "Keep an eye on adherence and outreach."
                        : `Clients currently tagged as ${stage.toLowerCase()}.`}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm">
                    Export list
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : filtered.length > 0 ? (
                    filtered.map((client) => (
                      <div
                        key={client.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
                      >
                        <div className="min-w-[220px]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${statusDot[client.status] ?? "bg-muted"}`}
                            />
                            <p className="text-sm font-semibold">{client.name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{client.status}</p>
                        </div>
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          {client.tags.map((tag) => (
                            <Badge key={tag} variant="muted">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="min-w-[160px] text-xs text-muted-foreground">
                          <p>Last workout: {client.lastWorkout}</p>
                          <p>Last check-in: {client.lastCheckIn}</p>
                        </div>
                        <div className="min-w-[120px] text-right">
                          <p className="text-xs text-muted-foreground">Adherence</p>
                          <p className="text-sm font-semibold text-accent">{client.adherence}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button asChild size="sm" variant="secondary">
                            <Link to={`/pt/clients/${client.id}`}>Open profile</Link>
                          </Button>
                          <Button size="sm">Message</Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                      <p className="text-sm font-semibold">No clients in this stage yet.</p>
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
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
