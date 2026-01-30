import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Skeleton } from "../../components/ui/skeleton";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { getWorkspaceIdForUser } from "../../lib/workspace";
import { cn } from "../../lib/utils";

const tabs = [
  "overview",
  "plan",
  "logs",
  "progress",
  "checkins",
  "messages",
  "notes",
  "baseline",
] as const;

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

const formatListValue = (value: string[] | string | null | undefined, fallback: string) => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : fallback;
  return value;
};

const trainingTypeOptions = [
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
  { value: "in_person", label: "In person" },
];

type PtClientProfile = {
  id: string;
  workspace_id: string | null;
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
  value: string | number | null;
  template: { name: string | null; unit: string | null } | null;
};

type BaselinePhotoRow = {
  photo_type: string | null;
  photo_url: string | null;
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
    return "overview";
  }, [location.search]);
  const [active, setActive] = useState<(typeof tabs)[number]>(initialTab);

  useEffect(() => {
    setActive(initialTab);
  }, [initialTab]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() => formatDateKey(new Date()));
  const [assignStatus, setAssignStatus] = useState<"idle" | "saving" | "error">("idle");
  const [assignMessage, setAssignMessage] = useState<string | null>(null);
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

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateKey(today), [today]);
  const endKey = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + 7);
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
          "id, workspace_id, display_name, goal, status, injuries, limitations, height_cm, current_weight, days_per_week, dob, training_type, timezone, phone, location, unit_preference, gender, gym_name, tags, photo_url, updated_at"
        )
        .eq("id", clientId ?? "")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Client not found in this workspace.");
      return data;
    },
  });

  useEffect(() => {
    if (!clientQuery.data) return;
    const data = clientQuery.data as PtClientProfile;
    setClientProfile(data);
    setAdminTrainingType(data.training_type ?? "");
    setAdminTags(formatListValue(data.tags ?? null, ""));
  }, [clientQuery.data]);

  const templatesQuery = useQuery({
    queryKey: ["workout-templates", workspaceQuery.data],
    enabled: !!workspaceQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name, workout_type")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upcomingQuery = useQuery({
    queryKey: ["assigned-workouts-upcoming", clientId, todayKey, endKey],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assigned_workouts")
        .select(
          "id, status, scheduled_date, created_at, completed_at, workout_template_id, workout_template:workout_templates(id, name, workout_type)"
        )
        .eq("client_id", clientId ?? "")
        .gte("scheduled_date", todayKey)
        .lte("scheduled_date", endKey)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const baselineEntryQuery = useQuery({
    queryKey: ["pt-client-baseline-entry", clientId],
    enabled: !!clientId,
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
    enabled: !!baselineId,
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
    enabled: !!baselineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_marker_values")
        .select("value, template:baseline_marker_templates(name, unit)")
        .eq("baseline_id", baselineId ?? "");
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        value: string | number | null;
        template:
          | { name: string | null; unit: string | null }
          | { name: string | null; unit: string | null }[]
          | null;
      }>;
      return rows.map((row) => ({
        value: row.value ?? null,
        template: Array.isArray(row.template)
          ? row.template[0] ?? null
          : row.template ?? null,
      })) as BaselineMarkerRow[];
    },
  });

  const baselinePhotosQuery = useQuery({
    queryKey: ["pt-client-baseline-photos", baselineId],
    enabled: !!baselineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_photos")
        .select("photo_type, photo_url")
        .eq("baseline_id", baselineId ?? "");
      if (error) throw error;
      return (data ?? []) as BaselinePhotoRow[];
    },
  });

  const handleAssignWorkout = async () => {
    if (!clientId || !selectedTemplateId || !scheduledDate) return;
    setAssignStatus("saving");
    setAssignMessage(null);

    const { data: existing, error: checkError } = await supabase
      .from("assigned_workouts")
      .select("id")
      .eq("client_id", clientId)
      .eq("scheduled_date", scheduledDate)
      .eq("workout_template_id", selectedTemplateId)
      .maybeSingle();

    if (checkError) {
      setAssignStatus("error");
      setAssignMessage(getErrorMessage(checkError));
      return;
    }

    if (existing) {
      setAssignStatus("idle");
      setAssignMessage("Already scheduled for that date");
      return;
    }

    const { error } = await supabase.from("assigned_workouts").insert({
      client_id: clientId,
      workout_template_id: selectedTemplateId,
      scheduled_date: scheduledDate,
      status: "planned",
    });

    if (error) {
      if ("code" in error && (error as { code?: string }).code === "23505") {
        setAssignStatus("idle");
        setAssignMessage("Already scheduled for that date");
        return;
      }
      setAssignStatus("error");
      setAssignMessage(getErrorMessage(error));
      return;
    }

    setAssignStatus("idle");
    setAssignMessage("Workout assigned");
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, endKey],
    });
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
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, endKey],
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
    setAssignStatus("idle");
    setAssignMessage("Workout updated");
    setEditOpen(false);
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, endKey],
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
      queryKey: ["assigned-workouts-upcoming", clientId, todayKey, endKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["assigned-workout-today", clientId, todayKey],
    });
  };

  const clientSnapshot = clientProfile ?? (clientQuery.data as PtClientProfile | null);
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

  const baselinePhotoMap = useMemo(() => {
    const map: Record<(typeof baselinePhotoTypes)[number], string | null> = {
      front: null,
      side: null,
      back: null,
    };
    baselinePhotosQuery.data?.forEach((row) => {
      const type = row.photo_type as (typeof baselinePhotoTypes)[number] | null;
      if (!type || !baselinePhotoTypes.includes(type)) return;
      map[type] = row.photo_url ?? null;
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

  return (
    <div className="space-y-6">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        PT CLIENT DETAIL ACTIVE (v1)
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {clientSnapshot?.display_name ?? "Client profile"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {clientSnapshot?.goal ?? "Training plan overview"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={clientSnapshot?.status === "inactive" ? "muted" : "success"}>
            {clientSnapshot?.status ?? "Active"}
          </Badge>
          <Button variant="secondary">Message</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Client Snapshot</CardTitle>
            <p className="text-sm text-muted-foreground">
              Read-first summary of profile details and gaps.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                handleQuickAction(
                  "Let’s capture your baseline this week. Can you share weight, sleep, and key lifts?"
                )
              }
            >
              Request baseline
            </Button>
            <Button
              size="sm"
              onClick={() =>
                handleQuickAction(
                  "Quick favor: please update your profile details so I can refine your plan."
                )
              }
            >
              Request profile update
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {clientQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : clientSnapshot ? (
            <>
              {missingFields.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">Missing info:</span>
                  {missingFields.map((field) => (
                    <Badge key={field} variant="warning">
                      {field}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Badge variant="success">All key info captured</Badge>
              )}
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Identity & Preferences
                  </p>
                  <div className="text-sm">
                    <div>{clientSnapshot.display_name ?? "Name needed"}</div>
                    <div>{clientSnapshot.phone ?? "Phone needed"}</div>
                    <div>{clientSnapshot.location ?? "Country needed"}</div>
                    <div>{clientSnapshot.timezone ?? "Timezone needed"}</div>
                    <div>{clientSnapshot.unit_preference ?? "Units needed"}</div>
                    <div>{clientSnapshot.dob ?? "Birthdate needed"}</div>
                    <div>{clientSnapshot.gender ?? "Gender needed"}</div>
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Training Context
                  </p>
                  <div className="text-sm">
                    <div>{clientSnapshot.training_type ?? "Training type needed"}</div>
                    <div>{clientSnapshot.gym_name ?? "Gym name needed"}</div>
                    <div>
                      {typeof clientSnapshot.days_per_week === "number"
                        ? `${clientSnapshot.days_per_week} days/week`
                        : "Days per week needed"}
                    </div>
                    <div>{formatListValue(clientSnapshot.tags ?? null, "Tags optional")}</div>
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Health & Limitations
                  </p>
                  <div className="text-sm">
                    <div>{clientSnapshot.goal ?? "Goal needed"}</div>
                    <div>{clientSnapshot.injuries ?? "Injuries needed"}</div>
                    <div>{clientSnapshot.limitations ?? "Limitations needed"}</div>
                    <div>
                      {typeof clientSnapshot.height_cm === "number"
                        ? `${clientSnapshot.height_cm} cm`
                        : "Height needed"}
                    </div>
                    <div>
                      {typeof clientSnapshot.current_weight === "number"
                        ? `${clientSnapshot.current_weight}`
                        : "Weight needed"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Training type (PT-only)
                  </label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={adminTrainingType}
                    onChange={(event) => {
                      const value = event.target.value;
                      setAdminTrainingType(value);
                      updateAdminFields(value, adminTags);
                    }}
                  >
                    <option value="">Select training type</option>
                    {trainingTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Tags (optional)
                  </label>
                  <Input
                    value={adminTags}
                    onChange={(event) => setAdminTags(event.target.value)}
                    placeholder="Strength, Mobility"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={adminStatus === "saving"}
                    onClick={() => updateAdminFields(adminTrainingType, adminTags)}
                  >
                    {adminStatus === "saving" ? "Saving..." : "Save tags"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Client details are unavailable.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium capitalize",
              active === tab
                ? "border-b-2 border-accent text-foreground"
                : "text-muted-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{active}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {active === "overview"
              ? "Latest entries, streaks, and momentum."
              : active === "baseline"
              ? "Latest submitted baseline details."
              : "Section details coming soon."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {active === "overview" ? (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
                <div>
                  <p className="text-sm font-medium">Weekly check-in</p>
                  <p className="text-xs text-muted-foreground">Due Saturday</p>
                </div>
                <Badge variant="warning">Due</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
                <div>
                  <p className="text-sm font-medium">Last workout</p>
                  <p className="text-xs text-muted-foreground">Completed yesterday</p>
                </div>
                <Badge variant="success">Completed</Badge>
              </div>
            </>
          ) : active === "baseline" ? (
            baselineEntryQuery.isLoading ||
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
                            {marker.value ?? "Not provided"}
                            {marker.template?.unit ? ` ${marker.template.unit}` : ""}
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
                    onChange={(event) => setBaselineNotes(event.target.value)}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={baselineNotesStatus === "saving"}
                      onClick={handleBaselineNotesSave}
                    >
                      {baselineNotesStatus === "saving" ? "Saving..." : "Save notes"}
                    </Button>
                    {baselineNotesMessage ? (
                      <span className="text-xs text-muted-foreground">
                        {baselineNotesMessage}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No submitted baseline yet.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">No data yet for this tab.</p>
          )}
        </CardContent>
      </Card>

      {(workspaceQuery.error ||
        templatesQuery.error ||
        upcomingQuery.error ||
        baselineEntryQuery.error ||
        baselineMetricsQuery.error ||
        baselineMarkersQuery.error ||
        baselinePhotosQuery.error ||
        clientQuery.error ||
        assignStatus === "error") && (
        <Alert className="border-destructive/30">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {assignStatus === "error" && assignMessage
              ? assignMessage
              : getErrorMessage(
                  workspaceQuery.error ||
                    templatesQuery.error ||
                    upcomingQuery.error ||
                    clientQuery.error ||
                    baselineEntryQuery.error ||
                    baselineMetricsQuery.error ||
                    baselineMarkersQuery.error ||
                    baselinePhotosQuery.error
                )}
          </AlertDescription>
        </Alert>
      )}

      {assignStatus !== "error" && assignMessage ? (
        <Alert className="border-border">
          <AlertTitle>Update</AlertTitle>
          <AlertDescription>{assignMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Schedule workout</CardTitle>
            <p className="text-sm text-muted-foreground">
              Assign a template to this client with a planned date.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {templatesQuery.isLoading || workspaceQuery.isLoading ? (
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
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                  >
                    <option value="">Select a template</option>
                    {templatesQuery.data?.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.workout_type ? ` - ${template.workout_type}` : ""}
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
                    onChange={(event) => setScheduledDate(event.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={
                    assignStatus === "saving" || !selectedTemplateId || !scheduledDate
                  }
                  onClick={handleAssignWorkout}
                >
                  {assignStatus === "saving" ? "Assigning..." : "Assign workout"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <p className="text-sm text-muted-foreground">
              Scheduled sessions for the next 7 days.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : upcomingQuery.data && upcomingQuery.data.length > 0 ? (
              upcomingQuery.data.map((workout) => (
                <div
                  key={workout.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {workout.workout_template?.name ?? "Workout"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {workout.scheduled_date
                        ? new Date(workout.scheduled_date).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })
                        : "Scheduled"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          openEditDialog({
                            id: workout.id,
                            scheduled_date: workout.scheduled_date,
                            workout_template_id: workout.workout_template_id,
                            status: workout.status,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditWorkoutId(workout.id);
                          setDeleteOpen(true);
                        }}
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleStatusUpdate(workout.id, "completed")}
                      >
                        Mark completed
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusUpdate(workout.id, "skipped")}
                      >
                        Skip
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                No workouts scheduled for the next 7 days.
              </div>
            )}
          </CardContent>
        </Card>
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
                    {template.name} {template.workout_type ? ` - ${template.workout_type}` : ""}
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
    </div>
  );
}
