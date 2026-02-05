import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "../../components/ui/badge";
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
import { Skeleton } from "../../components/ui/skeleton";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { GripVertical } from "lucide-react";

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

const formatWorkoutTypeTag = (value: string | null | undefined) =>
  value && value.trim().length > 0 ? value : "Workout";

type TemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  workout_type: string | null;
  workout_type_tag: string | null;
};

type ExerciseRow = {
  id: string;
  name: string | null;
  muscle_group: string | null;
  primary_muscle: string | null;
  equipment: string | null;
  video_url: string | null;
  tags: string[] | null;
};

type TemplateExerciseRow = {
  id: string;
  sort_order: number | null;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe: number | null;
  video_url: string | null;
  notes: string | null;
  exercise: ExerciseRow | null;
};

type TemplateExerciseForm = {
  sets: string;
  reps: string;
  rest_seconds: string;
  tempo: string;
  rpe: string;
  video_url: string;
  notes: string;
};

const emptyExerciseForm: TemplateExerciseForm = {
  sets: "",
  reps: "",
  rest_seconds: "",
  tempo: "",
  rpe: "",
  video_url: "",
  notes: "",
};

const isUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );

type SortableExerciseRowProps = {
  row: TemplateExerciseRow;
  index: number;
  total: number;
  actionStatus: "idle" | "saving";
  onMove: (row: TemplateExerciseRow, direction: "up" | "down") => void;
  onEdit: (row: TemplateExerciseRow) => void;
  onDelete: (row: TemplateExerciseRow) => void;
};

function SortableExerciseRow({
  row,
  index,
  total,
  actionStatus,
  onMove,
  onEdit,
  onDelete,
}: SortableExerciseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        isDragging
          ? "rounded-lg border border-border bg-muted/50 p-3 shadow-lg"
          : "rounded-lg border border-border bg-muted/30 p-3"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            aria-label="Drag to reorder"
            className="mt-0.5 rounded-md border border-border bg-background/60 p-1 text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div>
            <p className="text-sm font-semibold">{row.exercise?.name ?? "Exercise"}</p>
            <p className="text-xs text-muted-foreground">
              {row.sets ?? "--"} sets - {row.reps ?? "--"} reps
              {row.rpe ? ` - RPE ${row.rpe}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={index === 0 || actionStatus === "saving"}
            onClick={() => onMove(row, "up")}
          >
            Up
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={index === total - 1 || actionStatus === "saving"}
            onClick={() => onMove(row, "down")}
          >
            Down
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onEdit(row)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(row)}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PtWorkoutTemplateBuilderPage() {
  const { id } = useParams();
  const templateId = isUuid(id) ? id : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false);
  const [deleteTemplateStatus, setDeleteTemplateStatus] = useState<"idle" | "deleting">("idle");
  const [deleteTemplateError, setDeleteTemplateError] = useState<string | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<TemplateExerciseRow | null>(null);
  const [form, setForm] = useState<TemplateExerciseForm>(emptyExerciseForm);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<"idle" | "saving">("idle");
  const [exerciseRows, setExerciseRows] = useState<TemplateExerciseRow[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const templateQuery = useQuery({
    queryKey: ["workout-template", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name, description, workout_type, workout_type_tag")
        .eq("id", templateId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as TemplateRow | null;
    },
  });

  const exercisesQuery = useQuery({
    queryKey: ["exercise-library", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, name, muscle_group, primary_muscle, equipment, video_url, tags")
        .eq("workspace_id", workspaceId ?? "")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseRow[];
    },
  });

  const templateExercisesQuery = useQuery({
    queryKey: ["workout-template-exercises", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select(
          "id, sort_order, sets, reps, rest_seconds, tempo, rpe, video_url, notes, exercise:exercises(id,name,muscle_group,equipment,video_url)"
        )
        .eq("workout_template_id", templateId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateExerciseRow[];
    },
  });

  useEffect(() => {
    const rows = templateExercisesQuery.data ?? [];
    const normalized = rows
      .map((row, index) => ({
        row,
        index,
        order: row.sort_order ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => (a.order === b.order ? a.index - b.index : a.order - b.order))
      .map((item) => item.row);
    setExerciseRows(normalized);
  }, [templateExercisesQuery.data]);

  const exercises = exercisesQuery.data ?? [];
  const filteredExercises = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return exercises;
    return exercises.filter((exercise) =>
      (exercise.name ?? "").toLowerCase().includes(term)
    );
  }, [exercises, search]);

  const handleAddExercise = async () => {
    if (!templateId || !selectedExerciseId) return;
    setActionStatus("saving");
    setActionError(null);

    const rows = exerciseRows.length > 0 ? exerciseRows : templateExercisesQuery.data ?? [];
    const maxSort = rows.reduce((acc, row) => Math.max(acc, row.sort_order ?? 0), 0);

    const { error } = await supabase.from("workout_template_exercises").insert({
      workout_template_id: templateId,
      exercise_id: selectedExerciseId,
      sort_order: maxSort + 10,
    });

    if (error) {
      const details = getErrorDetails(error);
      setActionError(`${details.code}: ${details.message}`);
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    setAddOpen(false);
    setSelectedExerciseId("");
    await queryClient.invalidateQueries({ queryKey: ["workout-template-exercises", templateId] });
  };

  const openEdit = (row: TemplateExerciseRow) => {
    setSelectedRow(row);
    setForm({
      sets: row.sets?.toString() ?? "",
      reps: row.reps ?? "",
      rest_seconds: row.rest_seconds?.toString() ?? "",
      tempo: row.tempo ?? "",
      rpe: row.rpe?.toString() ?? "",
      video_url: row.video_url ?? "",
      notes: row.notes ?? "",
    });
    setActionError(null);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!selectedRow || !templateId) return;
    setActionStatus("saving");
    setActionError(null);

    const payload = {
      sets: form.sets.trim() ? Number(form.sets) : null,
      reps: form.reps.trim() || null,
      rest_seconds: form.rest_seconds.trim() ? Number(form.rest_seconds) : null,
      tempo: form.tempo.trim() || null,
      rpe: form.rpe.trim() ? Number(form.rpe) : null,
      video_url: form.video_url.trim() || null,
      notes: form.notes.trim() || null,
    };

    const { error } = await supabase
      .from("workout_template_exercises")
      .update(payload)
      .eq("id", selectedRow.id);

    if (error) {
      const details = getErrorDetails(error);
      setActionError(`${details.code}: ${details.message}`);
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    setEditOpen(false);
    setSelectedRow(null);
    await queryClient.invalidateQueries({ queryKey: ["workout-template-exercises", templateId] });
  };

  const handleDelete = async () => {
    if (!selectedRow || !templateId) return;
    setActionStatus("saving");
    setActionError(null);

    const { error } = await supabase
      .from("workout_template_exercises")
      .delete()
      .eq("id", selectedRow.id);

    if (error) {
      const details = getErrorDetails(error);
      setActionError(`${details.code}: ${details.message}`);
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    setDeleteOpen(false);
    setSelectedRow(null);
    await queryClient.invalidateQueries({ queryKey: ["workout-template-exercises", templateId] });
  };

  const handleTemplateDelete = async () => {
    if (!templateId) return;
    setDeleteTemplateStatus("deleting");
    setDeleteTemplateError(null);

    const { error } = await supabase.from("workout_templates").delete().eq("id", templateId);
    if (error) {
      const details = getErrorDetails(error);
      setDeleteTemplateError(`${details.code}: ${details.message}`);
      setDeleteTemplateStatus("idle");
      return;
    }

    setDeleteTemplateStatus("idle");
    setDeleteTemplateOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["workout-templates", workspaceId] });
    navigate("/pt/templates/workouts");
  };

  const handleMove = async (row: TemplateExerciseRow, direction: "up" | "down") => {
    if (!templateId) return;
    const rows = exerciseRows.length > 0 ? exerciseRows : templateExercisesQuery.data ?? [];
    const index = rows.findIndex((item) => item.id === row.id);
    if (index === -1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= rows.length) return;

    const current = rows[index];
    const target = rows[swapIndex];
    const currentOrder = current.sort_order ?? index * 10;
    const targetOrder = target.sort_order ?? swapIndex * 10;

    setActionStatus("saving");
    setActionError(null);

    const { error: firstError } = await supabase
      .from("workout_template_exercises")
      .update({ sort_order: targetOrder })
      .eq("id", current.id);

    if (firstError) {
      const details = getErrorDetails(firstError);
      setActionError(`${details.code}: ${details.message}`);
      setActionStatus("idle");
      return;
    }

    const { error: secondError } = await supabase
      .from("workout_template_exercises")
      .update({ sort_order: currentOrder })
      .eq("id", target.id);

    if (secondError) {
      const details = getErrorDetails(secondError);
      setActionError(`${details.code}: ${details.message}`);
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    await queryClient.invalidateQueries({ queryKey: ["workout-template-exercises", templateId] });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (actionStatus === "saving") return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = exerciseRows.findIndex((row) => row.id === active.id);
    const newIndex = exerciseRows.findIndex((row) => row.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const updated = arrayMove(exerciseRows, oldIndex, newIndex);
    setExerciseRows(updated);

    const updates = updated.map((row, index) => ({
      id: row.id,
      sort_order: (index + 1) * 10,
    }));

    const changed = updates.filter((update, index) => {
      const prev = exerciseRows[index];
      if (!prev) return true;
      return prev.id !== update.id || (prev.sort_order ?? null) !== update.sort_order;
    });

    if (changed.length === 0) return;

    setActionStatus("saving");
    setActionError(null);

    try {
      const results = await Promise.all(
        changed.map((update) =>
          supabase
            .from("workout_template_exercises")
            .update({ sort_order: update.sort_order })
            .eq("id", update.id)
        )
      );
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) {
        const details = getErrorDetails(firstError);
        setActionError(`${details.code}: ${details.message}`);
      }
    } catch (error) {
      const details = getErrorDetails(error);
      setActionError(`${details.code}: ${details.message}`);
    } finally {
      setActionStatus("idle");
      await queryClient.invalidateQueries({
        queryKey: ["workout-template-exercises", templateId],
      });
    }
  };

  const template = templateQuery.data;

  if (!templateId) {
    if (import.meta.env.DEV && id) {
      console.warn("INVALID_TEMPLATE_ID", id);
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid template link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Template id: {id ?? "missing"}</p>
          <Button variant="secondary" onClick={() => navigate("/pt/templates/workouts")}>
            Back to templates
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Template builder</h2>
          <p className="text-sm text-muted-foreground">Configure structured exercises.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">{formatWorkoutTypeTag(template?.workout_type_tag)}</Badge>
          <Button variant="secondary" onClick={() => navigate("/pt/templates/workouts")}>
            Back to templates
          </Button>
          <Button variant="ghost" onClick={() => setDeleteTemplateOpen(true)}>
            Delete template
          </Button>
        </div>
      </div>

      {templateQuery.isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : templateQuery.error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Template error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {getErrorDetails(templateQuery.error).code}: {getErrorDetails(templateQuery.error).message}
          </CardContent>
        </Card>
      ) : !template ? (
        <Card>
          <CardHeader>
            <CardTitle>Template not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This template could not be loaded.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Template name</label>
              <Input value={template.name ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Workout type</label>
              <Input value={formatWorkoutTypeTag(template.workout_type_tag)} readOnly />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Exercises</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add exercises with sets, reps, RPE, tempo, and notes.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            Add exercise
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {actionError}
            </div>
          ) : null}
          {templateExercisesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : templateExercisesQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              {getErrorDetails(templateExercisesQuery.error).code}: {getErrorDetails(templateExercisesQuery.error).message}
            </div>
          ) : exerciseRows.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={exerciseRows.map((row) => row.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {exerciseRows.map((row, index) => (
                    <SortableExerciseRow
                      key={row.id}
                      row={row}
                      index={index}
                      total={exerciseRows.length}
                      actionStatus={actionStatus}
                      onMove={handleMove}
                      onEdit={openEdit}
                      onDelete={(target) => {
                        setSelectedRow(target);
                        setDeleteOpen(true);
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              No exercises yet. Add one to start building this template.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setSearch("");
            setSelectedExerciseId("");
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add exercise</DialogTitle>
            <DialogDescription>Select an exercise from your library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search exercises"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-2">
              {exercisesQuery.isLoading ? (
                <div className="text-xs text-muted-foreground">Loading exercises...</div>
              ) : exercisesQuery.error ? (
                <div className="text-xs text-destructive">
                  {getErrorDetails(exercisesQuery.error).code}: {getErrorDetails(exercisesQuery.error).message}
                </div>
              ) : filteredExercises.length > 0 ? (
                filteredExercises.map((exercise) => (
                  <button
                    type="button"
                    key={exercise.id}
                    onClick={() => setSelectedExerciseId(exercise.id)}
                    className={
                      selectedExerciseId === exercise.id
                        ? "w-full rounded-md border border-accent bg-accent/10 px-3 py-2 text-left text-sm"
                        : "w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-left text-sm"
                    }
                  >
                    <div className="font-medium">{exercise.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {exercise.primary_muscle ?? exercise.muscle_group ?? "Other"}
                      {exercise.equipment ? ` - ${exercise.equipment}` : ""}
                    </div>
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
                  </button>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No matching exercises.</div>
              )}
            </div>
            {actionError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {actionError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedExerciseId || actionStatus === "saving"}
              onClick={handleAddExercise}
            >
              {actionStatus === "saving" ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setSelectedRow(null);
            setForm(emptyExerciseForm);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit exercise</DialogTitle>
            <DialogDescription>Update sets, reps, and coaching cues.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Sets</label>
              <Input
                type="number"
                value={form.sets}
                onChange={(event) => setForm((prev) => ({ ...prev, sets: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Reps</label>
              <Input
                value={form.reps}
                onChange={(event) => setForm((prev) => ({ ...prev, reps: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Rest (sec)</label>
              <Input
                type="number"
                value={form.rest_seconds}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, rest_seconds: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Tempo</label>
              <Input
                value={form.tempo}
                onChange={(event) => setForm((prev) => ({ ...prev, tempo: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">RPE</label>
              <Input
                type="number"
                step="0.1"
                value={form.rpe}
                onChange={(event) => setForm((prev) => ({ ...prev, rpe: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Video URL</label>
              <Input
                value={form.video_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, video_url: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Notes</label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>
          {actionError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {actionError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button disabled={actionStatus === "saving"} onClick={handleEditSave}>
              {actionStatus === "saving" ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Remove exercise</DialogTitle>
            <DialogDescription>
              This will remove the exercise from the template only.
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
              {actionStatus === "saving" ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTemplateOpen}
        onOpenChange={(open) => {
          setDeleteTemplateOpen(open);
          if (!open) {
            setDeleteTemplateError(null);
            setDeleteTemplateStatus("idle");
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete template</DialogTitle>
            <DialogDescription>
              This will delete the template and all dependent workouts and exercises.
            </DialogDescription>
          </DialogHeader>
          {deleteTemplateError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {deleteTemplateError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteTemplateStatus === "deleting"}
              onClick={handleTemplateDelete}
            >
              {deleteTemplateStatus === "deleting" ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
