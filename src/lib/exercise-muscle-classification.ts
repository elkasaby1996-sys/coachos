import {
  BODY_REGIONS,
  EXERCISE_MUSCLE_TAXONOMY_VERSION,
  MUSCLES,
  normalizeCanonicalExerciseMuscleProfile,
  type BodyRegionKey,
  type CanonicalExerciseMuscleProfile,
  type ExerciseMuscleSelection,
  type MuscleKey,
} from "./exercise-muscle-taxonomy";

export type ExerciseMuscleClassificationMode =
  | "specific"
  | "region"
  | "unclassified";

export type ExerciseMuscleFormValue = {
  mode: ExerciseMuscleClassificationMode;
  primaryMuscleKeys: MuscleKey[];
  secondaryMuscleKeys: MuscleKey[];
  bodyRegionKey: BodyRegionKey | null;
};

export type PersistedExerciseMuscleFields = {
  body_region_keys?: unknown;
  primary_muscle_keys?: unknown;
  secondary_muscle_keys?: unknown;
};

export type LegacyExerciseMuscleFields = {
  muscle_group?: string | null;
  primary_muscle?: string | null;
  secondary_muscles?: string[] | null;
};

const bodyRegionByKey = new Map(
  BODY_REGIONS.map((region) => [region.key, region]),
);
const muscleByKey = new Map(MUSCLES.map((muscle) => [muscle.key, muscle]));
const sortMuscleKeys = (keys: MuscleKey[]) =>
  [...keys].sort(
    (left, right) =>
      (muscleByKey.get(left)?.sortOrder ?? 0) -
      (muscleByKey.get(right)?.sortOrder ?? 0),
  );
const sortBodyRegionKeys = (keys: BodyRegionKey[]) =>
  [...keys].sort(
    (left, right) =>
      (bodyRegionByKey.get(left)?.sortOrder ?? 0) -
      (bodyRegionByKey.get(right)?.sortOrder ?? 0),
  );

export const createEmptyExerciseMuscleFormValue =
  (): ExerciseMuscleFormValue => ({
    mode: "unclassified",
    primaryMuscleKeys: [],
    secondaryMuscleKeys: [],
    bodyRegionKey: null,
  });

export function serializeExerciseMuscleFormValue(
  value: ExerciseMuscleFormValue,
): ExerciseMuscleSelection {
  if (value.mode === "unclassified") {
    return {
      bodyRegionKeys: [],
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
    };
  }

  if (value.mode === "region") {
    return {
      bodyRegionKeys: value.bodyRegionKey ? [value.bodyRegionKey] : [],
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
    };
  }

  const profile = normalizeCanonicalExerciseMuscleProfile({
    primaryMuscleKeys: value.primaryMuscleKeys,
    secondaryMuscleKeys: value.secondaryMuscleKeys,
  });
  return {
    bodyRegionKeys: sortBodyRegionKeys(profile.bodyRegionKeys),
    primaryMuscleKeys: sortMuscleKeys(profile.primaryMuscleKeys),
    secondaryMuscleKeys: sortMuscleKeys(profile.secondaryMuscleKeys),
  };
}

export function adaptPersistedExerciseMuscleProfile(
  exercise: PersistedExerciseMuscleFields,
): CanonicalExerciseMuscleProfile {
  return normalizeCanonicalExerciseMuscleProfile({
    bodyRegionKeys: exercise.body_region_keys,
    primaryMuscleKeys: exercise.primary_muscle_keys,
    secondaryMuscleKeys: exercise.secondary_muscle_keys,
  });
}

export function initializeExerciseMuscleFormValue(
  exercise: PersistedExerciseMuscleFields,
): ExerciseMuscleFormValue {
  const profile = adaptPersistedExerciseMuscleProfile(exercise);
  if (
    profile.primaryMuscleKeys.length > 0 ||
    profile.secondaryMuscleKeys.length > 0
  ) {
    return {
      mode: "specific",
      primaryMuscleKeys: profile.primaryMuscleKeys,
      secondaryMuscleKeys: profile.secondaryMuscleKeys,
      bodyRegionKey: null,
    };
  }

  if (profile.bodyRegionKeys.length > 0) {
    return {
      mode: "region",
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
      bodyRegionKey: profile.bodyRegionKeys[0] ?? null,
    };
  }

  return createEmptyExerciseMuscleFormValue();
}

export function getLegacyExerciseMuscleLabels(
  exercise: LegacyExerciseMuscleFields,
): string[] {
  return Array.from(
    new Set(
      [
        exercise.primary_muscle,
        exercise.muscle_group,
        ...(exercise.secondary_muscles ?? []),
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

export function buildCustomExerciseMusclePersistenceFields(
  value: ExerciseMuscleFormValue,
) {
  const selection = serializeExerciseMuscleFormValue(value);
  const firstPrimaryKey = selection.primaryMuscleKeys[0];
  const firstRegionKey = selection.bodyRegionKeys[0];
  const secondaryLabels = selection.secondaryMuscleKeys.map(
    (key) => muscleByKey.get(key)?.label ?? key,
  );

  return {
    body_region_keys: selection.bodyRegionKeys,
    primary_muscle_keys: selection.primaryMuscleKeys,
    secondary_muscle_keys: selection.secondaryMuscleKeys,
    muscle_taxonomy_version: EXERCISE_MUSCLE_TAXONOMY_VERSION,
    primary_muscle: firstPrimaryKey
      ? (muscleByKey.get(firstPrimaryKey)?.label ?? firstPrimaryKey)
      : null,
    secondary_muscles: secondaryLabels.length > 0 ? secondaryLabels : null,
    muscle_group: firstRegionKey
      ? (bodyRegionByKey.get(firstRegionKey)?.label ?? firstRegionKey)
      : null,
  };
}
