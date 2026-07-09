import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

const migration = readSource(
  "supabase",
  "migrations",
  "20260705124500_protect_assigned_template_deletes.sql",
);
const programsPage = readSource("src", "pages", "pt", "programs.tsx");
const programBuilderPage = readSource(
  "src",
  "pages",
  "pt",
  "program-builder.tsx",
);

describe("assigned template delete protection data integrity", () => {
  it("blocks active workout template deletes and child exercise rewrites", () => {
    expect(migration).toContain(
      "create or replace function public.is_workout_template_in_active_delivery",
    );
    expect(migration).toContain("from public.assigned_workouts aw");
    expect(migration).toContain(
      "aw.workout_template_id = p_workout_template_id",
    );
    expect(migration).toContain("aw.status = 'planned'");
    expect(migration).toContain("from public.client_program_overrides cpo");
    expect(migration).toContain(
      "prevent_assigned_workout_template_delete_trigger",
    );
    expect(migration).toContain(
      "prevent_assigned_workout_exercise_delete_trigger",
    );
    expect(migration).toContain(
      "prevent_assigned_workout_exercise_update_trigger",
    );
  });

  it("blocks active program template deletes before child days can be removed", () => {
    expect(migration).toContain(
      "create or replace function public.is_program_template_in_active_delivery",
    );
    expect(migration).toContain("from public.client_programs cp");
    expect(migration).toContain("cp.is_active = true");
    expect(migration).toContain("aw.program_id = p_program_template_id");
    expect(migration).toContain(
      "prevent_assigned_program_template_delete_trigger",
    );
    expect(migration).toContain("prevent_assigned_program_day_delete_trigger");
    expect(migration).toContain("prevent_assigned_program_day_update_trigger");
  });

  it("uses protected-delete copy from server-side guards", () => {
    expect(migration).toContain(
      "This template is already assigned to a client and cannot be deleted.",
    );
    expect(migration).toContain(
      "Existing client assignments prevent deletion. Historical records are preserved.",
    );
    expect(migration).toContain("using errcode = 'P0001'");
  });

  it("does not delete program child rows before deleting the parent template", () => {
    const handleDeleteStart = programsPage.indexOf(
      "const handleDelete = async",
    );
    const handleDeleteEnd = programsPage.indexOf("return (", handleDeleteStart);
    const handleDelete = programsPage.slice(handleDeleteStart, handleDeleteEnd);

    expect(handleDelete).toContain('.from("program_templates")');
    expect(handleDelete).not.toContain('.from("program_template_days")');
  });

  it("checks program layout protection before updating an existing assigned program", () => {
    expect(programBuilderPage).toContain(
      '"is_program_template_in_active_delivery"',
    );
    expect(programBuilderPage).toContain(
      "PROGRAM_LAYOUT_DELETE_PROTECTION_MESSAGE",
    );

    const protectionCheckIndex = programBuilderPage.indexOf(
      '"is_program_template_in_active_delivery"',
    );
    const updateIndex = programBuilderPage.indexOf(
      '.from("program_templates")',
      protectionCheckIndex,
    );
    expect(protectionCheckIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(protectionCheckIndex);
  });
});
