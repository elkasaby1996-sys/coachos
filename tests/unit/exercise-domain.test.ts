import { describe, expect, it } from "vitest";
import {
  buildWorkoutTemplateExerciseInsertRows,
  emptyExerciseSelectionState,
  findLibraryExerciseForProvider,
  makeExerciseSelectionKey,
  parseExerciseSelectionKey,
  partitionNewExerciseSelections,
  resolveExerciseSelectionCandidates,
  toggleExerciseSelection,
  type PersistentExerciseLibraryRecord,
  type ProviderNormalizedExercise,
} from "../../src/lib/exercise-domain";

const libraryExercise = (
  overrides: Partial<PersistentExerciseLibraryRecord> = {},
): PersistentExerciseLibraryRecord => ({
  id: "library-a",
  owner_user_id: "owner-a",
  workspace_id: null,
  name: "Bench Press",
  category: "Chest",
  muscle_group: "Chest",
  primary_muscle: "Chest",
  secondary_muscles: ["Triceps"],
  equipment: "Barbell",
  video_url: null,
  instructions: null,
  notes: null,
  cues: null,
  is_unilateral: false,
  tags: ["Chest"],
  created_at: "2026-01-01T00:00:00.000Z",
  source: "manual",
  source_exercise_id: null,
  source_payload: null,
  ...overrides,
});

const providerExercise = (
  id: string,
  name: string,
): ProviderNormalizedExercise => ({
  id,
  name,
  bodyPart: "Chest",
  target: "Chest",
  secondaryMuscles: [],
  equipment: "Barbell",
  instructions: [],
  exerciseTips: [],
  overview: null,
  keywords: [],
  videoUrl: null,
  imageUrl: null,
  raw: { id, name },
});

describe("exercise selection contract", () => {
  it("parses only namespaced library and dataset keys", () => {
    expect(parseExerciseSelectionKey("library:exercise-a")).toEqual({
      source: "library",
      id: "exercise-a",
    });
    expect(parseExerciseSelectionKey("dataset:provider:a")).toEqual({
      source: "dataset",
      id: "provider:a",
    });
    expect(parseExerciseSelectionKey("exercise-a")).toBeNull();
    expect(parseExerciseSelectionKey("unknown:exercise-a")).toBeNull();
    expect(parseExerciseSelectionKey("dataset:")).toBeNull();
  });

  it("preserves selected provider objects when visible search results change", () => {
    const exerciseA = providerExercise("provider-a", "Press A");
    const exerciseB = providerExercise("provider-b", "Press B");
    let state = toggleExerciseSelection(
      emptyExerciseSelectionState(),
      makeExerciseSelectionKey("dataset", exerciseA.id),
      exerciseA,
    );

    const replacementSearchResults = [exerciseB];
    expect(replacementSearchResults).not.toContain(exerciseA);
    state = toggleExerciseSelection(
      state,
      makeExerciseSelectionKey("dataset", exerciseB.id),
      exerciseB,
    );

    expect(state.keys).toHaveLength(2);
    expect(Object.values(state.providerByKey)).toEqual([exerciseA, exerciseB]);
    expect(
      resolveExerciseSelectionCandidates(state, []).unresolvedKeys,
    ).toEqual([]);
  });

  it("reports unresolved selections instead of silently dropping them", () => {
    const state = {
      keys: [makeExerciseSelectionKey("dataset", "missing")],
      providerByKey: {},
    };

    expect(resolveExerciseSelectionCandidates(state, [])).toEqual({
      candidates: [],
      unresolvedKeys: ["dataset:missing"],
    });
  });

  it("resolves provider records to an existing internal exercise", () => {
    const bySource = libraryExercise({ source_exercise_id: "provider-a" });
    const byName = libraryExercise({ id: "library-b", name: "Cable Row" });

    expect(
      findLibraryExerciseForProvider(
        providerExercise("provider-a", "Different name"),
        [bySource, byName],
      )?.id,
    ).toBe("library-a");
    expect(
      findLibraryExerciseForProvider(
        providerExercise("provider-b", " cable row "),
        [bySource, byName],
      )?.id,
    ).toBe("library-b");
  });

  it("filters existing and repeated internal exercise ids", () => {
    const result = partitionNewExerciseSelections(
      [
        { exerciseId: "existing" },
        { exerciseId: "new" },
        { exerciseId: "new" },
      ],
      new Set(["existing"]),
    );

    expect(result.newSelections).toEqual([{ exerciseId: "new" }]);
    expect(result.duplicateExerciseIds).toEqual(["existing", "new"]);
  });

  it("keeps the locked workout-template insert shape", () => {
    expect(
      buildWorkoutTemplateExerciseInsertRows(
        "template-a",
        [{ exerciseId: "exercise-a" }],
        20,
      ),
    ).toEqual([
      {
        workout_template_id: "template-a",
        exercise_id: "exercise-a",
        sort_order: 30,
      },
    ]);
  });
});
