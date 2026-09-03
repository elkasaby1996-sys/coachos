import type { ProviderNormalizedExercise } from "./exercise-domain";
import {
  resolveProviderBodyPartMapping,
  resolveProviderTargetMuscleMapping,
} from "./exercise-provider-anatomy";
import {
  EXERCISE_MUSCLE_TAXONOMY_VERSION,
  normalizeCanonicalExerciseMuscleProfile,
  type BodyRegionKey,
  type CanonicalExerciseMuscleProfile,
  type MuscleKey,
} from "./exercise-muscle-taxonomy";

export type ExerciseMuscleAliasTable = {
  bodyRegions: Readonly<Record<string, BodyRegionKey>>;
  muscles: Readonly<Record<string, MuscleKey>>;
};

const normalizeAlias = (value: string) =>
  value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const bodyRegionAliases: Record<string, BodyRegionKey> = {
  chest: "chest",
  pectorals: "chest",
  "pectoralis major": "chest",
  "pectoralis minor": "chest",
  shoulders: "shoulders",
  deltoid: "shoulders",
  deltoids: "shoulders",
  "anterior deltoid": "shoulders",
  "lateral deltoid": "shoulders",
  "posterior deltoid": "shoulders",
  arms: "arms",
  "upper arms": "arms",
  biceps: "arms",
  "biceps brachii": "arms",
  brachialis: "arms",
  triceps: "arms",
  "triceps brachii": "arms",
  forearms: "forearms",
  "lower arms": "forearms",
  brachioradialis: "forearms",
  core: "core",
  abs: "core",
  abdominals: "core",
  "rectus abdominis": "core",
  obliques: "core",
  waist: "core",
  back: "back",
  "upper back": "back",
  "lower back": "back",
  lats: "back",
  "latissimus dorsi": "back",
  traps: "back",
  trapezius: "back",
  "trapezius upper fibers": "back",
  "trapezius middle fibers": "back",
  "trapezius lower fibers": "back",
  rhomboids: "back",
  "erector spinae": "back",
  "spinal erectors": "back",
  hips: "hips_glutes",
  "hip flexors": "hips_glutes",
  iliopsoas: "hips_glutes",
  glutes: "hips_glutes",
  gluteals: "hips_glutes",
  "gluteus maximus": "hips_glutes",
  "gluteus medius": "hips_glutes",
  "gluteus minimus": "hips_glutes",
  "hip abductors": "hips_glutes",
  "tensor fasciae latae": "hips_glutes",
  quadriceps: "upper_legs",
  quads: "upper_legs",
  "rectus femoris": "upper_legs",
  "vastus intermedius": "upper_legs",
  "vastus lateralis": "upper_legs",
  "vastus medialis": "upper_legs",
  hamstrings: "upper_legs",
  adductors: "upper_legs",
  "adductor brevis": "upper_legs",
  "adductor longus": "upper_legs",
  "adductor magnus": "upper_legs",
  thighs: "upper_legs",
  "upper legs": "upper_legs",
  calves: "lower_legs",
  gastrocnemius: "lower_legs",
  soleus: "lower_legs",
  "tibialis anterior": "lower_legs",
  "lower legs": "lower_legs",
  "full body": "full_body",
};

const muscleAliases: Record<string, MuscleKey> = {
  chest: "pectorals",
  pectorals: "pectorals",
  "pectoralis major": "pectorals",
  "pectoralis minor": "pectorals",
  "anterior deltoid": "anterior_deltoids",
  "anterior deltoids": "anterior_deltoids",
  "lateral deltoid": "lateral_deltoids",
  "lateral deltoids": "lateral_deltoids",
  "posterior deltoid": "posterior_deltoids",
  "posterior deltoids": "posterior_deltoids",
  biceps: "biceps",
  "biceps brachii": "biceps",
  brachialis: "biceps",
  triceps: "triceps",
  "triceps brachii": "triceps",
  forearms: "forearms",
  "lower arms": "forearms",
  brachioradialis: "forearms",
  abs: "rectus_abdominis",
  abdominals: "rectus_abdominis",
  "rectus abdominis": "rectus_abdominis",
  obliques: "obliques",
  iliopsoas: "hip_flexors",
  "hip flexors": "hip_flexors",
  traps: "trapezius",
  trapezius: "trapezius",
  "trapezius upper fibers": "trapezius",
  "trapezius middle fibers": "trapezius",
  "trapezius lower fibers": "trapezius",
  lats: "latissimus_dorsi",
  "latissimus dorsi": "latissimus_dorsi",
  rhomboids: "rhomboids",
  "erector spinae": "spinal_erectors",
  "spinal erectors": "spinal_erectors",
  "lower back": "spinal_erectors",
  glutes: "gluteals",
  gluteals: "gluteals",
  "gluteus maximus": "gluteals",
  "gluteus medius": "gluteals",
  "gluteus minimus": "gluteals",
  "hip abductors": "hip_abductors",
  "tensor fasciae latae": "hip_abductors",
  quadriceps: "quadriceps",
  quads: "quadriceps",
  "rectus femoris": "quadriceps",
  "vastus intermedius": "quadriceps",
  "vastus lateralis": "quadriceps",
  "vastus medialis": "quadriceps",
  hamstrings: "hamstrings",
  adductors: "adductors",
  "adductor brevis": "adductors",
  "adductor longus": "adductors",
  "adductor magnus": "adductors",
  calves: "calves",
  gastrocnemius: "calves",
  soleus: "calves",
  "tibialis anterior": "tibialis_anterior",
};

export const LEGACY_EXERCISE_MUSCLE_ALIASES: ExerciseMuscleAliasTable = {
  bodyRegions: bodyRegionAliases,
  muscles: muscleAliases,
};

export const CURRENT_PROVIDER_EXERCISE_MUSCLE_ALIASES: ExerciseMuscleAliasTable =
  LEGACY_EXERCISE_MUSCLE_ALIASES;

export function mapExerciseLabelToBodyRegion(
  value: unknown,
  aliases: ExerciseMuscleAliasTable = LEGACY_EXERCISE_MUSCLE_ALIASES,
): BodyRegionKey | null {
  if (typeof value !== "string") return null;
  return aliases.bodyRegions[normalizeAlias(value)] ?? null;
}

export function mapExerciseLabelToMuscle(
  value: unknown,
  aliases: ExerciseMuscleAliasTable = LEGACY_EXERCISE_MUSCLE_ALIASES,
): MuscleKey | null {
  if (typeof value !== "string") return null;
  return aliases.muscles[normalizeAlias(value)] ?? null;
}

const asOriginalLabels = (value: unknown) =>
  (Array.isArray(value) ? value : value == null ? [] : [value])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

export function mapExerciseLabelsToCanonicalProfile(
  input: {
    bodyRegionLabels?: unknown;
    primaryMuscleLabels?: unknown;
    secondaryMuscleLabels?: unknown;
  },
  aliases: ExerciseMuscleAliasTable = LEGACY_EXERCISE_MUSCLE_ALIASES,
): CanonicalExerciseMuscleProfile {
  const bodyRegionKeys: BodyRegionKey[] = [];
  const primaryMuscleKeys: MuscleKey[] = [];
  const secondaryMuscleKeys: MuscleKey[] = [];
  const unmappedLabels: string[] = [];

  const addMappedLabel = (
    label: string,
    destination: MuscleKey[],
    permitBroadRegion: boolean,
  ) => {
    const muscleKey = mapExerciseLabelToMuscle(label, aliases);
    if (muscleKey) {
      destination.push(muscleKey);
      return;
    }
    const regionKey = permitBroadRegion
      ? mapExerciseLabelToBodyRegion(label, aliases)
      : null;
    if (regionKey) {
      bodyRegionKeys.push(regionKey);
      return;
    }
    unmappedLabels.push(label);
  };

  asOriginalLabels(input.bodyRegionLabels).forEach((label) => {
    const regionKey = mapExerciseLabelToBodyRegion(label, aliases);
    if (regionKey) bodyRegionKeys.push(regionKey);
    else unmappedLabels.push(label);
  });
  asOriginalLabels(input.primaryMuscleLabels).forEach((label) =>
    addMappedLabel(label, primaryMuscleKeys, true),
  );
  asOriginalLabels(input.secondaryMuscleLabels).forEach((label) =>
    addMappedLabel(label, secondaryMuscleKeys, true),
  );

  return normalizeCanonicalExerciseMuscleProfile({
    bodyRegionKeys,
    primaryMuscleKeys,
    secondaryMuscleKeys,
    unmappedLabels,
  });
}

type ProviderValues = { found: boolean; values: string[] };

function readProviderValues(
  record: Record<string, unknown>,
  keys: readonly string[],
): ProviderValues {
  let found = false;
  const values: string[] = [];
  for (const key of keys) {
    if (!(key in record)) continue;
    found = true;
    values.push(...asOriginalLabels(record[key]));
  }
  return { found, values };
}

export function mapCurrentProviderMuscleProfile(
  exercise: Pick<
    ProviderNormalizedExercise,
    "bodyPart" | "target" | "secondaryMuscles" | "raw"
  >,
): CanonicalExerciseMuscleProfile {
  const rawBodyRegions = readProviderValues(exercise.raw, [
    "bodyPart",
    "bodyParts",
    "category",
  ]);
  const rawPrimaryMuscles = readProviderValues(exercise.raw, [
    "target",
    "targetMuscles",
  ]);
  const rawSecondaryMuscles = readProviderValues(exercise.raw, [
    "secondaryMuscles",
  ]);

  const bodyRegionKeys: BodyRegionKey[] = [];
  const primaryMuscleKeys: MuscleKey[] = [];
  const secondaryMuscleKeys: MuscleKey[] = [];
  const unmappedLabels: string[] = [];

  const addProviderBodyPart = (label: string) => {
    const resolution = resolveProviderBodyPartMapping(label);
    if (
      resolution.status === "mapped" &&
      resolution.mapping.canonicalBodyRegionKey
    ) {
      bodyRegionKeys.push(resolution.mapping.canonicalBodyRegionKey);
      return;
    }
    unmappedLabels.push(label);
  };
  const addProviderTarget = (label: string, destination: MuscleKey[]) => {
    const resolution = resolveProviderTargetMuscleMapping(label);
    if (resolution.status === "mapped") {
      const { mapping } = resolution;
      if (
        (mapping.disposition === "exact" ||
          mapping.disposition === "grouped") &&
        mapping.canonicalMuscleKey
      ) {
        destination.push(mapping.canonicalMuscleKey);
        return;
      }
      if (
        mapping.disposition === "region_only" &&
        mapping.canonicalBodyRegionKey
      ) {
        bodyRegionKeys.push(mapping.canonicalBodyRegionKey);
        return;
      }
    }
    unmappedLabels.push(label);
  };

  if (rawBodyRegions.found) {
    rawBodyRegions.values.forEach(addProviderBodyPart);
  }
  if (rawPrimaryMuscles.found) {
    rawPrimaryMuscles.values.forEach((label) =>
      addProviderTarget(label, primaryMuscleKeys),
    );
  }
  if (rawSecondaryMuscles.found) {
    rawSecondaryMuscles.values.forEach((label) =>
      addProviderTarget(label, secondaryMuscleKeys),
    );
  }

  const legacyFallback = mapExerciseLabelsToCanonicalProfile(
    {
      bodyRegionLabels: rawBodyRegions.found ? [] : exercise.bodyPart,
      primaryMuscleLabels: rawPrimaryMuscles.found ? [] : exercise.target,
      secondaryMuscleLabels: rawSecondaryMuscles.found
        ? []
        : exercise.secondaryMuscles,
    },
    CURRENT_PROVIDER_EXERCISE_MUSCLE_ALIASES,
  );

  return normalizeCanonicalExerciseMuscleProfile({
    bodyRegionKeys: [...bodyRegionKeys, ...legacyFallback.bodyRegionKeys],
    primaryMuscleKeys: [
      ...primaryMuscleKeys,
      ...legacyFallback.primaryMuscleKeys,
    ],
    secondaryMuscleKeys: [
      ...secondaryMuscleKeys,
      ...legacyFallback.secondaryMuscleKeys,
    ],
    unmappedLabels: [...unmappedLabels, ...legacyFallback.unmappedLabels],
  });
}

export function buildCurrentProviderCanonicalMuscleFields(
  exercise: Pick<
    ProviderNormalizedExercise,
    "bodyPart" | "target" | "secondaryMuscles" | "raw"
  >,
) {
  const profile = mapCurrentProviderMuscleProfile(exercise);
  return {
    body_region_keys: profile.bodyRegionKeys,
    primary_muscle_keys: profile.primaryMuscleKeys,
    secondary_muscle_keys: profile.secondaryMuscleKeys,
    muscle_taxonomy_version: EXERCISE_MUSCLE_TAXONOMY_VERSION,
  };
}
