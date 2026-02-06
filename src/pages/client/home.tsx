import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { ClientReminders } from "../../components/common/client-reminders";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { formatRelativeTime } from "../../lib/relative-time";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import { computeStreak, getLatestLogDate } from "../../lib/habits";

type ChecklistKey = "workout" | "steps" | "water" | "sleep";
type ChecklistState = Record<ChecklistKey, boolean>;

const checklistKeys: ChecklistKey[] = ["workout", "steps", "water", "sleep"];
const emptyChecklist: ChecklistState = {
  workout: false,
  steps: false,
  water: false,
  sleep: false,
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getFriendlyErrorMessage = () => "Unable to load data right now. Please try again.";

const getErrorDetails = (error: unknown) => {
  if (!error) return { code: null, message: "Something went wrong." };
  if (error instanceof Error) {
    const err = error as Error & { code?: string | null };
    return { code: err.code ?? null, message: err.message ?? "Something went wrong." };
  }
  if (typeof error === "object") {
    const err = error as { code?: string | null; message?: string | null };
    return { code: err.code ?? null, message: err.message ?? "Something went wrong." };
  }
  return { code: null, message: "Something went wrong." };
};

const readChecklist = (dateKey: string): ChecklistState => {
  if (typeof window === "undefined") return emptyChecklist;
  try {
    const raw = window.localStorage.getItem(`coachos_checklist_${dateKey}`);
    if (!raw) return emptyChecklist;
    const parsed = JSON.parse(raw) as Partial<ChecklistState>;
    return { ...emptyChecklist, ...parsed };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to read checklist", error);
    }
    return emptyChecklist;
  }
};

const writeChecklist = (dateKey: string, state: ChecklistState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`coachos_checklist_${dateKey}`, JSON.stringify(state));
};

type DayStatus = { completed: boolean; timestamp: string };

const readDayStatus = (dateKey: string): DayStatus | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`coachos_day_status_${dateKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DayStatus>;
    if (typeof parsed.completed !== "boolean" || typeof parsed.timestamp !== "string") {
      return null;
    }
    return { completed: parsed.completed, timestamp: parsed.timestamp };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to read day status", error);
    }
    return null;
  }
};

const writeDayStatus = (dateKey: string, status: DayStatus) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`coachos_day_status_${dateKey}`, JSON.stringify(status));
};

const cardChrome =
  "border border-border/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_14px_30px_-18px_rgba(0,0,0,0.85)]";

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-primary/80 shadow-[0_0_12px_rgba(56,189,248,0.35)]" />
        <CardTitle>{title}</CardTitle>
      </div>
      {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
  status,
  statusVariant = "muted",
}: {
  label: string;
  value: string;
  hint?: string;
  status: string;
  statusVariant?: "muted" | "success" | "danger" | "secondary";
}) {
  return (
    <Card className={`${cardChrome} bg-muted/20`}>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="uppercase tracking-wide">{label}</span>
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
        <CardTitle className="text-lg">{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

export function ClientHomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const today = useMemo(() => new Date(), []);
  const isDev = import.meta.env.DEV;
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const weekStart = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6);
    return formatDateKey(date);
  }, [today]);
  const weekEnd = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + 6);
    return formatDateKey(date);
  }, [today]);

  const [checklist, setChecklist] = useState<ChecklistState>(() => readChecklist(todayKey));
  const [dayStatus, setDayStatus] = useState<DayStatus | null>(() => readDayStatus(todayKey));
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    setChecklist(readChecklist(todayKey));
    setDayStatus(readDayStatus(todayKey));
  }, [todayKey]);

  useEffect(() => {
    writeChecklist(todayKey, checklist);
  }, [todayKey, checklist]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    const state = location.state as { toast?: string } | null;
    if (!state?.toast) return;
    setToastMessage(state.toast);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const clientQuery = useQuery({
    queryKey: ["client", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, workspace_id, display_name, goal, tags, created_at, phone, location, timezone, unit_preference, dob, gender, gym_name, days_per_week, injuries, limitations, height_cm, current_weight, photo_url"
        )
        .eq("user_id", session?.user?.id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const clientId = clientQuery.data?.id ?? null;
  const clientTimezone = clientQuery.data?.timezone ?? null;
  const todayStr = useMemo(
    () => getTodayInTimezone(clientTimezone),
    [clientTimezone]
  );
  const habitsStart = useMemo(
    () => addDaysToDateString(todayStr, -29),
    [todayStr]
  );
  const habitsWeekStart = useMemo(
    () => addDaysToDateString(todayStr, -6),
    [todayStr]
  );

  const baselineSubmittedQuery = useQuery({
    queryKey: ["client-baseline-submitted-latest", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_entries")
        .select("id, submitted_at")
        .eq("client_id", clientId ?? "")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const coachActivityQuery = useQuery({
    queryKey: ["coach-activity-log-latest", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_activity_log")
        .select("id, action, created_at")
        .eq("client_id", clientId ?? "")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data ?? [];
    },
  });

  const todayWorkoutQuery = useQuery({
    queryKey: ["assigned-workout-today", clientId, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, day_type, scheduled_date, created_at, completed_at, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description)"
        )
        .eq("client_id", clientId)
        .eq("scheduled_date", todayKey)
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const workoutsWeekQuery = useQuery({
    queryKey: ["assigned-workouts-week", clientId, weekStart, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select("id")
        .eq("client_id", clientId)
        .eq("status", "completed")
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", todayKey);
      if (error) throw error;
      return data ?? [];
    },
  });

  const weeklyPlanQuery = useQuery({
    queryKey: ["assigned-workouts-week-plan", clientId, todayKey, weekEnd],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, scheduled_date, status, day_type, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description)"
        )
        .eq("client_id", clientId)
        .gte("scheduled_date", todayKey)
        .lte("scheduled_date", weekEnd)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      const weeklyAssignments = data ?? [];
      if (isDev) {
        console.log("[WEEKLY_ASSIGNMENTS_ROW0]", weeklyAssignments?.[0]);
      }
      return weeklyAssignments;
    },
  });

  const targetsQuery = useQuery({
    queryKey: ["client-targets", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_targets")
        .select("id, calories, protein_g, steps, coach_notes, updated_at")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const habitLogsQuery = useQuery({
    queryKey: ["client-habit-logs", clientId, habitsStart, todayStr],
    enabled: !!clientId && !!todayStr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select("log_date, steps")
        .eq("client_id", clientId ?? "")
        .gte("log_date", habitsStart)
        .lte("log_date", todayStr);
      if (error) throw error;
      return (data ?? []) as Array<{ log_date: string; steps: number | null }>;
    },
  });

  const todayWorkout = todayWorkoutQuery.data ?? null;
  const isRestDay = todayWorkout?.day_type === "rest";
  const todayWorkoutStatus = todayWorkout?.status === "pending"
    ? "planned"
    : todayWorkout?.status ?? null;
  const targets = targetsQuery.data ?? null;
  const workoutsWeek = workoutsWeekQuery.data ?? [];
  const weeklyPlan = weeklyPlanQuery.data ?? [];
  const hasTargets = Boolean(targets);

  const getTemplateInfo = (row: unknown) => {
    const tpl =
      (row as { workout_template?: unknown })?.workout_template ??
      null;

    const workoutName =
      tpl && typeof tpl === "object" && "name" in tpl
        ? (tpl as { name?: string }).name ?? null
        : null;

    const workoutType =
      tpl && typeof tpl === "object" && "workout_type_tag" in tpl
        ? (tpl as { workout_type_tag?: string }).workout_type_tag ?? null
        : null;

    const description =
      tpl && typeof tpl === "object" && "description" in tpl
        ? (tpl as { description?: string }).description ?? null
        : null;

    return { tpl, workoutName, workoutType, description };
  };

  const todayTemplateInfo = getTemplateInfo(todayWorkout);

  const checklistProgress = Math.round(
    (Object.values(checklist).filter(Boolean).length / checklistKeys.length) * 100
  );
  const isPerfectDay = checklistProgress === 100;

  useEffect(() => {
    if (!isPerfectDay || dayStatus?.completed) return;
    const nextStatus = { completed: true, timestamp: new Date().toISOString() };
    writeDayStatus(todayKey, nextStatus);
    setDayStatus(nextStatus);
  }, [dayStatus?.completed, isPerfectDay, todayKey]);

  const habitLogDates = useMemo(
    () => (habitLogsQuery.data ?? []).map((row) => row.log_date),
    [habitLogsQuery.data]
  );
  const consistencyStreak = useMemo(() => computeStreak(habitLogDates, today, 30), [
    habitLogDates,
    today,
  ]);
  const lastLoggedDate = useMemo(
    () => getLatestLogDate(habitLogDates),
    [habitLogDates]
  );
  const stepsAdherence = useMemo(() => {
    const weekLogs = (habitLogsQuery.data ?? []).filter(
      (row) => row.log_date >= habitsWeekStart && row.log_date <= todayStr
    );
    const stepValues = weekLogs.filter(
      (row) => typeof row.steps === "number"
    );
    if (stepValues.length === 0) {
      return { percent: null };
    }
    const checked = stepValues.length;
    const percent = Math.round((checked / 7) * 100);
    return { percent };
  }, [habitLogsQuery.data, habitsWeekStart, todayStr]);

  const workoutsCompletedThisWeek = workoutsWeek.length;
  const summaryTrainingStatus = isRestDay
    ? "Rest day"
    : todayWorkoutStatus === "completed"
      ? "completed"
      : todayWorkoutStatus === "skipped"
        ? "skipped"
        : todayWorkout
          ? "planned"
          : "Rest day";
  const summaryTrainingTitle = isRestDay
    ? "Rest day"
    : todayWorkout?.workout_template?.name ??
      todayWorkout?.workout_template_name ??
      "Rest day";
  const summaryTrainingHint = isRestDay
    ? "Rest day. Steps + nutrition still count."
    : todayWorkoutStatus === "completed"
      ? "Session logged"
      : todayWorkoutStatus === "skipped"
        ? "Coach notified"
        : todayWorkout
          ? "Ready when you are"
          : "Rest day. Steps + nutrition still count.";
  const summaryNutritionValue =
    typeof targets?.calories === "number"
      ? `${targets.calories.toLocaleString()} kcal`
      : "Coach setting in progress";
  const summaryNutritionHint =
    typeof targets?.protein_g === "number"
      ? `${targets.protein_g}g protein target`
      : "Ask coach for targets";
  const summaryHabitHint = `${Object.values(checklist).filter(Boolean).length} of ${checklistKeys.length} complete`;
  const summaryMomentumValue = `${workoutsCompletedThisWeek} workouts`;
  const summaryMomentumHint =
    consistencyStreak > 0 ? `${consistencyStreak} day streak` : "Start a streak";

  const defaultPlan = useMemo(
    () => ["30-45 min strength OR 20 min conditioning", "10 min mobility"],
    []
  );

  const subtitleDate = useMemo(
    () =>
      today.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    [today]
  );

  const latestCoachActivity =
    coachActivityQuery.data && coachActivityQuery.data.length > 0
      ? coachActivityQuery.data[0]
      : null;

  const coachBadgeLabel = latestCoachActivity?.created_at
    ? `Coach reviewed your plan ${formatRelativeTime(latestCoachActivity.created_at)}`
    : "Coach hasn’t reviewed your plan yet.";

  const coachUpdatedText = useMemo(() => {
    if (!latestCoachActivity?.created_at) {
      return "Coach hasn’t reviewed your plan yet.";
    }
    return `Coach reviewed your plan ${formatRelativeTime(latestCoachActivity.created_at)}.`;
  }, [latestCoachActivity]);

  const profileCompletion = useMemo(() => {
    if (!clientQuery.data) return null;
    const client = clientQuery.data as {
      display_name?: string | null;
      photo_url?: string | null;
      phone?: string | null;
      location?: string | null;
      unit_preference?: string | null;
      dob?: string | null;
      gender?: string | null;
      gym_name?: string | null;
      days_per_week?: number | null;
      goal?: string | null;
      injuries?: string | null;
      limitations?: string | null;
      height_cm?: number | null;
      current_weight?: number | null;
      timezone?: string | null;
    };
    const hasValue = (value: unknown) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "number") return !Number.isNaN(value);
      return String(value).trim().length > 0;
    };
    const items = [
      { label: "photo_or_name", ok: hasValue(client.photo_url) || hasValue(client.display_name) },
      { label: "phone", ok: hasValue(client.phone) },
      { label: "location", ok: hasValue(client.location) },
      { label: "unit_preference", ok: hasValue(client.unit_preference) },
      { label: "dob", ok: hasValue(client.dob) },
      { label: "gender", ok: hasValue(client.gender) },
      { label: "gym_name", ok: hasValue(client.gym_name) },
      { label: "days_per_week", ok: hasValue(client.days_per_week) },
      { label: "goal", ok: hasValue(client.goal) },
      { label: "injuries", ok: hasValue(client.injuries) },
      { label: "limitations", ok: hasValue(client.limitations) },
      { label: "height_cm", ok: hasValue(client.height_cm) },
      { label: "current_weight", ok: hasValue(client.current_weight) },
      { label: "timezone", ok: hasValue(client.timezone) },
    ];
    const completed = items.filter((item) => item.ok).length;
    return { completed, total: items.length };
  }, [clientQuery.data]);

  const errors = [
    clientQuery.error,
    todayWorkoutQuery.error,
    coachActivityQuery.error,
    targetsQuery.error,
    workoutsWeekQuery.error,
    weeklyPlanQuery.error,
    baselineSubmittedQuery.error,
    habitLogsQuery.error,
    actionError ? new Error(actionError) : null,
  ].filter(Boolean);

  const weekRows = useMemo(() => {
    const rows = Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(today);
      date.setDate(date.getDate() + idx);
      const key = formatDateKey(date);
      const match = weeklyPlan.find((item) => item.scheduled_date === key);
      return { date, key, workout: match ?? null };
    });
    return rows;
  }, [today, weeklyPlan]);

  useEffect(() => {
    if (todayWorkoutStatus === "completed" && !checklist.workout) {
      setChecklist((prev) => (prev.workout ? prev : { ...prev, workout: true }));
    }
  }, [todayWorkoutStatus, checklist.workout]);

  const missionCopy = useMemo(() => {
    if (isRestDay || !todayWorkout) return "Rest day. Steps + nutrition still count.";
    if (todayWorkoutStatus === "completed") {
      return "Workout done. Recovery and nutrition matter now.";
    }
    if (todayWorkoutStatus === "planned") {
      return todayTemplateInfo.description ?? "Workout planned. Focus on quality reps.";
    }
    if (todayWorkoutStatus === "skipped") {
      return "Session skipped. Stay on track with steps + nutrition.";
    }
    return "Rest day. Steps + nutrition still count.";
  }, [isRestDay, todayWorkout, todayWorkoutStatus, todayTemplateInfo.description]);

  const handleStartDefaultSession = async () => {
    if (!clientId) return;
    setActionError(null);
    const { data, error } = await supabase
      .from("workout_logs")
      .insert({
        client_id: clientId,
        title: "Default Session",
        status: "in_progress",
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) {
      setActionError("Unable to start a session right now.");
      return;
    }
    navigate(`/app/workout-run/${data.id}`);
  };

  const handleRequestAdjustment = () => {
    navigate(
      `/app/messages?draft=${encodeURIComponent(
        "I skipped today's workout — can we adjust?"
      )}`
    );
  };

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Today&apos;s Mission</p>
          <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s Mission</h1>
          <p className="text-sm text-muted-foreground">
            {subtitleDate} &bull; {missionCopy}
          </p>
        </div>
        <Badge variant={latestCoachActivity ? "success" : "muted"}>
          {coachBadgeLabel}
        </Badge>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          label="Training"
          value={summaryTrainingTitle}
          hint={summaryTrainingHint}
          status={summaryTrainingStatus}
          statusVariant={
            summaryTrainingStatus === "completed"
              ? "success"
              : summaryTrainingStatus === "skipped"
                ? "danger"
                : summaryTrainingStatus === "planned"
                  ? "secondary"
                  : summaryTrainingStatus.toLowerCase().includes("rest")
                    ? "warning"
                    : "muted"
          }
        />
        <SummaryStat
          label="Nutrition"
          value={summaryNutritionValue}
          hint={summaryNutritionHint}
          status={typeof targets?.calories === "number" ? "set" : "pending"}
          statusVariant={typeof targets?.calories === "number" ? "success" : "muted"}
        />
        <SummaryStat
          label="Habits"
          value={`${checklistProgress}%`}
          hint={summaryHabitHint}
          status={checklistProgress === 100 ? "perfect" : "in progress"}
          statusVariant={checklistProgress === 100 ? "success" : "secondary"}
        />
        <SummaryStat
          label="Momentum"
          value={summaryMomentumValue}
          hint={summaryMomentumHint}
          status={workoutsCompletedThisWeek > 0 ? "moving" : "start"}
          statusVariant={workoutsCompletedThisWeek > 0 ? "success" : "muted"}
        />
        <SummaryStat
          label="Streak"
          value={`${consistencyStreak} days`}
          hint="Days logged in a row"
          status={consistencyStreak > 0 ? "active" : "start"}
          statusVariant={consistencyStreak > 0 ? "success" : "muted"}
        />
      </section>

      {!baselineSubmittedQuery.isLoading && !baselineSubmittedQuery.data ? (
        <Card className={`border-dashed ${cardChrome}`}>
          <CardHeader>
            <CardTitle>Complete your baseline</CardTitle>
            <p className="text-sm text-muted-foreground">
              This helps your coach personalize your plan.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Three quick steps: metrics, performance markers, and photos.
            </p>
            <Button onClick={() => navigate("/app/baseline")}>Start baseline</Button>
          </CardContent>
        </Card>
      ) : null}

      {toastMessage ? (
        <Alert className="border-emerald-200">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{toastMessage}</AlertDescription>
        </Alert>
      ) : null}

      {errors.length > 0 ? (
        <Alert className="border-danger/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {getFriendlyErrorMessage()}
            {isDev ? (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {errors.map((error, index) => {
                  const details = getErrorDetails(error);
                  return (
                    <div key={`${index}-${details.message}`}>
                      {details.code ? `${details.code}: ` : ""}
                      {details.message}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {profileCompletion && profileCompletion.completed < profileCompletion.total ? (
        <Card className={`border-dashed ${cardChrome}`}>
          <CardHeader>
            <CardTitle>Complete your profile</CardTitle>
            <p className="text-sm text-muted-foreground">
              This helps your coach tailor your plan.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {profileCompletion.completed}/{profileCompletion.total} fields complete
            </div>
            <Button onClick={() => navigate("/app/profile")}>Complete profile</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className={`${cardChrome}`}>
            <CardHeader>
              <SectionHeader title="Today&apos;s Training" />
            </CardHeader>
            <CardContent className="space-y-4">
              {todayWorkoutQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : todayWorkout ? (
                isRestDay ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Rest day</p>
                        <p className="text-lg font-semibold">Rest day</p>
                      </div>
                      <Badge variant="warning">Rest day</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Rest day. Steps + nutrition still count.
                    </p>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => navigate("/app/messages")}
                    >
                      Message coach
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {todayWorkoutStatus === "completed"
                            ? "Workout completed"
                            : todayWorkoutStatus === "skipped"
                              ? "Workout skipped (coach notified)"
                              : "Workout planned"}
                        </p>
                        <p className="text-lg font-semibold">
                          {todayWorkout?.workout_template?.name ??
                            todayWorkout?.workout_template_name ??
                            "Planned session"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          todayWorkoutStatus === "completed"
                            ? "success"
                            : todayWorkoutStatus === "skipped"
                              ? "danger"
                              : "muted"
                        }
                      >
                        {todayWorkoutStatus ?? "planned"}
                      </Badge>
                    </div>
                    {todayTemplateInfo.workoutType ? (
                      <Badge variant="muted">{todayTemplateInfo.workoutType}</Badge>
                    ) : null}
                    {todayWorkoutStatus === "completed" ? (
                      <Button
                        className="w-full"
                        onClick={() => navigate(`/app/workout-summary/${todayWorkout.id}`)}
                      >
                        View summary
                      </Button>
                    ) : todayWorkoutStatus === "skipped" ? (
                      <Button className="w-full" onClick={handleRequestAdjustment}>
                        Request adjustment
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => navigate(`/app/workout-run/${todayWorkout.id}`)}
                      >
                        Start workout
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => navigate("/app/messages")}
                    >
                      Message coach
                    </Button>
                  </div>
                )
              ) : (
                <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
                  <div>
                    <p className="text-sm font-semibold">No workout assigned yet</p>
                    <p className="text-sm text-muted-foreground">
                      Your coach hasn&apos;t scheduled today&apos;s session. You can still do
                      your default plan:
                    </p>
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {defaultPlan.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <Button className="w-full" onClick={handleStartDefaultSession}>
                    Start default session
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => navigate("/app/messages")}
                  >
                    Message coach
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`${cardChrome}`}>
            <CardHeader>
              <SectionHeader title="Nutrition Targets" />
            </CardHeader>
            <CardContent className="space-y-4">
              {targetsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div
                  className={
                    hasTargets
                      ? "space-y-3"
                      : "space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-4"
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Calories</p>
                      <p className="text-sm font-semibold">
                        {typeof targets?.calories === "number"
                          ? targets.calories.toLocaleString()
                          : "Coach setting in progress"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Protein</p>
                      <p className="text-sm font-semibold">
                        {typeof targets?.protein_g === "number"
                          ? `${targets.protein_g} g`
                          : "Prioritize protein today"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Steps</p>
                      <p className="text-sm font-semibold">
                        {typeof targets?.steps === "number"
                          ? targets.steps.toLocaleString()
                          : "8,000 (today's focus)"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-sm">
                    <p className="text-xs text-muted-foreground">Coach notes</p>
                    <p>{targets?.coach_notes ?? "Today: protein first, hydrate, don't skip steps."}</p>
                  </div>
                  {!hasTargets ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() =>
                        navigate(
                          `/app/messages?draft=${encodeURIComponent(
                            "Can you set my nutrition targets for this week?"
                          )}`
                        )
                      }
                    >
                      Request targets
                    </Button>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`${cardChrome}`}>
            <CardHeader>
              <SectionHeader title="Progress Snapshot" />
            </CardHeader>
            <CardContent className="space-y-3">
              {clientQuery.isLoading || workoutsWeekQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : clientQuery.data ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Day streak
                      </p>
                      {consistencyStreak > 0 ? (
                        <p className="text-2xl font-semibold">{consistencyStreak}</p>
                      ) : (
                        <p className="text-sm font-semibold">Start your streak today.</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Workouts completed this week
                      </p>
                      <p className="text-sm font-semibold">
                        {workoutsCompletedThisWeek}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Steps adherence (7d)</p>
                      <p className="text-sm font-semibold">
                        {stepsAdherence.percent === null ? "--" : `${stepsAdherence.percent}%`}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lastLoggedDate
                      ? `Last habit log: ${lastLoggedDate}. Momentum is built by small wins.`
                      : "Momentum is built by small wins."}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Your progress starts today. Complete your checklist to build momentum.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className={`${cardChrome}`}>
            <CardHeader>
              <SectionHeader title="Today&apos;s Checklist" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{checklistProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                {checklistKeys.map((key) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <span className="capitalize">
                      {key === "steps" && typeof targets?.steps === "number"
                        ? `Steps (${targets.steps.toLocaleString()})`
                        : key}
                    </span>
                    <input
                      type="checkbox"
                      checked={checklist[key]}
                      onChange={() =>
                        setChecklist((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                    />
                  </label>
                ))}
              </div>
              {dayStatus?.completed ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  {"\u2705"} Perfect day logged
                </div>
              ) : null}
              <Button variant="secondary" className="w-full" onClick={() => setChecklist(emptyChecklist)}>
                Reset today
              </Button>
            </CardContent>
          </Card>

          <Card className={`${cardChrome}`}>
            <CardHeader className="space-y-2">
              <SectionHeader title="This Week" subtitle="Next 7 days" />
              <p className="text-sm text-muted-foreground">
                Training and recovery mapped out for you.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {weeklyPlanQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {weekRows.map((row) => {
                    const isToday = row.key === todayKey;
                    const workout = row.workout;
                    const isRest = workout?.day_type === "rest";
                    const label = workout?.id
                      ? isRest
                        ? "Rest day"
                        : workout?.workout_template?.name ??
                          (workout as { workout_template_name?: string })?.workout_template_name ??
                          "Planned session"
                      : "Rest day";
                    return (
                      <button
                        key={row.key}
                        type="button"
                        className={
                          isToday
                            ? "flex w-full items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2 text-left transition hover:border-border/80 hover:bg-muted/60"
                            : "flex w-full items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-left transition hover:border-border hover:bg-muted/40"
                        }
                        onClick={() => {
                          if (workout?.id && !isRest) navigate(`/app/workouts/${workout.id}`);
                        }}
                        disabled={!workout?.id || isRest}
                      >
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {row.date.toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                          <p className="text-sm font-semibold">{label}</p>
                        </div>
                        {workout?.id ? (
                          isRest ? (
                            <Badge variant="warning">Rest day</Badge>
                          ) : (
                            <Badge
                              variant={
                                workout.status === "completed"
                                  ? "success"
                                  : workout.status === "skipped"
                                  ? "danger"
                                  : "muted"
                              }
                            >
                              {workout.status ?? "planned"}
                            </Badge>
                          )
                        ) : (
                          <Badge variant="warning">Rest day</Badge>
                        )}
                      </button>
                    );
                  })}
                  {weeklyPlan.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      No sessions scheduled yet. Focus on steps, hydration, and sleep.
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`${cardChrome}`}>
            <CardHeader>
              <SectionHeader title="Reminders" />
            </CardHeader>
            <CardContent>
              <ClientReminders clientId={clientId} timezone={clientTimezone} />
            </CardContent>
          </Card>

          <Card className={`${cardChrome}`}>
            <CardHeader>
              <SectionHeader title="Coach Awareness" />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {coachUpdatedText}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

