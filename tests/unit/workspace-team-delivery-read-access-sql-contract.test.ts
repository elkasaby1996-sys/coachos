import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260509214500_workspace_team_delivery_read_access.sql",
  ),
  "utf8",
);

describe("workspace team delivery read access SQL contract", () => {
  it("patches delivery select policies to use assignment-aware client view access", () => {
    expect(migration).toContain(
      "drop policy if exists assigned_workouts_select on public.assigned_workouts",
    );
    expect(migration).toContain(
      "public.can_access_client(client_id, 'clients.view')",
    );
    expect(migration).toContain(
      "drop policy if exists awe_select_access on public.assigned_workout_exercises",
    );
    expect(migration).toContain(
      "public.can_access_client(aw.client_id, 'clients.view')",
    );
    expect(migration).toContain(
      "drop policy if exists client_programs_select_access on public.client_programs",
    );
    expect(migration).toContain(
      "public.can_access_client(client_id, 'clients.view')",
    );
    expect(migration).toContain(
      "drop policy if exists client_program_overrides_select_access on public.client_program_overrides",
    );
    expect(migration).toContain(
      "drop policy if exists assigned_nutrition_plans_select_access on public.assigned_nutrition_plans",
    );
    expect(migration).toContain(
      "drop policy if exists assigned_nutrition_days_select_access on public.assigned_nutrition_days",
    );
    expect(migration).toContain(
      "drop policy if exists assigned_nutrition_meals_select_access on public.assigned_nutrition_meals",
    );
    expect(migration).toContain(
      "drop policy if exists assigned_nutrition_meal_components_select_access on public.assigned_nutrition_meal_components",
    );
    expect(migration).toContain(
      "drop policy if exists client_program_assignments_select_access on public.client_program_assignments",
    );
  });

  it("lets invited workspace coaches read templates needed by nested delivery queries", () => {
    expect(migration).toContain(
      "drop policy if exists program_templates_pt_manage on public.program_templates",
    );
    expect(migration).toContain(
      "public.can_access_workspace(workspace_id)",
    );
    expect(migration).toContain(
      "drop policy if exists program_template_days_pt_manage on public.program_template_days",
    );
    expect(migration).toContain(
      "public.can_access_workspace(pt.workspace_id)",
    );
    expect(migration).toContain(
      "drop policy if exists workout_templates_select_access on public.workout_templates",
    );
    expect(migration).toContain(
      "public.can_access_workspace(workout_templates.workspace_id)",
    );
  });

  it("does not grant workspace settings management to associate coaches", () => {
    expect(migration).not.toContain("'team.manage'");
    expect(migration).not.toContain("public.can_manage_workspace_team");
    expect(migration).not.toContain("workspace_team_settings_summary");
  });
});
