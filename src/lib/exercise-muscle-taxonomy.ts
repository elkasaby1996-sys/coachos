export const EXERCISE_MUSCLE_TAXONOMY_VERSION = 1 as const;

export const BODY_REGION_KEYS = [
  "chest",
  "shoulders",
  "arms",
  "forearms",
  "core",
  "back",
  "hips_glutes",
  "upper_legs",
  "lower_legs",
  "full_body",
] as const;

export type BodyRegionKey = (typeof BODY_REGION_KEYS)[number];

export const MUSCLE_KEYS = [
  "pectorals",
  "anterior_deltoids",
  "lateral_deltoids",
  "posterior_deltoids",
  "biceps",
  "triceps",
  "forearms",
  "rectus_abdominis",
  "obliques",
  "hip_flexors",
  "trapezius",
  "latissimus_dorsi",
  "rhomboids",
  "spinal_erectors",
  "gluteals",
  "hip_abductors",
  "quadriceps",
  "hamstrings",
  "adductors",
  "calves",
  "tibialis_anterior",
] as const;

export type MuscleKey = (typeof MUSCLE_KEYS)[number];
export type AnatomicalSurface = "front" | "back";

export type BodyRegionMetadata = {
  key: BodyRegionKey;
  label: string;
  sortOrder: number;
};

export type MuscleMetadata = {
  key: MuscleKey;
  label: string;
  regionKey: BodyRegionKey;
  surfaces: readonly AnatomicalSurface[];
  sortOrder: number;
};

export const BODY_REGIONS: readonly BodyRegionMetadata[] = [
  { key: "chest", label: "Chest", sortOrder: 10 },
  { key: "shoulders", label: "Shoulders", sortOrder: 20 },
  { key: "arms", label: "Arms", sortOrder: 30 },
  { key: "forearms", label: "Forearms", sortOrder: 40 },
  { key: "core", label: "Core", sortOrder: 50 },
  { key: "back", label: "Back", sortOrder: 60 },
  { key: "hips_glutes", label: "Hips & glutes", sortOrder: 70 },
  { key: "upper_legs", label: "Upper legs", sortOrder: 80 },
  { key: "lower_legs", label: "Lower legs", sortOrder: 90 },
  { key: "full_body", label: "Full body", sortOrder: 100 },
];

export const MUSCLES: readonly MuscleMetadata[] = [
  {
    key: "pectorals",
    label: "Pectorals",
    regionKey: "chest",
    surfaces: ["front"],
    sortOrder: 10,
  },
  {
    key: "anterior_deltoids",
    label: "Anterior deltoids",
    regionKey: "shoulders",
    surfaces: ["front"],
    sortOrder: 20,
  },
  {
    key: "lateral_deltoids",
    label: "Lateral deltoids",
    regionKey: "shoulders",
    surfaces: ["front", "back"],
    sortOrder: 30,
  },
  {
    key: "posterior_deltoids",
    label: "Posterior deltoids",
    regionKey: "shoulders",
    surfaces: ["back"],
    sortOrder: 40,
  },
  {
    key: "biceps",
    label: "Biceps",
    regionKey: "arms",
    surfaces: ["front"],
    sortOrder: 50,
  },
  {
    key: "triceps",
    label: "Triceps",
    regionKey: "arms",
    surfaces: ["back"],
    sortOrder: 60,
  },
  {
    key: "forearms",
    label: "Forearms",
    regionKey: "forearms",
    surfaces: ["front", "back"],
    sortOrder: 70,
  },
  {
    key: "rectus_abdominis",
    label: "Rectus abdominis",
    regionKey: "core",
    surfaces: ["front"],
    sortOrder: 80,
  },
  {
    key: "obliques",
    label: "Obliques",
    regionKey: "core",
    surfaces: ["front", "back"],
    sortOrder: 90,
  },
  {
    key: "hip_flexors",
    label: "Hip flexors",
    regionKey: "hips_glutes",
    surfaces: ["front"],
    sortOrder: 100,
  },
  {
    key: "trapezius",
    label: "Trapezius",
    regionKey: "back",
    surfaces: ["back"],
    sortOrder: 110,
  },
  {
    key: "latissimus_dorsi",
    label: "Latissimus dorsi",
    regionKey: "back",
    surfaces: ["back"],
    sortOrder: 120,
  },
  {
    key: "rhomboids",
    label: "Rhomboids",
    regionKey: "back",
    surfaces: ["back"],
    sortOrder: 130,
  },
  {
    key: "spinal_erectors",
    label: "Spinal erectors",
    regionKey: "back",
    surfaces: ["back"],
    sortOrder: 140,
  },
  {
    key: "gluteals",
    label: "Gluteals",
    regionKey: "hips_glutes",
    surfaces: ["back"],
    sortOrder: 150,
  },
  {
    key: "hip_abductors",
    label: "Hip abductors",
    regionKey: "hips_glutes",
    surfaces: ["front", "back"],
    sortOrder: 160,
  },
  {
    key: "quadriceps",
    label: "Quadriceps",
    regionKey: "upper_legs",
    surfaces: ["front"],
    sortOrder: 170,
  },
  {
    key: "hamstrings",
    label: "Hamstrings",
    regionKey: "upper_legs",
    surfaces: ["back"],
    sortOrder: 180,
  },
  {
    key: "adductors",
    label: "Adductors",
    regionKey: "upper_legs",
    surfaces: ["front"],
    sortOrder: 190,
  },
  {
    key: "calves",
    label: "Calves",
    regionKey: "lower_legs",
    surfaces: ["back"],
    sortOrder: 200,
  },
  {
    key: "tibialis_anterior",
    label: "Tibialis anterior",
    regionKey: "lower_legs",
    surfaces: ["front"],
    sortOrder: 210,
  },
];

const bodyRegionKeySet = new Set<string>(BODY_REGION_KEYS);
const muscleKeySet = new Set<string>(MUSCLE_KEYS);

export const isBodyRegionKey = (value: unknown): value is BodyRegionKey =>
  typeof value === "string" && bodyRegionKeySet.has(value);

export const isMuscleKey = (value: unknown): value is MuscleKey =>
  typeof value === "string" && muscleKeySet.has(value);

export const parseBodyRegionKey = (value: unknown): BodyRegionKey | null => {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return isBodyRegionKey(candidate) ? candidate : null;
};

export const parseMuscleKey = (value: unknown): MuscleKey | null => {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return isMuscleKey(candidate) ? candidate : null;
};

const muscleByKey = new Map(MUSCLES.map((muscle) => [muscle.key, muscle]));

export const getMuscleMetadata = (key: MuscleKey) =>
  muscleByKey.get(key) as MuscleMetadata;

export type CanonicalExerciseMuscleProfile = {
  bodyRegionKeys: BodyRegionKey[];
  primaryMuscleKeys: MuscleKey[];
  secondaryMuscleKeys: MuscleKey[];
  unmappedLabels: string[];
};

export type ExerciseMuscleSelection = {
  bodyRegionKeys: BodyRegionKey[];
  primaryMuscleKeys: MuscleKey[];
  secondaryMuscleKeys: MuscleKey[];
};

const asValues = (value: unknown) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const normalizeUnknownLabels = (values: unknown) =>
  Array.from(
    new Set(
      asValues(values)
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );

function normalizeCanonicalKeys<Key extends string>(
  values: unknown,
  parser: (value: unknown) => Key | null,
  rejectedLabels: string[],
) {
  const keys: Key[] = [];
  asValues(values).forEach((value) => {
    const key = parser(value);
    if (key) {
      if (!keys.includes(key)) keys.push(key);
      return;
    }
    if (typeof value === "string" && value.trim()) {
      rejectedLabels.push(value.trim());
    }
  });
  return keys;
}

export function normalizeCanonicalExerciseMuscleProfile(input: {
  bodyRegionKeys?: unknown;
  primaryMuscleKeys?: unknown;
  secondaryMuscleKeys?: unknown;
  unmappedLabels?: unknown;
}): CanonicalExerciseMuscleProfile {
  const rejectedLabels: string[] = [];
  const primaryMuscleKeys = normalizeCanonicalKeys(
    input.primaryMuscleKeys,
    parseMuscleKey,
    rejectedLabels,
  );
  const primarySet = new Set(primaryMuscleKeys);
  const secondaryMuscleKeys = normalizeCanonicalKeys(
    input.secondaryMuscleKeys,
    parseMuscleKey,
    rejectedLabels,
  ).filter((key) => !primarySet.has(key));
  const bodyRegionKeys = normalizeCanonicalKeys(
    input.bodyRegionKeys,
    parseBodyRegionKey,
    rejectedLabels,
  );
  [...primaryMuscleKeys, ...secondaryMuscleKeys].forEach((key) => {
    const regionKey = getMuscleMetadata(key).regionKey;
    if (!bodyRegionKeys.includes(regionKey)) bodyRegionKeys.push(regionKey);
  });

  return {
    bodyRegionKeys,
    primaryMuscleKeys,
    secondaryMuscleKeys,
    unmappedLabels: Array.from(
      new Set([
        ...normalizeUnknownLabels(input.unmappedLabels),
        ...rejectedLabels,
      ]),
    ),
  };
}

export function normalizeExerciseMuscleSelection(input: {
  bodyRegionKeys?: unknown;
  primaryMuscleKeys?: unknown;
  secondaryMuscleKeys?: unknown;
}): ExerciseMuscleSelection {
  const profile = normalizeCanonicalExerciseMuscleProfile(input);
  return {
    bodyRegionKeys: profile.bodyRegionKeys,
    primaryMuscleKeys: profile.primaryMuscleKeys,
    secondaryMuscleKeys: profile.secondaryMuscleKeys,
  };
}

export type ExerciseMuscleMatchRank = 0 | 1 | 2 | 3;

export type ExerciseMuscleMatchInput =
  | {
      bodyRegionKeys?: unknown;
      primaryMuscleKeys?: unknown;
      secondaryMuscleKeys?: unknown;
      unmappedLabels?: unknown;
    }
  | {
      body_region_keys?: unknown;
      primary_muscle_keys?: unknown;
      secondary_muscle_keys?: unknown;
    };

function normalizeExerciseMuscleMatchInput(exercise: ExerciseMuscleMatchInput) {
  if (
    "body_region_keys" in exercise ||
    "primary_muscle_keys" in exercise ||
    "secondary_muscle_keys" in exercise
  ) {
    return normalizeExerciseMuscleSelection({
      bodyRegionKeys: exercise.body_region_keys,
      primaryMuscleKeys: exercise.primary_muscle_keys,
      secondaryMuscleKeys: exercise.secondary_muscle_keys,
    });
  }
  const camelCaseExercise = exercise as {
    bodyRegionKeys?: unknown;
    primaryMuscleKeys?: unknown;
    secondaryMuscleKeys?: unknown;
  };
  return normalizeExerciseMuscleSelection(camelCaseExercise);
}

export function isPrimaryMuscleMatch(
  exercise: ExerciseMuscleMatchInput,
  selectedMuscleKey: MuscleKey,
) {
  return normalizeExerciseMuscleMatchInput(exercise).primaryMuscleKeys.includes(
    selectedMuscleKey,
  );
}

export function isSecondaryMuscleMatch(
  exercise: ExerciseMuscleMatchInput,
  selectedMuscleKey: MuscleKey,
) {
  return normalizeExerciseMuscleMatchInput(
    exercise,
  ).secondaryMuscleKeys.includes(selectedMuscleKey);
}

export function hasBroadRegionFallback(
  exercise: ExerciseMuscleMatchInput,
  selectedMuscleKey: MuscleKey,
) {
  const regions = normalizeExerciseMuscleMatchInput(exercise).bodyRegionKeys;
  return (
    regions.includes("full_body") ||
    regions.includes(getMuscleMetadata(selectedMuscleKey).regionKey)
  );
}

export function rankExerciseForMuscle(
  exercise: ExerciseMuscleMatchInput,
  selectedMuscleKey: MuscleKey,
): ExerciseMuscleMatchRank {
  const normalized = normalizeExerciseMuscleMatchInput(exercise);
  if (normalized.primaryMuscleKeys.includes(selectedMuscleKey)) return 3;
  if (normalized.secondaryMuscleKeys.includes(selectedMuscleKey)) return 2;
  if (
    normalized.bodyRegionKeys.includes("full_body") ||
    normalized.bodyRegionKeys.includes(
      getMuscleMetadata(selectedMuscleKey).regionKey,
    )
  ) {
    return 1;
  }
  return 0;
}
