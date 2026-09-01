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
  mergeExerciseDatasetPages,
  searchExerciseDataset,
  type ExerciseDatasetExercise,
} from "../../lib/exercise-dataset";
import type { PersistentExerciseLibraryRecord } from "../../lib/exercise-domain";
import {
  DEFAULT_EXERCISE_BROWSER_FILTERS,
  adaptPersistedExerciseBrowserItem,
  adaptProviderExerciseBrowserItem,
  filterExerciseBrowserItems,
  getExerciseDeleteErrorMessage,
  parseExerciseBrowserSearchParams,
  serializeExerciseBrowserSearchState,
  type ExerciseBrowserClassificationFilter,
  type ExerciseBrowserOriginFilter,
  type ExerciseBrowserSearchState,
  type FilteredExerciseBrowserItem,
} from "../../lib/exercise-browser";
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
import { Plus, RefreshCcw } from "lucide-react";

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
  const { view, filters } = searchState;
  const [debouncedProviderQuery, setDebouncedProviderQuery] = useState(
    filters.query,
  );
  const [libraryPage, setLibraryPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
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
    filters.classification,
    filters.muscleKey,
    filters.origin,
    filters.query,
    filters.tag,
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
  const libraryItems = useMemo(
    () => exercises.map(adaptPersistedExerciseBrowserItem),
    [exercises],
  );
  const filteredLibraryItems = useMemo(
    () => filterExerciseBrowserItems(libraryItems, filters),
    [filters, libraryItems],
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
    queryKey: ["exercise-provider-browser", debouncedProviderQuery] as const,
    enabled: view === "provider" && exerciseDatasetConfigured,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      searchExerciseDataset({
        name: debouncedProviderQuery,
        bodyPart: "",
        equipment: "",
        target: "",
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

    const { error } = await supabase
      .from("exercises")
      .insert(
        buildCurrentProviderExerciseInsertPayload(libraryOwnerUserId, exercise),
      );

    setImportingId(null);
    if (error) {
      const details = getErrorDetails(error);
      setToastMessage(
        details.code === "23505"
          ? "That exercise name already exists in your library."
          : "The exercise could not be saved to your library.",
      );
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: exerciseQueryKeys.library.owner(libraryOwnerUserId),
    });
    setToastMessage("Exercise saved to your library");
  };

  const handleMuscleChange = (muscleKey: MuscleKey | null) => {
    updateFilters({
      muscleKey,
      classification:
        muscleKey && filters.classification === "unclassified"
          ? "all"
          : filters.classification,
    });
  };

  const handleLibraryScopeChange = (
    origin: ExerciseBrowserOriginFilter,
    classification: ExerciseBrowserClassificationFilter,
  ) => {
    updateFilters({
      origin,
      classification,
      muscleKey: classification === "unclassified" ? null : filters.muscleKey,
    });
  };

  const clearFilters = () =>
    updateSearchState((current) => ({
      ...current,
      filters: DEFAULT_EXERCISE_BROWSER_FILTERS,
    }));

  const hasActiveFilters =
    Boolean(filters.query.trim()) ||
    Boolean(filters.tag) ||
    Boolean(filters.muscleKey) ||
    filters.origin !== "all" ||
    filters.classification !== "all";
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
    if (libraryLoading) {
      return (
        <Button type="button" size="sm" variant="secondary" disabled>
          Checking library…
        </Button>
      );
    }
    if (item.savedMatch.status === "exact") {
      return (
        <Button type="button" size="sm" variant="secondary" disabled>
          In library
        </Button>
      );
    }
    if (item.savedMatch.status === "name_conflict") {
      return (
        <Button type="button" size="sm" variant="secondary" disabled>
          Name already exists
        </Button>
      );
    }
    const providerExercise = item.providerExerciseId
      ? providerById.get(item.providerExerciseId)
      : null;
    return (
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
        tag={filters.tag}
        view={view}
        onQueryChange={(query) => updateFilters({ query }, true)}
        onTagChange={(tag) => updateFilters({ tag: tag.trim() || null }, true)}
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
          origin={filters.origin}
          classification={filters.classification}
          libraryFiltersVisible={view === "library"}
          onMuscleChange={handleMuscleChange}
          onLibraryScopeChange={handleLibraryScopeChange}
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
                      : filters.classification === "unclassified"
                        ? "No unclassified exercises"
                        : "No saved exercises match"
                  }
                  emptyDescription={
                    exercises.length === 0
                      ? "Create an exercise or open Provider Catalog to save one to this owner-level library."
                      : filters.classification === "unclassified"
                        ? "Every saved exercise currently has canonical anatomy metadata."
                        : "Adjust the search, muscle, tag, or library-scope filters."
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
