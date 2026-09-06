import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WorkoutTemplateExerciseMutationResultError,
  assertWorkoutTemplateExerciseMutationResult,
  getWorkoutTemplateExerciseMutationMessage,
} from "../../src/lib/workout-template-exercise-mutations";

const read = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

describe("workout-template exercise affected-row assertions", () => {
  it("accepts exactly the intended single row", () => {
    expect(
      assertWorkoutTemplateExerciseMutationResult({
        operation: "edit",
        expectedIds: ["wte-a"],
        rows: [{ id: "wte-a" }],
      }),
    ).toEqual(["wte-a"]);
  });

  it("detects a nonexistent, stale, or RLS-filtered WTE id as zero rows", () => {
    expect(() =>
      assertWorkoutTemplateExerciseMutationResult({
        operation: "edit",
        expectedIds: ["missing-wte"],
        rows: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "WTE_ROW_NOT_UPDATED",
        expectedIds: ["missing-wte"],
        returnedIds: [],
      }),
    );
  });

  it("rejects an unexpected single-row identity", () => {
    expect(() =>
      assertWorkoutTemplateExerciseMutationResult({
        operation: "edit",
        expectedIds: ["wte-a"],
        rows: [{ id: "wte-b" }],
      }),
    ).toThrowError(expect.objectContaining({ code: "WTE_UNEXPECTED_ROW" }));
  });

  it("asserts the complete expected multi-row id set", () => {
    expect(
      assertWorkoutTemplateExerciseMutationResult({
        operation: "reorder",
        expectedIds: ["wte-a", "wte-b", "wte-c"],
        rows: [{ id: "wte-c" }, { id: "wte-a" }, { id: "wte-b" }],
      }),
    ).toEqual(["wte-c", "wte-a", "wte-b"]);

    expect(() =>
      assertWorkoutTemplateExerciseMutationResult({
        operation: "reorder",
        expectedIds: ["wte-a", "wte-b", "wte-c"],
        rows: [{ id: "wte-a" }, { id: "wte-c" }],
      }),
    ).toThrowError(expect.objectContaining({ code: "WTE_INCOMPLETE_UPDATE" }));
  });

  it("provides stable authorization, protection, incomplete, and database messages", () => {
    expect(
      getWorkoutTemplateExerciseMutationMessage({
        code: "42501",
        message: "permission denied",
      }),
    ).toContain("not authorized");
    expect(
      getWorkoutTemplateExerciseMutationMessage({
        code: "P0001",
        message: "This template is already assigned",
      }),
    ).toContain("active client delivery");
    expect(
      getWorkoutTemplateExerciseMutationMessage(
        new WorkoutTemplateExerciseMutationResultError({
          code: "WTE_INCOMPLETE_UPDATE",
          operation: "reorder",
          expectedIds: ["wte-a", "wte-b"],
          returnedIds: ["wte-a"],
        }),
      ),
    ).toContain("Some exercises were not saved");
    expect(
      getWorkoutTemplateExerciseMutationMessage({
        code: "08006",
        message: "connection failure",
      }),
    ).toContain("database or network error");
  });
});

describe("PR-EXLIB-07B builder and policy contracts", () => {
  const builder = read("src", "pages", "pt", "workout-template-builder.tsx");
  const migration = read(
    "supabase",
    "migrations",
    "20260901160000_workout_template_exercise_persistence_repair.sql",
  ).toLowerCase();

  it("returns NEW for allowed updates while retaining active-delivery protection", () => {
    expect(migration).toContain(
      "public.is_workout_template_in_active_delivery(old.workout_template_id)",
    );
    expect(migration).toContain("if tg_op = 'update' then");
    expect(migration).toContain("return new;");
    expect(migration).toContain("return old;");
  });

  it("updates, deletes, reorders, and groups by WTE id and requests returned ids", () => {
    for (const handlerName of [
      "handleEditSave",
      "handleBulkEditSave",
      "handleDelete",
      "handleDragEnd",
    ]) {
      const start = builder.indexOf(`const ${handlerName}`);
      const end = builder.indexOf("\n  };", start);
      const handler = builder.slice(start, end);
      expect(handler).toContain('.eq("id",');
      expect(handler).toContain('.select("id")');
      expect(handler).toContain("assertWorkoutTemplateExerciseMutationResult");
      expect(handler).not.toContain('.eq("exercise_id",');
    }
  });

  it("keeps prescription edits away from exercise identity", () => {
    const handler = builder.slice(
      builder.indexOf("const handleEditSave"),
      builder.indexOf("const handleBulkEditSave"),
    );
    expect(handler).toContain("sets:");
    expect(handler).toContain("reps:");
    expect(handler).toContain("rest_seconds:");
    expect(handler).toContain("tempo:");
    expect(handler).toContain("rpe:");
    expect(handler).toContain("video_url:");
    expect(handler).toContain("notes:");
    expect(handler).toContain("superset_group:");
    expect(handler).not.toContain("exercise_id:");
  });

  it("restores and refetches authoritative state after optimistic reorder failure", () => {
    const handler = builder.slice(
      builder.indexOf("const handleDragEnd"),
      builder.indexOf("const handleDragStart"),
    );
    expect(handler).toContain("const previousRows = exerciseRows");
    expect(handler).toContain("setExerciseRows(previousRows)");
    expect(handler).toContain("await templateExercisesQuery.refetch()");
    expect(handler).toContain("setActionError(");
  });
});
