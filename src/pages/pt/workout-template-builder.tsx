import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
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
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/coachos";
import { Skeleton } from "../../components/ui/skeleton";
import { ExerciseMuscleClassificationFields } from "../../components/pt/exercise-muscle-classification-fields";
import { ExercisePicker } from "../../components/pt/exercise-picker";
import {
  buildWorkoutTemplateExerciseInsertRows,
  partitionNewExerciseSelections,
  type PersistentExerciseLibraryRecord,
  type ResolvedExerciseSelection,
} from "../../lib/exercise-domain";
import {
  adaptPersistedExerciseBrowserItem,
  classifyProviderSavedMatch,
} from "../../lib/exercise-browser";
import { buildCurrentProviderExerciseInsertPayload } from "../../lib/exercise-import";
import {
  emptyExercisePickerSelection,
  resolveExercisePickerSelections,
  type ExercisePickerSelectionState,
} from "../../lib/exercise-picker";
import {
  buildCustomExerciseMusclePersistenceFields,
  createEmptyExerciseMuscleFormValue,
  type ExerciseMuscleFormValue,
} from "../../lib/exercise-muscle-classification";
import { exerciseLibraryFullQueryOptions } from "../../lib/exercise-queries";
import {
  EXERCISE_LIBRARY_FULL_PROJECTION,
  exerciseQueryKeys,
  workoutTemplateExerciseQueryKeys,
} from "../../lib/exercise-query-contracts";
import {
  WorkoutTemplateExerciseMutationResultError,
  assertWorkoutTemplateExerciseMutationResult,
  getWorkoutTemplateExerciseMutationMessage,
  type WorkoutTemplateExerciseMutationRow,
} from "../../lib/workout-template-exercise-mutations";
import {
  ASSIGNMENT_SNAPSHOT_NOTICE,
  ASSIGNMENT_SNAPSHOT_WARNING_TITLE,
} from "../../lib/assignment-semantics";
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

const DELETE_PROTECTION_MESSAGE =
  "Delete failed. This template is already assigned to a client and cannot be deleted. Existing client assignments prevent deletion. Historical records are preserved.";

const isDeleteProtectionError = (error: unknown) => {
  const details = getErrorDetails(error);
  const message = details.message.toLowerCase();
  return (
    details.code === "23503" ||
    details.code === "P0001" ||
    message.includes("foreign key constraint") ||
    message.includes("still referenced") ||
    message.includes("cannot be deleted") ||
    message.includes("already assigned")
  );
};

const getTemplateMutationErrorMessage = (error: unknown) => {
  if (isDeleteProtectionError(error)) return DELETE_PROTECTION_MESSAGE;
  const details = getErrorDetails(error);
  return `${details.code}: ${details.message}`;
};

const reportWorkoutTemplateExerciseMutationFailure = (params: {
  operation: string;
  templateId: string;
  expectedIds: readonly string[];
  error: unknown;
}) => {
  const details = getErrorDetails(params.error);
  const returnedIds =
    params.error instanceof WorkoutTemplateExerciseMutationResultError
      ? params.error.returnedIds
      : [];
  console.error("WTE_MUTATION_FAILED", {
    operation: params.operation,
    templateId: params.templateId,
    wteRowIds: params.expectedIds,
    expectedRowCount: params.expectedIds.length,
    returnedRowCount: returnedIds.length,
    databaseErrorCode: details.code,
  });
};

const formatWorkoutTypeTag = (value: string | null | undefined) =>
  value && value.trim().length > 0 ? value : "Workout";

const loadErrorMessage =
  "Please retry shortly. If this keeps happening, contact support.";

function AssignmentSnapshotCallout() {
  return (
    <div className="assignment-snapshot-callout rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">
        {ASSIGNMENT_SNAPSHOT_WARNING_TITLE}
      </p>
      <p className="mt-1 text-muted-foreground">{ASSIGNMENT_SNAPSHOT_NOTICE}</p>
    </div>
  );
}

type TemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  workout_type: string | null;
  workout_type_tag: string | null;
};

type TemplateExerciseLibraryRecord = Pick<
  PersistentExerciseLibraryRecord,
  "id" | "name" | "muscle_group" | "equipment" | "video_url"
>;

type TemplateExerciseRow = {
  id: string;
  exercise_id: string;
  sort_order: number | null;
  sets: number | null;
  reps: string | null;
  superset_group: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe: number | null;
  video_url: string | null;
  notes: string | null;
  exercise: TemplateExerciseLibraryRecord | null;
};

const getSingleRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

type TemplateExerciseForm = {
  sets: string;
  reps: string;
  superset_group: string;
  rest_seconds: string;
  tempo: string;
  rpe: string;
  video_url: string;
  notes: string;
};

type BulkTemplateExerciseForm = {
  sets: string;
  reps: string;
  rest_seconds: string;
  tempo: string;
  rpe: string;
};

type LibraryExerciseForm = {
  name: string;
  muscleClassification: ExerciseMuscleFormValue;
  equipment: string;
  video_url: string;
};

const emptyExerciseForm: TemplateExerciseForm = {
  sets: "",
  reps: "",
  superset_group: "",
  rest_seconds: "",
  tempo: "",
  rpe: "",
  video_url: "",
  notes: "",
};

const emptyBulkExerciseForm: BulkTemplateExerciseForm = {
  sets: "",
  reps: "",
  rest_seconds: "",
  tempo: "",
  rpe: "",
};

const emptyLibraryExerciseForm: LibraryExerciseForm = {
  name: "",
  muscleClassification: createEmptyExerciseMuscleFormValue(),
  equipment: "",
  video_url: "",
};

const isUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );

const nextSupersetGroup = (rows: TemplateExerciseRow[]) => {
  const used = new Set(
    rows
      .map((row) => row.superset_group?.trim())
      .filter((group): group is string => Boolean(group)),
  );
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (!used.has(letter)) return letter;
  }
  let index = 1;
  while (used.has(`G${index}`)) index += 1;
  return `G${index}`;
};

type SortableExerciseRowProps = {
  row: TemplateExerciseRow;
  groupPosition?: "single" | "top" | "middle" | "bottom";
  compactWithPrevious?: boolean;
  isSupersetDropTarget?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (rowId: string) => void;
  onEdit: (row: TemplateExerciseRow) => void;
  onDelete: (row: TemplateExerciseRow) => void;
};

function SortableExerciseRow({
  row,
  groupPosition = "single",
  compactWithPrevious = false,
  isSupersetDropTarget = false,
  isSelected = false,
  onToggleSelect,
  onEdit,
  onDelete,
}: SortableExerciseRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isGrouped = Boolean(row.superset_group);
  const groupClass =
    groupPosition === "top"
      ? "rounded-t-lg rounded-b-none border-b-0"
      : groupPosition === "middle"
        ? "rounded-none border-b-0"
        : groupPosition === "bottom"
          ? "rounded-b-lg rounded-t-none"
          : "rounded-lg";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        isDragging
          ? `${compactWithPrevious ? "mt-0" : "mt-3"} first:mt-0 ${groupClass} border p-3 shadow-lg ${isGrouped ? "border-emerald-500/60 bg-emerald-500/10" : "border-border bg-muted/50"}`
          : `${compactWithPrevious ? "mt-0" : "mt-3"} first:mt-0 ${groupClass} border p-3 ${isSupersetDropTarget ? "border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/50" : isGrouped ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-muted/30"}`
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect?.(row.id)}
            className="mt-1 h-4 w-4 rounded border-border bg-background"
            aria-label={`Select ${row.exercise?.name ?? "exercise"}`}
          />
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
            <p className="text-sm font-semibold">
              {row.exercise?.name ?? "Exercise"}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.sets ?? "--"} sets - {row.reps ?? "--"} reps
              {row.superset_group ? " - Superset" : ""}
              {row.rpe ? ` - RPE ${row.rpe}` : ""}
            </p>
            {row.superset_group && groupPosition === "top" ? (
              <span className="mt-1 inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                Superset
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
  const { workspaceId, ownerUserId } = useWorkspace();
  const [addOpen, setAddOpen] = useState(false);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false);
  const [deleteTemplateStatus, setDeleteTemplateStatus] = useState<
    "idle" | "deleting"
  >("idle");
  const [deleteTemplateError, setDeleteTemplateError] = useState<string | null>(
    null,
  );
  const [exerciseSelection, setExerciseSelection] =
    useState<ExercisePickerSelectionState>(emptyExercisePickerSelection);
  const [createExerciseForm, setCreateExerciseForm] =
    useState<LibraryExerciseForm>(emptyLibraryExerciseForm);
  const [createExerciseError, setCreateExerciseError] = useState<string | null>(
    null,
  );
  const [createExerciseStatus, setCreateExerciseStatus] = useState<
    "idle" | "saving"
  >("idle");
  const [selectedRow, setSelectedRow] = useState<TemplateExerciseRow | null>(
    null,
  );
  const [form, setForm] = useState<TemplateExerciseForm>(emptyExerciseForm);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkExerciseIds, setBulkExerciseIds] = useState<string[]>([]);
  const [bulkForm, setBulkForm] = useState<BulkTemplateExerciseForm>(
    emptyBulkExerciseForm,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<"idle" | "saving">("idle");
  const [exerciseRows, setExerciseRows] = useState<TemplateExerciseRow[]>([]);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const addSubmissionInFlightRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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

  const ownerScopeQuery = useQuery({
    queryKey: ["workspace-owner", workspaceId],
    enabled: !!workspaceId && !ownerUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("owner_user_id")
        .eq("id", workspaceId ?? "")
        .maybeSingle();
      if (error) throw error;
      return (
        (data as { owner_user_id: string | null } | null)?.owner_user_id ?? null
      );
    },
  });

  const libraryOwnerUserId = ownerUserId ?? ownerScopeQuery.data ?? null;

  const exercisesQuery = useQuery(
    exerciseLibraryFullQueryOptions(libraryOwnerUserId),
  );

  const templateExercisesQuery = useQuery({
    queryKey: workoutTemplateExerciseQueryKeys.builder(templateId),
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select(
          "id, exercise_id, sort_order, sets, reps, superset_group, rest_seconds, tempo, rpe, video_url, notes, exercise:exercises(id,name,muscle_group,equipment,video_url)",
        )
        .eq("workout_template_id", templateId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<
        Omit<TemplateExerciseRow, "exercise"> & {
          exercise:
            | TemplateExerciseLibraryRecord
            | TemplateExerciseLibraryRecord[]
            | null;
        }
      >;
      return rows.map((row) => ({
        ...row,
        exercise: getSingleRelation(row.exercise),
      }));
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
      .sort((a, b) =>
        a.order === b.order ? a.index - b.index : a.order - b.order,
      )
      .map((item) => item.row);
    setExerciseRows(normalized);
  }, [templateExercisesQuery.data]);

  useEffect(() => {
    setBulkExerciseIds((prev) =>
      prev.filter((id) => exerciseRows.some((row) => row.id === id)),
    );
  }, [exerciseRows]);

  const exercises = useMemo(
    () => exercisesQuery.data ?? [],
    [exercisesQuery.data],
  );
  const existingTemplateExerciseIds = useMemo(
    () => new Set(exerciseRows.map((row) => row.exercise_id)),
    [exerciseRows],
  );

  const handleAddExercise = async () => {
    if (
      !templateId ||
      exerciseSelection.size === 0 ||
      addSubmissionInFlightRef.current
    ) {
      return;
    }
    if (!libraryOwnerUserId) {
      setActionError(
        "Shared library owner could not be resolved for this workspace.",
      );
      return;
    }
    addSubmissionInFlightRef.current = true;
    setActionStatus("saving");
    setActionError(null);

    try {
      const refreshedLibrary = await exercisesQuery.refetch();
      if (refreshedLibrary.error) throw refreshedLibrary.error;
      const currentLibraryExercises = refreshedLibrary.data ?? [];
      const { candidates, unresolvedKeys, nameConflictKeys } =
        resolveExercisePickerSelections(
          exerciseSelection,
          currentLibraryExercises,
        );
      if (unresolvedKeys.length > 0) {
        setActionError(
          `Unable to resolve ${unresolvedKeys.length} selected exercise${unresolvedKeys.length === 1 ? "" : "s"}. Clear the selection and choose the item again.`,
        );
        return;
      }
      if (nameConflictKeys.length > 0) {
        setActionError(
          `${nameConflictKeys.length} selected provider exercise${nameConflictKeys.length === 1 ? " has" : "s have"} a name conflict. Review the saved exercise before adding.`,
        );
        return;
      }

      const resolvedSelections: ResolvedExerciseSelection[] = [];

      for (const candidate of candidates) {
        if (candidate.source === "library") {
          resolvedSelections.push({ exerciseId: candidate.exerciseId });
        } else {
          const { data, error } = await supabase
            .from("exercises")
            .insert(
              buildCurrentProviderExerciseInsertPayload(
                libraryOwnerUserId,
                candidate.exercise,
              ),
            )
            .select("id")
            .single();

          if (error) {
            const details = getErrorDetails(error);
            if (details.code !== "23505") throw error;

            const concurrentLibrary = await exercisesQuery.refetch();
            if (concurrentLibrary.error) throw concurrentLibrary.error;
            const concurrentMatch = classifyProviderSavedMatch(
              candidate.exercise,
              concurrentLibrary.data ?? [],
            );
            if (concurrentMatch.status === "exact") {
              resolvedSelections.push({
                exerciseId: concurrentMatch.exerciseId,
              });
            } else if (concurrentMatch.status === "name_conflict") {
              throw new Error(
                `The provider exercise "${candidate.exercise.name}" now conflicts with a saved exercise name and was not merged.`,
              );
            } else {
              throw error;
            }
          } else {
            const createdId = (data as { id: string } | null)?.id ?? null;
            if (!createdId) {
              throw new Error(
                `The selected provider exercise "${candidate.exercise.name}" was created without a resolvable library id.`,
              );
            }
            resolvedSelections.push({ exerciseId: createdId });
          }
        }
      }

      const { data: currentRows, error: currentRowsError } = await supabase
        .from("workout_template_exercises")
        .select("exercise_id, sort_order")
        .eq("workout_template_id", templateId);
      if (currentRowsError) throw currentRowsError;

      const currentTemplateRows = (currentRows ?? []) as Array<{
        exercise_id: string;
        sort_order: number | null;
      }>;
      const existingExerciseIds = new Set(
        currentTemplateRows.map((row) => row.exercise_id),
      );
      const maxSort = currentTemplateRows.reduce(
        (maximum, row) => Math.max(maximum, row.sort_order ?? 0),
        0,
      );

      const { newSelections } = partitionNewExerciseSelections(
        resolvedSelections,
        existingExerciseIds,
      );
      if (newSelections.length === 0) {
        setActionError(
          "Every selected exercise is already in this workout template. Choose a different exercise.",
        );
        return;
      }

      const payload = buildWorkoutTemplateExerciseInsertRows(
        templateId,
        newSelections,
        maxSort,
      );
      const { error } = await supabase
        .from("workout_template_exercises")
        .insert(payload);
      if (error) throw error;

      setAddOpen(false);
      setExerciseSelection(emptyExercisePickerSelection());
      await queryClient.invalidateQueries({
        queryKey: exerciseQueryKeys.library.owner(libraryOwnerUserId),
      });
      await queryClient.invalidateQueries({
        queryKey: workoutTemplateExerciseQueryKeys.template(templateId),
      });
    } catch (error) {
      setActionError(getTemplateMutationErrorMessage(error));
    } finally {
      addSubmissionInFlightRef.current = false;
      setActionStatus("idle");
    }
  };

  const handleCreateExercise = async () => {
    if (!libraryOwnerUserId) {
      setCreateExerciseError(
        "Shared library owner could not be resolved for this workspace.",
      );
      return;
    }
    if (!createExerciseForm.name.trim()) {
      setCreateExerciseError("Exercise name is required.");
      return;
    }

    setCreateExerciseStatus("saving");
    setCreateExerciseError(null);

    const { data, error } = await supabase
      .from("exercises")
      .insert({
        owner_user_id: libraryOwnerUserId,
        workspace_id: null,
        name: createExerciseForm.name.trim(),
        equipment: createExerciseForm.equipment.trim() || null,
        video_url: createExerciseForm.video_url.trim() || null,
        source: "manual",
        ...buildCustomExerciseMusclePersistenceFields(
          createExerciseForm.muscleClassification,
        ),
      })
      .select(EXERCISE_LIBRARY_FULL_PROJECTION)
      .single();

    if (error) {
      const details = getErrorDetails(error);
      setCreateExerciseError(
        details.code === "23505"
          ? "An exercise with this name already exists in the shared library."
          : `${details.code}: ${details.message}`,
      );
      setCreateExerciseStatus("idle");
      return;
    }

    const createdExercise =
      (data as PersistentExerciseLibraryRecord | null) ?? null;
    await queryClient.invalidateQueries({
      queryKey: exerciseQueryKeys.library.owner(libraryOwnerUserId),
    });
    if (createdExercise) {
      const item = adaptPersistedExerciseBrowserItem(createdExercise);
      const selectionKey = `library:${createdExercise.id}` as const;
      setExerciseSelection((current) => {
        const next = new Map(current);
        next.set(selectionKey, {
          key: selectionKey,
          item,
          providerExercise: null,
        });
        return next;
      });
    }
    setCreateExerciseStatus("idle");
    setCreateExerciseOpen(false);
    setCreateExerciseForm(emptyLibraryExerciseForm);
  };

  const openEdit = (row: TemplateExerciseRow) => {
    setSelectedRow(row);
    setForm({
      sets: row.sets?.toString() ?? "",
      reps: row.reps ?? "",
      superset_group: row.superset_group ?? "",
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
    const operation = "single-row prescription save";
    const expectedIds = [selectedRow.id];
    setActionStatus("saving");
    setActionError(null);

    const payload = {
      sets: form.sets.trim() ? Number(form.sets) : null,
      reps: form.reps.trim() || null,
      superset_group: form.superset_group.trim() || null,
      rest_seconds: form.superset_group.trim()
        ? 0
        : form.rest_seconds.trim()
          ? Number(form.rest_seconds)
          : null,
      tempo: form.tempo.trim() || null,
      rpe: form.rpe.trim() ? Number(form.rpe) : null,
      video_url: form.video_url.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .update(payload)
        .eq("id", selectedRow.id)
        .select("id");
      if (error) throw error;
      assertWorkoutTemplateExerciseMutationResult({
        operation,
        expectedIds,
        rows: data as WorkoutTemplateExerciseMutationRow[] | null,
      });

      setEditOpen(false);
      setSelectedRow(null);
      await queryClient.invalidateQueries({
        queryKey: workoutTemplateExerciseQueryKeys.builder(templateId),
      });
    } catch (error) {
      reportWorkoutTemplateExerciseMutationFailure({
        operation,
        templateId,
        expectedIds,
        error,
      });
      setActionError(getWorkoutTemplateExerciseMutationMessage(error));
      await templateExercisesQuery.refetch();
    } finally {
      setActionStatus("idle");
    }
  };

  const handleBulkEditSave = async () => {
    if (!templateId || bulkExerciseIds.length === 0) return;
    const hasAnyField =
      bulkForm.sets.trim() ||
      bulkForm.reps.trim() ||
      bulkForm.rest_seconds.trim() ||
      bulkForm.tempo.trim() ||
      bulkForm.rpe.trim();
    if (!hasAnyField) {
      setActionError("Enter at least one value to apply.");
      return;
    }

    const operation = "bulk prescription edit";
    const expectedIds = [...bulkExerciseIds];
    setActionStatus("saving");
    setActionError(null);
    try {
      const results = await Promise.all(
        bulkExerciseIds.map((id) => {
          const row = exerciseRows.find((item) => item.id === id) ?? null;
          const payload: Record<string, string | number | null> = {};
          if (bulkForm.sets.trim()) payload.sets = Number(bulkForm.sets);
          if (bulkForm.reps.trim()) payload.reps = bulkForm.reps.trim();
          if (bulkForm.tempo.trim()) payload.tempo = bulkForm.tempo.trim();
          if (bulkForm.rpe.trim()) payload.rpe = Number(bulkForm.rpe);
          if (bulkForm.rest_seconds.trim()) {
            payload.rest_seconds = row?.superset_group
              ? 0
              : Number(bulkForm.rest_seconds);
          }
          return supabase
            .from("workout_template_exercises")
            .update(payload)
            .eq("id", id)
            .select("id");
        }),
      );
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      assertWorkoutTemplateExerciseMutationResult({
        operation,
        expectedIds,
        rows: results.flatMap(
          (result) =>
            (result.data as WorkoutTemplateExerciseMutationRow[] | null) ?? [],
        ),
      });

      setBulkEditOpen(false);
      setBulkForm(emptyBulkExerciseForm);
      setBulkExerciseIds([]);
      await queryClient.invalidateQueries({
        queryKey: workoutTemplateExerciseQueryKeys.builder(templateId),
      });
    } catch (error) {
      reportWorkoutTemplateExerciseMutationFailure({
        operation,
        templateId,
        expectedIds,
        error,
      });
      setActionError(getWorkoutTemplateExerciseMutationMessage(error));
      await templateExercisesQuery.refetch();
    } finally {
      setActionStatus("idle");
    }
  };

  const handleDelete = async () => {
    if (!selectedRow || !templateId) return;
    const operation = "single-row delete";
    const expectedIds = [selectedRow.id];
    setActionStatus("saving");
    setActionError(null);

    try {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .delete()
        .eq("id", selectedRow.id)
        .select("id");
      if (error) throw error;
      assertWorkoutTemplateExerciseMutationResult({
        operation,
        expectedIds,
        rows: data as WorkoutTemplateExerciseMutationRow[] | null,
      });

      setDeleteOpen(false);
      setSelectedRow(null);
      await queryClient.invalidateQueries({
        queryKey: workoutTemplateExerciseQueryKeys.builder(templateId),
      });
    } catch (error) {
      reportWorkoutTemplateExerciseMutationFailure({
        operation,
        templateId,
        expectedIds,
        error,
      });
      setActionError(
        isDeleteProtectionError(error)
          ? getTemplateMutationErrorMessage(error)
          : getWorkoutTemplateExerciseMutationMessage(error),
      );
      await templateExercisesQuery.refetch();
    } finally {
      setActionStatus("idle");
    }
  };

  const handleTemplateDelete = async () => {
    if (!templateId) return;
    setDeleteTemplateStatus("deleting");
    setDeleteTemplateError(null);

    const { error } = await supabase
      .from("workout_templates")
      .delete()
      .eq("id", templateId);
    if (error) {
      setDeleteTemplateError(getTemplateMutationErrorMessage(error));
      setDeleteTemplateStatus("idle");
      return;
    }

    setDeleteTemplateStatus("idle");
    setDeleteTemplateOpen(false);
    await queryClient.invalidateQueries({
      queryKey: ["workout-templates", workspaceId],
    });
    navigate("/pt/templates/workouts");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!templateId || actionStatus === "saving") return;
    const { active, over } = event;
    setDragActiveId(null);
    setDragOverId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = exerciseRows.findIndex((row) => row.id === active.id);
    const newIndex = exerciseRows.findIndex((row) => row.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousRows = exerciseRows;
    const movedRows = arrayMove(previousRows, oldIndex, newIndex);
    const draggedRow = movedRows.find((row) => row.id === active.id) ?? null;
    const targetRow = movedRows.find((row) => row.id === over.id) ?? null;
    const draggedPrevRow =
      exerciseRows.find((row) => row.id === active.id) ?? null;
    const targetPrevRow =
      exerciseRows.find((row) => row.id === over.id) ?? null;
    if (!draggedRow || !targetRow || !draggedPrevRow || !targetPrevRow) return;

    const draggedGroup = draggedPrevRow.superset_group?.trim() ?? "";
    const targetGroup = targetPrevRow.superset_group?.trim() ?? "";
    const shouldCreateSuperset =
      draggedGroup.length === 0 && targetGroup.length === 0;
    const shouldSplitDraggedSuperset =
      draggedGroup.length > 0 && targetGroup !== draggedGroup;
    const sharedSupersetGroup = shouldCreateSuperset
      ? nextSupersetGroup(movedRows)
      : null;

    const updatedRows = movedRows.map((row) => {
      if (
        shouldCreateSuperset &&
        (row.id === draggedRow.id || row.id === targetRow.id)
      ) {
        return { ...row, superset_group: sharedSupersetGroup, rest_seconds: 0 };
      }
      if (
        shouldSplitDraggedSuperset &&
        row.superset_group?.trim() === draggedGroup
      ) {
        return {
          ...row,
          superset_group: null,
          rest_seconds: row.rest_seconds === 0 ? null : row.rest_seconds,
        };
      }
      return row;
    });
    setExerciseRows(updatedRows);

    const changedPayload = new Map<string, Record<string, unknown>>();
    updatedRows.forEach((row, index) => {
      const prevRow = exerciseRows.find((item) => item.id === row.id);
      if (!prevRow) return;

      const nextSort = (index + 1) * 10;
      if ((prevRow.sort_order ?? null) !== nextSort) {
        const existing = changedPayload.get(row.id) ?? {};
        changedPayload.set(row.id, { ...existing, sort_order: nextSort });
      }

      if (
        shouldCreateSuperset &&
        (row.id === draggedRow.id || row.id === targetRow.id) &&
        ((prevRow.superset_group ?? null) !== sharedSupersetGroup ||
          (prevRow.rest_seconds ?? null) !== 0)
      ) {
        const existing = changedPayload.get(row.id) ?? {};
        changedPayload.set(row.id, {
          ...existing,
          superset_group: sharedSupersetGroup,
          rest_seconds: 0,
        });
      }

      if (
        shouldSplitDraggedSuperset &&
        prevRow.superset_group?.trim() === draggedGroup &&
        ((prevRow.superset_group ?? null) !== (row.superset_group ?? null) ||
          (prevRow.rest_seconds ?? null) !== (row.rest_seconds ?? null))
      ) {
        const existing = changedPayload.get(row.id) ?? {};
        changedPayload.set(row.id, {
          ...existing,
          superset_group: row.superset_group,
          rest_seconds: row.rest_seconds,
        });
      }
    });

    if (changedPayload.size === 0) return;

    const operation = "drag reorder and superset save";
    const expectedIds = Array.from(changedPayload.keys());
    setActionStatus("saving");
    setActionError(null);

    try {
      const results = await Promise.all(
        Array.from(changedPayload.entries()).map(([id, payload]) =>
          supabase
            .from("workout_template_exercises")
            .update(payload)
            .eq("id", id)
            .select("id"),
        ),
      );
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      assertWorkoutTemplateExerciseMutationResult({
        operation,
        expectedIds,
        rows: results.flatMap(
          (result) =>
            (result.data as WorkoutTemplateExerciseMutationRow[] | null) ?? [],
        ),
      });
      await queryClient.invalidateQueries({
        queryKey: workoutTemplateExerciseQueryKeys.builder(templateId),
      });
    } catch (error) {
      setExerciseRows(previousRows);
      reportWorkoutTemplateExerciseMutationFailure({
        operation,
        templateId,
        expectedIds,
        error,
      });
      setActionError(getWorkoutTemplateExerciseMutationMessage(error));
      await templateExercisesQuery.refetch();
    } finally {
      setActionStatus("idle");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    setDragOverId(event.over ? String(event.over.id) : null);
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
          <Button
            variant="secondary"
            onClick={() => navigate("/pt/templates/workouts")}
          >
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
          <h2 className="text-xl font-semibold tracking-tight">
            Template builder
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure structured exercises.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">
            {formatWorkoutTypeTag(template?.workout_type_tag)}
          </Badge>
          <Button
            variant="secondary"
            onClick={() => navigate("/pt/templates/workouts")}
          >
            Back to templates
          </Button>
          <Button variant="ghost" onClick={() => setDeleteTemplateOpen(true)}>
            Delete template
          </Button>
        </div>
      </div>

      <AssignmentSnapshotCallout />

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
          <CardContent>
            <Alert tone="danger">
              <AlertTitle>Unable to load this template</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{loadErrorMessage}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void templateQuery.refetch()}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : !template ? (
        <Card>
          <CardHeader>
            <CardTitle>Template not found</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Template not found"
              description="This template could not be loaded."
            />
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
              <Input
                value={formatWorkoutTypeTag(template.workout_type_tag)}
                readOnly
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Exercises</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add exercises with sets, reps, RPE, tempo, and notes. Drag one
              exercise onto another to create a superset pair.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              Add exercise
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={exerciseRows.length === 0}
              onClick={() =>
                setBulkExerciseIds(exerciseRows.map((row) => row.id))
              }
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkExerciseIds.length === 0}
              onClick={() => setBulkExerciseIds([])}
            >
              Clear
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkExerciseIds.length === 0}
              onClick={() => {
                setActionError(null);
                setBulkEditOpen(true);
              }}
            >
              Bulk edit ({bulkExerciseIds.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {actionError}
            </div>
          ) : null}
          {templateExercisesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : templateExercisesQuery.error ? (
            <Alert tone="danger">
              <AlertTitle>Unable to load exercises</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{loadErrorMessage}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void templateExercisesQuery.refetch()}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : exerciseRows.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragCancel={() => {
                setDragActiveId(null);
                setDragOverId(null);
              }}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={exerciseRows.map((row) => row.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col">
                  {exerciseRows.map((row, index) =>
                    (() => {
                      const prev = exerciseRows[index - 1] ?? null;
                      const next = exerciseRows[index + 1] ?? null;
                      const sameAsPrev =
                        Boolean(row.superset_group) &&
                        prev?.superset_group === row.superset_group;
                      const sameAsNext =
                        Boolean(row.superset_group) &&
                        next?.superset_group === row.superset_group;
                      const groupPosition:
                        | "single"
                        | "top"
                        | "middle"
                        | "bottom" = sameAsPrev
                        ? sameAsNext
                          ? "middle"
                          : "bottom"
                        : sameAsNext
                          ? "top"
                          : "single";
                      const isSupersetDropTarget = (() => {
                        if (
                          !dragActiveId ||
                          dragActiveId === row.id ||
                          dragOverId !== row.id
                        ) {
                          return false;
                        }
                        const activeRow =
                          exerciseRows.find(
                            (item) => item.id === dragActiveId,
                          ) ?? null;
                        if (!activeRow) return false;
                        const activeHasGroup = Boolean(
                          activeRow.superset_group?.trim(),
                        );
                        const targetHasGroup = Boolean(
                          row.superset_group?.trim(),
                        );
                        return !activeHasGroup && !targetHasGroup;
                      })();
                      return (
                        <SortableExerciseRow
                          key={row.id}
                          row={row}
                          groupPosition={groupPosition}
                          compactWithPrevious={sameAsPrev}
                          isSupersetDropTarget={isSupersetDropTarget}
                          isSelected={bulkExerciseIds.includes(row.id)}
                          onToggleSelect={(rowId) =>
                            setBulkExerciseIds((prev) =>
                              prev.includes(rowId)
                                ? prev.filter((id) => id !== rowId)
                                : [...prev, rowId],
                            )
                          }
                          onEdit={openEdit}
                          onDelete={(target) => {
                            setSelectedRow(target);
                            setDeleteOpen(true);
                          }}
                        />
                      );
                    })(),
                  )}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <EmptyState
              title="No exercises yet"
              description="Add one to start building this template."
              actionLabel="Add exercise"
              onAction={() => setAddOpen(true)}
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={bulkEditOpen}
        onOpenChange={(open) => {
          setBulkEditOpen(open);
          if (!open) {
            setBulkForm(emptyBulkExerciseForm);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Bulk edit exercises</DialogTitle>
            <DialogDescription>
              Apply values to {bulkExerciseIds.length} selected exercise
              {bulkExerciseIds.length === 1 ? "" : "s"}. Leave a field blank to
              keep current values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Sets
              </label>
              <Input
                type="number"
                value={bulkForm.sets}
                onChange={(event) =>
                  setBulkForm((prev) => ({ ...prev, sets: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Reps
              </label>
              <Input
                value={bulkForm.reps}
                onChange={(event) =>
                  setBulkForm((prev) => ({ ...prev, reps: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Rest (sec)
              </label>
              <Input
                type="number"
                value={bulkForm.rest_seconds}
                onChange={(event) =>
                  setBulkForm((prev) => ({
                    ...prev,
                    rest_seconds: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Tempo
              </label>
              <Input
                value={bulkForm.tempo}
                onChange={(event) =>
                  setBulkForm((prev) => ({
                    ...prev,
                    tempo: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                RPE
              </label>
              <Input
                type="number"
                step="0.1"
                value={bulkForm.rpe}
                onChange={(event) =>
                  setBulkForm((prev) => ({ ...prev, rpe: event.target.value }))
                }
              />
            </div>
          </div>
          {actionError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {actionError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBulkEditOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={actionStatus === "saving"}
              onClick={handleBulkEditSave}
            >
              {actionStatus === "saving" ? "Applying..." : "Apply to selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setExerciseSelection(emptyExercisePickerSelection());
            setActionError(null);
          }
        }}
      >
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden rounded-[24px] p-0 sm:w-[calc(100vw-2rem)] lg:h-[min(92dvh,58rem)] lg:max-w-[1120px]">
          <DialogHeader className="shrink-0 px-4 pb-3 pt-4 pr-14 sm:px-6 sm:pt-5">
            <DialogTitle>Add exercises</DialogTitle>
            <DialogDescription>
              Select from your owner library or the connected provider. Sets,
              reps, and prescription details are configured after adding.
            </DialogDescription>
          </DialogHeader>
          <ExercisePicker
            open={addOpen}
            libraryExercises={exercises}
            libraryLoading={
              ownerScopeQuery.isLoading || exercisesQuery.isLoading
            }
            libraryError={ownerScopeQuery.error ?? exercisesQuery.error}
            existingExerciseIds={existingTemplateExerciseIds}
            selection={exerciseSelection}
            onSelectionChange={setExerciseSelection}
            onRetryLibrary={() => void exercisesQuery.refetch()}
            onCreateExercise={() => {
              setCreateExerciseError(null);
              setCreateExerciseOpen(true);
            }}
            onCancel={() => {
              setAddOpen(false);
              setExerciseSelection(emptyExercisePickerSelection());
              setActionError(null);
            }}
            onAddSelected={() => void handleAddExercise()}
            submitting={actionStatus === "saving"}
            submissionError={actionError}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={createExerciseOpen}
        onOpenChange={(open) => {
          setCreateExerciseOpen(open);
          if (!open) {
            setCreateExerciseError(null);
            setCreateExerciseStatus("idle");
            setCreateExerciseForm(emptyLibraryExerciseForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Create exercise</DialogTitle>
            <DialogDescription>
              Add a new exercise to the shared library without leaving this
              template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Name
              </label>
              <Input
                value={createExerciseForm.name}
                onChange={(event) =>
                  setCreateExerciseForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g., Bench Press"
              />
            </div>
            <ExerciseMuscleClassificationFields
              value={createExerciseForm.muscleClassification}
              onChange={(muscleClassification) =>
                setCreateExerciseForm((prev) => ({
                  ...prev,
                  muscleClassification,
                }))
              }
              disabled={createExerciseStatus === "saving"}
            />
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Equipment
              </label>
              <Input
                value={createExerciseForm.equipment}
                onChange={(event) =>
                  setCreateExerciseForm((prev) => ({
                    ...prev,
                    equipment: event.target.value,
                  }))
                }
                placeholder="e.g., Barbell"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Video URL
              </label>
              <Input
                value={createExerciseForm.video_url}
                onChange={(event) =>
                  setCreateExerciseForm((prev) => ({
                    ...prev,
                    video_url: event.target.value,
                  }))
                }
                placeholder="https://"
              />
            </div>
            {createExerciseError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
              >
                {createExerciseError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setCreateExerciseOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={createExerciseStatus === "saving"}
              onClick={handleCreateExercise}
            >
              {createExerciseStatus === "saving" ? "Creating..." : "Create"}
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
            <DialogDescription>
              Update sets, reps, and coaching cues.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Sets
              </label>
              <Input
                type="number"
                value={form.sets}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sets: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Reps
              </label>
              <Input
                value={form.reps}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reps: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Superset group
              </label>
              <select
                className="h-10 w-full app-field px-3 text-sm"
                value={form.superset_group}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    superset_group: event.target.value,
                  }))
                }
              >
                <option value="">None</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Rest (sec)
              </label>
              <Input
                type="number"
                value={form.rest_seconds}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    rest_seconds: event.target.value,
                  }))
                }
                disabled={Boolean(form.superset_group)}
              />
              {form.superset_group ? (
                <p className="text-[11px] text-muted-foreground">
                  Superset active. Rest is forced to 0 between paired exercises.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Tempo
              </label>
              <Input
                value={form.tempo}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, tempo: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                RPE
              </label>
              <Input
                type="number"
                step="0.1"
                value={form.rpe}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, rpe: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Video URL
              </label>
              <Input
                value={form.video_url}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    video_url: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Notes
              </label>
              <textarea
                className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </div>
          </div>
          {actionError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {actionError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={actionStatus === "saving"}
              onClick={handleEditSave}
            >
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
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {actionError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={actionStatus === "saving"}
              onClick={handleDelete}
            >
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
              This will delete the template and all dependent workouts and
              exercises.
            </DialogDescription>
          </DialogHeader>
          {deleteTemplateError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {deleteTemplateError}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeleteTemplateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
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
