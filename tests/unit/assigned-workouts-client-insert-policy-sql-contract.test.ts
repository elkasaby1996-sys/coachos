import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("assigned_workouts client insert policy SQL contract", () => {
  const migration = readMigration(
    "20260412170000_fix_client_personal_workout_insert_rls.sql",
  );

  it("adds a dedicated client-owner insert policy", () => {
    expect(migration).toContain(
      "drop policy if exists assigned_workouts_insert_client on public.assigned_workouts",
    );
    expect(migration).toContain("create policy assigned_workouts_insert_client");
    expect(migration).toContain("on public.assigned_workouts");
    expect(migration).toContain("for insert");
    expect(migration).toContain("to authenticated");
  });

  it("scopes insert permissions to the actor's own client profile", () => {
    expect(migration).toContain("from public.clients c");
    expect(migration).toContain("c.id = assigned_workouts.client_id");
    expect(migration).toContain("c.user_id = auth.uid()");
  });
});
