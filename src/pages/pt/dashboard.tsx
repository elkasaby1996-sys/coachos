import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
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
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import { DashboardCard } from "../../components/pt/dashboard/DashboardCard";
import { StatCard } from "../../components/pt/dashboard/StatCard";
import { ClientRow } from "../../components/pt/dashboard/ClientRow";
import { StatusPill } from "../../components/pt/dashboard/StatusPill";
import { MiniSparkline } from "../../components/pt/dashboard/MiniSparkline";
import { EmptyState } from "../../components/ui/coachos";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";
import { formatRelativeTime } from "../../lib/relative-time";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import {
  checkinOperationalStatusMap,
  getCheckinOperationalState,
} from "../../lib/checkin-review";
import type { ClientOnboardingStatus } from "../../features/client-onboarding/types";

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
  reviewed_at: string | null;
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

type CoachTodo = {
  id: string;
  title: string;
  is_done: boolean;
  created_at: string | null;
};

type OnboardingRow = {
  client_id: string;
  status: ClientOnboardingStatus;
};

export function PtDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEnabled = true;
  const {
    workspaceId: cachedWorkspaceId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [assignedWorkouts, setAssignedWorkouts] = useState<
    AssignedWorkoutRow[]
  >([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [onboardingRows, setOnboardingRows] = useState<OnboardingRow[]>([]);
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
      if (workspaceLoading) {
        setIsLoading(true);
        return;
      }
      setIsLoading(true);
      setLoadError(null);

      try {
        if (!cachedWorkspaceId) {
          setLoadError("Workspace not found for this PT.");
          setIsLoading(false);
          return;
        }
        setWorkspaceId(cachedWorkspaceId);

        const { data, error } = await supabase.rpc("pt_dashboard_summary", {
          p_workspace_id: cachedWorkspaceId,
          p_coach_id: user.id,
        });
        if (error) throw error;

        const summary = data as {
          clients: ClientRecord[];
          assignedWorkouts: AssignedWorkoutRow[];
          checkins: CheckinRow[];
          messages: MessageRow[];
          unreadCount: number;
          coachTodos: CoachTodo[];
        };
        setClients(summary?.clients ?? []);
        setAssignedWorkouts(summary?.assignedWorkouts ?? []);
        setCheckins(summary?.checkins ?? []);
        setMessages(messagesEnabled ? (summary?.messages ?? []) : []);
        setUnreadCount(messagesEnabled ? (summary?.unreadCount ?? 0) : 0);
        setCoachTodos(summary?.coachTodos ?? []);

        const clientIds = (summary?.clients ?? []).map((client) => client.id);
        if (clientIds.length > 0) {
          const { data: onboardingData, error: onboardingError } =
            await supabase.rpc("ensure_workspace_client_onboardings", {
              p_workspace_id: cachedWorkspaceId,
              p_client_ids: clientIds,
            });
          if (onboardingError) throw onboardingError;
          setOnboardingRows((onboardingData ?? []) as OnboardingRow[]);
        } else {
          setOnboardingRows([]);
        }
      } catch (error: any) {
        setLoadError(error?.message ?? "Failed to load dashboard.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [cachedWorkspaceId, messagesEnabled, user?.id, workspaceLoading]);

  useEffect(() => {
    if (workspaceError) {
      setLoadError(workspaceError.message);
    }
  }, [workspaceError]);

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
        prev.map((row) => (row.id === todo.id ? (data as CoachTodo) : row)),
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
        prev.map((row) => (row.id === todo.id ? (data as CoachTodo) : row)),
      );
    }
    setTodoBusyId(null);
  };

  const deleteTodo = async (todo: CoachTodo) => {
    setTodoBusyId(todo.id);
    const { error } = await supabase
      .from("coach_todos")
      .delete()
      .eq("id", todo.id);
    if (!error) {
      setCoachTodos((prev) => prev.filter((row) => row.id !== todo.id));
    }
    setTodoBusyId(null);
  };

  const activeClientsCount = useMemo(
    () =>
      clients.filter(
        (client) => (client.status ?? "active").toLowerCase() === "active",
      ).length,
    [clients],
  );

  const adherencePercent = useMemo(() => {
    if (assignedWorkouts.length === 0) return 0;
    const planned = assignedWorkouts.length;
    const completed = assignedWorkouts.filter(
      (row) => row.status === "completed",
    ).length;
    return planned === 0 ? 0 : Math.round((completed / planned) * 100);
  }, [assignedWorkouts]);

  const checkinsTodayCount = useMemo(() => {
    if (checkins.length === 0) return 0;
    const todayStr = getTodayInTimezone(null);
    return checkins.filter(
      (checkin) =>
        getCheckinOperationalState(checkin, todayStr) === "due" &&
        checkin.week_ending_saturday === todayStr,
    ).length;
  }, [checkins]);

  const upcomingCheckins = useMemo(() => {
    const todayStr = getTodayInTimezone(null);
    const end = addDaysToDateString(todayStr, 7);
    return checkins
      .map((row) => ({
        ...row,
        due: row.week_ending_saturday ?? row.created_at ?? todayStr,
        state: getCheckinOperationalState(row, todayStr),
      }))
      .filter(
        (row) =>
          row.due &&
          row.due >= todayStr &&
          row.due <= end &&
          (row.state === "due" || row.state === "upcoming"),
      )
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 5);
  }, [checkins]);

  const clientRows = useMemo(
    () =>
      clients.map((client) => {
        const name = client.display_name?.trim()
          ? client.display_name
          : `Client ${client.user_id.slice(0, 6)}`;
        const onboardingStatus =
          onboardingRows.find((row) => row.client_id === client.id)?.status ??
          null;
        return {
          id: client.id,
          name,
          status: client.status ?? "active",
          onboardingStatus,
          joined: client.created_at
            ? formatRelativeTime(client.created_at)
            : "Recently",
          adherence: adherencePercent ? `${adherencePercent}%` : "—",
        };
      }),
    [clients, adherencePercent, onboardingRows],
  );

  const onboardingCounts = useMemo(() => {
    return {
      inProgress: onboardingRows.filter(
        (row) => row.status === "invited" || row.status === "in_progress",
      ).length,
      reviewQueue: onboardingRows.filter(
        (row) =>
          row.status === "review_needed" ||
          row.status === "submitted" ||
          row.status === "partially_activated",
      ).length,
      completed: onboardingRows.filter((row) => row.status === "completed")
        .length,
    };
  }, [onboardingRows]);

  const onboardingQueueClients = useMemo(
    () =>
      clientRows.filter(
        (client) =>
          client.onboardingStatus === "review_needed" ||
          client.onboardingStatus === "submitted" ||
          client.onboardingStatus === "partially_activated",
      ),
    [clientRows],
  );

  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, done: !task.done } : task,
      ),
    );
  };

  const visibleClients = clientRows.slice(0, 6);
  const messageRows = messages.slice(0, 5);
  const quickActions = [
    {
      id: "program",
      label: "New program",
      helper: "Build a new training block",
      icon: Plus,
      onClick: () => navigate("/pt/programs/new"),
    },
    {
      id: "reports",
      label: "Reports",
      helper: "Jump into performance review",
      icon: Rocket,
      onClick: () => navigate("/pt/reports"),
    },
    {
      id: "message",
      label: "Message",
      helper: "Open the conversation flow",
      icon: MessageCircle,
      onClick: () => navigate("/pt/messages"),
    },
  ] as const;

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Coach Dashboard"
        description="Track client activity, queues, and the next coaching action."
        className="py-3.5 sm:py-4"
      />

      {loadError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Dashboard error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => (
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
              label="Review queue"
              value={onboardingCounts.reviewQueue}
              helper="Needs onboarding review"
              icon={ClipboardCheck}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/pt/clients")}
              >
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
                    onboardingStatus={client.onboardingStatus}
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
              </div>
            ) : (
              <EmptyState
                title="No clients yet"
                description="Invite your first client to get started."
              />
            )}
          </DashboardCard>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <DashboardCard
            title="Onboarding Queue"
            subtitle="Intake and activation states across the workspace"
            className="border-primary/10"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/pt/clients")}
              >
                Open clients
              </Button>
            }
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="surface-subtle rounded-2xl px-3 py-3 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      In progress
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {onboardingCounts.inProgress}
                    </p>
                  </div>
                  <div className="surface-subtle rounded-2xl px-3 py-3 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Review queue
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {onboardingCounts.reviewQueue}
                    </p>
                  </div>
                  <div className="surface-subtle rounded-2xl px-3 py-3 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Completed
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {onboardingCounts.completed}
                    </p>
                  </div>
                </div>
                {onboardingQueueClients.length > 0 ? (
                  <div className="space-y-2">
                    {onboardingQueueClients.slice(0, 4).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() =>
                          navigate(`/pt/clients/${client.id}?tab=onboarding`)
                        }
                        className="surface-subtle flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:border-border hover:bg-background/70"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{client.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Joined {client.joined}
                          </p>
                        </div>
                        <StatusPill status={client.onboardingStatus} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No onboarding queue"
                    description="No clients currently need onboarding review."
                  />
                )}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Upcoming Check-ins"
            subtitle="Queue for the next 7 days"
            className="border-primary/10"
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
              <div className="space-y-2.5">
                {upcomingCheckins.map((row) => {
                  const client = clients.find(
                    (item) => item.id === row.client_id,
                  );
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
                      className="surface-subtle flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Check-in queue
                        </p>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          Check-in due
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill
                          status={row.state}
                          statusMap={checkinOperationalStatusMap}
                        />
                        <Badge variant="secondary" className="text-[10px]">
                          {dueLabel}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No check-ins scheduled"
                description="Nothing upcoming in the next 7 days."
              />
            )}
          </DashboardCard>

          <DashboardCard
            title="Today's Tasks"
            subtitle="Checklist for quick wins"
            className="border-border/80"
          >
            <div className="space-y-2.5">
              {tasks.map((task) => (
                <label
                  key={task.id}
                  className="surface-subtle flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(task.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span
                      className={
                        task.done ? "line-through text-muted-foreground" : ""
                      }
                    >
                      {task.label}
                    </span>
                  </div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Action
                  </span>
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
                  className="surface-subtle flex items-start justify-between gap-3 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {message.sender_name ?? "Client"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {message.preview ?? "No preview available"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {message.created_at
                        ? formatRelativeTime(message.created_at)
                        : "Recently"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No messages yet"
              description="New client conversations will show up here."
            />
          )}
        </DashboardCard>

        <DashboardCard title="Quick Actions" subtitle="Operational shortcuts">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  className="surface-subtle group flex min-h-[88px] items-start justify-between px-4 py-3 text-left text-sm transition hover:border-border hover:bg-background/70"
                >
                  <div className="space-y-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/75 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {action.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {action.helper}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
                </button>
              );
            })}
            <InviteClientDialog
              trigger={
                <button
                  type="button"
                  className="surface-subtle group flex min-h-[88px] items-start justify-between px-4 py-3 text-left text-sm transition hover:border-border hover:bg-background/70"
                >
                  <div className="space-y-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/75 text-primary">
                      <ClipboardCheck className="h-4 w-4" />
                    </span>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        Invite client
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Bring a new client into the workspace
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
                </button>
              }
            />
          </div>
        </DashboardCard>

        <DashboardCard
          title="To-Do list"
          subtitle="Utility list for coach tasks"
          className="border-border/80"
        >
          <div className="space-y-3">
            <div className="surface-subtle flex items-center gap-2 px-2 py-2">
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
                className="h-9 border-transparent bg-transparent shadow-none"
              />
              <Button
                size="sm"
                onClick={() => void addTodo()}
                disabled={!todoDraft.trim()}
              >
                Add
              </Button>
            </div>
            {coachTodos.length === 0 ? (
              <EmptyState
                title="No tasks yet"
                description="Add a coach task to keep your next action visible."
              />
            ) : (
              <div className="space-y-2">
                {coachTodos.map((todo) => {
                  const draft = todoEdits[todo.id] ?? todo.title;
                  return (
                    <div
                      key={todo.id}
                      className="surface-subtle flex items-center gap-2 px-3 py-2.5 text-sm"
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
                          todo.is_done
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
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
