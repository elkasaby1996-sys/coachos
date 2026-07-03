import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260703110000_one_day_workout_override_persistence.sql",
  ),
  "utf8",
);

const clientDetailPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "client-detail.tsx"),
  "utf8",
);

const functionBody = (source: string, functionName: string) => {
  const match = source.match(
    new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  expect(match, `missing function ${functionName}`).not.toBeNull();
  return match?.[0] ?? "";
};

describe("one-day workout override persistence SQL contract", () => {
  it("adds a trusted RPC for saving one program-day override", () => {
    const body = functionBody(migration, "save_client_program_day_override");

    expect(body).toContain("p_client_program_id uuid");
    expect(body).toContain("p_override_date date");
    expect(body).toContain("p_workout_template_id uuid");
    expect(body).toContain("p_is_rest boolean");
    expect(body).toContain("returns uuid");
  });

  it("uses delivery-write permissions and blocks cross-workspace workout templates", () => {
    const body = functionBody(migration, "save_client_program_day_override");

    expect(body).toContain("public.can_write_client_delivery(v_client_id)");
    expect(body).toContain("v_template_workspace_id <> v_workspace_id");
    expect(body).toContain("raise exception 'Template not in client workspace'");
  });

  it("persists the override without creating a new active client_programs row", () => {
    const body = functionBody(migration, "save_client_program_day_override");

    expect(body).toContain("insert into public.client_program_overrides");
    expect(body).toContain("on conflict (client_program_id, override_date)");
    expect(body).not.toContain("insert into public.client_programs");
    expect(body).not.toContain("set is_active = false");
  });

  it("rematerializes only the affected assigned workout date", () => {
    const body = functionBody(migration, "save_client_program_day_override");

    expect(body).toContain("where aw.client_id = v_client_id");
    expect(body).toContain("and aw.scheduled_date = p_override_date");
    expect(body).toContain(
      "perform public.materialize_assigned_workout_exercises(v_assigned_workout_id)",
    );
    expect(body).not.toContain("for v_i in");
  });

  it("prevents duplicate non-completed assigned workouts for the override date", () => {
    const body = functionBody(migration, "save_client_program_day_override");

    expect(body).toContain("delete from public.assigned_workouts aw");
    expect(body).toContain("aw.id <> v_assigned_workout_id");
    expect(body).toContain("aw.status <> 'completed'");
  });

  it("moves the UI save path off apply_program_to_client", () => {
    const saveHandlerStart = clientDetailPage.indexOf(
      "const handleSaveOverride = async () =>",
    );
    const saveHandlerEnd = clientDetailPage.indexOf(
      "const handleStatusUpdate = async",
      saveHandlerStart,
    );
    const saveHandler = clientDetailPage.slice(saveHandlerStart, saveHandlerEnd);

    expect(saveHandler).toContain("save_client_program_day_override");
    expect(saveHandler).not.toContain("apply_program_to_client");
    expect(saveHandler).not.toContain("client_program_overrides\").upsert");
  });
});
