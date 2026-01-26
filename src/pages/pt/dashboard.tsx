import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { KpiTile } from "../../components/common/kpi-tile";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";

const chartData = [
  { day: "Mon", value: 12 },
  { day: "Tue", value: 18 },
  { day: "Wed", value: 15 },
  { day: "Thu", value: 22 },
  { day: "Fri", value: 27 },
  { day: "Sat", value: 19 },
  { day: "Sun", value: 25 },
];

const kpiData = [
  {
    label: "Active clients",
    value: "24",
    delta: "+8% vs last week",
    sparkline: [12, 18, 14, 20, 26, 24, 30],
    accent: true,
  },
  {
    label: "Workouts (7 days)",
    value: "68",
    delta: "+12% vs last week",
    sparkline: [32, 28, 30, 35, 40, 38, 44],
  },
  {
    label: "Check-ins due",
    value: "9",
    delta: "-3 vs last week",
    sparkline: [11, 9, 8, 10, 9, 7, 9],
  },
  {
    label: "Needs review",
    value: "5",
    delta: "+2 flagged",
    sparkline: [2, 3, 4, 4, 5, 4, 5],
  },
];

type ClientRecord = {
  id: string;
  user_id: string;
  status: string | null;
  joined_at: string | null;
  name?: string | null;
  email?: string | null;
};

const weekOverview = [
  { day: "Mon", assigned: 12, completed: 9 },
  { day: "Tue", assigned: 14, completed: 12 },
  { day: "Wed", assigned: 13, completed: 11 },
  { day: "Thu", assigned: 15, completed: 13 },
  { day: "Fri", assigned: 16, completed: 14 },
  { day: "Sat", assigned: 10, completed: 7 },
  { day: "Sun", assigned: 8, completed: 6 },
];

export function PtDashboardPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadQueue = async () => {
      if (!user?.id) {
        setIsQueueLoading(false);
        return;
      }

      try {
        setIsQueueLoading(true);
        const workspaceId = await getWorkspaceIdForUser(user.id);
        if (!workspaceId) {
          throw new Error("Workspace not found.");
        }

        const { data, error } = await supabase
          .from("clients")
          .select("id, user_id, status, joined_at, name, email")
          .eq("workspace_id", workspaceId)
          .order("joined_at", { ascending: false })
          .limit(12);

        if (error) throw error;
        if (!isMounted) return;
        setClients((data as ClientRecord[]) ?? []);
        setQueueError(null);

        channel = supabase
          .channel(`dashboard-clients-${workspaceId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "clients", filter: `workspace_id=eq.${workspaceId}` },
            (payload) => {
              setClients((prev) => {
                const record = payload.new as ClientRecord;
                if (payload.eventType === "INSERT") {
                  return [record, ...prev].slice(0, 12);
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
        console.error("Failed to load dashboard queue", err);
        if (isMounted) {
          setQueueError(err instanceof Error ? err.message : "Failed to load queue.");
        }
      } finally {
        if (isMounted) setIsQueueLoading(false);
      }
    };

    loadQueue();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const queueSections = useMemo(() => {
    const formatted = clients.map((client) => {
      const name = client.name ?? client.email ?? `Client ${client.user_id.slice(0, 6)}`;
      const joined = client.joined_at ? new Date(client.joined_at) : null;
      return {
        name,
        status: "Awaiting first workout",
        lastActivity: joined ? `Joined ${joined.toLocaleDateString()}` : "Recently joined",
        badge: "warning" as const,
      };
    });

    return [
      {
        title: "New clients awaiting plan",
        items: formatted,
      },
    ];
  }, [clients]);

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Action Center</p>
          <h2 className="text-2xl font-semibold tracking-tight">Today’s coaching priorities</h2>
        </div>
        <Button variant="secondary">Review highlights</Button>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {kpiData.map((kpi) => (
          <KpiTile key={kpi.label} {...kpi} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Today’s queue</CardTitle>
              <p className="text-sm text-muted-foreground">
                Prioritize check-ins, feedback, and outreach.
              </p>
            </div>
            <Button variant="secondary" size="sm">
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {isQueueLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : queueError ? (
              <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                {queueError}
              </div>
            ) : (
              queueSections.map((section) => (
                <div key={section.title} className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </p>
                  <div className="space-y-3">
                    {section.items.length > 0 ? (
                      section.items.map((item) => (
                        <div
                          key={item.name}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 transition hover:-translate-y-0.5 hover:shadow-lg"
                        >
                          <div>
                            <p className="text-sm font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.lastActivity}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={item.badge as "warning" | "danger" | "default"}>
                              {item.status}
                            </Badge>
                            <Button size="sm" variant="secondary">
                              Open
                            </Button>
                            <Button size="sm">Message</Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div
                        className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground"
                      >
                        No new clients yet.
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Weekly momentum</CardTitle>
              <p className="text-sm text-muted-foreground">
                Completed workouts over the last seven days.
              </p>
            </div>
            <Button variant="secondary" size="sm">
              Export
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--chart-1))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Week overview
              </p>
              <div className="grid grid-cols-7 gap-2">
                {weekOverview.map((day) => (
                  <div
                    key={day.day}
                    className="rounded-lg border border-border bg-background p-2 text-center text-xs transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <p className="text-muted-foreground">{day.day}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{day.completed}</p>
                    <p className="text-[10px] text-muted-foreground">/{day.assigned}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
