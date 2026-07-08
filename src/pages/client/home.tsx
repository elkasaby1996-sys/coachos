import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Skeleton } from "../../components/ui/skeleton";
import {
  ActionStatusMessage,
  AnimatedValue,
  LoadingPanel,
} from "../../components/common/action-feedback";
import {
  EmptyStateBlock,
  PortalPageHeader,
  SectionCard,
  StatusBanner,
  SurfaceCard,
  SurfaceCardContent,
  SurfaceCardDescription,
  SurfaceCardHeader,
  SurfaceCardTitle,
} from "../../components/client/portal";
import { supabase } from "../../lib/supabase";
import { useBootstrapAuth, useSessionAuth } from "../../lib/auth";
import { formatRelativeTime } from "../../lib/relative-time";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import { useClientOnboarding } from "../../features/client-onboarding/hooks/use-client-onboarding";
import { ClientLeadDashboard } from "../../features/lead-chat/components/client-lead-dashboard";
import { useMyLeadChatThreads } from "../../features/lead-chat/lib/lead-chat";
import {
  clearInviteJoinParams,
  deriveInviteJoinContext,
} from "../../features/lead-chat/lib/invite-join-context";
import {
  buildSourceLabel,
  buildWorkoutRunPath,
  classifySourceKind,
  resolveUnifiedClientHomeState,
  sortWorkoutsByUrgency,
  type WorkoutLike,
} from "./home-unified";
import { useClientAssignmentRealtime } from "../../lib/client-assignment-realtime";

type QuickHabitFormState = {
  calories: string;
  protein_g: string;
  carbs_g: string;
  fats_g: string;
  weight_value: string;
  weight_unit: "kg" | "lb";
  steps: string;
  sleep_hours: string;
  energy: string;
  hunger: string;
  stress: string;
};

const emptyQuickHabitForm: QuickHabitFormState = {
  calories: "",
  protein_g: "",
  carbs_g: "",
  fats_g: "",
  weight_value: "",
  weight_unit: "kg",
  steps: "",
  sleep_hours: "",
  energy: "",
  hunger: "",
  stress: "",
};
const logInputClass = "border-border/70 bg-background/70 shadow-none";

const toNumberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type HomeConversationPreviewRow = {
  id: string;
  workspace_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
};

const getWorkoutTemplateInfo = (row: any) => {
  const raw = row?.workout_template ?? null;
  const template = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  return {
    name: template?.name ?? null,
    workout_type_tag: template?.workout_type_tag ?? null,
    description: template?.description ?? null,
    workspace_id: template?.workspace_id ?? null,
  };
};

function ClientWorkspaceHomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { session } = useSessionAuth();
  const { activeClientId, hasWorkspaceMembership } = useBootstrapAuth();
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

  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const calendarStartDate = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + calendarWeekOffset * 7);
    return date;
  }, [calendarWeekOffset, today]);
  const calendarStartKey = useMemo(
    () => formatDateKey(calendarStartDate),
    [calendarStartDate],
  );
  const calendarEndDate = useMemo(() => {
    const date = new Date(calendarStartDate);
    date.setDate(date.getDate() + 6);
    return date;
  }, [calendarStartDate]);
  const calendarEndKey = useMemo(
    () => formatDateKey(calendarEndDate),
    [calendarEndDate],
  );

  const [quickHabitForm, setQuickHabitForm] =
    useState<QuickHabitFormState>(emptyQuickHabitForm);
  const [quickHabitSaveStatus, setQuickHabitSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [quickHabitError, setQuickHabitError] = useState<string | null>(null);
  const focusModule = searchParams.get("focus");

  const clientQuery = useQuery({
    queryKey: ["client-home-profiles", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, workspace_id, display_name, goal, tags, created_at, phone, location, timezone, unit_preference, dob, gender, gym_name, days_per_week, injuries, limitations, height_cm, current_weight, photo_url",
        )
        .eq("user_id", session?.user?.id ?? "")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientProfiles = useMemo(
    () => clientQuery.data ?? [],
    [clientQuery.data],
  );
  const clientProfile = useMemo(
    () =>
      clientProfiles.find((row) => row.id === activeClientId) ??
      clientProfiles[0] ??
      null,
    [activeClientId, clientProfiles],
  );
  const clientId = clientProfile?.id ?? null;
  useClientAssignmentRealtime(clientId);
  const clientTimezone = clientProfile?.timezone ?? null;
  const onboardingSummary = useClientOnboarding().data ?? null;
  const todayStr = useMemo(
    () => getTodayInTimezone(clientTimezone),
    [clientTimezone],
  );
  const habitsStart = useMemo(
    () => addDaysToDateString(todayStr, -29),
    [todayStr],
  );
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
          "id, status, day_type, scheduled_date, created_at, completed_at, coach_note, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description, workspace_id)",
        )
        .eq("client_id", clientId)
        .eq("scheduled_date", todayKey)
        .order("created_at", { ascending: false })
        .returns<Array<Record<string, unknown>>>();
      if (error) throw error;
      return data ?? [];
    },
  });

  const todayNutritionQuery = useQuery({
    queryKey: ["assigned-nutrition-today", clientId, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: plans, error: planError } = await supabase
        .from("assigned_nutrition_plans")
        .select("id")
        .eq("client_id", clientId ?? "")
        .eq("status", "active");
      if (planError) throw planError;

      const planIds = (plans ?? []).map((row: { id: string }) => row.id);
      if (!planIds.length) return [];

      const { data, error } = await supabase
        .from("assigned_nutrition_days")
        .select(
          "id, date, assigned_nutrition_plan:assigned_nutrition_plans(id, client_id, nutrition_template:nutrition_templates(id, name, workspace_id)), meals:assigned_nutrition_meals(id, assigned_nutrition_day_id, calories, protein_g, carbs_g, fat_g, logs:nutrition_meal_logs(id, is_completed, actual_calories, actual_protein_g, actual_carbs_g, actual_fat_g, consumed_at))",
        )
        .in("assigned_nutrition_plan_id", planIds)
        .eq("date", todayKey)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const nutritionWeekQuery = useQuery({
    queryKey: ["assigned-nutrition-week", clientId, todayKey, weekEnd],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: plans, error: planError } = await supabase
        .from("assigned_nutrition_plans")
        .select("id")
        .eq("client_id", clientId ?? "")
        .eq("status", "active");
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
    queryKey: [
      "assigned-workouts-week-plan",
      clientId,
      calendarStartKey,
      calendarEndKey,
    ],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, scheduled_date, status, day_type, coach_note, created_at, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description, workspace_id)",
        )
        .eq("client_id", clientId)
        .gte("scheduled_date", calendarStartKey)
        .lte("scheduled_date", calendarEndKey)
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
        .select(
          "log_date, calories, protein_g, carbs_g, fats_g, weight_value, weight_unit, steps, sleep_hours, energy, hunger, stress, updated_at",
        )
        .eq("client_id", clientId ?? "")
        .gte("log_date", habitsStart)
        .lte("log_date", todayStr);
      if (error) throw error;
      return (data ?? []) as Array<{
        log_date: string;
        calories: number | null;
        protein_g: number | null;
        carbs_g: number | null;
        fats_g: number | null;
        weight_value: number | null;
        weight_unit: string | null;
        steps: number | null;
        sleep_hours: number | null;
        energy: number | null;
        hunger: number | null;
        stress: number | null;
        updated_at: string | null;
      }>;
    },
  });
  const leadThreadsQuery = useMyLeadChatThreads();

  const workspaceConversationPreviewQuery = useQuery({
    queryKey: ["client-home-conversation-preview", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, workspace_id, last_message_at, last_message_preview")
        .eq("client_id", clientId ?? "")
        .order("last_message_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as HomeConversationPreviewRow[];
    },
  });

  const todayWorkoutList = useMemo(
    () =>
      sortWorkoutsByUrgency(
        ((todayWorkoutQuery.data ?? []) as WorkoutLike[]).map((row) => ({
          ...row,
          created_at: row.created_at ?? null,
        })),
      ),
    [todayWorkoutQuery.data],
  );
  const todayWorkout = todayWorkoutList[0] ?? null;
  const isRestDay = !todayWorkout || todayWorkout.day_type === "rest";
  const todayWorkoutStatus =
    todayWorkout?.status === "pending"
      ? "planned"
      : (todayWorkout?.status ?? null);
  const targets = targetsQuery.data ?? null;
  const todayNutritionDays = useMemo(
    () => (todayNutritionQuery.data ?? []) as Array<Record<string, unknown>>,
    [todayNutritionQuery.data],
  );
  const todayNutrition = todayNutritionDays[0] ?? null;
  const upcomingNutritionDay = (nutritionWeekQuery.data ?? [])[0] ?? null;
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
  const weeklyPlan = useMemo(
    () => weeklyPlanQuery.data ?? [],
    [weeklyPlanQuery.data],
  );
  const sourceWorkspaceIds = useMemo(() => {
    const ids = new Set<string>();
    const add = (value: string | null | undefined) => {
      if (value && value.trim().length > 0) {
        ids.add(value);
      }
    };

    add(getWorkoutTemplateInfo(todayWorkout).workspace_id);
    weeklyPlan.forEach((row) => {
      add(getWorkoutTemplateInfo(row).workspace_id);
    });
    todayNutritionDays.forEach((row) => {
      const assignedPlan = Array.isArray(
        (row as { assigned_nutrition_plan?: unknown })?.assigned_nutrition_plan,
      )
        ? (row as { assigned_nutrition_plan?: Array<Record<string, unknown>> })
            .assigned_nutrition_plan?.[0]
        : ((row as { assigned_nutrition_plan?: Record<string, unknown> })
            .assigned_nutrition_plan ?? null);
      const nutritionTemplate = Array.isArray(
        assignedPlan?.nutrition_template as unknown,
      )
        ? (
            assignedPlan?.nutrition_template as Array<Record<string, unknown>>
          )[0]
        : (assignedPlan?.nutrition_template as Record<string, unknown> | null);
      add(
        (nutritionTemplate?.workspace_id as string | null | undefined) ?? null,
      );
    });
    (workspaceConversationPreviewQuery.data ?? []).forEach((conversation) => {
      add(conversation.workspace_id ?? null);
    });
    add(clientProfile?.workspace_id ?? null);

    return Array.from(ids);
  }, [
    clientProfile?.workspace_id,
    todayNutritionDays,
    todayWorkout,
    weeklyPlan,
    workspaceConversationPreviewQuery.data,
  ]);
  const sourceWorkspacesQuery = useQuery({
    queryKey: ["client-home-source-workspaces", sourceWorkspaceIds.join(",")],
    enabled: sourceWorkspaceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", sourceWorkspaceIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const workspaceNameById = useMemo(
    () =>
      Object.fromEntries(
        (sourceWorkspacesQuery.data ?? []).map((row) => [row.id, row.name]),
      ) as Record<string, string>,
    [sourceWorkspacesQuery.data],
  );
  const getSourceMetaLabel = useCallback(
    (workspaceId: string | null | undefined) =>
      buildSourceLabel({
        workspaceId,
        workspaceName: workspaceId ? workspaceNameById[workspaceId] : null,
      }),
    [workspaceNameById],
  );
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
  const todaySourceLabel = getSourceMetaLabel(todayTemplate.workspace_id);

  const todayHabitLog = useMemo(
    () =>
      (habitLogsQuery.data ?? []).find((row) => row.log_date === todayStr) ??
      null,
    [habitLogsQuery.data, todayStr],
  );
  useEffect(() => {
    setQuickHabitForm({
      calories:
        todayHabitLog?.calories !== null &&
        todayHabitLog?.calories !== undefined
          ? String(todayHabitLog.calories)
          : "",
      protein_g:
        todayHabitLog?.protein_g !== null &&
        todayHabitLog?.protein_g !== undefined
          ? String(todayHabitLog.protein_g)
          : "",
      carbs_g:
        todayHabitLog?.carbs_g !== null && todayHabitLog?.carbs_g !== undefined
          ? String(todayHabitLog.carbs_g)
          : "",
      fats_g:
        todayHabitLog?.fats_g !== null && todayHabitLog?.fats_g !== undefined
          ? String(todayHabitLog.fats_g)
          : "",
      weight_value:
        todayHabitLog?.weight_value !== null &&
        todayHabitLog?.weight_value !== undefined
          ? String(todayHabitLog.weight_value)
          : "",
      weight_unit: todayHabitLog?.weight_unit === "lb" ? "lb" : "kg",
      steps:
        todayHabitLog?.steps !== null && todayHabitLog?.steps !== undefined
          ? String(todayHabitLog.steps)
          : "",
      sleep_hours:
        todayHabitLog?.sleep_hours !== null &&
        todayHabitLog?.sleep_hours !== undefined
          ? String(todayHabitLog.sleep_hours)
          : "",
      energy:
        todayHabitLog?.energy !== null && todayHabitLog?.energy !== undefined
          ? String(todayHabitLog.energy)
          : "",
      hunger:
        todayHabitLog?.hunger !== null && todayHabitLog?.hunger !== undefined
          ? String(todayHabitLog.hunger)
          : "",
      stress:
        todayHabitLog?.stress !== null && todayHabitLog?.stress !== undefined
          ? String(todayHabitLog.stress)
          : "",
    });
    setQuickHabitSaveStatus("idle");
    setQuickHabitError(null);
  }, [todayHabitLog]);
  const quickHabitCompletedCount = [
    quickHabitForm.calories.trim(),
    quickHabitForm.protein_g.trim(),
    quickHabitForm.carbs_g.trim(),
    quickHabitForm.fats_g.trim(),
    quickHabitForm.weight_value.trim(),
    quickHabitForm.steps.trim(),
    quickHabitForm.sleep_hours.trim(),
    quickHabitForm.energy.trim(),
    quickHabitForm.hunger.trim(),
    quickHabitForm.stress.trim(),
  ].filter(Boolean).length;
  const quickHabitTotal = 10;
  const checklistProgress = Math.round(
    (quickHabitCompletedCount / quickHabitTotal) * 100,
  );
  const hasClientProfile = Boolean(clientId);
  const hasAssignedWorkoutPlan = weeklyPlan.some(
    (workout) => workout.day_type !== "rest",
  );
  const summaryTrainingStatus =
    !hasClientProfile || !hasAssignedWorkoutPlan
      ? "No plan yet"
      : isRestDay
        ? "Rest day"
        : todayWorkoutStatus === "completed"
          ? "completed"
          : todayWorkoutStatus === "skipped"
            ? "skipped"
            : todayWorkout
              ? "planned"
              : "Rest day";
  const summaryTrainingBadgeLabel =
    summaryTrainingStatus === "No plan yet"
      ? "Not assigned"
      : summaryTrainingStatus === "completed"
        ? "Completed"
        : summaryTrainingStatus === "skipped"
          ? "Skipped"
          : summaryTrainingStatus === "planned"
            ? "Scheduled"
            : "Rest day";
  const summaryTrainingTitle = !hasClientProfile
    ? "Find your first coach"
    : !hasAssignedWorkoutPlan
      ? "Your coach has not assigned a workout plan yet."
      : isRestDay
        ? "Rest day"
        : (todayTemplate.name ??
          (todayWorkout as { workout_template_name?: string } | null)
            ?.workout_template_name ??
          "Rest day");
  const summaryTrainingHint = !hasClientProfile
    ? "No assigned plan yet. Explore coaches to start your training flow."
    : !hasAssignedWorkoutPlan
      ? "Workout details will appear here when your coach assigns a plan."
      : isRestDay
        ? "No workout assigned for today."
        : todayWorkoutStatus === "completed"
          ? "Session logged"
          : todayWorkoutStatus === "skipped"
            ? "Coach notified"
            : todayWorkout
              ? "Ready when you are"
              : "No workout assigned for today.";
  const handleQuickHabitSave = useCallback(async () => {
    if (!clientId || !todayStr) return;

    setQuickHabitSaveStatus("saving");
    setQuickHabitError(null);

    const { data, error } = await supabase
      .from("habit_logs")
      .upsert(
        {
          client_id: clientId,
          log_date: todayStr,
          calories: toNumberOrNull(quickHabitForm.calories),
          protein_g: toNumberOrNull(quickHabitForm.protein_g),
          carbs_g: toNumberOrNull(quickHabitForm.carbs_g),
          fats_g: toNumberOrNull(quickHabitForm.fats_g),
          weight_value: toNumberOrNull(quickHabitForm.weight_value),
          weight_unit: quickHabitForm.weight_unit,
          steps: toNumberOrNull(quickHabitForm.steps),
          sleep_hours: toNumberOrNull(quickHabitForm.sleep_hours),
          energy: toNumberOrNull(quickHabitForm.energy),
          hunger: toNumberOrNull(quickHabitForm.hunger),
          stress: toNumberOrNull(quickHabitForm.stress),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id,log_date" },
      )
      .select(
        "log_date, calories, protein_g, carbs_g, fats_g, weight_value, weight_unit, steps, sleep_hours, energy, hunger, stress, updated_at",
      )
      .single();

    if (error) {
      setQuickHabitError(error.message || "Couldn't save this log.");
      setQuickHabitSaveStatus("error");
      return;
    }

    queryClient.setQueryData(
      ["client-habit-logs", clientId, habitsStart, todayStr],
      (
        current:
          | Array<{
              log_date: string;
              calories: number | null;
              protein_g: number | null;
              carbs_g: number | null;
              fats_g: number | null;
              weight_value: number | null;
              weight_unit: string | null;
              steps: number | null;
              sleep_hours: number | null;
              energy: number | null;
              hunger: number | null;
              stress: number | null;
              updated_at: string | null;
            }>
          | undefined,
      ) => {
        const rows = current ?? [];
        const nextRow = data as {
          log_date: string;
          calories: number | null;
          protein_g: number | null;
          carbs_g: number | null;
          fats_g: number | null;
          weight_value: number | null;
          weight_unit: string | null;
          steps: number | null;
          sleep_hours: number | null;
          energy: number | null;
          hunger: number | null;
          stress: number | null;
          updated_at: string | null;
        };
        const exists = rows.some((row) => row.log_date === todayStr);
        if (exists) {
          return rows.map((row) => (row.log_date === todayStr ? nextRow : row));
        }
        return [...rows, nextRow];
      },
    );
    setQuickHabitSaveStatus("saved");
    await habitLogsQuery.refetch();
  }, [
    clientId,
    habitLogsQuery,
    habitsStart,
    queryClient,
    quickHabitForm,
    todayStr,
  ]);
  const leadThreads = useMemo(
    () => leadThreadsQuery.data ?? [],
    [leadThreadsQuery.data],
  );
  const hasPersonalSource = Boolean(
    !clientProfile?.workspace_id ||
    classifySourceKind({
      workspaceId: getWorkoutTemplateInfo(todayWorkout).workspace_id,
    }) === "personal" ||
    todayNutritionDays.some((row) => {
      const assignedPlan = Array.isArray(
        (row as { assigned_nutrition_plan?: unknown })?.assigned_nutrition_plan,
      )
        ? (row as { assigned_nutrition_plan?: Array<Record<string, unknown>> })
            .assigned_nutrition_plan?.[0]
        : ((row as { assigned_nutrition_plan?: Record<string, unknown> })
            .assigned_nutrition_plan ?? null);
      const nutritionTemplate = Array.isArray(
        assignedPlan?.nutrition_template as unknown,
      )
        ? (
            assignedPlan?.nutrition_template as Array<Record<string, unknown>>
          )[0]
        : (assignedPlan?.nutrition_template as Record<string, unknown> | null);
      return (
        classifySourceKind({
          workspaceId:
            (nutritionTemplate?.workspace_id as string | null | undefined) ??
            null,
        }) === "personal"
      );
    }),
  );
  const coachSourceCount = sourceWorkspaceIds.length;
  const unifiedHomeState = resolveUnifiedClientHomeState({
    hasWorkspaceMembership,
    coachSourceCount,
    hasPersonalSource,
  });
  const featuredCoach = leadThreads.find((thread) => Boolean(thread.ptSlug));
  const findCoachHref = featuredCoach?.ptSlug
    ? `/coach/${featuredCoach.ptSlug}`
    : "/signup/client";
  const workoutFeedItems = useMemo(
    () => sortWorkoutsByUrgency((weeklyPlan as WorkoutLike[]) ?? []),
    [weeklyPlan],
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
    ? `Last coach review ${formatRelativeTime(latestCoachActivity.created_at)}`
    : "Coach review pending";

  const profileCompletion = useMemo(() => {
    if (!clientProfile) return null;
    const client = clientProfile as {
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
  }, [clientProfile]);

  const weekRows = useMemo(() => {
    const rows = Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(calendarStartDate);
      date.setDate(date.getDate() + idx);
      const key = formatDateKey(date);
      const match = weeklyPlan.find((item) => item.scheduled_date === key);
      return { date, key, workout: match ?? null };
    });
    return rows;
  }, [calendarStartDate, weeklyPlan]);

  const handleRequestAdjustment = () => {
    navigate(
      `/app/messages?draft=${encodeURIComponent(
        "I skipped today's workout - can we adjust?",
      )}`,
    );
  };

  const trainingStatusVariant =
    summaryTrainingStatus === "No plan yet"
      ? "muted"
      : summaryTrainingStatus === "completed"
        ? "success"
        : summaryTrainingStatus === "skipped"
          ? "danger"
          : summaryTrainingStatus === "planned"
            ? "secondary"
            : summaryTrainingStatus.toLowerCase().includes("rest")
              ? "warning"
              : "muted";
  const nutritionRequestDraft = encodeURIComponent(
    "Can you set my nutrition targets for this week?",
  );
  const primaryAction = (() => {
    if (!clientId) {
      return {
        label: "Find a Coach",
        onClick: () => navigate(findCoachHref),
      };
    }

    if (todayWorkout && !isRestDay) {
      if (todayWorkoutStatus === "completed") {
        return {
          label: "View workout summary",
          onClick: () => navigate(`/app/workout-summary/${todayWorkout.id}`),
        };
      }
      if (todayWorkoutStatus === "skipped") {
        return {
          label: "Request adjustment",
          onClick: handleRequestAdjustment,
        };
      }
      return {
        label: "Start workout",
        onClick: () => navigate(buildWorkoutRunPath(todayWorkout.id)),
      };
    }

    if (isRestDay) {
      return {
        label: "Open habit log",
        onClick: () => navigate("/app/habits"),
      };
    }

    return {
      label: "Open workouts",
      onClick: () => navigate("/app/workouts"),
    };
  })();

  useEffect(() => {
    if (!focusModule) return;

    const targetId =
      focusModule === "workouts"
        ? "home-section-workouts"
        : focusModule === "nutrition"
          ? "home-section-nutrition"
          : null;
    if (!targetId) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(targetId);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [focusModule]);

  const homeDataError =
    coachActivityQuery.error ??
    todayWorkoutQuery.error ??
    todayNutritionQuery.error ??
    nutritionWeekQuery.error ??
    weeklyPlanQuery.error ??
    targetsQuery.error ??
    habitLogsQuery.error ??
    sourceWorkspacesQuery.error ??
    workspaceConversationPreviewQuery.error ??
    leadThreadsQuery.error;
  const homeSubtitle = hasClientProfile
    ? `${subtitleDate}. Your plan, targets, and recovery for today.`
    : `${subtitleDate}. One client app for workouts, habits, messages, and finding your coach.`;
  const homeStateText =
    unifiedHomeState === "lead_only"
      ? "Lead and discovery mode"
      : coachBadgeLabel;
  const showWorkoutsAndNutritionCard = false;
  const isViewingCurrentWeek = calendarWeekOffset === 0;
  const calendarSection = (
    <SurfaceCard>
      <SurfaceCardHeader className="flex-row items-center justify-between gap-3">
        <SurfaceCardTitle>Calendar</SurfaceCardTitle>
        <div className="flex items-center gap-2">
          {!isViewingCurrentWeek ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 px-3"
              onClick={() => setCalendarWeekOffset(0)}
            >
              Today
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Previous week"
            onClick={() => setCalendarWeekOffset((current) => current - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Next week"
            onClick={() => setCalendarWeekOffset((current) => current + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </SurfaceCardHeader>
      <SurfaceCardContent className="space-y-4">
        {weeklyPlanQuery.isLoading ? (
          <LoadingPanel
            title="Loading calendar"
            description="Mapping the next 7 days of training and recovery."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
              {weekRows.map((row) => {
                const workout = row.workout;
                const rowIsRestDay = !workout || workout.day_type === "rest";
                const status = rowIsRestDay
                  ? "rest day"
                  : workout.status === "pending"
                    ? "planned"
                    : (workout.status ?? "planned");
                const statusLabel =
                  status === "completed"
                    ? "Completed"
                    : status === "skipped"
                      ? "Skipped"
                      : status === "planned"
                        ? "Scheduled"
                        : "Rest day";
                const title = rowIsRestDay
                  ? "Rest day"
                  : (getWorkoutTemplateInfo(workout).name ??
                    (workout as { workout_template_name?: string })
                      ?.workout_template_name ??
                    "Workout");
                const statusVariant =
                  status === "completed"
                    ? "success"
                    : status === "skipped"
                      ? "danger"
                      : status === "rest day"
                        ? "warning"
                        : "muted";
                const workoutType = rowIsRestDay
                  ? null
                  : (getWorkoutTemplateInfo(workout).workout_type_tag ??
                    "Workout");

                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => {
                      if (workout?.id && !rowIsRestDay) {
                        navigate(`/app/workouts/${workout.id}`);
                      }
                    }}
                    disabled={!workout?.id || rowIsRestDay}
                    className={`rounded-[var(--radius-lg)] border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      row.key === todayKey
                        ? "border-primary/40 bg-primary/10 shadow-[0_18px_42px_-34px_rgba(56,189,248,0.75)]"
                        : "border-border/70 bg-background/45 hover:border-border"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {row.date.toLocaleDateString("en-US", {
                            weekday: "short",
                            day: "numeric",
                          })}
                        </span>
                        {!rowIsRestDay ? (
                          <Badge variant={statusVariant}>{statusLabel}</Badge>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        <p className="line-clamp-2 text-sm font-semibold text-foreground">
                          {title}
                        </p>
                        {workoutType ? (
                          <p className="text-xs text-muted-foreground">
                            {workoutType}
                          </p>
                        ) : null}
                      </div>
                      {workout?.coach_note ? (
                        <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
                          {workout.coach_note}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {weeklyPlan.length === 0 ? (
              <EmptyStateBlock
                title="No sessions scheduled yet"
                description="Focus on recovery basics while your coach builds your next training block."
              />
            ) : null}
          </>
        )}
      </SurfaceCardContent>
    </SurfaceCard>
  );

  return (
    <div className="portal-shell" data-testid="client-home-page">
      <PortalPageHeader
        title="Home"
        subtitle={homeSubtitle}
        stateText={homeStateText}
      />

      {homeDataError ? (
        <StatusBanner
          variant="warning"
          title="Some parts of home are unavailable"
          description={
            homeDataError instanceof Error
              ? `${homeDataError.message} The rest of your dashboard is still available.`
              : "A few cards could not be refreshed right now, but the rest of your dashboard is still available."
          }
        />
      ) : null}

      {!hasWorkspaceMembership ? (
        <StatusBanner
          variant="info"
          title="You do not currently have an active coaching workspace."
          description="Your client account is still active. Use a coach invite when you are ready to join a workspace again."
        />
      ) : null}

      {calendarSection}

      <SurfaceCard id="home-section-next-up">
        <SurfaceCardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <SurfaceCardTitle className="text-2xl">
                Today&apos;s agenda
              </SurfaceCardTitle>
              {todayWorkout ? (
                <Badge variant="muted" className="w-fit">
                  {todaySourceLabel}
                </Badge>
              ) : null}
              <SurfaceCardDescription>
                {summaryTrainingHint}
              </SurfaceCardDescription>
            </div>
          </div>
        </SurfaceCardHeader>
        <SurfaceCardContent className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)]">
          <SectionCard className="space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="field-label">Today&apos;s workout</p>
                  <p className="text-xl font-semibold leading-7 text-foreground">
                    {summaryTrainingTitle}
                  </p>
                </div>
              </div>
              {todayTemplateInfo.workoutType ? (
                <Badge variant="muted" className="w-fit">
                  {todayTemplateInfo.workoutType}
                </Badge>
              ) : null}
            </div>

            {todayWorkout?.coach_note ? (
              <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 p-4">
                <p className="field-label">Coach note</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {todayWorkout.coach_note}
                </p>
              </div>
            ) : null}
          </SectionCard>

          <div className="space-y-3">
            <SectionCard className="space-y-4">
              <div className="space-y-1">
                <div>
                  <p className="field-label">Today&apos;s nutrition</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {todayNutritionTemplate?.name ??
                      "Your coach has not assigned a nutrition plan yet."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  <div className="space-y-0.5">
                    <p className="font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Calories
                    </p>
                    <p className="font-semibold text-foreground">
                      {Math.round(todayNutritionTotals.calories)} kcal
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Protein
                    </p>
                    <p className="font-semibold text-foreground">
                      {Math.round(todayNutritionTotals.protein_g)}g
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Carbs
                    </p>
                    <p className="font-semibold text-foreground">
                      {Math.round(todayNutritionTotals.carbs_g)}g
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Fats
                    </p>
                    <p className="font-semibold text-foreground">
                      {Math.round(todayNutritionTotals.fat_g)}g
                    </p>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        </SurfaceCardContent>
      </SurfaceCard>

      <SurfaceCard id="home-section-checklist">
        <SurfaceCardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <SurfaceCardTitle>Today&apos;s checklist</SurfaceCardTitle>
              <SurfaceCardDescription>
                Track the daily basics. Tap any check to log it instantly.
              </SurfaceCardDescription>
            </div>
            <Badge
              variant={checklistProgress === 100 ? "success" : "secondary"}
            >
              <AnimatedValue
                value={`${quickHabitCompletedCount}/${quickHabitTotal} logged`}
              />
            </Badge>
          </div>
        </SurfaceCardHeader>
        <SurfaceCardContent className="space-y-5">
          <SectionCard>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleQuickHabitSave();
              }}
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Quick habit log
                </p>
                <p className="text-sm text-muted-foreground">
                  Log today&apos;s nutrition, recovery, body, and activity.
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="field-label">Nutrition</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <label
                        className="field-label"
                        htmlFor="home-habit-calories"
                      >
                        Calories
                      </label>
                      <Input
                        id="home-habit-calories"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className={logInputClass}
                        placeholder={
                          typeof targets?.calories === "number"
                            ? targets.calories.toLocaleString()
                            : "kcal"
                        }
                        value={quickHabitForm.calories}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            calories: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="field-label"
                        htmlFor="home-habit-protein"
                      >
                        Protein
                      </label>
                      <Input
                        id="home-habit-protein"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className={logInputClass}
                        placeholder={
                          typeof targets?.protein_g === "number"
                            ? `${targets.protein_g}g`
                            : "g"
                        }
                        value={quickHabitForm.protein_g}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            protein_g: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="field-label" htmlFor="home-habit-carbs">
                        Carbs
                      </label>
                      <Input
                        id="home-habit-carbs"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className={logInputClass}
                        placeholder="g"
                        value={quickHabitForm.carbs_g}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            carbs_g: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="field-label" htmlFor="home-habit-fats">
                        Fats
                      </label>
                      <Input
                        id="home-habit-fats"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className={logInputClass}
                        placeholder="g"
                        value={quickHabitForm.fats_g}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            fats_g: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="field-label">Recovery</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <label className="field-label" htmlFor="home-habit-sleep">
                        Sleep
                      </label>
                      <Input
                        id="home-habit-sleep"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        className={logInputClass}
                        placeholder="Hours"
                        value={quickHabitForm.sleep_hours}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            sleep_hours: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="field-label"
                        htmlFor="home-habit-energy"
                      >
                        Energy
                      </label>
                      <Input
                        id="home-habit-energy"
                        type="number"
                        min="1"
                        max="10"
                        inputMode="numeric"
                        className={logInputClass}
                        placeholder="1-10"
                        value={quickHabitForm.energy}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            energy: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="field-label"
                        htmlFor="home-habit-hunger"
                      >
                        Hunger
                      </label>
                      <Input
                        id="home-habit-hunger"
                        type="number"
                        min="1"
                        max="10"
                        inputMode="numeric"
                        className={logInputClass}
                        placeholder="1-10"
                        value={quickHabitForm.hunger}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            hunger: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="field-label"
                        htmlFor="home-habit-stress"
                      >
                        Stress
                      </label>
                      <Input
                        id="home-habit-stress"
                        type="number"
                        min="1"
                        max="10"
                        inputMode="numeric"
                        className={logInputClass}
                        placeholder="1-10"
                        value={quickHabitForm.stress}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            stress: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="field-label">Body + activity</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <label
                        className="field-label"
                        htmlFor="home-habit-weight"
                      >
                        Weight
                      </label>
                      <Input
                        id="home-habit-weight"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        className={logInputClass}
                        placeholder={quickHabitForm.weight_unit}
                        value={quickHabitForm.weight_value}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            weight_value: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="field-label">Unit</p>
                      <div className="grid h-10 grid-cols-2 overflow-hidden rounded-md border border-border/70 bg-background/70">
                        {(["kg", "lb"] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            className={`cursor-pointer text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              quickHabitForm.weight_unit === unit
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            }`}
                            onClick={() =>
                              setQuickHabitForm((prev) => ({
                                ...prev,
                                weight_unit: unit,
                              }))
                            }
                            aria-pressed={quickHabitForm.weight_unit === unit}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 sm:col-span-2 xl:col-span-2">
                      <label className="field-label" htmlFor="home-habit-steps">
                        Steps
                      </label>
                      <Input
                        id="home-habit-steps"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className={logInputClass}
                        placeholder={
                          typeof targets?.steps === "number"
                            ? targets.steps.toLocaleString()
                            : "0"
                        }
                        value={quickHabitForm.steps}
                        onChange={(event) =>
                          setQuickHabitForm((prev) => ({
                            ...prev,
                            steps: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={!clientId || quickHabitSaveStatus === "saving"}
                >
                  {quickHabitSaveStatus === "saving"
                    ? "Saving..."
                    : "Save quick log"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/app/habits")}
                >
                  Open full log
                </Button>
              </div>
              {quickHabitSaveStatus === "saved" ? (
                <ActionStatusMessage tone="success">
                  Quick habit log saved.
                </ActionStatusMessage>
              ) : null}
              {quickHabitSaveStatus === "error" && quickHabitError ? (
                <ActionStatusMessage tone="error">
                  {quickHabitError}
                </ActionStatusMessage>
              ) : null}
            </form>
          </SectionCard>
        </SurfaceCardContent>
      </SurfaceCard>

      {profileCompletion &&
      profileCompletion.completed < profileCompletion.total &&
      onboardingSummary?.onboarding.status === "completed" ? (
        <StatusBanner
          variant="info"
          title="Complete your profile"
          description={`${profileCompletion.completed}/${profileCompletion.total} fields complete. Filling in the rest helps your coach tailor the plan.`}
          actions={
            <Button onClick={() => navigate("/app/settings?tab=profile")}>
              Finish profile
            </Button>
          }
        />
      ) : null}

      {showWorkoutsAndNutritionCard ? (
        <SurfaceCard id="home-section-workouts">
          <SurfaceCardHeader>
            <SurfaceCardTitle>Workouts and nutrition</SurfaceCardTitle>
            <SurfaceCardDescription>
              One account-level view of today and next-up actions across
              personal and coached plans.
            </SurfaceCardDescription>
          </SurfaceCardHeader>
          <SurfaceCardContent className="grid gap-6 lg:grid-cols-2">
            <SectionCard className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Workouts
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {summaryTrainingTitle}
                  </p>
                </div>
                <Badge variant={trainingStatusVariant}>
                  {summaryTrainingBadgeLabel}
                </Badge>
              </div>
              {todayTemplateInfo.workoutType ? (
                <p className="text-sm text-muted-foreground">
                  {todayTemplateInfo.workoutType}
                </p>
              ) : null}
              <p className="text-sm leading-6 text-muted-foreground">
                {summaryTrainingHint}
              </p>
              {workoutFeedItems.length > 0 ? (
                <div className="space-y-2">
                  {workoutFeedItems.slice(0, 4).map((workout) => {
                    const template = getWorkoutTemplateInfo(workout);
                    const sourceLabel = getSourceMetaLabel(
                      template.workspace_id,
                    );
                    const workoutName =
                      template.name ??
                      (workout as { workout_template_name?: string })
                        .workout_template_name ??
                      "Workout";
                    const workoutAction =
                      workout.status === "completed"
                        ? {
                            label: "Summary",
                            onClick: () =>
                              navigate(`/app/workout-summary/${workout.id}`),
                          }
                        : workout.status === "skipped"
                          ? {
                              label: "Details",
                              onClick: () =>
                                navigate(`/app/workouts/${workout.id}`),
                            }
                          : {
                              label: "Start",
                              onClick: () =>
                                navigate(buildWorkoutRunPath(workout.id)),
                            };
                    return (
                      <div
                        key={workout.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-3 py-2"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {workoutName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="muted">{sourceLabel}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {workout.scheduled_date ?? todayKey}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={workoutAction.onClick}
                        >
                          {workoutAction.label}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyStateBlock
                  title="Your coach has not assigned a workout plan yet."
                  description="Workout details will appear here when your coach assigns a plan."
                />
              )}
              <div className="flex flex-wrap gap-3">
                <Button onClick={primaryAction.onClick}>
                  {primaryAction.label}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate("/app/messages")}
                >
                  {hasWorkspaceMembership ? "Message your coach" : "Open inbox"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard id="home-section-nutrition" className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  Nutrition
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {todayNutritionTemplate?.name ??
                    "Your coach has not assigned a nutrition plan yet."}
                </p>
                {todayNutritionTemplate ? (
                  <Badge variant="muted">
                    {getSourceMetaLabel(todayNutritionTemplate.workspace_id)}
                  </Badge>
                ) : null}
              </div>

              {todayNutritionQuery.isLoading ? (
                <LoadingPanel
                  title="Loading nutrition"
                  description="Pulling in today’s meals and macro targets."
                />
              ) : todayNutrition ? (
                <>
                  {todayNutritionDays.length > 1 ? (
                    <div className="space-y-2">
                      {todayNutritionDays.slice(0, 4).map((day) => {
                        const assignedPlan = Array.isArray(
                          (day as { assigned_nutrition_plan?: unknown })
                            .assigned_nutrition_plan,
                        )
                          ? (
                              day as {
                                assigned_nutrition_plan?: Array<
                                  Record<string, unknown>
                                >;
                              }
                            ).assigned_nutrition_plan?.[0]
                          : (
                              day as {
                                assigned_nutrition_plan?: Record<
                                  string,
                                  unknown
                                >;
                              }
                            ).assigned_nutrition_plan;
                        const nutritionTemplate = Array.isArray(
                          assignedPlan?.nutrition_template as unknown,
                        )
                          ? (
                              assignedPlan?.nutrition_template as Array<
                                Record<string, unknown>
                              >
                            )[0]
                          : (assignedPlan?.nutrition_template as Record<
                              string,
                              unknown
                            > | null);
                        return (
                          <div
                            key={String((day as { id?: string }).id ?? "")}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-3 py-2"
                          >
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {(nutritionTemplate?.name as
                                  | string
                                  | undefined) ?? "Nutrition plan"}
                              </p>
                              <Badge variant="muted">
                                {getSourceMetaLabel(
                                  (nutritionTemplate?.workspace_id as
                                    | string
                                    | null
                                    | undefined) ?? null,
                                )}
                              </Badge>
                            </div>
                            {(day as { id?: string }).id ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  navigate(
                                    `/app/nutrition/${(day as { id: string }).id}`,
                                  )
                                }
                              >
                                Open
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-4 rounded-[var(--radius-lg)] border border-border/70 bg-background/45 p-4 text-center sm:grid-cols-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Calories</p>
                      <p className="font-semibold">
                        {Math.round(todayNutritionTotals.calories)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Protein</p>
                      <p className="font-semibold">
                        {Math.round(todayNutritionTotals.protein_g)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Carbs</p>
                      <p className="font-semibold">
                        {Math.round(todayNutritionTotals.carbs_g)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Fat</p>
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
                    View nutrition plan
                  </Button>
                </>
              ) : (
                <EmptyStateBlock
                  title="No nutrition plan assigned"
                  description="Your coach has not assigned a nutrition plan yet."
                  actions={
                    upcomingNutritionDay?.id ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigate(`/app/nutrition/${upcomingNutritionDay.id}`)
                        }
                      >
                        Open next nutrition day
                      </Button>
                    ) : undefined
                  }
                />
              )}

              {targetsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 p-4">
                      <p className="text-sm text-muted-foreground">Calories</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {typeof targets?.calories === "number"
                          ? targets.calories.toLocaleString()
                          : "Coach setting in progress"}
                      </p>
                    </div>
                    <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 p-4">
                      <p className="text-sm text-muted-foreground">Protein</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {typeof targets?.protein_g === "number"
                          ? `${targets.protein_g} g`
                          : "Prioritize protein today"}
                      </p>
                    </div>
                    <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 p-4">
                      <p className="text-sm text-muted-foreground">Steps</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {typeof targets?.steps === "number"
                          ? targets.steps.toLocaleString()
                          : "8,000 focus"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 p-4">
                    <p className="text-sm font-medium text-foreground">
                      Coach note
                    </p>
                    <p className="mt-3 text-sm leading-6 text-foreground">
                      {targets?.coach_notes ??
                        "Today: protein first, hydrate, and don't skip steps."}
                    </p>
                  </div>
                  {!hasTargets ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() =>
                        navigate(`/app/messages?draft=${nutritionRequestDraft}`)
                      }
                    >
                      Ask for targets
                    </Button>
                  ) : null}
                </>
              )}
            </SectionCard>
          </SurfaceCardContent>
        </SurfaceCard>
      ) : null}

      {!hasWorkspaceMembership && leadThreads.length > 0 ? (
        <SurfaceCard id="home-section-progress">
          <SurfaceCardHeader>
            <SurfaceCardTitle>Lead conversations</SurfaceCardTitle>
            <SurfaceCardDescription>
              Continue pre-workspace chat in the same home surface.
            </SurfaceCardDescription>
          </SurfaceCardHeader>
          <SurfaceCardContent>
            <ClientLeadDashboard embedded />
          </SurfaceCardContent>
        </SurfaceCard>
      ) : null}
    </div>
  );
}

export function ClientHomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasWorkspaceMembership } = useBootstrapAuth();
  const inviteJoinContext = useMemo(
    () =>
      deriveInviteJoinContext({
        searchParams,
        hasWorkspaceMembership,
      }),
    [hasWorkspaceMembership, searchParams],
  );
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(
    inviteJoinContext.shouldShowModal,
  );

  useEffect(() => {
    setIsInviteModalOpen(inviteJoinContext.shouldShowModal);
  }, [inviteJoinContext.shouldShowModal]);

  const clearInviteJoinSearchParams = () => {
    setSearchParams(clearInviteJoinParams(searchParams), { replace: true });
  };

  return (
    <>
      <ClientWorkspaceHomePage />

      <Dialog
        open={isInviteModalOpen && inviteJoinContext.shouldShowModal}
        onOpenChange={(open) => {
          setIsInviteModalOpen(open);
          if (!open) {
            clearInviteJoinSearchParams();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Workspace access activated</DialogTitle>
            <DialogDescription>
              You have been added to{" "}
              <span className="font-medium text-foreground">
                {inviteJoinContext.workspaceName}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[18px] border border-border/70 bg-background/45 p-3 text-sm text-muted-foreground">
            {inviteJoinContext.message}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setIsInviteModalOpen(false);
                clearInviteJoinSearchParams();
              }}
            >
              Continue to dashboard
            </Button>
            <Button
              onClick={() => {
                setIsInviteModalOpen(false);
                clearInviteJoinSearchParams();
                navigate("/app/messages");
              }}
            >
              Open messages
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
