import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { ClientReminders } from "../../components/common/client-reminders";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { formatRelativeTime } from "../../lib/relative-time";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import { computeStreak } from "../../lib/habits";

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
  window.localStorage.setItem(
    `coachos_checklist_${dateKey}`,
    JSON.stringify(state),
  );
};

type DayStatus = { completed: boolean; timestamp: string };

const readDayStatus = (dateKey: string): DayStatus | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`coachos_day_status_${dateKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DayStatus>;
    if (
      typeof parsed.completed !== "boolean" ||
      typeof parsed.timestamp !== "string"
    ) {
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
  window.localStorage.setItem(
    `coachos_day_status_${dateKey}`,
    JSON.stringify(status),
  );
};

const cardChrome =
  "border border-border/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_14px_30px_-18px_rgba(0,0,0,0.85)]";

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full border-2 border-primary/85 bg-transparent shadow-[0_0_12px_rgba(56,189,248,0.45)]" />
        <CardTitle>{title}</CardTitle>
      </div>
      {subtitle ? (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      ) : null}
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
  statusVariant?: "muted" | "success" | "danger" | "secondary" | "warning";
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

const getWorkoutTemplateInfo = (row: any) => {
  const raw = row?.workout_template ?? null;
  const template = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  return {
    name: template?.name ?? null,
    workout_type_tag: template?.workout_type_tag ?? null,
    description: template?.description ?? null,
  };
};

export function ClientHomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const today = useMemo(() => new Date(), []);
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

  const [checklist, setChecklist] = useState<ChecklistState>(() =>
    readChecklist(todayKey),
  );
  const [dayStatus, setDayStatus] = useState<DayStatus | null>(() =>
    readDayStatus(todayKey),
  );

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
          "id, workspace_id, display_name, goal, tags, created_at, phone, location, timezone, unit_preference, dob, gender, gym_name, days_per_week, injuries, limitations, height_cm, current_weight, photo_url",
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
    [clientTimezone],
  );
  const habitsStart = useMemo(
    () => addDaysToDateString(todayStr, -29),
    [todayStr],
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
          "id, status, day_type, scheduled_date, created_at, completed_at, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description)",
        )
        .eq("client_id", clientId)
        .eq("scheduled_date", todayKey)
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const todayNutritionQuery = useQuery({
    queryKey: ["assigned-nutrition-today", clientId, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: plans, error: planError } = await supabase
        .from("assigned_nutrition_plans")
        .select("id")
        .eq("client_id", clientId ?? "");
      if (planError) throw planError;

      const planIds = (plans ?? []).map((row: { id: string }) => row.id);
      if (!planIds.length) return null;

      const { data, error } = await supabase
        .from("assigned_nutrition_days")
        .select(
          "id, date, assigned_nutrition_plan:assigned_nutrition_plans(id, client_id, nutrition_template:nutrition_templates(id, name)), meals:assigned_nutrition_meals(id, assigned_nutrition_day_id, calories, protein_g, carbs_g, fat_g, logs:nutrition_meal_logs(id, is_completed, actual_calories, actual_protein_g, actual_carbs_g, actual_fat_g, consumed_at))",
        )
        .in("assigned_nutrition_plan_id", planIds)
        .eq("date", todayKey)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const nutritionWeekQuery = useQuery({
    queryKey: ["assigned-nutrition-week", clientId, todayKey, weekEnd],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: plans, error: planError } = await supabase
        .from("assigned_nutrition_plans")
        .select("id")
        .eq("client_id", clientId ?? "");
      if (planError) throw planError;

      const planIds = (plans ?? []).map((row: { id: string }) => row.id);
      if (!planIds.length) return [];

      const { data, error } = await supabase
        .from("assigned_nutrition_days")
        .select("id, date")
        .in("assigned_nutrition_plan_id", planIds)
        .gte("date", todayKey)
        .lte("date", weekEnd)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
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
          "id, scheduled_date, status, day_type, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description)",
        )
        .eq("client_id", clientId)
        .gte("scheduled_date", todayKey)
        .lte("scheduled_date", weekEnd)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      const weeklyAssignments = data ?? [];
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
  const todayWorkoutStatus =
    todayWorkout?.status === "pending"
      ? "planned"
      : (todayWorkout?.status ?? null);
  const targets = targetsQuery.data ?? null;
  const todayNutrition = todayNutritionQuery.data ?? null;
  const todayNutritionPlan = Array.isArray(
    (todayNutrition as any)?.assigned_nutrition_plan,
  )
    ? (todayNutrition as any).assigned_nutrition_plan[0]
    : ((todayNutrition as any)?.assigned_nutrition_plan ?? null);
  const todayNutritionTemplate = Array.isArray(
    todayNutritionPlan?.nutrition_template,
  )
    ? todayNutritionPlan?.nutrition_template?.[0]
    : (todayNutritionPlan?.nutrition_template ?? null);
  const todayNutritionTotals = useMemo(() => {
    const meals = (todayNutrition?.meals ?? []) as Array<{
      calories?: number | null;
      protein_g?: number | null;
      carbs_g?: number | null;
      fat_g?: number | null;
      logs?: Array<{
        actual_calories?: number | null;
        actual_protein_g?: number | null;
        actual_carbs_g?: number | null;
        actual_fat_g?: number | null;
        consumed_at?: string | null;
      }>;
    }>;
    return meals.reduce<{
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    }>(
      (acc, meal) => {
        const latest = (meal.logs ?? [])
          .slice()
          .sort((a, b) =>
            String(a.consumed_at ?? "") < String(b.consumed_at ?? "") ? 1 : -1,
          )[0];
        acc.calories += latest?.actual_calories ?? meal.calories ?? 0;
        acc.protein_g += latest?.actual_protein_g ?? meal.protein_g ?? 0;
        acc.carbs_g += latest?.actual_carbs_g ?? meal.carbs_g ?? 0;
        acc.fat_g += latest?.actual_fat_g ?? meal.fat_g ?? 0;
        return acc;
      },
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
  }, [todayNutrition]);
  const workoutsWeek = workoutsWeekQuery.data ?? [];
  const weeklyPlan = weeklyPlanQuery.data ?? [];
  const hasTargets = Boolean(targets);

  const getTemplateInfo = (row: unknown) => {
    const tpl =
      (row as { workout_template?: unknown })?.workout_template ?? null;

    const workoutName =
      tpl && typeof tpl === "object" && "name" in tpl
        ? ((tpl as { name?: string }).name ?? null)
        : null;

    const workoutType =
      tpl && typeof tpl === "object" && "workout_type_tag" in tpl
        ? ((tpl as { workout_type_tag?: string }).workout_type_tag ?? null)
        : null;

    const description =
      tpl && typeof tpl === "object" && "description" in tpl
        ? ((tpl as { description?: string }).description ?? null)
        : null;

    return { tpl, workoutName, workoutType, description };
  };

  const todayTemplateInfo = getTemplateInfo(todayWorkout);
  const todayTemplate = getWorkoutTemplateInfo(todayWorkout);

  const checklistProgress = Math.round(
    (Object.values(checklist).filter(Boolean).length / checklistKeys.length) *
      100,
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
    [habitLogsQuery.data],
  );
  const consistencyStreak = useMemo(
    () => computeStreak(habitLogDates, today, 30),
    [habitLogDates, today],
  );
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
    : (todayTemplate.name ??
      (todayWorkout as { workout_template_name?: string } | null)
        ?.workout_template_name ??
      "Rest day");
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

  const defaultPlan = useMemo(
    () => ["30-45 min strength OR 20 min conditioning", "10 min mobility"],
    [],
  );

  const subtitleDate = useMemo(
    () =>
      today.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    [today],
  );

  const latestCoachActivity =
    coachActivityQuery.data && coachActivityQuery.data.length > 0
      ? coachActivityQuery.data[0]
      : null;

  const coachBadgeLabel = latestCoachActivity?.created_at
    ? `Coach reviewed your plan ${formatRelativeTime(latestCoachActivity.created_at)}`
    : "Coach hasn’t reviewed your plan yet.";

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
      {
        label: "photo_or_name",
        ok: hasValue(client.photo_url) || hasValue(client.display_name),
      },
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
      setChecklist((prev) =>
        prev.workout ? prev : { ...prev, workout: true },
      );
    }
  }, [todayWorkoutStatus, checklist.workout]);

  const missionCopy = useMemo(() => {
    if (isRestDay || !todayWorkout)
      return "Rest day. Steps + nutrition still count.";
    if (todayWorkoutStatus === "completed") {
      return "Workout done. Recovery and nutrition matter now.";
    }
    if (todayWorkoutStatus === "planned") {
      return (
        todayTemplateInfo.description ??
        "Workout planned. Focus on quality reps."
      );
    }
    if (todayWorkoutStatus === "skipped") {
      return "Session skipped. Stay on track with steps + nutrition.";
    }
    return "Rest day. Steps + nutrition still count.";
  }, [
    isRestDay,
    todayWorkout,
    todayWorkoutStatus,
    todayTemplateInfo.description,
  ]);

  const handleStartDefaultSession = async () => {
    if (!clientId) return;
    const { data, error } = await supabase
      .from("assigned_workouts")
      .insert({
        client_id: clientId,
        scheduled_date: todayKey,
        status: "planned",
        day_type: "workout",
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) {
      return;
    }
    navigate(`/app/workout-run/${data.id}`);
  };

  const handleRequestAdjustment = () => {
    navigate(
      `/app/messages?draft=${encodeURIComponent(
        "I skipped today's workout — can we adjust?",
      )}`,
    );
  };

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Today&apos;s Mission
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Today&apos;s Mission
          </h1>
          <p className="text-sm text-muted-foreground">
            {subtitleDate} &bull; {missionCopy}
          </p>
        </div>
        <Badge variant={latestCoachActivity ? "success" : "muted"}>
          {coachBadgeLabel}
        </Badge>
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
            <Button onClick={() => navigate("/app/baseline")}>
              Start baseline
            </Button>
          </CardContent>
        </Card>
      ) : null}

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
          statusVariant={
            typeof targets?.calories === "number" ? "success" : "muted"
          }
        />
        <SummaryStat
          label="Habits"
          value={`${checklistProgress}%`}
          hint={summaryHabitHint}
          status={checklistProgress === 100 ? "perfect" : "in progress"}
          statusVariant={checklistProgress === 100 ? "success" : "secondary"}
        />
        <SummaryStat
          label="Streak"
          value={`${consistencyStreak} days`}
          hint="Days logged in a row"
          status={consistencyStreak > 0 ? "active" : "start"}
          statusVariant={consistencyStreak > 0 ? "success" : "muted"}
        />
      </section>

      <Card className={`${cardChrome}`}>
        <CardHeader className="space-y-2">
          <SectionHeader title="Calendar" subtitle="Next 7 days" />
          <p className="text-sm text-muted-foreground">
            Training and recovery mapped out in calendar view.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {weeklyPlanQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              {(() => {
                const weeklyWorkouts = weekRows.filter(
                  (row) => row.workout && row.workout.day_type !== "rest",
                );
                const weeklyCompleted = weeklyWorkouts.filter(
                  (row) => row.workout?.status === "completed",
                ).length;
                const weeklySkipped = weeklyWorkouts.filter(
                  (row) => row.workout?.status === "skipped",
                ).length;
                const weeklyPlanned = weeklyWorkouts.filter((row) => {
                  const status = row.workout?.status;
                  return (
                    status === "planned" || status === "pending" || !status
                  );
                }).length;
                const weeklyRest = weekRows.filter(
                  (row) => row.workout?.day_type === "rest" || !row.workout,
                ).length;
                return (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                        <div className="text-muted-foreground">Completed</div>
                        <div className="text-sm font-semibold text-foreground">
                          {weeklyCompleted}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                        <div className="text-muted-foreground">Skipped</div>
                        <div className="text-sm font-semibold text-foreground">
                          {weeklySkipped}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                        <div className="text-muted-foreground">Planned</div>
                        <div className="text-sm font-semibold text-foreground">
                          {weeklyPlanned}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                        <div className="text-muted-foreground">Rest</div>
                        <div className="text-sm font-semibold text-foreground">
                          {weeklyRest}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                      {weekRows.map((row) => {
                        const workout = row.workout;
                        const isRestDay = workout?.day_type === "rest";
                        const status = isRestDay
                          ? "rest day"
                          : workout?.status === "pending"
                            ? "planned"
                            : (workout?.status ??
                              (workout ? "planned" : "rest day"));
                        const title = isRestDay
                          ? "Rest day"
                          : (getWorkoutTemplateInfo(workout).name ??
                            (workout as { workout_template_name?: string })
                              ?.workout_template_name ??
                            "Workout");
                        const isTodayCard = row.key === todayKey;
                        const statusVariant =
                          status === "completed"
                            ? "success"
                            : status === "skipped"
                              ? "danger"
                              : status === "rest day"
                                ? "warning"
                                : "muted";

                        return (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() => {
                              if (workout?.id && !isRestDay)
                                navigate(`/app/workouts/${workout.id}`);
                            }}
                            disabled={!workout?.id || isRestDay}
                            className={
                              isTodayCard
                                ? "group min-h-[180px] w-full rounded-2xl border border-border/70 bg-background/40 px-4 py-4 text-left transition hover:border-border shadow-[0_0_22px_rgba(56,189,248,0.2)]"
                                : "group min-h-[180px] w-full rounded-2xl border border-border/70 bg-background/40 px-4 py-4 text-left transition hover:border-border"
                            }
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="uppercase tracking-[0.2em]">
                                  {row.date.toLocaleDateString("en-US", {
                                    weekday: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <p className="line-clamp-2 text-base font-semibold text-foreground">
                                  {title}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {isRestDay
                                    ? "Planned rest day"
                                    : (getWorkoutTemplateInfo(workout)
                                        .workout_type_tag ?? "Workout")}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={statusVariant}
                                  className="uppercase"
                                >
                                  {status}
                                </Badge>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              {weeklyPlan.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  No sessions scheduled yet. Focus on steps, hydration, and
                  sleep.
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {profileCompletion &&
      profileCompletion.completed < profileCompletion.total ? (
        <Card className={`border-dashed ${cardChrome}`}>
          <CardHeader>
            <CardTitle>Complete your profile</CardTitle>
            <p className="text-sm text-muted-foreground">
              This helps your coach tailor your plan.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {profileCompletion.completed}/{profileCompletion.total} fields
              complete
            </div>
            <Button onClick={() => navigate("/app/profile")}>
              Complete profile
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className={`${cardChrome}`}>
            <CardHeader>
              <SectionHeader title="Today's Training" />
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
                        <p className="text-xs text-muted-foreground">
                          Rest day
                        </p>
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
                          {todayTemplate.name ??
                            (
                              todayWorkout as {
                                workout_template_name?: string;
                              } | null
                            )?.workout_template_name ??
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
                      <Badge variant="muted">
                        {todayTemplateInfo.workoutType}
                      </Badge>
                    ) : null}
                    {todayWorkoutStatus === "completed" ? (
                      <Button
                        className="w-full"
                        onClick={() =>
                          navigate(`/app/workout-summary/${todayWorkout.id}`)
                        }
                      >
                        View summary
                      </Button>
                    ) : todayWorkoutStatus === "skipped" ? (
                      <Button
                        className="w-full"
                        onClick={handleRequestAdjustment}
                      >
                        Request adjustment
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() =>
                          navigate(`/app/workout-run/${todayWorkout.id}`)
                        }
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
                    <p className="text-sm font-semibold">
                      No workout assigned yet
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Your coach hasn&apos;t scheduled today&apos;s session. You
                      can still do your default plan:
                    </p>
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {defaultPlan.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    onClick={handleStartDefaultSession}
                  >
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
              <SectionHeader title="Today's Nutrition" />
            </CardHeader>
            <CardContent className="space-y-3">
              {todayNutritionQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : todayNutrition ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Assigned for today
                      </p>
                      <p className="text-sm font-semibold">
                        {todayNutritionTemplate?.name ?? "Nutrition plan"}
                      </p>
                    </div>
                    <Badge variant="muted">planned</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-center text-xs">
                    <div>
                      <p className="text-muted-foreground">Cals</p>
                      <p className="font-semibold">
                        {Math.round(todayNutritionTotals.calories)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">P</p>
                      <p className="font-semibold">
                        {Math.round(todayNutritionTotals.protein_g)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">C</p>
                      <p className="font-semibold">
                        {Math.round(todayNutritionTotals.carbs_g)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">F</p>
                      <p className="font-semibold">
                        {Math.round(todayNutritionTotals.fat_g)}
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() =>
                      navigate(`/app/nutrition/${todayNutrition.id}`)
                    }
                  >
                    Open nutrition plan
                  </Button>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                    <p className="mb-2 font-semibold text-foreground">
                      Upcoming 7 days
                    </p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {Array.from({ length: 7 }).map((_, idx) => {
                        const date = addDaysToDateString(todayKey, idx);
                        const hasAssigned = (
                          nutritionWeekQuery.data ?? []
                        ).some((row: any) => row.date === date);
                        return (
                          <div
                            key={date}
                            className={`rounded-md border px-2 py-1 text-center ${
                              hasAssigned
                                ? "border-primary/60 bg-primary/10"
                                : "border-border/60"
                            }`}
                          >
                            {date.slice(5)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No nutrition assigned for today yet.
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
                    <p>
                      {targets?.coach_notes ??
                        "Today: protein first, hydrate, don't skip steps."}
                    </p>
                  </div>
                  {!hasTargets ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() =>
                        navigate(
                          `/app/messages?draft=${encodeURIComponent(
                            "Can you set my nutrition targets for this week?",
                          )}`,
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
        </div>

        <div className="space-y-6">
          <Card className={`${cardChrome}`}>
            <CardHeader>
              <SectionHeader title="Today's Checklist" />
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
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setChecklist(emptyChecklist)}
              >
                Reset today
              </Button>
            </CardContent>
          </Card>

          <ClientReminders clientId={clientId} timezone={clientTimezone} />
        </div>
      </div>
    </div>
  );
}
