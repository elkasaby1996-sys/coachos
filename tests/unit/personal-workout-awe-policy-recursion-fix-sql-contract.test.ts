import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("awe_insert_client recursion fix SQL contract", () => {
  const migration = readMigration(
    "20260412193000_fix_personal_workout_awe_insert_policy_recursion.sql",
  );

  it("redefines awe_insert_client without exercises table dependency", () => {
    expect(migration).toContain(
      "drop policy if exists awe_insert_client on public.assigned_workout_exercises",
    );
    expect(migration).toContain("create policy awe_insert_client");
    expect(migration).toContain("on public.assigned_workout_exercises");
    expect(migration).toContain("for insert");
    expect(migration).toContain("from public.assigned_workouts aw");
    expect(migration).toContain("join public.clients c on c.id = aw.client_id");
    expect(migration).toContain("c.user_id = auth.uid()");
    expect(migration).not.toContain("from public.exercises");
  });
});
