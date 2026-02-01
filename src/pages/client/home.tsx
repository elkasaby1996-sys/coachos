import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export function ClientHomePage() {
  const navigate = useNavigate();
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

  useEffect(() => {
    setChecklist(readChecklist(todayKey));
    setDayStatus(readDayStatus(todayKey));
  }, [todayKey]);

  useEffect(() => {
    writeChecklist(todayKey, checklist);
  }, [todayKey, checklist]);

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
          "id, status, scheduled_date, created_at, completed_at, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description)"
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
          "id, scheduled_date, status, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description)"
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
  const consistencyStreak = useMemo(
    () => computeStreak(habitLogDates, todayStr, 30),
    [habitLogDates, todayStr]
  );
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
    if (!todayWorkout) return "Recovery day. Steps + nutrition still count.";
    if (todayWorkoutStatus === "completed") {
      return "Workout done. Recovery and nutrition matter now.";
    }
    if (todayWorkoutStatus === "planned") {
      return todayTemplateInfo.description ?? "Workout planned. Focus on quality reps.";
    }
    if (todayWorkoutStatus === "skipped") {
      return "Session skipped. Stay on track with steps + nutrition.";
    }
    return "Recovery day. Steps + nutrition still count.";
  }, [todayWorkout, todayWorkoutStatus, todayTemplateInfo.description]);

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

      {!baselineSubmittedQuery.isLoading && !baselineSubmittedQuery.data ? (
        <Card className="border-dashed">
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

      <ClientReminders clientId={clientId} timezone={clientTimezone} />

      {profileCompletion && profileCompletion.completed < profileCompletion.total ? (
        <Card className="border-dashed">
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

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Training</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {todayWorkoutQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : todayWorkout ? (
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

          <Card>
            <CardHeader>
              <CardTitle>Nutrition Targets</CardTitle>
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

          <Card>
            <CardHeader>
              <CardTitle>Progress Snapshot</CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle>This Week</CardTitle>
              <p className="text-sm text-muted-foreground">
                Next 7 days of training and recovery.
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
                    const label = workout?.id
                      ? workout?.workout_template?.name ??
                        (workout as { workout_template_name?: string })?.workout_template_name ??
                        "Planned session"
                      : "Recovery / Mobility";
                    return (
                      <button
                        key={row.key}
                        type="button"
                        className={
                          isToday
                            ? "flex w-full items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-left"
                            : "flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left"
                        }
                        onClick={() => {
                          if (workout?.id) navigate(`/app/workouts/${workout.id}`);
                        }}
                        disabled={!workout?.id}
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
                        ) : (
                          <Badge variant="secondary">Recovery</Badge>
                        )}
                      </button>
                    );
                  })}
                  {weeklyPlan.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      No sessions scheduled yet - focus on steps, hydration, and sleep. Your
                      coach will program your week.
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Checklist</CardTitle>
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

          <Card>
            <CardHeader>
              <CardTitle>Coach Awareness</CardTitle>
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
