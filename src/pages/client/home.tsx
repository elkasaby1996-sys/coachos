import { hydrateNutritionAssignmentContext } from "../../lib/nutrition-assignment-context";
import { sumRecorded, formatRecorded } from "../../lib/client-measurements";
import "../../styles/client-home.css";
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
      await Promise.all(
        (data ?? []).map((row) =>
          hydrateNutritionAssignmentContext(row.assigned_nutrition_plan),
        ),
      );
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
  const isRestDay = todayWorkout?.day_type === "rest";
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
    const logs = meals.map(
      (meal) =>
        (meal.logs ?? [])
          .slice()
          .sort((a, b) =>
            String(b.consumed_at).localeCompare(String(a.consumed_at)),
          )[0],
    );
    return {
      calories: sumRecorded(logs.map((log) => log?.actual_calories)),
      protein_g: sumRecorded(logs.map((log) => log?.actual_protein_g)),
      carbs_g: sumRecorded(logs.map((log) => log?.actual_carbs_g)),
      fat_g: sumRecorded(logs.map((log) => log?.actual_fat_g)),
    };
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
  const hasAssignedWorkoutPlan =
    Boolean(todayWorkout) ||
    weeklyPlan.some((workout) => workout.day_type !== "rest");
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
  const nextActionQuery = useQuery({
    queryKey: ["client-home-next-action", clientId, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const [sessions, checkins, feedback] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select(
            "id,assigned_workout_id,assigned_workout:assigned_workouts(day_type)",
          )
          .eq("client_id", clientId)
          .is("completed_at", null)
          .order("started_at", { ascending: false })
          .limit(1),
        supabase
          .from("checkins")
          .select("id,week_ending_saturday")
          .eq("client_id", clientId)
          .is("submitted_at", null)
          .lte("week_ending_saturday", todayKey)
          .order("week_ending_saturday")
          .limit(1),
        supabase
          .from("notifications")
          .select("id,entity_id,title")
          .eq("recipient_user_id", session?.user.id)
          .eq("type", "checkin_reviewed")
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      for (const result of [sessions, checkins, feedback])
        if (result.error) throw result.error;
      return {
        session: sessions.data?.[0],
        checkin: checkins.data?.[0],
        feedback: feedback.data?.[0],
      };
    },
  });
  const primaryAction = (() => {
    const activeSession = nextActionQuery.data?.session;
    if (
      activeSession &&
      (Array.isArray(activeSession.assigned_workout)
        ? activeSession.assigned_workout[0]
        : activeSession.assigned_workout
      )?.day_type !== "rest"
    )
      return {
        label: "Resume workout",
        onClick: () =>
          navigate(buildWorkoutRunPath(activeSession.assigned_workout_id)),
      };
    const dueCheckin = nextActionQuery.data?.checkin;
    if (dueCheckin)
      return {
        label: "Complete check-in",
        onClick: () => navigate(`/app/checkins?checkin=${dueCheckin.id}`),
      };

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
    nextActionQuery.error ??
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
  const showWorkoutsAndNutritionCard = false;
  const isViewingCurrentWeek = calendarWeekOffset === 0;
  const calendarSection = (
    <SurfaceCard className="client-home-calendar">
      <SurfaceCardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <SurfaceCardTitle>Your week</SurfaceCardTitle>
          <p className="client-home-section-description">
            {weekRows[0]?.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            –{" "}
            {weekRows[6]?.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
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
            description="Loading your schedule for the next 7 days."
          />
        ) : (
          <>
            <div className="client-home-week">
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
                    className="client-home-day"
                    data-today={row.key === todayKey || undefined}
                    data-rest={rowIsRestDay || undefined}
                    aria-current={row.key === todayKey ? "date" : undefined}
                    title={workout?.coach_note ?? title}
                  >
                    <div className="client-home-day-date">
                      <span>
                        {row.date.toLocaleDateString("en-US", {
                          weekday: "short",
                        })}
                      </span>
                      <strong>{row.date.getDate()}</strong>
                    </div>
                    <p className="client-home-day-title">
                      {!workout ? "No workout scheduled" : title}
                    </p>
                    <span
                      className="client-home-day-status"
                      data-status={status}
                    >
                      {!workout ? "Unscheduled" : statusLabel}
                    </span>
                  </button>
                );
              })}
            </div>

            {weeklyPlan.length === 0 ? (
              <EmptyStateBlock
                title="No sessions scheduled yet"
                description="Your scheduled workouts and rest days will appear here."
              />
            ) : null}
          </>
        )}
      </SurfaceCardContent>
    </SurfaceCard>
  );

  return (
    <div
      className="portal-shell client-home-redesign"
      data-testid="client-home-page"
    >
      <header className="flex flex-wrap justify-end gap-2">
        {nextActionQuery.data?.feedback?.entity_id && (
          <Button
            onClick={() =>
              navigate(
                `/app/checkins?checkin=${nextActionQuery.data?.feedback?.entity_id}`,
              )
            }
          >
            Read coach feedback
          </Button>
        )}
        {!clientProfile?.workspace_id && (
          <Button variant="secondary" onClick={() => navigate(findCoachHref)}>
            Find a coach
          </Button>
        )}
        {(workspaceConversationPreviewQuery.data?.length ?? 0) > 0 && (
          <Button variant="secondary" onClick={() => navigate("/app/messages")}>
            Message coach
          </Button>
        )}
      </header>

      <SectionCard
        className="flex flex-wrap items-center justify-between gap-4"
        aria-label="Next action"
      >
        <div className="space-y-1">
          <p className="font-semibold">Next up</p>
          <p className="text-sm text-muted-foreground">
            {nextActionQuery.data?.session
              ? "Continue your unfinished session."
              : nextActionQuery.data?.checkin
                ? `Your check-in for ${nextActionQuery.data.checkin.week_ending_saturday} is ready to complete.`
                : isRestDay
                  ? "Rest day. You can still record your daily habits."
                  : todayWorkout
                    ? "Your scheduled workout is ready below."
                    : clientProfile?.workspace_id
                      ? "No workout is scheduled today."
                      : "Plan your first personal workout, or find a coach."}
          </p>
        </div>
        <Button onClick={primaryAction.onClick}>
          {primaryAction.label}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </SectionCard>

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
          title="You are not currently linked to a coach."
          description="You can still use your account. Accept a coach invitation to receive assigned plans."
        />
      ) : null}

      <section id="home-section-next-up" aria-label="Today's agenda">
        <div className="client-home-agenda">
          <SectionCard className="client-home-agenda-card">
            <div className="min-w-0 space-y-1">
              <p className="client-home-card-label">Today&apos;s workout</p>
              <p className="text-xl font-semibold leading-7 text-foreground [overflow-wrap:anywhere]">
                {summaryTrainingTitle}
              </p>
            </div>
            {todayWorkout?.coach_note ? (
              <div className="client-home-coach-note">
                <p className="field-label">Coach note</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {todayWorkout.coach_note}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {summaryTrainingHint}
              </p>
            )}
            <div className="client-home-card-footer">
              <span>{summaryTrainingBadgeLabel}</span>
              {todayWorkout && !isRestDay && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(
                      todayWorkoutStatus === "completed"
                        ? `/app/workout-summary/${todayWorkout.id}`
                        : buildWorkoutRunPath(todayWorkout.id),
                    )
                  }
                >
                  Open workout
                </Button>
              )}
            </div>
          </SectionCard>
          <SectionCard className="client-home-agenda-card">
            <div className="min-w-0 space-y-1">
              <p className="client-home-card-label">Recorded nutrition today</p>
              <p className="text-xl font-semibold leading-7 text-foreground [overflow-wrap:anywhere]">
                {todayNutritionTemplate?.name ??
                  (todayNutrition
                    ? "Your nutrition plan"
                    : clientProfile?.workspace_id
                      ? "No nutrition plan assigned yet."
                      : "Create a personal nutrition plan to get started.")}
              </p>
            </div>
            <div className="client-home-macros">
              <div className="space-y-0.5">
                <p className="font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Calories
                </p>
                <p className="font-semibold text-foreground">
                  {formatRecorded(todayNutritionTotals.calories)}
                  {todayNutritionTotals.calories !== null ? " kcal" : ""}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Protein
                </p>
                <p className="font-semibold text-foreground">
                  {formatRecorded(todayNutritionTotals.protein_g)}
                  {todayNutritionTotals.protein_g !== null ? "g" : ""}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Carbs
                </p>
                <p className="font-semibold text-foreground">
                  {formatRecorded(todayNutritionTotals.carbs_g)}
                  {todayNutritionTotals.carbs_g !== null ? "g" : ""}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Fats
                </p>
                <p className="font-semibold text-foreground">
                  {formatRecorded(todayNutritionTotals.fat_g)}
                  {todayNutritionTotals.fat_g !== null ? "g" : ""}
                </p>
              </div>
            </div>
            <div className="client-home-card-footer">
              <span>
                {todayNutrition ? "Your assigned plan" : "No plan assigned"}
              </span>
              <Button
                variant="secondary"
                onClick={() => navigate("/app/nutrition")}
              >
                Open nutrition
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </SectionCard>
        </div>
      </section>

      {calendarSection}

      <SurfaceCard id="home-section-checklist" className="client-home-log">
        <SurfaceCardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <SurfaceCardTitle>Daily log</SurfaceCardTitle>
              <p className="client-home-section-description">
                Record your nutrition, recovery, and activity.
              </p>
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
          <div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleQuickHabitSave();
              }}
            >
              <div className="client-home-log-groups">
                <div className="space-y-3">
                  <p className="field-label">Nutrition</p>
                  <div className="grid grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-2 gap-3">
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
                    <div className="space-y-2 col-span-2">
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
                    : "Save daily log"}
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
                  Daily log saved.
                </ActionStatusMessage>
              ) : null}
              {quickHabitSaveStatus === "error" && quickHabitError ? (
                <ActionStatusMessage tone="error">
                  {quickHabitError}
                </ActionStatusMessage>
              ) : null}
            </form>
          </div>
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
              Your personal and coach-assigned plans for today.
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
                        className="ui-inset flex flex-wrap items-center justify-between gap-2 border border-border/70 px-3 py-2"
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
                    (todayNutrition
                      ? "Your nutrition plan"
                      : clientProfile?.workspace_id
                        ? "No nutrition plan assigned yet."
                        : "Create a personal nutrition plan to get started.")}
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
                  description="Loading your meals and nutrition targets for today."
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
                            className="ui-inset flex flex-wrap items-center justify-between gap-2 border border-border/70 px-3 py-2"
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
                  <div className="ui-inset grid grid-cols-2 gap-4 border border-border/70 p-4 text-center sm:grid-cols-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Calories</p>
                      <p className="font-semibold">
                        {formatRecorded(todayNutritionTotals.calories)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Protein</p>
                      <p className="font-semibold">
                        {formatRecorded(todayNutritionTotals.protein_g)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Carbs</p>
                      <p className="font-semibold">
                        {formatRecorded(todayNutritionTotals.carbs_g)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Fat</p>
                      <p className="font-semibold">
                        {formatRecorded(todayNutritionTotals.fat_g)}
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
                  description={
                    todayNutrition
                      ? "Your nutrition plan"
                      : clientProfile?.workspace_id
                        ? "No nutrition plan assigned yet."
                        : "Create a personal nutrition plan to get started."
                  }
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
                    <div className="ui-inset border border-border/70 p-4">
                      <p className="text-sm text-muted-foreground">Calories</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {typeof targets?.calories === "number"
                          ? targets.calories.toLocaleString()
                          : "Coach setting in progress"}
                      </p>
                    </div>
                    <div className="ui-inset border border-border/70 p-4">
                      <p className="text-sm text-muted-foreground">Protein</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {typeof targets?.protein_g === "number"
                          ? `${targets.protein_g} g`
                          : "Prioritize protein today"}
                      </p>
                    </div>
                    <div className="ui-inset border border-border/70 p-4">
                      <p className="text-sm text-muted-foreground">Steps</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {typeof targets?.steps === "number"
                          ? targets.steps.toLocaleString()
                          : "8,000 focus"}
                      </p>
                    </div>
                  </div>
                  <div className="ui-inset border border-border/70 p-4">
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
              Continue your conversation with a coach.
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
            <DialogTitle>Your coaching account is connected</DialogTitle>
            <DialogDescription>
              You have been added to{" "}
              <span className="font-medium text-foreground">
                {inviteJoinContext.workspaceName}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="ui-panel border border-border/70 p-3 text-sm text-muted-foreground">
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
