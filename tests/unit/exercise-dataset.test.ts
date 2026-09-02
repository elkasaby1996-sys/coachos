import { describe, expect, it } from "vitest";
import {
  extractExerciseDatasetNextCursor,
  normalizeExerciseDatasetMetadata,
  normalizeExerciseDatasetRecord,
} from "../../src/lib/exercise-dataset";

describe("exercise dataset normalization", () => {
  it("keeps string provider ids", () => {
    expect(
      normalizeExerciseDatasetRecord({ id: " provider-1 ", name: "Squat" })?.id,
    ).toBe("provider-1");
  });

  it("normalizes finite numeric provider ids to strings", () => {
    expect(normalizeExerciseDatasetRecord({ id: 42, name: "Squat" })?.id).toBe(
      "42",
    );
    expect(
      normalizeExerciseDatasetRecord({
        id: Number.POSITIVE_INFINITY,
        name: "Squat",
      }),
    ).toBeNull();
  });

  it("rejects malformed records missing an id or name", () => {
    expect(normalizeExerciseDatasetRecord({ name: "Squat" })).toBeNull();
    expect(normalizeExerciseDatasetRecord({ id: "provider-1" })).toBeNull();
  });

  it("normalizes target/body-part aliases and secondary-muscle arrays", () => {
    const exercise = normalizeExerciseDatasetRecord({
      exerciseId: "provider-2",
      name: "Split Squat",
      bodyParts: ["upper legs"],
      targetMuscles: ["gluteus maximus"],
      secondaryMuscles: ["quadriceps", "adductor longus"],
      exerciseType: "STRENGTH",
    });

    expect(exercise).toMatchObject({
      bodyPart: "Legs",
      target: "Glutes",
      secondaryMuscles: ["Quads", "Legs"],
      exerciseType: "Strength",
    });
    expect(exercise?.instructions).toEqual([]);
    expect(exercise?.exerciseTips).toEqual([]);
    expect(exercise?.keywords).toEqual([]);
  });

  it("uses GIF as the video fallback while preserving image urls", () => {
    const exercise = normalizeExerciseDatasetRecord({
      id: "provider-3",
      name: "Row",
      gifUrl: "https://example.com/row.gif",
      imageUrl: "https://example.com/row.jpg",
    });

    expect(exercise?.videoUrl).toBe("https://example.com/row.gif");
    expect(exercise?.imageUrl).toBe("https://example.com/row.jpg");
  });

  it("preserves V2 MP4 detail media", () => {
    const exercise = normalizeExerciseDatasetRecord({
      exerciseId: "exr_video-1",
      name: "Bench Press",
      videoUrl: "https://cdn.example/bench.mp4",
      imageUrl: "https://cdn.example/bench.webp",
    });

    expect(exercise).toMatchObject({
      id: "exr_video-1",
      videoUrl: "https://cdn.example/bench.mp4",
      imageUrl: "https://cdn.example/bench.webp",
    });
  });

  it("extracts only a non-empty string cursor from provider metadata", () => {
    expect(
      extractExerciseDatasetNextCursor({ meta: { nextCursor: " next-2 " } }),
    ).toBe("next-2");
    expect(
      extractExerciseDatasetNextCursor({ meta: { nextCursor: 2 } }),
    ).toBeNull();
    expect(extractExerciseDatasetNextCursor({})).toBeNull();
  });

  it("normalizes and deduplicates provider metadata options", () => {
    expect(
      normalizeExerciseDatasetMetadata(
        {
          data: [
            { name: "BODY WEIGHT", imageUrl: "https://cdn.example/body.webp" },
            { name: " body weight " },
          ],
        },
        "equipments",
      ),
    ).toEqual([
      {
        value: "BODY WEIGHT",
        label: "Bodyweight",
        imageUrl: "https://cdn.example/body.webp",
      },
    ]);
  });
});
