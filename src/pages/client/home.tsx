import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Circle, Droplets, Dumbbell, Moon, Target } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
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
import { computeStreak } from "../../lib/habits";
import { useClientOnboarding } from "../../features/client-onboarding/hooks/use-client-onboarding";
import { ClientLeadDashboard } from "../../features/lead-chat/components/client-lead-dashboard";
import { useMyLeadChatThreads } from "../../features/lead-chat/lib/lead-chat";
import {
  buildClientInboxThreadParam,
  dedupeLeadThreadSummaries,
} from "../../features/lead-chat/lib/client-inbox";
import {
  clearInviteJoinParams,
  deriveInviteJoinContext,
} from "../../features/lead-chat/lib/invite-join-context";
import {
  buildSourceLabel,
  buildWorkoutRunPath,
  classifySourceKind,
  resolveUnifiedClientHomeState,
  shouldShowFindCoachSection,
  sortWorkoutsByUrgency,
  type WorkoutLike,
} from "./home-unified";

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
type HomeConversationPreviewRow = {
  id: string;
  workspace_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
};
type DiscoverCoachRow = {
  slug: string | null;
  display_name: string | null;
  full_name: string | null;
  headline: string | null;
};

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

  const [checklist, setChecklist] = useState<ChecklistState>(() =>
    readChecklist(todayKey),
  );
  const [dayStatus, setDayStatus] = useState<DayStatus | null>(() =>
    readDayStatus(todayKey),
  );
  const focusModule = searchParams.get("focus");

  useEffect(() => {
    setChecklist(readChecklist(todayKey));
    setDayStatus(readDayStatus(todayKey));
  }, [todayKey]);

  useEffect(() => {
    writeChecklist(todayKey, checklist);
  }, [todayKey, checklist]);

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

  const clientProfiles = useMemo(() => clientQuery.data ?? [], [clientQuery.data]);
  const clientProfile = useMemo(
    () =>
      clientProfiles.find((row) => row.id === activeClientId) ??
      clientProfiles[0] ??
      null,
    [activeClientId, clientProfiles],
  );
  const clientId = clientProfile?.id ?? null;
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
        .eq("client_id", clientId ?? "");
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
    queryKey: ["assigned-workouts-week-plan", clientId, weekStart, weekEnd],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, scheduled_date, status, day_type, coach_note, created_at, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description, workspace_id)",
        )
        .eq("client_id", clientId)
        .gte("scheduled_date", weekStart)
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

  const discoverCoachesQuery = useQuery({
    queryKey: ["client-home-discover-coaches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pt_hub_profiles")
        .select("slug, display_name, full_name, headline")
        .eq("is_published", true)
        .eq("marketplace_visible", true)
        .limit(4);
      if (error) {
        return [] as DiscoverCoachRow[];
      }
      return (data ?? []) as DiscoverCoachRow[];
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
            .assigned_nutrition_plan ??
          null);
      const nutritionTemplate = Array.isArray(
        assignedPlan?.nutrition_template as unknown,
      )
        ? (assignedPlan?.nutrition_template as Array<Record<string, unknown>>)[0]
        : (assignedPlan?.nutrition_template as Record<string, unknown> | null);
      add((nutritionTemplate?.workspace_id as string | null | undefined) ?? null);
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
  const hasClientProfile = Boolean(clientId);
  const summaryTrainingStatus = !hasClientProfile
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
      ? "Not connected"
      : summaryTrainingStatus === "completed"
      ? "Completed"
      : summaryTrainingStatus === "skipped"
        ? "Skipped"
        : summaryTrainingStatus === "planned"
          ? "Scheduled"
          : "Rest day";
  const summaryTrainingTitle = !hasClientProfile
    ? "Find your first coach"
    : isRestDay
    ? "Rest day"
    : (todayTemplate.name ??
      (todayWorkout as { workout_template_name?: string } | null)
        ?.workout_template_name ??
      "Rest day");
  const summaryTrainingHint = !hasClientProfile
    ? "No assigned plan yet. Explore coaches to start your training flow."
    : isRestDay
    ? "Rest day. Steps + nutrition still count."
    : todayWorkoutStatus === "completed"
      ? "Session logged"
      : todayWorkoutStatus === "skipped"
        ? "Coach notified"
        : todayWorkout
          ? "Ready when you are"
          : "Rest day. Steps + nutrition still count.";
  const handleChecklistToggle = useCallback(
    (key: ChecklistKey) => {
      setChecklist((prev) => {
        if (key === "workout" && todayWorkoutStatus === "completed") {
          return prev;
        }
        return { ...prev, [key]: !prev[key] };
      });
    },
    [todayWorkoutStatus],
  );
  const checklistCards = useMemo(
    () =>
      checklistKeys.map((key) => {
        const isWorkout = key === "workout";
        const isLocked = isWorkout && todayWorkoutStatus === "completed";
        const checked = checklist[key] || isLocked;
        const label =
          key === "workout"
            ? "Workout"
            : key === "steps" && typeof targets?.steps === "number"
              ? `Steps (${targets.steps.toLocaleString()})`
              : key === "steps"
                ? "Steps"
                : key === "water"
                  ? "Hydration"
                  : "Sleep";
        const hint = isWorkout
          ? todayWorkoutStatus === "completed"
            ? "Auto-checked from workout log"
            : isRestDay
              ? "Rest day"
              : "Tap when you finish"
          : key === "steps"
            ? "Daily movement target"
            : key === "water"
              ? "Hydration consistency"
              : "Recovery quality";
        const Icon =
          key === "workout"
            ? Dumbbell
            : key === "steps"
              ? Target
              : key === "water"
                ? Droplets
                : Moon;
        return { key, checked, isLocked, label, hint, Icon };
      }),
    [checklist, isRestDay, targets?.steps, todayWorkoutStatus],
  );
  const leadThreads = useMemo(
    () => leadThreadsQuery.data ?? [],
    [leadThreadsQuery.data],
  );
  const pendingApplicationsCount = leadThreads.filter(
    (thread) => thread.leadStatus === "new" || thread.leadStatus === "contacted",
  ).length;
  const approvedPendingWorkspaceCount = leadThreads.filter(
    (thread) => thread.leadStatus === "approved_pending_workspace",
  ).length;
  const savedCoachCount = leadThreads.filter((thread) => Boolean(thread.ptSlug))
    .length;
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
              .assigned_nutrition_plan ??
            null);
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
  const showFindCoachSection = shouldShowFindCoachSection({
    hasWorkspaceMembership,
    pendingApplications: pendingApplicationsCount,
    approvedPendingWorkspace: approvedPendingWorkspaceCount,
    savedCoachCount,
  });
  const featuredCoach = leadThreads.find((thread) => Boolean(thread.ptSlug));
  const discoverCoachProfiles = discoverCoachesQuery.data ?? [];
  const discoverCoachFallback =
    discoverCoachProfiles.find((coach) => Boolean(coach.slug)) ?? null;
  const findCoachHref = featuredCoach?.ptSlug
    ? `/coach/${featuredCoach.ptSlug}`
    : discoverCoachFallback?.slug
      ? `/coach/${discoverCoachFallback.slug}`
      : "/signup/client";
  const workoutFeedItems = useMemo(
    () => sortWorkoutsByUrgency((weeklyPlan as WorkoutLike[]) ?? []),
    [weeklyPlan],
  );
  const inboxPreviewItems = useMemo(() => {
    const workspaceItems = (workspaceConversationPreviewQuery.data ?? []).map(
      (conversation) => ({
        id: `workspace:${conversation.id}`,
        title: "Coach inbox",
        preview: conversation.last_message_preview ?? "No messages yet",
        timestamp: conversation.last_message_at ?? null,
        sourceLabel: getSourceMetaLabel(conversation.workspace_id),
        href: `/app/messages?thread=${encodeURIComponent(
          buildClientInboxThreadParam({
            type: "workspace",
            conversationId: conversation.id,
          }),
        )}`,
      }),
    );
    const dedupedLeadThreads = dedupeLeadThreadSummaries(leadThreads);

    const leadItems = dedupedLeadThreads.map((thread, index) => ({
      id: `lead:${thread.leadId || thread.ptSlug || thread.submittedAt || index}`,
      title: thread.ptDisplayName,
      preview: thread.lastMessagePreview ?? "No messages yet",
      timestamp: thread.lastMessageAt ?? thread.submittedAt ?? null,
      sourceLabel: "Lead chat",
      href: `/app/messages?thread=${encodeURIComponent(
        buildClientInboxThreadParam({
          type: "lead",
          leadId: thread.leadId,
        }),
      )}`,
    }));
    return [...workspaceItems, ...leadItems]
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [
    getSourceMetaLabel,
    leadThreads,
    workspaceConversationPreviewQuery.data,
  ]);

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
    if (!clientId) {
      return "You can explore coaches, keep your habits active, and start your first guided plan from here.";
    }
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
    clientId,
    isRestDay,
    todayWorkout,
    todayWorkoutStatus,
    todayTemplateInfo.description,
  ]);

  const handleRequestAdjustment = () => {
    navigate(
      `/app/messages?draft=${encodeURIComponent(
        "I skipped today's workout - can we adjust?",
      )}`,
    );
  };

  const checklistCompletedCount =
    Object.values(checklist).filter(Boolean).length;
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
          : focusModule === "messages"
            ? "home-section-messages"
            : focusModule === "find-coach"
              ? "home-section-find-coach"
              : null;
    if (!targetId) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(targetId);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [focusModule]);

  const weeklyStats = useMemo(() => {
    const weeklyWorkouts = weekRows.filter(
      (row) => row.workout && row.workout.day_type !== "rest",
    );

    return {
      completed: weeklyWorkouts.filter(
        (row) => row.workout?.status === "completed",
      ).length,
      skipped: weeklyWorkouts.filter((row) => row.workout?.status === "skipped")
        .length,
      planned: weeklyWorkouts.filter((row) => {
        const status = row.workout?.status;
        return status === "planned" || status === "pending" || !status;
      }).length,
      rest: weekRows.filter(
        (row) => row.workout?.day_type === "rest" || !row.workout,
      ).length,
    };
  }, [weekRows]);
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

  return (
    <div className="portal-shell">
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

      <SurfaceCard id="home-section-next-up">
        <SurfaceCardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <SurfaceCardTitle className="text-2xl">
                {summaryTrainingTitle}
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
            <Badge variant={trainingStatusVariant}>
              {summaryTrainingBadgeLabel}
            </Badge>
          </div>
        </SurfaceCardHeader>
        <SurfaceCardContent className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)]">
          <SectionCard className="space-y-5">
            <div className="space-y-3">
              <p className="field-label">Today&apos;s focus</p>
              <p className="text-base leading-7 text-foreground">
                {missionCopy}
              </p>
            </div>

            {todayWorkout?.coach_note ? (
              <div className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 p-4">
                <p className="field-label">Coach note</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {todayWorkout.coach_note}
                </p>
              </div>
            ) : null}

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

          <div className="space-y-3">
            <SectionCard className="space-y-4">
              <div className="space-y-1">
                <div>
                  <p className="field-label">Overview</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Today&apos;s workout and nutrition snapshot.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col gap-3 border-b border-border/50 pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Today&apos;s workout
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {summaryTrainingTitle}
                    </p>
                  </div>
                  <Badge variant={trainingStatusVariant}>
                    {summaryTrainingBadgeLabel}
                  </Badge>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Today&apos;s nutrition
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {todayNutritionTemplate?.name ?? "Nutrition plan pending"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <span className="rounded-full border border-border/60 bg-background/45 px-2.5 py-1 text-center font-semibold text-foreground">
                      {Math.round(todayNutritionTotals.calories)} kcal
                    </span>
                    <span className="rounded-full border border-border/60 bg-background/45 px-2.5 py-1 text-center font-semibold text-foreground">
                      P {Math.round(todayNutritionTotals.protein_g)}g
                    </span>
                    <span className="rounded-full border border-border/60 bg-background/45 px-2.5 py-1 text-center font-semibold text-foreground">
                      C {Math.round(todayNutritionTotals.carbs_g)}g
                    </span>
                    <span className="rounded-full border border-border/60 bg-background/45 px-2.5 py-1 text-center font-semibold text-foreground">
                      F {Math.round(todayNutritionTotals.fat_g)}g
                    </span>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard className="space-y-2">
              <p className="field-label">Consistency</p>
              <p className="text-2xl font-semibold text-foreground">
                <AnimatedValue value={`${consistencyStreak} days`} />
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Keep your logging streak moving and today will compound into the
                rest of the week.
              </p>
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
            <Badge variant={checklistProgress === 100 ? "success" : "secondary"}>
              <AnimatedValue
                value={`${checklistCompletedCount}/${checklistKeys.length} complete`}
              />
            </Badge>
          </div>
        </SurfaceCardHeader>
        <SurfaceCardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SectionCard className="p-3">
              <p className="field-label">Progress</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                <AnimatedValue value={`${checklistProgress}%`} />
              </p>
            </SectionCard>
            <SectionCard className="p-3">
              <p className="field-label">Completed</p>
              <p className="mt-2 text-2xl font-semibold text-success">
                <AnimatedValue value={checklistCompletedCount} />
              </p>
            </SectionCard>
            <SectionCard className="p-3">
              <p className="field-label">Streak</p>
              <p className="mt-2 text-2xl font-semibold text-info">
                <AnimatedValue value={`${consistencyStreak}d`} />
              </p>
            </SectionCard>
          </div>

          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${checklistProgress}%` }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {checklistCards.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleChecklistToggle(item.key)}
                disabled={item.isLocked}
                className={`flex items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  item.checked
                    ? "border-primary/45 bg-primary/12"
                    : "border-border/70 bg-background/45 hover:border-border"
                } ${item.isLocked ? "cursor-default opacity-90" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                    item.checked
                      ? "border-primary/45 bg-primary/18 text-primary"
                      : "border-border/70 bg-background/50 text-muted-foreground"
                  }`}
                >
                  <item.Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
                  {item.checked ? (
                    <Check className="h-5 w-5 text-success" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/70" />
                  )}
                </span>
              </button>
            ))}
          </div>

          {dayStatus?.completed ? (
            <ActionStatusMessage tone="success">
              Perfect day logged. All checklist items are complete for today.
            </ActionStatusMessage>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => navigate("/app/habits")}>
              Open habit log
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setChecklist(
                  todayWorkoutStatus === "completed"
                    ? { ...emptyChecklist, workout: true }
                    : emptyChecklist,
                )
              }
            >
              Reset today
            </Button>
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
              One account-level view of today and next-up actions across personal and coached plans.
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
                    const sourceLabel = getSourceMetaLabel(template.workspace_id);
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
                  title="No workouts queued"
                  description="As soon as a personal or coached workout is available, it will appear here."
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
                  {todayNutritionTemplate?.name ?? "Nutrition plan pending"}
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
                                assigned_nutrition_plan?: Record<string, unknown>;
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
                          : (assignedPlan?.nutrition_template as
                              | Record<string, unknown>
                              | null);
                        return (
                          <div
                            key={String((day as { id?: string }).id ?? "")}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-3 py-2"
                          >
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {(nutritionTemplate?.name as string | undefined) ??
                                  "Nutrition plan"}
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
                  title="No nutrition plan yet"
                  description="You can still focus on protein, hydration, and steps while your coach finalizes your targets."
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SurfaceCard id="home-section-messages">
          <SurfaceCardHeader>
            <SurfaceCardTitle>Messages and inbox</SurfaceCardTitle>
            <SurfaceCardDescription>
              A single preview across coaching inbox and lead conversations.
            </SurfaceCardDescription>
          </SurfaceCardHeader>
          <SurfaceCardContent className="space-y-3">
            {inboxPreviewItems.length > 0 ? (
              inboxPreviewItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {item.preview}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="muted">{item.sourceLabel}</Badge>
                      <span>
                        {item.timestamp
                          ? formatRelativeTime(item.timestamp)
                          : "No activity yet"}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(item.href)}
                  >
                    Open
                  </Button>
                </div>
              ))
            ) : (
              <EmptyStateBlock
                title="No messages yet"
                description="When you start a lead or coach conversation, it will appear here."
              />
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate("/app/messages")}>
                Open messages
              </Button>
              {leadThreads.length > 0 ? (
                <Button variant="secondary" onClick={() => navigate(findCoachHref)}>
                  View coach profiles
                </Button>
              ) : null}
            </div>
          </SurfaceCardContent>
        </SurfaceCard>

        {showFindCoachSection ? (
          <SurfaceCard id="home-section-find-coach">
            <SurfaceCardHeader>
              <SurfaceCardTitle>Find a Coach</SurfaceCardTitle>
              <SurfaceCardDescription>
                Discovery and application status in one place.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <SectionCard className="p-3">
                  <p className="field-label">Pending applications</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">
                    <AnimatedValue value={pendingApplicationsCount} />
                  </p>
                </SectionCard>
                <SectionCard className="p-3">
                  <p className="field-label">Invite waiting</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">
                    <AnimatedValue value={approvedPendingWorkspaceCount} />
                  </p>
                </SectionCard>
                <SectionCard className="p-3">
                  <p className="field-label">Saved coaches</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">
                    <AnimatedValue value={savedCoachCount} />
                  </p>
                </SectionCard>
              </div>

              {discoverCoachProfiles.length > 0 ? (
                <div className="space-y-2">
                  {discoverCoachProfiles.slice(0, 3).map((coach) => (
                    <div
                      key={coach.slug ?? coach.full_name ?? coach.display_name ?? "coach"}
                      className="rounded-[var(--radius-lg)] border border-border/70 bg-background/45 px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {coach.display_name ?? coach.full_name ?? "Coach profile"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {coach.headline ?? "Public coach profile"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyStateBlock
                  title="Coach discovery is ready"
                  description="Use Find a Coach to open public profiles and begin your application flow."
                />
              )}

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => navigate(findCoachHref)}>Find a Coach</Button>
                {approvedPendingWorkspaceCount > 0 ? (
                  <Button variant="secondary" onClick={() => navigate("/app/home")}>
                    Refresh join status
                  </Button>
                ) : null}
              </div>
            </SurfaceCardContent>
          </SurfaceCard>
        ) : (
          <SurfaceCard id="home-section-find-coach">
            <SurfaceCardHeader>
              <SurfaceCardTitle>Find a Coach</SurfaceCardTitle>
              <SurfaceCardDescription>
                Your discovery and applications are up to date.
              </SurfaceCardDescription>
            </SurfaceCardHeader>
            <SurfaceCardContent>
              <EmptyStateBlock
                title="No discovery actions right now"
                description="When you have pending applications, saved coaches, or invites, they will appear here."
              />
            </SurfaceCardContent>
          </SurfaceCard>
        )}
      </div>

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

      <SurfaceCard>
          <SurfaceCardHeader>
            <SurfaceCardTitle>Calendar</SurfaceCardTitle>
            <SurfaceCardDescription>
              Assigned training and recovery across the next 7 days.
            </SurfaceCardDescription>
          </SurfaceCardHeader>
          <SurfaceCardContent className="space-y-4">
            {weeklyPlanQuery.isLoading ? (
              <LoadingPanel
                title="Loading calendar"
                description="Mapping the next 7 days of training and recovery."
              />
            ) : (
              <>
                <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
                  <SectionCard className="p-3">
                    <p className="field-label">Completed</p>
                    <p className="mt-2 text-2xl font-semibold text-success">
                      <AnimatedValue value={weeklyStats.completed} />
                    </p>
                  </SectionCard>
                  <SectionCard className="p-3">
                    <p className="field-label">Planned</p>
                    <p className="mt-2 text-2xl font-semibold text-info">
                      <AnimatedValue value={weeklyStats.planned} />
                    </p>
                  </SectionCard>
                  <SectionCard className="p-3">
                    <p className="field-label">Skipped</p>
                    <p className="mt-2 text-2xl font-semibold text-danger">
                      <AnimatedValue value={weeklyStats.skipped} />
                    </p>
                  </SectionCard>
                  <SectionCard className="p-3">
                    <p className="field-label">Rest</p>
                    <p className="mt-2 text-2xl font-semibold text-warning">
                      <AnimatedValue value={weeklyStats.rest} />
                    </p>
                  </SectionCard>
                </div>

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
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                          </div>
                          <div className="space-y-1">
                            <p className="line-clamp-2 text-sm font-semibold text-foreground">
                              {title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {rowIsRestDay
                                ? "Steps + nutrition still count."
                                : (getWorkoutTemplateInfo(workout)
                                    .workout_type_tag ?? "Workout")}
                            </p>
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
      {hasWorkspaceMembership ? (
        <ClientWorkspaceHomePage />
      ) : (
        <ClientLeadDashboard />
      )}

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
