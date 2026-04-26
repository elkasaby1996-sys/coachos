import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Info,
  MessageCircle,
  Rocket,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Input } from "../../components/ui/input";
import { InviteClientDialog } from "../../components/pt/invite-client-dialog";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import {
  StaggerGroup,
  StaggerItem,
} from "../../components/common/motion-primitives";
import {
  ActionButtonLabel,
  ActionStatusMessage,
  AnimatedValue,
  LoadingPanel,
} from "../../components/common/action-feedback";
import { DashboardCard } from "../../components/pt/dashboard/DashboardCard";
import { StatCard } from "../../components/pt/dashboard/StatCard";
import { StatusPill } from "../../components/pt/dashboard/StatusPill";
import {
  EmptyState,
  LifecycleBadge,
  RiskBadge,
  TagInfoBadge,
} from "../../components/ui/coachos";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { supabase } from "../../lib/supabase";
import { useSessionAuth } from "../../lib/auth";
import { useWorkspace } from "../../lib/use-workspace";
import { formatRelativeTime } from "../../lib/relative-time";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import {
  checkinOperationalStatusMap,
  getCheckinOperationalState,
} from "../../lib/checkin-review";
import { getClientLifecycleMeta } from "../../lib/client-lifecycle";
import type { ClientOnboardingStatus } from "../../features/client-onboarding/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClientRecord = {
  id: string;
  workspace_id: string;
  user_id: string;
  status: string | null;
  lifecycle_state: string | null;
  manual_risk_flag: boolean | null;
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
  lifecycleState: string | null;
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

const buildMetricDelta = ({
  delta,
  suffix = "",
  positiveIsGood = true,
}: {
  delta: number | null | undefined;
  suffix?: string;
  positiveIsGood?: boolean;
}) => {
  if (typeof delta !== "number" || Number.isNaN(delta)) return null;
  const rounded = Math.round(delta);
  const prefix = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  const tone =
    rounded === 0
      ? "neutral"
      : positiveIsGood
        ? rounded > 0
          ? "positive"
          : "negative"
        : rounded < 0
          ? "positive"
          : "negative";
  return {
    value: `${prefix}${Math.abs(rounded)}${suffix}`,
    tone,
  } as const;
};

export function PtDashboardPage() {
  const { user } = useSessionAuth();
  const navigate = useNavigate();
  const messagesEnabled = true;
  const {
    workspaceId: cachedWorkspaceId,
    loading: workspaceLoading,
    error: workspaceError,
    refreshWorkspace,
  } = useWorkspace();
  const workspaceRecoveryAttemptRef = useRef<string | null>(null);

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
  const [todoActionState, setTodoActionState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");

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
        if (!UUID_PATTERN.test(cachedWorkspaceId)) {
          setLoadError("Workspace context is invalid. Refreshing workspace...");
          refreshWorkspace();
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
        workspaceRecoveryAttemptRef.current = null;
      } catch (error: any) {
        const message = String(error?.message ?? "");
        const shouldRecoverWorkspace =
          Boolean(cachedWorkspaceId) &&
          (message.includes("Not authorized") ||
            message.includes("Workspace is required") ||
            message.includes("invalid input syntax for type uuid"));
        if (shouldRecoverWorkspace) {
          const recoveryKey = `${cachedWorkspaceId}:${message}`;
          if (workspaceRecoveryAttemptRef.current !== recoveryKey) {
            workspaceRecoveryAttemptRef.current = recoveryKey;
            refreshWorkspace();
          }
        }
        setClients([]);
        setAssignedWorkouts([]);
        setCheckins([]);
        setMessages([]);
        setUnreadCount(0);
        setOnboardingRows([]);
        setCoachTodos([]);
        setLoadError(message || "Failed to load dashboard.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadDashboard();
  }, [
    cachedWorkspaceId,
    messagesEnabled,
    refreshWorkspace,
    user?.id,
    workspaceLoading,
  ]);

  useEffect(() => {
    if (workspaceError) {
      setLoadError(workspaceError.message);
    }
  }, [workspaceError]);

  const addTodo = async () => {
    if (!user?.id || !workspaceId || !todoDraft.trim()) return;
    const title = todoDraft.trim();
    setTodoDraft("");
    setTodoActionState("saving");
    const { data, error } = await supabase
      .from("coach_todos")
      .insert({ title, coach_id: user.id, workspace_id: workspaceId })
      .select("id, title, is_done, created_at")
      .single();
    if (!error && data) {
      setCoachTodos((prev) => [...prev, data as CoachTodo]);
      setTodoActionState("success");
      window.setTimeout(() => setTodoActionState("idle"), 1200);
      return;
    }
    setTodoActionState("error");
    window.setTimeout(() => setTodoActionState("idle"), 1800);
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

  const getAttentionDescription = (label: string) => {
    switch (label) {
      case "Manual at-risk flag":
        return "A PT manually marked this client as needing extra attention.";
      case "Onboarding review":
        return "The client has submitted onboarding and it now needs PT review.";
      case "Onboarding":
        return "The client is still moving through onboarding steps.";
      case "Check-in overdue":
        return "A scheduled check-in is overdue and needs follow-up.";
      case "Check-in due":
        return "A scheduled check-in is currently due.";
      case "Upcoming check-in":
        return "A scheduled check-in is coming up soon.";
      case "Long idle gap":
        return "Recent client activity has been quiet long enough to need review.";
      case "Recent inactivity":
        return "Client activity has slowed and may need follow-up.";
      case "Lifecycle review":
        return "The lifecycle state needs attention because this client is not currently active.";
      case "Adherence low":
        return "Recent adherence is low enough that the plan may need adjustment.";
      default:
        return "This tag highlights why the client is being surfaced in the coaching queue.";
    }
  };

  const activeClientsCount = useMemo(
    () =>
      clients.filter(
        (client) => client.lifecycle_state?.toLowerCase() === "active",
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
  const previousWeekStart = useMemo(
    () => addDaysToDateString(todayStr, -13),
    [todayStr],
  );
  const previousWeekEnd = useMemo(
    () => addDaysToDateString(todayStr, -7),
    [todayStr],
  );
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
  const queueSegments = useMemo(() => {
    const total = Math.max(
      checkinDueNowCount + checkinOverdueCount + checkinSoonCount,
      1,
    );

    return [
      {
        key: "overdue",
        label: "Overdue",
        helper: "Past the due date and needs follow-up first.",
        value: checkinOverdueCount,
        icon: AlertTriangle,
        toneClassName:
          "border-rose-500/30 bg-rose-500/10 text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        meterClassName: "bg-rose-400/90",
      },
      {
        key: "due",
        label: "Due now",
        helper: "Ready for review in the current queue window.",
        value: checkinDueNowCount,
        icon: Clock3,
        toneClassName:
          "border-amber-500/30 bg-amber-500/10 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        meterClassName: "bg-amber-300/90",
      },
      {
        key: "soon",
        label: "Due soon",
        helper: "Upcoming check-ins inside the next 7 days.",
        value: checkinSoonCount,
        icon: CalendarDays,
        toneClassName:
          "border-sky-500/30 bg-sky-500/10 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        meterClassName: "bg-sky-400/90",
      },
    ].map((item) => ({
      ...item,
      widthPercent: `${Math.max((item.value / total) * 100, item.value > 0 ? 10 : 0)}%`,
    }));
  }, [checkinDueNowCount, checkinOverdueCount, checkinSoonCount]);
  const checkinsTodayCount = useMemo(() => {
    if (checkinRows.length === 0) return 0;
    return checkinRows.filter(
      (checkin) =>
        getCheckinOperationalState(checkin, todayStr) === "due" &&
        checkin.week_ending_saturday === todayStr,
    ).length;
  }, [checkinRows, todayStr]);

  const activeClientsDelta = useMemo(() => {
    const currentWindow = clients.filter((client) => {
      return (
        client.lifecycle_state?.toLowerCase() === "active" &&
        client.created_at >= addDaysToDateString(todayStr, -6)
      );
    }).length;
    const previousWindow = clients.filter((client) => {
      return (
        client.lifecycle_state?.toLowerCase() === "active" &&
        client.created_at >= previousWeekStart &&
        client.created_at <= previousWeekEnd
      );
    }).length;
    return currentWindow - previousWindow;
  }, [clients, previousWeekEnd, previousWeekStart, todayStr]);
  const adherenceDelta = useMemo(() => {
    const getWindowAdherence = (start: string, end: string) => {
      const rows = assignedWorkouts.filter(
        (row) =>
          Boolean(row.scheduled_date) &&
          (row.scheduled_date ?? "") >= start &&
          (row.scheduled_date ?? "") <= end,
      );
      if (rows.length === 0) return null;
      const completed = rows.filter((row) => row.status === "completed").length;
      return Math.round((completed / rows.length) * 100);
    };

    const currentWindow = getWindowAdherence(
      addDaysToDateString(todayStr, -6),
      todayStr,
    );
    const previousWindow = getWindowAdherence(
      previousWeekStart,
      previousWeekEnd,
    );
    if (currentWindow === null || previousWindow === null) return null;
    return currentWindow - previousWindow;
  }, [assignedWorkouts, previousWeekEnd, previousWeekStart, todayStr]);

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
      const lifecycleMeta = getClientLifecycleMeta(client.lifecycle_state);
      const lifecycle = lifecycleMeta.label;
      const lifecycleTone: AttentionTone =
        client.lifecycle_state?.toLowerCase() === "active"
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

      if (client.manual_risk_flag) {
        attentionLabel = "Manual at-risk flag";
        attentionTone = "danger";
        attentionScore = 82;
      } else if (
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
        lifecycleState: client.lifecycle_state,
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
  const priorityClientRows = clientRows.slice(
    0,
    clientRows.length === 1 ? 1 : 6,
  );
  const showSingleClientCard = priorityClientRows.length === 1;

  return (
    <div className="space-y-6">
      <WorkspacePageHeader title="Coach Dashboard" className="py-2.5 sm:py-3" />

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

      <StaggerGroup
        className="page-kpi-block grid gap-4 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_320px]"
        stagger={0.05}
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <StaggerItem key={index}>
              <LoadingPanel
                title="Loading metrics"
                description="Refreshing today’s coaching snapshot."
                className="h-28"
              />
            </StaggerItem>
          ))
        ) : (
          <>
            <StaggerItem>
              <StatCard
                label="Clients"
                value={activeClientsCount}
                helper="Active"
                icon={UsersRound}
                module="clients"
                onClick={() => navigate("/pt/clients?lifecycle=active")}
                ariaLabel="Open active clients"
                delta={buildMetricDelta({
                  delta: activeClientsDelta,
                })}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Avg adherence"
                value={`${adherencePercent}%`}
                helper="7d"
                icon={Rocket}
                module="analytics"
                onClick={() => navigate("/pt/clients?segment=at_risk")}
                ariaLabel="Open clients at risk from adherence"
                delta={buildMetricDelta({
                  delta: adherenceDelta,
                  suffix: "%",
                })}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Unread messages"
                value={unreadCount}
                helper="Unread"
                icon={MessageCircle}
                module="coaching"
                onClick={() => navigate("/pt/messages")}
                ariaLabel="Open unread messages"
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Check-ins today"
                value={checkinsTodayCount}
                helper="Due"
                icon={CalendarDays}
                module="checkins"
                onClick={() => navigate("/pt/checkins")}
                ariaLabel="Open today's check-ins"
              />
            </StaggerItem>
          </>
        )}
      </StaggerGroup>

      <StaggerGroup
        className="grid gap-4 items-start xl:grid-cols-[minmax(0,1.7fr)_320px]"
        stagger={0.07}
        delayChildren={0.05}
      >
        <StaggerItem className="space-y-4">
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
              <LoadingPanel
                title="Loading client queue"
                description="Ranking the clients who need attention first."
              />
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
                        <LifecycleBadge
                          lifecycleState={client.lifecycleState}
                          interactive={false}
                        />
                        {client.attentionLabel === "Manual at-risk flag" ? (
                          <RiskBadge riskState="at_risk" interactive={false} />
                        ) : null}
                        {client.onboardingLabel ? (
                          <TagInfoBadge
                            label={client.onboardingLabel}
                            variant="warning"
                            title="Onboarding status"
                            description="This client still has onboarding work pending before coaching is fully settled."
                            disabled
                          />
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
                    <div className="shrink-0">
                      <TagInfoBadge
                        label={client.attentionLabel}
                        variant={
                          client.attentionTone === "danger"
                            ? "danger"
                            : client.attentionTone === "warning"
                              ? "warning"
                              : "neutral"
                        }
                        title="Why this client is highlighted"
                        description={getAttentionDescription(
                          client.attentionLabel,
                        )}
                        disabled
                      />
                    </div>
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
                <LoadingPanel
                  title="Loading check-ins"
                  description="Collecting the latest review queue."
                />
              ) : recentCheckins.length > 0 ? (
                <div className="space-y-2.5">
                  {recentCheckins.map((row) => {
                    const clientName =
                      clients.find((item) => item.id === row.client_id)
                        ?.display_name ?? "Client";
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
                <LoadingPanel
                  title="Loading messages"
                  description="Pulling in the most recent client conversations."
                />
              ) : messageRows.length > 0 ? (
                <div
                  className={
                    messageRows.length <= 2 ? "space-y-2" : "space-y-2.5"
                  }
                >
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
        </StaggerItem>

        <StaggerItem className="space-y-4">
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
              <LoadingPanel
                title="Loading queue"
                description="Rebuilding your check-in pressure points."
              />
            ) : (
              <div className="space-y-3">
                <div className="h-2.5 overflow-hidden rounded-full bg-background/65">
                  <div className="flex h-full w-full gap-px overflow-hidden rounded-full">
                    {queueSegments.map((segment) => (
                      <div
                        key={segment.key}
                        className={segment.meterClassName}
                        style={{ width: segment.widthPercent }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {queueSegments.map((segment) => {
                    const Icon = segment.icon;

                    return (
                      <button
                        key={segment.key}
                        type="button"
                        onClick={() => navigate("/pt/checkins")}
                        className="surface-subtle flex w-full items-center gap-3 rounded-[1.2rem] border border-border/65 px-3.5 py-3 text-left transition duration-200 hover:border-border hover:bg-background/70"
                      >
                        <span
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${segment.toneClassName}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              {segment.label}
                            </p>
                            <span className="text-[11px] text-muted-foreground">
                              <AnimatedValue value={segment.value} />
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {segment.helper}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold tracking-tight text-foreground">
                            <AnimatedValue value={segment.value} />
                          </p>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            items
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </DashboardCard>

          <DashboardCard title="To-Do list" className="border-border/80">
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
                  <ActionButtonLabel
                    state={todoActionState}
                    idleLabel="Add"
                    savingLabel="Adding..."
                    successLabel="Added"
                    errorLabel="Try again"
                  />
                </Button>
              </div>
              {todoActionState !== "idle" ? (
                <ActionStatusMessage
                  tone={todoActionState === "error" ? "error" : "success"}
                >
                  {todoActionState === "error"
                    ? "We couldn't save that task right now."
                    : "Task saved to your focus list."}
                </ActionStatusMessage>
              ) : null}
              {coachTodos.length === 0 ? (
                <div className="surface-subtle flex items-start gap-3 rounded-2xl px-3.5 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground">
                    <Info className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      No tasks yet
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Add one quick action to keep today&apos;s focus visible.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {coachTodos.map((todo) => (
                    <div
                      key={todo.id}
                      className="surface-subtle flex items-center gap-3 px-3 py-2.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={todo.is_done}
                        onChange={() => void toggleTodo(todo)}
                        className="h-4 w-4 accent-primary"
                        disabled={todoBusyId === todo.id}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm ${
                            todo.is_done
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          }`}
                        >
                          {todo.title}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete task"
                        onClick={() => void deleteTodo(todo)}
                        disabled={todoBusyId === todo.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DashboardCard>
        </StaggerItem>
      </StaggerGroup>
    </div>
  );
}
