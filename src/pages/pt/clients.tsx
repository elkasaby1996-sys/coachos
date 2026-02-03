import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Skeleton } from "../../components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
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

  const stats = useMemo(() => {
    const total = formattedClients.length;
    const active = formattedClients.filter((client) => client.status === "Active").length;
    const onboarding = formattedClients.filter((client) => client.status === "Onboarding").length;
    const atRisk = formattedClients.filter((client) => client.status === "At Risk").length;
    return [
      { label: "Total clients", value: total, tone: "text-foreground" },
      { label: "Active", value: active, tone: "text-success" },
      { label: "Pending onboard", value: onboarding, tone: "text-warning" },
      { label: "Needs attention", value: atRisk, tone: "text-danger" },
    ];
  }, [formattedClients]);

  const getStatusVariant = (status: string) => {
    if (status === "Active") return "success";
    if (status === "Onboarding") return "warning";
    if (status === "At Risk") return "danger";
    return "muted";
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");

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
        <InviteClientDialog trigger={<Button>Add client</Button>} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/70 bg-card/80">
            <CardHeader className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {stat.label}
              </p>
              <CardTitle className={`text-2xl ${stat.tone}`}>{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="All">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Input
                placeholder="Search clients..."
                className="h-9 rounded-full bg-secondary/40 pl-10"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                ⌕
              </span>
            </div>
            <Button variant="secondary" size="sm">
              All status
            </Button>
            <Button variant="secondary" size="sm">
              Sort by name
            </Button>
          </div>
          <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 lg:w-auto">
            {stages.map((stage) => (
              <TabsTrigger key={stage} value={stage} className="border border-border/70 bg-muted/50">
                {stage}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {stages.map((stage) => {
          const filtered =
            stage === "All" ? formattedClients : formattedClients.filter((client) => client.status === stage);
          return (
            <TabsContent key={stage} value={stage}>
              <Card className="border-border/70 bg-card/80">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{stage === "All" ? "Client roster" : `${stage} clients`}</CardTitle>
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
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/40 p-4 transition hover:border-border hover:bg-muted/40"
                      >
                        <div className="flex min-w-[220px] items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/70 text-xs font-semibold text-foreground">
                            {getInitials(client.name)}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">{client.name}</p>
                              <Badge variant={getStatusVariant(client.status)} className="text-[10px] uppercase">
                                {client.status}
                              </Badge>
                              {client.tags.slice(0, 1).map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-[10px]">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {client.tags.slice(1, 2)[0] ?? "No program assigned"}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-1 items-center gap-4 text-xs text-muted-foreground">
                          <div>
                            <p>Last workout</p>
                            <p className="text-foreground">{client.lastWorkout}</p>
                          </div>
                          <div>
                            <p>Last check-in</p>
                            <p className="text-foreground">{client.lastCheckIn}</p>
                          </div>
                        </div>
                        <div className="min-w-[140px] text-right">
                          <p className="text-xs text-muted-foreground">Adherence</p>
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <p className="text-sm font-semibold text-accent">{client.adherence}</p>
                            <div className="h-6 w-16 rounded-full border border-border/70 bg-muted/30" />
                          </div>
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
