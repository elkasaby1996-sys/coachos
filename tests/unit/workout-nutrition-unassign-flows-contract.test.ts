import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260703100000_workout_nutrition_unassign_flows.sql",
  ),
  "utf8",
);

const clientDetailPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "client-detail.tsx"),
  "utf8",
);

const clientNutritionPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "nutrition.tsx"),
  "utf8",
);

const clientHomePage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "home.tsx"),
  "utf8",
);

const compactMigration = migration.replace(/\s+/g, " ");

const getFunctionBody = (source: string, functionName: string) => {
  const start = source.indexOf(`function ${functionName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
};

describe("workout and nutrition unassign SQL contract", () => {
  it("adds a trusted nutrition unassign RPC that cancels active coach-assigned plans", () => {
    expect(migration).toContain(
      "create or replace function public.unassign_client_nutrition_plan",
    );
    expect(migration).toContain("public.can_write_client_delivery(p_client_id)");
    expect(migration).toContain("status = 'cancelled'");
    expect(migration).toContain("ap.status = 'active'");
    expect(migration).toContain("nt.workspace_id is not null");
    expect(migration).toContain("nt.owner_client_id is null");
    expect(migration).toContain(
      "grant execute on function public.unassign_client_nutrition_plan(uuid, uuid)",
    );
  });

  it("preserves nutrition snapshot child rows and source templates", () => {
    expect(migration).not.toContain("delete from public.assigned_nutrition_days");
    expect(migration).not.toContain("delete from public.assigned_nutrition_meals");
    expect(migration).not.toContain(
      "delete from public.assigned_nutrition_meal_components",
    );
    expect(migration).not.toContain("delete from public.nutrition_templates");
  });

  it("does not weaken role permissions or client assignment scoping", () => {
    expect(migration).not.toContain("insert into public.workspace_role_permissions");
    expect(migration).not.toContain(
      "create or replace function public.can_write_client_delivery",
    );
    expect(migration).not.toContain(
      "create or replace function public.can_access_client",
    );
  });

  it("returns a no-op result when there is no matching active coach nutrition assignment", () => {
    expect(compactMigration).toContain(
      "select null::uuid, 0::integer where not exists",
    );
  });
});

describe("workout and nutrition unassign UI contract", () => {
  it("coach client detail exposes a clear nutrition remove-assignment action", () => {
    const nutritionTab = getFunctionBody(clientDetailPage, "PtClientNutritionTab");

    expect(clientDetailPage).toContain("unassign_client_nutrition_plan");
    expect(nutritionTab).toContain("const [nutritionUnassignStatus");
    expect(nutritionTab).toContain("setNutritionUnassignStatus");
    expect(clientDetailPage).toContain("Remove assignment");
    expect(clientDetailPage).toContain(
      "This will remove the current coach nutrition assignment for this client.",
    );
    expect(clientDetailPage).toContain(
      'queryKey: ["pt-client-active-nutrition-plan", clientId]',
    );
  });

  it("client and coach current nutrition views continue to exclude unassigned plans", () => {
    expect(clientNutritionPage).toContain('.eq("status", "active")');
    expect(clientHomePage).toContain('.eq("status", "active")');
    expect(clientDetailPage).toContain('.eq("status", "active")');
  });

  it("program unassign preserves completed workout history", () => {
    expect(clientDetailPage).toContain('.from("assigned_workouts")');
    expect(clientDetailPage).toContain('.neq("status", "completed")');
    expect(clientDetailPage).toContain("Unassign program");
  });
});
