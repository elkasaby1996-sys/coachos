import { describe, expect, it } from "vitest";
import {
  buildCurrentProviderCanonicalMuscleFields,
  mapCurrentProviderMuscleProfile,
  mapExerciseLabelToBodyRegion,
  mapExerciseLabelToMuscle,
  mapExerciseLabelsToCanonicalProfile,
} from "../../src/lib/exercise-muscle-mapping";
import {
  BODY_REGIONS,
  BODY_REGION_KEYS,
  MUSCLES,
  MUSCLE_KEYS,
  hasBroadRegionFallback,
  isPrimaryMuscleMatch,
  isSecondaryMuscleMatch,
  normalizeCanonicalExerciseMuscleProfile,
  normalizeExerciseMuscleSelection,
  parseBodyRegionKey,
  parseMuscleKey,
  rankExerciseForMuscle,
} from "../../src/lib/exercise-muscle-taxonomy";

describe("canonical exercise muscle taxonomy", () => {
  it("defines every canonical region and muscle key exactly once", () => {
    expect(new Set(BODY_REGION_KEYS).size).toBe(BODY_REGION_KEYS.length);
    expect(new Set(MUSCLE_KEYS).size).toBe(MUSCLE_KEYS.length);
    expect(BODY_REGIONS.map(({ key }) => key)).toEqual(BODY_REGION_KEYS);
    expect(MUSCLES.map(({ key }) => key)).toEqual(MUSCLE_KEYS);
  });

  it("references valid regions and only valid front/back surfaces", () => {
    const regions = new Set(BODY_REGION_KEYS);
    MUSCLES.forEach((muscle) => {
      expect(regions.has(muscle.regionKey)).toBe(true);
      expect(muscle.surfaces.length).toBeGreaterThan(0);
      expect(
        muscle.surfaces.every(
          (surface) => surface === "front" || surface === "back",
        ),
      ).toBe(true);
    });
  });

  it("parses canonical keys and rejects labels, unknown keys, and SVG IDs", () => {
    expect(parseBodyRegionKey(" back ")).toBe("back");
    expect(parseMuscleKey("hip_abductors")).toBe("hip_abductors");
    expect(parseMuscleKey("Hip abductors")).toBeNull();
    expect(parseBodyRegionKey("upper_back")).toBeNull();
    expect(parseMuscleKey("svg-path-12")).toBeNull();
  });

  it.each([
    ["pectoralis major", "pectorals"],
    ["brachialis", "biceps"],
    ["triceps brachii", "triceps"],
    ["anterior deltoid", "anterior_deltoids"],
    ["lateral deltoid", "lateral_deltoids"],
    ["posterior deltoid", "posterior_deltoids"],
    ["brachioradialis", "forearms"],
    ["rectus abdominis", "rectus_abdominis"],
    ["iliopsoas", "hip_flexors"],
    ["latissimus dorsi", "latissimus_dorsi"],
    ["trapezius upper fibers", "trapezius"],
    ["erector spinae", "spinal_erectors"],
    ["gluteus medius", "gluteals"],
    ["tensor fasciae latae", "hip_abductors"],
    ["vastus lateralis", "quadriceps"],
    ["adductor longus", "adductors"],
    ["gastrocnemius", "calves"],
    ["tibialis anterior", "tibialis_anterior"],
  ] as const)("maps the high-confidence alias %s", (label, expected) => {
    expect(mapExerciseLabelToMuscle(label)).toBe(expected);
  });

  it("keeps unknown, Bodyweight, and Cardio unmapped", () => {
    for (const label of ["unknown anatomy", "Bodyweight", "Cardio"]) {
      expect(mapExerciseLabelToMuscle(label)).toBeNull();
      expect(mapExerciseLabelToBodyRegion(label)).toBeNull();
    }
  });

  it("maps broad Back and Arms only as regions and leaves broad Legs unknown", () => {
    expect(mapExerciseLabelToBodyRegion("Back")).toBe("back");
    expect(mapExerciseLabelToMuscle("Back")).toBeNull();
    expect(mapExerciseLabelToBodyRegion("Arms")).toBe("arms");
    expect(mapExerciseLabelToMuscle("Arms")).toBeNull();
    expect(mapExerciseLabelToBodyRegion("Legs")).toBeNull();
    expect(mapExerciseLabelToMuscle("Legs")).toBeNull();
  });

  it("supports full body without inventing a specific muscle", () => {
    expect(
      mapExerciseLabelsToCanonicalProfile({
        bodyRegionLabels: "Full Body",
      }),
    ).toEqual({
      bodyRegionKeys: ["full_body"],
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
      unmappedLabels: [],
    });
  });

  it("deduplicates arrays, preserves multiple primaries, and removes overlap", () => {
    expect(
      normalizeCanonicalExerciseMuscleProfile({
        bodyRegionKeys: ["arms", "arms"],
        primaryMuscleKeys: ["biceps", "triceps", "biceps"],
        secondaryMuscleKeys: ["triceps", "forearms", "forearms", "unknown"],
        unmappedLabels: ["vendor-only", "vendor-only"],
      }),
    ).toEqual({
      bodyRegionKeys: ["arms", "forearms"],
      primaryMuscleKeys: ["biceps", "triceps"],
      secondaryMuscleKeys: ["forearms"],
      unmappedLabels: ["vendor-only", "unknown"],
    });
  });

  it("normalizes the reusable custom-exercise selection contract", () => {
    expect(
      normalizeExerciseMuscleSelection({
        bodyRegionKeys: ["full_body", "full_body"],
        primaryMuscleKeys: [],
        secondaryMuscleKeys: [],
      }),
    ).toEqual({
      bodyRegionKeys: ["full_body"],
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
    });
  });

  it("ranks primary above secondary above broad-region fallback", () => {
    const persistedExercise = {
      body_region_keys: ["arms"],
      primary_muscle_keys: ["biceps"],
      secondary_muscle_keys: ["triceps"],
    };
    expect(isPrimaryMuscleMatch(persistedExercise, "biceps")).toBe(true);
    expect(isSecondaryMuscleMatch(persistedExercise, "triceps")).toBe(true);
    expect(rankExerciseForMuscle(persistedExercise, "biceps")).toBe(3);
    expect(rankExerciseForMuscle(persistedExercise, "triceps")).toBe(2);
    expect(
      rankExerciseForMuscle(
        {
          bodyRegionKeys: ["arms"],
          primaryMuscleKeys: [],
          secondaryMuscleKeys: [],
        },
        "biceps",
      ),
    ).toBe(1);
    expect(
      hasBroadRegionFallback(
        {
          bodyRegionKeys: ["core"],
          primaryMuscleKeys: [],
          secondaryMuscleKeys: [],
        },
        "biceps",
      ),
    ).toBe(false);
    expect(
      rankExerciseForMuscle(
        {
          bodyRegionKeys: ["full_body"],
          primaryMuscleKeys: [],
          secondaryMuscleKeys: [],
        },
        "biceps",
      ),
    ).toBe(1);
  });

  it("uses raw current-provider arrays and retains unmapped source labels", () => {
    const exercise = {
      bodyPart: "Shoulders",
      target: "Shoulders",
      secondaryMuscles: ["Triceps"],
      raw: {
        bodyParts: ["shoulders", "upper arms"],
        targetMuscles: ["anterior deltoid", "triceps brachii"],
        secondaryMuscles: [
          "anterior deltoid",
          "brachioradialis",
          "vendor-only-muscle",
        ],
      },
    };

    expect(mapCurrentProviderMuscleProfile(exercise)).toEqual({
      bodyRegionKeys: ["shoulders", "arms", "forearms"],
      primaryMuscleKeys: ["anterior_deltoids", "triceps"],
      secondaryMuscleKeys: ["forearms"],
      unmappedLabels: ["vendor-only-muscle"],
    });
    expect(buildCurrentProviderCanonicalMuscleFields(exercise)).toEqual({
      body_region_keys: ["shoulders", "arms", "forearms"],
      primary_muscle_keys: ["anterior_deltoids", "triceps"],
      secondary_muscle_keys: ["forearms"],
      muscle_taxonomy_version: 1,
    });
  });

  it("does not reinterpret raw Cardio through normalized Full Body labels", () => {
    expect(
      mapCurrentProviderMuscleProfile({
        bodyPart: "Full Body",
        target: "Full Body",
        secondaryMuscles: [],
        raw: { bodyPart: "cardio", target: "cardio" },
      }),
    ).toEqual({
      bodyRegionKeys: [],
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
      unmappedLabels: ["cardio"],
    });
  });
});
