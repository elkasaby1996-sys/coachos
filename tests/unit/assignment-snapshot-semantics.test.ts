import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ASSIGNMENT_SNAPSHOT_NOTICE,
  ASSIGNMENT_SNAPSHOT_WARNING_TITLE,
  ASSIGNMENT_SNAPSHOT_TEST_CONTRACT,
  CHECKIN_ASSIGNMENT_NOTICE,
} from "../../src/lib/assignment-semantics";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), "utf8");

const clientDetailPage = readSource("src", "pages", "pt", "client-detail.tsx");
const workoutBuilderPage = readSource(
  "src",
  "pages",
  "pt",
  "workout-template-builder.tsx",
);
const programBuilderPage = readSource(
  "src",
  "pages",
  "pt",
  "program-builder.tsx",
);
const nutritionBuilderPage = readSource(
  "src",
  "pages",
  "pt",
  "nutrition-template-builder.tsx",
);
const baselineSql = readSource(
  "supabase",
  "migrations",
  "20260326084615_baseline_schema.sql",
);
const hardeningSql = readSource(
  "supabase",
  "migrations",
  "20260630130000_workspace_viewer_readonly_hardening.sql",
);

describe("assignment snapshot semantics", () => {
  it("documents the locked beta assignment semantics in a shared helper", () => {
    expect(ASSIGNMENT_SNAPSHOT_WARNING_TITLE).toBe(
      "Assigned clients will not update automatically.",
    );
    expect(ASSIGNMENT_SNAPSHOT_NOTICE).toBe(
      "Template edits affect future assignments only. Reassign this plan to update an assigned client.",
    );
    expect(ASSIGNMENT_SNAPSHOT_TEST_CONTRACT).toMatchObject({
      workouts: "snapshot",
      nutrition: "snapshot",
      checkins: "cadence-settings",
      templateEditsUpdateExistingAssignments: false,
      reassignmentUpdatesAssignedClients: true,
      sourceDeletionShouldPreserveSnapshots: true,
    });
  });

  it("surfaces snapshot copy on workout and program editing/assignment surfaces", () => {
    [workoutBuilderPage, programBuilderPage, clientDetailPage].forEach(
      (source) => {
        expect(source).toContain("assignment-snapshot-callout");
        expect(source).toContain("ASSIGNMENT_SNAPSHOT_WARNING_TITLE");
        expect(source).toContain("ASSIGNMENT_SNAPSHOT_NOTICE");
      },
    );
  });

  it("surfaces snapshot copy on nutrition editing/assignment surfaces", () => {
    [nutritionBuilderPage, clientDetailPage].forEach((source) => {
      expect(source).toContain("assignment-snapshot-callout");
      expect(source).toContain("ASSIGNMENT_SNAPSHOT_WARNING_TITLE");
      expect(source).toContain("ASSIGNMENT_SNAPSHOT_NOTICE");
    });
  });

  it("documents that template edits are not expected to mutate existing snapshots", () => {
    expect(baselineSql).toContain(
      'CREATE OR REPLACE TRIGGER "trg_assigned_workouts_sync_exercises" AFTER INSERT OR UPDATE OF "workout_template_id"',
    );
    expect(baselineSql).not.toContain(
      'AFTER UPDATE ON "public"."workout_template_exercises"',
    );
    expect(hardeningSql).toContain(
      "insert into public.assigned_nutrition_days",
    );
    expect(hardeningSql).toContain(
      "insert into public.assigned_nutrition_meals",
    );
    expect(hardeningSql).toContain(
      "insert into public.assigned_nutrition_meal_components",
    );
  });

  it("documents reassignment as the expected update path for existing clients", () => {
    expect(clientDetailPage).toContain("assign_program_to_client");
    expect(clientDetailPage).toContain("assign_workout_with_template");
    expect(clientDetailPage).toContain("assign_nutrition_template_to_client");
    expect(ASSIGNMENT_SNAPSHOT_NOTICE).toContain(
      "Reassign this plan to update an assigned client.",
    );
  });

  it("documents source deletion preservation where current snapshot behavior supports it", () => {
    expect(baselineSql).toContain("assigned_workout_exercises");
    expect(baselineSql).toContain("assigned_nutrition_meals");
    expect(baselineSql).toContain("assigned_nutrition_meal_components");
    expect(baselineSql).toContain(
      'REFERENCES "public"."nutrition_templates"("id") ON DELETE RESTRICT',
    );
  });

  it("documents that check-ins remain cadence/settings-driven", () => {
    expect(CHECKIN_ASSIGNMENT_NOTICE).toContain("cadence settings");
    expect(clientDetailPage).toContain("pt_update_client_checkin_settings");
    expect(hardeningSql).toContain("ensure_client_checkins");
    expect(hardeningSql).toContain("reconcile_client_checkins");
  });
});
