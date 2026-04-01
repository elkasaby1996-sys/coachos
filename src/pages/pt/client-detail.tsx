// @ts-nocheck
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Skeleton } from "../../components/ui/coachos/skeleton";
import { Input } from "../../components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import {
  Apple,
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { DashboardShell } from "../../components/pt/dashboard/DashboardShell";
import {
  DashboardCard,
  EmptyState,
  MiniSparkline,
  StatCard,
  StatusPill,
} from "../../components/ui/coachos";
import { supabase } from "../../lib/supabase";
import {
  getSupabaseErrorDetails,
  getSupabaseErrorMessage,
} from "../../lib/supabase-errors";
import { useAuth } from "../../lib/auth";
import {
  getClientLifecycleMeta,
  getClientLifecycleReason,
  getClientRiskFlagMeta,
  normalizeClientRiskFlags,
} from "../../lib/client-lifecycle";
import { getWorkspaceIdForUser } from "../../lib/workspace";
import { cn } from "../../lib/utils";
import { getProfileCompletion } from "../../lib/profile-completion";
import {
  getCoachActionLabel,
  logCoachActivity,
} from "../../lib/coach-activity";
import { formatRelativeTime } from "../../lib/relative-time";
import { addDaysToDateString, getTodayInTimezone } from "../../lib/date-utils";
import { getNextCheckinDueDate } from "../../lib/checkin-schedule";
import {
  checkinReviewStatusMap,
  getCheckinReviewState,
} from "../../lib/checkin-review";
import { resolveCheckinPhotoRows } from "../../lib/checkin-photos";
import { computeStreak, getLatestLogDate } from "../../lib/habits";
import { resolveBaselinePhotoRows } from "../../lib/baseline-photos";
import { PtClientOnboardingTab } from "../../features/pt-client-onboarding/components/pt-client-onboarding-tab";
import {
  buildPtOnboardingChecklist,
  getPtOnboardingStatusMeta,
  isReadyForOnboardingCompletion,
  ptOnboardingSelect,
} from "../../features/pt-client-onboarding/lib/pt-client-onboarding";

const tabs = [
  "overview",
  "onboarding",
  "workout",
  "nutrition",
  "logs",
  "progress",
  "checkins",
  "notes",
  "baseline",
  "habits",
] as const;

const workbenchTabs: Array<{
  value: Exclude<(typeof tabs)[number], "overview">;
  label: string;
}> = [
  { value: "onboarding", label: "Onboarding" },
  { value: "baseline", label: "Baseline" },
  { value: "workout", label: "Workout" },
  { value: "nutrition", label: "Nutrition" },
  { value: "checkins", label: "Check-ins" },
  { value: "progress", label: "Progress" },
  { value: "habits", label: "Habits" },
  { value: "logs", label: "Logs" },
  { value: "notes", label: "Notes" },
];

const workbenchTabIcons: Record<
  Exclude<(typeof tabs)[number], "overview">,
  ComponentType<{ className?: string }>
> = {
  onboarding: ClipboardCheck,
  workout: Rocket,
  nutrition: Apple,
  habits: Flame,
  progress: Sparkles,
  logs: CalendarDays,
  checkins: CheckCircle2,
  notes: MessageCircle,
  baseline: Moon,
};

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

const getFriendlyErrorMessage = () =>
  "Unable to load data right now. Please try again.";

const getErrorDetails = (error: unknown) => getSupabaseErrorDetails(error);

const formatListValue = (
  value: string[] | string | null | undefined,
  fallback: string,
) => {
  if (!value) return fallback;
  if (Array.isArray(value))
    return value.length > 0 ? value.join(", ") : fallback;
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

const formatShortDate = (
  value: string | null | undefined,
  fallback = "Not scheduled",
) => {
  if (!value) return fallback;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatShortDateTime = (
  value: string | null | undefined,
  fallback = "Not available",
) => {
  if (!value) return fallback;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const trainingTypeOptions = [
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
  { value: "in_person", label: "In person" },
];

const checkinFrequencyOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
];

const checkinTemplateStatusMap = {
  default: { label: "Default", variant: "muted" },
  override: { label: "Override", variant: "warning" },
  fallback: { label: "Fallback", variant: "secondary" },
} as const;

const getSingleRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

type PtClientProfile = {
  id: string;
  workspace_id: string | null;
  checkin_template_id?: string | null;
  checkin_frequency?: string | null;
  checkin_start_date?: string | null;
  created_at: string | null;
  display_name: string | null;
  goal: string | null;
  status: string | null;
  lifecycle_state: string | null;
  lifecycle_changed_at: string | null;
  paused_reason: string | null;
  churn_reason: string | null;
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

type ClientOperationalSummaryRow = {
  id: string;
  onboarding_status: string | null;
  onboarding_incomplete: boolean | null;
  last_activity_at: string | null;
  last_client_reply_at: string | null;
  overdue_checkins_count: number | null;
  has_overdue_checkin: boolean | null;
  risk_flags: string[] | null;
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
  storage_path: string | null;
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

type HabitMetricKey =
  | "calories"
  | "protein_g"
  | "carbs_g"
  | "fats_g"
  | "weight_value"
  | "steps"
  | "sleep_hours"
  | "energy"
  | "hunger"
  | "stress";

type CoachActivityRow = {
  id: string;
  action: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

type PtCoachNoteRow = {
  id: string;
  actor_user_id: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

type CheckinRow = {
  id: string;
  week_ending_saturday: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  pt_feedback: string | null;
  created_at: string | null;
};

type CheckinTemplateRow = {
  id: string;
  name: string | null;
  is_active?: boolean | null;
};

type CheckinPhotoRow = {
  id: string;
  checkin_id: string;
  client_id: string;
  url: string;
  storage_path: string;
  photo_type: string;
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

type PtWorkoutSessionRow = {
  id: string;
  assigned_workout_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  client_notes: string | null;
  assigned_workout: {
    id: string | null;
    status: string | null;
    workout_template: { id: string | null; name: string | null } | null;
  } | null;
};

type PtWorkoutSessionLogRow = {
  id: string;
  workout_session_id: string | null;
  exercise_id: string | null;
  set_number: number | null;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  is_completed: boolean | null;
  exercise: { id: string; name: string | null } | null;
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
  is_completed?: boolean | null;
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
  is_active?: boolean | null;
  updated_at?: string | null;
  program_template: {
    id: string;
    name: string | null;
    weeks_count: number | null;
  } | null;
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
  value_text: string | null;
  value_number: number | null;
  question: {
    question_text: string | null;
    prompt: string | null;
    sort_order?: number | null;
  } | null;
};

type UpcomingWorkoutRow = {
  id: string;
  status: string | null;
  day_type?: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  workout_template_id: string | null;
  workout_template: {
    id: string | null;
    name: string | null;
    workout_type_tag?: string | null;
  } | null;
  assigned_workout_exercises?: AssignedWorkoutExerciseRow[];
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
    if (tab === "plan") return "workout";
    if (tab && tabs.includes(tab as (typeof tabs)[number])) {
      return tab as (typeof tabs)[number];
    }
    return "workout";
  }, [location.search]);
  const [active, setActive] = useState<(typeof tabs)[number]>(initialTab);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">(
    "success",
  );

  useEffect(() => {
    setActive(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const current = params.get("tab") ?? "workout";
    if (current === active) return;
    params.set("tab", active);
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { replace: true },
    );
  }, [active, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (active !== "checkins") {
      setCheckinsPage(0);
    }
  }, [active]);

  const setActiveTab = (tab: string) => {
    if (!tabs.includes(tab as (typeof tabs)[number])) return;
    setActive(tab as (typeof tabs)[number]);
  };
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [checkinTemplateId, setCheckinTemplateId] = useState("");
  const [checkinTemplateStatus, setCheckinTemplateStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [checkinFrequency, setCheckinFrequency] = useState("weekly");
  const [checkinStartDate, setCheckinStartDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() =>
    formatDateKey(new Date()),
  );
  const [assignStatus, setAssignStatus] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [programStartDate, setProgramStartDate] = useState(() =>
    formatDateKey(new Date()),
  );
  const [programStatus, setProgramStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [programMessage, setProgramMessage] = useState<string | null>(null);
  const [unassignStatus, setUnassignStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState<string | null>(null);
  const [overrideTemplateId, setOverrideTemplateId] = useState("");
  const [overrideIsRest, setOverrideIsRest] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<"idle" | "saving">(
    "idle",
  );
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editWorkoutId, setEditWorkoutId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(() => formatDateKey(new Date()));
  const [editTemplateId, setEditTemplateId] = useState("");
  const [editStatus, setEditStatus] = useState<
    "planned" | "completed" | "skipped"
  >("planned");
  const [clientProfile, setClientProfile] = useState<PtClientProfile | null>(
    null,
  );
  const [adminTrainingType, setAdminTrainingType] = useState("");
  const [adminTags, setAdminTags] = useState("");
  const [adminStatus, setAdminStatus] = useState<"idle" | "saving">("idle");
  const [baselineNotes, setBaselineNotes] = useState("");
  const [baselineNotesStatus, setBaselineNotesStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [baselineNotesMessage, setBaselineNotesMessage] = useState<
    string | null
  >(null);
  const [onboardingReviewNotes, setOnboardingReviewNotes] = useState("");
  const [onboardingReviewStatus, setOnboardingReviewStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [onboardingReviewMessage, setOnboardingReviewMessage] = useState<
    string | null
  >(null);
  const [onboardingActionStatus, setOnboardingActionStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [onboardingActionMessage, setOnboardingActionMessage] = useState<
    string | null
  >(null);
  const baselineReviewLoggedRef = useRef<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedCheckin, setSelectedCheckin] = useState<CheckinRow | null>(
    null,
  );
  const [reviewTab, setReviewTab] = useState<"answers" | "photos" | "notes">(
    "answers",
  );
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackValidationMessage, setFeedbackValidationMessage] = useState<
    string | null
  >(null);
  const [feedbackStatus, setFeedbackStatus] = useState<
    "idle" | "saving_draft" | "marking_reviewed" | "error"
  >("idle");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [reviewPhotoLoadErrors, setReviewPhotoLoadErrors] = useState<
    Record<string, boolean>
  >({});
  const [reviewPhotoPreview, setReviewPhotoPreview] =
    useState<CheckinPhotoRow | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditStatus, setProfileEditStatus] = useState<"idle" | "saving">(
    "idle",
  );
  const [profileEditForm, setProfileEditForm] = useState({
    display_name: "",
    goal: "",
    training_type: "",
    timezone: "",
  });
  const [lifecycleDialogOpen, setLifecycleDialogOpen] = useState(false);
  const [lifecycleTargetState, setLifecycleTargetState] = useState("active");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleValidationMessage, setLifecycleValidationMessage] = useState<
    string | null
  >(null);
  const [lifecycleActionStatus, setLifecycleActionStatus] = useState<
    "idle" | "saving"
  >("idle");
  const selectedCheckinAnswersQuery = useQuery({
    queryKey: ["pt-checkin-answers", selectedCheckin?.id],
    enabled: !!selectedCheckin?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_answers")
        .select(
          "id, value_text, value_number, question:checkin_questions(question_text, prompt, sort_order)",
        )
        .eq("checkin_id", selectedCheckin?.id ?? "");
      if (error) throw error;
      const rows = (data ?? []) as Array<
        Omit<CheckinAnswerRow, "question"> & {
          question:
            | CheckinAnswerRow["question"]
            | CheckinAnswerRow["question"][]
            | null;
        }
      >;
      return rows
        .map((row) => ({
          ...row,
          question: getSingleRelation(row.question),
        }))
        .sort(
          (a, b) =>
            (a.question?.sort_order ?? 0) - (b.question?.sort_order ?? 0),
        );
    },
  });
  const selectedCheckinPhotosQuery = useQuery({
    queryKey: ["pt-checkin-photos", selectedCheckin?.id],
    enabled: !!selectedCheckin?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_photos")
        .select("id, checkin_id, client_id, url, storage_path, photo_type")
        .eq("checkin_id", selectedCheckin?.id ?? "");
      if (error) throw error;
      return resolveCheckinPhotoRows((data ?? []) as CheckinPhotoRow[]);
    },
  });
  const [loadsOpen, setLoadsOpen] = useState(false);
  const [loadsError, setLoadsError] = useState<string | null>(null);
  const [loadsStatus, setLoadsStatus] = useState<"idle" | "saving">("idle");
  const [selectedAssignedWorkoutId, setSelectedAssignedWorkoutId] = useState<
    string | null
  >(null);
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
  const [isOverviewCollapsed, setIsOverviewCollapsed] = useState(true);
  const [sessionDetailOpen, setSessionDetailOpen] = useState(false);
  const [isWorkbenchCollapsed, setIsWorkbenchCollapsed] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [checkinsPage, setCheckinsPage] = useState(0);
  const checkinsPageSize = 12;
  const [checkinsList, setCheckinsList] = useState<CheckinRow[]>([]);

  const today = useMemo(() => new Date(), []);
  const isDev = import.meta.env.DEV;
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const scheduleStartKey = useMemo(
    () => addDaysToDateString(todayKey, -6),
    [todayKey],
  );
  const scheduleEndKey = useMemo(
    () => addDaysToDateString(todayKey, 7),
    [todayKey],
  );
  const planEndKey = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + 14);
    return formatDateKey(date);
  }, [today]);
  const showLogs = active === "logs";

  const workspaceQuery = useQuery({
    queryKey: ["pt-workspace", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const workspaceId = await getWorkspaceIdForUser(user?.id ?? "");
      if (!workspaceId) throw new Error("Workspace not found for this PT.");
      return workspaceId;
    },
  });

  const workspaceDetailsQuery = useQuery({
    queryKey: ["pt-workspace-details", workspaceQuery.data],
    enabled: !!workspaceQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, default_checkin_template_id")
        .eq("id", workspaceQuery.data ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        default_checkin_template_id: string | null;
      } | null;
    },
  });

  const checkinTemplatesQuery = useQuery({
    queryKey: ["pt-checkin-templates", workspaceQuery.data],
    enabled: !!workspaceQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_templates")
        .select("id, workspace_id, name, description, is_active, created_at")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CheckinTemplateRow[];
    },
  });

  const clientQuery = useQuery({
    queryKey: ["pt-client", clientId, workspaceQuery.data],
    enabled: !!clientId && !!workspaceQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, workspace_id, checkin_template_id, checkin_frequency, checkin_start_date, created_at, display_name, goal, status, lifecycle_state, lifecycle_changed_at, paused_reason, churn_reason, injuries, limitations, height_cm, current_weight, days_per_week, dob, training_type, timezone, phone, location, unit_preference, gender, gym_name, tags, photo_url, updated_at",
        )
        .eq("id", clientId ?? "")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Client not found in this workspace.");
      return data;
    },
  });

  const clientOperationalQuery = useQuery({
    queryKey: ["pt-client-operational-summary", clientId, workspaceQuery.data],
    enabled: !!clientId && !!workspaceQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pt_clients_summary", {
        p_workspace_id: workspaceQuery.data,
        p_limit: 1000,
        p_offset: 0,
      });
      if (error) throw error;
      return (
        ((data ?? []) as ClientOperationalSummaryRow[]).find(
          (row) => row.id === clientId,
        ) ?? null
      );
    },
  });

  const onboardingQuery = useQuery({
    queryKey: ["pt-client-onboarding", clientId, workspaceQuery.data],
    enabled: !!clientId && !!workspaceQuery.data,
    queryFn: async () => {
      const { error: ensureError } = await supabase.rpc(
        "ensure_workspace_client_onboarding",
        {
          p_client_id: clientId ?? "",
        },
      );
      if (ensureError) throw ensureError;

      const { data, error } = await supabase
        .from("workspace_client_onboardings")
        .select(ptOnboardingSelect)
        .eq("workspace_id", workspaceQuery.data ?? "")
        .eq("client_id", clientId ?? "")
        .returns<WorkspaceClientOnboardingRow>()
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as WorkspaceClientOnboardingRow | null;
    },
  });

  const ptSessionsQuery = useQuery({
    queryKey: ["pt-client-sessions", clientId],
    enabled: !!clientId && showLogs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select(
          "id, assigned_workout_id, started_at, completed_at, created_at, client_notes, assigned_workout:assigned_workouts(id, status, workout_template:workout_templates(id, name))",
        )
        .eq("client_id", clientId ?? "")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const rows = (data ?? []) as Array<
        Omit<PtWorkoutSessionRow, "assigned_workout"> & {
          assigned_workout:
            | (Omit<
                NonNullable<PtWorkoutSessionRow["assigned_workout"]>,
                "workout_template"
              > & {
                workout_template:
                  | NonNullable<
                      NonNullable<
                        PtWorkoutSessionRow["assigned_workout"]
                      >["workout_template"]
                    >
                  | NonNullable<
                      NonNullable<
                        PtWorkoutSessionRow["assigned_workout"]
                      >["workout_template"]
                    >[]
                  | null;
              })
            | (Omit<
                NonNullable<PtWorkoutSessionRow["assigned_workout"]>,
                "workout_template"
              > & {
                workout_template:
                  | NonNullable<
                      NonNullable<
                        PtWorkoutSessionRow["assigned_workout"]
                      >["workout_template"]
                    >
                  | NonNullable<
                      NonNullable<
                        PtWorkoutSessionRow["assigned_workout"]
                      >["workout_template"]
                    >[]
                  | null;
              })[]
            | null;
        }
      >;
      return rows.map((row) => {
        const assignedWorkout = getSingleRelation(row.assigned_workout);
        return {
          ...row,
          assigned_workout: assignedWorkout
            ? {
                ...assignedWorkout,
                workout_template: getSingleRelation(
                  assignedWorkout.workout_template,
                ),
              }
            : null,
        };
      });
    },
  });

  const ptSessionIds = useMemo(
    () => (ptSessionsQuery.data ?? []).map((row) => row.id),
    [ptSessionsQuery.data],
  );

  const ptSessionVolumeLogsQuery = useQuery({
    queryKey: ["pt-client-session-logs", ptSessionIds],
    enabled: ptSessionIds.length > 0 && showLogs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select("workout_session_id, reps, weight, is_completed")
        .in("workout_session_id", ptSessionIds);
      if (error) throw error;
      return (data ?? []) as WorkoutSetLogRow[];
    },
  });

  const sessionVolumeById = useMemo(() => {
    const map = new Map<string, number>();
    (ptSessionVolumeLogsQuery.data ?? []).forEach((log) => {
      if (!log.workout_session_id) return;
      if (!log.is_completed) return;
      const reps = typeof log.reps === "number" ? log.reps : null;
      const weight = typeof log.weight === "number" ? log.weight : null;
      if (!reps || !weight) return;
      map.set(
        log.workout_session_id,
        (map.get(log.workout_session_id) ?? 0) + reps * weight,
      );
    });
    return map;
  }, [ptSessionVolumeLogsQuery.data]);

  const selectedSession = useMemo(
    () =>
      (ptSessionsQuery.data ?? []).find(
        (session) => session.id === selectedSessionId,
      ) ?? null,
    [ptSessionsQuery.data, selectedSessionId],
  );

  const sessionDetailQuery = useQuery({
    queryKey: ["pt-client-session-detail", selectedSessionId],
    enabled: !!selectedSessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select(
          "id, workout_session_id, exercise_id, set_number, reps, weight, rpe, is_completed, exercise:exercises(id, name)",
        )
        .eq("workout_session_id", selectedSessionId ?? "")
        .order("exercise_id", { ascending: true })
        .order("set_number", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<
        Omit<PtWorkoutSessionLogRow, "exercise"> & {
          exercise:
            | PtWorkoutSessionLogRow["exercise"]
            | PtWorkoutSessionLogRow["exercise"][]
            | null;
        }
      >;
      return rows.map((row) => ({
        ...row,
        exercise: getSingleRelation(row.exercise),
      }));
    },
  });

  const sessionDetailByExercise = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; rows: PtWorkoutSessionLogRow[] }
    >();
    (sessionDetailQuery.data ?? []).forEach((log) => {
      const exerciseId = log.exercise_id ?? "unknown";
      const name = log.exercise?.name ?? "Exercise";
      if (!map.has(exerciseId)) {
        map.set(exerciseId, { id: exerciseId, name, rows: [] });
      }
      map.get(exerciseId)?.rows.push(log);
    });
    return Array.from(map.values());
  }, [sessionDetailQuery.data]);

  const habitsToday = useMemo(
    () => getTodayInTimezone(clientQuery.data?.timezone ?? null),
    [clientQuery.data?.timezone],
  );
  const habitsStart = useMemo(
    () => addDaysToDateString(habitsToday, -6),
    [habitsToday],
  );
  const habitsWeekStart = useMemo(
    () => addDaysToDateString(habitsToday, -6),
    [habitsToday],
  );

  useEffect(() => {
    if (!clientQuery.data) return;
    const data = clientQuery.data as PtClientProfile;
    setClientProfile(data);
    setAdminTrainingType(data.training_type ?? "");
    setAdminTags(formatListValue(data.tags ?? null, ""));
    setCheckinTemplateId(data.checkin_template_id ?? "");
    setCheckinFrequency(data.checkin_frequency ?? "weekly");
    setCheckinStartDate(data.checkin_start_date ?? "");
  }, [clientQuery.data]);

  const availableCheckinTemplates = useMemo(() => {
    const rows = checkinTemplatesQuery.data ?? [];
    return rows.filter(
      (row) =>
        row.is_active !== false ||
        row.id === checkinTemplateId ||
        row.id === workspaceDetailsQuery.data?.default_checkin_template_id,
    );
  }, [
    checkinTemplateId,
    checkinTemplatesQuery.data,
    workspaceDetailsQuery.data?.default_checkin_template_id,
  ]);

  const latestActiveCheckinTemplate = useMemo(() => {
    const rows = checkinTemplatesQuery.data ?? [];
    return rows.find((row) => row.is_active !== false) ?? null;
  }, [checkinTemplatesQuery.data]);

  const assignedCheckinTemplate =
    availableCheckinTemplates.find(
      (template) => template.id === checkinTemplateId,
    ) ?? null;
  const defaultCheckinTemplate =
    availableCheckinTemplates.find(
      (template) =>
        template.id === workspaceDetailsQuery.data?.default_checkin_template_id,
    ) ?? null;
  const effectiveCheckinTemplate =
    assignedCheckinTemplate ??
    defaultCheckinTemplate ??
    latestActiveCheckinTemplate ??
    null;
  const checkinTemplateStatusKey = checkinTemplateId
    ? "override"
    : defaultCheckinTemplate
      ? "default"
      : effectiveCheckinTemplate
        ? "fallback"
        : "default";

  const templatesQuery = useQuery({
    queryKey: ["workout-templates", workspaceQuery.data],
    enabled: !!workspaceQuery.data && active === "workout",
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
    enabled:
      !!workspaceQuery.data &&
      (active === "workout" || active === "onboarding"),
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
    enabled: !!clientId && (active === "workout" || active === "onboarding"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_programs")
        .select(
          "id, start_date, program_template_id, is_active, program_template:program_templates(id, name, weeks_count)",
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

  const pausedProgramQuery = useQuery({
    queryKey: ["client-program-paused", clientId],
    enabled: !!clientId && (active === "workout" || active === "onboarding"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_programs")
        .select(
          "id, start_date, program_template_id, is_active, updated_at, program_template:program_templates(id, name, weeks_count)",
        )
        .eq("client_id", clientId ?? "")
        .eq("is_active", false)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ClientProgramRow | null;
    },
  });

  const pausedProgram = pausedProgramQuery.data ?? null;

  const programOverridesQuery = useQuery({
    queryKey: [
      "client-program-overrides",
      activeProgram?.id,
      todayKey,
      planEndKey,
    ],
    enabled: !!activeProgram?.id && active === "workout",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_program_overrides")
        .select(
          "id, override_date, workout_template_id, is_rest, notes, workout_template:workout_templates(id, name)",
        )
        .eq("client_program_id", activeProgram?.id ?? "")
        .gte("override_date", todayKey)
        .lte("override_date", planEndKey)
        .order("override_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<
        Omit<ProgramOverrideRow, "workout_template"> & {
          workout_template:
            | ProgramOverrideRow["workout_template"]
            | ProgramOverrideRow["workout_template"][]
            | null;
        }
      >;
      return rows.map((row) => ({
        ...row,
        workout_template: getSingleRelation(row.workout_template),
      }));
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
    enabled: !!clientId && (active === "workout" || active === "overview"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, day_type, scheduled_date, created_at, completed_at, workout_template_id, workout_template:workout_templates(id, name, workout_type_tag)",
        )
        .eq("client_id", clientId ?? "")
        .gte("scheduled_date", todayKey)
        .lte("scheduled_date", planEndKey)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<
        Omit<UpcomingWorkoutRow, "workout_template"> & {
          workout_template:
            | UpcomingWorkoutRow["workout_template"]
            | UpcomingWorkoutRow["workout_template"][]
            | null;
        }
      >;
      return rows.map((row) => ({
        ...row,
        workout_template: getSingleRelation(row.workout_template),
      }));
    },
  });

  const upcomingAssignedWorkoutIds = useMemo(
    () => (upcomingQuery.data ?? []).map((workout) => workout.id),
    [upcomingQuery.data],
  );

  const workoutSessionsQuery = useQuery({
    queryKey: ["workout-sessions", upcomingAssignedWorkoutIds],
    enabled: upcomingAssignedWorkoutIds.length > 0 && active === "overview",
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
    [workoutSessionsQuery.data],
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
    enabled: workoutSessionIds.length > 0 && active === "overview",
    queryFn: async () => {
      if (workoutSessionIds.length === 0) return [];
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select(
          "id, workout_session_id, exercise_id, set_number, reps, weight, rpe, created_at",
        )
        .in("workout_session_id", workoutSessionIds)
        .order("created_at", { ascending: false })
        .limit(500);
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
    enabled: !!selectedAssignedWorkoutId && active === "workout" && loadsOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workout_exercises")
        .select(
          "id, assigned_workout_id, load_notes, is_completed, sets, reps, rest_seconds, tempo, rpe, notes, exercise:exercises(id, name)",
        )
        .eq("assigned_workout_id", selectedAssignedWorkoutId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<
        Omit<AssignedWorkoutExerciseRow, "exercise"> & {
          exercise:
            | AssignedWorkoutExerciseRow["exercise"]
            | AssignedWorkoutExerciseRow["exercise"][]
            | null;
        }
      >;
      return rows.map((row) => ({
        ...row,
        exercise: getSingleRelation(row.exercise),
      }));
    },
  });

  const baselineEntryQuery = useQuery({
    queryKey: [
      "pt-client-baseline-entry",
      clientId,
      onboardingQuery.data?.initial_baseline_entry_id ?? null,
      active,
    ],
    enabled: !!clientId && (active === "baseline" || active === "onboarding"),
    queryFn: async () => {
      let query = supabase
        .from("baseline_entries")
        .select("id, submitted_at, coach_notes")
        .eq("client_id", clientId ?? "")
        .eq("status", "submitted");
      if (onboardingQuery.data?.initial_baseline_entry_id) {
        query = query.eq("id", onboardingQuery.data.initial_baseline_entry_id);
      } else {
        query = query.order("submitted_at", { ascending: false }).limit(1);
      }
      const { data, error } = await query.maybeSingle();
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

  useEffect(() => {
    setOnboardingReviewNotes(onboardingQuery.data?.coach_review_notes ?? "");
  }, [onboardingQuery.data?.coach_review_notes]);

  const baselineMetricsQuery = useQuery({
    queryKey: ["pt-client-baseline-metrics", baselineId],
    enabled: !!baselineId && (active === "baseline" || active === "onboarding"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_metrics")
        .select(
          "weight_kg, height_cm, body_fat_pct, waist_cm, chest_cm, hips_cm, thigh_cm, arm_cm, resting_hr, vo2max",
        )
        .eq("baseline_id", baselineId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BaselineMetrics | null;
    },
  });

  const baselineMarkersQuery = useQuery({
    queryKey: ["pt-client-baseline-markers", baselineId],
    enabled: !!baselineId && (active === "baseline" || active === "onboarding"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_marker_values")
        .select(
          "value_number, value_text, template:baseline_marker_templates(name, unit_label)",
        )
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
          ? (row.template[0] ?? null)
          : (row.template ?? null),
      })) as BaselineMarkerRow[];
    },
  });

  const baselinePhotosQuery = useQuery({
    queryKey: ["pt-client-baseline-photos", baselineId],
    enabled: !!baselineId && (active === "baseline" || active === "onboarding"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_photos")
        .select("photo_type, url, storage_path")
        .eq("baseline_id", baselineId ?? "");
      if (error) throw error;
      return resolveBaselinePhotoRows((data ?? []) as BaselinePhotoRow[]);
    },
  });

  const checkinsQuery = useQuery({
    queryKey: ["pt-client-checkins", clientId, active, checkinsPage],
    enabled: !!clientId && (active === "checkins" || active === "overview"),
    queryFn: async () => {
      const { error: ensureError } = await supabase.rpc(
        "ensure_client_checkins",
        {
          p_client_id: clientId ?? "",
          p_range_start: todayKey,
          p_range_end: addDaysToDateString(todayKey, 120),
        },
      );
      if (ensureError) throw ensureError;

      const base = supabase
        .from("checkins")
        .select(
          "id, week_ending_saturday, submitted_at, reviewed_at, reviewed_by_user_id, pt_feedback, created_at",
        )
        .eq("client_id", clientId ?? "")
        .order("week_ending_saturday", { ascending: false });
      if (active === "overview") {
        const { data, error } = await base.limit(6);
        if (error) throw error;
        return (data ?? []) as CheckinRow[];
      }
      const { data, error } = await base.range(
        checkinsPage * checkinsPageSize,
        checkinsPage * checkinsPageSize + checkinsPageSize - 1,
      );
      if (error) throw error;
      return (data ?? []) as CheckinRow[];
    },
  });

  useEffect(() => {
    if (active !== "checkins") {
      setCheckinsList(checkinsQuery.data ?? []);
      return;
    }
    if (!checkinsQuery.data) return;
    if (checkinsPage === 0) {
      setCheckinsList(checkinsQuery.data);
      return;
    }
    setCheckinsList((prev) => {
      const next = [...prev];
      const existingIds = new Set(prev.map((row) => row.id));
      checkinsQuery.data?.forEach((row) => {
        if (!existingIds.has(row.id)) {
          next.push(row);
        }
      });
      return next;
    });
  }, [checkinsPage, checkinsQuery.data, active]);

  const checkinsRows = useMemo(
    () => (active === "checkins" ? checkinsList : (checkinsQuery.data ?? [])),
    [active, checkinsList, checkinsQuery.data],
  );
  const checkinsCanLoadMore =
    active === "checkins" &&
    (checkinsQuery.data?.length ?? 0) === checkinsPageSize;

  const habitsQuery = useQuery({
    queryKey: ["pt-client-habits", clientId, habitsStart, habitsToday],
    enabled:
      !!clientId &&
      !!habitsToday &&
      (active === "habits" || active === "overview"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select(
          "id, log_date, calories, protein_g, carbs_g, fats_g, weight_value, weight_unit, sleep_hours, steps, energy, hunger, stress, notes",
        )
        .eq("client_id", clientId ?? "")
        .gte("log_date", habitsStart)
        .lte("log_date", habitsToday)
        .order("log_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HabitLog[];
    },
  });

  const habitsAnyQuery = useQuery({
    queryKey: ["pt-client-habits-any", clientId],
    enabled: !!clientId && (active === "habits" || active === "overview"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select("id")
        .eq("client_id", clientId ?? "")
        .limit(1);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string }>;
    },
  });

  const habitsStreakQuery = useQuery({
    queryKey: ["pt-client-habits-streak", clientId, habitsToday],
    enabled:
      !!clientId &&
      !!habitsToday &&
      (active === "habits" || active === "overview"),
    queryFn: async () => {
      const streakStart = addDaysToDateString(habitsToday, -29);
      const { data, error } = await supabase
        .from("habit_logs")
        .select("log_date")
        .eq("client_id", clientId ?? "")
        .gte("log_date", streakStart)
        .lte("log_date", habitsToday)
        .order("log_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ log_date: string }>;
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
          "id, log_date, calories, protein_g, carbs_g, fats_g, weight_value, weight_unit, sleep_hours, steps, energy, hunger, stress, notes",
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
    enabled: !!clientId && !!workspaceQuery.data,
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
      },
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
      queryKey: [
        "pt-client-schedule-week",
        clientId,
        workspaceQuery.data ?? null,
        scheduleStartKey,
        scheduleEndKey,
      ],
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
    await queryClient.invalidateQueries({
      queryKey: ["client-program-active", clientId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["client-program-paused", clientId],
    });
    await queryClient.invalidateQueries({
      queryKey: [
        "pt-client-schedule-week",
        clientId,
        workspaceQuery.data ?? null,
        scheduleStartKey,
        scheduleEndKey,
      ],
    });
    await queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] });
    await queryClient.invalidateQueries({
      queryKey: [
        "client-program-overrides",
        activeProgram?.id,
        todayKey,
        planEndKey,
      ],
    });
  };

  const invalidateProgramAndSchedule = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["client-program-active", clientId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["client-program-paused", clientId],
    });
    await queryClient.invalidateQueries({
      queryKey: [
        "pt-client-schedule-week",
        clientId,
        workspaceQuery.data ?? null,
        scheduleStartKey,
        scheduleEndKey,
      ],
    });
    await queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] });
  };

  const handlePauseProgram = async () => {
    if (!clientId || !activeProgram?.id) return;
    const confirmed = window.confirm("Pause this client's active program?");
    if (!confirmed) return;
    setProgramStatus("saving");
    setProgramMessage(null);
    try {
      const { error: pauseProgramError } = await supabase
        .from("client_programs")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", activeProgram.id);
      if (pauseProgramError) throw pauseProgramError;

      if (activeProgram.program_template_id) {
        const { error: pauseAssignmentError } = await supabase
          .from("client_program_assignments")
          .update({ is_active: false })
          .eq("client_id", clientId)
          .eq("program_id", activeProgram.program_template_id)
          .eq("is_active", true);
        if (pauseAssignmentError && pauseAssignmentError.code !== "42P01") {
          throw pauseAssignmentError;
        }
      }

      setProgramStatus("idle");
      setProgramMessage("Program paused.");
      setToastVariant("success");
      setToastMessage("Program paused");
      await invalidateProgramAndSchedule();
    } catch (error) {
      setProgramStatus("error");
      setProgramMessage(getErrorDetails(error).message);
      setToastVariant("error");
      setToastMessage(getErrorDetails(error).message);
    }
  };

  const handleResumeProgram = async () => {
    if (!clientId || !pausedProgram?.id || !pausedProgram.program_template_id)
      return;
    setProgramStatus("saving");
    setProgramMessage(null);
    try {
      const { error: deactivateOthersError } = await supabase
        .from("client_programs")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("client_id", clientId)
        .eq("is_active", true);
      if (deactivateOthersError) throw deactivateOthersError;

      const { error: resumeProgramError } = await supabase
        .from("client_programs")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", pausedProgram.id);
      if (resumeProgramError) throw resumeProgramError;

      const { error: deactivateAssignmentsError } = await supabase
        .from("client_program_assignments")
        .update({ is_active: false })
        .eq("client_id", clientId)
        .eq("is_active", true);
      if (
        deactivateAssignmentsError &&
        deactivateAssignmentsError.code !== "42P01"
      ) {
        throw deactivateAssignmentsError;
      }

      const { error: resumeAssignmentError } = await supabase
        .from("client_program_assignments")
        .update({ is_active: true })
        .eq("client_id", clientId)
        .eq("program_id", pausedProgram.program_template_id);
      if (resumeAssignmentError && resumeAssignmentError.code !== "42P01") {
        throw resumeAssignmentError;
      }

      setProgramStatus("idle");
      setProgramMessage("Program resumed.");
      setToastVariant("success");
      setToastMessage("Program resumed");
      await invalidateProgramAndSchedule();
    } catch (error) {
      setProgramStatus("error");
      setProgramMessage(getErrorDetails(error).message);
      setToastVariant("error");
      setToastMessage(getErrorDetails(error).message);
    }
  };

  const handleSwitchProgramMidCycle = async () => {
    if (!clientId || !selectedProgramId) return;
    const confirmed = window.confirm("Switch program from today?");
    if (!confirmed) return;
    setProgramStatus("saving");
    setProgramMessage(null);
    const { data, error } = await supabase.rpc("assign_program_to_client", {
      p_client_id: clientId,
      p_program_id: selectedProgramId,
      p_start_date: todayKey,
      p_days_ahead: 14,
    });
    if (error) {
      const message = getErrorDetails(error).message;
      setProgramStatus("error");
      setProgramMessage(message);
      setToastVariant("error");
      setToastMessage(message);
      return;
    }
    setProgramStatus("idle");
    const updatedCount = typeof data === "number" ? data : null;
    setProgramMessage(
      updatedCount
        ? `Program switched. ${updatedCount} day${updatedCount === 1 ? "" : "s"} updated.`
        : "Program switched.",
    );
    setToastVariant("success");
    setToastMessage("Program switched from today");
    setProgramStartDate(todayKey);
    await invalidateProgramAndSchedule();
  };

  const handleUnassignProgram = async () => {
    const targetProgram = activeProgram ?? pausedProgram;
    if (!clientId || !targetProgram?.id) return;
    const confirmed = window.confirm("Unassign this program for this client?");
    if (!confirmed) return;
    setUnassignStatus("saving");
    setProgramMessage(null);
    try {
      if (targetProgram.program_template_id) {
        const { error: deleteError } = await supabase
          .from("assigned_workouts")
          .delete()
          .eq("client_id", clientId)
          .eq("program_id", targetProgram.program_template_id)
          .gte("scheduled_date", todayKey);

        if (deleteError) {
          throw deleteError;
        }
      }

      if (targetProgram.program_template_id) {
        const { error: assignmentDeleteError } = await supabase
          .from("client_program_assignments")
          .delete()
          .eq("client_id", clientId)
          .eq("program_id", targetProgram.program_template_id);
        if (assignmentDeleteError && assignmentDeleteError.code !== "42P01") {
          throw assignmentDeleteError;
        }
      }

      const { error: overrideDeleteError } = await supabase
        .from("client_program_overrides")
        .delete()
        .eq("client_program_id", targetProgram.id);
      if (overrideDeleteError && overrideDeleteError.code !== "42P01") {
        throw overrideDeleteError;
      }

      const { error: programDeleteError } = await supabase
        .from("client_programs")
        .delete()
        .eq("id", targetProgram.id);
      if (programDeleteError && programDeleteError.code !== "42P01") {
        throw programDeleteError;
      }

      await queryClient.invalidateQueries({
        queryKey: ["client-program-active", clientId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["client-program-paused", clientId],
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "client-program-overrides",
          targetProgram.id,
          todayKey,
          planEndKey,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "assigned-workouts-upcoming",
          clientId,
          todayKey,
          planEndKey,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "pt-client-schedule-week",
          clientId,
          workspaceQuery.data ?? null,
          scheduleStartKey,
          scheduleEndKey,
        ],
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
      (row) => row.override_date === date,
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
      { onConflict: "client_program_id,override_date" },
    );

    if (error) {
      const details = getErrorDetails(error);
      setOverrideError(`${details.code}: ${details.message}`);
      setOverrideStatus("idle");
      return;
    }

    const anchorStart =
      activeProgram.start_date ?? programStartDate ?? todayKey;
    const horizonDays = Math.max(14, diffDays(anchorStart, todayKey) + 14);
    const { error: applyError } = await supabase.rpc(
      "apply_program_to_client",
      {
        p_client_id: clientId,
        p_program_template_id: activeProgram.program_template_id,
        p_start_date: anchorStart,
        p_horizon_days: horizonDays,
      },
    );
    if (applyError) {
      const details = getErrorDetails(applyError);
      setOverrideError(`${details.code}: ${details.message}`);
      setOverrideStatus("idle");
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: [
        "client-program-overrides",
        activeProgram.id,
        todayKey,
        planEndKey,
      ],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, planEndKey],
    });

    setOverrideStatus("idle");
    setOverrideOpen(false);
  };

  const handleStatusUpdate = async (
    id: string,
    status: "completed" | "skipped",
  ) => {
    const payload =
      status === "completed"
        ? { status, completed_at: new Date().toISOString() }
        : { status };
    const { error } = await supabase
      .from("assigned_workouts")
      .update(payload)
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
      queryKey: [
        "pt-client-schedule-week",
        clientId,
        workspaceQuery.data ?? null,
        scheduleStartKey,
        scheduleEndKey,
      ],
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
    setEditStatus(
      (workout.status as "planned" | "completed" | "skipped") ?? "planned",
    );
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
      queryKey: [
        "pt-client-schedule-week",
        clientId,
        workspaceQuery.data ?? null,
        scheduleStartKey,
        scheduleEndKey,
      ],
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
    const { error } = await supabase
      .from("assigned_workouts")
      .delete()
      .eq("id", editWorkoutId);
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
      queryKey: [
        "pt-client-schedule-week",
        clientId,
        workspaceQuery.data ?? null,
        scheduleStartKey,
        scheduleEndKey,
      ],
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
      queryKey: [
        "pt-client-schedule-week",
        clientId,
        workspaceQuery.data ?? null,
        scheduleStartKey,
        scheduleEndKey,
      ],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-today", clientId, todayKey],
    });
    await queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] });
    setAssignStatus("idle");
    setAssignMessage("Workout rescheduled");
  };

  const clientSnapshot =
    clientProfile ?? (clientQuery.data as PtClientProfile | null);
  const completion = useMemo(
    () => getProfileCompletion(clientSnapshot),
    [clientSnapshot],
  );
  const missingFields = useMemo(() => {
    if (!clientSnapshot) return [];
    const missing: string[] = [];
    const hasPhotoOrName = Boolean(
      clientSnapshot.photo_url || clientSnapshot.display_name,
    );
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
    [habitsQuery.data],
  );
  const habitStreakDates = useMemo(
    () => (habitsStreakQuery.data ?? []).map((log) => log.log_date),
    [habitsStreakQuery.data],
  );

  const habitTrends = useMemo(() => {
    const logs = habitsQuery.data ?? [];
    const last7Logs = logs.filter(
      (log) => log.log_date >= habitsWeekStart && log.log_date <= habitsToday,
    );
    const daysLogged = last7Logs.length;
    const avg = (values: Array<number | null | undefined>) => {
      const filtered = values.filter(
        (value) => typeof value === "number",
      ) as number[];
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
    const weightUnit =
      weightLogs.find((log) => log.weight_unit)?.weight_unit ?? null;
    const weightChange =
      weightLogs.length >= 2
        ? (weightLogs[weightLogs.length - 1].weight_value ?? 0) -
          (weightLogs[0].weight_value ?? 0)
        : null;

    return {
      daysLogged,
      avgSteps,
      avgSleep,
      avgProtein,
      weightChange,
      weightUnit,
    };
  }, [habitsQuery.data, habitsToday, habitsWeekStart]);

  const habitStreak = useMemo(
    () => computeStreak(habitStreakDates, habitsToday, 30),
    [habitStreakDates, habitsToday],
  );
  const lastHabitLogDate = useMemo(
    () => getLatestLogDate(habitLogDates),
    [habitLogDates],
  );

  const adherenceStat = useMemo(() => {
    if (!habitsQuery.data) return null;
    const daysLogged = habitTrends.daysLogged;
    return Math.round((daysLogged / 7) * 100);
  }, [habitTrends.daysLogged, habitsQuery.data]);

  const lastCheckin = useMemo(() => {
    if (!checkinsRows || checkinsRows.length === 0) return null;
    const latest = checkinsRows[0];
    return latest.submitted_at ?? latest.week_ending_saturday ?? null;
  }, [checkinsRows]);

  const checkinStatus = useMemo(() => {
    if (!checkinsRows || checkinsRows.length === 0) return null;
    const latest = checkinsRows[0];
    return checkinReviewStatusMap[getCheckinReviewState(latest, todayKey)]
      .label;
  }, [checkinsRows, todayKey]);

  const lastWorkout = useMemo(() => {
    if (workoutSetLogsQuery.data && workoutSetLogsQuery.data.length > 0) {
      return workoutSetLogsQuery.data[0].created_at ?? null;
    }
    const completed = (upcomingQuery.data ?? []).find(
      (row) => row.status === "completed",
    );
    return completed?.completed_at ?? completed?.scheduled_date ?? null;
  }, [workoutSetLogsQuery.data, upcomingQuery.data]);

  const lastWorkoutStatus = useMemo(() => {
    if (workoutSetLogsQuery.data && workoutSetLogsQuery.data.length > 0)
      return "Completed";
    const completed = (upcomingQuery.data ?? []).find(
      (row) => row.status === "completed",
    );
    if (completed) return "Completed";
    const planned = (upcomingQuery.data ?? [])[0];
    return planned ? "Planned" : null;
  }, [workoutSetLogsQuery.data, upcomingQuery.data]);

  const lastSeen = useMemo(() => {
    if (clientSnapshot?.updated_at)
      return formatRelativeTime(clientSnapshot.updated_at);
    if (lastHabitLogDate) return formatRelativeTime(lastHabitLogDate);
    return null;
  }, [clientSnapshot?.updated_at, lastHabitLogDate]);

  const joinedLabel = useMemo(() => {
    const joinedAt =
      clientSnapshot?.created_at ?? clientSnapshot?.updated_at ?? null;
    return joinedAt ? formatRelativeTime(joinedAt) : null;
  }, [clientSnapshot?.created_at, clientSnapshot?.updated_at]);
  const lifecycleReasonLabel = useMemo(
    () =>
      getClientLifecycleReason({
        lifecycleState: clientSnapshot?.lifecycle_state,
        pausedReason: clientSnapshot?.paused_reason,
        churnReason: clientSnapshot?.churn_reason,
      }),
    [
      clientSnapshot?.churn_reason,
      clientSnapshot?.lifecycle_state,
      clientSnapshot?.paused_reason,
    ],
  );
  const clientRiskFlags = useMemo(
    () => normalizeClientRiskFlags(clientOperationalQuery.data?.risk_flags),
    [clientOperationalQuery.data?.risk_flags],
  );

  const upcomingCheckins = useMemo(() => {
    if (!checkinsRows || checkinsRows.length === 0) return [];
    const start = habitsToday || todayKey;
    const end = addDaysToDateString(start, 7);
    return checkinsRows
      .filter(
        (checkin) =>
          checkin.week_ending_saturday &&
          checkin.week_ending_saturday >= start &&
          checkin.week_ending_saturday <= end &&
          !checkin.submitted_at,
      )
      .sort((a, b) =>
        (a.week_ending_saturday ?? "").localeCompare(
          b.week_ending_saturday ?? "",
        ),
      )
      .slice(0, 5);
  }, [checkinsRows, habitsToday, todayKey]);

  const todaySession = useMemo(() => {
    return (
      (upcomingQuery.data ?? []).find(
        (workout) => workout.scheduled_date === todayKey,
      ) ?? null
    );
  }, [upcomingQuery.data, todayKey]);

  const todaySessionStatus = todaySession?.status ?? "planned";
  const todaySessionTitle =
    todaySession?.workout_template?.name ??
    (todaySession?.day_type === "rest" ? "Rest day" : "Workout");
  const pendingCheckin = upcomingCheckins[0] ?? null;
  const onboardingSnapshot = onboardingQuery.data ?? null;
  const onboardingStatusMeta = getPtOnboardingStatusMeta(
    onboardingSnapshot?.status,
  );
  const handleQuickAction = useCallback(
    (message: string) => {
      if (!clientId) return;
      const params = new URLSearchParams({ client: clientId, draft: message });
      navigate(`/pt/messages?${params.toString()}`);
    },
    [clientId, navigate],
  );
  const openProfileEdit = useCallback(() => {
    if (!clientSnapshot) return;
    setProfileEditForm({
      display_name: clientSnapshot.display_name ?? "",
      goal: clientSnapshot.goal ?? "",
      training_type: clientSnapshot.training_type ?? "",
      timezone: clientSnapshot.timezone ?? "",
    });
    setProfileEditOpen(true);
  }, [clientSnapshot]);
  const latestClientActivityAt =
    clientOperationalQuery.data?.last_activity_at ??
    clientOperationalQuery.data?.last_client_reply_at ??
    lastHabitLogDate ??
    lastWorkout ??
    lastCheckin ??
    clientSnapshot?.updated_at ??
    null;
  const nextDueSummary = pendingCheckin
    ? {
        title: "Next due check-in",
        value: pendingCheckin.week_ending_saturday ?? "--",
        helper: pendingCheckin.week_ending_saturday
          ? `Awaiting submission by ${pendingCheckin.week_ending_saturday}`
          : "Awaiting client submission",
      }
    : todaySession && todaySession.status !== "completed"
      ? {
          title: "Next scheduled session",
          value: todaySessionTitle,
          helper:
            todaySession.scheduled_date === todayKey
              ? "Scheduled for today"
              : `Scheduled ${todaySession.scheduled_date ?? "soon"}`,
        }
      : {
          title: "Next due event",
          value:
            activeProgram?.program_template?.name ?? "No scheduled due item",
          helper: activeProgram
            ? `Program active from ${activeProgram.start_date ?? "--"}`
            : "Assign a plan, workout, or check-in schedule.",
        };
  const recentActivityItems = useMemo(() => {
    const coachItems = (coachActivityQuery.data ?? [])
      .slice(0, 4)
      .map((row) => ({
        id: row.id,
        title: getCoachActionLabel(row.action),
        helper: row.created_at
          ? formatRelativeTime(row.created_at)
          : "Recently",
      }));

    if (coachItems.length > 0) return coachItems;

    const fallbackItems = [
      clientOperationalQuery.data?.last_client_reply_at
        ? {
            id: "reply",
            title: "Client replied",
            helper: formatRelativeTime(
              clientOperationalQuery.data.last_client_reply_at,
            ),
          }
        : null,
      lastWorkout
        ? {
            id: "workout",
            title: "Workout activity logged",
            helper: formatRelativeTime(lastWorkout),
          }
        : null,
      lastCheckin
        ? {
            id: "checkin",
            title: "Check-in activity",
            helper: formatRelativeTime(lastCheckin),
          }
        : null,
    ].filter(Boolean);

    return fallbackItems;
  }, [
    clientOperationalQuery.data?.last_client_reply_at,
    coachActivityQuery.data,
    lastCheckin,
    lastWorkout,
  ]);
  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      helper: string;
      actionLabel?: string;
      onAction?: () => void;
    }> = [];

    if (clientOperationalQuery.data?.has_overdue_checkin) {
      items.push({
        id: "overdue-checkin",
        title: `${clientOperationalQuery.data.overdue_checkins_count ?? 0} overdue check-in${(clientOperationalQuery.data.overdue_checkins_count ?? 0) === 1 ? "" : "s"}`,
        helper:
          "Follow up or review the queue before this falls further behind.",
        actionLabel: "Open check-ins",
        onAction: () => setActiveTab("checkins"),
      });
    }

    if (clientRiskFlags.length > 0) {
      const firstFlag = getClientRiskFlagMeta(clientRiskFlags[0]);
      if (firstFlag) {
        items.push({
          id: `risk-${clientRiskFlags[0]}`,
          title: firstFlag.label,
          helper:
            "The operational summary is flagging this client for closer review.",
          actionLabel: "Open habits",
          onAction: () => setActiveTab("habits"),
        });
      }
    }

    if (onboardingSnapshot && onboardingSnapshot.status !== "completed") {
      items.push({
        id: "onboarding",
        title: "Onboarding still needs PT review",
        helper: onboardingStatusMeta.description,
        actionLabel: "Open onboarding",
        onAction: () => setActiveTab("onboarding"),
      });
    }

    if (completion.percent < 100) {
      items.push({
        id: "profile-completion",
        title: `${completion.percent}% profile completion`,
        helper: `Missing: ${missingFields.slice(0, 4).join(", ")}${missingFields.length > 4 ? "..." : ""}`,
        actionLabel: "Edit profile",
        onAction: openProfileEdit,
      });
    }

    if (!activeProgram) {
      items.push({
        id: "program",
        title: "No active program assigned",
        helper: "Use the planning tab to put the next block in place.",
        actionLabel: "Open workout",
        onAction: () => setActiveTab("workout"),
      });
    }

    return items.slice(0, 4);
  }, [
    activeProgram,
    clientOperationalQuery.data?.has_overdue_checkin,
    clientOperationalQuery.data?.overdue_checkins_count,
    clientRiskFlags,
    completion.percent,
    missingFields,
    onboardingSnapshot,
    onboardingStatusMeta.description,
    openProfileEdit,
  ]);
  const nextActionItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      helper: string;
      actionLabel: string;
      onAction: () => void;
    }> = [];

    if (pendingCheckin) {
      items.push({
        id: "message-about-checkin",
        title: "Prompt the next check-in",
        helper: pendingCheckin.week_ending_saturday
          ? `Due ${pendingCheckin.week_ending_saturday}`
          : "A check-in is waiting for client submission.",
        actionLabel: "Message client",
        onAction: () => handleQuickAction("Quick check-in reminder"),
      });
    }

    if (todaySession && todaySession.status !== "completed") {
      items.push({
        id: "today-session",
        title: todaySessionTitle,
        helper:
          todaySessionStatus === "planned"
            ? "Today's workout still needs completion follow-up."
            : `Current status: ${todaySessionStatus}`,
        actionLabel: "Open workout",
        onAction: () => setActiveTab("workout"),
      });
    }

    if (!activeProgram) {
      items.push({
        id: "assign-program",
        title: "Assign the next training block",
        helper: "There is no active multi-week program for this client.",
        actionLabel: "Plan workout",
        onAction: () => setActiveTab("workout"),
      });
    }

    if (clientOperationalQuery.data?.last_client_reply_at) {
      items.push({
        id: "reply",
        title: "Respond to latest client message",
        helper: `Last reply ${formatRelativeTime(clientOperationalQuery.data.last_client_reply_at)}`,
        actionLabel: "Open messages",
        onAction: () => handleQuickAction("Following up on your latest update"),
      });
    }

    if (items.length === 0) {
      items.push({
        id: "healthy",
        title: "No urgent PT action is blocking progress",
        helper:
          "Use the workbench to review context and plan the next coaching touchpoint.",
        actionLabel: "Open progress",
        onAction: () => setActiveTab("progress"),
      });
    }

    return items.slice(0, 3);
  }, [
    activeProgram,
    clientOperationalQuery.data?.last_client_reply_at,
    handleQuickAction,
    pendingCheckin,
    todaySession,
    todaySessionStatus,
    todaySessionTitle,
  ]);

  const renderCheckinAnswerValue = (answer: CheckinAnswerRow) => {
    if (answer.value_text) return answer.value_text;
    if (typeof answer.value_number === "number")
      return `${answer.value_number}`;
    return "No response provided.";
  };

  const selectedCheckinReviewState = selectedCheckin
    ? getCheckinReviewState(selectedCheckin, todayKey)
    : null;
  const selectedCheckinNotesRequired =
    Boolean(selectedCheckin?.submitted_at) && feedbackText.trim().length === 0;
  const selectedCheckinReviewerLabel = selectedCheckin?.reviewed_by_user_id
    ? selectedCheckin.reviewed_by_user_id === user?.id
      ? "You"
      : "Another coach"
    : null;
  const reviewClientLabel = clientQuery.data?.display_name?.trim()
    ? clientQuery.data.display_name
    : clientQuery.data?.email?.trim()
      ? clientQuery.data.email
      : "Client";
  const selectedCheckinPhotos = useMemo(() => {
    const order = new Map([
      ["front", 0],
      ["side", 1],
      ["back", 2],
      ["optional", 3],
    ]);
    return [...(selectedCheckinPhotosQuery.data ?? [])].sort(
      (a, b) =>
        (order.get(a.photo_type) ?? 99) - (order.get(b.photo_type) ?? 99),
    );
  }, [selectedCheckinPhotosQuery.data]);
  const selectedCheckinPhotoCards = useMemo(() => {
    const labels: Record<string, string> = {
      front: "Front",
      side: "Side",
      back: "Back",
      optional: "Optional",
    };
    const requiredCards = ["front", "side", "back"].map((photoType) => ({
      id: `required-${photoType}`,
      photoType,
      label: labels[photoType] ?? photoType,
      photo:
        selectedCheckinPhotos.find((item) => item.photo_type === photoType) ??
        null,
      isMissing: !selectedCheckinPhotos.some(
        (item) => item.photo_type === photoType,
      ),
    }));
    const optionalCards = selectedCheckinPhotos
      .filter(
        (item) => !["front", "side", "back"].includes(item.photo_type ?? ""),
      )
      .map((photo, index) => ({
        id: photo.id,
        photoType: photo.photo_type ?? "optional",
        label:
          photo.photo_type === "optional"
            ? `Optional ${index + 1}`
            : (labels[photo.photo_type] ?? photo.photo_type ?? "Photo"),
        photo,
        isMissing: false,
      }));
    return [...requiredCards, ...optionalCards];
  }, [selectedCheckinPhotos]);
  const selectedCheckinSubmittedPhotoCount = selectedCheckinPhotos.filter(
    (photo) => Boolean(photo.url),
  ).length;
  const selectedCheckinMissingPhotoCount = selectedCheckinPhotoCards.filter(
    (card) => card.isMissing,
  ).length;
  const selectedCheckinAnswerCount =
    selectedCheckinAnswersQuery.data?.length ?? 0;

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

  const onboardingChecklist = useMemo(
    () =>
      buildPtOnboardingChecklist({
        onboarding: onboardingSnapshot,
        baselineSubmitted: Boolean(baselineEntryQuery.data?.id),
      }),
    [baselineEntryQuery.data?.id, onboardingSnapshot],
  );
  const onboardingReadyForCompletion = useMemo(
    () => isReadyForOnboardingCompletion(onboardingChecklist),
    [onboardingChecklist],
  );
  const onboardingMissingItems = useMemo(
    () =>
      onboardingChecklist
        .filter((item) => !item.optional && !item.complete)
        .map((item) => item.label),
    [onboardingChecklist],
  );
  const invalidateOnboardingViews = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-onboarding", clientId, workspaceQuery.data],
    });
    await queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] });
    await queryClient.invalidateQueries({
      queryKey: ["pt-clients-onboarding", workspaceQuery.data],
    });
  };

  const parseTags = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const openLifecycleDialog = (state: string) => {
    setLifecycleTargetState(state);
    setLifecycleReason(
      state === "paused"
        ? (clientSnapshot?.paused_reason ?? "")
        : state === "churned"
          ? (clientSnapshot?.churn_reason ?? "")
          : "",
    );
    setLifecycleValidationMessage(null);
    setLifecycleDialogOpen(true);
  };

  const handleLifecycleSave = async () => {
    if (!clientSnapshot?.id) return;
    if (
      ["paused", "churned"].includes(lifecycleTargetState) &&
      !lifecycleReason.trim()
    ) {
      setLifecycleValidationMessage(
        lifecycleTargetState === "paused"
          ? "Pause reason is required."
          : "Churn reason is required.",
      );
      return;
    }

    setLifecycleActionStatus("saving");
    const { data, error } = await supabase.rpc("pt_update_client_lifecycle", {
      p_client_id: clientSnapshot.id,
      p_lifecycle_state: lifecycleTargetState,
      p_reason: lifecycleReason.trim() || null,
    });

    if (error) {
      setToastVariant("error");
      setToastMessage(getErrorMessage(error));
      setLifecycleActionStatus("idle");
      return;
    }

    const updated = Array.isArray(data) ? data[0] : data;
    if (updated) {
      setClientProfile((prev) =>
        prev
          ? {
              ...prev,
              status: updated.status ?? prev.status,
              lifecycle_state:
                updated.lifecycle_state ?? prev.lifecycle_state ?? "active",
              lifecycle_changed_at:
                updated.lifecycle_changed_at ?? prev.lifecycle_changed_at,
              paused_reason: updated.paused_reason ?? null,
              churn_reason: updated.churn_reason ?? null,
            }
          : prev,
      );
      queryClient.setQueryData(
        ["pt-client", clientId, workspaceQuery.data],
        (prev: PtClientProfile | undefined) =>
          prev
            ? {
                ...prev,
                status: updated.status ?? prev.status,
                lifecycle_state:
                  updated.lifecycle_state ?? prev.lifecycle_state ?? "active",
                lifecycle_changed_at:
                  updated.lifecycle_changed_at ?? prev.lifecycle_changed_at,
                paused_reason: updated.paused_reason ?? null,
                churn_reason: updated.churn_reason ?? null,
              }
            : prev,
      );
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          "pt-client-operational-summary",
          clientId,
          workspaceQuery.data,
        ],
      }),
      queryClient.invalidateQueries({ queryKey: ["pt-checkins-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["pt-dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["pt-hub-clients"] }),
    ]);

    setLifecycleActionStatus("idle");
    setLifecycleDialogOpen(false);
    setToastVariant("success");
    setToastMessage(
      `Client moved to ${lifecycleTargetState.replace(/_/g, " ")}.`,
    );
  };

  const handleProfileSave = async () => {
    if (!clientSnapshot?.id) return;
    setProfileEditStatus("saving");
    const payload = {
      display_name: profileEditForm.display_name.trim() || null,
      goal: profileEditForm.goal.trim() || null,
      training_type: profileEditForm.training_type || null,
      timezone: profileEditForm.timezone.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", clientSnapshot.id)
      .select("id, display_name, goal, training_type, timezone, updated_at")
      .maybeSingle();
    if (error) {
      setToastVariant("error");
      setToastMessage(getErrorMessage(error));
      setProfileEditStatus("idle");
      return;
    }
    if (data) {
      setClientProfile((prev) => (prev ? { ...prev, ...data } : prev));
      queryClient.setQueryData(
        ["pt-client", clientId, workspaceQuery.data],
        (prev: PtClientProfile | undefined) =>
          prev ? { ...prev, ...data } : prev,
      );
    }
    setProfileEditStatus("idle");
    setProfileEditOpen(false);
    setToastVariant("success");
    setToastMessage("Client profile updated.");
  };

  const updateAdminFields = async (
    nextTrainingType: string,
    nextTags: string,
  ) => {
    if (!clientSnapshot) return;
    setAdminStatus("saving");
    const parsedTags = parseTags(nextTags);
    const payload = {
      p_client_id: clientSnapshot.id,
      p_training_type: nextTrainingType || null,
      p_tags: parsedTags.length > 0 ? parsedTags : null,
    };
    const { data, error } = await supabase.rpc(
      "pt_update_client_admin_fields",
      payload,
    );
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
        updated,
      );
    }
    setAdminStatus("idle");
  };

  const handleSaveCheckinTemplate = async () => {
    if (!clientQuery.data?.id) return;
    setCheckinTemplateStatus("saving");
    const nextId = checkinTemplateId || null;
    const nextFrequency = checkinFrequency || "weekly";
    const nextStartDate = checkinStartDate || null;
    const { data, error } = await supabase.rpc(
      "pt_update_client_checkin_settings",
      {
        p_client_id: clientQuery.data.id,
        p_checkin_template_id: nextId,
        p_checkin_frequency: nextFrequency,
        p_checkin_start_date: nextStartDate,
      },
    );

    if (error) {
      setCheckinTemplateStatus("error");
      setToastVariant("error");
      setToastMessage(getErrorMessage(error));
      return;
    }

    const updatedClient = Array.isArray(data) ? data[0] : data;

    if (updatedClient) {
      queryClient.setQueryData(
        ["pt-client", clientId, workspaceQuery.data],
        (prev: PtClientProfile | undefined) => ({
          ...(prev ?? {}),
          checkin_template_id: updatedClient?.checkin_template_id ?? null,
          checkin_frequency: updatedClient?.checkin_frequency ?? "weekly",
          checkin_start_date: updatedClient?.checkin_start_date ?? null,
        }),
      );
      setClientProfile((prev) =>
        prev
          ? {
              ...prev,
              checkin_template_id: updatedClient?.checkin_template_id ?? null,
              checkin_frequency: updatedClient?.checkin_frequency ?? "weekly",
              checkin_start_date: updatedClient?.checkin_start_date ?? null,
            }
          : prev,
      );
    }

    if (nextStartDate) {
      const nextDueDate = getNextCheckinDueDate(
        nextStartDate,
        nextFrequency,
        todayKey,
      );
      if (nextDueDate) {
        const { error: scheduleError } = await supabase.rpc(
          "ensure_client_checkins",
          {
            p_client_id: clientQuery.data.id,
            p_range_start: nextDueDate,
            p_range_end: addDaysToDateString(nextDueDate, 90),
          },
        );
        if (scheduleError && isDev) {
          console.warn("CHECKIN_SCHEDULE_ERROR", scheduleError);
        }
      }
    }

    await queryClient.invalidateQueries({
      queryKey: ["pt-client-onboarding", clientId, workspaceQuery.data],
    });
    setCheckinTemplateStatus("idle");
    setToastVariant("success");
    setToastMessage("Check-in template updated.");
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
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-baseline-entry", clientId],
    });
  };

  const handleSaveOnboardingReviewNotes = async () => {
    if (!onboardingSnapshot?.id) return;
    setOnboardingReviewStatus("saving");
    setOnboardingReviewMessage(null);
    const { error } = await supabase
      .from("workspace_client_onboardings")
      .update({ coach_review_notes: onboardingReviewNotes.trim() || null })
      .eq("id", onboardingSnapshot.id);

    if (error) {
      setOnboardingReviewStatus("error");
      setOnboardingReviewMessage(getErrorMessage(error));
      return;
    }

    setOnboardingReviewStatus("idle");
    setOnboardingReviewMessage("Coach notes saved.");
    await invalidateOnboardingViews();
  };

  const handleMarkOnboardingReviewed = async () => {
    if (!clientId) return;
    setOnboardingActionStatus("saving");
    setOnboardingActionMessage(null);
    const { error } = await supabase.rpc("review_workspace_client_onboarding", {
      p_client_id: clientId,
      p_coach_review_notes: onboardingReviewNotes.trim() || null,
    });

    if (error) {
      setOnboardingActionStatus("error");
      setOnboardingActionMessage(getErrorMessage(error));
      return;
    }

    setOnboardingActionStatus("idle");
    setOnboardingActionMessage("Onboarding marked reviewed.");
    setToastVariant("success");
    setToastMessage("Onboarding reviewed");
    await invalidateOnboardingViews();
  };

  const handleCompleteOnboarding = async () => {
    if (!clientId) return;
    if (!onboardingReadyForCompletion) {
      setOnboardingActionStatus("error");
      setOnboardingActionMessage(
        `Complete the remaining items first: ${onboardingMissingItems.join(", ")}.`,
      );
      return;
    }

    setOnboardingActionStatus("saving");
    setOnboardingActionMessage(null);
    const { error } = await supabase.rpc(
      "complete_workspace_client_onboarding",
      {
        p_client_id: clientId,
        p_program_template_id: null,
        p_checkin_template_id: null,
        p_first_checkin_date: null,
        p_coach_review_notes: onboardingReviewNotes.trim() || null,
      },
    );

    if (error) {
      setOnboardingActionStatus("error");
      setOnboardingActionMessage(getErrorMessage(error));
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["pt-client", clientId, workspaceQuery.data],
    });
    await queryClient.invalidateQueries({
      queryKey: ["client-program-active", clientId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["client-program-paused", clientId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-checkins", clientId, "checkins", 0],
    });
    await invalidateOnboardingViews();

    setOnboardingActionStatus("idle");
    setOnboardingActionMessage("Client onboarding completed.");
    setToastVariant("success");
    setToastMessage("Client onboarding completed");
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
      prev.map((row) => (row.id === id ? { ...row, loadNotes: value } : row)),
    );
  };

  const handleLoadCompletedChange = (id: string, value: boolean) => {
    setAssignedExercises((prev) =>
      prev.map((row) => (row.id === id ? { ...row, isCompleted: value } : row)),
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
          .eq("id", row.id),
      ),
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

  const openCheckinReview = useCallback((row: CheckinRow) => {
    if (!row.submitted_at && !row.reviewed_at) return;
    setSelectedCheckin(row);
    setReviewTab("answers");
    setFeedbackText(row.pt_feedback ?? "");
    setFeedbackValidationMessage(null);
    setFeedbackMessage(null);
    setFeedbackStatus("idle");
    setReviewPhotoLoadErrors({});
    setReviewPhotoPreview(null);
    setReviewOpen(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const targetCheckinId = params.get("checkin");
    if (active !== "checkins" || !targetCheckinId) return;
    const match = checkinsRows.find((row) => row.id === targetCheckinId);
    if (!match || (!match.submitted_at && !match.reviewed_at)) return;
    if (reviewOpen && selectedCheckin?.id === targetCheckinId) return;
    openCheckinReview(match);
  }, [
    active,
    checkinsRows,
    location.search,
    openCheckinReview,
    reviewOpen,
    selectedCheckin?.id,
  ]);

  const handleSaveCheckinReview = async (markReviewed: boolean) => {
    if (!selectedCheckin) return;
    const trimmedFeedback = feedbackText.trim();
    if (markReviewed && trimmedFeedback.length === 0) {
      setFeedbackStatus("error");
      setReviewTab("notes");
      setFeedbackValidationMessage(
        "Review notes are required before marking this check-in reviewed.",
      );
      setFeedbackMessage(null);
      return;
    }
    setFeedbackStatus(markReviewed ? "marking_reviewed" : "saving_draft");
    setFeedbackValidationMessage(null);
    setFeedbackMessage(null);
    const nextFeedback = trimmedFeedback || null;

    const { error } = await supabase.rpc("review_checkin", {
      p_checkin_id: selectedCheckin.id,
      p_pt_feedback: nextFeedback,
      p_mark_reviewed: markReviewed,
    });

    if (error) {
      setFeedbackStatus("error");
      const nextMessage = getErrorMessage(error);
      setFeedbackMessage(nextMessage);
      setToastVariant("error");
      setToastMessage(nextMessage);
      if (isDev) {
        console.warn("CHECKIN_FEEDBACK_SAVE_ERROR", error);
      }
      return;
    }

    if (markReviewed) {
      await logCoachActivity({
        clientId,
        workspaceId: workspaceQuery.data,
        action: "checkin_reviewed",
        metadata: {
          checkinId: selectedCheckin.id,
          dueDate: selectedCheckin.week_ending_saturday,
        },
      });
    }

    setFeedbackStatus("idle");
    setFeedbackMessage(markReviewed ? "Check-in reviewed." : "Draft saved.");
    setToastVariant("success");
    setToastMessage(
      markReviewed ? "Check-in reviewed." : "Review draft saved.",
    );
    setSelectedCheckin((current) =>
      current
        ? {
            ...current,
            pt_feedback: nextFeedback,
            reviewed_at: markReviewed
              ? (current.reviewed_at ?? new Date().toISOString())
              : current.reviewed_at,
            reviewed_by_user_id: markReviewed
              ? (current.reviewed_by_user_id ?? user?.id ?? null)
              : current.reviewed_by_user_id,
          }
        : current,
    );
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-checkins", clientId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["pt-checkins-queue"],
    });
    if (markReviewed) {
      setReviewOpen(false);
      setSelectedCheckin(null);
    }
  };

  useEffect(() => {
    if (active !== "baseline") return;
    if (!clientId || !workspaceQuery.data || !baselineEntryQuery.data?.id)
      return;
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
      prev.map((task) =>
        task.id === taskId ? { ...task, done: !task.done } : task,
      ),
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

  const identityLoading = clientQuery.isLoading;
  const scheduleLoading = templatesQuery.isLoading || upcomingQuery.isLoading;
  const statsLoading =
    coachActivityQuery.isLoading ||
    habitsQuery.isLoading ||
    checkinsQuery.isLoading;
  const focusLoading =
    upcomingQuery.isLoading ||
    checkinsQuery.isLoading ||
    coachActivityQuery.isLoading;

  return (
    <DashboardShell>
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[260px]">
          <Alert
            className={
              toastVariant === "error"
                ? "border-danger/30"
                : "border-emerald-200"
            }
          >
            <AlertTitle>
              {toastVariant === "error" ? "Error" : "Success"}
            </AlertTitle>
            <AlertDescription>{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="w-full space-y-6">
        {identityLoading ? (
          <Card className="rounded-2xl border border-border/70 bg-card/90 shadow-sm backdrop-blur">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-52" />
                </div>
              </div>
              <Skeleton className="h-9 w-48" />
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border border-border/70 bg-card/90 shadow-sm backdrop-blur">
            <CardContent className="space-y-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                    {getInitials(clientSnapshot?.display_name)}
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">
                        {clientSnapshot?.display_name ?? "Client profile"}
                      </h2>
                      <StatusPill
                        status={
                          clientSnapshot?.lifecycle_state ??
                          clientSnapshot?.status ??
                          "active"
                        }
                      />
                      {onboardingSnapshot ? (
                        <StatusPill status={onboardingSnapshot.status} />
                      ) : null}
                      {clientRiskFlags.slice(0, 2).map((flag) => {
                        const meta = getClientRiskFlagMeta(flag);
                        if (!meta) return null;
                        return (
                          <Badge key={flag} variant={meta.variant}>
                            {meta.shortLabel}
                          </Badge>
                        );
                      })}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[
                        clientSnapshot?.goal,
                        clientSnapshot?.training_type,
                        clientSnapshot?.timezone,
                      ]
                        .filter(Boolean)
                        .join("  -  ") || "Client coaching view"}
                      {joinedLabel ? `  -  Joined ${joinedLabel}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="shadow-[0_0_30px_rgba(34,211,238,0.15)]"
                    onClick={() => handleQuickAction("")}
                  >
                    Message client
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setActiveTab("workout")}
                  >
                    Plan workout
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Client actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={openProfileEdit}>
                        Edit profile
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIsOverviewCollapsed((prev) => !prev)}
                      >
                        {isOverviewCollapsed
                          ? "Show profile details"
                          : "Hide profile details"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => openLifecycleDialog("active")}
                      >
                        Mark active
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openLifecycleDialog("paused")}
                      >
                        Mark paused
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openLifecycleDialog("at_risk")}
                      >
                        Mark at risk
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openLifecycleDialog("completed")}
                      >
                        Mark completed
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openLifecycleDialog("churned")}
                      >
                        Mark churned
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {!isOverviewCollapsed ? (
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Lifecycle
                      </span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <StatusPill
                          status={
                            clientSnapshot?.lifecycle_state ??
                            clientSnapshot?.status ??
                            "active"
                          }
                        />
                        {clientSnapshot?.lifecycle_changed_at ? (
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(
                              clientSnapshot.lifecycle_changed_at,
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Onboarding
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {onboardingStatusMeta.label}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Goal
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {clientSnapshot?.goal ?? "Not set"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Training
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {clientSnapshot?.training_type ?? "Not set"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Timezone
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {clientSnapshot?.timezone ?? "Not set"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Joined
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {joinedLabel ?? "--"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Active program
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {activeProgram?.program_template?.name ?? "None"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Program start
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {activeProgram?.start_date ?? "--"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Check-in status
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {checkinStatus ?? "--"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Last workout
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {lastWorkoutStatus ?? "--"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Risk signals
                      </span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {clientRiskFlags.length > 0 ? (
                          clientRiskFlags.map((flag) => {
                            const meta = getClientRiskFlagMeta(flag);
                            if (!meta) return null;
                            return (
                              <Badge
                                key={flag}
                                variant={meta.variant}
                                className="text-[10px]"
                              >
                                {meta.shortLabel}
                              </Badge>
                            );
                          })
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">
                            No active risk flags
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
                      <span className="block text-xs text-muted-foreground">
                        Lifecycle reason
                      </span>
                      <span className="mt-0.5 block font-medium">
                        {lifecycleReasonLabel ?? "No pause or churn reason"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {clientSnapshot ? (
          focusLoading ? (
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80">
              <div className="grid gap-px bg-border/60 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
                <div className="bg-card/90 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 p-2 text-amber-200">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Attention needed
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {attentionItems[0]?.title ?? "No active blockers"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {attentionItems[0]?.helper ??
                          "This client does not have an urgent PT blocker right now."}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-card/90 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Next action
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {nextActionItems[0]?.title ?? "Open the workbench"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {nextActionItems[0]?.helper ??
                          "Choose the next coaching action from the tabs below."}
                      </p>
                    </div>
                    {nextActionItems[0] ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        onClick={nextActionItems[0].onAction}
                      >
                        {nextActionItems[0].actionLabel}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="bg-card/90 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Recent status
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {onboardingStatusMeta.label}
                    </Badge>
                    <Badge variant="secondary">
                      {completion.percent}% ready
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {nextDueSummary.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {nextDueSummary.helper}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {latestClientActivityAt
                      ? `Latest activity ${formatRelativeTime(latestClientActivityAt)}`
                      : "No recent activity captured yet."}
                    {recentActivityItems[0]?.title
                      ? ` - ${recentActivityItems[0].title}`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          )
        ) : null}

        <div className="grid gap-7 lg:grid-cols-3">
          <DashboardCard
            title="Todo List"
            subtitle="Create tasks for this client."
            className="lg:col-span-1"
          >
            <div className="space-y-4">
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
              <div className="space-y-2.5">
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
                            task.done
                              ? "text-muted-foreground line-through"
                              : "text-foreground",
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

          <DashboardCard
            title="Metrics"
            subtitle="Snapshot of recent progress."
            className="lg:col-span-2"
          >
            {statsLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="border-border/70 bg-card/80">
                    <CardHeader className="space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-7 w-20" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : clientSnapshot ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                  helper={
                    lastCheckin
                      ? formatRelativeTime(lastCheckin)
                      : "No check-ins"
                  }
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
            ) : (
              <EmptyState
                title="No stats yet"
                description="Client activity will show here once sessions begin."
              />
            )}
          </DashboardCard>
        </div>

        {scheduleLoading ? (
          <DashboardCard title="Plan & Calendar" subtitle="Loading schedule...">
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </DashboardCard>
        ) : clientSnapshot ? (
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
              setActiveTab("workout");
            }}
            onReschedule={handleRescheduleWorkout}
            onDelete={handleOpenDeleteDialog}
            onStatusChange={handleStatusUpdate}
          />
        ) : (
          <EmptyState
            title="No plan yet"
            description="Assign a workout or program to get started."
          />
        )}

        <div className="space-y-6">
          {(workspaceQuery.error ||
            programTemplatesQuery.error ||
            activeProgramQuery.error ||
            pausedProgramQuery.error ||
            programOverridesQuery.error ||
            templatesQuery.error ||
            upcomingQuery.error ||
            ptSessionsQuery.error ||
            coachActivityQuery.error ||
            habitsQuery.error ||
            habitLogByDateQuery.error ||
            baselineEntryQuery.error ||
            baselineMetricsQuery.error ||
            baselineMarkersQuery.error ||
            baselinePhotosQuery.error ||
            onboardingQuery.error ||
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
                      programTemplatesQuery.error,
                      activeProgramQuery.error,
                      pausedProgramQuery.error,
                      programOverridesQuery.error,
                      templatesQuery.error,
                      upcomingQuery.error,
                      ptSessionsQuery.error,
                      workoutSessionsQuery.error,
                      workoutSetLogsQuery.error,
                      coachActivityQuery.error,
                      habitsQuery.error,
                      habitLogByDateQuery.error,
                      baselineEntryQuery.error,
                      baselineMetricsQuery.error,
                      baselineMarkersQuery.error,
                      baselinePhotosQuery.error,
                      onboardingQuery.error,
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

        <div>
          <DashboardCard
            title="Client Workbench"
            className="bg-card/90"
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => setIsWorkbenchCollapsed((prev) => !prev)}
                aria-expanded={!isWorkbenchCollapsed}
                aria-label={
                  isWorkbenchCollapsed
                    ? "Expand client workbench"
                    : "Collapse client workbench"
                }
              >
                {isWorkbenchCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            }
          >
            {!isWorkbenchCollapsed ? (
              <Tabs
                value={active}
                onValueChange={setActiveTab}
                className="space-y-4"
              >
                <div className="rounded-2xl border border-border/70 bg-card/70 p-2">
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-xl border-none bg-transparent p-0 shadow-none sm:grid-cols-3 xl:grid-cols-5">
                    {workbenchTabs.map((tab) => (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className={cn(
                          "group h-auto rounded-xl border border-border/45 bg-background/30 px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground transition-all",
                          "hover:border-border hover:bg-background/55 hover:text-foreground",
                          "data-[state=active]:border-primary/50 data-[state=active]:bg-background/80 data-[state=active]:text-foreground",
                          "data-[state=active]:shadow-[0_0_0_1px_oklch(var(--primary)/0.24),0_16px_30px_-24px_oklch(var(--primary)/0.8)]",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {(() => {
                            const Icon = workbenchTabIcons[tab.value];
                            return (
                              <Icon className="h-3.5 w-3.5 text-muted-foreground transition-colors group-data-[state=active]:text-primary" />
                            );
                          })()}
                          <span>{tab.label}</span>
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <TabsContent value="onboarding">
                  <PtClientOnboardingTab
                    clientSnapshot={clientSnapshot}
                    onboardingQuery={onboardingQuery}
                    onboardingStatusMeta={onboardingStatusMeta}
                    onboardingChecklist={onboardingChecklist}
                    onboardingReadyForCompletion={onboardingReadyForCompletion}
                    onboardingMissingItems={onboardingMissingItems}
                    onboardingReviewNotes={onboardingReviewNotes}
                    onboardingReviewStatus={onboardingReviewStatus}
                    onboardingReviewMessage={onboardingReviewMessage}
                    onboardingActionStatus={onboardingActionStatus}
                    onboardingActionMessage={onboardingActionMessage}
                    baselineEntryQuery={baselineEntryQuery}
                    baselineMetricsQuery={baselineMetricsQuery}
                    baselineMarkersQuery={baselineMarkersQuery}
                    baselinePhotosQuery={baselinePhotosQuery}
                    baselinePhotoMap={baselinePhotoMap}
                    onReviewNotesChange={setOnboardingReviewNotes}
                    onSaveReviewNotes={handleSaveOnboardingReviewNotes}
                    onMarkReviewed={handleMarkOnboardingReviewed}
                    onComplete={handleCompleteOnboarding}
                  />
                </TabsContent>
                <TabsContent value="workout">
                  <PtClientPlanTab
                    templatesQuery={templatesQuery}
                    programTemplatesQuery={programTemplatesQuery}
                    activeProgram={activeProgram}
                    pausedProgram={pausedProgram}
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
                    onPauseProgram={handlePauseProgram}
                    onResumeProgram={handleResumeProgram}
                    onSwitchProgramMidCycle={handleSwitchProgramMidCycle}
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
                <TabsContent value="nutrition">
                  <PtClientNutritionTab
                    clientId={clientId ?? null}
                    workspaceId={workspaceQuery.data ?? null}
                    todayKey={todayKey}
                  />
                </TabsContent>
                <TabsContent value="habits">
                  <PtClientHabitsTab
                    habitsQuery={habitsQuery}
                    hasAnyHabits={Boolean(habitsAnyQuery.data?.length)}
                    habitsToday={habitsToday}
                    habitStreak={habitStreak}
                  />
                </TabsContent>
                <TabsContent value="progress">
                  <PtClientProgressTab
                    hasBaselineSubmission={Boolean(baselineEntryQuery.data?.id)}
                    onOpenHabits={() => setActiveTab("habits")}
                    onOpenBaseline={() => setActiveTab("baseline")}
                    onOpenWorkout={() => setActiveTab("workout")}
                    onOpenCheckins={() => setActiveTab("checkins")}
                  />
                </TabsContent>
                <TabsContent value="logs">
                  <PtClientLogsTab
                    ptSessionsQuery={ptSessionsQuery}
                    sessionVolumeById={sessionVolumeById}
                    onOpenSession={(id) => {
                      setSelectedSessionId(id);
                      setSessionDetailOpen(true);
                    }}
                    onOpenWorkoutPlanner={() => setActiveTab("workout")}
                  />
                </TabsContent>
                <TabsContent value="checkins">
                  <div className="space-y-6">
                    <DashboardCard
                      title="Check-in template"
                      subtitle="Assign a template for this client."
                      action={
                        <StatusPill
                          status={checkinTemplateStatusKey}
                          statusMap={checkinTemplateStatusMap}
                        />
                      }
                    >
                      {checkinTemplatesQuery.isLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-10 w-40" />
                        </div>
                      ) : checkinTemplatesQuery.error ||
                        availableCheckinTemplates.length === 0 ? (
                        <EmptyState
                          title="No check-in templates created yet"
                          description="Create a template to assign it to clients."
                          actionLabel="Create template"
                          onAction={() => navigate("/pt/checkins/templates")}
                        />
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground">
                              Template
                            </label>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={checkinTemplateId}
                              onChange={(event) =>
                                setCheckinTemplateId(event.target.value)
                              }
                              disabled={
                                checkinTemplatesQuery.isLoading ||
                                checkinTemplateStatus === "saving"
                              }
                            >
                              <option value="">Use workspace default</option>
                              {availableCheckinTemplates.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.name ?? "Untitled template"}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-muted-foreground">
                                Frequency
                              </label>
                              <select
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={checkinFrequency}
                                onChange={(event) =>
                                  setCheckinFrequency(event.target.value)
                                }
                              >
                                {checkinFrequencyOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-muted-foreground">
                                First check-in
                              </label>
                              <Input
                                type="date"
                                value={checkinStartDate}
                                onChange={(event) =>
                                  setCheckinStartDate(event.target.value)
                                }
                              />
                            </div>
                          </div>
                          {checkinStartDate ? (
                            <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">
                                Next:
                              </span>{" "}
                              {getNextCheckinDueDate(
                                checkinStartDate,
                                checkinFrequency,
                                todayKey,
                              ) ?? "--"}
                            </div>
                          ) : null}
                          {!effectiveCheckinTemplate ? (
                            <EmptyState
                              title="No template assigned"
                              description="Assign a template to start scheduled check-ins."
                            />
                          ) : null}
                          <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              Resolution:
                            </span>{" "}
                            {checkinTemplateId
                              ? "Client override"
                              : defaultCheckinTemplate
                                ? "Workspace default"
                                : effectiveCheckinTemplate
                                  ? "Latest active workspace template fallback"
                                  : "No template resolved"}
                          </div>
                          <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              Using:
                            </span>{" "}
                            {effectiveCheckinTemplate?.name ??
                              "No template selected"}
                          </div>
                          <Button
                            size="sm"
                            onClick={handleSaveCheckinTemplate}
                            disabled={checkinTemplateStatus === "saving"}
                          >
                            {checkinTemplateStatus === "saving"
                              ? "Saving..."
                              : "Assign template"}
                          </Button>
                        </div>
                      )}
                    </DashboardCard>

                    <PtClientCheckinsTab
                      rows={checkinsRows}
                      todayKey={todayKey}
                      isLoading={checkinsQuery.isLoading}
                      error={checkinsQuery.error}
                      canLoadMore={checkinsCanLoadMore}
                      onLoadMore={() => setCheckinsPage((prev) => prev + 1)}
                      onReview={openCheckinReview}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="notes">
                  <PtClientNotesTab
                    clientId={clientId ?? null}
                    workspaceId={workspaceQuery.data ?? null}
                  />
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
            ) : null}
          </DashboardCard>
        </div>
      </div>

      <Dialog
        open={sessionDetailOpen}
        onOpenChange={(open) => {
          setSessionDetailOpen(open);
          if (!open) {
            setSelectedSessionId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Session details</DialogTitle>
            <DialogDescription>
              {selectedSession?.assigned_workout?.workout_template?.name ??
                "Workout"}{" "}
              -{" "}
              {selectedSession?.completed_at
                ? new Date(selectedSession.completed_at).toLocaleString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )
                : selectedSession?.started_at
                  ? new Date(selectedSession.started_at).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )
                  : "In progress"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Client notes
              </p>
              <p className="mt-2">
                {selectedSession?.client_notes ?? "No notes provided."}
              </p>
            </div>
            {sessionDetailQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : sessionDetailQuery.error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                {getErrorDetails(sessionDetailQuery.error).code}:{" "}
                {getErrorDetails(sessionDetailQuery.error).message}
              </div>
            ) : sessionDetailByExercise.length > 0 ? (
              <div className="space-y-4">
                {sessionDetailByExercise.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-lg border border-border bg-background/40 p-3"
                  >
                    <div className="text-sm font-semibold text-foreground">
                      {group.name}
                    </div>
                    <div className="mt-2 grid grid-cols-[60px_120px_80px_80px_80px] gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      <span>Set</span>
                      <span>Weight</span>
                      <span>Reps</span>
                      <span>RPE</span>
                      <span>Completed</span>
                    </div>
                    {group.rows.map((row) => (
                      <div
                        key={row.id}
                        className="mt-2 grid grid-cols-[60px_120px_80px_80px_80px] items-center gap-2 text-sm"
                      >
                        <span className="text-xs text-muted-foreground">
                          {row.set_number ?? "--"}
                        </span>
                        <span>
                          {typeof row.weight === "number" ? row.weight : "--"}
                        </span>
                        <span>
                          {typeof row.reps === "number" ? row.reps : "--"}
                        </span>
                        <span>
                          {typeof row.rpe === "number" ? row.rpe : "--"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.is_completed ? "Yes" : "No"}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                No set logs for this session.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit workout</DialogTitle>
            <DialogDescription>
              Update schedule, template, or status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Date
              </label>
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
                    {template.workout_type_tag
                      ? ` - ${template.workout_type_tag}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Status
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={editStatus}
                onChange={(event) =>
                  setEditStatus(
                    event.target.value as "planned" | "completed" | "skipped",
                  )
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
              disabled={
                assignStatus === "saving" || !editTemplateId || !editDate
              }
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
            const params = new URLSearchParams(location.search);
            if (params.has("checkin")) {
              params.delete("checkin");
              navigate(
                {
                  pathname: location.pathname,
                  search: params.toString(),
                },
                { replace: true },
              );
            }
            setSelectedCheckin(null);
            setReviewTab("answers");
            setFeedbackText("");
            setFeedbackValidationMessage(null);
            setFeedbackMessage(null);
            setFeedbackStatus("idle");
            setReviewPhotoLoadErrors({});
            setReviewPhotoPreview(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[88vh] w-[min(96vw,1080px)] max-w-[1080px] flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border/70 bg-card/95 px-6 py-5 pr-14 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="text-lg sm:text-xl">
                  {reviewClientLabel}
                </DialogTitle>
                <DialogDescription>
                  {selectedCheckin?.week_ending_saturday
                    ? `Check-in due ${selectedCheckin.week_ending_saturday}`
                    : "Check-in review"}
                </DialogDescription>
              </div>
              {selectedCheckinReviewState ? (
                <StatusPill
                  status={selectedCheckinReviewState}
                  statusMap={checkinReviewStatusMap}
                />
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Due date</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatShortDate(
                    selectedCheckin?.week_ending_saturday,
                    "Not scheduled",
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatShortDateTime(
                    selectedCheckin?.submitted_at,
                    "Not submitted",
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Reviewed</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatShortDateTime(
                    selectedCheckin?.reviewed_at,
                    "Not reviewed",
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Reviewer</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedCheckinReviewerLabel ?? "Not assigned"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Completion summary
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedCheckinAnswerCount} answers,{" "}
                  {selectedCheckinSubmittedPhotoCount} photos
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedCheckinMissingPhotoCount > 0
                    ? `${selectedCheckinMissingPhotoCount} required photo views missing`
                    : "Required photo views are present"}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {!selectedCheckin?.submitted_at ? (
              <Alert className="mb-5 border-warning/30 bg-warning/10">
                <AlertTitle>Submission required</AlertTitle>
                <AlertDescription>
                  This check-in is still awaiting client submission, so review
                  metadata cannot be completed yet.
                </AlertDescription>
              </Alert>
            ) : null}

            <Tabs
              value={reviewTab}
              onValueChange={(value) =>
                setReviewTab(value as "answers" | "photos" | "notes")
              }
              className="space-y-4"
            >
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-2xl bg-muted/25 p-2">
                <TabsTrigger value="answers">
                  Answers ({selectedCheckinAnswerCount})
                </TabsTrigger>
                <TabsTrigger value="photos">
                  Photos ({selectedCheckinSubmittedPhotoCount})
                </TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="answers" className="mt-0">
                <div className="rounded-[24px] border border-border/70 bg-card/70 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Answers
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Scan prompts and responses quickly before writing the PT
                        review.
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {selectedCheckinAnswerCount} responses
                    </Badge>
                  </div>

                  {selectedCheckinAnswersQuery.isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : selectedCheckinAnswersQuery.error ? (
                    <Alert className="border-destructive/30">
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        {getFriendlyErrorMessage()}
                      </AlertDescription>
                    </Alert>
                  ) : selectedCheckinAnswersQuery.data &&
                    selectedCheckinAnswersQuery.data.length > 0 ? (
                    <div className="space-y-3">
                      {selectedCheckinAnswersQuery.data.map((answer, index) => (
                        <div
                          key={answer.id}
                          className="grid gap-2 rounded-2xl border border-border/60 bg-muted/15 px-4 py-3 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] sm:gap-4"
                        >
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Prompt {index + 1}
                            </p>
                            <p className="text-sm font-medium leading-6 text-foreground">
                              {answer.question?.question_text ??
                                answer.question?.prompt ??
                                "Question"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Answer
                            </p>
                            <p className="rounded-xl border border-border/50 bg-background/45 px-3 py-2 text-sm leading-6 text-foreground">
                              {renderCheckinAnswerValue(answer)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
                      No responses recorded.
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="photos" className="mt-0">
                <div className="rounded-[24px] border border-border/70 bg-card/70 p-4">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Photos
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Review required views first, then open any image for a
                      closer look.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1">
                        Uploaded: {selectedCheckinSubmittedPhotoCount}
                      </span>
                      <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1">
                        Missing required: {selectedCheckinMissingPhotoCount}
                      </span>
                    </div>
                  </div>

                  {selectedCheckinPhotosQuery.isLoading ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
                      <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
                      <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
                    </div>
                  ) : selectedCheckinPhotosQuery.error ? (
                    <Alert className="border-destructive/30">
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        Unable to load review photos right now.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {selectedCheckinPhotoCards.map((card) => {
                        const photo = card.photo;
                        const loadFailed = photo
                          ? reviewPhotoLoadErrors[photo.id] === true
                          : false;
                        const isUnavailable =
                          card.isMissing || !photo?.url || loadFailed;
                        return (
                          <div
                            key={card.id}
                            className="space-y-2 rounded-2xl border border-border/60 bg-muted/15 p-2"
                          >
                            {isUnavailable ? (
                              <div className="flex aspect-[4/5] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 text-center text-xs text-muted-foreground">
                                <div className="space-y-1">
                                  <div className="font-medium text-foreground">
                                    {card.label}
                                  </div>
                                  <div>
                                    {card.isMissing
                                      ? "No image uploaded"
                                      : "Image unavailable"}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="block w-full overflow-hidden rounded-xl border border-border/60 bg-background transition hover:border-border hover:shadow-sm"
                                onClick={() => setReviewPhotoPreview(photo)}
                              >
                                <img
                                  src={photo.url}
                                  alt={`${card.label} progress photo`}
                                  className="aspect-[4/5] w-full object-cover"
                                  onError={() =>
                                    setReviewPhotoLoadErrors((current) => ({
                                      ...current,
                                      [photo.id]: true,
                                    }))
                                  }
                                />
                              </button>
                            )}
                            <div className="flex items-center justify-between gap-2 px-1">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {card.label}
                              </p>
                              {!isUnavailable ? (
                                <button
                                  type="button"
                                  className="text-[11px] font-medium text-foreground underline-offset-4 hover:underline"
                                  onClick={() => setReviewPhotoPreview(photo)}
                                >
                                  Preview
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="notes" className="mt-0">
                <div
                  className={cn(
                    "rounded-[24px] border bg-card/70 p-4",
                    selectedCheckinNotesRequired
                      ? "border-warning/50 bg-warning/5"
                      : "border-border/70",
                  )}
                >
                  <div className="mb-4 space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Notes
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Notes are required before this review can be completed.
                    </p>
                  </div>

                  <textarea
                    className={cn(
                      "min-h-[320px] w-full rounded-2xl border bg-background px-3 py-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selectedCheckinNotesRequired
                        ? "border-warning/60"
                        : "border-border",
                    )}
                    value={feedbackText}
                    onChange={(event) => {
                      setFeedbackText(event.target.value);
                      if (
                        feedbackValidationMessage &&
                        event.target.value.trim().length > 0
                      ) {
                        setFeedbackValidationMessage(null);
                      }
                    }}
                    placeholder="Summarize the client's check-in, key observations, and the coaching direction you want captured in the review."
                  />

                  <div className="mt-3 space-y-2 text-xs">
                    {feedbackValidationMessage ? (
                      <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-warning-foreground">
                        {feedbackValidationMessage}
                      </div>
                    ) : null}
                    {selectedCheckinNotesRequired ? (
                      <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-muted-foreground">
                        Add review notes to enable final review completion.
                      </div>
                    ) : null}
                    {feedbackMessage ? (
                      <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-muted-foreground">
                        {feedbackMessage}
                      </div>
                    ) : null}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="shrink-0 border-t border-border/70 bg-card/95 px-6 py-4 backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {selectedCheckin?.submitted_at
                  ? selectedCheckinNotesRequired
                    ? "Review notes are required before final completion."
                    : selectedCheckinMissingPhotoCount > 0
                      ? "Required photo views are still missing, so review this submission with that context before finalizing."
                      : "Draft notes can be saved anytime. Final review completion stays locked to a non-empty note."
                  : "Client submission is required before this review can be completed."}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="secondary"
                  onClick={() => setReviewOpen(false)}
                >
                  Close
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleSaveCheckinReview(false)}
                  disabled={
                    feedbackStatus === "saving_draft" ||
                    feedbackStatus === "marking_reviewed" ||
                    !selectedCheckin?.submitted_at
                  }
                >
                  {feedbackStatus === "saving_draft"
                    ? "Saving..."
                    : "Save notes draft"}
                </Button>
                <Button
                  onClick={() => handleSaveCheckinReview(true)}
                  disabled={
                    feedbackStatus === "saving_draft" ||
                    feedbackStatus === "marking_reviewed" ||
                    !selectedCheckin?.submitted_at
                  }
                >
                  {feedbackStatus === "marking_reviewed"
                    ? "Saving..."
                    : selectedCheckin?.reviewed_at
                      ? "Update review"
                      : "Complete review"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reviewPhotoPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewPhotoPreview(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] w-[min(92vw,820px)] max-w-[820px] overflow-hidden p-0">
          <div className="border-b border-border/70 px-6 py-4 pr-14">
            <DialogTitle className="text-lg">
              {reviewPhotoPreview?.photo_type
                ? `${reviewPhotoPreview.photo_type} photo`
                : "Photo preview"}
            </DialogTitle>
            <DialogDescription>
              Enlarged review photo preview.
            </DialogDescription>
          </div>
          <div className="max-h-[74vh] overflow-auto bg-muted/20 p-4">
            {reviewPhotoPreview?.url ? (
              <img
                src={reviewPhotoPreview.url}
                alt={`${reviewPhotoPreview.photo_type ?? "check-in"} preview`}
                className="mx-auto max-h-[68vh] w-auto max-w-full rounded-2xl object-contain"
              />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                Image unavailable
              </div>
            )}
          </div>
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
            <DialogDescription>
              Set per-client loads for this assignment.
            </DialogDescription>
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
                    <p className="text-sm font-semibold">
                      {row.exercise?.name ?? "Exercise"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Client load and notes
                    </p>
                  </div>
                  <Input
                    value={row.loadNotes}
                    onChange={(event) =>
                      handleLoadNotesChange(row.id, event.target.value)
                    }
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
            <Button
              onClick={handleSaveLoads}
              disabled={loadsStatus === "saving"}
            >
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
              variant="secondary"
              onClick={handleDeleteWorkout}
              disabled={assignStatus === "saving"}
            >
              {assignStatus === "saving" ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={lifecycleDialogOpen}
        onOpenChange={(open) => {
          setLifecycleDialogOpen(open);
          if (!open) {
            setLifecycleValidationMessage(null);
            setLifecycleActionStatus("idle");
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Update lifecycle</DialogTitle>
            <DialogDescription>
              Keep lifecycle intent explicit so this client is filtered and
              surfaced correctly across PT Hub and the workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                New lifecycle
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge
                  variant={getClientLifecycleMeta(lifecycleTargetState).variant}
                >
                  {getClientLifecycleMeta(lifecycleTargetState).label}
                </Badge>
                {clientOperationalQuery.data?.has_overdue_checkin ? (
                  <Badge variant="warning">
                    {clientOperationalQuery.data.overdue_checkins_count ?? 0}{" "}
                    overdue
                  </Badge>
                ) : null}
              </div>
            </div>
            {["paused", "churned"].includes(lifecycleTargetState) ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  {lifecycleTargetState === "paused"
                    ? "Pause reason"
                    : "Churn reason"}
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={lifecycleReason}
                  onChange={(event) => {
                    setLifecycleReason(event.target.value);
                    if (lifecycleValidationMessage) {
                      setLifecycleValidationMessage(null);
                    }
                  }}
                  placeholder={
                    lifecycleTargetState === "paused"
                      ? "Why is this client paused right now?"
                      : "Why did this client churn?"
                  }
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This will update lifecycle badges, smart filters, and PT Hub
                visibility for the client.
              </p>
            )}
            {lifecycleValidationMessage ? (
              <p className="text-sm text-destructive">
                {lifecycleValidationMessage}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setLifecycleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLifecycleSave}
              disabled={lifecycleActionStatus === "saving"}
            >
              {lifecycleActionStatus === "saving"
                ? "Saving..."
                : "Save lifecycle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={profileEditOpen} onOpenChange={setProfileEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit client profile</DialogTitle>
            <DialogDescription>
              Update client profile details. Lifecycle is managed from the
              client actions menu.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Display name
              </label>
              <Input
                value={profileEditForm.display_name}
                onChange={(event) =>
                  setProfileEditForm((prev) => ({
                    ...prev,
                    display_name: event.target.value,
                  }))
                }
                placeholder="Client name"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Goal
              </label>
              <Input
                value={profileEditForm.goal}
                onChange={(event) =>
                  setProfileEditForm((prev) => ({
                    ...prev,
                    goal: event.target.value,
                  }))
                }
                placeholder="Client goal"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Training type
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={profileEditForm.training_type}
                onChange={(event) =>
                  setProfileEditForm((prev) => ({
                    ...prev,
                    training_type: event.target.value,
                  }))
                }
              >
                <option value="">Select</option>
                {trainingTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Timezone
              </label>
              <Input
                value={profileEditForm.timezone}
                onChange={(event) =>
                  setProfileEditForm((prev) => ({
                    ...prev,
                    timezone: event.target.value,
                  }))
                }
                placeholder="e.g., America/New_York"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setProfileEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProfileSave}
              disabled={profileEditStatus === "saving"}
            >
              {profileEditStatus === "saving" ? "Saving..." : "Save changes"}
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
  templatesQuery: QueryResult<
    Array<{ id: string; name: string | null; workout_type_tag: string | null }>
  >;
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
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState(scheduleStartKey);
  const [editOpen, setEditOpen] = useState(false);
  const [editDate, setEditDate] = useState(scheduleStartKey);
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false);
  const [dayNote, setDayNote] = useState("");
  const [dayNoteStatus, setDayNoteStatus] = useState<"idle" | "saving">("idle");
  const [dayNoteMessage, setDayNoteMessage] = useState<string | null>(null);
  const [nutritionAssignOpen, setNutritionAssignOpen] = useState(false);
  const [nutritionAssignDate, setNutritionAssignDate] = useState<string | null>(
    null,
  );
  const [nutritionTemplateId, setNutritionTemplateId] = useState("");
  const [nutritionAssignStatus, setNutritionAssignStatus] = useState<
    "idle" | "saving"
  >("idle");
  const [nutritionAssignError, setNutritionAssignError] = useState<
    string | null
  >(null);
  const [nutritionDayOpen, setNutritionDayOpen] = useState(false);
  const [nutritionDayDate, setNutritionDayDate] = useState<string | null>(null);
  const [nutritionDayMeals, setNutritionDayMeals] = useState<
    Array<{
      id: string;
      meal_name: string | null;
      calories: number | null;
      protein_g: number | null;
      carbs_g: number | null;
      fat_g: number | null;
      logs?: Array<{ is_completed?: boolean }>;
    }>
  >([]);

  useEffect(() => {
    setSelectedKey(scheduleStartKey);
  }, [scheduleStartKey]);

  const scheduleQuery = useQuery({
    queryKey: [
      "pt-client-schedule-week",
      clientId,
      workspaceId,
      scheduleStartKey,
      scheduleEndKey,
    ],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, scheduled_date, status, day_type, coach_note, workout_template:workout_templates!assigned_workouts_workout_template_id_fkey(id, name, workout_type_tag, description)",
        )
        .eq("client_id", clientId ?? "")
        .gte("scheduled_date", scheduleStartKey)
        .lte("scheduled_date", scheduleEndKey)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        scheduled_date: string | null;
        status: string | null;
        day_type?: string | null;
        coach_note?: string | null;
        workout_template:
          | {
              id: string | null;
              name: string | null;
              workout_type_tag: string | null;
              description: string | null;
            }
          | {
              id: string | null;
              name: string | null;
              workout_type_tag: string | null;
              description: string | null;
            }[]
          | null;
      }>;
      return rows.map((row) => ({
        ...row,
        workout_template: getSingleRelation(row.workout_template),
      }));
    },
  });

  const checkinsQuery = useQuery({
    queryKey: [
      "pt-client-checkins-week",
      clientId,
      scheduleStartKey,
      scheduleEndKey,
    ],
    enabled: !!clientId,
    queryFn: async () => {
      const { error: ensureError } = await supabase.rpc(
        "ensure_client_checkins",
        {
          p_client_id: clientId ?? "",
          p_range_start: scheduleStartKey,
          p_range_end: scheduleEndKey,
        },
      );
      if (ensureError) throw ensureError;

      const { data, error } = await supabase
        .from("checkins")
        .select("id, week_ending_saturday, submitted_at")
        .eq("client_id", clientId ?? "")
        .gte("week_ending_saturday", scheduleStartKey)
        .lte("week_ending_saturday", scheduleEndKey)
        .order("week_ending_saturday", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const nutritionTemplatesQuery = useQuery({
    queryKey: ["pt-client-nutrition-templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_templates")
        .select("id, name, duration_weeks")
        .eq("workspace_id", workspaceId ?? "")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const nutritionDaysQuery = useQuery({
    queryKey: [
      "pt-client-nutrition-week",
      clientId,
      scheduleStartKey,
      scheduleEndKey,
    ],
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
          "id, date, meals:assigned_nutrition_meals(id, meal_name, calories, protein_g, carbs_g, fat_g, logs:nutrition_meal_logs(id, is_completed))",
        )
        .in("assigned_nutrition_plan_id", planIds)
        .gte("date", scheduleStartKey)
        .lte("date", scheduleEndKey)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const weekRows = useMemo(() => {
    const rows = Array.from({ length: 14 }).map((_, idx) => {
      const key = addDaysToDateString(scheduleStartKey, idx);
      const match =
        scheduleQuery.data?.find((item) => item.scheduled_date === key) ?? null;
      const checkin =
        checkinsQuery.data?.find((item) => item.week_ending_saturday === key) ??
        null;
      const nutrition =
        nutritionDaysQuery.data?.find((item) => item.date === key) ?? null;
      return { key, workout: match, checkin, nutrition };
    });
    return rows;
  }, [
    scheduleQuery.data,
    checkinsQuery.data,
    nutritionDaysQuery.data,
    scheduleStartKey,
  ]);

  const selectedRow =
    weekRows.find((row) => row.key === selectedKey) ?? weekRows[0];
  const nutritionPreviewKeys = useMemo(() => {
    const base = nutritionAssignDate ?? selectedRow?.key ?? scheduleStartKey;
    return Array.from({ length: 7 }).map((_, idx) =>
      addDaysToDateString(base, idx),
    );
  }, [nutritionAssignDate, scheduleStartKey, selectedRow?.key]);
  const selectedWorkout = selectedRow?.workout ?? null;
  const selectedStatus =
    selectedWorkout?.day_type === "rest"
      ? "rest day"
      : (selectedWorkout?.status ?? (selectedWorkout ? "planned" : "rest day"));
  const selectedTitle =
    selectedWorkout?.day_type === "rest"
      ? "Rest day"
      : (selectedWorkout?.workout_template?.name ?? "Workout");

  const weeklyWorkouts = weekRows.filter(
    (row) => row.workout && row.workout.day_type !== "rest",
  );
  const weeklyCompleted = weeklyWorkouts.filter(
    (row) => row.workout?.status === "completed",
  ).length;
  const weeklyMissed = weeklyWorkouts.filter(
    (row) => row.workout?.status === "skipped",
  ).length;
  const weeklyPlanned = weeklyWorkouts.filter(
    (row) => (row.workout?.status ?? "planned") === "planned",
  ).length;
  const weeklyRest = weekRows.filter(
    (row) => row.workout?.day_type === "rest" || !row.workout,
  ).length;

  const nutritionDayTotals = useMemo(() => {
    return nutritionDayMeals.reduce(
      (acc, meal) => {
        acc.calories += Number(meal.calories ?? 0);
        acc.protein += Number(meal.protein_g ?? 0);
        acc.carbs += Number(meal.carbs_g ?? 0);
        acc.fats += Number(meal.fat_g ?? 0);
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 },
    );
  }, [nutritionDayMeals]);

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
    setDayNote(selectedWorkout?.coach_note ?? "");
    setDayNoteMessage(null);
  }, [selectedKey, selectedWorkout?.coach_note]);

  const handleSaveDayNote = async () => {
    if (!selectedWorkout?.id) {
      setDayNoteMessage("Assign a workout or rest day before saving a note.");
      return;
    }

    setDayNoteStatus("saving");
    setDayNoteMessage(null);

    const { error } = await supabase
      .from("assigned_workouts")
      .update({ coach_note: dayNote.trim() || null })
      .eq("id", selectedWorkout.id);

    if (error) {
      setDayNoteStatus("idle");
      setDayNoteMessage(getErrorMessage(error));
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: [
        "pt-client-schedule-week",
        clientId,
        workspaceId,
        scheduleStartKey,
        scheduleEndKey,
      ],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-week-plan", clientId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-today", clientId],
    });

    setDayNoteStatus("idle");
    setDayNoteMessage(
      dayNote.trim()
        ? "Note saved. Client can now see it."
        : "Note removed from the client view.",
    );
  };
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(false);

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
      title="Client calendar"
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => setIsCalendarCollapsed((prev) => !prev)}
          aria-expanded={!isCalendarCollapsed}
          aria-label={
            isCalendarCollapsed ? "Expand calendar" : "Collapse calendar"
          }
        >
          {isCalendarCollapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      }
    >
      {isCalendarCollapsed ? null : scheduleQuery.isLoading ||
        checkinsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
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
                {weeklyMissed}
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
              const checkin = row.checkin;
              const nutrition = row.nutrition;
              const nutritionMeals =
                (
                  nutrition as {
                    meals?: Array<{ logs?: Array<{ is_completed?: boolean }> }>;
                  } | null
                )?.meals ?? [];
              const nutritionCompleted = nutritionMeals.filter((meal) =>
                (meal.logs ?? []).some((log) => Boolean(log.is_completed)),
              ).length;
              const nutritionStatus = !nutrition
                ? null
                : nutritionMeals.length > 0 &&
                    nutritionCompleted === nutritionMeals.length
                  ? "completed"
                  : "planned";
              const isRestDay = workout?.day_type === "rest";
              const status = isRestDay
                ? "rest day"
                : (workout?.status ?? (workout ? "planned" : "rest day"));
              const title = isRestDay
                ? "Rest day"
                : (workout?.workout_template?.name ?? "Workout");
              const isSelected = row.key === selectedKey;
              const isToday = row.key === todayKey;
              const isPast = row.key < todayKey;
              const isFuture = row.key > todayKey;
              const isSkipped = workout?.status === "skipped";
              const hasSubmittedCheckin = Boolean(checkin?.submitted_at);
              const hasPendingCheckin = Boolean(
                checkin && !checkin.submitted_at,
              );
              const hasScheduledWorkout = Boolean(workout && !isRestDay);
              const isLowInfoRestDay =
                !hasScheduledWorkout &&
                !checkin &&
                !nutrition &&
                !workout?.coach_note;
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
                      ? "border-primary/55 bg-primary/12 shadow-[0_0_0_1px_oklch(var(--primary)/0.24),0_18px_32px_-24px_oklch(var(--primary)/0.8)]"
                      : hasSubmittedCheckin
                        ? "border-emerald-400/35 bg-emerald-500/[0.045] hover:border-emerald-300/45 hover:bg-emerald-500/[0.06]"
                        : isSkipped || hasPendingCheckin
                          ? "border-amber-400/30 bg-amber-500/[0.04] hover:border-amber-300/40 hover:bg-amber-500/[0.055]"
                          : hasScheduledWorkout
                            ? "border-sky-400/25 bg-sky-500/[0.03] hover:border-sky-300/35 hover:bg-sky-500/[0.045]"
                            : isLowInfoRestDay
                              ? "border-border/40 bg-background/18 hover:bg-background/24"
                              : "bg-background/30 hover:bg-muted/40",
                    isToday
                      ? "min-h-[190px] shadow-[0_0_22px_rgba(56,189,248,0.2)]"
                      : "",
                    isPast && !isSelected ? "opacity-70" : "",
                    isFuture && !isSelected ? "opacity-90" : "",
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="uppercase tracking-[0.2em]">
                        {formatWeekday(row.key)} {formatDayNumber(row.key)}
                      </span>
                      {isStreak ? (
                        <Flame className="h-4 w-4 text-amber-300" />
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <p
                        className={cn(
                          "font-semibold text-foreground",
                          isLowInfoRestDay ? "text-sm" : "text-base",
                        )}
                      >
                        {workout ? title : "Rest day"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isRestDay
                          ? isLowInfoRestDay
                            ? "Recovery"
                            : "Planned rest day"
                          : (workout?.workout_template?.workout_type_tag ??
                            "Workout")}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={status} />
                      {hasScheduledWorkout && !isSkipped ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Scheduled
                        </Badge>
                      ) : null}
                      {isSkipped ? (
                        <AlertTriangle className="h-4 w-4 text-amber-300" />
                      ) : null}
                      {isRestDay ? (
                        <Moon className="h-4 w-4 text-sky-200" />
                      ) : null}
                      {workout?.coach_note ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Coach note
                        </Badge>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const meals =
                          (
                            nutrition as {
                              meals?: Array<{
                                id: string;
                                meal_name: string | null;
                                calories: number | null;
                                protein_g: number | null;
                                carbs_g: number | null;
                                fat_g: number | null;
                                logs?: Array<{ is_completed?: boolean }>;
                              }>;
                            } | null
                          )?.meals ?? [];
                        setNutritionDayDate(row.key);
                        setNutritionDayMeals(meals);
                        setNutritionDayOpen(true);
                      }}
                      className="w-full rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-left text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Nutrition</span>
                        {nutritionStatus ? (
                          <StatusPill status={nutritionStatus} />
                        ) : null}
                      </div>
                    </button>

                    {checkin ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={checkin.submitted_at ? "success" : "warning"}
                          className="text-[10px] uppercase"
                        >
                          {checkin.submitted_at
                            ? "Check-in submitted"
                            : "Check-in due"}
                        </Badge>
                      </div>
                    ) : null}

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
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setNutritionAssignDate(row.key);
                          setNutritionAssignOpen(true);
                        }}
                        className="rounded-full border border-border/60 bg-background/50 p-1.5 text-xs"
                      >
                        <Apple className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit scheduled date</DialogTitle>
            <DialogDescription>
              Reschedule this workout for a different day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Date
            </label>
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
              {formatLabel(selectedRow.key)} - {selectedTitle}
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
                onClick={() =>
                  selectedWorkout &&
                  onStatusChange(selectedWorkout.id, "completed")
                }
                disabled={!selectedWorkout}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark complete
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  selectedWorkout &&
                  onStatusChange(selectedWorkout.id, "skipped")
                }
                disabled={!selectedWorkout}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Mark missed
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                PT notes
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={dayNote}
                onChange={(event) => setDayNote(event.target.value)}
                placeholder="Add a coaching note the client can see for this day."
              />
              <div className="text-xs text-muted-foreground">
                {selectedWorkout
                  ? "Visible to the client in their schedule."
                  : "Assign a workout or rest day to save a note."}
              </div>
              {dayNoteMessage ? (
                <div className="text-xs text-muted-foreground">
                  {dayNoteMessage}
                </div>
              ) : null}
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
              <Button
                variant="ghost"
                onClick={handleSaveDayNote}
                disabled={!selectedWorkout || dayNoteStatus === "saving"}
              >
                {dayNoteStatus === "saving" ? "Saving..." : "Save note"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setNutritionAssignDate(selectedRow.key);
                  setNutritionAssignOpen(true);
                }}
              >
                Assign nutrition program
              </Button>
              <Button variant="ghost" onClick={() => setDayDrawerOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={nutritionAssignOpen} onOpenChange={setNutritionAssignOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Assign nutrition program</DialogTitle>
            <DialogDescription>
              Assign a nutrition program for{" "}
              {nutritionAssignDate ?? "selected date"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="date"
              value={nutritionAssignDate ?? ""}
              onChange={(event) => setNutritionAssignDate(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={nutritionTemplateId}
              onChange={(event) => setNutritionTemplateId(event.target.value)}
            >
              <option value="">Select nutrition program</option>
              {(nutritionTemplatesQuery.data ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name ?? "Program"}
                </option>
              ))}
            </select>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs">
              <p className="mb-2 font-semibold text-foreground">
                Next 7 days preview
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {nutritionPreviewKeys.map((key) => {
                  const hasPlan = (nutritionDaysQuery.data ?? []).some(
                    (row) => row.date === key,
                  );
                  return (
                    <div
                      key={key}
                      className={cn(
                        "rounded-md border px-2 py-1 text-center",
                        hasPlan
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/60",
                      )}
                    >
                      {key.slice(5)}
                    </div>
                  );
                })}
              </div>
            </div>
            {nutritionAssignError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                {nutritionAssignError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setNutritionAssignOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={nutritionAssignStatus === "saving"}
              onClick={async () => {
                if (!clientId || !nutritionAssignDate || !nutritionTemplateId) {
                  setNutritionAssignError("Choose template and date.");
                  return;
                }
                setNutritionAssignStatus("saving");
                setNutritionAssignError(null);
                const { error } = await supabase.rpc(
                  "assign_nutrition_template_to_client",
                  {
                    p_client_id: clientId,
                    p_start_date: nutritionAssignDate,
                    p_template_id: nutritionTemplateId,
                  },
                );
                if (error) {
                  setNutritionAssignStatus("idle");
                  setNutritionAssignError(error.message);
                  return;
                }
                await queryClient.invalidateQueries({
                  queryKey: [
                    "pt-client-nutrition-week",
                    clientId,
                    scheduleStartKey,
                    scheduleEndKey,
                  ],
                });
                setNutritionAssignStatus("idle");
                setNutritionAssignOpen(false);
              }}
            >
              {nutritionAssignStatus === "saving"
                ? "Assigning..."
                : "Assign nutrition program"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={nutritionDayOpen} onOpenChange={setNutritionDayOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Nutrition</DialogTitle>
            <DialogDescription>
              {nutritionDayDate
                ? formatLabel(nutritionDayDate)
                : "Selected day"}
            </DialogDescription>
          </DialogHeader>
          {nutritionDayMeals.length === 0 ? (
            <EmptyState
              title="No meals assigned"
              description="No nutrition meals are assigned for this day."
            />
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                <p className="font-semibold text-foreground">Totals</p>
                <p className="mt-1 text-muted-foreground">
                  {Math.round(nutritionDayTotals.calories)} kcal |{" "}
                  {Math.round(nutritionDayTotals.protein)} P |{" "}
                  {Math.round(nutritionDayTotals.carbs)} C |{" "}
                  {Math.round(nutritionDayTotals.fats)} F
                </p>
              </div>
              <div className="space-y-2">
                {nutritionDayMeals.map((meal) => (
                  <div
                    key={meal.id}
                    className="rounded-lg border border-border/60 bg-muted/20 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {meal.meal_name ?? "Meal"}
                      </p>
                      <StatusPill
                        status={
                          (meal.logs ?? []).some((log) =>
                            Boolean(log.is_completed),
                          )
                            ? "completed"
                            : "planned"
                        }
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Math.round(Number(meal.calories ?? 0))} kcal |{" "}
                      {Math.round(Number(meal.protein_g ?? 0))} P |{" "}
                      {Math.round(Number(meal.carbs_g ?? 0))} C |{" "}
                      {Math.round(Number(meal.fat_g ?? 0))} F
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setNutritionDayOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
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
              <label className="text-xs font-semibold text-muted-foreground">
                Date
              </label>
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
                    {template.workout_type_tag
                      ? ` - ${template.workout_type_tag}`
                      : ""}
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
              <label className="text-xs font-semibold text-muted-foreground">
                Notes
              </label>
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
            <Button
              disabled={overrideStatus === "saving"}
              onClick={onSaveOverride}
            >
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
  const metricCards = [
    {
      label: "Weight",
      value: baselineMetricsQuery.data?.weight_kg,
      unit: "kg",
    },
    {
      label: "Height",
      value: baselineMetricsQuery.data?.height_cm,
      unit: "cm",
    },
    {
      label: "Body fat",
      value: baselineMetricsQuery.data?.body_fat_pct,
      unit: "%",
    },
    {
      label: "Waist",
      value: baselineMetricsQuery.data?.waist_cm,
      unit: "cm",
    },
    {
      label: "Chest",
      value: baselineMetricsQuery.data?.chest_cm,
      unit: "cm",
    },
    {
      label: "Hips",
      value: baselineMetricsQuery.data?.hips_cm,
      unit: "cm",
    },
    {
      label: "Thigh",
      value: baselineMetricsQuery.data?.thigh_cm,
      unit: "cm",
    },
    {
      label: "Arm",
      value: baselineMetricsQuery.data?.arm_cm,
      unit: "cm",
    },
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
  ];
  const providedMetricCount = metricCards.filter(
    (metric) => typeof metric.value === "number",
  ).length;
  const markerCount = baselineMarkersQuery.data?.length ?? 0;
  const photoCount = baselinePhotoTypes.filter((type) =>
    Boolean(baselinePhotoMap[type]),
  ).length;

  return (
    <Card className="border-border/70 bg-card/80 xl:col-start-1">
      <CardHeader>
        <CardTitle>Baseline</CardTitle>
        <p className="text-sm text-muted-foreground">
          Latest submitted baseline details.
        </p>
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
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(280px,0.88fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatShortDateTime(
                        baselineEntryQuery.data.submitted_at,
                        "Submitted",
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">
                      Measurements
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {providedMetricCount} of {metricCards.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Markers</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {markerCount > 0 ? `${markerCount} recorded` : "None yet"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Photos</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {photoCount} of {baselinePhotoTypes.length} uploaded
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      Measurements
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Core baseline metrics for quick comparison against future
                      progress updates.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {metricCards.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-xl border border-border/50 bg-muted/15 p-3"
                      >
                        <p className="text-xs text-muted-foreground">
                          {metric.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {typeof metric.value === "number"
                            ? `${metric.value} ${metric.unit}`
                            : "Not provided"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      Performance markers
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Extra benchmark markers submitted with this baseline.
                    </p>
                  </div>
                  {baselineMarkersQuery.data &&
                  baselineMarkersQuery.data.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {baselineMarkersQuery.data.map((marker, index) => (
                        <div
                          key={`${marker.template?.name ?? "marker"}-${index}`}
                          className="rounded-xl border border-border/50 bg-muted/15 p-3 text-sm"
                        >
                          <p className="text-xs text-muted-foreground">
                            {marker.template?.name ?? "Marker"}
                          </p>
                          <p className="mt-1 font-semibold text-foreground">
                            {marker.value_number !== null &&
                            marker.value_number !== undefined
                              ? marker.value_number
                              : (marker.value_text ?? "Not provided")}
                            {marker.template?.unit_label
                              ? ` ${marker.template.unit_label}`
                              : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No performance markers submitted"
                      description="Any extra benchmark markers will appear here once the client includes them in the baseline."
                      centered={false}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      Baseline photos
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Keep a quick visual reference alongside the written
                      baseline.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {baselinePhotoTypes.map((type) => (
                      <div key={type} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {type[0]?.toUpperCase()}
                            {type.slice(1)} view
                          </p>
                          <Badge
                            variant={
                              baselinePhotoMap[type] ? "secondary" : "muted"
                            }
                          >
                            {baselinePhotoMap[type] ? "Uploaded" : "Missing"}
                          </Badge>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                          {baselinePhotoMap[type] ? (
                            <img
                              src={baselinePhotoMap[type] ?? ""}
                              alt={`${type} baseline`}
                              className="aspect-[4/5] w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-[4/5] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                              No {type} photo uploaded.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      Coach readout
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Capture the interpretation you want to keep with this
                      baseline for future programming decisions.
                    </p>
                  </div>
                  <textarea
                    className="min-h-[160px] w-full rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={baselineNotes}
                    onChange={(event) => onNotesChange(event.target.value)}
                    placeholder="Summarize posture, readiness, physique observations, or any coaching notes you want visible during future reviews."
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={baselineNotesStatus === "saving"}
                      onClick={onNotesSave}
                    >
                      {baselineNotesStatus === "saving"
                        ? "Saving..."
                        : "Save coach notes"}
                    </Button>
                    {baselineNotesMessage ? (
                      <span className="text-xs text-muted-foreground">
                        {baselineNotesMessage}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Notes stay attached to this baseline entry.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No baseline submitted yet"
            description="This client has not completed the initial assessment. Measurements, markers, and progress photos will appear here after the first baseline submission."
          />
        )}
      </CardContent>
    </Card>
  );
}

function PtClientCheckinsTab({
  rows,
  todayKey,
  isLoading,
  error,
  canLoadMore,
  onLoadMore,
  onReview,
}: {
  rows: CheckinRow[];
  todayKey: string;
  isLoading: boolean;
  error: unknown;
  canLoadMore: boolean;
  onLoadMore: () => void;
  onReview: (checkin: CheckinRow) => void;
}) {
  const orderedRows = useMemo(() => {
    const priority = new Map([
      ["submitted", 0],
      ["overdue", 1],
      ["reviewed", 2],
      ["due", 3],
    ]);
    return [...rows].sort((a, b) => {
      const statusA = getCheckinReviewState(a, todayKey);
      const statusB = getCheckinReviewState(b, todayKey);
      const rankDiff =
        (priority.get(statusA) ?? 99) - (priority.get(statusB) ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return String(b.week_ending_saturday ?? "").localeCompare(
        String(a.week_ending_saturday ?? ""),
      );
    });
  }, [rows, todayKey]);

  const counts = useMemo(
    () =>
      orderedRows.reduce(
        (acc, checkin) => {
          const status = getCheckinReviewState(checkin, todayKey);
          if (status === "submitted") acc.submitted += 1;
          if (status === "reviewed") acc.reviewed += 1;
          if (status === "overdue") acc.overdue += 1;
          if (status === "due") acc.awaitingClient += 1;
          return acc;
        },
        {
          submitted: 0,
          reviewed: 0,
          overdue: 0,
          awaitingClient: 0,
        },
      ),
    [orderedRows, todayKey],
  );

  return (
    <Card className="border-border/70 bg-card/80 xl:col-start-1">
      <CardHeader>
        <CardTitle>Check-ins</CardTitle>
        <p className="text-sm text-muted-foreground">
          Review queue with urgency, submission timing, and next actions for
          each cycle.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {getFriendlyErrorMessage()}
          </div>
        ) : orderedRows.length > 0 ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Needs review</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {counts.submitted}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {counts.overdue}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Awaiting client</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {counts.awaitingClient}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Reviewed</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {counts.reviewed}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {orderedRows.map((checkin) => {
                const status = getCheckinReviewState(checkin, todayKey);
                const canReview =
                  status === "submitted" || status === "reviewed";
                const dueLabel = formatShortDate(
                  checkin.week_ending_saturday,
                  "Scheduled check-in",
                );
                const rowSummary = checkin.reviewed_at
                  ? `Reviewed ${formatRelativeTime(checkin.reviewed_at)}`
                  : checkin.submitted_at
                    ? `Submitted ${formatRelativeTime(checkin.submitted_at)}`
                    : status === "overdue"
                      ? "Submission is overdue"
                      : "Waiting on client submission";
                const secondarySummary = checkin.reviewed_at
                  ? `Reviewed at ${formatShortDateTime(checkin.reviewed_at)}`
                  : checkin.submitted_at
                    ? `Submitted at ${formatShortDateTime(checkin.submitted_at)}`
                    : `Due ${dueLabel}`;

                return (
                  <div
                    key={checkin.id}
                    role={canReview ? "button" : undefined}
                    tabIndex={canReview ? 0 : undefined}
                    onClick={() => {
                      if (canReview) onReview(checkin);
                    }}
                    onKeyDown={(event) => {
                      if (!canReview) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onReview(checkin);
                      }
                    }}
                    className="flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/35 p-4 text-left transition hover:border-border hover:bg-background/55"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {dueLabel}
                        </p>
                        <StatusPill
                          status={status}
                          statusMap={checkinReviewStatusMap}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {rowSummary}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1">
                          Due window: {dueLabel}
                        </span>
                        <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1">
                          {secondarySummary}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      {canReview ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            onReview(checkin);
                          }}
                        >
                          {status === "reviewed" ? "Open review" : "Review now"}
                        </Button>
                      ) : (
                        <Badge
                          variant={status === "overdue" ? "danger" : "muted"}
                        >
                          {status === "overdue"
                            ? "Follow up with client"
                            : "Waiting on client"}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {canLoadMore ? (
              <div className="flex justify-center pt-1">
                <Button variant="secondary" size="sm" onClick={onLoadMore}>
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="No check-ins assigned yet"
            description="Scheduled check-ins will appear here once a template and cadence are active for this client."
          />
        )}
      </CardContent>
    </Card>
  );
}

function PtClientHabitsTab({
  habitsQuery,
  hasAnyHabits,
  habitsToday,
  habitStreak,
}: {
  habitsQuery: QueryResult<HabitLog[]>;
  hasAnyHabits: boolean;
  habitsToday: string;
  habitStreak: number;
}) {
  const [selectedHabitMetric, setSelectedHabitMetric] = useState<{
    metric: HabitMetricKey;
    dateKey: string;
  } | null>(null);

  const weeklyDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) =>
      addDaysToDateString(habitsToday, -(6 - idx)),
    );
  }, [habitsToday]);
  const weeklyLogMap = useMemo(() => {
    const map = new Map<string, HabitLog>();
    (habitsQuery.data ?? []).forEach((log) => {
      map.set(log.log_date, log);
    });
    return map;
  }, [habitsQuery.data]);
  const weeklyRows = useMemo(
    () =>
      weeklyDates.map((dateKey) => ({
        dateKey,
        log: weeklyLogMap.get(dateKey) ?? null,
      })),
    [weeklyDates, weeklyLogMap],
  );
  const loggedDays = weeklyRows.filter((row) => row.log).length;
  const adherencePct = Math.round((loggedDays / 7) * 100);
  const average = (values: Array<number | null | undefined>) => {
    const nums = values.filter(
      (value) => typeof value === "number",
    ) as number[];
    if (nums.length === 0) return null;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
  };
  const avgSteps = average(weeklyRows.map((row) => row.log?.steps));
  const avgProtein = average(weeklyRows.map((row) => row.log?.protein_g));

  const habitMetricTrend = useMemo(() => {
    if (!selectedHabitMetric) return null;
    const habitMetricConfig: Record<
      HabitMetricKey,
      {
        label: string;
        extract: (log: HabitLog) => number | null;
        format: (value: number, weightUnit?: string | null) => string;
      }
    > = {
      calories: {
        label: "Calories",
        extract: (log) =>
          typeof log.calories === "number" ? log.calories : null,
        format: (value) => Math.round(value).toString(),
      },
      protein_g: {
        label: "Protein",
        extract: (log) =>
          typeof log.protein_g === "number" ? log.protein_g : null,
        format: (value) => `${Math.round(value)} g`,
      },
      carbs_g: {
        label: "Carbs",
        extract: (log) =>
          typeof log.carbs_g === "number" ? log.carbs_g : null,
        format: (value) => `${Math.round(value)} g`,
      },
      fats_g: {
        label: "Fats",
        extract: (log) => (typeof log.fats_g === "number" ? log.fats_g : null),
        format: (value) => `${Math.round(value)} g`,
      },
      weight_value: {
        label: "Weight",
        extract: (log) =>
          typeof log.weight_value === "number" ? log.weight_value : null,
        format: (value, weightUnit) =>
          `${value.toFixed(1)} ${weightUnit ?? ""}`.trim(),
      },
      steps: {
        label: "Steps",
        extract: (log) => (typeof log.steps === "number" ? log.steps : null),
        format: (value) => Math.round(value).toLocaleString(),
      },
      sleep_hours: {
        label: "Sleep",
        extract: (log) =>
          typeof log.sleep_hours === "number" ? log.sleep_hours : null,
        format: (value) => `${value.toFixed(1)} hrs`,
      },
      energy: {
        label: "Energy",
        extract: (log) => (typeof log.energy === "number" ? log.energy : null),
        format: (value) => value.toFixed(0),
      },
      hunger: {
        label: "Hunger",
        extract: (log) => (typeof log.hunger === "number" ? log.hunger : null),
        format: (value) => value.toFixed(0),
      },
      stress: {
        label: "Stress",
        extract: (log) => (typeof log.stress === "number" ? log.stress : null),
        format: (value) => value.toFixed(0),
      },
    };
    const config = habitMetricConfig[selectedHabitMetric.metric];
    const weightUnit =
      selectedHabitMetric.metric === "weight_value"
        ? (weeklyRows.find((row) => row.log?.weight_unit)?.log?.weight_unit ??
          null)
        : null;

    const points = weeklyRows
      .map((row) => ({
        date: row.dateKey,
        value: row.log ? config.extract(row.log) : null,
      }))
      .filter(
        (point): point is { date: string; value: number } =>
          typeof point.value === "number",
      );

    const selectedPoint =
      points.find((point) => point.date === selectedHabitMetric.dateKey) ??
      null;
    const latest = points.length > 0 ? points[points.length - 1].value : null;
    const earliest = points.length > 0 ? points[0].value : null;
    const averageValue =
      points.length > 0
        ? points.reduce((sum, point) => sum + point.value, 0) / points.length
        : null;
    const delta =
      latest !== null && earliest !== null ? latest - earliest : null;
    const coveragePct = Math.round((points.length / 7) * 100);

    return {
      label: config.label,
      weightUnit,
      points,
      selectedPoint,
      latest,
      averageValue,
      delta,
      coveragePct,
      format: config.format,
    };
  }, [selectedHabitMetric, weeklyRows]);

  return (
    <div className="space-y-6">
      <DashboardCard title="Weekly summary" subtitle="Last 7 days.">
        {habitsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Adherence"
                value={`${Number.isFinite(adherencePct) ? adherencePct : 0}%`}
                helper="Logged days / 7"
                icon={Sparkles}
              />
              <StatCard
                label="Streak"
                value={`${habitStreak} days`}
                helper="Days logged in a row"
                icon={Rocket}
              />
              <StatCard
                label="Avg steps / protein"
                value={
                  avgSteps !== null || avgProtein !== null
                    ? `${avgSteps !== null ? Math.round(avgSteps).toLocaleString() : "--"} / ${
                        avgProtein !== null
                          ? `${Math.round(avgProtein)}g`
                          : "--"
                      }`
                    : "--"
                }
                helper="7-day averages"
                icon={Flame}
              />
            </div>
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Day-by-day" subtitle="Last 7 days of habit logs.">
        {habitsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            {!hasAnyHabits ? (
              <EmptyState
                title="No habit logs yet"
                description="Logs will appear as the client checks in."
              />
            ) : null}
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-11 gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                <span>Date</span>
                <span>Calories</span>
                <span>Protein</span>
                <span>Carbs</span>
                <span>Fats</span>
                <span>Weight</span>
                <span>Steps</span>
                <span>Sleep</span>
                <span>Energy</span>
                <span>Hunger</span>
                <span>Stress</span>
              </div>
              {weeklyRows.map((row) => {
                const log = row.log;
                const muted = !log;
                return (
                  <div
                    key={row.dateKey}
                    className={cn(
                      "grid grid-cols-11 gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0",
                      muted && "text-muted-foreground",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {row.dateKey}
                      </span>
                    </div>
                    <span>
                      {typeof log?.calories === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "calories",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.calories}
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.protein_g === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "protein_g",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.protein_g} g
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.carbs_g === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "carbs_g",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.carbs_g} g
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.fats_g === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "fats_g",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.fats_g} g
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.weight_value === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "weight_value",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.weight_value} {log.weight_unit ?? ""}
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.steps === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "steps",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.steps.toLocaleString()}
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.sleep_hours === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "sleep_hours",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.sleep_hours} hrs
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.energy === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "energy",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.energy}
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.hunger === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "hunger",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.hunger}
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                    <span>
                      {typeof log?.stress === "number" ? (
                        <button
                          type="button"
                          className="font-medium hover:text-foreground/80"
                          onClick={() =>
                            setSelectedHabitMetric({
                              metric: "stress",
                              dateKey: row.dateKey,
                            })
                          }
                        >
                          {log.stress}
                        </button>
                      ) : (
                        "--"
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DashboardCard>

      <Dialog
        open={selectedHabitMetric !== null}
        onOpenChange={(open) => (!open ? setSelectedHabitMetric(null) : null)}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {habitMetricTrend
                ? `${habitMetricTrend.label} trend`
                : "Habit trend"}
            </DialogTitle>
            <DialogDescription>
              {selectedHabitMetric
                ? `Clicked ${selectedHabitMetric.dateKey}. Showing last 7 days for this metric.`
                : "Showing last 7 days for this metric."}
            </DialogDescription>
          </DialogHeader>
          {habitMetricTrend ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Selected day</p>
                  <p className="text-base font-semibold">
                    {habitMetricTrend.selectedPoint
                      ? habitMetricTrend.format(
                          habitMetricTrend.selectedPoint.value,
                          habitMetricTrend.weightUnit,
                        )
                      : "No data"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Latest</p>
                  <p className="text-base font-semibold">
                    {habitMetricTrend.latest !== null
                      ? habitMetricTrend.format(
                          habitMetricTrend.latest,
                          habitMetricTrend.weightUnit,
                        )
                      : "No data"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">7-day average</p>
                  <p className="text-base font-semibold">
                    {habitMetricTrend.averageValue !== null
                      ? habitMetricTrend.format(
                          habitMetricTrend.averageValue,
                          habitMetricTrend.weightUnit,
                        )
                      : "No data"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Change (first to latest)
                  </p>
                  <p className="text-base font-semibold">
                    {habitMetricTrend.delta !== null
                      ? `${habitMetricTrend.delta > 0 ? "+" : ""}${habitMetricTrend.format(
                          habitMetricTrend.delta,
                          habitMetricTrend.weightUnit,
                        )}`
                      : "No data"}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Coverage</p>
                <p className="text-base font-semibold">
                  {habitMetricTrend.coveragePct}% of days
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Day-by-day
                </p>
                {habitMetricTrend.points.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No entries in the last 7 days.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {habitMetricTrend.points.map((point) => (
                      <div
                        key={point.date}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">
                          {point.date}
                        </span>
                        <span className="font-medium">
                          {habitMetricTrend.format(
                            point.value,
                            habitMetricTrend.weightUnit,
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PtClientPlanTab({
  templatesQuery,
  programTemplatesQuery,
  activeProgram,
  pausedProgram,
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
  onPauseProgram,
  onResumeProgram,
  onSwitchProgramMidCycle,
  onUnassignProgram,
  onOpenOverride,
  onEdit,
  onDelete,
  onEditLoads,
  onStatusChange,
}: {
  templatesQuery: QueryResult<
    Array<{ id: string; name: string | null; workout_type_tag: string | null }>
  >;
  programTemplatesQuery: QueryResult<ProgramTemplateRow[]>;
  activeProgram: ClientProgramRow | null;
  pausedProgram: ClientProgramRow | null;
  programOverrides: ProgramOverrideRow[];
  upcomingQuery: QueryResult<UpcomingWorkoutRow[]>;
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
  onPauseProgram: () => void;
  onResumeProgram: () => void;
  onSwitchProgramMidCycle: () => void;
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
  onStatusChange: (id: string, status: "completed" | "skipped") => void;
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
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
              ) : programTemplatesQuery.data &&
                programTemplatesQuery.data.length === 0 ? (
                <EmptyState
                  title="No program templates yet."
                  description="Create a program template to start scheduling multi-week blocks."
                />
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Program
                    </label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedProgramId}
                      onChange={(event) => onProgramChange(event.target.value)}
                    >
                      <option value="">Select a program</option>
                      {programTemplatesQuery.data?.map((program) => (
                        <option key={program.id} value={program.id}>
                          {program.name ?? "Program"}{" "}
                          {program.weeks_count
                            ? `- ${program.weeks_count}w`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Start date
                    </label>
                    <input
                      type="date"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={programStartDate}
                      onChange={(event) =>
                        onProgramDateChange(event.target.value)
                      }
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={
                      programStatus === "saving" ||
                      !selectedProgramId ||
                      !programStartDate
                    }
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
                      <div className="mt-3 grid gap-2">
                        <Button
                          className="w-full"
                          variant="secondary"
                          disabled={
                            unassignStatus === "saving" ||
                            programStatus === "saving"
                          }
                          onClick={onPauseProgram}
                        >
                          {programStatus === "saving"
                            ? "Updating..."
                            : "Pause program"}
                        </Button>
                        <Button
                          className="w-full"
                          variant="ghost"
                          disabled={
                            unassignStatus === "saving" ||
                            programStatus === "saving"
                          }
                          onClick={onUnassignProgram}
                        >
                          {unassignStatus === "saving"
                            ? "Unassigning..."
                            : "Unassign program"}
                        </Button>
                      </div>
                    </div>
                  ) : pausedProgram ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Paused program</span>
                        <StatusPill status="paused" />
                      </div>
                      <div className="mt-2 text-sm text-foreground">
                        {pausedProgram.program_template?.name ?? "Program"}
                      </div>
                      <div className="mt-1">
                        Start date {pausedProgram.start_date ?? "--"}
                      </div>
                      <div className="mt-3 grid gap-2">
                        <Button
                          className="w-full"
                          variant="secondary"
                          disabled={programStatus === "saving"}
                          onClick={onResumeProgram}
                        >
                          {programStatus === "saving"
                            ? "Updating..."
                            : "Resume program"}
                        </Button>
                        <Button
                          className="w-full"
                          variant="ghost"
                          disabled={
                            unassignStatus === "saving" ||
                            programStatus === "saving"
                          }
                          onClick={onUnassignProgram}
                        >
                          {unassignStatus === "saving"
                            ? "Unassigning..."
                            : "Unassign program"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {activeProgram &&
                  selectedProgramId &&
                  selectedProgramId !== activeProgram.program_template_id ? (
                    <Button
                      className="w-full"
                      variant="secondary"
                      disabled={programStatus === "saving"}
                      onClick={onSwitchProgramMidCycle}
                    >
                      {programStatus === "saving"
                        ? "Switching..."
                        : "Switch program from today"}
                    </Button>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
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
                          {template.workout_type_tag
                            ? ` - ${template.workout_type_tag}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Date
                    </label>
                    <input
                      type="date"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={scheduledDate}
                      onChange={(event) => onDateChange(event.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={
                      assignStatus === "saving" ||
                      !selectedTemplateId ||
                      !scheduledDate
                    }
                    onClick={onAssign}
                  >
                    {assignStatus === "saving"
                      ? "Assigning..."
                      : "Assign workout"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
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
              const title = isRestDay
                ? "Rest day"
                : (workout.workout_template?.name ?? "Workout");
              const dateLabel = workout.scheduled_date
                ? new Date(workout.scheduled_date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "Scheduled";
              const canOverride = Boolean(workout.scheduled_date);
              return (
                <div key={workout.id} className="surface-subtle p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{title}</div>
                      <div className="text-xs text-muted-foreground">
                        {dateLabel}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={override ? "secondary" : "muted"}
                        className="text-[10px] uppercase"
                      >
                        {override ? "Override" : "Scheduled"}
                      </Badge>
                      <StatusPill
                        status={
                          isRestDay ? "rest day" : (workout.status ?? "planned")
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canOverride}
                      onClick={() =>
                        onOpenOverride(workout.scheduled_date ?? "")
                      }
                    >
                      Override
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEditLoads(workout.id)}
                    >
                      Edit loads
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(workout)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(workout.id)}
                    >
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
                      variant="ghost"
                      onClick={() => onStatusChange(workout.id, "skipped")}
                    >
                      Skip
                    </Button>
                  </div>
                  {isRestDay ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Rest day.
                    </div>
                  ) : workout.assigned_workout_exercises &&
                    workout.assigned_workout_exercises.length > 0 ? (
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {workout.assigned_workout_exercises.map((row) => {
                        const exerciseId = row.exercise?.id ?? "";
                        const lastSet = lastSetByWorkoutExercise.get(
                          `${workout.id}-${exerciseId}`,
                        );
                        const performed =
                          lastSet &&
                          (typeof lastSet.reps === "number" ||
                            typeof lastSet.weight === "number")
                            ? `${lastSet.reps ?? "-"} reps @ ${lastSet.weight ?? "-"}`
                            : "No sets logged";
                        const label = row.exercise?.name ?? "Exercise";
                        const sets = row.sets ? `${row.sets}x` : "";
                        const reps = row.reps ?? "";
                        const repLine = sets || reps ? `${sets}${reps}` : "";
                        return (
                          <div
                            key={row.id}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span className="font-semibold text-foreground">
                              {label}
                            </span>
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

function PtClientNutritionTab({
  clientId,
  workspaceId,
  todayKey,
}: {
  clientId: string | null;
  workspaceId: string | null;
  todayKey: string;
}) {
  const queryClient = useQueryClient();
  const [selectedNutritionProgramId, setSelectedNutritionProgramId] =
    useState("");
  const [nutritionProgramStartDate, setNutritionProgramStartDate] =
    useState(todayKey);
  const [nutritionAssignStatus, setNutritionAssignStatus] = useState<
    "idle" | "saving"
  >("idle");
  const [nutritionAssignError, setNutritionAssignError] = useState<
    string | null
  >(null);

  const nutritionProgramsQuery = useQuery({
    queryKey: ["pt-client-nutrition-programs", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_templates")
        .select("id, name, duration_weeks")
        .eq("workspace_id", workspaceId ?? "")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeNutritionPlanQuery = useQuery({
    queryKey: ["pt-client-active-nutrition-plan", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_nutrition_plans")
        .select(
          "id, start_date, end_date, status, nutrition_template:nutrition_templates(id, name, duration_weeks)",
        )
        .eq("client_id", clientId ?? "")
        .order("start_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = (data ?? [])[0] as
        | {
            id: string;
            start_date: string | null;
            end_date: string | null;
            status: string | null;
            nutrition_template:
              | {
                  id: string | null;
                  name: string | null;
                  duration_weeks: number | null;
                }
              | {
                  id: string | null;
                  name: string | null;
                  duration_weeks: number | null;
                }[]
              | null;
          }
        | undefined;
      if (!row) return null;
      return {
        ...row,
        nutrition_template: getSingleRelation(row.nutrition_template),
      };
    },
  });

  const nutritionNext7Query = useQuery({
    queryKey: ["pt-client-nutrition-next-7", clientId, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: plans, error: plansError } = await supabase
        .from("assigned_nutrition_plans")
        .select("id")
        .eq("client_id", clientId ?? "");
      if (plansError) throw plansError;

      const planIds = (plans ?? []).map((row: { id: string }) => row.id);
      if (!planIds.length) return [];

      const end = addDaysToDateString(todayKey, 6);
      const { data, error } = await supabase
        .from("assigned_nutrition_days")
        .select("id, date")
        .in("assigned_nutrition_plan_id", planIds)
        .gte("date", todayKey)
        .lte("date", end);
      if (error) throw error;
      return data ?? [];
    },
  });

  const nutritionPreviewKeys = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, idx) =>
        addDaysToDateString(todayKey, idx),
      ),
    [todayKey],
  );

  return (
    <div className="space-y-6 xl:col-start-1">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Current assignment</CardTitle>
          <p className="text-sm text-muted-foreground">
            Review the active nutrition state before making a new assignment.
          </p>
        </CardHeader>
        <CardContent>
          {activeNutritionPlanQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : activeNutritionPlanQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {getFriendlyErrorMessage()}
            </div>
          ) : activeNutritionPlanQuery.data ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Program</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {activeNutritionPlanQuery.data.nutrition_template?.name ??
                    "Nutrition program"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {activeNutritionPlanQuery.data.status ?? "Active"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Start date</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {activeNutritionPlanQuery.data.start_date ?? "--"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Coverage</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {activeNutritionPlanQuery.data.end_date
                    ? `${activeNutritionPlanQuery.data.start_date ?? "--"} to ${activeNutritionPlanQuery.data.end_date}`
                    : activeNutritionPlanQuery.data.nutrition_template
                          ?.duration_weeks
                      ? `${activeNutritionPlanQuery.data.nutrition_template.duration_weeks} week plan`
                      : "Active assignment"}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No nutrition plan assigned"
              description="Assign a nutrition plan once you're ready to give the client meal guidance."
            />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Assign nutrition program</CardTitle>
          <p className="text-sm text-muted-foreground">
            Assign a multi-week nutrition program to this client.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {nutritionProgramsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : nutritionProgramsQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {getErrorDetails(nutritionProgramsQuery.error).code}:{" "}
              {getErrorDetails(nutritionProgramsQuery.error).message}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Nutrition program
                </label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedNutritionProgramId}
                  onChange={(event) =>
                    setSelectedNutritionProgramId(event.target.value)
                  }
                >
                  <option value="">Select a nutrition program</option>
                  {(nutritionProgramsQuery.data ?? []).map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name ?? "Nutrition Program"}{" "}
                      {program.duration_weeks
                        ? `- ${program.duration_weeks}w`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Start date
                </label>
                <input
                  type="date"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={nutritionProgramStartDate}
                  onChange={(event) =>
                    setNutritionProgramStartDate(event.target.value)
                  }
                />
              </div>
              <Button
                className="w-full"
                disabled={
                  nutritionAssignStatus === "saving" ||
                  !selectedNutritionProgramId ||
                  !nutritionProgramStartDate ||
                  !clientId
                }
                onClick={async () => {
                  if (
                    !clientId ||
                    !selectedNutritionProgramId ||
                    !nutritionProgramStartDate
                  ) {
                    setNutritionAssignError(
                      "Select a nutrition program and start date.",
                    );
                    return;
                  }
                  setNutritionAssignStatus("saving");
                  setNutritionAssignError(null);
                  const { error } = await supabase.rpc(
                    "assign_nutrition_template_to_client",
                    {
                      p_client_id: clientId,
                      p_template_id: selectedNutritionProgramId,
                      p_start_date: nutritionProgramStartDate,
                    },
                  );
                  if (error) {
                    setNutritionAssignStatus("idle");
                    setNutritionAssignError(error.message);
                    return;
                  }
                  await Promise.all([
                    queryClient.invalidateQueries({
                      queryKey: [
                        "pt-client-nutrition-next-7",
                        clientId,
                        todayKey,
                      ],
                    }),
                    queryClient.invalidateQueries({
                      queryKey: ["pt-client-nutrition-week", clientId],
                    }),
                    queryClient.invalidateQueries({
                      queryKey: ["pt-client-active-nutrition-plan", clientId],
                    }),
                  ]);
                  setNutritionAssignStatus("idle");
                }}
              >
                {nutritionAssignStatus === "saving"
                  ? "Assigning..."
                  : "Assign nutrition program"}
              </Button>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs">
                <p className="mb-2 font-semibold text-foreground">
                  Next 7 days preview
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {nutritionPreviewKeys.map((key) => {
                    const hasProgram = (nutritionNext7Query.data ?? []).some(
                      (row) => row.date === key,
                    );
                    return (
                      <div
                        key={key}
                        className={cn(
                          "rounded-md border px-2 py-1 text-center",
                          hasProgram
                            ? "border-primary/60 bg-primary/10"
                            : "border-border/60",
                        )}
                      >
                        {key.slice(5)}
                      </div>
                    );
                  })}
                </div>
              </div>
              {nutritionAssignError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                  {nutritionAssignError}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PtClientLogsTab({
  ptSessionsQuery,
  sessionVolumeById,
  onOpenSession,
  onOpenWorkoutPlanner,
}: {
  ptSessionsQuery: QueryResult<PtWorkoutSessionRow[]>;
  sessionVolumeById: Map<string, number>;
  onOpenSession: (id: string) => void;
  onOpenWorkoutPlanner: () => void;
}) {
  const completedCount =
    ptSessionsQuery.data?.filter((session) => Boolean(session.completed_at))
      .length ?? 0;
  const activeCount =
    ptSessionsQuery.data?.filter((session) => !session.completed_at).length ??
    0;

  return (
    <Card className="border-border/70 bg-card/80 xl:col-start-1">
      <CardHeader>
        <CardTitle>Session logs</CardTitle>
        <p className="text-sm text-muted-foreground">
          Recent recorded sessions, logged volume, and quick drill-in access.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {ptSessionsQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : ptSessionsQuery.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {getErrorDetails(ptSessionsQuery.error).code}:{" "}
            {getErrorDetails(ptSessionsQuery.error).message}
          </div>
        ) : ptSessionsQuery.data && ptSessionsQuery.data.length > 0 ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Recorded sessions
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {ptSessionsQuery.data.length}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {completedCount}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">In progress</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {activeCount}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {ptSessionsQuery.data.map((session) => {
                const dateValue =
                  session.completed_at ??
                  session.started_at ??
                  session.created_at ??
                  null;
                const workoutName =
                  session.assigned_workout?.workout_template?.name ?? "Workout";
                const statusLabel = session.completed_at
                  ? "completed"
                  : (session.assigned_workout?.status ?? "active");
                const volume = sessionVolumeById.get(session.id);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onOpenSession(session.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/35 px-4 py-3 text-left transition hover:border-border hover:bg-background/55"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {workoutName}
                        </p>
                        <StatusPill status={statusLabel} />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1">
                          {formatShortDateTime(dateValue, "No session date")}
                        </span>
                        <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1">
                          Volume:{" "}
                          {typeof volume === "number"
                            ? volume.toFixed(0)
                            : "Not logged"}
                        </span>
                        <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1">
                          Notes: {session.client_notes ? "Added" : "None"}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex h-9 items-center rounded-md border border-border/70 bg-muted/25 px-3 text-sm font-medium text-foreground">
                      Open details
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No session logs yet"
            description="Completed or in-progress client training sessions will appear here once the client starts working through assigned workouts."
            actionLabel="Open workout plan"
            onAction={onOpenWorkoutPlanner}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PtClientProgressTab({
  hasBaselineSubmission,
  onOpenHabits,
  onOpenBaseline,
  onOpenWorkout,
  onOpenCheckins,
}: {
  hasBaselineSubmission: boolean;
  onOpenHabits: () => void;
  onOpenBaseline: () => void;
  onOpenWorkout: () => void;
  onOpenCheckins: () => void;
}) {
  const { clientId } = useParams();
  const todayKey = formatDateKey(new Date());
  const habitsStart = addDaysToDateString(todayKey, -55);
  const sessionsStart = addDaysToDateString(todayKey, -83);
  const checkinsStart = addDaysToDateString(todayKey, -83);

  const progressHabitsQuery = useQuery({
    queryKey: ["pt-client-progress-habits", clientId, habitsStart, todayKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select(
          "log_date, weight_value, weight_unit, steps, sleep_hours, protein_g, calories, energy, hunger, stress",
        )
        .eq("client_id", clientId ?? "")
        .gte("log_date", habitsStart)
        .lte("log_date", todayKey)
        .order("log_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HabitLog[];
    },
  });

  const progressSessionsQuery = useQuery({
    queryKey: [
      "pt-client-progress-sessions",
      clientId,
      sessionsStart,
      todayKey,
    ],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, completed_at, created_at")
        .eq("client_id", clientId ?? "")
        .gte("created_at", `${sessionsStart}T00:00:00.000Z`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        completed_at: string | null;
        created_at: string | null;
      }>;
    },
  });

  const progressSessionIds = useMemo(
    () => (progressSessionsQuery.data ?? []).map((row) => row.id),
    [progressSessionsQuery.data],
  );

  const progressSetLogsQuery = useQuery({
    queryKey: ["pt-client-progress-set-logs", progressSessionIds],
    enabled: progressSessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .select(
          "exercise_id, reps, weight, created_at, exercise:exercises(name), workout_session_id",
        )
        .in("workout_session_id", progressSessionIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        exercise_id: string | null;
        reps: number | null;
        weight: number | null;
        created_at: string | null;
        workout_session_id: string | null;
        exercise: { name: string | null } | { name: string | null }[] | null;
      }>;
    },
  });

  const progressCheckinAnswersQuery = useQuery({
    queryKey: [
      "pt-client-progress-checkin-answers",
      clientId,
      checkinsStart,
      todayKey,
    ],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_answers")
        .select(
          "value_number, value_text, question:checkin_questions(question_text, prompt), checkin:checkins!inner(client_id, week_ending_saturday, submitted_at)",
        )
        .eq("checkin.client_id", clientId ?? "")
        .gte("checkin.week_ending_saturday", checkinsStart)
        .lte("checkin.week_ending_saturday", todayKey);
      if (error) throw error;
      return (data ?? []) as Array<{
        value_number: number | null;
        value_text: string | null;
        question:
          | { question_text: string | null; prompt: string | null }
          | { question_text: string | null; prompt: string | null }[]
          | null;
        checkin:
          | {
              client_id: string | null;
              week_ending_saturday: string | null;
              submitted_at: string | null;
            }
          | {
              client_id: string | null;
              week_ending_saturday: string | null;
              submitted_at: string | null;
            }[]
          | null;
      }>;
    },
  });

  const habitsAnalysis = useMemo(() => {
    const logs = progressHabitsQuery.data ?? [];
    if (logs.length === 0) return null;

    const weightLogs = logs.filter(
      (log) => typeof log.weight_value === "number",
    );
    const stepsLogs = logs.filter((log) => typeof log.steps === "number");
    const midpoint = Math.floor(logs.length / 2);
    const firstHalf = logs.slice(0, midpoint);
    const secondHalf = logs.slice(midpoint);

    const avg = (values: Array<number | null | undefined>) => {
      const nums = values.filter(
        (value) => typeof value === "number",
      ) as number[];
      if (nums.length === 0) return null;
      return nums.reduce((sum, value) => sum + value, 0) / nums.length;
    };

    const firstWeight = weightLogs[0]?.weight_value ?? null;
    const latestWeight =
      weightLogs[weightLogs.length - 1]?.weight_value ?? null;
    const weightChange =
      firstWeight !== null && latestWeight !== null
        ? latestWeight - firstWeight
        : null;
    const weightUnit =
      weightLogs.find((log) => log.weight_unit)?.weight_unit ?? "kg";

    return {
      logsCount: logs.length,
      latestWeight,
      weightChange,
      weightUnit,
      avgStepsFirst: avg(firstHalf.map((log) => log.steps)),
      avgStepsSecond: avg(secondHalf.map((log) => log.steps)),
      avgSleepFirst: avg(firstHalf.map((log) => log.sleep_hours)),
      avgSleepSecond: avg(secondHalf.map((log) => log.sleep_hours)),
      avgProteinFirst: avg(firstHalf.map((log) => log.protein_g)),
      avgProteinSecond: avg(secondHalf.map((log) => log.protein_g)),
      avgCaloriesFirst: avg(firstHalf.map((log) => log.calories)),
      avgCaloriesSecond: avg(secondHalf.map((log) => log.calories)),
      latestSteps:
        stepsLogs.length > 0 ? stepsLogs[stepsLogs.length - 1].steps : null,
      firstSteps: stepsLogs.length > 0 ? stepsLogs[0].steps : null,
    };
  }, [progressHabitsQuery.data]);

  const exerciseImprovements = useMemo(() => {
    const logs = progressSetLogsQuery.data ?? [];
    const byExercise = new Map<
      string,
      Array<{
        created_at: string | null;
        reps: number | null;
        weight: number | null;
        name: string;
      }>
    >();
    logs.forEach((row) => {
      if (!row.exercise_id) return;
      const name = Array.isArray(row.exercise)
        ? (row.exercise[0]?.name ?? "Exercise")
        : (row.exercise?.name ?? "Exercise");
      if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, []);
      byExercise.get(row.exercise_id)?.push({
        created_at: row.created_at ?? null,
        reps: row.reps ?? null,
        weight: row.weight ?? null,
        name,
      });
    });

    const improved: Array<{
      exerciseId: string;
      exerciseName: string;
      startWeight: number;
      latestWeight: number;
      change: number;
    }> = [];

    byExercise.forEach((rows, exerciseId) => {
      const weighted = rows.filter(
        (row) => typeof row.weight === "number",
      ) as Array<(typeof rows)[number] & { weight: number }>;
      if (weighted.length < 2) return;
      const startWeight = weighted[0].weight;
      const latestWeight = weighted[weighted.length - 1].weight;
      if (latestWeight <= startWeight) return;
      improved.push({
        exerciseId,
        exerciseName: rows[0]?.name ?? "Exercise",
        startWeight,
        latestWeight,
        change: latestWeight - startWeight,
      });
    });

    return improved.sort((a, b) => b.change - a.change).slice(0, 6);
  }, [progressSetLogsQuery.data]);

  const checkinQuestionTrends = useMemo(() => {
    const rows = progressCheckinAnswersQuery.data ?? [];
    const byQuestion = new Map<
      string,
      Array<{
        value_number: number | null;
        value_text: string | null;
        date: string | null;
      }>
    >();

    rows.forEach((row) => {
      const question = Array.isArray(row.question)
        ? (row.question[0] ?? null)
        : row.question;
      const checkin = Array.isArray(row.checkin)
        ? (row.checkin[0] ?? null)
        : row.checkin;
      const key = question?.question_text ?? question?.prompt ?? "Question";
      if (!byQuestion.has(key)) byQuestion.set(key, []);
      byQuestion.get(key)?.push({
        value_number: row.value_number ?? null,
        value_text: row.value_text ?? null,
        date: checkin?.week_ending_saturday ?? checkin?.submitted_at ?? null,
      });
    });

    const numericChanges: Array<{
      question: string;
      from: number;
      to: number;
      delta: number;
    }> = [];
    const textChanges: Array<{
      question: string;
      previous: string;
      latest: string;
    }> = [];

    byQuestion.forEach((entries, question) => {
      const ordered = [...entries].sort((a, b) =>
        String(a.date ?? "").localeCompare(String(b.date ?? "")),
      );
      const numeric = ordered.filter(
        (entry) => typeof entry.value_number === "number",
      ) as Array<(typeof ordered)[number] & { value_number: number }>;
      if (numeric.length >= 2) {
        const from = numeric[0].value_number;
        const to = numeric[numeric.length - 1].value_number;
        if (from !== to)
          numericChanges.push({ question, from, to, delta: to - from });
      }

      const texts = ordered
        .map((entry) => entry.value_text?.trim())
        .filter((value): value is string => Boolean(value));
      if (texts.length >= 2) {
        const previous = texts[texts.length - 2];
        const latest = texts[texts.length - 1];
        if (previous !== latest)
          textChanges.push({ question, previous, latest });
      }
    });

    return {
      numeric: numericChanges
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 6),
      text: textChanges.slice(0, 4),
    };
  }, [progressCheckinAnswersQuery.data]);

  const loading =
    progressHabitsQuery.isLoading ||
    progressSessionsQuery.isLoading ||
    progressSetLogsQuery.isLoading ||
    progressCheckinAnswersQuery.isLoading;

  const hasCheckinTrendData =
    checkinQuestionTrends.numeric.length > 0 ||
    checkinQuestionTrends.text.length > 0;
  const hasWorkoutHistory = (progressSessionsQuery.data?.length ?? 0) > 0;
  const trendCards = useMemo(() => {
    const items: Array<{
      label: string;
      value: string;
      helper: string;
      icon: ComponentType<{ className?: string }>;
    }> = [];

    if (
      habitsAnalysis?.weightChange !== null &&
      habitsAnalysis?.weightChange !== undefined
    ) {
      items.push({
        label: "Weight delta",
        value: `${habitsAnalysis.weightChange > 0 ? "+" : ""}${habitsAnalysis.weightChange.toFixed(1)} ${habitsAnalysis.weightUnit}`,
        helper: "First to latest logged weight",
        icon: Flame,
      });
    }

    if (
      typeof habitsAnalysis?.avgStepsFirst === "number" &&
      typeof habitsAnalysis?.avgStepsSecond === "number"
    ) {
      const delta =
        habitsAnalysis.avgStepsSecond - habitsAnalysis.avgStepsFirst;
      items.push({
        label: "Steps delta",
        value: `${delta > 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`,
        helper: "Later average minus earlier average",
        icon: Rocket,
      });
    }

    if (exerciseImprovements.length > 0) {
      items.push({
        label: "Strength movers",
        value: `${exerciseImprovements.length}`,
        helper: "Exercises with higher logged loads",
        icon: CheckCircle2,
      });
    }

    if (hasCheckinTrendData) {
      items.push({
        label: "Check-in shifts",
        value: `${checkinQuestionTrends.numeric.length + checkinQuestionTrends.text.length}`,
        helper: "Questions with meaningful response changes",
        icon: MessageCircle,
      });
    }

    if (
      items.length === 0 &&
      typeof habitsAnalysis?.avgProteinFirst === "number" &&
      typeof habitsAnalysis?.avgProteinSecond === "number"
    ) {
      const delta =
        habitsAnalysis.avgProteinSecond - habitsAnalysis.avgProteinFirst;
      items.push({
        label: "Protein delta",
        value: `${delta > 0 ? "+" : ""}${Math.round(delta)} g`,
        helper: "Later average minus earlier average",
        icon: Sparkles,
      });
    }

    return items.slice(0, 4);
  }, [
    checkinQuestionTrends,
    exerciseImprovements.length,
    habitsAnalysis,
    hasCheckinTrendData,
  ]);

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Trend snapshot"
        subtitle="Actionable deltas across habits, training, and check-ins."
      >
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : trendCards.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trendCards.map((item) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                helper={item.helper}
                icon={item.icon}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Not enough progress data yet"
            description={
              hasBaselineSubmission
                ? "Once the client logs habits, training, or check-ins, the most useful trend changes will appear here."
                : "Start by reviewing the baseline so future changes have a stronger point of comparison."
            }
            actionLabel={
              hasBaselineSubmission ? "Open habits" : "Open baseline"
            }
            onAction={hasBaselineSubmission ? onOpenHabits : onOpenBaseline}
          />
        )}
      </DashboardCard>

      <DashboardCard
        title="Habit shifts"
        subtitle="Compare earlier and later habit patterns in the current window."
      >
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : habitsAnalysis ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Steps average</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {habitsAnalysis.avgStepsFirst !== null
                  ? Math.round(habitsAnalysis.avgStepsFirst).toLocaleString()
                  : "Not logged"}{" "}
                to{" "}
                {habitsAnalysis.avgStepsSecond !== null
                  ? Math.round(habitsAnalysis.avgStepsSecond).toLocaleString()
                  : "Not logged"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Sleep average</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {habitsAnalysis.avgSleepFirst !== null
                  ? habitsAnalysis.avgSleepFirst.toFixed(1)
                  : "Not logged"}{" "}
                hrs to{" "}
                {habitsAnalysis.avgSleepSecond !== null
                  ? habitsAnalysis.avgSleepSecond.toFixed(1)
                  : "Not logged"}{" "}
                hrs
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Protein average</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {habitsAnalysis.avgProteinFirst !== null
                  ? Math.round(habitsAnalysis.avgProteinFirst)
                  : "Not logged"}{" "}
                g to{" "}
                {habitsAnalysis.avgProteinSecond !== null
                  ? Math.round(habitsAnalysis.avgProteinSecond)
                  : "Not logged"}{" "}
                g
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Calories average</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {habitsAnalysis.avgCaloriesFirst !== null
                  ? Math.round(habitsAnalysis.avgCaloriesFirst)
                  : "Not logged"}{" "}
                to{" "}
                {habitsAnalysis.avgCaloriesSecond !== null
                  ? Math.round(habitsAnalysis.avgCaloriesSecond)
                  : "Not logged"}
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No habit trend to review yet"
            description="Habit deltas will appear once the client logs enough daily entries to compare earlier and later behavior."
            actionLabel="Open habits"
            onAction={onOpenHabits}
          />
        )}
      </DashboardCard>

      <DashboardCard
        title="Training progression"
        subtitle="Recent lift changes and workload context from logged sessions."
      >
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : exerciseImprovements.length > 0 ? (
          <div className="space-y-2">
            {exerciseImprovements.map((item) => (
              <div
                key={item.exerciseId}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm"
              >
                <span className="font-medium">{item.exerciseName}</span>
                <span className="text-muted-foreground">
                  {item.startWeight} to {item.latestWeight} (
                  {item.change > 0 ? "+" : ""}
                  {item.change})
                </span>
              </div>
            ))}
          </div>
        ) : hasWorkoutHistory ? (
          <EmptyState
            title="Workout history exists, but no clear load gains yet"
            description="Sessions are being logged, but there is not enough evidence of meaningful load increases in the selected window."
            actionLabel="Open workout tab"
            onAction={onOpenWorkout}
          />
        ) : (
          <EmptyState
            title="No workout history yet"
            description="Logged training sessions will unlock exercise-level progression here."
            actionLabel="Open workout tab"
            onAction={onOpenWorkout}
          />
        )}
      </DashboardCard>

      <DashboardCard
        title="Check-in themes"
        subtitle="Numeric deltas and message changes worth reviewing."
      >
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : hasCheckinTrendData ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Numeric question trends
              </p>
              {checkinQuestionTrends.numeric.length > 0 ? (
                checkinQuestionTrends.numeric.map((row) => (
                  <div
                    key={row.question}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm"
                  >
                    <span className="truncate pr-3">{row.question}</span>
                    <span className="text-muted-foreground">
                      {row.from} to {row.to} ({row.delta > 0 ? "+" : ""}
                      {row.delta})
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No numeric answer changes detected.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Text response shifts
              </p>
              {checkinQuestionTrends.text.length > 0 ? (
                checkinQuestionTrends.text.map((row) => (
                  <div
                    key={row.question}
                    className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm"
                  >
                    <p className="font-medium">{row.question}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Previous: {row.previous}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Latest: {row.latest}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No text response changes detected.
                </p>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No check-in trend shifts yet"
            description="Once the client submits repeated check-ins, changing answers and themes will surface here for faster review."
            actionLabel="Open check-ins"
            onAction={onOpenCheckins}
          />
        )}
      </DashboardCard>
    </div>
  );
}

function PtClientNotesTab({
  clientId,
  workspaceId,
}: {
  clientId: string | null;
  workspaceId: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [noteMessage, setNoteMessage] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ["pt-client-notes", clientId, workspaceId],
    enabled: !!clientId && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_activity_log")
        .select("id, actor_user_id, created_at, metadata")
        .eq("client_id", clientId ?? "")
        .eq("workspace_id", workspaceId ?? "")
        .eq("action", "pt_note")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PtCoachNoteRow[];
    },
  });

  const handleSaveNote = async () => {
    const trimmed = noteDraft.trim();
    if (!clientId || !workspaceId || !user?.id || trimmed.length === 0) return;
    setNoteStatus("saving");
    setNoteMessage(null);
    const { error } = await supabase.from("coach_activity_log").insert({
      client_id: clientId,
      workspace_id: workspaceId,
      actor_user_id: user.id,
      action: "pt_note",
      metadata: {
        note: trimmed,
        preview: trimmed.slice(0, 140),
      },
    });

    if (error) {
      setNoteStatus("error");
      setNoteMessage(getErrorMessage(error));
      return;
    }

    setNoteDraft("");
    setNoteStatus("idle");
    setNoteMessage("Note added.");
    await queryClient.invalidateQueries({
      queryKey: ["pt-client-notes", clientId, workspaceId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["coach-activity-log", clientId, workspaceId],
    });
  };

  const notes = notesQuery.data ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Add note</CardTitle>
          <p className="text-sm text-muted-foreground">
            Capture coaching context, handoff details, or anything you want
            visible on this client over time.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="min-h-[220px] w-full rounded-xl border border-border/60 bg-background/70 px-3 py-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Add a coaching note about goals, communication, programming decisions, or anything that matters for the next PT touchpoint."
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={
                noteStatus === "saving" || noteDraft.trim().length === 0
              }
              onClick={handleSaveNote}
            >
              {noteStatus === "saving" ? "Saving..." : "Add note"}
            </Button>
            {noteMessage ? (
              <span className="text-xs text-muted-foreground">
                {noteMessage}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Notes are visible only inside this client workspace.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>Recent notes</CardTitle>
          <p className="text-sm text-muted-foreground">
            A running PT-side note trail for future planning and handoff.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {notesQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : notesQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {getFriendlyErrorMessage()}
            </div>
          ) : notes.length > 0 ? (
            notes.map((note) => {
              const noteText =
                typeof note.metadata?.note === "string"
                  ? note.metadata.note
                  : typeof note.metadata?.preview === "string"
                    ? note.metadata.preview
                    : "No note body recorded.";
              return (
                <div
                  key={note.id}
                  className="rounded-2xl border border-border/60 bg-background/35 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {note.actor_user_id === user?.id ? "You" : "Coach note"}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatShortDateTime(note.created_at)}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {noteText}
                  </p>
                </div>
              );
            })
          ) : (
            <EmptyState
              title="No PT notes yet"
              description="Use notes to capture coaching context, decision history, and anything another coach would need when they open this client."
              icon={<Pencil className="h-5 w-5" />}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
