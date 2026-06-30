import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

function readOptionalSource(...segments: string[]) {
  const path = resolve(process.cwd(), ...segments);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function functionBody(source: string, functionName: string) {
  const marker = `create or replace function public.${functionName}`;
  const start = source.indexOf(marker);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);

  const next = source.indexOf(
    "\ncreate or replace function public.",
    start + 1,
  );
  const grant = source.indexOf("\ngrant ", start + 1);
  const revoke = source.indexOf("\nrevoke ", start + 1);
  const candidates = [next, grant, revoke].filter((index) => index > start);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

const accessSql = readSource(
  "supabase",
  "migrations",
  "20260509173000_workspace_team_access_permissions.sql",
);

const hardeningSql = readOptionalSource(
  "supabase",
  "migrations",
  "20260630130000_workspace_viewer_readonly_hardening.sql",
);

describe("workspace team viewer read-only hardening", () => {
  it("keeps viewer out of every write permission used by delivery hardening", () => {
    const rolePermissions = functionBody(
      accessSql,
      "workspace_role_permissions",
    );
    const viewerBlock = rolePermissions.slice(
      rolePermissions.indexOf("when 'viewer' then array["),
      rolePermissions.indexOf("else '{}'::text[]"),
    );

    expect(viewerBlock).toContain("'clients.view'");
    expect(viewerBlock).not.toContain("'clients.edit'");
    expect(viewerBlock).not.toContain("'delivery.manage'");
    expect(viewerBlock).not.toContain("'team.manage'");
    expect(viewerBlock).not.toContain("'workspace.danger.manage'");
  });

  it("hardens client-bound delivery writes with assigned-client edit permission", () => {
    expect(hardeningSql).toContain(
      "create or replace function public.can_write_client_delivery",
    );
    expect(hardeningSql).toContain(
      "public.can_access_client(p_client_id, 'clients.edit')",
    );

    for (const policyName of [
      "assigned_workouts_insert_pt",
      "assigned_workouts_update",
      "assigned_workouts_delete_pt",
      "client_programs_insert_pt",
      "client_programs_update_pt",
      "client_programs_delete_pt",
      "assigned_nutrition_plans_insert_pt",
      "assigned_nutrition_plans_update_pt",
      "assigned_nutrition_plans_delete_pt",
    ]) {
      expect(hardeningSql).toContain(`create policy ${policyName}`);
    }

    expect(hardeningSql).toContain("public.can_write_client_delivery(client_id)");
    expect(hardeningSql).toContain(
      "public.can_write_client_delivery(assigned_workouts.client_id)",
    );
    expect(hardeningSql).toContain(
      "public.can_write_client_delivery(client_programs.client_id)",
    );
    expect(hardeningSql).toContain(
      "public.can_write_client_delivery(assigned_nutrition_plans.client_id)",
    );
  });

  it("hardens workspace-level template writes with delivery.manage", () => {
    expect(hardeningSql).toContain(
      "create or replace function public.can_manage_workspace_delivery",
    );
    expect(hardeningSql).toContain("'delivery.manage'");

    for (const policyName of [
      "workout_templates_insert_pt",
      "workout_templates_update_pt",
      "workout_templates_delete_pt",
      "workout_template_exercises_pt_manage",
      "nutrition_templates_manage_access",
      "nutrition_template_days_manage_access",
      "nutrition_template_meals_manage_access",
      "nutrition_template_meal_components_manage_access",
      "checkin_templates_pt_manage",
    ]) {
      expect(hardeningSql).toContain(`create policy ${policyName}`);
    }

    expect(hardeningSql).toContain(
      "public.can_manage_workspace_delivery(workspace_id)",
    );
    expect(hardeningSql).toContain(
      "public.can_manage_workspace_delivery(workout_templates.workspace_id)",
    );
  });

  it("hardens delivery RPCs that bypass table RLS through security definer", () => {
    expect(functionBody(hardeningSql, "assign_program_to_client")).toContain(
      "public.can_write_client_delivery(p_client_id)",
    );
    expect(
      functionBody(hardeningSql, "assign_nutrition_template_to_client"),
    ).toContain("public.can_write_client_delivery(p_client_id)");
    expect(functionBody(hardeningSql, "review_checkin")).toContain(
      "public.can_write_client_delivery(v_client_id)",
    );
    expect(functionBody(hardeningSql, "ensure_workspace_checkins")).toContain(
      "not public.can_manage_workspace_delivery(p_workspace_id)",
    );
  });

  it("wires the main PT write pages to workspace write permissions", () => {
    const hookSource = readSource(
      "src",
      "features",
      "workspace-team",
      "use-workspace-write-access.ts",
    );

    expect(hookSource).toContain("workspace_access_context");
    expect(hookSource).toContain('hasWorkspacePermission(context, "clients.edit")');
    expect(hookSource).toContain(
      'hasWorkspacePermission(context, "delivery.manage")',
    );

    for (const page of [
      ["src", "pages", "pt", "workout-templates.tsx"],
      ["src", "pages", "pt", "programs.tsx"],
      ["src", "pages", "pt", "program-builder.tsx"],
      ["src", "pages", "pt", "nutrition.tsx"],
      ["src", "pages", "pt", "checkin-templates.tsx"],
      ["src", "pages", "pt", "client-detail.tsx"],
    ]) {
      expect(readSource(...page)).toContain("useWorkspaceWriteAccess");
    }
  });
});
