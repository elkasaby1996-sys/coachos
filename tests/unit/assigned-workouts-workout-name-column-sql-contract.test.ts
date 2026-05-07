import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("assigned_workouts workout_name schema contract", () => {
  const migration = readMigration(
    "20260412173500_add_workout_name_to_assigned_workouts.sql",
  );

  it("adds workout_name when missing so client queries and triggers remain valid", () => {
    expect(migration).toContain("alter table public.assigned_workouts");
    expect(migration).toContain("add column if not exists workout_name text");
  });
});
