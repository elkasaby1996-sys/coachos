import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ClipboardCheck,
  MessageCircle,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Input } from "../../components/ui/input";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";
import { DashboardCard } from "../../components/pt/dashboard/DashboardCard";
import { StatCard } from "../../components/pt/dashboard/StatCard";
import { ClientRow } from "../../components/pt/dashboard/ClientRow";
import { StatusPill } from "../../components/pt/dashboard/StatusPill";
import { MiniSparkline } from "../../components/pt/dashboard/MiniSparkline";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
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
  week_ending_saturday: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

type MessageRow = {
  id: string;
  created_at: string | null;
  sender_name: string | null;
  preview: string | null;
  unread: boolean | null;
};

type TaskItem = {
  id: string;
  label: string;
  done: boolean;
};

type CoachTodo = {
  id: string;
  title: string;
  is_done: boolean;
  created_at: string | null;
};

export function PtDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEnabled = Boolean(import.meta.env.VITE_MESSAGES_ENABLED);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [assignedWorkouts, setAssignedWorkouts] = useState<AssignedWorkoutRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [coachTodos, setCoachTodos] = useState<CoachTodo[]>([]);
  const [todoDraft, setTodoDraft] = useState("");
  const [todoBusyId, setTodoBusyId] = useState<string | null>(null);
  const [todoEdits, setTodoEdits] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<TaskItem[]>([
    { id: "task-1", label: "Review check-ins", done: false },
    { id: "task-2", label: "Reply to messages", done: false },
    { id: "task-3", label: "Adjust active programs", done: false },
    { id: "task-4", label: "Prep next week", done: false },
  ]);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setLoadError(null);

      try {
        const resolvedWorkspaceId = await getWorkspaceIdForUser(user.id);
        if (!resolvedWorkspaceId) {
          setLoadError("Workspace not found for this PT.");
          setIsLoading(false);
          return;
        }
        setWorkspaceId(resolvedWorkspaceId);

        const { data: clientRows, error: clientError } = await supabase
          .from("clients")
          .select("id, workspace_id, user_id, status, display_name, created_at, tags, timezone")
          .eq("workspace_id", resolvedWorkspaceId)
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

        const [assignedResponse, checkinResponse, messageResponse, todosResponse] = await Promise.all([
          supabase
            .from("assigned_workouts")
            .select("id, client_id, status, scheduled_date")
            .in("client_id", clientIds)
            .gte("scheduled_date", startWeek)
            .lte("scheduled_date", todayStr),
          supabase
            .from("checkins")
            .select("id, client_id, week_ending_saturday, submitted_at, created_at")
            .in("client_id", clientIds)
            .gte("week_ending_saturday", startWeek)
            .lte("week_ending_saturday", endWeek),
          // TODO: Replace with real messages table or messaging RPC when available.
          messagesEnabled
            ? supabase
                .from("messages")
                .select("id, created_at, sender_name, preview, unread")
                .limit(5)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("coach_todos")
            .select("id, title, is_done, created_at")
            .eq("workspace_id", resolvedWorkspaceId)
            .eq("coach_id", user.id)
            .order("created_at", { ascending: true }),
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

        if (!todosResponse.error) {
          setCoachTodos((todosResponse.data ?? []) as CoachTodo[]);
        } else {
          setCoachTodos([]);
        }

        if (messagesEnabled) {
          const unreadResponse = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("unread", true);
          if (!unreadResponse.error) {
            setUnreadCount(unreadResponse.count ?? 0);
          } else {
            setUnreadCount(0);
          }
        } else {
          setUnreadCount(0);
        }
      } catch (error: any) {
        setLoadError(error?.message ?? "Failed to load dashboard.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [user?.id]);

  const addTodo = async () => {
    if (!user?.id || !workspaceId || !todoDraft.trim()) return;
    const title = todoDraft.trim();
    setTodoDraft("");
    const { data, error } = await supabase
      .from("coach_todos")
      .insert({ title, coach_id: user.id, workspace_id: workspaceId })
      .select("id, title, is_done, created_at")
      .single();
    if (!error && data) {
      setCoachTodos((prev) => [...prev, data as CoachTodo]);
    }
  };

  const toggleTodo = async (todo: CoachTodo) => {
    setTodoBusyId(todo.id);
    const { data, error } = await supabase
      .from("coach_todos")
      .update({ is_done: !todo.is_done })
      .eq("id", todo.id)
      .select("id, title, is_done, created_at")
      .single();
    if (!error && data) {
      setCoachTodos((prev) =>
        prev.map((row) => (row.id === todo.id ? (data as CoachTodo) : row))
      );
    }
    setTodoBusyId(null);
  };

  const updateTodoTitle = async (todo: CoachTodo, title: string) => {
    setTodoBusyId(todo.id);
    const trimmed = title.trim();
    if (!trimmed) {
      await deleteTodo(todo);
      return;
    }
    const { data, error } = await supabase
      .from("coach_todos")
      .update({ title: trimmed })
      .eq("id", todo.id)
      .select("id, title, is_done, created_at")
      .single();
    if (!error && data) {
      setCoachTodos((prev) =>
        prev.map((row) => (row.id === todo.id ? (data as CoachTodo) : row))
      );
    }
    setTodoBusyId(null);
  };

  const deleteTodo = async (todo: CoachTodo) => {
    setTodoBusyId(todo.id);
    const { error } = await supabase.from("coach_todos").delete().eq("id", todo.id);
    if (!error) {
      setCoachTodos((prev) => prev.filter((row) => row.id !== todo.id));
    }
    setTodoBusyId(null);
  };

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
      const weekEnding = checkin.week_ending_saturday ?? "";
      return weekEnding === currentSaturday && !checkin.submitted_at;
    }).length;
  }, [checkins]);

  const upcomingCheckins = useMemo(() => {
    const todayStr = getTodayInTimezone(null);
    const end = addDaysToDateString(todayStr, 7);
    return checkins
      .map((row) => ({
        ...row,
        due: row.week_ending_saturday ?? row.created_at ?? todayStr,
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

  const visibleClients = clientRows.slice(0, 6);
  const messageRows = messages.slice(0, 5);

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
            <StatCard
              label="Active clients"
              value={activeClientsCount}
              helper="Roster size"
              icon={Sparkles}
              sparkline={<MiniSparkline />}
            />
            <StatCard
              label="Avg adherence"
              value={`${adherencePercent}%`}
              helper="Last 7 days"
              icon={Rocket}
              accent
              sparkline={<MiniSparkline />}
            />
            <StatCard
              label="Unread messages"
              value={unreadCount}
              helper="Needs replies"
              icon={MessageCircle}
              sparkline={<MiniSparkline />}
            />
            <StatCard
              label="Check-ins today"
              value={checkinsTodayCount}
              helper="Due now"
              icon={CalendarDays}
              sparkline={<MiniSparkline />}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <DashboardCard
            title="Client Overview"
            subtitle="Recent activity and adherence"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("/pt/clients")}>
                View all
              </Button>
            }
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : visibleClients.length > 0 ? (
              <div className="space-y-2">
                {visibleClients.map((client) => (
                  <ClientRow
                    key={client.id}
                    name={client.name}
                    joined={client.joined}
                    adherence={client.adherence}
                    status={client.status}
                    onClick={() => navigate(`/pt/clients/${client.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-6 text-sm text-muted-foreground">
                No clients yet. Invite your first client to get started.
              </div>
            )}
          </DashboardCard>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <DashboardCard
            title="Upcoming Check-ins"
            subtitle="Next 7 days"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/pt/checkins")}
              >
                View queue
              </Button>
            }
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
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
                      <StatusPill status="pending" />
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

          <DashboardCard title="Today's Tasks" subtitle="Quick wins">
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
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DashboardCard title="Recent Messages" subtitle="Latest 5 threads">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : messageRows.length > 0 ? (
            <div className="space-y-2">
              {messageRows.map((message) => (
                <div
                  key={message.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{message.sender_name ?? "Client"}</p>
                    <p className="text-xs text-muted-foreground">
                      {message.preview ?? "No preview available"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {message.created_at ? formatRelativeTime(message.created_at) : "Recently"}
                    </p>
                  </div>
                  {message.unread ? (
                    <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              No messages yet.
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Quick Actions" subtitle="Shortcuts">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate("/pt/programs/new")}
              className="flex flex-col items-start gap-2 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-sm transition hover:border-border hover:bg-muted/40"
            >
              <Plus className="h-4 w-4 text-primary" />
              New program
            </button>
            <InviteClientDialog
              trigger={
                <button
                  type="button"
                  className="flex flex-col items-start gap-2 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-sm transition hover:border-border hover:bg-muted/40"
                >
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  Invite client
                </button>
              }
            />
            <button
              type="button"
              onClick={() => navigate("/pt/reports")}
              className="flex flex-col items-start gap-2 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-sm transition hover:border-border hover:bg-muted/40"
            >
              <Rocket className="h-4 w-4 text-primary" />
              Reports
            </button>
            <button
              type="button"
              onClick={() => navigate("/pt/messages")}
              className="flex flex-col items-start gap-2 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-sm transition hover:border-border hover:bg-muted/40"
            >
              <MessageCircle className="h-4 w-4 text-primary" />
              Message
            </button>
          </div>
        </DashboardCard>

        <DashboardCard title="To-Do list" subtitle="Coach tasks">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={todoDraft}
                onChange={(event) => setTodoDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addTodo();
                  }
                }}
                placeholder="Add a new task"
              />
              <Button onClick={() => void addTodo()} disabled={!todoDraft.trim()}>
                Add
              </Button>
            </div>
            {coachTodos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                No tasks yet.
              </div>
            ) : (
              <div className="space-y-2">
                {coachTodos.map((todo) => {
                  const draft = todoEdits[todo.id] ?? todo.title;
                  return (
                    <div
                      key={todo.id}
                      className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={todo.is_done}
                        onChange={() => void toggleTodo(todo)}
                        className="h-4 w-4 accent-primary"
                        disabled={todoBusyId === todo.id}
                      />
                      <input
                        value={draft}
                        onChange={(event) =>
                          setTodoEdits((prev) => ({
                            ...prev,
                            [todo.id]: event.target.value,
                          }))
                        }
                        onBlur={() => {
                          if (draft !== todo.title) {
                            void updateTodoTitle(todo, draft);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void updateTodoTitle(todo, draft);
                          }
                        }}
                        className={`w-full bg-transparent text-sm outline-none ${
                          todo.is_done ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                        disabled={todoBusyId === todo.id}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void deleteTodo(todo)}
                        disabled={todoBusyId === todo.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
