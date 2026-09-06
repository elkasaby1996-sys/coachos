import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260703103000_co_coach_individual_workout_assignment.sql",
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

describe("co-coach individual workout assignment SQL contract", () => {
  it("moves individual workout assignment onto the delivery-write client permission model", () => {
    const body = functionBody(migration, "assign_workout_with_template");

    expect(body).toContain("public.can_write_client_delivery(p_client_id)");
    expect(body).toContain("Template not in client workspace");
    expect(body).toContain("insert into public.assigned_workouts");
    expect(body).not.toContain("wm.role::text like 'pt_%'");
    expect(body).not.toContain("from public.workspace_members wm");
  });

  it("keeps assignment cross-workspace safe", () => {
    const body = functionBody(migration, "assign_workout_with_template");

    expect(body).toContain("v_template_workspace_id <> v_client_workspace_id");
    expect(body).toContain(
      "raise exception 'Template not in client workspace'",
    );
  });

  it("does not require a workout template active flag that does not exist on workout templates", () => {
    const body = functionBody(migration, "assign_workout_with_template");

    expect(body).toContain("from public.workout_templates wt");
    expect(body).not.toContain("wt.is_active");
  });

  it("protects assigned workout exercise materialization with the same client delivery write guard", () => {
    const body = functionBody(
      migration,
      "materialize_assigned_workout_exercises",
    );

    expect(body).toContain("select aw.workout_template_id, aw.client_id");
    expect(body).toContain("public.can_write_client_delivery(v_client_id)");
    expect(body).toContain("raise exception 'Not authorized'");
    expect(body).toContain("delete from public.assigned_workout_exercises");
    expect(body).toContain("insert into public.assigned_workout_exercises");
  });

  it("does not alter role grants or broad client access helpers", () => {
    expect(migration).not.toContain(
      "insert into public.workspace_role_permissions",
    );
    expect(migration).not.toContain(
      "create or replace function public.can_access_client",
    );
    expect(migration).not.toContain(
      "create or replace function public.can_write_client_delivery",
    );
  });

  it("keeps the coach UI on the shared RPC path with existing edit gating", () => {
    expect(clientDetailPage).toContain("assign_workout_with_template");
    expect(clientDetailPage).toContain("if (!canEditClients) return;");
  });
});
