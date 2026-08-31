import type {
  PersistentExerciseLibraryRecord,
  ProviderNormalizedExercise,
} from "./exercise-domain";
import { mapCurrentProviderMuscleProfile } from "./exercise-muscle-mapping";
import {
  BODY_REGIONS,
  getMuscleMetadata,
  normalizeCanonicalExerciseMuscleProfile,
  parseMuscleKey,
  rankExerciseForMuscle,
  type CanonicalExerciseMuscleProfile,
  type MuscleKey,
} from "./exercise-muscle-taxonomy";

export type ExerciseBrowserOrigin = "custom" | "imported" | "provider";
export type ExerciseBrowserView = "library" | "provider";
export type ExerciseBrowserOriginFilter = "all" | "custom" | "imported";
export type ExerciseBrowserClassificationFilter =
  | "all"
  | "classified"
  | "unclassified";

export type ExerciseBrowserSavedMatch =
  | { status: "none" }
  | { status: "exact"; exerciseId: string }
  | { status: "name_conflict"; exerciseId: string };

export type ExerciseBrowserItem = {
  key: `persisted:${string}` | `provider:${string}`;
  kind: "persisted" | "provider";
  exerciseId: string | null;
  providerExerciseId: string | null;
  origin: ExerciseBrowserOrigin;
  name: string;
  muscleProfile: CanonicalExerciseMuscleProfile;
  equipment: string | null;
  tags: string[];
  instructions: string[];
  notes: string | null;
  videoUrl: string | null;
  savedMatch: ExerciseBrowserSavedMatch;
};

export type ExerciseBrowserFilters = {
  query: string;
  muscleKey: MuscleKey | null;
  tag: string | null;
  origin: ExerciseBrowserOriginFilter;
  classification: ExerciseBrowserClassificationFilter;
};

export type ExerciseBrowserSearchState = {
  view: ExerciseBrowserView;
  filters: ExerciseBrowserFilters;
};

export type ExerciseBrowserMatchReason =
  | "primary"
  | "secondary"
  | "region"
  | null;

export type FilteredExerciseBrowserItem = ExerciseBrowserItem & {
  matchRank: 0 | 1 | 2 | 3;
  matchReason: ExerciseBrowserMatchReason;
};

export const DEFAULT_EXERCISE_BROWSER_FILTERS: ExerciseBrowserFilters = {
  query: "",
  muscleKey: null,
  tag: null,
  origin: "all",
  classification: "all",
};

export const DEFAULT_EXERCISE_BROWSER_SEARCH_STATE: ExerciseBrowserSearchState =
  {
    view: "library",
    filters: DEFAULT_EXERCISE_BROWSER_FILTERS,
  };

const normalizeText = (value: string | null | undefined) =>
  (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");

export const normalizeExerciseBrowserName = (value: string) =>
  normalizeText(value);

const compactTextList = (values: unknown): string[] =>
  (Array.isArray(values) ? values : [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

const splitPersistedInstructions = (value: string | null) =>
  value
    ? value
        .split(/\r?\n+/)
        .map((instruction) => instruction.trim())
        .filter(Boolean)
    : [];

export function classifyPersistedExerciseOrigin(
  exercise: Pick<
    PersistentExerciseLibraryRecord,
    "source" | "source_exercise_id"
  >,
): Extract<ExerciseBrowserOrigin, "custom" | "imported"> {
  if (exercise.source === "manual") return "custom";
  return exercise.source_exercise_id ? "imported" : "custom";
}

export function adaptPersistedExerciseBrowserItem(
  exercise: PersistentExerciseLibraryRecord,
): ExerciseBrowserItem {
  return {
    key: `persisted:${exercise.id}`,
    kind: "persisted",
    exerciseId: exercise.id,
    providerExerciseId: exercise.source_exercise_id,
    origin: classifyPersistedExerciseOrigin(exercise),
    name: exercise.name?.trim() || "Untitled exercise",
    muscleProfile: normalizeCanonicalExerciseMuscleProfile({
      bodyRegionKeys: exercise.body_region_keys,
      primaryMuscleKeys: exercise.primary_muscle_keys,
      secondaryMuscleKeys: exercise.secondary_muscle_keys,
    }),
    equipment: exercise.equipment?.trim() || null,
    tags: compactTextList(exercise.tags),
    instructions: splitPersistedInstructions(exercise.instructions),
    notes: exercise.notes?.trim() || null,
    videoUrl: exercise.video_url?.trim() || null,
    savedMatch: { status: "exact", exerciseId: exercise.id },
  };
}

export function classifyProviderSavedMatch(
  exercise: ProviderNormalizedExercise,
  libraryExercises: readonly PersistentExerciseLibraryRecord[],
): ExerciseBrowserSavedMatch {
  const exact = libraryExercises.find(
    (saved) =>
      saved.source === "exercise_dataset" &&
      saved.source_exercise_id === exercise.id,
  );
  if (exact) return { status: "exact", exerciseId: exact.id };

  const normalizedName = normalizeExerciseBrowserName(exercise.name);
  const conflict = libraryExercises.find(
    (saved) => normalizeExerciseBrowserName(saved.name) === normalizedName,
  );
  return conflict
    ? { status: "name_conflict", exerciseId: conflict.id }
    : { status: "none" };
}

export function adaptProviderExerciseBrowserItem(
  exercise: ProviderNormalizedExercise,
  libraryExercises: readonly PersistentExerciseLibraryRecord[],
): ExerciseBrowserItem {
  return {
    key: `provider:${exercise.id}`,
    kind: "provider",
    exerciseId: null,
    providerExerciseId: exercise.id,
    origin: "provider",
    name: exercise.name?.trim() || "Untitled exercise",
    muscleProfile: mapCurrentProviderMuscleProfile(exercise),
    equipment: exercise.equipment?.trim() || null,
    tags: compactTextList(exercise.keywords),
    instructions: compactTextList(exercise.instructions),
    notes: exercise.overview?.trim() || null,
    videoUrl: exercise.videoUrl?.trim() || null,
    savedMatch: classifyProviderSavedMatch(exercise, libraryExercises),
  };
}

export const isExerciseBrowserItemUnclassified = (
  item: Pick<ExerciseBrowserItem, "muscleProfile">,
) =>
  item.muscleProfile.bodyRegionKeys.length === 0 &&
  item.muscleProfile.primaryMuscleKeys.length === 0 &&
  item.muscleProfile.secondaryMuscleKeys.length === 0;

const getCanonicalSearchLabels = (item: ExerciseBrowserItem) => [
  ...item.muscleProfile.primaryMuscleKeys.map(
    (key) => getMuscleMetadata(key).label,
  ),
  ...item.muscleProfile.secondaryMuscleKeys.map(
    (key) => getMuscleMetadata(key).label,
  ),
  ...item.muscleProfile.bodyRegionKeys.map(
    (key) => BODY_REGIONS.find((region) => region.key === key)?.label ?? key,
  ),
];

export function exerciseBrowserItemMatchesQuery(
  item: ExerciseBrowserItem,
  query: string,
) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  return [
    item.name,
    item.equipment,
    item.notes,
    ...item.tags,
    ...item.instructions,
    ...getCanonicalSearchLabels(item),
  ].some((value) => normalizeText(value).includes(normalizedQuery));
}

const matchReasonForRank = (
  rank: 0 | 1 | 2 | 3,
): ExerciseBrowserMatchReason => {
  if (rank === 3) return "primary";
  if (rank === 2) return "secondary";
  if (rank === 1) return "region";
  return null;
};

export function filterExerciseBrowserItems(
  items: readonly ExerciseBrowserItem[],
  filters: ExerciseBrowserFilters,
): FilteredExerciseBrowserItem[] {
  const normalizedTag = normalizeText(filters.tag);
  const filtered = items.flatMap((item) => {
    if (filters.origin !== "all" && item.origin !== filters.origin) {
      return [];
    }
    const unclassified = isExerciseBrowserItemUnclassified(item);
    if (filters.classification === "classified" && unclassified) return [];
    if (filters.classification === "unclassified" && !unclassified) return [];
    if (!exerciseBrowserItemMatchesQuery(item, filters.query)) return [];
    if (
      normalizedTag &&
      ![item.equipment, ...item.tags].some((value) =>
        normalizeText(value).includes(normalizedTag),
      )
    ) {
      return [];
    }

    const matchRank = filters.muscleKey
      ? rankExerciseForMuscle(item.muscleProfile, filters.muscleKey)
      : 0;
    if (filters.muscleKey && matchRank === 0) return [];
    return [{ ...item, matchRank, matchReason: matchReasonForRank(matchRank) }];
  });

  return filtered.sort((left, right) => {
    if (right.matchRank !== left.matchRank) {
      return right.matchRank - left.matchRank;
    }
    const leftName = normalizeExerciseBrowserName(left.name);
    const rightName = normalizeExerciseBrowserName(right.name);
    if (leftName < rightName) return -1;
    if (leftName > rightName) return 1;
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  });
}

const isOriginFilter = (
  value: string | null,
): value is ExerciseBrowserOriginFilter =>
  value === "all" || value === "custom" || value === "imported";

const isClassificationFilter = (
  value: string | null,
): value is ExerciseBrowserClassificationFilter =>
  value === "all" || value === "classified" || value === "unclassified";

export function parseExerciseBrowserSearchParams(
  params: URLSearchParams,
): ExerciseBrowserSearchState {
  const muscleKey = parseMuscleKey(params.get("muscle"));
  const requestedClassification = params.get("classification");
  const classification = isClassificationFilter(requestedClassification)
    ? requestedClassification
    : "all";
  const originParam = params.get("origin");

  return {
    view: params.get("view") === "provider" ? "provider" : "library",
    filters: {
      query: params.get("q")?.trim() ?? "",
      muscleKey,
      tag: params.get("tag")?.trim() || null,
      origin: isOriginFilter(originParam) ? originParam : "all",
      classification:
        muscleKey && classification === "unclassified" ? "all" : classification,
    },
  };
}

export function serializeExerciseBrowserSearchState(
  state: ExerciseBrowserSearchState,
) {
  const params = new URLSearchParams();
  if (state.view === "provider") params.set("view", "provider");
  if (state.filters.query.trim()) params.set("q", state.filters.query.trim());
  if (state.filters.muscleKey) {
    params.set("muscle", state.filters.muscleKey);
  }
  if (state.filters.tag?.trim()) params.set("tag", state.filters.tag.trim());
  if (state.filters.origin !== "all") {
    params.set("origin", state.filters.origin);
  }
  if (state.filters.classification !== "all") {
    params.set("classification", state.filters.classification);
  }
  return params;
}

export function getExerciseDeleteErrorMessage(error: unknown) {
  const details =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : null;
  const code = typeof details?.code === "string" ? details.code : "";
  const message =
    typeof details?.message === "string" ? details.message.toLowerCase() : "";
  if (
    code === "23503" ||
    message.includes("foreign key") ||
    message.includes("still referenced")
  ) {
    return "This exercise is in use by a template, assignment, or workout history and cannot be deleted.";
  }
  return "The exercise could not be deleted. Try again.";
}
