import { describe, expect, it } from "vitest";
import {
  adaptPersistedExerciseBrowserItem,
  adaptProviderExerciseBrowserItem,
} from "../../src/lib/exercise-browser";
import type {
  PersistentExerciseLibraryRecord,
  ProviderNormalizedExercise,
} from "../../src/lib/exercise-domain";
import { buildCurrentProviderExerciseInsertPayload } from "../../src/lib/exercise-import";
import {
  createExercisePickerSelectionEntry,
  emptyExercisePickerSelection,
  resolveExercisePickerSelections,
  toggleExercisePickerSelection,
} from "../../src/lib/exercise-picker";

const persisted = (
  overrides: Partial<PersistentExerciseLibraryRecord> = {},
): PersistentExerciseLibraryRecord => ({
  id: "saved-1",
  owner_user_id: "owner-1",
  workspace_id: null,
  name: "Saved curl",
  category: "Arms",
  muscle_group: "Arms",
  primary_muscle: "Biceps",
  secondary_muscles: [],
  body_region_keys: ["arms"],
  primary_muscle_keys: ["biceps"],
  secondary_muscle_keys: [],
  muscle_taxonomy_version: 1,
  equipment: "Dumbbell",
  video_url: null,
  instructions: null,
  notes: null,
  cues: null,
  is_unilateral: false,
  tags: [],
  created_at: null,
  source: "manual",
  source_exercise_id: null,
  source_payload: null,
  ...overrides,
});

const provider = (
  overrides: Partial<ProviderNormalizedExercise> = {},
): ProviderNormalizedExercise => ({
  id: "provider-1",
  name: "Provider curl",
  bodyPart: "Arms",
  target: "Biceps",
  exerciseType: "Strength",
  secondaryMuscles: ["Forearms"],
  equipment: "Dumbbell",
  instructions: ["Stand tall", "Curl slowly"],
  exerciseTips: ["Keep the elbow still"],
  overview: "A controlled curl",
  keywords: ["arms"],
  videoUrl: null,
  imageUrl: null,
  raw: { id: "provider-1" },
  ...overrides,
});

describe("shared exercise picker selection model", () => {
  it("retains a saved selection independently from visible search results", () => {
    const exercise = persisted();
    const entry = createExercisePickerSelectionEntry(
      adaptPersistedExerciseBrowserItem(exercise),
      null,
      [exercise],
    );
    expect(entry).not.toBeNull();

    const selection = toggleExercisePickerSelection(
      emptyExercisePickerSelection(),
      entry!,
    );
    const replacementVisibleResults: unknown[] = [];

    expect(replacementVisibleResults).toHaveLength(0);
    expect(selection.get("library:saved-1")?.item.name).toBe("Saved curl");
    expect(resolveExercisePickerSelections(selection, [exercise])).toEqual({
      candidates: [
        {
          key: "library:saved-1",
          source: "library",
          exerciseId: "saved-1",
        },
      ],
      unresolvedKeys: [],
      nameConflictKeys: [],
    });
  });

  it("canonicalizes an exact provider match to one internal selection key", () => {
    const saved = persisted({
      id: "internal-uuid",
      source: "exercise_dataset",
      source_exercise_id: "provider-1",
    });
    const transient = provider();
    const item = adaptProviderExerciseBrowserItem(transient, [saved]);
    const entry = createExercisePickerSelectionEntry(item, transient, [saved]);

    expect(entry).toMatchObject({
      key: "library:internal-uuid",
      providerExercise: null,
      item: { key: "persisted:internal-uuid", exerciseId: "internal-uuid" },
    });
  });

  it("blocks provider name conflicts instead of inferring identity", () => {
    const saved = persisted({ name: "Provider curl" });
    const transient = provider();
    const item = adaptProviderExerciseBrowserItem(transient, [saved]);

    expect(item.savedMatch.status).toBe("name_conflict");
    expect(
      createExercisePickerSelectionEntry(item, transient, [saved]),
    ).toBeNull();
  });

  it("retains the complete provider object and revalidates before writes", () => {
    const transient = provider();
    const item = adaptProviderExerciseBrowserItem(transient, []);
    const entry = createExercisePickerSelectionEntry(item, transient, []);
    const selection = toggleExercisePickerSelection(
      emptyExercisePickerSelection(),
      entry!,
    );

    expect(selection.get("dataset:provider-1")?.providerExercise).toEqual(
      transient,
    );
    expect(resolveExercisePickerSelections(selection, []).candidates).toEqual([
      { key: "dataset:provider-1", source: "dataset", exercise: transient },
    ]);

    const concurrentNameConflict = persisted({ name: transient.name });
    expect(
      resolveExercisePickerSelections(selection, [concurrentNameConflict]),
    ).toMatchObject({
      candidates: [],
      nameConflictKeys: ["dataset:provider-1"],
    });
  });

  it("uses the shared provider import payload with canonical provenance", () => {
    const payload = buildCurrentProviderExerciseInsertPayload(
      "owner-1",
      provider(),
    );
    expect(payload).toMatchObject({
      owner_user_id: "owner-1",
      workspace_id: null,
      source: "exercise_dataset",
      source_exercise_id: "provider-1",
      source_payload: { id: "provider-1" },
      body_region_keys: ["arms", "forearms"],
      primary_muscle_keys: ["biceps"],
      secondary_muscle_keys: ["forearms"],
      instructions: "Stand tall\n\nCurl slowly",
      cues: "Keep the elbow still",
    });
  });
});
