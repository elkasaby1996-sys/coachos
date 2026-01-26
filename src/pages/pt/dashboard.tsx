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

type ClientRecord = {
  id: string;
  user_id: string;
  status: string | null;
  joined_at: string | null;
  // NOTE: these may not exist in your schema; keep optional so UI won't crash
  name?: string | null;
  email?: string | null;
  display_name?: string | null;
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

  const [isLoading, setIsLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);

  const kpis = useMemo(
    () => [
      { label: "Active clients", value: "12", delta: "+2 this month" },
      { label: "Workouts completed", value: "47", delta: "+12% vs last week" },
      { label: "Check-ins due (Sat)", value: "2", delta: "Focus today" },
      { label: "Needs review", value: "6", delta: "Keep feedback tight" },
    ],
    []
  );

  const momentum = useMemo(
    () => [
      { label: "Mon", value: 6 },
      { label: "Tue", value: 9 },
      { label: "Wed", value: 7 },
      { label: "Thu", value: 10 },
      { label: "Fri", value: 8 },
      { label: "Sat", value: 5 },
      { label: "Sun", value: 4 },
    ],
    []
  );

  useEffect(() => {
    const loadQueue = async () => {
      if (!user?.id) return;

      setIsLoading(true);
      setQueueError(null);

      try {
        const workspaceId = await getWorkspaceIdForUser(user.id);
        if (!workspaceId) {
          throw new Error("Workspace not found for this PT.");
        }

        // ✅ FIX: remove name/email from select so PostgREST doesn't 400
        const { data, error } = await supabase
          .from("clients")
          .select("id, user_id, status, joined_at")
          .eq("workspace_id", workspaceId)
          .order("joined_at", { ascending: false })
          .limit(12);

        if (error) throw error;

        setClients((data ?? []) as ClientRecord[]);
      } catch (err: any) {
        console.error("Failed to load dashboard queue", err);
        setQueueError(err?.message ?? "Failed to load dashboard queue.");
      } finally {
        setIsLoading(false);
      }
    };

    loadQueue();
  }, [user?.id]);

  const queueSections = useMemo(() => {
    const formatted = clients.map((client) => {
      // ✅ FIX: don't use client.name/email (they don't exist in your schema)
      const name = `Client ${client.user_id.slice(0, 6)}`;
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
        title: "Check-ins due today",
        items: formatted.slice(0, 2).map((x) => ({ ...x, badge: "warning" as const })),
      },
      {
        title: "Completed workouts needing feedback",
        items: formatted.slice(2, 5).map((x) => ({ ...x, badge: "default" as const })),
      },
      {
        title: "Inactive clients (3+ days)",
        items: formatted.slice(5, 8).map((x) => ({ ...x, badge: "destructive" as const })),
      },
    ];
  }, [clients]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Action Center</h1>
          <p className="text-sm text-muted-foreground">
            Today’s coaching priorities and weekly momentum.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">Clear today’s queue</Button>
          <Button>Invite client</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <KpiTile key={k.label} label={k.label} value={k.value} delta={k.delta} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Today’s queue</CardTitle>
              <p className="text-sm text-muted-foreground">High-impact actions first.</p>
            </div>
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </CardHeader>

          <CardContent className="space-y-5">
            {queueError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {queueError}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              queueSections.map((section) => (
                <div key={section.title} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{section.title}</div>
                    <Badge variant="secondary">{section.items.length}</Badge>
                  </div>

                  <div className="space-y-2">
                    {section.items.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="flex items-center justify-between rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="space-y-0.5">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.status} • {item.lastActivity}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.badge}>{item.badge === "warning" ? "Due" : item.badge === "destructive" ? "At risk" : "Review"}</Badge>
                          <Button variant="secondary" size="sm">
                            Open
                          </Button>
                          <Button variant="ghost" size="sm">
                            Message
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly momentum</CardTitle>
              <p className="text-sm text-muted-foreground">Completion trend this week.</p>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={momentum}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Week overview</CardTitle>
              <p className="text-sm text-muted-foreground">Assigned vs completed.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {weekOverview.map((d) => (
                <div key={d.day} className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">{d.day}</div>
                  <div className="font-medium">
                    {d.completed}/{d.assigned}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
