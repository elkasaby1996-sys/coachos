import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("personal workout creation chain SQL contract", () => {
  const migration = readMigration(
    "20260412191000_enable_client_personal_workout_creation_chain.sql",
  );

  it("enables client-owned exercise insertion and selection", () => {
    expect(migration).toContain("create policy exercises_insert_client_own");
    expect(migration).toContain("on public.exercises");
    expect(migration).toContain("owner_user_id = auth.uid()");
    expect(migration).toContain("workspace_id is null");
    expect(migration).toContain("create policy exercises_select_own");
  });

  it("enables client insert into assigned_workout_exercises for owned workouts only", () => {
    expect(migration).toContain("create policy awe_insert_client");
    expect(migration).toContain("on public.assigned_workout_exercises");
    expect(migration).toContain("from public.assigned_workouts aw");
    expect(migration).toContain("join public.clients c on c.id = aw.client_id");
    expect(migration).toContain("c.user_id = auth.uid()");
  });
});
