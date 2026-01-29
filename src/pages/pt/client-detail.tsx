import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Skeleton } from "../../components/ui/skeleton";
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

const tabs = ["overview", "plan", "logs", "progress", "checkins", "messages", "notes"] as const;

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
          "id, workspace_id, display_name, goal, status, injuries, equipment, height_cm, dob, training_type, timezone, limitations, phone, email, location, unit_preference, gender, gym_name, tags, photo_url, updated_at"
        )
        .eq("id", clientId ?? "")
        .eq("workspace_id", workspaceQuery.data ?? "")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Client not found in this workspace.");
      return data;
    },
  });

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

  const clientSnapshot = clientQuery.data;
  const missingFields = useMemo(() => {
    if (!clientSnapshot) return [];
    const missing: string[] = [];
    if (!clientSnapshot.height_cm) missing.push("Height");
    if (!clientSnapshot.dob) missing.push("Birthdate");
    if (!clientSnapshot.goal) missing.push("Goal");
    if (!clientSnapshot.injuries) missing.push("Injuries");
    const hasEquipment = Array.isArray(clientSnapshot.equipment)
      ? clientSnapshot.equipment.length > 0
      : Boolean(clientSnapshot.equipment);
    if (!hasEquipment) missing.push("Equipment");
    if (!clientSnapshot.training_type) missing.push("Training type");
    if (!clientSnapshot.timezone) missing.push("Timezone");
    return missing;
  }, [clientSnapshot]);

  const handleQuickAction = (message: string) => {
    if (!clientId) return;
    const params = new URLSearchParams({ tab: "messages", draft: message });
    navigate(`/pt/clients/${clientId}?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        PT CLIENT DETAIL ACTIVE (v1)
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {clientQuery.data?.display_name ?? "Client profile"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {clientQuery.data?.goal ?? "Training plan overview"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={clientQuery.data?.status === "inactive" ? "muted" : "success"}>
            {clientQuery.data?.status ?? "Active"}
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
                    <div>{clientSnapshot.email ?? "Email needed"}</div>
                    <div>{clientSnapshot.phone ?? "Phone needed"}</div>
                    <div>{clientSnapshot.location ?? "Location needed"}</div>
                    <div>{clientSnapshot.timezone ?? "Timezone needed"}</div>
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Training Context
                  </p>
                  <div className="text-sm">
                    <div>{clientSnapshot.training_type ?? "Training type needed"}</div>
                    <div>{clientSnapshot.gym_name ?? "Gym name needed"}</div>
                    <div>{formatListValue(clientSnapshot.equipment ?? null, "Equipment needed")}</div>
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
                  </div>
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
          ) : (
            <p className="text-sm text-muted-foreground">No data yet for this tab.</p>
          )}
        </CardContent>
      </Card>

      {(workspaceQuery.error ||
        templatesQuery.error ||
        upcomingQuery.error ||
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
                    clientQuery.error
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
