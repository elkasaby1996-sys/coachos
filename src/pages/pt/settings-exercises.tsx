import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  equipment: string | null;
  video_url: string | null;
  notes: string | null;
  created_at: string | null;
};

type ExerciseFormState = {
  name: string;
  muscle_group: string;
  equipment: string;
  video_url: string;
  notes: string;
};

const emptyForm: ExerciseFormState = {
  name: "",
  muscle_group: "",
  equipment: "",
  video_url: "",
  notes: "",
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<"idle" | "saving">("idle");

  const exercisesQuery = useQuery({
    queryKey: ["exercise-library", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, workspace_id, name, muscle_group, equipment, video_url, notes, created_at")
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
      equipment: exercise.equipment ?? "",
      video_url: exercise.video_url ?? "",
      notes: exercise.notes ?? "",
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
      equipment: form.equipment.trim() || null,
      video_url: form.video_url.trim() || null,
      notes: form.notes.trim() || null,
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

  return (
    <div className="space-y-6">
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
          <Button variant="secondary" size="sm" onClick={openCreate}>
            New exercise
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
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
          ) : (
            exercises.map((exercise) => (
              <div
                key={exercise.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
              >
                <div>
                  <p className="text-sm font-semibold">{exercise.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {exercise.muscle_group ?? "Other"}
                    {exercise.equipment ? ` • ${exercise.equipment}` : ""}
                  </p>
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
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, muscle_group: event.target.value }))
                }
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
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Notes</label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
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
              This will remove the exercise from your library. It will not delete any
              template exercise rows.
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
