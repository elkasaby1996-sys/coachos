import { describe, expect, it } from "vitest";
import {
  EXERCISE_EDITOR_WRITABLE_FIELDS,
  EXERCISE_LIBRARY_FULL_PROJECTION,
  exerciseQueryKeys,
  workoutTemplateExerciseQueryKeys,
} from "../../src/lib/exercise-query-contracts";

describe("exercise query contracts", () => {
  it("isolates every incompatible workout-template projection", () => {
    const templateId = "template-a";
    const keys = [
      workoutTemplateExerciseQueryKeys.builder(templateId),
      workoutTemplateExerciseQueryKeys.preview(templateId),
      workoutTemplateExerciseQueryKeys.today(templateId),
      workoutTemplateExerciseQueryKeys.detail(templateId),
      workoutTemplateExerciseQueryKeys.runner(templateId),
    ].map((key) => JSON.stringify(key));

    expect(new Set(keys).size).toBe(keys.length);
    expect(workoutTemplateExerciseQueryKeys.builder(templateId)).not.toEqual(
      workoutTemplateExerciseQueryKeys.preview(templateId),
    );
  });

  it("uses a namespaced full library key under an owner invalidation prefix", () => {
    const ownerKey = exerciseQueryKeys.library.owner("owner-a");
    const fullKey = exerciseQueryKeys.library.full("owner-a");

    expect(fullKey.slice(0, ownerKey.length)).toEqual(ownerKey);
    expect(fullKey.at(-1)).toBe("full");
  });

  it("fetches every field that the exercise editor can write", () => {
    const projectedFields = new Set(
      EXERCISE_LIBRARY_FULL_PROJECTION.split(",").map((field) => field.trim()),
    );

    EXERCISE_EDITOR_WRITABLE_FIELDS.forEach((field) => {
      expect(projectedFields.has(field), `${field} must be fetched`).toBe(true);
    });
  });
});
