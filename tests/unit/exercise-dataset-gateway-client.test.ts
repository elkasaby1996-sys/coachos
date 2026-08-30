import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("../../src/lib/supabase", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  ExerciseDatasetError,
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
      }),
    ).rejects.toMatchObject<Partial<ExerciseDatasetError>>({
      code: "provider_rate_limited",
      message:
        "The exercise provider rate-limited this request. Wait a moment and try again.",
    });
  });
});
