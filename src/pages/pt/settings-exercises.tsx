import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
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
import { useWorkspace } from "../../lib/use-workspace";

const muscleGroups = [
  "Chest",
  "Back",
  "Legs",
  "Shoulders",
  "Arms",
  "Core",
  "Full Body",
  "Other",
] as const;

type ExerciseRow = {
  id: string;
  workspace_id: string;
  name: string;
  muscle_group: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string | null;
  video_url: string | null;
  notes: string | null;
  is_unilateral: boolean | null;
  tags: string[] | null;
  created_at: string | null;
};

type ExerciseFormState = {
  name: string;
  muscle_group: string;
  secondary_muscles: string;
  equipment: string;
  video_url: string;
  is_unilateral: boolean;
};

const emptyForm: ExerciseFormState = {
  name: "",
  muscle_group: "",
  secondary_muscles: "",
  equipment: "",
  video_url: "",
  is_unilateral: false,
};

const getErrorDetails = (error: unknown) => {
  if (!error) return { code: "unknown", message: "Unknown error" };
  if (typeof error === "object") {
    const err = error as { code?: string | null; message?: string | null };
    return {
      code: err.code ?? "unknown",
      message: err.message ?? "Unknown error",
    };
  }
  return { code: "unknown", message: "Unknown error" };
};

export function PtExerciseLibraryPage() {
  const queryClient = useQueryClient();
  const { workspaceId, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<ExerciseRow | null>(null);
  const [form, setForm] = useState<ExerciseFormState>(emptyForm);
  const [filters, setFilters] = useState({ name: "", primary_muscle: "", tag: "" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<"idle" | "saving">("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const splitList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const toNullableList = (value: string) => {
    const items = splitList(value);
    return items.length > 0 ? items : null;
  };

  const exercisesQuery = useQuery({
    queryKey: ["exercise-library", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select(
          "id, workspace_id, name, muscle_group, primary_muscle, secondary_muscles, equipment, video_url, notes, is_unilateral, tags, created_at"
        )
        .eq("workspace_id", workspaceId ?? "")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseRow[];
    },
  });

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (exercise: ExerciseRow) => {
    setSelected(exercise);
    setForm({
      name: exercise.name ?? "",
      muscle_group: exercise.muscle_group ?? "",
      secondary_muscles: exercise.secondary_muscles?.join(", ") ?? "",
      equipment: exercise.equipment ?? "",
      video_url: exercise.video_url ?? "",
      is_unilateral: exercise.is_unilateral ?? false,
    });
    setActionError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    if (!form.name.trim()) {
      setActionError("Exercise name is required.");
      return;
    }
    setActionStatus("saving");
    setActionError(null);
    const payload = {
      workspace_id: workspaceId,
      name: form.name.trim(),
      muscle_group: form.muscle_group.trim() || null,
      secondary_muscles: toNullableList(form.secondary_muscles),
      equipment: form.equipment.trim() || null,
      video_url: form.video_url.trim() || null,
      is_unilateral: form.is_unilateral,
    };

    const response = selected
      ? await supabase.from("exercises").update(payload).eq("id", selected.id)
      : await supabase.from("exercises").insert(payload);

    if (response.error) {
      const details = getErrorDetails(response.error);
      if (details.code === "23505") {
        setActionError("An exercise with this name already exists.");
      } else {
        setActionError(`${details.code}: ${details.message}`);
      }
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    setModalOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["exercise-library", workspaceId] });
    setToastMessage("Exercise saved");
  };

  const handleDelete = async () => {
    if (!selected) return;
    setActionStatus("saving");
    setActionError(null);
    const { error } = await supabase.from("exercises").delete().eq("id", selected.id);
    if (error) {
      const details = getErrorDetails(error);
      setActionError(`${details.code}: ${details.message}`);
      setActionStatus("idle");
      return;
    }
    setActionStatus("idle");
    setDeleteOpen(false);
    setSelected(null);
    await queryClient.invalidateQueries({ queryKey: ["exercise-library", workspaceId] });
  };

  const exercises = exercisesQuery.data ?? [];
  const filteredExercises = useMemo(() => {
    const nameFilter = filters.name.trim().toLowerCase();
    const primaryFilter = filters.primary_muscle.trim().toLowerCase();
    const tagFilter = filters.tag.trim().toLowerCase();

    return exercises.filter((exercise) => {
      const nameMatch = !nameFilter || (exercise.name ?? "").toLowerCase().includes(nameFilter);
      const primaryValue = exercise.primary_muscle ?? exercise.muscle_group ?? "";
      const primaryMatch = !primaryFilter || primaryValue.toLowerCase().includes(primaryFilter);
      const tags = exercise.tags ?? [];
      const tagsMatch = !tagFilter || tags.some((tag) => tag.toLowerCase().includes(tagFilter));
      return nameMatch && primaryMatch && tagsMatch;
    });
  }, [exercises, filters]);

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[260px]">
          <Alert className="border-border bg-muted/90">
            <AlertDescription className="text-sm">{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Exercise library</h2>
          <p className="text-sm text-muted-foreground">
            Build a reusable exercise library for your workspace.
          </p>
        </div>
        <Button onClick={openCreate}>Add exercise</Button>
      </div>

      {workspaceError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Workspace error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {getErrorDetails(workspaceError).code}: {getErrorDetails(workspaceError).message}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Exercises</CardTitle>
            <p className="text-sm text-muted-foreground">Workspace-scoped movement library.</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              placeholder="Filter by name"
              value={filters.name}
              onChange={(event) => setFilters((prev) => ({ ...prev, name: event.target.value }))}
            />
            <Input
              placeholder="Filter by primary muscle"
              value={filters.primary_muscle}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, primary_muscle: event.target.value }))
              }
            />
            <Input
              placeholder="Filter by tag"
              value={filters.tag}
              onChange={(event) => setFilters((prev) => ({ ...prev, tag: event.target.value }))}
            />
          </div>
          {workspaceLoading || exercisesQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading exercises...</div>
          ) : exercisesQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              {getErrorDetails(exercisesQuery.error).code}: {getErrorDetails(exercisesQuery.error).message}
            </div>
          ) : exercises.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No exercises yet. Add your first exercise to start building templates.
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No exercises match those filters.
            </div>
          ) : (
            filteredExercises.map((exercise) => (
              <div
                key={exercise.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{exercise.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {exercise.primary_muscle ?? exercise.muscle_group ?? "Other"}
                    {exercise.equipment ? ` • ${exercise.equipment}` : ""}
                  </p>
                  {exercise.tags && exercise.tags.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {exercise.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(exercise)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelected(exercise);
                      setDeleteOpen(true);
                      setActionError(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setActionError(null);
            setActionStatus("idle");
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{selected ? "Edit exercise" : "Add exercise"}</DialogTitle>
            <DialogDescription>Define movement defaults for your library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Name</label>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g., Bench Press"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Muscle group</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.muscle_group}
                onChange={(event) => setForm((prev) => ({ ...prev, muscle_group: event.target.value }))}
              >
                <option value="">Select group</option>
                {muscleGroups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Secondary muscles (comma-separated)
              </label>
              <Input
                value={form.secondary_muscles}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, secondary_muscles: event.target.value }))
                }
                placeholder="e.g., Triceps, Shoulders"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Equipment</label>
              <Input
                value={form.equipment}
                onChange={(event) => setForm((prev) => ({ ...prev, equipment: event.target.value }))}
                placeholder="e.g., Barbell"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Video URL</label>
              <Input
                value={form.video_url}
                onChange={(event) => setForm((prev) => ({ ...prev, video_url: event.target.value }))}
                placeholder="https://"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.is_unilateral}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, is_unilateral: event.target.checked }))
                }
              />
              Unilateral movement
            </label>
            {actionError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {actionError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={actionStatus === "saving"} onClick={handleSave}>
              {actionStatus === "saving" ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete exercise</DialogTitle>
            <DialogDescription>
              This will remove the exercise from your library and delete dependent template
              and workout rows.
            </DialogDescription>
          </DialogHeader>
          {actionError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {actionError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={actionStatus === "saving"} onClick={handleDelete}>
              {actionStatus === "saving" ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
