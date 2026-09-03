import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("../../src/lib/supabase", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  ExerciseDatasetError,
  getExerciseDatasetExercise,
  getExerciseDatasetMetadataCatalog,
  searchExerciseDataset,
} from "../../src/lib/exercise-dataset";

describe("exercise dataset gateway client", () => {
  beforeEach(() => invokeMock.mockReset());

  it("invokes the RepSync gateway and preserves normalized numeric ids", async () => {
    invokeMock.mockResolvedValue({
      data: {
        providerPayload: {
          data: [{ id: 42, name: "Squat", secondaryMuscles: [] }],
          meta: { nextCursor: "next-2" },
        },
      },
      error: null,
    });

    const result = await searchExerciseDataset({
      name: "squat",
      bodyPart: "",
      equipment: "",
      target: "",
      exerciseType: "",
      limit: 10,
      cursor: null,
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "exercise-dataset-search",
      expect.objectContaining({
        body: {
          name: "squat",
          bodyPart: "",
          equipment: "",
          target: "",
          exerciseType: "",
          limit: 10,
          cursor: null,
        },
      }),
    );
    expect(result).toEqual({
      exercises: [expect.objectContaining({ id: "42", name: "Squat" })],
      nextCursor: "next-2",
    });
  });

  it("maps the stable gateway rate-limit error to safe user copy", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        context: Response.json(
          {
            error: {
              code: "provider_rate_limited",
              message: "internal provider detail",
            },
          },
          { status: 429 },
        ),
      },
    });

    await expect(
      searchExerciseDataset({
        name: "",
        bodyPart: "",
        equipment: "",
        target: "",
        exerciseType: "",
      }),
    ).rejects.toMatchObject<Partial<ExerciseDatasetError>>({
      code: "provider_rate_limited",
      message:
        "The exercise provider rate-limited this request. Wait a moment and try again.",
    });
  });

  it("loads and normalizes one provider detail record through the gateway", async () => {
    invokeMock.mockResolvedValue({
      data: {
        providerPayload: {
          success: true,
          data: {
            exerciseId: "exr_video-1",
            name: "Bench Press",
            videoUrl: "https://cdn.example/bench.mp4",
            imageUrl: "https://cdn.example/bench.webp",
          },
        },
      },
      error: null,
    });

    const exercise = await getExerciseDatasetExercise("exr_video-1");

    expect(invokeMock).toHaveBeenCalledWith(
      "exercise-dataset-search",
      expect.objectContaining({ body: { exerciseId: "exr_video-1" } }),
    );
    expect(exercise).toMatchObject({
      id: "exr_video-1",
      videoUrl: "https://cdn.example/bench.mp4",
      imageUrl: "https://cdn.example/bench.webp",
    });
  });

  it("loads every provider metadata catalog through the protected gateway", async () => {
    invokeMock.mockResolvedValue({
      data: {
        providerPayload: {
          data: [
            {
              name: "BODY WEIGHT",
              imageUrl: "https://cdn.example/metadata.webp",
            },
          ],
        },
      },
      error: null,
    });

    const catalog = await getExerciseDatasetMetadataCatalog();

    expect(invokeMock).toHaveBeenCalledTimes(4);
    expect(
      invokeMock.mock.calls.map(([, options]) => options.body.metadata),
    ).toEqual(["muscles", "bodyparts", "equipments", "exercisetypes"]);
    expect(catalog.equipments).toEqual([
      {
        value: "BODY WEIGHT",
        label: "Bodyweight",
        imageUrl: "https://cdn.example/metadata.webp",
      },
    ]);
  });
});
