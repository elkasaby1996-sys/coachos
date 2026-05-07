import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("client personal nutrition SQL contract", () => {
  const migration = readMigration(
    "20260413110000_unified_client_nutrition_personal_ownership.sql",
  );

  it("extends nutrition_templates with client ownership path", () => {
    expect(migration).toContain("add column if not exists owner_client_id uuid");
    expect(migration).toContain("alter column workspace_id drop not null");
    expect(migration).toContain("nutrition_templates_owner_path_check");
    expect(migration).toContain(
      "(workspace_id is null and owner_client_id is not null)",
    );
  });

  it("adds client manage policies for template family tables", () => {
    expect(migration).toContain("create policy nutrition_templates_client_manage_own");
    expect(migration).toContain(
      "create policy nutrition_template_days_client_manage_own",
    );
    expect(migration).toContain(
      "create policy nutrition_template_meals_client_manage_own",
    );
    expect(migration).toContain(
      "create policy nutrition_template_meal_components_client_manage_own",
    );
    expect(migration).toContain("public.is_client_owner(owner_client_id)");
  });

  it("updates assignment RPC for client self-assignment + personal auto-close only", () => {
    expect(migration).toContain(
      "create or replace function public.assign_nutrition_template_to_client",
    );
    expect(migration).toContain("v_actor_is_client_owner");
    expect(migration).toContain("v_template_owner_client_id");
    expect(migration).toContain("Auto-close only active personal plans owned by this client.");
    expect(migration).toContain("nt.owner_client_id = p_client_id");
    expect(migration).toContain("nt.workspace_id is null");
  });

  it("guards delete for used personal templates and keeps archive path", () => {
    expect(migration).toContain(
      "create or replace function public.guard_personal_nutrition_template_delete()",
    );
    expect(migration).toContain(
      "Used personal nutrition templates cannot be deleted. Archive this template instead.",
    );
    expect(migration).toContain(
      "create trigger guard_personal_nutrition_template_delete",
    );
  });
});
