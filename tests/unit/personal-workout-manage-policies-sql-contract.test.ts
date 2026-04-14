import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("personal workout manage policies SQL contract", () => {
  const migration = readMigration(
    "20260412203000_enable_client_personal_workout_manage_policies.sql",
  );

  it("allows client delete on personal assigned_workouts only", () => {
    expect(migration).toContain(
      "create policy assigned_workouts_delete_client_personal",
    );
    expect(migration).toContain("on public.assigned_workouts");
    expect(migration).toContain("for delete");
    expect(migration).toContain("c.user_id = auth.uid()");
    expect(migration).toContain("assigned_workouts.workout_template_id is null");
    expect(migration).toContain("assigned_workouts.program_id is null");
  });

  it("allows client delete on personal assigned_workout_exercises only", () => {
    expect(migration).toContain("create policy awe_delete_client");
    expect(migration).toContain("on public.assigned_workout_exercises");
    expect(migration).toContain("aw.id = assigned_workout_exercises.assigned_workout_id");
    expect(migration).toContain("c.user_id = auth.uid()");
    expect(migration).toContain("aw.workout_template_id is null");
    expect(migration).toContain("aw.program_id is null");
  });
});
