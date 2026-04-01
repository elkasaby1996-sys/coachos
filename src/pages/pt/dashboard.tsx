import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  MessageCircle,
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
import { StatusPill } from "../../components/pt/dashboard/StatusPill";
import { EmptyState } from "../../components/ui/coachos";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
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

type AttentionTone = "neutral" | "warning" | "danger";

type ClientAttentionRow = {
  id: string;
  name: string;
  lifecycle: string;
  lifecycleTone: AttentionTone;
  onboardingLabel: string | null;
  onboardingStatus: ClientOnboardingStatus | null;
  checkinState: string | null;
  attentionLabel: string;
  attentionTone: AttentionTone;
  attentionScore: number;
  lastActivityLabel: string;
  adherenceValue: number | null;
  nextActionLabel: string;
  signalLabel: string;
};

type CheckinRowWithState = CheckinRow & {
  due: string | null;
  state: string | null;
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

    void loadDashboard();
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

  const normalizeLabel = (value: string | null | undefined) => {
    if (!value?.trim()) return "Active";
    const normalized = value.trim().toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const dayDiffFromNow = (value: string | null | undefined) => {
    if (!value) return null;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return null;
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    return Math.max(0, Math.floor((today - ms) / (1000 * 60 * 60 * 24)));
  };

  const toneClassName = (tone: AttentionTone) =>
    tone === "danger"
      ? "border-destructive/30 text-destructive"
      : tone === "warning"
        ? "border-amber-300/40 text-amber-200"
        : "border-border text-muted-foreground";

  const activeClientsCount = useMemo(
    () =>
      clients.filter(
        (client) =>
          (client.status ?? "active").toLowerCase() === "active",
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

  const todayStr = useMemo(() => getTodayInTimezone(null), []);
  const upcomingWindowEnd = useMemo(
    () => addDaysToDateString(todayStr, 7),
    [todayStr],
  );

  const checkinRows = useMemo(() => {
    return checkins
      .map((row) => {
        const due = row.week_ending_saturday ?? row.created_at;
        return {
          ...row,
          due,
          state: due ? getCheckinOperationalState(row, todayStr) : null,
        } as CheckinRowWithState;
      })
      .filter((row) => Boolean(row.due))
      .sort((a, b) => {
        const dueA = a.due ?? "";
        const dueB = b.due ?? "";
        return dueA.localeCompare(dueB);
      });
  }, [checkins, todayStr]);

  const checkinDueNowCount = useMemo(
    () => checkinRows.filter((row) => row.state === "due").length,
    [checkinRows],
  );
  const checkinOverdueCount = useMemo(
    () => checkinRows.filter((row) => row.state === "overdue").length,
    [checkinRows],
  );
  const checkinSoonCount = useMemo(
    () =>
      checkinRows.filter((row) => {
        if (!row.due) return false;
        if (row.state !== "upcoming") return false;
        return row.due <= upcomingWindowEnd;
      }).length,
    [checkinRows, upcomingWindowEnd],
  );

  const checkinsTodayCount = useMemo(() => {
    if (checkinRows.length === 0) return 0;
    return checkinRows.filter(
      (checkin) =>
        getCheckinOperationalState(checkin, todayStr) === "due" &&
        checkin.week_ending_saturday === todayStr,
    ).length;
  }, [checkinRows, todayStr]);

  const recentCheckins = useMemo(() => checkinRows.slice(0, 4), [checkinRows]);

  const workoutStatsByClient = useMemo(() => {
    const stats = new Map<string, { total: number; completed: number }>();
    for (const row of assignedWorkouts) {
      if (!row.client_id) continue;
      const current = stats.get(row.client_id) ?? {
        total: 0,
        completed: 0,
      };
      current.total += 1;
      if (row.status === "completed") current.completed += 1;
      stats.set(row.client_id, current);
    }
    return stats;
  }, [assignedWorkouts]);

  const clientRows = useMemo(() => {
    const latestByClient = new Map<string, CheckinRowWithState>();
    for (const row of checkinRows) {
      if (!row.client_id) continue;
      const existing = latestByClient.get(row.client_id);
      if (!existing) {
        latestByClient.set(row.client_id, row);
        continue;
      }
      const existingDue = existing.week_ending_saturday ?? existing.created_at;
      const candidateDue = row.week_ending_saturday ?? row.created_at;
      if (!existingDue || !candidateDue) continue;
      if (candidateDue > existingDue) {
        latestByClient.set(row.client_id, row);
      }
    }

    const rows = clients.map((client) => {
      const name = client.display_name?.trim()
        ? client.display_name
        : `Client ${client.user_id.slice(0, 6)}`;
      const lifecycle = normalizeLabel(client.status);
      const lifecycleTone: AttentionTone =
        (client.status ?? "active").toLowerCase() === "active"
          ? "neutral"
          : "warning";
      const onboardingStatus =
        onboardingRows.find((row) => row.client_id === client.id)?.status ??
        null;
      const onboardingLabel =
        onboardingStatus && onboardingStatus !== "completed"
          ? normalizeLabel(onboardingStatus.replace("_", " "))
          : null;

      const latestCheckin = latestByClient.get(client.id);
      const checkinState = latestCheckin ? latestCheckin.state : null;

      const activityCandidates = [
        latestCheckin?.submitted_at,
        latestCheckin?.created_at,
        client.created_at,
      ].filter((value): value is string => Boolean(value));
      const lastActivityIso =
        activityCandidates
          .slice()
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
        null;

      const lastActivityLabel = lastActivityIso
        ? `Last ${formatRelativeTime(lastActivityIso)}`
        : "No activity";
      const inactivityDays = dayDiffFromNow(lastActivityIso);

      const workoutStats = workoutStatsByClient.get(client.id);
      const adherenceValue =
        workoutStats && workoutStats.total > 0
          ? Math.round((workoutStats.completed / workoutStats.total) * 100)
          : null;

      let attentionLabel = "Healthy";
      let attentionTone: AttentionTone = "neutral";
      let attentionScore = 0;

      if (
        onboardingStatus === "review_needed" ||
        onboardingStatus === "submitted"
      ) {
        attentionLabel = "Onboarding review";
        attentionTone = "danger";
        attentionScore = 95;
      } else if (
        onboardingStatus === "partially_activated" ||
        onboardingStatus === "in_progress" ||
        onboardingStatus === "invited"
      ) {
        attentionLabel = "Onboarding";
        attentionTone = "warning";
        attentionScore = 40;
      } else if (checkinState === "overdue") {
        attentionLabel = "Check-in overdue";
        attentionTone = "danger";
        attentionScore = 70;
      } else if (checkinState === "due") {
        attentionLabel = "Check-in due";
        attentionTone = "warning";
        attentionScore = 55;
      } else if (checkinState === "upcoming") {
        attentionLabel = "Upcoming check-in";
        attentionTone = "neutral";
        attentionScore = 20;
      } else if (inactivityDays !== null && inactivityDays >= 30) {
        attentionLabel = "Long idle gap";
        attentionTone = "warning";
        attentionScore = 35;
      } else if (inactivityDays !== null && inactivityDays >= 14) {
        attentionLabel = "Recent inactivity";
        attentionTone = "neutral";
        attentionScore = 15;
      }

      if (lifecycleTone === "warning" && attentionScore < 20) {
        attentionLabel = "Lifecycle review";
        attentionTone = "warning";
        attentionScore = Math.max(attentionScore, 20);
      }
      if (adherenceValue !== null && adherenceValue < 50) {
        attentionLabel = "Adherence low";
        attentionTone = "warning";
        attentionScore = Math.max(attentionScore, 25);
      }

      const nextActionLabel =
        onboardingStatus === "review_needed" || onboardingStatus === "submitted"
          ? "Review onboarding"
          : onboardingStatus === "partially_activated" ||
              onboardingStatus === "in_progress" ||
              onboardingStatus === "invited"
            ? "Finish onboarding"
            : checkinState === "overdue"
              ? "Review check-in"
              : checkinState === "due"
                ? "Prompt check-in"
                : adherenceValue !== null && adherenceValue < 50
                  ? "Adjust plan"
                  : inactivityDays !== null && inactivityDays >= 14
                    ? "Reach out"
                    : "Open profile";

      const signalLabel =
        adherenceValue !== null
          ? `${adherenceValue}% adherence`
          : onboardingLabel
            ? onboardingLabel
            : checkinState === "overdue"
              ? "Overdue check-in"
              : checkinState === "due"
                ? "Check-in due"
                : inactivityDays !== null && inactivityDays >= 14
                  ? `${inactivityDays}d idle`
                  : attentionLabel;

      return {
        id: client.id,
        name,
        lifecycle,
        lifecycleTone,
        onboardingLabel,
        onboardingStatus,
        checkinState,
        attentionLabel,
        attentionTone,
        attentionScore,
        lastActivityLabel,
        adherenceValue,
        nextActionLabel,
        signalLabel,
      } as ClientAttentionRow;
    });

    return rows.sort((a, b) => {
      if (b.attentionScore !== a.attentionScore) {
        return b.attentionScore - a.attentionScore;
      }
      return a.name.localeCompare(b.name);
    });
  }, [checkinRows, clients, onboardingRows, workoutStatsByClient]);

  const messageRows = messages.slice(0, 5);

  const clientPanelTitle = clientRows.some(
    (row) => row.attentionTone !== "neutral" || row.onboardingStatus !== null,
  )
    ? "Clients Needing Attention"
    : "Client Overview";
  const priorityClientRows = clientRows.slice(0, clientRows.length === 1 ? 1 : 6);
  const showSingleClientCard = priorityClientRows.length === 1;

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Coach Dashboard"
        className="py-2.5 sm:py-3"
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))
        ) : (
          <>
            <StatCard
              label="Clients"
              value={activeClientsCount}
              helper="Active"
              icon={Sparkles}
            />
            <StatCard
              label="Avg adherence"
              value={`${adherencePercent}%`}
              helper="7d"
              icon={Rocket}
            />
            <StatCard
              label="Unread messages"
              value={unreadCount}
              helper="Unread"
              icon={MessageCircle}
            />
            <StatCard
              label="Check-ins today"
              value={checkinsTodayCount}
              helper="Due"
              icon={CalendarDays}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 items-start xl:grid-cols-[minmax(0,1.7fr)_320px]">
        <div className="space-y-4">
          <DashboardCard
            className="self-start"
            title={clientPanelTitle}
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
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : priorityClientRows.length > 0 ? (
              <div className={showSingleClientCard ? "space-y-3" : "space-y-2"}>
                {priorityClientRows.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => navigate(`/pt/clients/${client.id}`)}
                    className={`surface-subtle group flex w-full items-start justify-between gap-3 text-left transition hover:border-border hover:bg-background/70 ${
                      showSingleClientCard
                        ? "rounded-2xl px-4 py-4"
                        : "px-3 py-2.5"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {client.name}
                        </p>
                        <span className="shrink-0 text-xs font-medium text-primary">
                          Open
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${toneClassName(
                            client.lifecycleTone,
                          )}`}
                        >
                          {client.lifecycle}
                        </span>
                        {client.onboardingLabel ? (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${toneClassName(
                              "warning",
                            )}`}
                          >
                            {client.onboardingLabel}
                          </span>
                        ) : null}
                        {client.checkinState ? (
                          <StatusPill
                            status={client.checkinState}
                            statusMap={checkinOperationalStatusMap}
                          />
                        ) : null}
                      </div>
                      <div
                        className={`mt-2 grid gap-1.5 ${
                          showSingleClientCard
                            ? "text-xs sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                            : "text-[11px] sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                        } text-muted-foreground`}
                      >
                        <span>{client.lastActivityLabel}</span>
                        <span>{client.signalLabel}</span>
                        <span>Next: {client.nextActionLabel}</span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] ${toneClassName(
                        client.attentionTone,
                      )}`}
                    >
                      {client.attentionLabel}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No clients yet"
                description="Invite one to build the client queue."
                action={
                  <InviteClientDialog
                    trigger={
                      <Button size="sm" onClick={() => {}}>
                        Invite client
                      </Button>
                    }
                  />
                }
                className="px-5 py-6"
              />
            )}
          </DashboardCard>

          <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <DashboardCard
              title="Recent Check-ins"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/pt/checkins")}
                >
                  Open queue
                </Button>
              }
            >
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentCheckins.length > 0 ? (
                <div className="space-y-2.5">
                  {recentCheckins.map((row) => {
                    const clientName =
                      clients.find((item) => item.id === row.client_id)?.display_name ??
                      "Client";
                    const dueLabel = row.due
                      ? new Date(row.due).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "Soon";
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => navigate("/pt/checkins")}
                        className="surface-subtle flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:border-border hover:bg-background/70"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{clientName}</p>
                          <p className="text-xs text-muted-foreground">
                            Due {dueLabel}
                          </p>
                        </div>
                        {row.state ? (
                          <StatusPill
                            status={row.state}
                            statusMap={checkinOperationalStatusMap}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No check-ins right now"
                  description="No queued check-ins."
                  className="px-5 py-5"
                />
              )}
            </DashboardCard>

            <DashboardCard
              title="Recent Messages"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/pt/messages")}
                >
                  Open inbox
                </Button>
              }
            >
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : messageRows.length > 0 ? (
                <div className={messageRows.length <= 2 ? "space-y-2" : "space-y-2.5"}>
                  {messageRows.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => navigate("/pt/messages")}
                      className={`surface-subtle flex w-full items-start justify-between gap-3 text-left transition hover:border-border hover:bg-background/70 ${
                        messageRows.length <= 2 ? "px-3 py-2" : "px-3 py-2.5"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {message.sender_name ?? "Client"}
                        </p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {message.preview ?? "No preview available"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {message.created_at
                          ? formatRelativeTime(message.created_at)
                          : "Recently"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No messages yet"
                  description="Start the thread from a client profile."
                  className="px-5 py-5"
                />
              )}
            </DashboardCard>
          </div>
        </div>

        <div className="space-y-4">
          <DashboardCard
            title="Queue"
            className="border-primary/10"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/pt/checkins")}
              >
                Open check-ins
              </Button>
            }
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="surface-subtle grid grid-cols-3 gap-2 rounded-[1.35rem] p-2">
                <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-3 text-sm">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Due now
                  </p>
                  <p className="mt-1 text-xl font-semibold">{checkinDueNowCount}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-3 text-sm">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Overdue
                  </p>
                  <p className="mt-1 text-xl font-semibold">{checkinOverdueCount}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-3 text-sm">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Due soon
                  </p>
                  <p className="mt-1 text-xl font-semibold">{checkinSoonCount}</p>
                </div>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="To-Do list"
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
                  description="Add the next action."
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
    </div>
  );
}

