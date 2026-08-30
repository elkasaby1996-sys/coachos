import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adaptPersistedExerciseMuscleProfile,
  buildCustomExerciseMusclePersistenceFields,
  getLegacyExerciseMuscleLabels,
  initializeExerciseMuscleFormValue,
  serializeExerciseMuscleFormValue,
  type ExerciseMuscleFormValue,
} from "../../src/lib/exercise-muscle-classification";
import { mapCurrentProviderMuscleProfile } from "../../src/lib/exercise-muscle-mapping";
import { rankExerciseForMuscle } from "../../src/lib/exercise-muscle-taxonomy";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

const specificValue = (
  overrides: Partial<ExerciseMuscleFormValue> = {},
): ExerciseMuscleFormValue => ({
  mode: "specific",
  primaryMuscleKeys: ["pectorals"],
  secondaryMuscleKeys: ["triceps"],
  bodyRegionKey: null,
  ...overrides,
});

describe("custom exercise muscle classification", () => {
  it("serializes specific classification with multiple primary and secondary muscles", () => {
    expect(
      serializeExerciseMuscleFormValue(
        specificValue({
          primaryMuscleKeys: ["pectorals", "anterior_deltoids"],
          secondaryMuscleKeys: ["triceps", "biceps"],
        }),
      ),
    ).toEqual({
      bodyRegionKeys: ["chest", "shoulders", "arms"],
      primaryMuscleKeys: ["pectorals", "anterior_deltoids"],
      secondaryMuscleKeys: ["biceps", "triceps"],
    });
  });

  it("removes primary-secondary overlap and derives every selected region", () => {
    expect(
      serializeExerciseMuscleFormValue(
        specificValue({
          primaryMuscleKeys: ["biceps", "quadriceps"],
          secondaryMuscleKeys: ["biceps", "calves", "obliques"],
        }),
      ),
    ).toEqual({
      bodyRegionKeys: ["arms", "core", "upper_legs", "lower_legs"],
      primaryMuscleKeys: ["biceps", "quadriceps"],
      secondaryMuscleKeys: ["obliques", "calves"],
    });
  });

  it("serializes a general region without fabricating specific muscles", () => {
    expect(
      serializeExerciseMuscleFormValue({
        mode: "region",
        bodyRegionKey: "back",
        primaryMuscleKeys: ["latissimus_dorsi"],
        secondaryMuscleKeys: ["rhomboids"],
      }),
    ).toEqual({
      bodyRegionKeys: ["back"],
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
    });
  });

  it("supports full-body and unclassified serialization", () => {
    expect(
      serializeExerciseMuscleFormValue({
        mode: "region",
        bodyRegionKey: "full_body",
        primaryMuscleKeys: [],
        secondaryMuscleKeys: [],
      }),
    ).toEqual({
      bodyRegionKeys: ["full_body"],
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
    });
    expect(
      serializeExerciseMuscleFormValue({
        mode: "unclassified",
        bodyRegionKey: "full_body",
        primaryMuscleKeys: ["pectorals"],
        secondaryMuscleKeys: ["triceps"],
      }),
    ).toEqual({
      bodyRegionKeys: [],
      primaryMuscleKeys: [],
      secondaryMuscleKeys: [],
    });
  });

  it("initializes from persisted canonical arrays and preserves imported multi-primary anatomy", () => {
    expect(
      initializeExerciseMuscleFormValue({
        body_region_keys: ["chest", "shoulders", "arms"],
        primary_muscle_keys: ["pectorals", "anterior_deltoids"],
        secondary_muscle_keys: ["triceps"],
      }),
    ).toEqual({
      mode: "specific",
      primaryMuscleKeys: ["pectorals", "anterior_deltoids"],
      secondaryMuscleKeys: ["triceps"],
      bodyRegionKey: null,
    });
    expect(
      initializeExerciseMuscleFormValue({
        body_region_keys: [],
        primary_muscle_keys: [],
        secondary_muscle_keys: [],
      }).mode,
    ).toBe("unclassified");
  });

  it("parses stored canonical keys safely and reports invalid values as unmapped", () => {
    expect(
      adaptPersistedExerciseMuscleProfile({
        body_region_keys: ["back", "provider_region"],
        primary_muscle_keys: ["biceps", "provider_primary"],
        secondary_muscle_keys: ["biceps", "calves", "provider_secondary"],
      }),
    ).toEqual({
      bodyRegionKeys: ["back", "arms", "lower_legs"],
      primaryMuscleKeys: ["biceps"],
      secondaryMuscleKeys: ["calves"],
      unmappedLabels: [
        "provider_primary",
        "provider_secondary",
        "provider_region",
      ],
    });
  });

  it("projects deterministic legacy labels without truncating canonical arrays", () => {
    expect(
      buildCustomExerciseMusclePersistenceFields(
        specificValue({
          primaryMuscleKeys: ["biceps", "triceps"],
          secondaryMuscleKeys: ["forearms", "calves"],
        }),
      ),
    ).toEqual({
      body_region_keys: ["arms", "forearms", "lower_legs"],
      primary_muscle_keys: ["biceps", "triceps"],
      secondary_muscle_keys: ["forearms", "calves"],
      muscle_taxonomy_version: 1,
      primary_muscle: "Biceps",
      secondary_muscles: ["Forearms", "Calves"],
      muscle_group: "Arms",
    });
  });

  it("keeps unknown legacy values as reference text without guessing canonical anatomy", () => {
    const record = {
      muscle_group: "Cardio",
      primary_muscle: "Coach-defined target",
      secondary_muscles: ["Legacy zone"],
      body_region_keys: [],
      primary_muscle_keys: [],
      secondary_muscle_keys: [],
    };
    expect(getLegacyExerciseMuscleLabels(record)).toEqual([
      "Coach-defined target",
      "Cardio",
      "Legacy zone",
    ]);
    expect(initializeExerciseMuscleFormValue(record).mode).toBe("unclassified");
  });
});

describe("shared custom/provider matching seam", () => {
  const persistedCustom = {
    body_region_keys: ["arms"],
    primary_muscle_keys: ["biceps"],
    secondary_muscle_keys: ["triceps"],
  };
  const transientProvider = mapCurrentProviderMuscleProfile({
    bodyPart: "Arms",
    target: "Biceps",
    secondaryMuscles: ["Triceps"],
    raw: {
      bodyPart: "upper arms",
      target: "biceps brachii",
      secondaryMuscles: ["triceps brachii"],
    },
  });

  it("uses equivalent primary and secondary ranks for persisted and provider exercises", () => {
    for (const exercise of [persistedCustom, transientProvider]) {
      expect(rankExerciseForMuscle(exercise, "biceps")).toBe(3);
      expect(rankExerciseForMuscle(exercise, "triceps")).toBe(2);
    }
  });

  it("returns zero for unclassified records and one only for genuine region fallback", () => {
    expect(
      rankExerciseForMuscle(
        {
          body_region_keys: [],
          primary_muscle_keys: [],
          secondary_muscle_keys: [],
        },
        "pectorals",
      ),
    ).toBe(0);
    expect(
      rankExerciseForMuscle(
        {
          body_region_keys: ["full_body"],
          primary_muscle_keys: [],
          secondary_muscle_keys: [],
        },
        "pectorals",
      ),
    ).toBe(1);
  });

  it("does not turn provider Cardio into full-body fallback", () => {
    const cardio = mapCurrentProviderMuscleProfile({
      bodyPart: "Full Body",
      target: "Full Body",
      secondaryMuscles: [],
      raw: { bodyPart: "cardio", target: "cardio" },
    });
    expect(cardio.bodyRegionKeys).toEqual([]);
    expect(rankExerciseForMuscle(cardio, "pectorals")).toBe(0);
  });
});

describe("classification entry-point contracts", () => {
  const librarySource = readSource(
    "src",
    "pages",
    "pt",
    "settings-exercises.tsx",
  );
  const builderSource = readSource(
    "src",
    "pages",
    "pt",
    "workout-template-builder.tsx",
  );

  it("uses one shared component and serializer in both entry points", () => {
    for (const source of [librarySource, builderSource]) {
      expect(source).toContain("<ExerciseMuscleClassificationFields");
      expect(source).toContain("buildCustomExerciseMusclePersistenceFields");
    }
  });

  it("writes classification on full-library create but preserves it on unrelated edits", () => {
    expect(librarySource).toContain("!selected || muscleClassificationChanged");
    expect(librarySource).toContain(
      "initializeExerciseMuscleFormValue(exercise)",
    );
    expect(librarySource).toContain('.update(payload).eq("id", selected.id)');
  });

  it("preserves imported source identity and raw payload during in-place edits", () => {
    const saveHandler = librarySource.slice(
      librarySource.indexOf("const handleSave"),
      librarySource.indexOf("const handleDelete"),
    );
    expect(saveHandler).not.toContain("source_exercise_id:");
    expect(saveHandler).not.toContain("source_payload:");
    expect(saveHandler).not.toContain("source: selected");
  });

  it("keeps owner-level creation and automatic UUID selection in the inline builder", () => {
    const createHandler = builderSource.slice(
      builderSource.indexOf("const handleCreateExercise"),
      builderSource.indexOf("const openEdit"),
    );
    expect(createHandler).toContain("owner_user_id: libraryOwnerUserId");
    expect(createHandler).toContain("workspace_id: null");
    expect(createHandler).toContain('source: "manual"');
    expect(createHandler).toContain(
      'makeExerciseSelectionKey("library", createdId)',
    );
    expect(createHandler).not.toContain("workout_template_exercises");
  });
});
