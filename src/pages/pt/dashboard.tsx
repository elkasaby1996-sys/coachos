import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ClipboardCheck,
  MessageCircle,
  Plus,
  Rocket,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";
import { formatRelativeTime } from "../../lib/relative-time";
import { addDaysToDateString, getLastSaturday, getTodayInTimezone } from "../../lib/date-utils";

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

type AssignedWorkoutRow = {
  id: string;
  client_id: string;
  status: string | null;
  scheduled_date: string | null;
};

type CheckinRow = {
  id: string;
  client_id: string | null;
  due_date: string | null;
  week_ending_saturday: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

type MessageRow = {
  id: string;
  created_at: string | null;
  sender_name: string | null;
  preview: string | null;
};

type TaskItem = {
  id: string;
  label: string;
  done: boolean;
};

const makeInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

const statusPill = (status: string | null) => {
  const normalized = status?.toLowerCase() ?? "active";
  if (normalized === "active") return { label: "Active", variant: "success" as const };
  if (normalized === "inactive") return { label: "Inactive", variant: "muted" as const };
  if (normalized === "paused") return { label: "Paused", variant: "warning" as const };
  if (normalized === "at risk") return { label: "At risk", variant: "danger" as const };
  return { label: "Active", variant: "success" as const };
};

function DashboardCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card/80">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Card
      className={
        accent
          ? "border-primary/40 bg-card/90 shadow-glow"
          : "border-border/70 bg-card/80"
      }
    >
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="uppercase tracking-[0.25em]">{label}</span>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </CardHeader>
    </Card>
  );
}

export function PtDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [assignedWorkouts, setAssignedWorkouts] = useState<AssignedWorkoutRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tasks, setTasks] = useState<TaskItem[]>([
    { id: "task-1", label: "Review weekly check-ins", done: false },
    { id: "task-2", label: "Update active programs", done: false },
    { id: "task-3", label: "Send follow-up messages", done: false },
  ]);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user?.id) return;
      setIsLoading(true);
      setLoadError(null);

      try {
        const workspaceId = await getWorkspaceIdForUser(user.id);
        if (!workspaceId) throw new Error("Workspace not found for this PT.");

        const { data: clientRows, error: clientError } = await supabase
          .from("clients")
          .select("id, workspace_id, user_id, status, display_name, created_at, tags, timezone")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false });

        if (clientError) throw clientError;
        const clientList = (clientRows ?? []) as ClientRecord[];
        setClients(clientList);

        const clientIds = clientList.map((client) => client.id);
        if (clientIds.length === 0) {
          setAssignedWorkouts([]);
          setCheckins([]);
          setMessages([]);
          setUnreadCount(0);
          setIsLoading(false);
          return;
        }

        const todayStr = getTodayInTimezone(null);
        const startWeek = addDaysToDateString(todayStr, -6);
        const endWeek = addDaysToDateString(todayStr, 6);

        const [assignedResponse, checkinResponse, messageResponse] = await Promise.all([
          supabase
            .from("assigned_workouts")
            .select("id, client_id, status, scheduled_date")
            .in("client_id", clientIds)
            .gte("scheduled_date", startWeek)
            .lte("scheduled_date", todayStr),
          supabase
            .from("checkins")
            .select("id, client_id, due_date, week_ending_saturday, submitted_at, created_at")
            .in("client_id", clientIds)
            .gte("due_date", startWeek)
            .lte("due_date", endWeek),
          supabase
            .from("messages")
            .select("id, created_at, sender_name, preview")
            .limit(5),
        ]);

        if (!assignedResponse.error) {
          setAssignedWorkouts((assignedResponse.data ?? []) as AssignedWorkoutRow[]);
        } else {
          setAssignedWorkouts([]);
        }

        if (!checkinResponse.error) {
          setCheckins((checkinResponse.data ?? []) as CheckinRow[]);
        } else {
          setCheckins([]);
        }

        if (!messageResponse.error) {
          setMessages((messageResponse.data ?? []) as MessageRow[]);
        } else {
          setMessages([]);
        }

        const unreadResponse = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("unread", true);
        if (!unreadResponse.error) {
          setUnreadCount(unreadResponse.count ?? 0);
        } else {
          setUnreadCount(0);
        }
      } catch (error: any) {
        console.error("Failed to load PT dashboard", error);
        setLoadError(error?.message ?? "Failed to load dashboard.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [user?.id]);

  const activeClientsCount = useMemo(
    () => clients.filter((client) => (client.status ?? "active").toLowerCase() === "active").length,
    [clients]
  );

  const adherencePercent = useMemo(() => {
    if (assignedWorkouts.length === 0) return 0;
    const planned = assignedWorkouts.length;
    const completed = assignedWorkouts.filter((row) => row.status === "completed").length;
    return planned === 0 ? 0 : Math.round((completed / planned) * 100);
  }, [assignedWorkouts]);

  const checkinsTodayCount = useMemo(() => {
    if (checkins.length === 0) return 0;
    const todayStr = getTodayInTimezone(null);
    const currentSaturday = getLastSaturday(todayStr);
    return checkins.filter((checkin) => {
      const due = checkin.due_date ?? "";
      const weekEnding = checkin.week_ending_saturday ?? "";
      if (due === todayStr) return true;
      return weekEnding === currentSaturday && !checkin.submitted_at;
    }).length;
  }, [checkins]);

  const upcomingCheckins = useMemo(() => {
    const todayStr = getTodayInTimezone(null);
    const end = addDaysToDateString(todayStr, 7);
    return checkins
      .map((row) => ({
        ...row,
        due: row.due_date ?? row.week_ending_saturday ?? row.created_at ?? todayStr,
      }))
      .filter((row) => row.due && row.due >= todayStr && row.due <= end)
      .slice(0, 5);
  }, [checkins]);

  const clientRows = useMemo(
    () =>
      clients.map((client) => {
        const name = client.display_name?.trim()
          ? client.display_name
          : `Client ${client.user_id.slice(0, 6)}`;
        return {
          id: client.id,
          name,
          status: client.status ?? "active",
          joined: client.created_at ? formatRelativeTime(client.created_at) : "Recently",
          adherence: adherencePercent ? `${adherencePercent}%` : "—",
        };
      }),
    [clients, adherencePercent]
  );

  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            CoachOS Pro
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Coach Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Here's what's happening with your clients today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">Clear today's queue</Button>
          <Button>Schedule check-in</Button>
        </div>
      </div>

      {loadError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Dashboard error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{loadError}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))
        ) : (
          <>
            <StatCard label="Active clients" value={activeClientsCount} helper="Roster size" icon={Sparkles} />
            <StatCard
              label="Avg adherence"
              value={`${adherencePercent}%`}
              helper="Last 7 days"
              icon={Rocket}
              accent
            />
            <StatCard label="Unread messages" value={unreadCount} helper="Needs replies" icon={MessageCircle} />
            <StatCard label="Check-ins today" value={checkinsTodayCount} helper="Due now" icon={CalendarDays} />
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <DashboardCard
            title="Client overview"
            subtitle="Adherence and recent activity"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("/pt/clients")}>
                View all
              </Button>
            }
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : clientRows.length > 0 ? (
              <div className="space-y-2">
                {clientRows.map((client) => {
                  const pill = statusPill(client.status);
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => navigate(`/pt/clients/${client.id}`)}
                      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/40 px-4 py-3 text-left transition hover:border-border hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/70 text-xs font-semibold">
                          {makeInitials(client.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{client.name}</p>
                            <Badge variant={pill.variant} className="text-[10px] uppercase">
                              {pill.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">Joined {client.joined}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Adherence</p>
                        <p className="text-sm font-semibold text-accent">{client.adherence}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-6 text-sm text-muted-foreground">
                No clients yet. Invite your first client to get started.
              </div>
            )}
          </DashboardCard>
        </div>

        <div className="space-y-4 xl:col-span-3">
          <DashboardCard
            title="Upcoming check-ins"
            subtitle="Next 7 days"
            action={<Button variant="ghost" size="sm">View calendar</Button>}
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : upcomingCheckins.length > 0 ? (
              <div className="space-y-2">
                {upcomingCheckins.map((row) => {
                  const client = clients.find((item) => item.id === row.client_id);
                  const name = client?.display_name?.trim()
                    ? client.display_name
                    : "Client";
                  const dueDate = row.due ? new Date(row.due) : null;
                  const dueLabel = dueDate
                    ? dueDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "Soon";
                  return (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-background/40 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">Check-in due</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {dueLabel}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                No check-ins scheduled.
              </div>
            )}
          </DashboardCard>

          <DashboardCard title="Today's tasks" subtitle="Quick wins">
            <div className="space-y-2">
              {tasks.map((task) => (
                <label
                  key={task.id}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm"
                >
                  <span className={task.done ? "line-through text-muted-foreground" : ""}>
                    {task.label}
                  </span>
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => toggleTask(task.id)}
                  />
                </label>
              ))}
            </div>
          </DashboardCard>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <DashboardCard title="Recent messages" subtitle="Last 5 threads">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : messages.length > 0 ? (
              <div className="space-y-2">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className="rounded-xl border border-border/70 bg-background/40 px-3 py-2"
                  >
                    <p className="text-sm font-medium">{message.sender_name ?? "Client"}</p>
                    <p className="text-xs text-muted-foreground">
                      {message.preview ?? "No preview available"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                No messages yet.
              </div>
            )}
          </DashboardCard>

          <DashboardCard title="Quick actions" subtitle="Shortcut tools">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => navigate("/pt/programs")}
                className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm transition hover:border-border hover:bg-muted/40"
              >
                <Plus className="h-4 w-4 text-primary" />
                New program
              </button>
              <InviteClientDialog
                trigger={
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm transition hover:border-border hover:bg-muted/40"
                  >
                    <ClipboardCheck className="h-4 w-4 text-primary" />
                    Invite client
                  </button>
                }
              />
              <button
                type="button"
                onClick={() => navigate("/pt/reports")}
                className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm transition hover:border-border hover:bg-muted/40"
              >
                <Rocket className="h-4 w-4 text-primary" />
                Reports
              </button>
              <button
                type="button"
                onClick={() => navigate("/pt/messages")}
                className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm transition hover:border-border hover:bg-muted/40"
              >
                <MessageCircle className="h-4 w-4 text-primary" />
                Message
              </button>
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}