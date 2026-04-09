import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import {
  exerciseDatasetConfigured,
  filterExerciseDataset,
  searchExerciseDataset,
  type ExerciseDatasetExercise,
} from "../../lib/exercise-dataset";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { Search } from "lucide-react";

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
  owner_user_id: string;
  name: string;
  category: string | null;
  muscle_group: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string | null;
  video_url: string | null;
  instructions: string | null;
  notes: string | null;
  cues: string | null;
  is_unilateral: boolean | null;
  tags: string[] | null;
  created_at: string | null;
  source: string | null;
  source_exercise_id: string | null;
};

type ExerciseFormState = {
  name: string;
  muscle_group: string;
  secondary_muscles: string;
  equipment: string;
  video_url: string;
  is_unilateral: boolean;
};

type DatasetSearchState = {
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
};

const emptyForm: ExerciseFormState = {
  name: "",
  muscle_group: "",
  secondary_muscles: "",
  equipment: "",
  video_url: "",
  is_unilateral: false,
};

const emptyDatasetSearch: DatasetSearchState = {
  name: "",
  bodyPart: "",
  equipment: "",
  target: "",
};

const datasetBodyPartOptions = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Core",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
  "Forearms",
  "Legs",
  "Full Body",
] as const;

const datasetEquipmentOptions = [
  "Barbell",
  "Dumbbell",
  "Cable",
  "Machine",
  "Body Weight",
  "Kettlebell",
  "Band",
  "Smith Machine",
  "EZ Bar",
  "Medicine Ball",
  "Stability Ball",
  "Bench",
  "Pull-Up Bar",
  "Trap Bar",
  "Plate",
  "Other",
] as const;

const datasetTargetOptions = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Core",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
  "Forearms",
  "Legs",
  "Full Body",
] as const;

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

const normalizeName = (value: string) => value.trim().toLowerCase();

const joinParagraphs = (values: string[]) =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");

const splitParagraphs = (value: string | null | undefined) =>
  (value ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

const getExerciseContextChips = (exercise: {
  category?: string | null;
  muscle_group?: string | null;
  primary_muscle?: string | null;
  tags?: string[] | null;
  is_unilateral?: boolean | null;
}) =>
  Array.from(
    new Set(
      [
        exercise.primary_muscle,
        exercise.muscle_group,
        exercise.category,
        ...(exercise.tags ?? []),
        exercise.is_unilateral ? "Unilateral" : null,
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  ).slice(0, 4);

const datasetPageSize = 24;

export function PtExerciseLibraryPage() {
  const queryClient = useQueryClient();
  const {
    workspaceId,
    ownerUserId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<ExerciseRow | null>(null);
  const [form, setForm] = useState<ExerciseFormState>(emptyForm);
  const [filters, setFilters] = useState({
    name: "",
    primary_muscle: "",
    tag: "",
  });
  const [datasetSearch, setDatasetSearch] =
    useState<DatasetSearchState>(emptyDatasetSearch);
  const [datasetResults, setDatasetResults] = useState<
    ExerciseDatasetExercise[]
  >([]);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetCursor, setDatasetCursor] = useState<string | null>(null);
  const [datasetHasMore, setDatasetHasMore] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<"idle" | "saving">("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const datasetBootstrappedRef = useRef(false);

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

  const libraryQuery = useQuery({
    queryKey: ["exercise-library", libraryOwnerUserId],
    enabled: !!libraryOwnerUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select(
          "id, owner_user_id, name, category, muscle_group, primary_muscle, secondary_muscles, equipment, video_url, instructions, notes, cues, is_unilateral, tags, created_at, source, source_exercise_id",
        )
        .eq("owner_user_id", libraryOwnerUserId ?? "")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseRow[];
    },
  });

  const exercises = useMemo(() => libraryQuery.data ?? [], [libraryQuery.data]);
  const existingSourceIds = useMemo(
    () =>
      new Set(
        exercises
          .map((exercise) => exercise.source_exercise_id?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    [exercises],
  );
  const existingNames = useMemo(
    () => new Set(exercises.map((exercise) => normalizeName(exercise.name))),
    [exercises],
  );

  const filteredExercises = useMemo(() => {
    const nameFilter = filters.name.trim().toLowerCase();
    const primaryFilter = filters.primary_muscle.trim().toLowerCase();
    const tagFilter = filters.tag.trim().toLowerCase();

    return exercises.filter((exercise) => {
      const nameMatch =
        !nameFilter || exercise.name.toLowerCase().includes(nameFilter);
      const primaryValue =
        exercise.primary_muscle ?? exercise.muscle_group ?? "";
      const primaryMatch =
        !primaryFilter || primaryValue.toLowerCase().includes(primaryFilter);
      const tags = exercise.tags ?? [];
      const tagsMatch =
        !tagFilter || tags.some((tag) => tag.toLowerCase().includes(tagFilter));
      return nameMatch && primaryMatch && tagsMatch;
    });
  }, [exercises, filters]);

  const filteredDatasetResults = useMemo(
    () => filterExerciseDataset(datasetResults, datasetSearch),
    [datasetResults, datasetSearch],
  );

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (exercise: ExerciseRow) => {
    setSelected(exercise);
    setForm({
      name: exercise.name,
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
    if (!libraryOwnerUserId) {
      setActionError(
        "Shared library owner could not be resolved for this workspace.",
      );
      return;
    }
    if (!form.name.trim()) {
      setActionError("Exercise name is required.");
      return;
    }

    setActionStatus("saving");
    setActionError(null);
    const payload = {
      owner_user_id: libraryOwnerUserId,
      name: form.name.trim(),
      muscle_group: form.muscle_group.trim() || null,
      secondary_muscles: splitList(form.secondary_muscles).length
        ? splitList(form.secondary_muscles)
        : null,
      equipment: form.equipment.trim() || null,
      video_url: form.video_url.trim() || null,
      is_unilateral: form.is_unilateral,
      source: selected?.source ?? "manual",
    };

    const response = selected
      ? await supabase.from("exercises").update(payload).eq("id", selected.id)
      : await supabase.from("exercises").insert(payload);

    if (response.error) {
      const details = getErrorDetails(response.error);
      setActionError(
        details.code === "23505"
          ? "An exercise with this name already exists in this shared library."
          : `${details.code}: ${details.message}`,
      );
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    setModalOpen(false);
    await queryClient.invalidateQueries({
      queryKey: ["exercise-library", libraryOwnerUserId],
    });
    setToastMessage("Exercise saved");
  };

  const handleDelete = async () => {
    if (!selected || !libraryOwnerUserId) return;
    setActionStatus("saving");
    setActionError(null);
    const { error } = await supabase
      .from("exercises")
      .delete()
      .eq("id", selected.id);
    if (error) {
      const details = getErrorDetails(error);
      setActionError(`${details.code}: ${details.message}`);
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    setDeleteOpen(false);
    setSelected(null);
    await queryClient.invalidateQueries({
      queryKey: ["exercise-library", libraryOwnerUserId],
    });
  };

  const loadDefaultDataset = async () => {
    if (!exerciseDatasetConfigured) return;
    setDatasetLoading(true);
    setDatasetError(null);
    try {
      const result = await searchExerciseDataset({
        ...emptyDatasetSearch,
        limit: datasetPageSize,
        cursor: null,
      });
      setDatasetResults(result.exercises);
      setDatasetCursor(result.nextCursor);
      setDatasetHasMore(Boolean(result.nextCursor));
    } catch (error) {
      const details = getErrorDetails(error);
      setDatasetError(`${details.code}: ${details.message}`);
    } finally {
      setDatasetLoading(false);
    }
  };

  const handleLoadMoreDataset = async () => {
    if (!datasetCursor) return;
    setDatasetLoading(true);
    setDatasetError(null);
    try {
      const result = await searchExerciseDataset({
        ...emptyDatasetSearch,
        limit: datasetPageSize,
        cursor: datasetCursor,
      });
      setDatasetResults((prev) => {
        const seen = new Set(prev.map((exercise) => exercise.id));
        const next = [...prev];
        result.exercises.forEach((exercise) => {
          if (seen.has(exercise.id)) return;
          seen.add(exercise.id);
          next.push(exercise);
        });
        return next;
      });
      setDatasetCursor(result.nextCursor);
      setDatasetHasMore(Boolean(result.nextCursor));
    } catch (error) {
      const details = getErrorDetails(error);
      setDatasetError(`${details.code}: ${details.message}`);
    } finally {
      setDatasetLoading(false);
    }
  };

  useEffect(() => {
    if (!exerciseDatasetConfigured) return;
    if (datasetBootstrappedRef.current) return;
    datasetBootstrappedRef.current = true;
    void loadDefaultDataset();
  }, []);

  const handleImportExercise = async (exercise: ExerciseDatasetExercise) => {
    if (!libraryOwnerUserId) {
      setDatasetError(
        "Shared library owner could not be resolved for this workspace.",
      );
      return;
    }
    if (existingSourceIds.has(exercise.id)) {
      setDatasetError("That exercise is already imported.");
      return;
    }
    if (existingNames.has(normalizeName(exercise.name))) {
      setDatasetError(
        "That exercise name already exists in this shared library.",
      );
      return;
    }

    setImportingId(exercise.id);
    setDatasetError(null);

    const { error } = await supabase.from("exercises").insert({
      owner_user_id: libraryOwnerUserId,
      name: exercise.name,
      muscle_group: exercise.bodyPart,
      primary_muscle: exercise.target,
      secondary_muscles: exercise.secondaryMuscles.length
        ? exercise.secondaryMuscles
        : null,
      equipment: exercise.equipment,
      instructions: exercise.instructions.length
        ? joinParagraphs(exercise.instructions)
        : null,
      video_url: exercise.videoUrl,
      notes: exercise.overview,
      cues: exercise.exerciseTips.length
        ? joinParagraphs(exercise.exerciseTips)
        : null,
      tags: Array.from(
        new Set(
          [exercise.bodyPart, exercise.target, exercise.equipment]
            .map((value) => value?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ),
      category: exercise.bodyPart,
      source: "exercise_dataset",
      source_exercise_id: exercise.id,
      source_payload: exercise.raw,
    });

    if (error) {
      const details = getErrorDetails(error);
      setDatasetError(
        details.code === "23505"
          ? "A matching exercise already exists in this shared library."
          : `${details.code}: ${details.message}`,
      );
      setImportingId(null);
      return;
    }

    setImportingId(null);
    await queryClient.invalidateQueries({
      queryKey: ["exercise-library", libraryOwnerUserId],
    });
    setToastMessage("Exercise imported");
  };

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div className="fixed right-6 top-6 z-50 w-[260px]">
          <Alert className="border-border bg-muted/90">
            <AlertDescription className="text-sm">
              {toastMessage}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      <WorkspacePageHeader
        title="Exercise Library"
        description="Manage a shared owner-level library used across owned workspaces."
        actions={<Button onClick={openCreate}>Add exercise</Button>}
      />

      {workspaceError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Workspace error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {getErrorDetails(workspaceError).code}:{" "}
            {getErrorDetails(workspaceError).message}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!exerciseDatasetConfigured ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Set `VITE_EXERCISE_DATASET_BASE_URL` to enable imports. Optional:
              `VITE_EXERCISE_DATASET_API_KEY`,
              `VITE_EXERCISE_DATASET_API_KEY_HEADER`,
              `VITE_EXERCISE_DATASET_API_HOST`.
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative">
              <Search className="app-search-icon h-4 w-4" />
              <Input
                className="app-search-input"
                placeholder="Name"
                value={datasetSearch.name}
                onChange={(event) =>
                  setDatasetSearch((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <Select
              variant="filter"
              className="w-full"
              value={datasetSearch.bodyPart}
              onChange={(event) =>
                setDatasetSearch((prev) => ({
                  ...prev,
                  bodyPart: event.target.value,
                }))
              }
            >
              <option value="">All body parts</option>
              {datasetBodyPartOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            <Select
              variant="filter"
              className="w-full"
              value={datasetSearch.equipment}
              onChange={(event) =>
                setDatasetSearch((prev) => ({
                  ...prev,
                  equipment: event.target.value,
                }))
              }
            >
              <option value="">All equipment</option>
              {datasetEquipmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            <Select
              variant="filter"
              className="w-full"
              value={datasetSearch.target}
              onChange={(event) =>
                setDatasetSearch((prev) => ({
                  ...prev,
                  target: event.target.value,
                }))
              }
            >
              <option value="">All targets</option>
              {datasetTargetOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDatasetSearch(emptyDatasetSearch);
                setDatasetError(null);
              }}
            >
              Clear
            </Button>
          </div>
          {datasetError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {datasetError}
            </div>
          ) : null}
          {filteredDatasetResults.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-2">
                {filteredDatasetResults.map((exercise) => {
                  const sourceImported = existingSourceIds.has(exercise.id);
                  const nameExists = existingNames.has(
                    normalizeName(exercise.name),
                  );
                  const importDisabled = sourceImported || nameExists;
                  const statusLabel = sourceImported
                    ? "Already imported"
                    : nameExists
                      ? "Name already used"
                      : "Import";
                  const contextChips = Array.from(
                    new Set(
                      [
                        exercise.target,
                        exercise.bodyPart,
                        exercise.equipment,
                        ...exercise.secondaryMuscles,
                      ].filter((value): value is string =>
                        Boolean(value?.trim()),
                      ),
                    ),
                  ).slice(0, 4);
                  const cues = exercise.exerciseTips.slice(0, 2);
                  const instruction =
                    exercise.instructions[0] ?? exercise.overview;

                  return (
                    <div key={exercise.id} className="ops-surface-strong p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-3">
                          <div>
                            <div className="ops-kicker">Dataset movement</div>
                            <div className="mt-1 text-base font-semibold text-foreground">
                              {exercise.name}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {exercise.target ?? exercise.bodyPart ?? "Other"}
                            {exercise.equipment
                              ? ` • ${exercise.equipment}`
                              : ""}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={importDisabled ? "secondary" : "default"}
                          disabled={
                            importDisabled || importingId === exercise.id
                          }
                          onClick={() => handleImportExercise(exercise)}
                        >
                          {importingId === exercise.id
                            ? "Importing..."
                            : statusLabel}
                        </Button>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-3">
                        <div className="ops-stat">
                          <div className="ops-kicker">Movement</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {exercise.bodyPart ?? "General pattern"}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {contextChips.map((chip) => (
                              <span
                                key={chip}
                                className="ops-chip text-muted-foreground"
                              >
                                {chip}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="ops-stat">
                          <div className="ops-kicker">Muscles</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {[
                              exercise.target,
                              ...exercise.secondaryMuscles.slice(0, 2),
                            ]
                              .filter(Boolean)
                              .join(", ") || "General"}
                          </div>
                        </div>
                        <div className="ops-stat">
                          <div className="ops-kicker">Usage</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {exercise.equipment
                              ? `${exercise.equipment} setup`
                              : "Flexible setup"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="ops-stat">
                          <div className="ops-kicker">Coach Cues</div>
                          <div className="mt-2 space-y-1 text-sm text-foreground">
                            {cues.length > 0 ? (
                              cues.map((cue) => <div key={cue}>• {cue}</div>)
                            ) : (
                              <div>
                                {instruction ?? "No cue text from source."}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="ops-stat">
                          <div className="ops-kicker">Use Context</div>
                          <div className="mt-2 text-sm text-foreground">
                            {instruction ?? "Imported movement reference."}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {datasetHasMore ? (
                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    disabled={datasetLoading}
                    onClick={handleLoadMoreDataset}
                  >
                    {datasetLoading ? "Loading..." : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : !datasetLoading && exerciseDatasetConfigured ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              No loaded exercises match those filters.
            </div>
          ) : null}
          <div className="h-px bg-border/60" />
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              placeholder="Filter by name"
              value={filters.name}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            <Input
              placeholder="Filter by primary muscle"
              value={filters.primary_muscle}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  primary_muscle: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Filter by tag"
              value={filters.tag}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, tag: event.target.value }))
              }
            />
          </div>
          {workspaceLoading ||
          ownerScopeQuery.isLoading ||
          libraryQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">
              Loading exercises...
            </div>
          ) : ownerScopeQuery.error || libraryQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              {
                getErrorDetails(ownerScopeQuery.error ?? libraryQuery.error)
                  .code
              }
              :{" "}
              {
                getErrorDetails(ownerScopeQuery.error ?? libraryQuery.error)
                  .message
              }
            </div>
          ) : exercises.length === 0 ? (
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-[24px] border border-dashed border-border bg-muted/20 p-5">
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">
                    No exercises yet
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Add or import exercises to start building from a shared
                    owner library.
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[18px] border border-border/70 bg-background/45 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Categories
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {muscleGroups.slice(0, 5).map((group) => (
                        <span
                          key={group}
                          className="rounded-full border border-border/70 bg-secondary/18 px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          {group}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-border/70 bg-background/45 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Tags
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Examples: dumbbell, home gym, unilateral, power.
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-border/70 bg-background/45 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Shared scope
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Owned workspaces reuse the same exercise rows.
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-border/70 bg-background/35 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Example item
                </div>
                <div className="mt-3 rounded-[20px] border border-border/70 bg-background/45 p-4">
                  <div className="text-sm font-semibold text-foreground">
                    Dumbbell Split Squat
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Legs • Dumbbells
                  </div>
                </div>
              </div>
            </div>
          ) : filteredExercises.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No exercises match those filters.
            </div>
          ) : (
            filteredExercises.map((exercise) => (
              <div key={exercise.id} className="ops-surface-strong p-4">
                <div className="space-y-3">
                  <div>
                    <div className="ops-kicker">Library movement</div>
                    <p className="mt-1 text-base font-semibold text-foreground">
                      {exercise.name}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {exercise.primary_muscle ??
                      exercise.muscle_group ??
                      "Other"}
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
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEdit(exercise)}
                  >
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
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <div className="ops-stat">
                    <div className="ops-kicker">Movement</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {exercise.category ?? exercise.muscle_group ?? "General"}
                    </div>
                  </div>
                  <div className="ops-stat">
                    <div className="ops-kicker">Muscles</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {[
                        exercise.primary_muscle ?? exercise.muscle_group,
                        ...(exercise.secondary_muscles ?? []).slice(0, 2),
                      ]
                        .filter(Boolean)
                        .join(", ") || "General"}
                    </div>
                  </div>
                  <div className="ops-stat">
                    <div className="ops-kicker">Equipment</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {exercise.equipment ?? "Open setup"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="ops-stat">
                    <div className="ops-kicker">Coach Cues</div>
                    <div className="mt-2 space-y-1 text-sm text-foreground">
                      {splitParagraphs(exercise.cues).slice(0, 2).length > 0 ? (
                        splitParagraphs(exercise.cues)
                          .slice(0, 2)
                          .map((cue) => <div key={cue}>• {cue}</div>)
                      ) : (
                        <div>
                          {splitParagraphs(exercise.instructions)[0] ??
                            exercise.notes ??
                            "No cues added yet."}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="ops-stat">
                    <div className="ops-kicker">Use Context</div>
                    <div className="mt-2 text-sm text-foreground">
                      {exercise.notes ??
                        exercise.tags?.slice(0, 3).join(", ") ??
                        "Shared library movement."}
                    </div>
                  </div>
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
            <DialogTitle>
              {selected ? "Edit exercise" : "Add exercise"}
            </DialogTitle>
            <DialogDescription>
              Define movement defaults for the shared library.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Name
              </label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g., Bench Press"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Muscle group
              </label>
              <select
                className="h-10 w-full app-field px-3 text-sm"
                value={form.muscle_group}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    muscle_group: event.target.value,
                  }))
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
              <label className="text-xs font-semibold text-muted-foreground">
                Secondary muscles (comma-separated)
              </label>
              <Input
                value={form.secondary_muscles}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    secondary_muscles: event.target.value,
                  }))
                }
                placeholder="e.g., Triceps, Shoulders"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Equipment
              </label>
              <Input
                value={form.equipment}
                onChange={(event) =>
                  setForm((prev) => ({
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
                value={form.video_url}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    video_url: event.target.value,
                  }))
                }
                placeholder="https://"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.is_unilateral}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    is_unilateral: event.target.checked,
                  }))
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
              This removes the exercise from the shared library and dependent
              template rows.
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
            <Button
              variant="secondary"
              disabled={actionStatus === "saving"}
              onClick={handleDelete}
            >
              {actionStatus === "saving" ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
