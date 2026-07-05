import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702140000_co_coach_delivery_library_access.sql",
  ),
  "utf8",
);

describe("co-coach delivery library access SQL contract", () => {
  it("adds explicit workspace-scoped read policies for workout and program library details", () => {
    expect(migration).toContain(
      "create policy workout_template_exercises_select_access",
    );
    expect(migration).toContain(
      "where wt.id = workout_template_exercises.workout_template_id",
    );
    expect(migration).toContain("public.can_access_workspace(wt.workspace_id)");

    expect(migration).toContain(
      "create policy program_templates_select_access",
    );
    expect(migration).toContain(
      "create policy program_template_days_select_access",
    );
    expect(migration).toContain("public.can_access_workspace(pt.workspace_id)");
  });

  it("adds explicit workspace-scoped read policies for nutrition library details", () => {
    for (const policyName of [
      "nutrition_templates_select_access",
      "nutrition_template_days_select_access",
      "nutrition_template_meals_select_access",
      "nutrition_template_meal_components_select_access",
    ]) {
      expect(migration).toContain(`create policy ${policyName}`);
    }

    expect(migration).toContain("public.can_access_workspace(workspace_id)");
    expect(migration).toContain("public.can_access_workspace(nt.workspace_id)");
    expect(migration).toContain("public.is_client_owner(nt.owner_client_id)");
  });

  it("adds explicit workspace-scoped read policies for check-in library details", () => {
    expect(migration).toContain(
      "create policy checkin_templates_select_access",
    );
    expect(migration).toContain(
      "create policy checkin_questions_select_access",
    );
    expect(migration).toContain("where ct.id = checkin_questions.template_id");
    expect(migration).toContain("public.can_access_workspace(ct.workspace_id)");
  });

  it("does not weaken delivery writes or assignment scoping", () => {
    expect(migration).not.toContain("grant 'delivery.manage'");
    expect(migration).not.toContain(
      "insert into public.workspace_role_permissions",
    );
    expect(migration).not.toContain(
      "create or replace function public.can_write_client_delivery",
    );
    expect(migration).not.toContain(
      "create or replace function public.can_access_client",
    );
    expect(migration).not.toContain("for all");
    expect(migration).not.toContain("for insert");
    expect(migration).not.toContain("for update");
    expect(migration).not.toContain("for delete");
  });
});
