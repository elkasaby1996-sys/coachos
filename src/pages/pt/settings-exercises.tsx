import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { ExerciseMuscleClassificationFields } from "../../components/pt/exercise-muscle-classification-fields";
import {
  ExerciseLibraryFilterPanel,
  ExerciseLibraryResults,
  ExerciseLibraryToolbar,
} from "../../components/pt/exercise-library";
import { WorkspacePageHeader } from "../../components/pt/workspace-page-header";
import {
  ExerciseDatasetError,
  exerciseDatasetConfigured,
  getExerciseDatasetExercise,
  getExerciseDatasetMetadataCatalog,
  mergeExerciseDatasetPages,
  searchExerciseDataset,
  type ExerciseDatasetExercise,
} from "../../lib/exercise-dataset";
import type { PersistentExerciseLibraryRecord } from "../../lib/exercise-domain";
import {
  DEFAULT_EXERCISE_BROWSER_FILTERS,
  DEFAULT_EXERCISE_PROVIDER_FACET_FILTERS,
  adaptPersistedExerciseBrowserItem,
  adaptProviderExerciseBrowserItem,
  applyExerciseBrowserProviderAnatomyState,
  filterExerciseBrowserItems,
  filterExerciseBrowserItemsByProviderFacets,
  getExerciseBrowserProviderAnatomyState,
  getExerciseDeleteErrorMessage,
  parseExerciseBrowserSearchParams,
  serializeExerciseBrowserSearchState,
  type ExerciseBrowserSearchState,
  type FilteredExerciseBrowserItem,
} from "../../lib/exercise-browser";
import {
  selectCanonicalMuscle,
  selectProviderBodyPart,
  selectProviderTargetMuscle,
  type ProviderBodyPartValue,
  type ProviderTargetMuscleValue,
} from "../../lib/exercise-provider-anatomy";
import {
  adaptPersistedExerciseMuscleProfile,
  buildCustomExerciseMusclePersistenceFields,
  createEmptyExerciseMuscleFormValue,
  getLegacyExerciseMuscleLabels,
  initializeExerciseMuscleFormValue,
  type ExerciseMuscleFormValue,
} from "../../lib/exercise-muscle-classification";
import { buildCurrentProviderExerciseInsertPayload } from "../../lib/exercise-import";
import { type MuscleKey } from "../../lib/exercise-muscle-taxonomy";
import { exerciseQueryKeys } from "../../lib/exercise-query-contracts";
import { exerciseLibraryFullQueryOptions } from "../../lib/exercise-queries";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import { useSearchParams } from "react-router-dom";
import { Play, Plus, RefreshCcw } from "lucide-react";

type ExerciseFormState = {
  name: string;
  equipment: string;
  video_url: string;
  is_unilateral: boolean;
};

const emptyForm: ExerciseFormState = {
  name: "",
  equipment: "",
  video_url: "",
  is_unilateral: false,
};

const libraryPageSize = 20;
const providerPageSize = 24;

const getErrorDetails = (error: unknown) => {
  if (!error) return { code: "unknown", message: "Unknown error" };
  if (typeof error === "object") {
    const details = error as { code?: string | null; message?: string | null };
    return {
      code: details.code ?? "unknown",
      message: details.message ?? "Unknown error",
    };
  }
  return { code: "unknown", message: "Unknown error" };
};

const getProviderErrorCopy = (error: unknown) =>
  error instanceof ExerciseDatasetError
    ? error.message
    : "The exercise provider is temporarily unavailable. Saved exercises remain available.";

export function PtExerciseLibraryPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    workspaceId,
    ownerUserId,
    loading: workspaceLoading,
    error: workspaceError,
  } = useWorkspace();
  const searchState = useMemo(
    () => parseExerciseBrowserSearchParams(searchParams),
    [searchParams],
  );
  const { view, filters, providerFilters } = searchState;
  const anatomyState = useMemo(
    () => getExerciseBrowserProviderAnatomyState(searchState),
    [searchState],
  );
  const [debouncedProviderQuery, setDebouncedProviderQuery] = useState(
    filters.query,
  );
  const [libraryPage, setLibraryPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExerciseId, setPreviewExerciseId] = useState<string | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] =
    useState<PersistentExerciseLibraryRecord | null>(null);
  const [form, setForm] = useState<ExerciseFormState>(emptyForm);
  const [muscleClassification, setMuscleClassification] =
    useState<ExerciseMuscleFormValue>(createEmptyExerciseMuscleFormValue);
  const [muscleClassificationChanged, setMuscleClassificationChanged] =
    useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<
    "idle" | "saving" | "deleting"
  >("idle");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedProviderQuery(filters.query.trim()),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [filters.query]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    setLibraryPage(0);
  }, [
    filters.muscleKey,
    filters.query,
    filters.equipment,
    providerFilters.bodyPart,
    providerFilters.exerciseType,
    providerFilters.target,
  ]);

  const updateSearchState = (
    update: (current: ExerciseBrowserSearchState) => ExerciseBrowserSearchState,
    replace = false,
  ) => {
    setSearchParams(serializeExerciseBrowserSearchState(update(searchState)), {
      replace,
    });
  };

  const updateFilters = (
    next: Partial<ExerciseBrowserSearchState["filters"]>,
    replace = false,
  ) =>
    updateSearchState(
      (current) => ({
        ...current,
        filters: { ...current.filters, ...next },
      }),
      replace,
    );

  const updateProviderFilter = (field: "exerciseType", value: string) =>
    updateSearchState(
      (current) => ({
        ...current,
        providerFilters: {
          ...current.providerFilters,
          [field]: value.trim() || null,
        },
      }),
      true,
    );

  const handleProviderBodyPartChange = (value: ProviderBodyPartValue | null) =>
    updateSearchState(
      (current) =>
        applyExerciseBrowserProviderAnatomyState(
          current,
          selectProviderBodyPart(
            getExerciseBrowserProviderAnatomyState(current),
            value,
          ),
        ),
      true,
    );

  const handleProviderTargetChange = (
    value: ProviderTargetMuscleValue | null,
  ) =>
    updateSearchState(
      (current) =>
        applyExerciseBrowserProviderAnatomyState(
          current,
          selectProviderTargetMuscle(
            getExerciseBrowserProviderAnatomyState(current),
            value,
          ),
        ),
      true,
    );

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
  const libraryQuery = useQuery(
    exerciseLibraryFullQueryOptions(libraryOwnerUserId),
  );
  const exercises = useMemo(() => libraryQuery.data ?? [], [libraryQuery.data]);
  const metadataQuery = useQuery({
    queryKey: ["exercise-provider-metadata"] as const,
    enabled: view === "provider" && exerciseDatasetConfigured,
    queryFn: ({ signal }) => getExerciseDatasetMetadataCatalog(signal),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const libraryItems = useMemo(
    () => exercises.map(adaptPersistedExerciseBrowserItem),
    [exercises],
  );
  const equipmentOptions = useMemo(() => {
    const byValue = new Map<string, { value: string; label: string }>();
    metadataQuery.data?.equipments.forEach(({ value, label }) => {
      byValue.set(value.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""), {
        value,
        label,
      });
    });
    exercises.forEach((exercise) => {
      const value = exercise.equipment?.trim();
      if (!value) return;
      const key = value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
      if (!byValue.has(key)) byValue.set(key, { value, label: value });
    });
    const selectedEquipment = filters.equipment?.trim();
    if (selectedEquipment) {
      const selectedKey = selectedEquipment
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const existing = byValue.get(selectedKey);
      byValue.set(selectedKey, {
        value: selectedEquipment,
        label: existing?.label ?? selectedEquipment,
      });
    }
    return Array.from(byValue.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [exercises, filters.equipment, metadataQuery.data?.equipments]);
  const exerciseTypeOptions = useMemo(() => {
    const byValue = new Map<string, { value: string; label: string }>();
    metadataQuery.data?.exercisetypes.forEach(({ value, label }) => {
      byValue.set(value.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""), {
        value,
        label,
      });
    });
    libraryItems.forEach((item) => {
      const value = item.exerciseType?.trim();
      if (!value) return;
      const key = value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
      if (!byValue.has(key)) byValue.set(key, { value, label: value });
    });
    const selectedType = providerFilters.exerciseType?.trim();
    if (selectedType) {
      const selectedKey = selectedType
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const existing = byValue.get(selectedKey);
      byValue.set(selectedKey, {
        value: selectedType,
        label: existing?.label ?? selectedType,
      });
    }
    return Array.from(byValue.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [
    libraryItems,
    metadataQuery.data?.exercisetypes,
    providerFilters.exerciseType,
  ]);
  const providerEquipmentFilter = useMemo(() => {
    const selected = filters.equipment?.trim();
    if (!selected) return "";
    const selectedKey = selected.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      metadataQuery.data?.equipments.find(
        ({ value }) =>
          value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") === selectedKey,
      )?.value ?? selected
    );
  }, [filters.equipment, metadataQuery.data?.equipments]);
  const filteredLibraryItems = useMemo(
    () =>
      filterExerciseBrowserItems(
        filterExerciseBrowserItemsByProviderFacets(
          libraryItems,
          providerFilters,
        ),
        {
          ...filters,
          origin: "all",
          classification: "all",
        },
      ),
    [filters, libraryItems, providerFilters],
  );
  const libraryPageCount = Math.max(
    1,
    Math.ceil(filteredLibraryItems.length / libraryPageSize),
  );
  const visibleLibraryItems = useMemo(() => {
    const safePage = Math.min(libraryPage, libraryPageCount - 1);
    return filteredLibraryItems.slice(
      safePage * libraryPageSize,
      (safePage + 1) * libraryPageSize,
    );
  }, [filteredLibraryItems, libraryPage, libraryPageCount]);

  const providerQuery = useInfiniteQuery({
    queryKey: [
      "exercise-provider-browser",
      debouncedProviderQuery,
      providerFilters.bodyPart,
      providerEquipmentFilter,
      providerFilters.target,
      providerFilters.exerciseType,
    ] as const,
    enabled: view === "provider" && exerciseDatasetConfigured,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      searchExerciseDataset({
        name: debouncedProviderQuery,
        bodyPart: providerFilters.bodyPart ?? "",
        equipment: providerEquipmentFilter,
        target: providerFilters.target ?? "",
        exerciseType: providerFilters.exerciseType ?? "",
        limit: providerPageSize,
        cursor: pageParam,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const providerExercises = useMemo(
    () => mergeExerciseDatasetPages(providerQuery.data?.pages),
    [providerQuery.data?.pages],
  );
  const providerById = useMemo(
    () => new Map(providerExercises.map((exercise) => [exercise.id, exercise])),
    [providerExercises],
  );
  const previewExercise = previewExerciseId
    ? providerById.get(previewExerciseId)
    : null;
  const providerDetailQuery = useQuery({
    queryKey: ["exercise-provider-detail", previewExerciseId] as const,
    enabled: previewOpen && Boolean(previewExerciseId),
    queryFn: ({ signal }) =>
      getExerciseDatasetExercise(previewExerciseId ?? "", signal),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const providerItems = useMemo(
    () =>
      providerExercises.map((exercise) =>
        adaptProviderExerciseBrowserItem(exercise, exercises),
      ),
    [exercises, providerExercises],
  );
  const filteredProviderItems = useMemo(
    () =>
      filterExerciseBrowserItems(providerItems, {
        ...filters,
        origin: "all",
        classification: "all",
      }),
    [filters, providerItems],
  );

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setMuscleClassification(createEmptyExerciseMuscleFormValue());
    setMuscleClassificationChanged(false);
    setActionError(null);
    setModalOpen(true);
  };

  const openEdit = (exercise: PersistentExerciseLibraryRecord) => {
    setSelected(exercise);
    setForm({
      name: exercise.name,
      equipment: exercise.equipment ?? "",
      video_url: exercise.video_url ?? "",
      is_unilateral: exercise.is_unilateral ?? false,
    });
    setMuscleClassification(initializeExerciseMuscleFormValue(exercise));
    setMuscleClassificationChanged(false);
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
      equipment: form.equipment.trim() || null,
      video_url: form.video_url.trim() || null,
      is_unilateral: form.is_unilateral,
      ...(selected ? {} : { workspace_id: null, source: "manual" }),
      ...(!selected || muscleClassificationChanged
        ? buildCustomExerciseMusclePersistenceFields(muscleClassification)
        : {}),
    };

    const response = selected
      ? await supabase.from("exercises").update(payload).eq("id", selected.id)
      : await supabase.from("exercises").insert(payload);

    if (response.error) {
      const details = getErrorDetails(response.error);
      setActionError(
        details.code === "23505"
          ? "An exercise with this name already exists in this shared library."
          : "The exercise could not be saved. Try again.",
      );
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    setModalOpen(false);
    await queryClient.invalidateQueries({
      queryKey: exerciseQueryKeys.library.owner(libraryOwnerUserId),
    });
    setToastMessage("Exercise saved");
  };

  const handleDelete = async () => {
    if (!selected || !libraryOwnerUserId) return;
    setActionStatus("deleting");
    setActionError(null);
    const { error } = await supabase
      .from("exercises")
      .delete()
      .eq("id", selected.id);
    if (error) {
      setActionError(getExerciseDeleteErrorMessage(error));
      setActionStatus("idle");
      return;
    }

    setActionStatus("idle");
    setDeleteOpen(false);
    setSelected(null);
    await queryClient.invalidateQueries({
      queryKey: exerciseQueryKeys.library.owner(libraryOwnerUserId),
    });
    setToastMessage("Exercise deleted");
  };

  const handleImportExercise = async (exercise: ExerciseDatasetExercise) => {
    if (!libraryOwnerUserId) return;
    setImportingId(exercise.id);
    try {
      const importExercise = exercise.videoUrl
        ? exercise
        : await queryClient.fetchQuery({
            queryKey: ["exercise-provider-detail", exercise.id] as const,
            queryFn: ({ signal }) =>
              getExerciseDatasetExercise(exercise.id, signal),
            staleTime: 5 * 60 * 1000,
          });
      const { error } = await supabase
        .from("exercises")
        .insert(
          buildCurrentProviderExerciseInsertPayload(
            libraryOwnerUserId,
            importExercise,
          ),
        );
      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: exerciseQueryKeys.library.owner(libraryOwnerUserId),
      });
      setToastMessage("Exercise saved to your library");
    } catch (error) {
      const details = getErrorDetails(error);
      setToastMessage(
        details.code === "23505"
          ? "That exercise name already exists in your library."
          : "The exercise could not be saved to your library.",
      );
    } finally {
      setImportingId(null);
    }
  };

  const handleMuscleChange = (muscleKey: MuscleKey | null) => {
    updateSearchState((current) =>
      applyExerciseBrowserProviderAnatomyState(
        current,
        selectCanonicalMuscle(
          getExerciseBrowserProviderAnatomyState(current),
          muscleKey,
        ),
      ),
    );
  };

  const clearFilters = () =>
    updateSearchState((current) => ({
      ...current,
      filters: DEFAULT_EXERCISE_BROWSER_FILTERS,
      providerFilters: DEFAULT_EXERCISE_PROVIDER_FACET_FILTERS,
    }));

  const hasActiveFilters =
    Boolean(filters.query.trim()) ||
    Boolean(filters.equipment) ||
    Boolean(filters.muscleKey) ||
    Boolean(providerFilters.bodyPart) ||
    Boolean(providerFilters.target) ||
    Boolean(providerFilters.exerciseType);
  const libraryLoading =
    workspaceLoading || ownerScopeQuery.isLoading || libraryQuery.isLoading;
  const libraryError =
    workspaceError ?? ownerScopeQuery.error ?? libraryQuery.error;
  const safeLibraryPage = Math.min(libraryPage, libraryPageCount - 1);

  const libraryActions = (item: FilteredExerciseBrowserItem) => {
    const exercise = exercises.find(
      (candidate) => candidate.id === item.exerciseId,
    );
    if (!exercise) return null;
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => openEdit(exercise)}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected(exercise);
            setActionError(null);
            setDeleteOpen(true);
          }}
        >
          Delete
        </Button>
      </>
    );
  };

  const providerActions = (item: FilteredExerciseBrowserItem) => {
    const providerExercise = item.providerExerciseId
      ? providerById.get(item.providerExerciseId)
      : null;
    const libraryAction = libraryLoading ? (
      <Button type="button" size="sm" variant="secondary" disabled>
        Checking library…
      </Button>
    ) : item.savedMatch.status === "exact" ? (
      <Button type="button" size="sm" variant="secondary" disabled>
        In library
      </Button>
    ) : item.savedMatch.status === "name_conflict" ? (
      <Button type="button" size="sm" variant="secondary" disabled>
        Name already exists
      </Button>
    ) : (
      <Button
        type="button"
        size="sm"
        disabled={!providerExercise || importingId === item.providerExerciseId}
        onClick={() => {
          if (providerExercise) void handleImportExercise(providerExercise);
        }}
      >
        {importingId === item.providerExerciseId
          ? "Saving…"
          : "Save to library"}
      </Button>
    );
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!providerExercise}
          onClick={() => {
            if (!providerExercise) return;
            setPreviewExerciseId(providerExercise.id);
            setPreviewOpen(true);
          }}
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          Preview
        </Button>
        {libraryAction}
      </>
    );
  };

  return (
    <div className="min-w-0 space-y-5">
      {toastMessage ? (
        <div
          className="fixed right-4 top-4 z-50 w-[min(22rem,calc(100vw-2rem))]"
          aria-live="polite"
        >
          <Alert tone="info">
            <AlertDescription>{toastMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <WorkspacePageHeader
        eyebrow="Coaching library"
        title="Exercise Library"
        description="Browse your shared owner library or save movements from the connected provider using one canonical muscle filter."
      />

      <ExerciseLibraryToolbar
        query={filters.query}
        equipment={filters.equipment}
        anatomyState={anatomyState}
        exerciseType={providerFilters.exerciseType}
        view={view}
        equipmentOptions={equipmentOptions}
        exerciseTypeOptions={exerciseTypeOptions}
        metadataLoading={view === "provider" && metadataQuery.isPending}
        onQueryChange={(query) => updateFilters({ query }, true)}
        onEquipmentChange={(equipment) =>
          updateFilters({ equipment: equipment.trim() || null }, true)
        }
        onBodyPartChange={handleProviderBodyPartChange}
        onTargetMuscleChange={handleProviderTargetChange}
        onProviderFilterChange={updateProviderFilter}
        onViewChange={(nextView) =>
          updateSearchState((current) => ({
            ...current,
            view: nextView,
          }))
        }
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        action={
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create exercise
          </Button>
        }
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ExerciseLibraryFilterPanel
          muscleKey={filters.muscleKey}
          onMuscleChange={handleMuscleChange}
        />

        <section
          className="min-w-0 rounded-[26px] border border-border/70 bg-card/55 p-3 shadow-card sm:p-4"
          aria-label={
            view === "library"
              ? "My Library results"
              : "Provider Catalog results"
          }
        >
          {view === "library" ? (
            <div className="space-y-4">
              {libraryError ? (
                <Alert tone="danger">
                  <AlertTitle>Couldn’t load your exercise library</AlertTitle>
                  <AlertDescription>
                    Saved exercises are temporarily unavailable.
                  </AlertDescription>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => void libraryQuery.refetch()}
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                    Try again
                  </Button>
                </Alert>
              ) : (
                <ExerciseLibraryResults
                  items={visibleLibraryItems}
                  muscleKey={filters.muscleKey}
                  loading={libraryLoading}
                  emptyTitle={
                    exercises.length === 0
                      ? "Your library is empty"
                      : "No saved exercises match"
                  }
                  emptyDescription={
                    exercises.length === 0
                      ? "Create an exercise or open Provider Catalog to save one to this owner-level library."
                      : "Adjust the search, muscle, or equipment filters."
                  }
                  actionsForItem={libraryActions}
                />
              )}

              {!libraryLoading &&
              !libraryError &&
              filteredLibraryItems.length > 0 ? (
                <div className="flex flex-col gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Showing {safeLibraryPage * libraryPageSize + 1}–
                    {Math.min(
                      (safeLibraryPage + 1) * libraryPageSize,
                      filteredLibraryItems.length,
                    )}{" "}
                    of {filteredLibraryItems.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={safeLibraryPage === 0}
                      onClick={() =>
                        setLibraryPage((page) => Math.max(0, page - 1))
                      }
                    >
                      Previous
                    </Button>
                    <span className="text-xs">
                      Page {safeLibraryPage + 1} of {libraryPageCount}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={safeLibraryPage >= libraryPageCount - 1}
                      onClick={() =>
                        setLibraryPage((page) =>
                          Math.min(libraryPageCount - 1, page + 1),
                        )
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {metadataQuery.isError ? (
                <Alert tone="warning">
                  <AlertTitle>Provider filters couldn’t load</AlertTitle>
                  <AlertDescription>
                    Exercise search remains available, but provider metadata
                    dropdowns are temporarily unavailable.
                  </AlertDescription>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => void metadataQuery.refetch()}
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                    Retry filters
                  </Button>
                </Alert>
              ) : null}
              {!exerciseDatasetConfigured ? (
                <Alert tone="warning">
                  <AlertTitle>Provider catalog unavailable</AlertTitle>
                  <AlertDescription>
                    The provider is not configured. Your saved library remains
                    available.
                  </AlertDescription>
                </Alert>
              ) : providerQuery.isError && !providerQuery.data ? (
                <Alert tone="danger">
                  <AlertTitle>Provider catalog couldn’t load</AlertTitle>
                  <AlertDescription>
                    {getProviderErrorCopy(providerQuery.error)}
                  </AlertDescription>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => void providerQuery.refetch()}
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                    Retry provider
                  </Button>
                </Alert>
              ) : (
                <>
                  <ExerciseLibraryResults
                    items={filteredProviderItems}
                    muscleKey={filters.muscleKey}
                    loading={providerQuery.isPending}
                    emptyTitle={
                      providerQuery.hasNextPage
                        ? "No matches in the loaded provider results"
                        : "No provider results"
                    }
                    emptyDescription={
                      providerQuery.hasNextPage
                        ? "More provider records are available. Load one additional page to continue searching."
                        : providerItems.length
                          ? "The loaded provider stream has ended without a match for these filters."
                          : "The provider result stream ended without returning exercises."
                    }
                    actionsForItem={providerActions}
                  />

                  {providerQuery.isFetchNextPageError &&
                  providerItems.length ? (
                    <Alert tone="warning">
                      <AlertTitle>
                        Couldn’t load the next provider page
                      </AlertTitle>
                      <AlertDescription>
                        Existing loaded results are still available. Try loading
                        one more page again.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {!providerQuery.isPending ? (
                    <div className="flex flex-col gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <p>
                        {providerItems.length} provider record
                        {providerItems.length === 1 ? "" : "s"} loaded
                        {providerQuery.hasNextPage
                          ? "; more available"
                          : "; end reached"}
                      </p>
                      {providerQuery.hasNextPage ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={providerQuery.isFetchingNextPage}
                          onClick={() => void providerQuery.fetchNextPage()}
                        >
                          {providerQuery.isFetchingNextPage
                            ? "Loading one page…"
                            : "Load more"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewExerciseId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {providerDetailQuery.data?.name ??
                previewExercise?.name ??
                "Exercise preview"}
            </DialogTitle>
            <DialogDescription>
              Provider demonstration and exercise guidance. Video playback
              starts only when you press play.
            </DialogDescription>
          </DialogHeader>

          {providerDetailQuery.isPending ? (
            <div className="space-y-3" aria-label="Loading exercise preview">
              <div className="aspect-video animate-pulse rounded-2xl bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          ) : providerDetailQuery.isError ? (
            <Alert tone="danger">
              <AlertTitle>Preview couldn’t load</AlertTitle>
              <AlertDescription>
                {getProviderErrorCopy(providerDetailQuery.error)}
              </AlertDescription>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => void providerDetailQuery.refetch()}
              >
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                Retry preview
              </Button>
            </Alert>
          ) : providerDetailQuery.data ? (
            <div className="space-y-5">
              {providerDetailQuery.data.videoUrl ? (
                <video
                  controls
                  playsInline
                  preload="none"
                  poster={
                    providerDetailQuery.data.imageUrl ??
                    previewExercise?.imageUrl ??
                    undefined
                  }
                  className="aspect-video w-full rounded-2xl border border-border bg-black object-contain"
                  aria-label={`${providerDetailQuery.data.name} demonstration video`}
                >
                  <source
                    src={providerDetailQuery.data.videoUrl}
                    type="video/mp4"
                  />
                  Your browser does not support embedded video playback.
                </video>
              ) : providerDetailQuery.data.imageUrl ? (
                <img
                  src={providerDetailQuery.data.imageUrl}
                  alt={`${providerDetailQuery.data.name} starting position`}
                  width={960}
                  height={540}
                  referrerPolicy="no-referrer"
                  className="aspect-video w-full rounded-2xl border border-border bg-muted object-contain"
                />
              ) : (
                <Alert tone="warning">
                  <AlertTitle>No demonstration media</AlertTitle>
                  <AlertDescription>
                    This provider record does not currently include a playable
                    video or image.
                  </AlertDescription>
                </Alert>
              )}

              {providerDetailQuery.data.overview ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {providerDetailQuery.data.overview}
                </p>
              ) : null}

              {providerDetailQuery.data.instructions.length ? (
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Instructions
                  </h3>
                  <ol className="mt-2 space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                    {providerDetailQuery.data.instructions.map(
                      (instruction, index) => (
                        <li
                          key={`${index}-${instruction}`}
                          className="list-decimal"
                        >
                          {instruction}
                        </li>
                      ),
                    )}
                  </ol>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

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
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {selected ? "Edit exercise" : "Create exercise"}
            </DialogTitle>
            <DialogDescription>
              Define movement defaults for the shared owner-level library.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="exercise-name"
                className="text-xs font-semibold text-muted-foreground"
              >
                Name
              </label>
              <Input
                id="exercise-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g., Bench Press"
              />
            </div>
            <ExerciseMuscleClassificationFields
              value={muscleClassification}
              onChange={(nextValue) => {
                setMuscleClassification(nextValue);
                setMuscleClassificationChanged(true);
              }}
              disabled={actionStatus !== "idle"}
              legacyLabels={
                selected
                  ? [
                      ...getLegacyExerciseMuscleLabels(selected),
                      ...adaptPersistedExerciseMuscleProfile(selected)
                        .unmappedLabels,
                    ]
                  : []
              }
            />
            <div className="space-y-2">
              <label
                htmlFor="exercise-equipment"
                className="text-xs font-semibold text-muted-foreground"
              >
                Equipment
              </label>
              <Input
                id="exercise-equipment"
                value={form.equipment}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    equipment: event.target.value,
                  }))
                }
                placeholder="e.g., Barbell"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="exercise-video"
                className="text-xs font-semibold text-muted-foreground"
              >
                Video URL
              </label>
              <Input
                id="exercise-video"
                value={form.video_url}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    video_url: event.target.value,
                  }))
                }
                placeholder="https://"
              />
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border/65 bg-muted/25 px-3 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.is_unilateral}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    is_unilateral: event.target.checked,
                  }))
                }
              />
              Unilateral movement
            </label>
            {actionError ? (
              <Alert tone="danger">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={actionStatus !== "idle"}
              onClick={() => void handleSave()}
            >
              {actionStatus === "saving" ? "Saving…" : "Save exercise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Delete exercise permanently?</DialogTitle>
            <DialogDescription>
              Unused exercises may be permanently deleted. Exercises referenced
              by templates, assignments, or workout history cannot be deleted,
              and dependent records are never cascaded.
            </DialogDescription>
          </DialogHeader>
          {actionError ? (
            <Alert tone="danger">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={actionStatus !== "idle"}
              onClick={() => void handleDelete()}
            >
              {actionStatus === "deleting"
                ? "Deleting…"
                : "Delete unused exercise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
