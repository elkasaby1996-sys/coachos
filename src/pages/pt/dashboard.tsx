import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { KpiTile } from "../../components/common/kpi-tile";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";
import { addDaysToDateString, diffDays, getLastSaturday, getTodayInTimezone } from "../../lib/date-utils";
import { getLatestCheckinDate } from "../../lib/checkins";

type ClientRecord = {
  id: string;
  workspace_id: string;
  user_id: string;
  status: string | null;
  display_name: string | null;
  created_at: string;
  tags: string[] | null;
  timezone: string | null;
};

type AtRiskClient = {
  id: string;
  name: string;
  missingHabitDays: number;
  checkinOverdue: boolean;
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
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [atRiskClients, setAtRiskClients] = useState<AtRiskClient[]>([]);
  const [atRiskError, setAtRiskError] = useState<string | null>(null);
  const [atRiskLoading, setAtRiskLoading] = useState(false);

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
        if (!workspaceId) throw new Error("Workspace not found for this PT.");

        // ✅ MATCHES YOUR SCHEMA (no joined_at/name/email)
        const { data, error } = await supabase
          .from("clients")
          .select("id, workspace_id, user_id, status, display_name, created_at, tags, timezone")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
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

  useEffect(() => {
    const loadAtRisk = async () => {
      if (clients.length === 0) {
        setAtRiskClients([]);
        return;
      }

      setAtRiskLoading(true);
      setAtRiskError(null);

      try {
        const clientIds = clients.map((client) => client.id);
        const todayMap = new Map<string, string>();
        const startMap = new Map<string, string>();
        let minStart: string | null = null;
        let maxToday: string | null = null;

        clients.forEach((client) => {
          const todayStr = getTodayInTimezone(client.timezone ?? null);
          const startStr = addDaysToDateString(todayStr, -6);
          todayMap.set(client.id, todayStr);
          startMap.set(client.id, startStr);
          if (!minStart || startStr < minStart) minStart = startStr;
          if (!maxToday || todayStr > maxToday) maxToday = todayStr;
        });

        const { data: habitLogs, error: habitError } = await supabase
          .from("habit_logs")
          .select("client_id, log_date")
          .in("client_id", clientIds)
          .gte("log_date", minStart ?? "")
          .lte("log_date", maxToday ?? "");
        if (habitError) throw habitError;

        const { data: checkins, error: checkinError } = await supabase
          .from("checkins")
          .select("*")
          .in("client_id", clientIds);
        if (checkinError) throw checkinError;

        const rowsByClient = new Map<string, Record<string, unknown>[]>();
        (checkins ?? []).forEach((row) => {
          const clientId = (row as { client_id?: string | null }).client_id;
          if (!clientId) return;
          if (!rowsByClient.has(clientId)) {
            rowsByClient.set(clientId, []);
          }
          rowsByClient.get(clientId)?.push(row as Record<string, unknown>);
        });

        const latestCheckins = new Map<string, string>();
        clients.forEach((client) => {
          const rows = rowsByClient.get(client.id) ?? [];
          const latest = getLatestCheckinDate(rows, client.timezone ?? null);
          if (latest) {
            latestCheckins.set(client.id, latest);
          }
        });

        const logsByClient = new Map<string, Set<string>>();
        (habitLogs ?? []).forEach((row) => {
          if (!logsByClient.has(row.client_id)) {
            logsByClient.set(row.client_id, new Set<string>());
          }
          logsByClient.get(row.client_id)?.add(row.log_date);
        });

        const atRisk = clients
          .map((client) => {
            const todayStr = todayMap.get(client.id) ?? getTodayInTimezone(client.timezone ?? null);
            const startStr = startMap.get(client.id) ?? addDaysToDateString(todayStr, -6);
            const logDates = logsByClient.get(client.id) ?? new Set<string>();
            const filteredDates = Array.from(logDates).filter(
              (date) => date >= startStr && date <= todayStr
            );
            const missingHabitDays = Math.max(0, 7 - filteredDates.length);

            const latestCheckinDate = latestCheckins.get(client.id) ?? null;
            const lastSaturday = getLastSaturday(todayStr);
            const isPastSaturday = diffDays(todayStr, lastSaturday) >= 1;
            const checkinOverdue =
              isPastSaturday && (!latestCheckinDate || latestCheckinDate < lastSaturday);

            const name = client.display_name?.trim()
              ? client.display_name
              : `Client ${client.user_id.slice(0, 6)}`;

            return { id: client.id, name, missingHabitDays, checkinOverdue };
          })
          .filter((row) => row.missingHabitDays >= 2 || row.checkinOverdue);

        setAtRiskClients(atRisk);
      } catch (error: any) {
        console.error("Failed to load at-risk clients", error);
        setAtRiskError(error?.message ?? "Failed to load at-risk clients.");
      } finally {
        setAtRiskLoading(false);
      }
    };

    loadAtRisk();
  }, [clients]);

  const queueSections = useMemo(() => {
    const formatted = clients.map((client) => {
      const name = client.display_name?.trim()
        ? client.display_name
        : `Client ${client.user_id.slice(0, 6)}`;

      const created = client.created_at ? new Date(client.created_at) : null;

      const tag = Array.isArray(client.tags) && client.tags.length > 0 ? client.tags[0] : null;

      return {
        name,
        tag,
        statusText: client.status ?? "active",
        lastActivity: created ? `Added ${created.toLocaleDateString()}` : "Recently added",
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
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{item.name}</div>
                            {item.tag ? (
                              <Badge variant="secondary" className="text-xs">
                                {item.tag}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.statusText} • {item.lastActivity}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              (item as any).badge === "warning"
                                ? "secondary"
                                : (item as any).badge === "destructive"
                                ? "destructive"
                                : "default"
                            }
                          >
                            {(item as any).badge === "warning"
                              ? "Due"
                              : (item as any).badge === "destructive"
                              ? "At risk"
                              : "Review"}
                          </Badge>
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
              <CardTitle className="text-base">At-risk clients</CardTitle>
              <p className="text-sm text-muted-foreground">
                Missing habits or overdue check-ins this week.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {atRiskError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {atRiskError}
                </div>
              ) : null}

              {atRiskLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : atRiskClients.length > 0 ? (
                atRiskClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <div>
                      <div className="text-sm font-semibold">{client.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {client.missingHabitDays} missing habit log
                        {client.missingHabitDays === 1 ? "" : "s"} (7d)
                        {client.checkinOverdue ? " • Check-in overdue" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/pt/clients/${client.id}`)}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/pt/clients/${client.id}?tab=messages`)}
                      >
                        Message
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  No at-risk clients right now.
                </div>
              )}
            </CardContent>
          </Card>

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
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--accent))"
                    strokeWidth={2}
                    dot={false}
                  />
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
