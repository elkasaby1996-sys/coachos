import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Skeleton } from "../../components/ui/skeleton";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Flame,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Pencil,
  Rocket,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { DashboardCard } from "../../components/pt/dashboard/DashboardCard";
import { DashboardShell } from "../../components/pt/dashboard/DashboardShell";
import { StatusPill } from "../../components/pt/dashboard/StatusPill";
import { StatCard } from "../../components/pt/dashboard/StatCard";
import { MiniSparkline } from "../../components/pt/dashboard/MiniSparkline";
import { EmptyState } from "../../components/pt/dashboard/EmptyState";
import { supabase } from "../../lib/supabase";
import { getSupabaseErrorDetails, getSupabaseErrorMessage } from "../../lib/supabase-errors";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";
import { cn } from "../../lib/utils";
import { getProfileCompletion } from "../../lib/profile-completion";
import { getCoachActionLabel, logCoachActivity } from "../../lib/coach-activity";
import { formatRelativeTime } from "../../lib/relative-time";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import { computeStreak, getLatestLogDate } from "../../lib/habits";

const tabs = [
  "overview",
  "plan",
  "logs",
  "progress",
  "checkins",
  "messages",
  "notes",
  "baseline",
  "habits",
] as const;

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const diffDays = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
};

const getErrorMessage = (error: unknown) => getSupabaseErrorMessage(error);

const getFriendlyErrorMessage = () => "Unable to load data right now. Please try again.";

const getErrorDetails = (error: unknown) => getSupabaseErrorDetails(error);

const formatListValue = (value: string[] | string | null | undefined, fallback: string) => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : fallback;
  return value;
};

const getInitials = (name: string | null | undefined) => {
  if (!name) return "PT";
  const parts = name.trim().split(/\s+/);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "PT";
};

const trainingTypeOptions = [
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
  { value: "in_person", label: "In person" },
];

type PtClientProfile = {
  id: string;
  workspace_id: string | null;
  created_at: string | null;
  display_name: string | null;
  goal: string | null;
  status: string | null;
  injuries: string | null;
  limitations: string | null;
  height_cm: number | null;
  current_weight: number | null;
  days_per_week: number | null;
  dob: string | null;
  training_type: string | null;
  timezone: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  unit_preference: string | null;
  gender: string | null;
  gym_name: string | null;
  tags: string[] | string | null;
  photo_url: string | null;
  updated_at: string | null;
};

type BaselineEntry = {
  id: string;
  submitted_at: string | null;
  coach_notes: string | null;
};

type BaselineMetrics = {
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  thigh_cm: number | null;
  arm_cm: number | null;
  resting_hr: number | null;
  vo2max: number | null;
};

type BaselineMarkerRow = {
  value_number: number | null;
  value_text: string | null;
  template: { name: string | null; unit_label: string | null } | null;
};

type BaselinePhotoRow = {
  photo_type: string | null;
  url: string | null;
};

type HabitLog = {
  id?: string | null;
  log_date: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  weight_value: number | null;
  weight_unit: string | null;
  sleep_hours: number | null;
  steps: number | null;
  energy: number | null;
  hunger: number | null;
  stress: number | null;
  notes: string | null;
};

type CoachActivityRow = {
  id: string;
  action: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

type CheckinRow = {
  id: string;
  week_ending_saturday: string | null;
  submitted_at: string | null;
  pt_feedback: string | null;
  created_at: string | null;
};

type AssignedWorkoutExerciseRow = {
  id: string;
  assigned_workout_id: string;
  load_notes: string | null;
  is_completed: boolean | null;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe: number | null;
  notes: string | null;
  exercise: { id: string; name: string | null } | null;
};

type WorkoutSessionRow = {
  id: string;
  assigned_workout_id: string | null;
};

type WorkoutSetLogRow = {
  id: string;
  workout_session_id: string | null;
  exercise_id: string | null;
  set_number: number | null;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  created_at: string | null;
};

type ProgramTemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  weeks_count: number | null;
  is_active: boolean | null;
  updated_at: string | null;
};

type ClientProgramRow = {
  id: string;
  start_date: string | null;
  program_template_id: string | null;
  program_template: { id: string; name: string | null; weeks_count: number | null } | null;
};

type ProgramOverrideRow = {
  id: string;
  override_date: string | null;
  workout_template_id: string | null;
  is_rest: boolean | null;
  notes: string | null;
  workout_template: { id: string; name: string | null } | null;
};

type CheckinAnswerRow = {
  id: string;
  answer_text: string | null;
  answer_number: number | null;
  answer_boolean: boolean | null;
  question: { question_text: string | null; prompt: string | null } | null;
};

type HabitTrends = {
  daysLogged: number;
  avgSteps: number | null;
  avgSleep: number | null;
  avgProtein: number | null;
  weightChange: number | null;
  weightUnit: string | null;
};

type QueryResult<T> = {
  data?: T;
  isLoading: boolean;
  error: unknown;
};

const baselinePhotoTypes = ["front", "side", "back"] as const;

export function PtClientDetailPage() {
  const { user } = useAuth();
  const { clientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialTab = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab && tabs.includes(tab as (typeof tabs)[number])) {
      return tab as (typeof tabs)[number];
    }
    return "plan";
  }, [location.search]);
  const [active, setActive] = useState<(typeof tabs)[number]>(initialTab);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");

  useEffect(() => {
    setActive(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const current = params.get("tab") ?? "overview";
    if (current === active) return;
    params.set("tab", active);
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }, [active, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);


  const setActiveTab = (tab: (typeof tabs)[number]) => {
    setActive(tab);
  };
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() => formatDateKey(new Date()));
  const [assignStatus, setAssignStatus] = useState<"idle" | "saving" | "error">("idle");
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [programStartDate, setProgramStartDate] = useState(() => formatDateKey(new Date()));
  const [programStatus, setProgramStatus] = useState<"idle" | "saving" | "error">("idle");
  const [programMessage, setProgramMessage] = useState<string | null>(null);
  const [unassignStatus, setUnassignStatus] = useState<"idle" | "saving" | "error">("idle");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState<string | null>(null);
  const [overrideTemplateId, setOverrideTemplateId] = useState("");
  const [overrideIsRest, setOverrideIsRest] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<"idle" | "saving">("idle");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editWorkoutId, setEditWorkoutId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(() => formatDateKey(new Date()));
  const [editTemplateId, setEditTemplateId] = useState("");
  const [editStatus, setEditStatus] = useState<"planned" | "completed" | "skipped">("planned");
  const [clientProfile, setClientProfile] = useState<PtClientProfile | null>(null);
  const [adminTrainingType, setAdminTrainingType] = useState("");
  const [adminTags, setAdminTags] = useState("");
  const [adminStatus, setAdminStatus] = useState<"idle" | "saving">("idle");
  const [baselineNotes, setBaselineNotes] = useState("");
  const [baselineNotesStatus, setBaselineNotesStatus] = useState<"idle" | "saving" | "error">(
    "idle"
  );
  const [baselineNotesMessage, setBaselineNotesMessage] = useState<string | null>(null);
  const baselineReviewLoggedRef = useRef<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedCheckin, setSelectedCheckin] = useState<CheckinRow | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "saving" | "error">(
    "idle"
  );
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [loadsOpen, setLoadsOpen] = useState(false);
  const [loadsError, setLoadsError] = useState<string | null>(null);
  const [loadsStatus, setLoadsStatus] = useState<"idle" | "saving">("idle");
  const [selectedAssignedWorkoutId, setSelectedAssignedWorkoutId] = useState<string | null>(
    null
  );
  const [assignedExercises, setAssignedExercises] = useState<
    Array<
      AssignedWorkoutExerciseRow & {
        loadNotes: string;
        isCompleted: boolean;
      }
    >
  >([]);
  const [clientTodos, setClientTodos] = useState([
    { id: "client-task-checkins", label: "Review check-ins", done: false },
    { id: "client-task-messages", label: "Reply to messages", done: false },
    { id: "client-task-program", label: "Adjust program", done: false },
  ]);
  const [todoInput, setTodoInput] = useState("");

  const today = useMemo(() => new Date(), []);
  const isDev = import.meta.env.DEV;
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const scheduleStartKey = useMemo(() => todayKey, [todayKey]);
  const scheduleEndKey = useMemo(() => addDaysToDateString(todayKey, 6), [todayKey]);
  const planEndKey = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + 14);
    return formatDateKey(date);
  }, [today]);

  const workspaceQuery = useQuery({
    queryKey: ["pt-workspace", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const workspaceId = await getWorkspaceIdForUser(user?.id ?? "");
      if (!workspaceId) throw new Error("Workspace not found for this PT.");
      return workspaceId;
    },
  });

  const clientQuery = useQuery({
    queryKey: ["pt-client", clientId, workspaceQuery.data],
    enabled: !!clientId && !!workspaceQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, workspace_id, created_at, display_name, goal, status, injuries, limitations, height_cm, current_weight, days_per_week, dob, training_type, timezone, phone, location, unit_preference, gender, gym_name, tags, photo_url, updated_at"
        )
        .eq("id", clientId ?? "")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Client not found in this workspace.");
      return data;
    },
  });

  const habitsToday = useMemo(
    () => getTodayInTimezone(clientQuery.data?.timezone ?? null),
    [clientQuery.data?.timezone]
  );
  const habitsStart = useMemo(
    () => addDaysToDateString(habitsToday, -6),
    [habitsToday]
  );
  const habitsWeekStart = useMemo(
    () => addDaysToDateString(habitsToday, -6),
    [habitsToday]
  );

  useEffect(() => {
    if (!clientQuery.data) return;
    const data = clientQuery.data as PtClientProfile;
    setClientProfile(data);
    setAdminTrainingType(data.training_type ?? "");
    setAdminTags(formatListValue(data.tags ?? null, ""));
  }, [clientQuery.data]);

  const templatesQuery = useQuery({
    queryKey: ["workout-templates", workspaceQuery.data],
    enabled: !!workspaceQuery.data && active === "plan",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name, workout_type_tag")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const programTemplatesQuery = useQuery({
    queryKey: ["program-templates", workspaceQuery.data],
    enabled: !!workspaceQuery.data && active === "plan",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_templates")
        .select("id, name, description, weeks_count, is_active, updated_at")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProgramTemplateRow[];
    },
  });

  const activeProgramQuery = useQuery({
    queryKey: ["client-program-active", clientId],
    enabled: !!clientId && active === "plan",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_programs")
        .select(
          "id, start_date, program_template_id, is_active, program_template:program_templates(id, name, weeks_count)"
        )
        .eq("client_id", clientId ?? "")
        .eq("is_active", true)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ClientProgramRow | null;
    },
  });

  const activeProgram = activeProgramQuery.data ?? null;

  const programOverridesQuery = useQuery({
    queryKey: ["client-program-overrides", activeProgram?.id, todayKey, planEndKey],
    enabled: !!activeProgram?.id && active === "plan",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_program_overrides")
        .select(
          "id, override_date, workout_template_id, is_rest, notes, workout_template:workout_templates(id, name)"
        )
        .eq("client_program_id", activeProgram?.id ?? "")
        .gte("override_date", todayKey)
        .lte("override_date", planEndKey)
        .order("override_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProgramOverrideRow[];
    },
  });

  useEffect(() => {
    if (!activeProgram) return;
    if (!selectedProgramId && activeProgram.program_template_id) {
      setSelectedProgramId(activeProgram.program_template_id);
    }
    if (activeProgram.start_date) {
      setProgramStartDate(activeProgram.start_date);
    }
  }, [activeProgram, selectedProgramId]);

  const upcomingQuery = useQuery({
    queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    enabled: !!clientId && active === "plan",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, day_type, scheduled_date, created_at, completed_at, workout_template_id, workout_template:workout_templates(id, name, workout_type_tag), assigned_workout_exercises(id, sort_order, sets, reps, exercise:exercises(id, name))"
        )
        .eq("client_id", clientId ?? "")
        .gte("scheduled_date", todayKey)
        .lte("scheduled_date", planEndKey)
        .order("scheduled_date", { ascending: true })
        .order("sort_order", {
          foreignTable: "assigned_workout_exercises",
          ascending: true,
        });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upcomingAssignedWorkoutIds = useMemo(
    () => (upcomingQuery.data ?? []).map((workout) => workout.id),
    [upcomingQuery.data]
  );

  const workoutSessionsQuery = useQuery({
    queryKey: ["workout-sessions", upcomingAssignedWorkoutIds],
    enabled: upcomingAssignedWorkoutIds.length > 0 && active === "plan",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, assigned_workout_id")
        .in("assigned_workout_id", upcomingAssignedWorkoutIds);
      if (error) throw error;
      return (data ?? []) as WorkoutSessionRow[];
    },
  });

  const workoutSessionIds = useMemo(
    () => (workoutSessionsQuery.data ?? []).map((row) => row.id),
    [workoutSessionsQuery.data]
  );

  const workoutSessionIdMap = useMemo(() => {
    const map = new Map<string, string>();
    (workoutSessionsQuery.data ?? []).forEach((row) => {
      if (row.id && row.assigned_workout_id) {
        map.set(row.id, row.assigned_workout_id);
      }
    });
    return map;
  }, [workoutSessionsQuery.data]);

  const workoutSetLogsQuery = useQuery({
    queryKey: ["workout-set-logs", workoutSessionIds],
    enabled: workoutSessionIds.length > 0 && active === "plan",
    queryFn: async () => {
      if (workoutSessionIds.length === 0) return [];
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select("id, workout_session_id, exercise_id, set_number, reps, weight, rpe, created_at")
        .in("workout_session_id", workoutSessionIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkoutSetLogRow[];
    },
  });

  const lastSetByWorkoutExercise = useMemo(() => {
    const map = new Map<string, WorkoutSetLogRow>();
    (workoutSetLogsQuery.data ?? []).forEach((log) => {
      const assignedWorkoutId = log.workout_session_id
        ? workoutSessionIdMap.get(log.workout_session_id)
        : null;
      if (!assignedWorkoutId || !log.exercise_id) return;
      const key = `${assignedWorkoutId}-${log.exercise_id}`;
      if (!map.has(key)) {
        map.set(key, log);
      }
    });
    return map;
  }, [workoutSetLogsQuery.data, workoutSessionIdMap]);

  const assignedExercisesQuery = useQuery({
    queryKey: ["assigned-workout-exercises", selectedAssignedWorkoutId],
    enabled: !!selectedAssignedWorkoutId && active === "plan",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workout_exercises")
        .select(
          "id, assigned_workout_id, load_notes, is_completed, sets, reps, rest_seconds, tempo, rpe, notes, exercise:exercises(id, name)"
        )
        .eq("assigned_workout_id", selectedAssignedWorkoutId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssignedWorkoutExerciseRow[];
    },
  });

  const baselineEntryQuery = useQuery({
    queryKey: ["pt-client-baseline-entry", clientId],
    enabled: !!clientId && active === "baseline",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_entries")
        .select("id, submitted_at, coach_notes")
        .eq("client_id", clientId ?? "")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BaselineEntry | null;
    },
  });

  const baselineId = baselineEntryQuery.data?.id ?? null;

  useEffect(() => {
    if (!baselineEntryQuery.data) {
      setBaselineNotes("");
      return;
    }
    setBaselineNotes(baselineEntryQuery.data.coach_notes ?? "");
  }, [baselineEntryQuery.data]);

  const baselineMetricsQuery = useQuery({
    queryKey: ["pt-client-baseline-metrics", baselineId],
    enabled: !!baselineId && active === "baseline",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_metrics")
        .select(
          "weight_kg, height_cm, body_fat_pct, waist_cm, chest_cm, hips_cm, thigh_cm, arm_cm, resting_hr, vo2max"
        )
        .eq("baseline_id", baselineId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BaselineMetrics | null;
    },
  });

  const baselineMarkersQuery = useQuery({
    queryKey: ["pt-client-baseline-markers", baselineId],
    enabled: !!baselineId && active === "baseline",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_marker_values")
        .select("value_number, value_text, template:baseline_marker_templates(name, unit_label)")
        .eq("baseline_id", baselineId ?? "");
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        value_number: number | null;
        value_text: string | null;
        template:
          | { name: string | null; unit_label: string | null }
          | { name: string | null; unit_label: string | null }[]
          | null;
      }>;
      return rows.map((row) => ({
        value_number: row.value_number ?? null,
        value_text: row.value_text ?? null,
        template: Array.isArray(row.template)
          ? row.template[0] ?? null
          : row.template ?? null,
      })) as BaselineMarkerRow[];
    },
  });

  const baselinePhotosQuery = useQuery({
    queryKey: ["pt-client-baseline-photos", baselineId],
    enabled: !!baselineId && active === "baseline",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_photos")
        .select("photo_type, url")
        .eq("baseline_id", baselineId ?? "");
      if (error) throw error;
      return (data ?? []) as BaselinePhotoRow[];
    },
  });

  const checkinsQuery = useQuery({
    queryKey: ["pt-client-checkins", clientId],
    enabled: !!clientId && (active === "checkins" || active === "overview"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkins")
        .select("id, week_ending_saturday, submitted_at, pt_feedback, created_at")
        .eq("client_id", clientId ?? "")
        .order("week_ending_saturday", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CheckinRow[];
    },
  });

  const habitsQuery = useQuery({
    queryKey: ["pt-client-habits", clientId, habitsStart, habitsToday],
    enabled: !!clientId && !!habitsToday && (active === "habits" || active === "overview"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select(
          "id, log_date, calories, protein_g, carbs_g, fats_g, weight_value, weight_unit, sleep_hours, steps, energy, hunger, stress, notes"
        )
        .eq("client_id", clientId ?? "")
        .gte("log_date", habitsStart)
        .lte("log_date", habitsToday)
        .order("log_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HabitLog[];
    },
  });

  const [selectedHabitDate, setSelectedHabitDate] = useState<string>("");

  useEffect(() => {
    if (!selectedHabitDate && habitsToday) {
      setSelectedHabitDate(habitsToday);
    }
  }, [habitsToday, selectedHabitDate]);

  const habitLogByDateQuery = useQuery({
    queryKey: ["pt-client-habit-log", clientId, selectedHabitDate],
    enabled: !!clientId && !!selectedHabitDate && active === "habits",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select(
          "id, log_date, calories, protein_g, carbs_g, fats_g, weight_value, weight_unit, sleep_hours, steps, energy, hunger, stress, notes"
        )
        .eq("client_id", clientId ?? "")
        .eq("log_date", selectedHabitDate)
        .maybeSingle();
      if (error) throw error;
      return data as HabitLog | null;
    },
  });

  const coachActivityQuery = useQuery({
    queryKey: ["coach-activity-log", clientId, workspaceQuery.data],
    enabled: !!clientId && !!workspaceQuery.data && active === "overview",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_activity_log")
        .select("id, action, created_at, metadata")
        .eq("client_id", clientId ?? "")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as CoachActivityRow[];
    },
  });

  const handleAssignWorkout = async () => {
    if (!clientId || !selectedTemplateId || !scheduledDate) return;
    setAssignStatus("saving");
    setAssignMessage(null);

    const { data: assignedWorkoutId, error } = await supabase.rpc(
      "assign_workout_with_template",
      {
        p_client_id: clientId,
        p_scheduled_date: scheduledDate,
        p_workout_template_id: selectedTemplateId,
      }
    );

    if (error) {
      const details = getErrorDetails(error);
      const message = details.message ?? getErrorMessage(error);
      setAssignStatus("error");
      setAssignMessage(message);
      setToastVariant("error");
      setToastMessage(message);
      console.error("ASSIGN_WORKOUT_ERROR", details.code, details.message);
      return;
    }

    await logCoachActivity({
      clientId,
      workspaceId: workspaceQuery.data ?? null,
      action: "workout_assigned",
      metadata: {
        scheduled_date: scheduledDate,
        workout_template_id: selectedTemplateId,
        assigned_workout_id: assignedWorkoutId ?? null,
      },
    });

    setAssignStatus("idle");
    setAssignMessage("Workout assigned");
    setToastVariant("success");
    setToastMessage("Workout assigned");
    setSelectedTemplateId("");
    setScheduledDate(todayKey);
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-schedule-week", clientId, workspaceQuery.data ?? null, scheduleStartKey, scheduleEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-today", clientId, todayKey],
    });
    await queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] });
  };

  const handleApplyProgram = async () => {
    if (!clientId || !selectedProgramId || !programStartDate) return;
    setProgramStatus("saving");
    setProgramMessage(null);

    const { data, error } = await supabase.rpc("assign_program_to_client", {
      p_client_id: clientId,
      p_program_id: selectedProgramId,
      p_start_date: programStartDate,
      p_days_ahead: 14,
    });

    if (error) {
      const details = getErrorDetails(error);
      const message = details.message ?? getErrorMessage(error);
      setProgramStatus("error");
      setProgramMessage(message);
      setToastVariant("error");
      setToastMessage(message);
      return;
    }

    setProgramStatus("idle");
    const updatedCount = typeof data === "number" ? data : null;
    const successMessage = updatedCount
      ? `Program assigned. ${updatedCount} day${updatedCount === 1 ? "" : "s"} scheduled.`
      : "Program assigned.";
    setProgramMessage(successMessage);
    setToastVariant("success");
    setToastMessage(successMessage);
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });
    await queryClient.invalidateQueries({ queryKey: ["client-program-active", clientId] });
    await queryClient.invalidateQueries({
      queryKey: ["client-program-overrides", activeProgram?.id, todayKey, planEndKey],
    });
  };

  const handleUnassignProgram = async () => {
    if (!clientId || !activeProgram?.id) return;
    const confirmed = window.confirm("Unassign the active program for this client?");
    if (!confirmed) return;
    setUnassignStatus("saving");
    setProgramMessage(null);
    try {
      if (activeProgram.program_template_id) {
        const { error: deleteError } = await supabase
          .from("assigned_workouts")
          .delete()
          .eq("client_id", clientId)
          .eq("program_id", activeProgram.program_template_id)
          .gte("scheduled_date", todayKey);

        if (deleteError) {
          throw deleteError;
        }
      }

      const { error: assignmentError } = await supabase
        .from("client_program_assignments")
        .update({ is_active: false })
        .eq("client_id", clientId)
        .eq("is_active", true);

      if (assignmentError) {
        throw assignmentError;
      }

      const { error: legacyError } = await supabase
        .from("client_programs")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("client_id", clientId)
        .eq("is_active", true);

      if (legacyError && legacyError.code !== "42P01") {
        throw legacyError;
      }

      await queryClient.invalidateQueries({
        queryKey: ["client-program-active", clientId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["client-program-overrides", activeProgram.id, todayKey, planEndKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["pt-client-schedule-week", clientId, workspaceQuery.data ?? null, scheduleStartKey, scheduleEndKey],
      });
      await queryClient.invalidateQueries({
        queryKey: ["assigned-workout-today", clientId, todayKey],
      });
      setProgramMessage("Program unassigned.");
      setUnassignStatus("idle");
    } catch (error) {
      setUnassignStatus("error");
      setProgramMessage(getErrorDetails(error).message);
    }
  };

  const handleOpenOverride = (date: string) => {
    const override = (programOverridesQuery.data ?? []).find(
      (row) => row.override_date === date
    );
    setOverrideDate(date);
    setOverrideTemplateId(override?.workout_template_id ?? "");
    setOverrideIsRest(override?.is_rest ?? false);
    setOverrideNotes(override?.notes ?? "");
    setOverrideError(null);
    setOverrideOpen(true);
  };

  const handleSaveOverride = async () => {
    if (!clientId || !overrideDate) return;
    if (!activeProgram?.id || !activeProgram.program_template_id) {
      setOverrideError("Apply a program before adding overrides.");
      return;
    }
    if (!overrideIsRest && !overrideTemplateId) {
      setOverrideError("Select a workout template or mark a rest day.");
      return;
    }

    setOverrideStatus("saving");
    setOverrideError(null);

    const { error } = await supabase.from("client_program_overrides").upsert(
      {
        client_program_id: activeProgram.id,
        override_date: overrideDate,
        workout_template_id: overrideIsRest ? null : overrideTemplateId,
        is_rest: overrideIsRest,
        notes: overrideNotes.trim() || null,
      },
      { onConflict: "client_program_id,override_date" }
    );

    if (error) {
      const details = getErrorDetails(error);
      setOverrideError(`${details.code}: ${details.message}`);
      setOverrideStatus("idle");
      return;
    }

    const anchorStart = activeProgram.start_date ?? programStartDate ?? todayKey;
    const horizonDays = Math.max(14, diffDays(anchorStart, todayKey) + 14);
    const { error: applyError } = await supabase.rpc("apply_program_to_client", {
      p_client_id: clientId,
      p_program_template_id: activeProgram.program_template_id,
      p_start_date: anchorStart,
      p_horizon_days: horizonDays,
    });
    if (applyError) {
      const details = getErrorDetails(applyError);
      setOverrideError(`${details.code}: ${details.message}`);
      setOverrideStatus("idle");
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["client-program-overrides", activeProgram.id, todayKey, planEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });

    setOverrideStatus("idle");
    setOverrideOpen(false);
  };

  const handleStatusUpdate = async (id: string, status: "completed" | "skipped") => {
    const payload =
      status === "completed"
        ? { status, completed_at: new Date().toISOString() }
        : { status };
    const { error } = await supabase.from("assigned_workouts").update(payload).eq("id", id);
    if (error) {
      setAssignStatus("error");
      setAssignMessage(getErrorMessage(error));
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-schedule-week", clientId, workspaceQuery.data ?? null, scheduleStartKey, scheduleEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-today", clientId, todayKey],
    });
    await queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] });
  };

  const openEditDialog = (workout: {
    id: string;
    scheduled_date: string | null;
    workout_template_id: string | null;
    status: string | null;
  }) => {
    setEditWorkoutId(workout.id);
    setEditDate(workout.scheduled_date ?? todayKey);
    setEditTemplateId(workout.workout_template_id ?? "");
    setEditStatus((workout.status as "planned" | "completed" | "skipped") ?? "planned");
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editWorkoutId) return;
    setAssignStatus("saving");
    setAssignMessage(null);
    const { error } = await supabase
      .from("assigned_workouts")
      .update({
        scheduled_date: editDate,
        workout_template_id: editTemplateId,
        status: editStatus,
      })
      .eq("id", editWorkoutId);
    if (error) {
      setAssignStatus("error");
      setAssignMessage(getErrorMessage(error));
      return;
    }

    await logCoachActivity({
      clientId,
      workspaceId: workspaceQuery.data ?? null,
      action: "plan_updated",
      metadata: {
        scheduled_date: editDate,
        workout_template_id: editTemplateId,
        status: editStatus,
      },
    });

    setAssignStatus("idle");
    setAssignMessage("Workout updated");
    setEditOpen(false);
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-schedule-week", clientId, workspaceQuery.data ?? null, scheduleStartKey, scheduleEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-today", clientId, todayKey],
    });
    await queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] });
  };

  const handleDeleteWorkout = async () => {
    if (!editWorkoutId) return;
    setAssignStatus("saving");
    setAssignMessage(null);
    const { error } = await supabase.from("assigned_workouts").delete().eq("id", editWorkoutId);
    if (error) {
      setAssignStatus("error");
      setAssignMessage(getErrorMessage(error));
      return;
    }
    setAssignStatus("idle");
    setAssignMessage("Workout deleted");
    setDeleteOpen(false);
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-schedule-week", clientId, workspaceQuery.data ?? null, scheduleStartKey, scheduleEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-today", clientId, todayKey],
    });
  };

  const handleOpenDeleteDialog = (workoutId: string) => {
    setEditWorkoutId(workoutId);
    setDeleteOpen(true);
  };

  const handleRescheduleWorkout = async (id: string, nextDate: string) => {
    setAssignStatus("saving");
    setAssignMessage(null);
    const { error } = await supabase
      .from("assigned_workouts")
      .update({ scheduled_date: nextDate })
      .eq("id", id);
    if (error) {
      setAssignStatus("error");
      setAssignMessage(getErrorMessage(error));
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-schedule-week", clientId, workspaceQuery.data ?? null, scheduleStartKey, scheduleEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-today", clientId, todayKey],
    });
    await queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] });
    setAssignStatus("idle");
    setAssignMessage("Workout rescheduled");
  };

  const clientSnapshot = clientProfile ?? (clientQuery.data as PtClientProfile | null);
  const completion = useMemo(() => getProfileCompletion(clientSnapshot), [clientSnapshot]);
  const missingFields = useMemo(() => {
    if (!clientSnapshot) return [];
    const missing: string[] = [];
    const hasPhotoOrName = Boolean(clientSnapshot.photo_url || clientSnapshot.display_name);
    if (!hasPhotoOrName) missing.push("Photo/name");
    if (!clientSnapshot.phone) missing.push("Phone");
    if (!clientSnapshot.location) missing.push("Country");
    if (!clientSnapshot.unit_preference) missing.push("Units");
    if (!clientSnapshot.dob) missing.push("Birthdate");
    if (!clientSnapshot.gender) missing.push("Gender");
    if (!clientSnapshot.gym_name) missing.push("Gym");
    if (!clientSnapshot.days_per_week) missing.push("Days/week");
    if (!clientSnapshot.goal) missing.push("Goal");
    if (!clientSnapshot.injuries) missing.push("Injuries");
    if (!clientSnapshot.limitations) missing.push("Limitations");
    if (!clientSnapshot.height_cm) missing.push("Height");
    if (!clientSnapshot.current_weight) missing.push("Weight");
    if (!clientSnapshot.timezone) missing.push("Timezone");
    return missing;
  }, [clientSnapshot]);

  const habitLogDates = useMemo(
    () => (habitsQuery.data ?? []).map((log) => log.log_date),
    [habitsQuery.data]
  );

  const habitTrends = useMemo(() => {
    const logs = habitsQuery.data ?? [];
    const last7Logs = logs.filter(
      (log) => log.log_date >= habitsWeekStart && log.log_date <= habitsToday
    );
    const daysLogged = last7Logs.length;
    const avg = (values: Array<number | null | undefined>) => {
      const filtered = values.filter((value) => typeof value === "number") as number[];
      if (filtered.length === 0) return null;
      const sum = filtered.reduce((acc, value) => acc + value, 0);
      return Math.round(sum / filtered.length);
    };

    const avgSteps = avg(last7Logs.map((log) => log.steps ?? null));
    const avgSleep = avg(last7Logs.map((log) => log.sleep_hours ?? null));
    const avgProtein = avg(last7Logs.map((log) => log.protein_g ?? null));

    const weightLogs = [...last7Logs]
      .filter((log) => typeof log.weight_value === "number")
      .sort((a, b) => a.log_date.localeCompare(b.log_date));
    const weightUnit = weightLogs.find((log) => log.weight_unit)?.weight_unit ?? null;
    const weightChange =
      weightLogs.length >= 2
        ? (weightLogs[weightLogs.length - 1].weight_value ?? 0) -
          (weightLogs[0].weight_value ?? 0)
        : null;

    return { daysLogged, avgSteps, avgSleep, avgProtein, weightChange, weightUnit };
  }, [habitsQuery.data, habitsToday, habitsWeekStart]);

  const habitStreak = useMemo(
    () => computeStreak(habitLogDates, habitsToday, 30),
    [habitLogDates, habitsToday]
  );
  const lastHabitLogDate = useMemo(
    () => getLatestLogDate(habitLogDates),
    [habitLogDates]
  );

  const adherenceStat = useMemo(() => {
    if (!habitsQuery.data) return null;
    const daysLogged = habitTrends.daysLogged;
    return Math.round((daysLogged / 7) * 100);
  }, [habitTrends.daysLogged, habitsQuery.data]);

  const lastCheckin = useMemo(() => {
    if (!checkinsQuery.data || checkinsQuery.data.length === 0) return null;
    const latest = checkinsQuery.data[0];
    return latest.submitted_at ?? latest.week_ending_saturday ?? null;
  }, [checkinsQuery.data]);

  const checkinStatus = useMemo(() => {
    if (!checkinsQuery.data || checkinsQuery.data.length === 0) return null;
    const latest = checkinsQuery.data[0];
    if (!latest.submitted_at) return "Due";
    return latest.pt_feedback ? "Reviewed" : "Submitted";
  }, [checkinsQuery.data]);

  const lastWorkout = useMemo(() => {
    if (workoutSetLogsQuery.data && workoutSetLogsQuery.data.length > 0) {
      return workoutSetLogsQuery.data[0].created_at ?? null;
    }
    const completed = (upcomingQuery.data ?? []).find((row) => row.status === "completed");
    return completed?.completed_at ?? completed?.scheduled_date ?? null;
  }, [workoutSetLogsQuery.data, upcomingQuery.data]);

  const lastWorkoutStatus = useMemo(() => {
    if (workoutSetLogsQuery.data && workoutSetLogsQuery.data.length > 0) return "Completed";
    const completed = (upcomingQuery.data ?? []).find((row) => row.status === "completed");
    if (completed) return "Completed";
    const planned = (upcomingQuery.data ?? [])[0];
    return planned ? "Planned" : null;
  }, [workoutSetLogsQuery.data, upcomingQuery.data]);

  const lastSeen = useMemo(() => {
    if (clientSnapshot?.updated_at) return formatRelativeTime(clientSnapshot.updated_at);
    if (lastHabitLogDate) return formatRelativeTime(lastHabitLogDate);
    return null;
  }, [clientSnapshot?.updated_at, lastHabitLogDate]);

  const joinedLabel = useMemo(() => {
    const joinedAt = clientSnapshot?.created_at ?? clientSnapshot?.updated_at ?? null;
    return joinedAt ? formatRelativeTime(joinedAt) : null;
  }, [clientSnapshot?.created_at, clientSnapshot?.updated_at]);

  const upcomingCheckins = useMemo(() => {
    if (!checkinsQuery.data || checkinsQuery.data.length === 0) return [];
    const start = habitsToday || todayKey;
    const end = addDaysToDateString(start, 7);
    return checkinsQuery.data
      .filter(
        (checkin) =>
          checkin.week_ending_saturday &&
          checkin.week_ending_saturday >= start &&
          checkin.week_ending_saturday <= end &&
          !checkin.submitted_at
      )
      .sort((a, b) =>
        (a.week_ending_saturday ?? "").localeCompare(b.week_ending_saturday ?? "")
      )
      .slice(0, 5);
  }, [checkinsQuery.data, habitsToday, todayKey]);

  const todaySession = useMemo(() => {
    return (upcomingQuery.data ?? []).find((workout) => workout.scheduled_date === todayKey) ?? null;
  }, [upcomingQuery.data, todayKey]);

  const todaySessionStatus = todaySession?.status ?? "planned";
  const todaySessionTitle =
    todaySession?.workout_template?.name ??
    (todaySession?.day_type === "rest" ? "Rest day" : "Workout");
  const pendingCheckin = upcomingCheckins[0] ?? null;
  const lastNoteSummary = baselineNotes.trim() ? baselineNotes.trim() : "No recent PT notes.";

  const baselinePhotoMap = useMemo(() => {
    const map: Record<(typeof baselinePhotoTypes)[number], string | null> = {
      front: null,
      side: null,
      back: null,
    };
    baselinePhotosQuery.data?.forEach((row) => {
      const type = row.photo_type as (typeof baselinePhotoTypes)[number] | null;
      if (!type || !baselinePhotoTypes.includes(type)) return;
      map[type] = row.url ?? null;
    });
    return map;
  }, [baselinePhotosQuery.data]);

  const handleQuickAction = (message: string) => {
    if (!clientId) return;
    const params = new URLSearchParams({ tab: "messages", draft: message });
    navigate(`/pt/clients/${clientId}?${params.toString()}`);
  };

  const parseTags = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const updateAdminFields = async (nextTrainingType: string, nextTags: string) => {
    if (!clientSnapshot) return;
    setAdminStatus("saving");
    const parsedTags = parseTags(nextTags);
    const payload = {
      p_client_id: clientSnapshot.id,
      p_training_type: nextTrainingType || null,
      p_tags: parsedTags.length > 0 ? parsedTags : null,
    };
    const { data, error } = await supabase.rpc("pt_update_client_admin_fields", payload);
    if (error) {
      setAssignStatus("error");
      setAssignMessage(getErrorMessage(error));
      setAdminStatus("idle");
      return;
    }
    const updated = Array.isArray(data) ? data[0] : data;
    if (updated) {
      setClientProfile(updated as PtClientProfile);
      queryClient.setQueryData(
        ["pt-client", clientId, workspaceQuery.data],
        updated
      );
    }
    setAdminStatus("idle");
  };

  const handleBaselineNotesSave = async () => {
    if (!baselineId) return;
    setBaselineNotesStatus("saving");
    setBaselineNotesMessage(null);
    const { error } = await supabase
      .from("baseline_entries")
      .update({ coach_notes: baselineNotes.trim() || null })
      .eq("id", baselineId);
    if (error) {
      setBaselineNotesStatus("error");
      setBaselineNotesMessage(getErrorMessage(error));
      return;
    }
    setBaselineNotesStatus("idle");
    setBaselineNotesMessage("Baseline notes saved.");
    await queryClient.invalidateQueries({ queryKey: ["pt-client-baseline-entry", clientId] });
  };

  useEffect(() => {
    if (!assignedExercisesQuery.data) {
      setAssignedExercises([]);
      return;
    }
    const rows = assignedExercisesQuery.data.map((row) => ({
      ...row,
      loadNotes: row.load_notes ?? "",
      isCompleted: row.is_completed === true,
    }));
    setAssignedExercises(rows);
  }, [assignedExercisesQuery.data]);

  const handleLoadNotesChange = (id: string, value: string) => {
    setAssignedExercises((prev) =>
      prev.map((row) => (row.id === id ? { ...row, loadNotes: value } : row))
    );
  };

  const handleLoadCompletedChange = (id: string, value: boolean) => {
    setAssignedExercises((prev) =>
      prev.map((row) => (row.id === id ? { ...row, isCompleted: value } : row))
    );
  };

  const handleSaveLoads = async () => {
    if (!selectedAssignedWorkoutId) return;
    setLoadsStatus("saving");
    setLoadsError(null);
    const updates = assignedExercises.map((row) => ({
      id: row.id,
      load_notes: row.loadNotes.trim() || null,
      is_completed: row.isCompleted,
    }));
    const results = await Promise.all(
      updates.map((row) =>
        supabase
          .from("assigned_workout_exercises")
          .update({
            load_notes: row.load_notes,
            is_completed: row.is_completed,
          })
          .eq("id", row.id)
      )
    );
    const errorResult = results.find((result) => result.error);
    if (errorResult?.error) {
      const details = getErrorDetails(errorResult.error);
      setLoadsError(`${details.code}: ${details.message}`);
      setLoadsStatus("idle");
      return;
    }
    setLoadsStatus("idle");
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-exercises", selectedAssignedWorkoutId],
    });
    setLoadsOpen(false);
  };

  const openCheckinReview = (row: CheckinRow) => {
    setSelectedCheckin(row);
    setFeedbackText(row.pt_feedback ?? "");
    setFeedbackMessage(null);
    setFeedbackStatus("idle");
    setReviewOpen(true);
  };

  const handleSaveCheckinFeedback = async () => {
    if (!selectedCheckin) return;
    setFeedbackStatus("saving");
    setFeedbackMessage(null);
    const nextFeedback = feedbackText.trim() || null;
    const queryKey = ["pt-client-checkins", clientId];
    const previous = queryClient.getQueryData(queryKey) as CheckinRow[] | undefined;

    queryClient.setQueryData(queryKey, (old) => {
      const rows = (old ?? []) as CheckinRow[];
      return rows.map((row) =>
        row.id === selectedCheckin.id ? { ...row, pt_feedback: nextFeedback } : row
      );
    });

    const { error } = await supabase
      .from("checkins")
      .update({ pt_feedback: nextFeedback })
      .eq("id", selectedCheckin.id);

    if (error) {
      if (previous) {
        queryClient.setQueryData(queryKey, previous);
      }
      setFeedbackStatus("error");
      setFeedbackMessage("Unable to save feedback.");
      if (isDev) {
        console.warn("CHECKIN_FEEDBACK_SAVE_ERROR", error);
      }
      return;
    }

    setFeedbackStatus("idle");
    setFeedbackMessage("Feedback saved.");
    setReviewOpen(false);
    setSelectedCheckin(null);
    await queryClient.invalidateQueries({ queryKey });
  };

  useEffect(() => {
    if (active !== "baseline") return;
    if (!clientId || !workspaceQuery.data || !baselineEntryQuery.data?.id) return;
    if (baselineReviewLoggedRef.current === baselineEntryQuery.data.id) return;
    baselineReviewLoggedRef.current = baselineEntryQuery.data.id;
    void logCoachActivity({
      clientId,
      workspaceId: workspaceQuery.data ?? null,
      action: "baseline_reviewed",
      metadata: { baseline_id: baselineEntryQuery.data.id },
    });
  }, [active, clientId, workspaceQuery.data, baselineEntryQuery.data]);

  const toggleTask = (taskId: string) => {
    setClientTodos((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task))
    );
  };

  const addTask = () => {
    const next = todoInput.trim();
    if (!next) return;
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setClientTodos((prev) => [{ id, label: next, done: false }, ...prev]);
    setTodoInput("");
  };

  const removeTask = (taskId: string) => {
    setClientTodos((prev) => prev.filter((task) => task.id !== taskId));
  };

  return (
    <DashboardShell>
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[260px]">
          <Alert className={toastVariant === "error" ? "border-danger/30" : "border-emerald-200"}>
            <AlertTitle>{toastVariant === "error" ? "Error" : "Success"}</AlertTitle>
            <AlertDescription>{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

            <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/90 px-5 py-5 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {getInitials(clientSnapshot?.display_name)}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {clientSnapshot?.display_name ?? "Client profile"}
                    </h2>
                    <StatusPill status={clientSnapshot?.status ?? "active"} />
                    {lastSeen ? (
                      <span className="text-xs text-muted-foreground">Last seen {lastSeen}</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[clientSnapshot?.goal, clientSnapshot?.training_type, clientSnapshot?.timezone]
                      .filter(Boolean)
                      .join(" • ") || "Training plan overview"}
                    {joinedLabel ? ` • Joined ${joinedLabel}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="shadow-[0_0_30px_rgba(34,211,238,0.15)]"
                  onClick={() => handleQuickAction("")}
                >
                  Message
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    handleQuickAction(
                      "Quick favor: please update your profile details so I can refine your plan."
                    )
                  }
                >
                  Request check-in
                </Button>
                <Button variant="secondary" onClick={() => setActiveTab("plan")}>
                  Assign workout
                </Button>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="col-span-12">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Adherence"
                value={adherenceStat !== null ? `${adherenceStat}%` : "--"}
                helper="Last 7 days"
                icon={Sparkles}
                sparkline={<MiniSparkline />}
              />
              <StatCard
                label="Consistency streak"
                value={habitStreak > 0 ? `${habitStreak}d` : "--"}
                helper="Habit streak"
                icon={Rocket}
                sparkline={<MiniSparkline />}
              />
              <StatCard
                label="Check-in status"
                value={checkinStatus ?? "--"}
                helper={lastCheckin ? formatRelativeTime(lastCheckin) : "No check-ins"}
                icon={CalendarDays}
                sparkline={<MiniSparkline />}
              />
              <StatCard
                label="Last workout"
                value={lastWorkout ? formatRelativeTime(lastWorkout) : "--"}
                helper={lastWorkoutStatus ?? "No workouts"}
                icon={Sparkles}
                sparkline={<MiniSparkline />}
              />
            </div>
          </div>

          <div className="col-span-12">
            <PtClientScheduleCard
              clientId={clientId ?? null}
              workspaceId={workspaceQuery.data ?? null}
              timezone={clientSnapshot?.timezone ?? null}
              todayKey={todayKey}
              scheduleStartKey={scheduleStartKey}
              scheduleEndKey={scheduleEndKey}
              templatesQuery={templatesQuery}
              overrideOpen={overrideOpen}
              setOverrideOpen={setOverrideOpen}
              overrideDate={overrideDate}
              setOverrideDate={setOverrideDate}
              overrideTemplateId={overrideTemplateId}
              setOverrideTemplateId={setOverrideTemplateId}
              overrideIsRest={overrideIsRest}
              setOverrideIsRest={setOverrideIsRest}
              overrideNotes={overrideNotes}
              setOverrideNotes={setOverrideNotes}
              overrideStatus={overrideStatus}
              setOverrideStatus={setOverrideStatus}
              overrideError={overrideError}
              setOverrideError={setOverrideError}
              onSaveOverride={handleSaveOverride}
              onAssign={(dateKey) => {
                setScheduledDate(dateKey);
                setActiveTab("plan");
              }}
              onReschedule={handleRescheduleWorkout}
              onDelete={handleOpenDeleteDialog}
              onStatusChange={handleStatusUpdate}
            />
          </div>

          <div className="col-span-12 lg:col-span-8 space-y-6">
            <DashboardCard title="Today’s Focus" subtitle="What needs attention right now.">
              <div className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Today
                      </p>
                      <p className="text-lg font-semibold text-foreground">
                        {todaySessionTitle}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {todaySession?.day_type === "rest"
                          ? "Planned recovery day"
                          : todaySession
                          ? "Workout scheduled"
                          : "No workout scheduled"}
                      </p>
                    </div>
                    <StatusPill status={todaySessionStatus} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Check-in
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {pendingCheckin ? "Pending this week" : "No pending check-in"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pendingCheckin?.week_ending_saturday ?? "All caught up"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Last PT note
                    </p>
                    <p className="text-sm text-foreground">{lastNoteSummary}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setActiveTab("checkins")}>
                    Review check-in
                  </Button>
                  <Button variant="secondary" onClick={() => setActiveTab("plan")}>
                    Edit plan
                  </Button>
                  <Button
                    onClick={() => handleQuickAction("Quick check-in: how did today’s session feel?")}
                  >
                    Message
                  </Button>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard
              title="Client Workbench"
              subtitle="Plan, habits, and progress organized by tab."
              className="bg-card/90"
            >
              <Tabs value={active} onValueChange={setActiveTab} className="space-y-4">
                <div className="rounded-lg bg-card/80 p-2">
                  <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-lg bg-transparent p-0">
                  <TabsTrigger value="plan">Plan</TabsTrigger>
                  <TabsTrigger value="habits">Habits</TabsTrigger>
                  <TabsTrigger value="progress">Progress</TabsTrigger>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                  <TabsTrigger value="checkins">Check-ins</TabsTrigger>
                  <TabsTrigger value="messages">Messages</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="baseline">Baseline</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="plan">
                  <PtClientPlanTab
                    templatesQuery={templatesQuery}
                    programTemplatesQuery={programTemplatesQuery}
                    activeProgram={activeProgram}
                    programOverrides={programOverridesQuery.data ?? []}
                    upcomingQuery={upcomingQuery}
                    selectedTemplateId={selectedTemplateId}
                    scheduledDate={scheduledDate}
                    assignStatus={assignStatus}
                    selectedProgramId={selectedProgramId}
                    programStartDate={programStartDate}
                    programStatus={programStatus}
                    programMessage={programMessage}
                    unassignStatus={unassignStatus}
                    lastSetByWorkoutExercise={lastSetByWorkoutExercise}
                    onTemplateChange={setSelectedTemplateId}
                    onDateChange={setScheduledDate}
                    onAssign={handleAssignWorkout}
                    onProgramChange={setSelectedProgramId}
                    onProgramDateChange={setProgramStartDate}
                    onApplyProgram={handleApplyProgram}
                    onUnassignProgram={handleUnassignProgram}
                    onOpenOverride={handleOpenOverride}
                    onEdit={openEditDialog}
                    onDelete={(id) => {
                      setEditWorkoutId(id);
                      setDeleteOpen(true);
                    }}
                    onEditLoads={(id) => {
                      setSelectedAssignedWorkoutId(id);
                      setLoadsOpen(true);
                      setLoadsError(null);
                    }}
                    onStatusChange={handleStatusUpdate}
                  />
                </TabsContent>
                <TabsContent value="habits">
                  <PtClientHabitsTab
                    habitsQuery={habitsQuery}
                    habitLogByDateQuery={habitLogByDateQuery}
                    selectedHabitDate={selectedHabitDate}
                    onSelectHabitDate={setSelectedHabitDate}
                    habitStreak={habitStreak}
                    habitTrends={habitTrends}
                    lastHabitLogDate={lastHabitLogDate}
                  />
                </TabsContent>
                <TabsContent value="progress">
                  <PtClientProgressTab />
                </TabsContent>
                <TabsContent value="logs">
                  <PtClientLogsTab />
                </TabsContent>
                <TabsContent value="checkins">
                  <PtClientCheckinsTab checkinsQuery={checkinsQuery} onReview={openCheckinReview} />
                </TabsContent>
                <TabsContent value="messages">
                  <PtClientMessagesTab />
                </TabsContent>
                <TabsContent value="notes">
                  <PtClientNotesTab />
                </TabsContent>
                <TabsContent value="baseline">
                  <PtClientBaselineTab
                    baselineEntryQuery={baselineEntryQuery}
                    baselineMetricsQuery={baselineMetricsQuery}
                    baselineMarkersQuery={baselineMarkersQuery}
                    baselinePhotosQuery={baselinePhotosQuery}
                    baselineNotes={baselineNotes}
                    baselineNotesStatus={baselineNotesStatus}
                    baselineNotesMessage={baselineNotesMessage}
                    baselinePhotoMap={baselinePhotoMap}
                    onNotesChange={setBaselineNotes}
                    onNotesSave={handleBaselineNotesSave}
                  />
                </TabsContent>
              </Tabs>
            </DashboardCard>

            {(workspaceQuery.error ||
              templatesQuery.error ||
              upcomingQuery.error ||
              coachActivityQuery.error ||
              habitsQuery.error ||
              habitLogByDateQuery.error ||
              baselineEntryQuery.error ||
              baselineMetricsQuery.error ||
              baselineMarkersQuery.error ||
              baselinePhotosQuery.error ||
              checkinsQuery.error ||
              clientQuery.error ||
              assignStatus === "error") && (
              <Alert className="border-destructive/30">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {assignStatus === "error" && assignMessage
                    ? assignMessage
                    : getFriendlyErrorMessage()}
                  {isDev ? (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {[
                        workspaceQuery.error,
                        templatesQuery.error,
                        upcomingQuery.error,
                        workoutSessionsQuery.error,
                        workoutSetLogsQuery.error,
                        coachActivityQuery.error,
                        habitsQuery.error,
                        habitLogByDateQuery.error,
                        baselineEntryQuery.error,
                        baselineMetricsQuery.error,
                        baselineMarkersQuery.error,
                        baselinePhotosQuery.error,
                        checkinsQuery.error,
                        clientQuery.error,
                      ]
                        .filter(Boolean)
                        .map((error, index) => {
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
            )}

            {assignStatus !== "error" && assignMessage ? (
              <Alert className="border-border">
                <AlertTitle>Update</AlertTitle>
                <AlertDescription>{assignMessage}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-6">
            <DashboardCard
              title="Client Overview"
              subtitle="Key details and profile status."
              action={
                <Button size="sm" variant="secondary" onClick={() => setActiveTab("baseline")}>
                  Edit profile
                </Button>
              }
            >
              {clientSnapshot ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <StatusPill status={clientSnapshot.status ?? "active"} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Goal</span>
                    <span>{clientSnapshot.goal ?? "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Training</span>
                    <span>{clientSnapshot.training_type ?? "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Timezone</span>
                    <span>{clientSnapshot.timezone ?? "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Joined</span>
                    <span>{joinedLabel ?? "--"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Active program</span>
                    <span>{activeProgram?.program_template?.name ?? "None"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Program start</span>
                    <span>{activeProgram?.start_date ?? "--"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Weekly check-in</span>
                    <span>{checkinStatus ?? "--"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last workout</span>
                    <span>{lastWorkoutStatus ?? "--"}</span>
                  </div>
                </div>
              ) : (
                <EmptyState title="No client data" description="Profile details are unavailable." />
              )}
            </DashboardCard>

            <DashboardCard title="Todo List" subtitle="Create tasks for this client.">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={todoInput}
                    onChange={(event) => setTodoInput(event.target.value)}
                    placeholder="Add a new task"
                  />
                  <Button onClick={addTask} disabled={!todoInput.trim()}>
                    Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {clientTodos.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                      No tasks yet.
                    </div>
                  ) : (
                    clientTodos.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                      >
                        <label className="flex flex-1 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={() => toggleTask(task.id)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span
                            className={cn(
                              "font-medium",
                              task.done ? "text-muted-foreground line-through" : "text-foreground"
                            )}
                          >
                            {task.label}
                          </span>
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeTask(task.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </DashboardCard>

            <DashboardCard title="Recent activity" subtitle="Last 5 coach actions.">
              {coachActivityQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : coachActivityQuery.data && coachActivityQuery.data.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {coachActivityQuery.data.slice(0, 5).map((entry) => {
                    const createdLabel = entry.created_at
                      ? new Date(entry.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "today";
                    return (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <span className="font-medium">{getCoachActionLabel(entry.action)}</span>
                        <span className="text-xs text-muted-foreground">
                          {entry.created_at ? formatRelativeTime(entry.created_at) : "today"} - {createdLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No recent activity" description="No actions logged yet." />
              )}
            </DashboardCard>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit workout</DialogTitle>
            <DialogDescription>Update schedule, template, or status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Date</label>
              <input
                type="date"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editDate}
                onChange={(event) => setEditDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Workout template
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editTemplateId}
                onChange={(event) => setEditTemplateId(event.target.value)}
              >
                <option value="">Select a template</option>
                {templatesQuery.data?.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}{" "}
                    {template.workout_type_tag ? ` - ${template.workout_type_tag}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Status</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editStatus}
                onChange={(event) =>
                  setEditStatus(event.target.value as "planned" | "completed" | "skipped")
                }
              >
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={assignStatus === "saving" || !editTemplateId || !editDate}
            >
              {assignStatus === "saving" ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reviewOpen}
        onOpenChange={(open) => {
          setReviewOpen(open);
          if (!open) {
            setSelectedCheckin(null);
            setFeedbackText("");
            setFeedbackMessage(null);
            setFeedbackStatus("idle");
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Check-in feedback</DialogTitle>
            <DialogDescription>
              {selectedCheckin?.week_ending_saturday
                ? `Week ending ${selectedCheckin.week_ending_saturday}`
                : "Weekly check-in feedback"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground">Feedback</label>
            <textarea
              className="min-h-[140px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              placeholder="Write notes for the client..."
            />
            {feedbackMessage ? (
              <div className="text-xs text-muted-foreground">{feedbackMessage}</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCheckinFeedback}
              disabled={feedbackStatus === "saving" || !selectedCheckin}
            >
              {feedbackStatus === "saving" ? "Saving..." : "Save feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={loadsOpen}
        onOpenChange={(open) => {
          setLoadsOpen(open);
          if (!open) {
            setSelectedAssignedWorkoutId(null);
            setLoadsError(null);
            setLoadsStatus("idle");
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit loads</DialogTitle>
            <DialogDescription>Set per-client loads for this assignment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {assignedExercisesQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : assignedExercisesQuery.error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {getErrorDetails(assignedExercisesQuery.error).code}:{" "}
                {getErrorDetails(assignedExercisesQuery.error).message}
              </div>
            ) : assignedExercises.length > 0 ? (
              assignedExercises.map((row) => (
                <div
                  key={row.id}
                  className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-[1.4fr_1fr_auto]"
                >
                  <div>
                    <p className="text-sm font-semibold">{row.exercise?.name ?? "Exercise"}</p>
                    <p className="text-xs text-muted-foreground">Client load and notes</p>
                  </div>
                  <Input
                    value={row.loadNotes}
                    onChange={(event) => handleLoadNotesChange(row.id, event.target.value)}
                    placeholder="Load notes"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={row.isCompleted}
                      onChange={(event) =>
                        handleLoadCompletedChange(row.id, event.target.checked)
                      }
                    />
                    Completed
                  </label>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                No exercises assigned yet.
              </div>
            )}
            {loadsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {loadsError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLoadsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLoads} disabled={loadsStatus === "saving"}>
              {loadsStatus === "saving" ? "Saving..." : "Save loads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete workout</DialogTitle>
            <DialogDescription>
              This will remove the scheduled workout. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWorkout}
              disabled={assignStatus === "saving"}
            >
              {assignStatus === "saving" ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}






function PtClientScheduleCard({
  clientId,
  workspaceId,
  timezone,
  todayKey,
  scheduleStartKey,
  scheduleEndKey,
  templatesQuery,
  overrideOpen,
  setOverrideOpen,
  overrideDate,
  setOverrideDate,
  overrideTemplateId,
  setOverrideTemplateId,
  overrideIsRest,
  setOverrideIsRest,
  overrideNotes,
  setOverrideNotes,
  overrideStatus,
  setOverrideStatus,
  overrideError,
  setOverrideError,
  onSaveOverride,
  onAssign,
  onReschedule,
  onDelete,
  onStatusChange,
}: {
  clientId: string | null;
  workspaceId: string | null;
  timezone: string | null;
  todayKey: string;
  scheduleStartKey: string;
  scheduleEndKey: string;
  templatesQuery: QueryResult<Array<{ id: string; name: string | null; workout_type_tag: string | null }>>;
  overrideOpen: boolean;
  setOverrideOpen: (open: boolean) => void;
  overrideDate: string | null;
  setOverrideDate: (value: string | null) => void;
  overrideTemplateId: string;
  setOverrideTemplateId: (value: string) => void;
  overrideIsRest: boolean;
  setOverrideIsRest: (value: boolean) => void;
  overrideNotes: string;
  setOverrideNotes: (value: string) => void;
  overrideStatus: "idle" | "saving";
  setOverrideStatus: (value: "idle" | "saving") => void;
  overrideError: string | null;
  setOverrideError: (value: string | null) => void;
  onSaveOverride: () => void;
  onAssign: (dateKey: string) => void;
  onReschedule: (id: string, dateKey: string) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: "completed" | "skipped") => void;
}) {
  const [selectedKey, setSelectedKey] = useState(scheduleStartKey);
  const [editOpen, setEditOpen] = useState(false);
  const [editDate, setEditDate] = useState(scheduleStartKey);
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false);
  const [dayNote, setDayNote] = useState("");

  useEffect(() => {
    setSelectedKey(scheduleStartKey);
  }, [scheduleStartKey]);

  const scheduleQuery = useQuery({
    queryKey: ["pt-client-schedule-week", clientId, workspaceId, scheduleStartKey, scheduleEndKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, scheduled_date, status, day_type, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description)"
        )
        .eq("client_id", clientId ?? "")
        .gte("scheduled_date", scheduleStartKey)
        .lte("scheduled_date", scheduleEndKey)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const weekRows = useMemo(() => {
    const rows = Array.from({ length: 7 }).map((_, idx) => {
      const key = addDaysToDateString(scheduleStartKey, idx);
      const match =
        scheduleQuery.data?.find((item) => item.scheduled_date === key) ?? null;
      return { key, workout: match };
    });
    return rows;
  }, [scheduleQuery.data, scheduleStartKey]);

  const selectedRow = weekRows.find((row) => row.key === selectedKey) ?? weekRows[0];
  const selectedWorkout = selectedRow?.workout ?? null;
  const selectedStatus =
    selectedWorkout?.day_type === "rest"
      ? "rest day"
      : selectedWorkout?.status ?? (selectedWorkout ? "planned" : "rest day");
  const selectedTitle =
    selectedWorkout?.day_type === "rest"
      ? "Rest day"
      : selectedWorkout?.workout_template?.name ?? "Workout";

  const weeklyWorkouts = weekRows.filter(
    (row) => row.workout && row.workout.day_type !== "rest"
  );
  const weeklyCompleted = weeklyWorkouts.filter(
    (row) => row.workout?.status === "completed"
  ).length;
  const weeklyMissed = weeklyWorkouts.filter(
    (row) => row.workout?.status === "skipped"
  ).length;
  const weeklyAdherence = weeklyWorkouts.length > 0
    ? Math.round((weeklyCompleted / weeklyWorkouts.length) * 100)
    : 0;

  const streakKeys = useMemo(() => {
    const keys = new Set<string>();
    let streaking = true;
    for (let i = weekRows.length - 1; i >= 0; i -= 1) {
      const row = weekRows[i];
      if (row.key > todayKey) continue;
      const isWorkout = row.workout && row.workout.day_type !== "rest";
      const isCompleted = row.workout?.status === "completed";
      if (isWorkout && isCompleted && streaking) {
        keys.add(row.key);
      } else if (isWorkout && !isCompleted) {
        streaking = false;
      }
    }
    return keys;
  }, [todayKey, weekRows]);

  useEffect(() => {
    const noteKey = selectedWorkout?.id
      ? `coachos_pt_note_${selectedWorkout.id}`
      : `coachos_pt_note_${selectedKey}`;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(noteKey) ?? "";
    setDayNote(stored);
  }, [selectedKey, selectedWorkout?.id]);

  const handleSaveDayNote = () => {
    if (typeof window === "undefined") return;
    const noteKey = selectedWorkout?.id
      ? `coachos_pt_note_${selectedWorkout.id}`
      : `coachos_pt_note_${selectedKey}`;
    window.localStorage.setItem(noteKey, dayNote.trim());
  };

  const formatLabel = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month || !day) return key;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: timezone ?? undefined,
    });
  };

  const formatWeekday = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month || !day) return key;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: timezone ?? undefined,
    });
  };

  const formatDayNumber = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month || !day) return "";
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      timeZone: timezone ?? undefined,
    });
  };

  return (
    <DashboardCard
      title="Coach Calendar (7 days)"
      subtitle="Your coaching calendar for this client."
    >
      {scheduleQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Weekly Adherence
              </div>
              <div className="text-lg font-semibold text-foreground">
                {weeklyAdherence}%
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              {weeklyMissed > 0
                ? `${weeklyMissed} session${weeklyMissed === 1 ? "" : "s"} missed this week`
                : "No missed sessions this week"}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {weekRows.map((row) => {
                const workout = row.workout;
                const isRestDay = workout?.day_type === "rest";
                const status = isRestDay
                  ? "rest day"
                  : workout?.status ?? (workout ? "planned" : "rest day");
                const title = isRestDay
                  ? "Rest day"
                  : workout?.workout_template?.name ?? "Workout";
                const isSelected = row.key === selectedKey;
                const isToday = row.key === todayKey;
                const isPast = row.key < todayKey;
                const isFuture = row.key > todayKey;
                const isCompleted = workout?.status === "completed";
                const isSkipped = workout?.status === "skipped";
                const isStreak = streakKeys.has(row.key);
                return (
                  <div
                    key={row.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedKey(row.key);
                      setDayDrawerOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedKey(row.key);
                        setDayDrawerOpen(true);
                      }
                    }}
                    className={cn(
                      "group min-h-[180px] w-full rounded-2xl border border-border/70 bg-background/40 px-4 py-4 text-left transition hover:border-border",
                      isSelected
                        ? "bg-primary/10"
                        : "bg-background/30 hover:bg-muted/40",
                      isToday
                        ? "min-h-[190px] shadow-[0_0_22px_rgba(56,189,248,0.2)]"
                        : "",
                      isPast && !isSelected ? "opacity-70" : "",
                      isFuture && !isSelected ? "opacity-90" : ""
                    )}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="uppercase tracking-[0.2em]">
                          {formatWeekday(row.key)} {formatDayNumber(row.key)}
                        </span>
                        {isStreak ? <Flame className="h-4 w-4 text-amber-300" /> : null}
                      </div>

                      <div className="space-y-1">
                        <p className="text-base font-semibold text-foreground">
                          {workout ? title : "Rest day"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {isRestDay
                            ? "Planned rest day"
                            : workout?.workout_template?.workout_type_tag ?? "Workout"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusPill status={status} />
                        {isCompleted ? (
                          <Badge variant="success" className="text-[10px] uppercase">
                            Done
                          </Badge>
                        ) : null}
                        {isSkipped ? (
                          <Badge variant="warning" className="text-[10px] uppercase">
                            Missed
                          </Badge>
                        ) : null}
                        {isSkipped ? <AlertTriangle className="h-4 w-4 text-amber-300" /> : null}
                        {isRestDay ? <Moon className="h-4 w-4 text-sky-200" /> : null}
                      </div>

                      <div className="flex items-center gap-2 text-muted-foreground opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (workout?.id) {
                              setEditDate(row.key);
                              setEditOpen(true);
                            } else {
                              onAssign(row.key);
                            }
                          }}
                          className="rounded-full border border-border/60 bg-background/50 p-1.5 text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDayDrawerOpen(true);
                          }}
                          className="rounded-full border border-border/60 bg-background/50 p-1.5 text-xs"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Selected day</p>
                <p className="text-sm font-semibold">{formatLabel(selectedRow.key)}</p>
                <p className="text-xs text-muted-foreground">{selectedTitle}</p>
              </div>
              <StatusPill status={selectedStatus} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedWorkout ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditDate(selectedRow.key);
                      setEditOpen(true);
                    }}
                  >
                    Edit date
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(selectedWorkout.id)}>
                    Delete assignment
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onStatusChange(selectedWorkout.id, "completed")}
                  >
                    Mark completed
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(selectedWorkout.id, "skipped")}
                  >
                    Mark skipped
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => onAssign(selectedRow.key)}>
                  Assign workout
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit scheduled date</DialogTitle>
            <DialogDescription>Reschedule this workout for a different day.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Date</label>
            <Input
              type="date"
              value={editDate}
              onChange={(event) => setEditDate(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedWorkout) {
                  onReschedule(selectedWorkout.id, editDate);
                }
                setEditOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dayDrawerOpen} onOpenChange={setDayDrawerOpen}>
        <DialogContent className="sm:max-w-[560px] lg:ml-auto lg:mr-6">
          <DialogHeader>
            <DialogTitle>Day details</DialogTitle>
            <DialogDescription>
              {formatWeekday(selectedRow.key)} {formatDayNumber(selectedRow.key)} •{" "}
              {selectedTitle}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Status
                </span>
                <StatusPill status={selectedStatus} />
              </div>
              <div className="mt-2 text-base font-semibold text-foreground">
                {selectedTitle}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => selectedWorkout && onStatusChange(selectedWorkout.id, "completed")}
                disabled={!selectedWorkout}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark complete
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedWorkout && onStatusChange(selectedWorkout.id, "skipped")}
                disabled={!selectedWorkout}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Mark missed
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">PT notes</label>
              <textarea
                className="min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={dayNote}
                onChange={(event) => setDayNote(event.target.value)}
                placeholder="Add a private coaching note for this day."
              />
              <div className="text-xs text-muted-foreground">
                Saved locally for now.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (selectedWorkout) {
                    setEditDate(selectedRow.key);
                    setEditOpen(true);
                  } else {
                    onAssign(selectedRow.key);
                  }
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit workout
              </Button>
              <Button variant="ghost" onClick={handleSaveDayNote}>
                Save note
              </Button>
              <Button variant="ghost" onClick={() => setDayDrawerOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overrideOpen}
        onOpenChange={(open) => {
          setOverrideOpen(open);
          if (!open) {
            setOverrideDate(null);
            setOverrideTemplateId("");
            setOverrideIsRest(false);
            setOverrideNotes("");
            setOverrideError(null);
            setOverrideStatus("idle");
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Program override</DialogTitle>
            <DialogDescription>
              Adjust the program day for {overrideDate ?? "this date"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Date</label>
              <Input type="date" value={overrideDate ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Workout template
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={overrideTemplateId}
                disabled={overrideIsRest}
                onChange={(event) => {
                  setOverrideTemplateId(event.target.value);
                  if (event.target.value) {
                    setOverrideIsRest(false);
                  }
                }}
              >
                <option value="">Select a template</option>
                {templatesQuery.data?.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}{" "}
                    {template.workout_type_tag ? ` - ${template.workout_type_tag}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={overrideIsRest}
                onChange={(event) => {
                  setOverrideIsRest(event.target.checked);
                  if (event.target.checked) {
                    setOverrideTemplateId("");
                  }
                }}
              />
              Mark as rest day
            </label>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Notes</label>
              <textarea
                className="min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={overrideNotes}
                onChange={(event) => setOverrideNotes(event.target.value)}
                placeholder="Optional notes for the client."
              />
            </div>
            {overrideError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {overrideError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button disabled={overrideStatus === "saving"} onClick={onSaveOverride}>
              {overrideStatus === "saving" ? "Saving..." : "Save override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardCard>
  );
}

function PtClientBaselineTab({
  baselineEntryQuery,
  baselineMetricsQuery,
  baselineMarkersQuery,
  baselinePhotosQuery,
  baselineNotes,
  baselineNotesStatus,
  baselineNotesMessage,
  baselinePhotoMap,
  onNotesChange,
  onNotesSave,
}: {
  baselineEntryQuery: QueryResult<BaselineEntry | null>;
  baselineMetricsQuery: QueryResult<BaselineMetrics | null>;
  baselineMarkersQuery: QueryResult<BaselineMarkerRow[]>;
  baselinePhotosQuery: QueryResult<BaselinePhotoRow[]>;
  baselineNotes: string;
  baselineNotesStatus: "idle" | "saving" | "error";
  baselineNotesMessage: string | null;
  baselinePhotoMap: Record<(typeof baselinePhotoTypes)[number], string | null>;
  onNotesChange: (value: string) => void;
  onNotesSave: () => void;
}) {
  return (
    <Card className="border-border/70 bg-card/80 xl:col-start-1">
      <CardHeader>
        <CardTitle>Baseline</CardTitle>
        <p className="text-sm text-muted-foreground">Latest submitted baseline details.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {baselineEntryQuery.isLoading ||
        baselineMetricsQuery.isLoading ||
        baselineMarkersQuery.isLoading ||
        baselinePhotosQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : baselineEntryQuery.data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Submitted at</p>
                <p className="text-sm font-semibold">
                  {baselineEntryQuery.data.submitted_at
                    ? new Date(baselineEntryQuery.data.submitted_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Submitted"}
                </p>
              </div>
              <Badge variant="success">Submitted</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Weight", value: baselineMetricsQuery.data?.weight_kg, unit: "kg" },
                { label: "Height", value: baselineMetricsQuery.data?.height_cm, unit: "cm" },
                { label: "Body fat", value: baselineMetricsQuery.data?.body_fat_pct, unit: "%" },
                { label: "Waist", value: baselineMetricsQuery.data?.waist_cm, unit: "cm" },
                { label: "Chest", value: baselineMetricsQuery.data?.chest_cm, unit: "cm" },
                { label: "Hips", value: baselineMetricsQuery.data?.hips_cm, unit: "cm" },
                { label: "Thigh", value: baselineMetricsQuery.data?.thigh_cm, unit: "cm" },
                { label: "Arm", value: baselineMetricsQuery.data?.arm_cm, unit: "cm" },
                {
                  label: "Resting HR",
                  value: baselineMetricsQuery.data?.resting_hr,
                  unit: "bpm",
                },
                {
                  label: "VO2 max",
                  value: baselineMetricsQuery.data?.vo2max,
                  unit: "ml/kg/min",
                },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="text-sm font-semibold">
                    {typeof metric.value === "number"
                      ? `${metric.value} ${metric.unit}`
                      : "Not provided"}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Performance markers
              </p>
              {baselineMarkersQuery.data && baselineMarkersQuery.data.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {baselineMarkersQuery.data.map((marker, index) => (
                    <div
                      key={`${marker.template?.name ?? "marker"}-${index}`}
                      className="rounded-lg border border-border p-3 text-sm"
                    >
                      <p className="text-xs text-muted-foreground">
                        {marker.template?.name ?? "Marker"}
                      </p>
                      <p className="font-semibold">
                        {marker.value_number !== null && marker.value_number !== undefined
                          ? marker.value_number
                          : marker.value_text ?? "Not provided"}
                        {marker.template?.unit_label ? ` ${marker.template.unit_label}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No markers submitted.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Photos</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {baselinePhotoTypes.map((type) => (
                  <div key={type} className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {type}
                    </p>
                    <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
                      {baselinePhotoMap[type] ? (
                        <img
                          src={baselinePhotoMap[type] ?? ""}
                          alt={`${type} baseline`}
                          className="h-full w-full rounded-md object-cover"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Missing</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Coach notes
              </label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={baselineNotes}
                onChange={(event) => onNotesChange(event.target.value)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={baselineNotesStatus === "saving"}
                  onClick={onNotesSave}
                >
                  {baselineNotesStatus === "saving" ? "Saving..." : "Save notes"}
                </Button>
                {baselineNotesMessage ? (
                  <span className="text-xs text-muted-foreground">{baselineNotesMessage}</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No submitted baseline yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PtClientCheckinsTab({
  checkinsQuery,
  onReview,
}: {
  checkinsQuery: QueryResult<CheckinRow[]>;
  onReview: (checkin: CheckinRow) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCheckin, setDetailCheckin] = useState<CheckinRow | null>(null);

  const answersQuery = useQuery({
    queryKey: ["checkin-answers", detailCheckin?.id],
    enabled: !!detailCheckin?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_answers")
        .select(
          "id, answer_text, answer_number, answer_boolean, question:checkin_questions(question_text, prompt)"
        )
        .eq("checkin_id", detailCheckin?.id ?? "");
      if (error) throw error;
      return (data ?? []) as CheckinAnswerRow[];
    },
  });

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailCheckin(null);
  };

  const renderAnswerValue = (answer: CheckinAnswerRow) => {
    if (answer.answer_text) return answer.answer_text;
    if (typeof answer.answer_number === "number") return `${answer.answer_number}`;
    if (typeof answer.answer_boolean === "boolean") return answer.answer_boolean ? "Yes" : "No";
    return "--";
  };

  return (
    <>
      <Card className="border-border/70 bg-card/80 xl:col-start-1">
        <CardHeader>
          <CardTitle>Check-ins</CardTitle>
          <p className="text-sm text-muted-foreground">Weekly check-ins and coach feedback.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {checkinsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : checkinsQuery.data && checkinsQuery.data.length > 0 ? (
            <div className="space-y-3">
              {checkinsQuery.data.map((checkin) => {
                const status = !checkin.submitted_at
                  ? "Due"
                  : checkin.pt_feedback
                  ? "Reviewed"
                  : "Submitted";
                const variant =
                  status === "Reviewed" ? "success" : status === "Submitted" ? "secondary" : "warning";
                return (
                  <button
                    key={checkin.id}
                    type="button"
                    onClick={() => {
                      setDetailCheckin(checkin);
                      setDetailOpen(true);
                    }}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 text-left transition hover:bg-muted/50"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {checkin.week_ending_saturday
                          ? `Week ending ${checkin.week_ending_saturday}`
                          : "Weekly check-in"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {checkin.submitted_at
                          ? `Submitted ${formatRelativeTime(checkin.submitted_at)}`
                          : "Awaiting submission"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={variant}>{status}</Badge>
                      {checkin.submitted_at ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            onReview(checkin);
                          }}
                        >
                          {checkin.pt_feedback ? "Edit feedback" : "Review"}
                        </Button>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No check-ins yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={(open) => (open ? null : closeDetail())}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Check-in details</DialogTitle>
            <DialogDescription>
              {detailCheckin?.week_ending_saturday
                ? `Week ending ${detailCheckin.week_ending_saturday}`
                : "Weekly check-in responses"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {answersQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : answersQuery.error ? (
              <Alert className="border-destructive/30">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{getFriendlyErrorMessage()}</AlertDescription>
              </Alert>
            ) : answersQuery.data && answersQuery.data.length > 0 ? (
              <div className="space-y-2">
                {answersQuery.data.map((answer) => (
                  <div
                    key={answer.id}
                    className="rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      {answer.question?.question_text ?? answer.question?.prompt ?? "Question"}
                    </p>
                    <p className="text-sm font-semibold">{renderAnswerValue(answer)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No responses recorded.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeDetail}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PtClientHabitsTab({
  habitsQuery,
  habitLogByDateQuery,
  selectedHabitDate,
  onSelectHabitDate,
  habitStreak,
  habitTrends,
  lastHabitLogDate,
}: {
  habitsQuery: QueryResult<HabitLog[]>;
  habitLogByDateQuery: QueryResult<HabitLog | null>;
  selectedHabitDate: string;
  onSelectHabitDate: (value: string) => void;
  habitStreak: number;
  habitTrends: HabitTrends;
  lastHabitLogDate: string | null;
}) {
  return (
    <Card className="border-border/70 bg-card/80 xl:col-start-1">
      <CardHeader>
        <CardTitle>Habits</CardTitle>
        <p className="text-sm text-muted-foreground">Last 7 days of habit logs.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {habitsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Adherence</p>
                <p className="text-sm font-semibold">{habitTrends.daysLogged}/7 days</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Current streak</p>
                <p className="text-sm font-semibold">
                  {habitStreak > 0 ? `${habitStreak} day${habitStreak === 1 ? "" : "s"}` : "--"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Last logged</p>
                <p className="text-sm font-semibold">{lastHabitLogDate ?? "--"}</p>
              </div>
            </div>

            <Card className="border-dashed">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Daily habit log</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Review a specific day's log in read-only mode.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">Date</label>
                  <Input
                    type="date"
                    value={selectedHabitDate}
                    onChange={(event) => onSelectHabitDate(event.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {habitLogByDateQuery.error ? (
                  <Alert className="border-danger/30">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{getFriendlyErrorMessage()}</AlertDescription>
                  </Alert>
                ) : habitLogByDateQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : habitLogByDateQuery.data ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Calories</p>
                      <p className="text-sm font-semibold">
                        {habitLogByDateQuery.data.calories ?? "--"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Protein</p>
                      <p className="text-sm font-semibold">
                        {typeof habitLogByDateQuery.data.protein_g === "number"
                          ? `${habitLogByDateQuery.data.protein_g} g`
                          : "--"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Weight</p>
                      <p className="text-sm font-semibold">
                        {typeof habitLogByDateQuery.data.weight_value === "number"
                          ? `${habitLogByDateQuery.data.weight_value} ${habitLogByDateQuery.data.weight_unit ?? ""}`
                          : "--"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Steps</p>
                      <p className="text-sm font-semibold">
                        {typeof habitLogByDateQuery.data.steps === "number"
                          ? habitLogByDateQuery.data.steps.toLocaleString()
                          : "--"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Sleep</p>
                      <p className="text-sm font-semibold">
                        {typeof habitLogByDateQuery.data.sleep_hours === "number"
                          ? `${habitLogByDateQuery.data.sleep_hours} hrs`
                          : "--"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm">{habitLogByDateQuery.data.notes ?? "--"}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No habit log for this date.</p>
                )}
              </CardContent>
            </Card>

            {habitsQuery.data && habitsQuery.data.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-7 gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  <span>Date</span>
                  <span>Calories</span>
                  <span>Protein</span>
                  <span>Steps</span>
                  <span>Sleep</span>
                  <span>Weight</span>
                  <span>Notes</span>
                </div>
                {habitsQuery.data.map((log) => (
                  <div
                    key={log.id ?? log.log_date}
                    className="grid grid-cols-7 gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <span className="text-xs text-muted-foreground">{log.log_date}</span>
                    <span>{typeof log.calories === "number" ? log.calories : "--"}</span>
                    <span>
                      {typeof log.protein_g === "number" ? `${log.protein_g} g` : "--"}
                    </span>
                    <span>
                      {typeof log.steps === "number" ? log.steps.toLocaleString() : "--"}
                    </span>
                    <span>
                      {typeof log.sleep_hours === "number" ? `${log.sleep_hours} hrs` : "--"}
                    </span>
                    <span>
                      {typeof log.weight_value === "number"
                        ? `${log.weight_value} ${log.weight_unit ?? ""}`
                        : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground">{log.notes ?? "--"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No habit logs yet.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PtClientPlanTab({
  templatesQuery,
  programTemplatesQuery,
  activeProgram,
  programOverrides,
  upcomingQuery,
  selectedTemplateId,
  scheduledDate,
  assignStatus,
  selectedProgramId,
  programStartDate,
  programStatus,
  programMessage,
  unassignStatus,
  lastSetByWorkoutExercise,
  onTemplateChange,
  onDateChange,
  onAssign,
  onProgramChange,
  onProgramDateChange,
  onApplyProgram,
  onUnassignProgram,
  onOpenOverride,
  onEdit,
  onDelete,
  onEditLoads,
  onStatusChange,
}: {
  templatesQuery: QueryResult<Array<{ id: string; name: string | null; workout_type_tag: string | null }>>;
  programTemplatesQuery: QueryResult<ProgramTemplateRow[]>;
  activeProgram: ClientProgramRow | null;
  programOverrides: ProgramOverrideRow[];
  upcomingQuery: QueryResult<
    Array<{
      id: string;
      status: string | null;
      day_type?: string | null;
      scheduled_date: string | null;
      completed_at: string | null;
      workout_template_id: string | null;
      workout_template: { name: string | null } | null;
      assigned_workout_exercises?: AssignedWorkoutExerciseRow[];
    }>
  >;
  selectedTemplateId: string;
  scheduledDate: string;
  assignStatus: "idle" | "saving" | "error";
  selectedProgramId: string;
  programStartDate: string;
  programStatus: "idle" | "saving" | "error";
  programMessage: string | null;
  unassignStatus: "idle" | "saving" | "error";
  lastSetByWorkoutExercise: Map<string, WorkoutSetLogRow>;
  onTemplateChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onAssign: () => void;
  onProgramChange: (value: string) => void;
  onProgramDateChange: (value: string) => void;
  onApplyProgram: () => void;
  onUnassignProgram: () => void;
  onOpenOverride: (date: string) => void;
  onEdit: (workout: {
    id: string;
    scheduled_date: string | null;
    workout_template_id: string | null;
    status: string | null;
  }) => void;
  onDelete: (id: string) => void;
  onEditLoads: (id: string) => void;
  onStatusChange: (id: string, status: "planned" | "completed" | "skipped") => void;
}) {
  const overrideByDate = useMemo(() => {
    const map = new Map<string, ProgramOverrideRow>();
    programOverrides.forEach((row) => {
      if (row.override_date) map.set(row.override_date, row);
    });
    return map;
  }, [programOverrides]);

  return (
    <div className="space-y-6 xl:col-start-1">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>Program</CardTitle>
            <p className="text-sm text-muted-foreground">
              Assign a multi-week program and materialize the next 14 days.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {programTemplatesQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : programTemplatesQuery.error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {getErrorDetails(programTemplatesQuery.error).code}:{" "}
                {getErrorDetails(programTemplatesQuery.error).message}
              </div>
            ) : programTemplatesQuery.data && programTemplatesQuery.data.length === 0 ? (
              <EmptyState
                title="No program templates yet."
                description="Create a program template to start scheduling multi-week blocks."
              />
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Program</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedProgramId}
                    onChange={(event) => onProgramChange(event.target.value)}
                  >
                    <option value="">Select a program</option>
                    {programTemplatesQuery.data?.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name ?? "Program"} {program.weeks_count ? `- ${program.weeks_count}w` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Start date</label>
                  <input
                    type="date"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={programStartDate}
                    onChange={(event) => onProgramDateChange(event.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={programStatus === "saving" || !selectedProgramId || !programStartDate}
                  onClick={onApplyProgram}
                >
                  {programStatus === "saving"
                    ? "Assigning..."
                    : "Assign program (next 14 days)"}
                </Button>
                {programMessage ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                    {programMessage}
                  </div>
                ) : null}
                {activeProgram ? (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Active program</span>
                      <StatusPill status="active" />
                    </div>
                    <div className="mt-2 text-sm text-foreground">
                      {activeProgram.program_template?.name ?? "Program"}
                    </div>
                    <div className="mt-1">
                      Start date {activeProgram.start_date ?? "--"}
                    </div>
                    <Button
                      className="mt-3 w-full"
                      variant="secondary"
                      disabled={unassignStatus === "saving"}
                      onClick={onUnassignProgram}
                    >
                      {unassignStatus === "saving" ? "Unassigning..." : "Unassign program"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>Schedule workout</CardTitle>
            <p className="text-sm text-muted-foreground">
              Assign a one-off template to this client.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {templatesQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Workout template
                  </label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedTemplateId}
                    onChange={(event) => onTemplateChange(event.target.value)}
                  >
                    <option value="">Select a template</option>
                    {templatesQuery.data?.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}{" "}
                        {template.workout_type_tag ? ` - ${template.workout_type_tag}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Date</label>
                  <input
                    type="date"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={scheduledDate}
                    onChange={(event) => onDateChange(event.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={assignStatus === "saving" || !selectedTemplateId || !scheduledDate}
                  onClick={onAssign}
                >
                  {assignStatus === "saving" ? "Assigning..." : "Assign workout"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <DashboardCard
        title="Schedule (next 14 days)"
        subtitle="Planned sessions, recovery, and overrides."
      >
        {upcomingQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : upcomingQuery.data && upcomingQuery.data.length > 0 ? (
          <div className="space-y-3">
            {upcomingQuery.data.map((workout) => {
              const dateKey = workout.scheduled_date ?? "";
              const override = overrideByDate.get(dateKey);
              const isRestDay = workout.day_type === "rest";
              const title = isRestDay ? "Rest day" : workout.workout_template?.name ?? "Workout";
              const dateLabel = workout.scheduled_date
                ? new Date(workout.scheduled_date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "Scheduled";
              const canOverride = Boolean(workout.scheduled_date);
              return (
                <div
                  key={workout.id}
                  className="rounded-xl border border-border/70 bg-background/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{title}</div>
                      <div className="text-xs text-muted-foreground">{dateLabel}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={override ? "secondary" : "muted"} className="text-[10px] uppercase">
                        {override ? "Override" : "Scheduled"}
                      </Badge>
                      <StatusPill status={isRestDay ? "rest day" : workout.status ?? "planned"} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canOverride}
                      onClick={() => onOpenOverride(workout.scheduled_date ?? "")}
                    >
                      Override
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEditLoads(workout.id)}>
                      Edit loads
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(workout)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(workout.id)}>
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onStatusChange(workout.id, "completed")}
                    >
                      Mark completed
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(workout.id, "skipped")}
                    >
                      Skip
                    </Button>
                  </div>
                  {isRestDay ? (
                    <div className="mt-3 text-xs text-muted-foreground">Rest day.</div>
                  ) : workout.assigned_workout_exercises &&
                    workout.assigned_workout_exercises.length > 0 ? (
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {workout.assigned_workout_exercises.map((row) => {
                        const exerciseId = row.exercise?.id ?? "";
                        const lastSet = lastSetByWorkoutExercise.get(
                          `${workout.id}-${exerciseId}`
                        );
                        const performed =
                          lastSet &&
                          (typeof lastSet.reps === "number" || typeof lastSet.weight === "number")
                            ? `${lastSet.reps ?? "-"} reps @ ${lastSet.weight ?? "-"}`
                            : "No sets logged";
                        const label = row.exercise?.name ?? "Exercise";
                        const sets = row.sets ? `${row.sets}x` : "";
                        const reps = row.reps ?? "";
                        const repLine = sets || reps ? `${sets}${reps}` : "";
                        return (
                          <div key={row.id} className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">{label}</span>
                            <span>
                              {repLine ? `${repLine} - ` : ""}
                              {performed}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-muted-foreground">
                      No exercises in template yet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No workouts scheduled for the next 14 days.
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

function PtClientLogsTab() {
  return <PtClientPlaceholderTab title="logs" />;
}

function PtClientProgressTab() {
  return <PtClientPlaceholderTab title="progress" />;
}

function PtClientMessagesTab() {
  return <PtClientPlaceholderTab title="messages" />;
}

function PtClientNotesTab() {
  return <PtClientPlaceholderTab title="notes" />;
}

function PtClientPlaceholderTab({ title }: { title: string }) {
  return (
    <Card className="border-border/70 bg-card/80 xl:col-start-1">
      <CardHeader>
        <CardTitle className="capitalize">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">Section details coming soon.</p>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">No data yet for this tab.</p>
      </CardContent>
    </Card>
  );
}
