import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Database, Library, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  DEFAULT_EXERCISE_BROWSER_FILTERS,
  adaptPersistedExerciseBrowserItem,
  adaptProviderExerciseBrowserItem,
  filterExerciseBrowserItems,
  type ExerciseBrowserView,
  type FilteredExerciseBrowserItem,
} from "../../../lib/exercise-browser";
import {
  ExerciseDatasetError,
  exerciseDatasetConfigured,
  mergeExerciseDatasetPages,
  searchExerciseDataset,
} from "../../../lib/exercise-dataset";
import type { PersistentExerciseLibraryRecord } from "../../../lib/exercise-domain";
import {
  clearProviderAnatomyFilters,
  selectCanonicalMuscle,
  selectProviderBodyPart,
  selectProviderTargetMuscle,
} from "../../../lib/exercise-provider-anatomy";
import {
  createExercisePickerSelectionEntry,
  emptyExercisePickerSelection,
  getExercisePickerSelectionKey,
  removeExercisePickerSelection,
  toggleExercisePickerSelection,
  type ExercisePickerSelectionEntry,
  type ExercisePickerSelectionState,
} from "../../../lib/exercise-picker";
import { ExercisePickerFilterPanel } from "./exercise-picker-filter-panel";
import { ExercisePickerResults } from "./exercise-picker-results";
import { ExercisePickerSelectionTray } from "./exercise-picker-selection-tray";
import { ExercisePickerToolbar } from "./exercise-picker-toolbar";

const libraryPageSize = 20;
const providerPageSize = 24;

const providerErrorCopy = (error: unknown) =>
  error instanceof ExerciseDatasetError
    ? error.message
    : "The provider is temporarily unavailable. Your saved library remains usable.";

export type ExercisePickerProps = {
  open: boolean;
  libraryExercises: readonly PersistentExerciseLibraryRecord[];
  libraryLoading: boolean;
  libraryError: unknown;
  existingExerciseIds: ReadonlySet<string>;
  selection: ExercisePickerSelectionState;
  onSelectionChange: Dispatch<SetStateAction<ExercisePickerSelectionState>>;
  onRetryLibrary: () => void;
  onCreateExercise: () => void;
  onCancel: () => void;
  onAddSelected: () => void;
  submitting: boolean;
  submissionError: string | null;
};

export function ExercisePicker({
  open,
  libraryExercises,
  libraryLoading,
  libraryError,
  existingExerciseIds,
  selection,
  onSelectionChange,
  onRetryLibrary,
  onCreateExercise,
  onCancel,
  onAddSelected,
  submitting,
  submissionError,
}: ExercisePickerProps) {
  const [view, setView] = useState<ExerciseBrowserView>("library");
  const [query, setQuery] = useState("");
  const [debouncedProviderQuery, setDebouncedProviderQuery] = useState("");
  const [anatomyState, setAnatomyState] = useState(clearProviderAnatomyFilters);
  const muscleKey = anatomyState.canonicalMuscleKey;
  const [libraryPage, setLibraryPage] = useState(0);
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedProviderQuery(query.trim()),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(
    () => setLibraryPage(0),
    [
      query,
      muscleKey,
      anatomyState.providerBodyPart,
      anatomyState.providerTargetMuscle,
    ],
  );

  const libraryItems = useMemo(
    () => libraryExercises.map(adaptPersistedExerciseBrowserItem),
    [libraryExercises],
  );
  const filteredLibraryItems = useMemo(
    () =>
      filterExerciseBrowserItems(libraryItems, {
        ...DEFAULT_EXERCISE_BROWSER_FILTERS,
        query,
        muscleKey,
      }),
    [libraryItems, muscleKey, query],
  );
  const libraryPageCount = Math.max(
    1,
    Math.ceil(filteredLibraryItems.length / libraryPageSize),
  );
  const safeLibraryPage = Math.min(libraryPage, libraryPageCount - 1);
  const visibleLibraryItems = useMemo(
    () =>
      filteredLibraryItems.slice(
        safeLibraryPage * libraryPageSize,
        (safeLibraryPage + 1) * libraryPageSize,
      ),
    [filteredLibraryItems, safeLibraryPage],
  );

  const providerQuery = useInfiniteQuery({
    queryKey: [
      "exercise-provider-picker",
      debouncedProviderQuery,
      anatomyState.providerBodyPart,
      anatomyState.providerTargetMuscle,
    ] as const,
    enabled: open && view === "provider" && exerciseDatasetConfigured,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      searchExerciseDataset({
        name: debouncedProviderQuery,
        bodyPart: anatomyState.providerBodyPart ?? "",
        equipment: "",
        target: anatomyState.providerTargetMuscle ?? "",
        exerciseType: "",
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
        adaptProviderExerciseBrowserItem(exercise, libraryExercises),
      ),
    [libraryExercises, providerExercises],
  );
  const filteredProviderItems = useMemo(
    () =>
      filterExerciseBrowserItems(providerItems, {
        ...DEFAULT_EXERCISE_BROWSER_FILTERS,
        query,
        muscleKey,
      }),
    [muscleKey, providerItems, query],
  );

  const visibleItems =
    view === "library" ? visibleLibraryItems : filteredProviderItems;

  const isSelected = (item: FilteredExerciseBrowserItem) => {
    const key = getExercisePickerSelectionKey(item);
    return key ? selection.has(key) : false;
  };

  const disabledReasonForItem = (item: FilteredExerciseBrowserItem) => {
    if (item.kind === "provider" && libraryError) {
      return "Library unavailable; provider identity cannot be checked";
    }
    if (item.savedMatch.status === "name_conflict") {
      return "Name conflict — review the saved exercise in My Library";
    }
    const internalId =
      item.exerciseId ??
      (item.savedMatch.status === "exact" ? item.savedMatch.exerciseId : null);
    return internalId && existingExerciseIds.has(internalId)
      ? "Already added"
      : null;
  };

  const toggleItem = (item: FilteredExerciseBrowserItem) => {
    const providerExercise = item.providerExerciseId
      ? (providerById.get(item.providerExerciseId) ?? null)
      : null;
    const entry = createExercisePickerSelectionEntry(
      item,
      providerExercise,
      libraryExercises,
    );
    if (!entry) {
      setSelectionFeedback(
        item.savedMatch.status === "name_conflict"
          ? `${item.name} has a name conflict and cannot be selected.`
          : `${item.name} could not be resolved for selection.`,
      );
      return;
    }
    setSelectionFeedback(null);
    onSelectionChange((current) =>
      toggleExercisePickerSelection(current, entry),
    );
  };

  const removeSelection = (entry: ExercisePickerSelectionEntry) =>
    onSelectionChange((current) =>
      removeExercisePickerSelection(current, entry.key),
    );

  const clearFilters = () => {
    setQuery("");
    setAnatomyState(clearProviderAnatomyFilters());
  };

  const resultCount =
    view === "library"
      ? filteredLibraryItems.length
      : filteredProviderItems.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-border/70 px-3 pb-3 sm:px-5">
        <ExercisePickerToolbar
          query={query}
          hasActiveFilters={Boolean(
            query.trim() ||
            muscleKey ||
            anatomyState.providerBodyPart ||
            anatomyState.providerTargetMuscle,
          )}
          onQueryChange={setQuery}
          onClearFilters={clearFilters}
          onCreateExercise={onCreateExercise}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={view}
            onValueChange={(value) =>
              setView(value === "provider" ? "provider" : "library")
            }
          >
            <TabsList className="grid w-full grid-cols-2 sm:w-auto">
              <TabsTrigger value="library" className="gap-2">
                <Library className="h-4 w-4" aria-hidden="true" />
                My Library
              </TabsTrigger>
              <TabsTrigger value="provider" className="gap-2">
                <Database className="h-4 w-4" aria-hidden="true" />
                Provider Catalog
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <Badge variant="muted">
              {resultCount} result{resultCount === 1 ? "" : "s"}
            </Badge>
            {view === "provider" ? (
              <Badge variant="neutral">{providerExercises.length} loaded</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:overflow-hidden">
        <div className="grid min-w-0 gap-3 lg:h-full lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.6fr)]">
          <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <ExercisePickerFilterPanel
              anatomyState={anatomyState}
              providerFiltersVisible={view === "provider"}
              onMuscleChange={(value) =>
                setAnatomyState((current) =>
                  selectCanonicalMuscle(current, value),
                )
              }
              onBodyPartChange={(value) =>
                setAnatomyState((current) =>
                  selectProviderBodyPart(current, value),
                )
              }
              onTargetMuscleChange={(value) =>
                setAnatomyState((current) =>
                  selectProviderTargetMuscle(current, value),
                )
              }
            />
          </div>

          <section
            className="ui-panel flex min-w-0 flex-col border border-border/70 p-2.5 lg:min-h-0"
            aria-label={
              view === "library"
                ? "My Library picker results"
                : "Provider Catalog picker results"
            }
          >
            {selectionFeedback ? (
              <Alert tone="warning" className="mb-2" aria-live="assertive">
                <AlertDescription>{selectionFeedback}</AlertDescription>
              </Alert>
            ) : null}

            {view === "library" && libraryError ? (
              <Alert tone="danger">
                <AlertTitle>Couldn’t load your exercise library</AlertTitle>
                <AlertDescription>
                  Saved exercises are temporarily unavailable. Provider errors
                  do not affect this tab.
                </AlertDescription>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={onRetryLibrary}
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  Try again
                </Button>
              </Alert>
            ) : view === "provider" && !exerciseDatasetConfigured ? (
              <Alert tone="warning">
                <AlertTitle>Provider catalog unavailable</AlertTitle>
                <AlertDescription>
                  The provider is not configured. My Library remains available.
                </AlertDescription>
              </Alert>
            ) : view === "provider" &&
              providerQuery.isError &&
              !providerQuery.data ? (
              <Alert tone="danger">
                <AlertTitle>Provider catalog couldn’t load</AlertTitle>
                <AlertDescription>
                  {providerErrorCopy(providerQuery.error)}
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
                <div className="min-h-0 flex-1 lg:overflow-y-auto lg:pr-1">
                  <ExercisePickerResults
                    items={visibleItems}
                    muscleKey={muscleKey}
                    loading={
                      view === "library"
                        ? libraryLoading
                        : providerQuery.isPending
                    }
                    emptyTitle={
                      view === "library"
                        ? libraryExercises.length
                          ? "No saved exercises match"
                          : "Your library is empty"
                        : providerQuery.hasNextPage
                          ? "No matches in loaded provider results"
                          : "No provider results"
                    }
                    emptyDescription={
                      view === "library"
                        ? "Adjust the search or muscle filter, or create an exercise."
                        : providerQuery.hasNextPage
                          ? "More provider records are available. Load one additional page to continue."
                          : "The bounded provider stream ended without a matching exercise."
                    }
                    isSelected={isSelected}
                    disabledReasonForItem={disabledReasonForItem}
                    onToggle={toggleItem}
                  />
                </div>

                {view === "library" && filteredLibraryItems.length ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Showing {safeLibraryPage * libraryPageSize + 1}–
                      {Math.min(
                        (safeLibraryPage + 1) * libraryPageSize,
                        filteredLibraryItems.length,
                      )}{" "}
                      of {filteredLibraryItems.length}
                    </span>
                    <span className="flex items-center gap-2">
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
                      <span>
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
                    </span>
                  </div>
                ) : null}

                {view === "provider" &&
                providerQuery.isFetchNextPageError &&
                providerExercises.length ? (
                  <Alert tone="warning" className="mt-2">
                    <AlertTitle>
                      Couldn’t load the next provider page
                    </AlertTitle>
                    <AlertDescription>
                      Previously loaded results and selections remain available.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {view === "provider" && !providerQuery.isPending ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      {providerExercises.length} loaded
                      {providerQuery.hasNextPage
                        ? "; more available"
                        : "; end reached"}
                    </span>
                    {providerQuery.hasNextPage ? (
                      <Button
                        type="button"
                        size="sm"
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
          </section>
        </div>
      </div>

      {submissionError ? (
        <div className="px-3 pb-2 sm:px-5" role="alert" aria-live="assertive">
          <Alert tone="danger">
            <AlertDescription>{submissionError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <ExercisePickerSelectionTray
        selection={selection}
        submitting={submitting}
        onRemove={removeSelection}
        onClear={() => onSelectionChange(emptyExercisePickerSelection())}
        onCancel={onCancel}
        onAddSelected={onAddSelected}
      />
    </div>
  );
}
