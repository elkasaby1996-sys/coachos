import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260703112000_individual_workout_same_day_replacement.sql",
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

describe("individual workout same-day conflict contract", () => {
  it("routes active program dates through the one-day override RPC", () => {
    const body = functionBody(migration, "assign_workout_with_template");

    expect(body).toContain("v_active_client_program_id");
    expect(body).toContain("public.save_client_program_day_override");
    expect(body).not.toContain("insert into public.client_programs");
  });

  it("replaces existing non-completed same-day assignments instead of duplicating", () => {
    const body = functionBody(migration, "assign_workout_with_template");

    expect(body).toContain("where aw.client_id = p_client_id");
    expect(body).toContain("and aw.scheduled_date = p_scheduled_date");
    expect(body).toContain("and aw.status <> 'completed'");
    expect(body).toContain("delete from public.assigned_workouts aw");
    expect(body).toContain("aw.id <> v_assigned_workout_id");
  });

  it("rematerializes replacement workout exercises for the effective date", () => {
    const body = functionBody(migration, "assign_workout_with_template");

    expect(body).toContain(
      "perform public.materialize_assigned_workout_exercises(v_assigned_workout_id)",
    );
  });

  it("keeps delivery-write and cross-workspace protections", () => {
    const body = functionBody(migration, "assign_workout_with_template");

    expect(body).toContain("public.can_write_client_delivery(p_client_id)");
    expect(body).toContain("v_template_workspace_id <> v_client_workspace_id");
  });

  it("warns before replacing an existing same-day workout in the coach UI", () => {
    const handlerStart = clientDetailPage.indexOf(
      "const handleAssignWorkout = async () =>",
    );
    const handlerEnd = clientDetailPage.indexOf(
      "const handleApplyProgram = async () =>",
      handlerStart,
    );
    const handler = clientDetailPage.slice(handlerStart, handlerEnd);

    expect(handler).toContain("This date already has a workout");
    expect(handler).toContain("window.confirm");
    expect(handler).toContain("sameDayWorkout");
  });
});
