import type {
  PersistentExerciseLibraryRecord,
  ProviderNormalizedExercise,
} from "./exercise-domain";
import { mapCurrentProviderMuscleProfile } from "./exercise-muscle-mapping";
import {
  parseProviderBodyPartValue,
  parseProviderTargetMuscleValue,
  resolveProviderBodyPartMapping,
  resolveProviderTargetMuscleMapping,
  type ProviderAnatomyFilterSource,
  type ProviderAnatomyFilterState,
  type ProviderAnatomyValueProvenance,
  type ProviderBodyPartValue,
  type ProviderTargetMuscleValue,
} from "./exercise-provider-anatomy";
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
  bodyPart: string | null;
  targetMuscle: string | null;
  exerciseType: string | null;
  tags: string[];
  instructions: string[];
  notes: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  savedMatch: ExerciseBrowserSavedMatch;
};

export type ExerciseBrowserFilters = {
  query: string;
  muscleKey: MuscleKey | null;
  equipment: string | null;
  origin: ExerciseBrowserOriginFilter;
  classification: ExerciseBrowserClassificationFilter;
};

export type ExerciseProviderFacetFilters = {
  bodyPart: ProviderBodyPartValue | null;
  target: ProviderTargetMuscleValue | null;
  exerciseType: string | null;
  anatomySource: ProviderAnatomyFilterSource;
  bodyPartProvenance: ProviderAnatomyValueProvenance;
  targetProvenance: ProviderAnatomyValueProvenance;
  muscleProvenance: ProviderAnatomyValueProvenance;
};

export type ExerciseBrowserSearchState = {
  view: ExerciseBrowserView;
  filters: ExerciseBrowserFilters;
  providerFilters: ExerciseProviderFacetFilters;
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

export type ExerciseBrowserMatchGroups = {
  directMatches: FilteredExerciseBrowserItem[];
  relatedExercises: FilteredExerciseBrowserItem[];
  ungrouped: FilteredExerciseBrowserItem[];
};

export const DEFAULT_EXERCISE_BROWSER_FILTERS: ExerciseBrowserFilters = {
  query: "",
  muscleKey: null,
  equipment: null,
  origin: "all",
  classification: "all",
};

export const DEFAULT_EXERCISE_PROVIDER_FACET_FILTERS: ExerciseProviderFacetFilters =
  {
    bodyPart: null,
    target: null,
    exerciseType: null,
    anatomySource: null,
    bodyPartProvenance: null,
    targetProvenance: null,
    muscleProvenance: null,
  };

export const DEFAULT_EXERCISE_BROWSER_SEARCH_STATE: ExerciseBrowserSearchState =
  {
    view: "library",
    filters: DEFAULT_EXERCISE_BROWSER_FILTERS,
    providerFilters: DEFAULT_EXERCISE_PROVIDER_FACET_FILTERS,
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

const getSourcePayloadText = (
  payload: Record<string, unknown> | null,
  keys: readonly string[],
) => {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

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
    bodyPart: getSourcePayloadText(exercise.source_payload, [
      "bodyPart",
      "body_part",
    ]),
    targetMuscle: getSourcePayloadText(exercise.source_payload, [
      "target",
      "targetMuscle",
      "target_muscle",
    ]),
    exerciseType:
      exercise.category?.trim() ||
      getSourcePayloadText(exercise.source_payload, [
        "exerciseType",
        "exercise_type",
        "type",
      ]),
    tags: compactTextList(exercise.tags),
    instructions: splitPersistedInstructions(exercise.instructions),
    notes: exercise.notes?.trim() || null,
    videoUrl: exercise.video_url?.trim() || null,
    imageUrl: null,
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
    bodyPart: exercise.bodyPart?.trim() || null,
    targetMuscle: exercise.target?.trim() || null,
    exerciseType: exercise.exerciseType?.trim() || null,
    tags: compactTextList(exercise.keywords),
    instructions: compactTextList(exercise.instructions),
    notes: exercise.overview?.trim() || null,
    videoUrl: exercise.videoUrl?.trim() || null,
    imageUrl: exercise.imageUrl?.trim() || null,
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
  const normalizedEquipment = normalizeText(filters.equipment).replace(
    /[^a-z0-9]/g,
    "",
  );
  const filtered = items.flatMap((item) => {
    if (filters.origin !== "all" && item.origin !== filters.origin) {
      return [];
    }
    const unclassified = isExerciseBrowserItemUnclassified(item);
    if (filters.classification === "classified" && unclassified) return [];
    if (filters.classification === "unclassified" && !unclassified) return [];
    if (!exerciseBrowserItemMatchesQuery(item, filters.query)) return [];
    if (
      normalizedEquipment &&
      normalizeText(item.equipment).replace(/[^a-z0-9]/g, "") !==
        normalizedEquipment
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

const normalizeFacetValue = (value: string | null | undefined) =>
  normalizeText(value).replace(/[^a-z0-9]/g, "");

export function filterExerciseBrowserItemsByProviderFacets(
  items: readonly ExerciseBrowserItem[],
  filters: Pick<
    ExerciseProviderFacetFilters,
    "bodyPart" | "target" | "exerciseType"
  >,
): ExerciseBrowserItem[] {
  const bodyPart = normalizeFacetValue(filters.bodyPart);
  const target = normalizeFacetValue(filters.target);
  const exerciseType = normalizeFacetValue(filters.exerciseType);

  return items.filter((item) => {
    if (bodyPart) {
      const rawMatch = normalizeFacetValue(item.bodyPart) === bodyPart;
      const resolution = resolveProviderBodyPartMapping(filters.bodyPart);
      const canonicalBodyRegionKey =
        resolution.status === "mapped"
          ? resolution.mapping.canonicalBodyRegionKey
          : null;
      const canonicalMatch = Boolean(
        canonicalBodyRegionKey &&
        item.muscleProfile.bodyRegionKeys.includes(canonicalBodyRegionKey),
      );
      if (!rawMatch && !canonicalMatch) return false;
    }

    if (target) {
      const rawMatch = normalizeFacetValue(item.targetMuscle) === target;
      const resolution = resolveProviderTargetMuscleMapping(filters.target);
      const canonicalMuscleKey =
        resolution.status === "mapped"
          ? resolution.mapping.canonicalMuscleKey
          : null;
      const canonicalBodyRegionKey =
        resolution.status === "mapped"
          ? resolution.mapping.canonicalBodyRegionKey
          : null;
      const canonicalMatch = Boolean(
        (canonicalMuscleKey &&
          (item.muscleProfile.primaryMuscleKeys.includes(canonicalMuscleKey) ||
            item.muscleProfile.secondaryMuscleKeys.includes(
              canonicalMuscleKey,
            ))) ||
        (canonicalBodyRegionKey &&
          item.muscleProfile.bodyRegionKeys.includes(canonicalBodyRegionKey)),
      );
      if (!rawMatch && !canonicalMatch) return false;
    }

    return (
      !exerciseType || normalizeFacetValue(item.exerciseType) === exerciseType
    );
  });
}

export function groupExerciseBrowserMatches(
  items: readonly FilteredExerciseBrowserItem[],
  muscleKey: MuscleKey | null,
): ExerciseBrowserMatchGroups {
  if (!muscleKey) {
    return {
      directMatches: [],
      relatedExercises: [],
      ungrouped: [...items],
    };
  }

  return {
    directMatches: items.filter(({ matchRank }) => matchRank >= 2),
    relatedExercises: items.filter(({ matchRank }) => matchRank === 1),
    ungrouped: [],
  };
}

const isOriginFilter = (
  value: string | null,
): value is ExerciseBrowserOriginFilter =>
  value === "all" || value === "custom" || value === "imported";

const isClassificationFilter = (
  value: string | null,
): value is ExerciseBrowserClassificationFilter =>
  value === "all" || value === "classified" || value === "unclassified";

const parseAnatomySource = (
  value: string | null,
): ProviderAnatomyFilterSource =>
  value === "visualizer" ||
  value === "provider_target" ||
  value === "provider_body_part"
    ? value
    : null;

const parseAnatomyProvenance = (
  value: string | null,
): ProviderAnatomyValueProvenance =>
  value === "manual" || value === "derived" ? value : null;

export function parseExerciseBrowserSearchParams(
  params: URLSearchParams,
): ExerciseBrowserSearchState {
  const muscleKey = parseMuscleKey(params.get("muscle"));
  const requestedClassification = params.get("classification");
  const classification = isClassificationFilter(requestedClassification)
    ? requestedClassification
    : "all";
  const originParam = params.get("origin");

  const bodyPart = parseProviderBodyPartValue(params.get("bodyPart"));
  const target = parseProviderTargetMuscleValue(params.get("target"));
  const explicitSource = parseAnatomySource(params.get("anatomySource"));
  const explicitBodyPartProvenance = parseAnatomyProvenance(
    params.get("bodyPartMode"),
  );
  const explicitTargetProvenance = parseAnatomyProvenance(
    params.get("targetMode"),
  );
  const explicitMuscleProvenance = parseAnatomyProvenance(
    params.get("muscleMode"),
  );

  return {
    view: params.get("view") === "provider" ? "provider" : "library",
    filters: {
      query: params.get("q")?.trim() ?? "",
      muscleKey,
      equipment:
        params.get("equipment")?.trim() || params.get("tag")?.trim() || null,
      origin: isOriginFilter(originParam) ? originParam : "all",
      classification:
        muscleKey && classification === "unclassified" ? "all" : classification,
    },
    providerFilters: {
      bodyPart,
      target,
      exerciseType: params.get("exerciseType")?.trim() || null,
      anatomySource:
        explicitSource ??
        (target
          ? "provider_target"
          : bodyPart
            ? "provider_body_part"
            : muscleKey
              ? "visualizer"
              : null),
      bodyPartProvenance:
        explicitBodyPartProvenance ?? (bodyPart ? "manual" : null),
      targetProvenance: explicitTargetProvenance ?? (target ? "manual" : null),
      muscleProvenance:
        explicitMuscleProvenance ?? (muscleKey ? "manual" : null),
    },
  };
}

export function getExerciseBrowserProviderAnatomyState(
  state: ExerciseBrowserSearchState,
): ProviderAnatomyFilterState {
  return {
    providerBodyPart: state.providerFilters.bodyPart,
    providerTargetMuscle: state.providerFilters.target,
    canonicalMuscleKey: state.filters.muscleKey,
    source: state.providerFilters.anatomySource,
    provenance: {
      providerBodyPart: state.providerFilters.bodyPartProvenance,
      providerTargetMuscle: state.providerFilters.targetProvenance,
      canonicalMuscleKey: state.providerFilters.muscleProvenance,
    },
  };
}

export function applyExerciseBrowserProviderAnatomyState(
  state: ExerciseBrowserSearchState,
  anatomy: ProviderAnatomyFilterState,
): ExerciseBrowserSearchState {
  return {
    ...state,
    filters: {
      ...state.filters,
      muscleKey: anatomy.canonicalMuscleKey,
      classification:
        anatomy.canonicalMuscleKey &&
        state.filters.classification === "unclassified"
          ? "all"
          : state.filters.classification,
    },
    providerFilters: {
      ...state.providerFilters,
      bodyPart: anatomy.providerBodyPart,
      target: anatomy.providerTargetMuscle,
      anatomySource: anatomy.source,
      bodyPartProvenance: anatomy.provenance.providerBodyPart,
      targetProvenance: anatomy.provenance.providerTargetMuscle,
      muscleProvenance: anatomy.provenance.canonicalMuscleKey,
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
  if (state.filters.equipment?.trim()) {
    params.set("equipment", state.filters.equipment.trim());
  }
  if (state.filters.origin !== "all") {
    params.set("origin", state.filters.origin);
  }
  if (state.filters.classification !== "all") {
    params.set("classification", state.filters.classification);
  }
  if (state.providerFilters.bodyPart?.trim()) {
    params.set("bodyPart", state.providerFilters.bodyPart.trim());
  }
  if (state.providerFilters.target?.trim()) {
    params.set("target", state.providerFilters.target.trim());
  }
  if (state.providerFilters.exerciseType?.trim()) {
    params.set("exerciseType", state.providerFilters.exerciseType.trim());
  }
  if (state.providerFilters.anatomySource) {
    params.set("anatomySource", state.providerFilters.anatomySource);
  }
  if (state.providerFilters.bodyPartProvenance) {
    params.set("bodyPartMode", state.providerFilters.bodyPartProvenance);
  }
  if (state.providerFilters.targetProvenance) {
    params.set("targetMode", state.providerFilters.targetProvenance);
  }
  if (state.providerFilters.muscleProvenance) {
    params.set("muscleMode", state.providerFilters.muscleProvenance);
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
