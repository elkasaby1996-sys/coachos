import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const migration = readRepoFile(
  "supabase",
  "migrations",
  "20260704133000_universal_onboarding_transfer_continuity.sql",
);

const clientOnboardingHook = readRepoFile(
  "src",
  "features",
  "client-onboarding",
  "hooks",
  "use-client-onboarding.ts",
);

const ptClientDetail = readRepoFile("src", "pages", "pt", "client-detail.tsx");

describe("universal onboarding transfer continuity contract", () => {
  it("identifies workspace_client_onboardings as the current intake answer store", () => {
    expect(clientOnboardingHook).toContain(
      '.from("workspace_client_onboardings")',
    );
    expect(ptClientDetail).toContain('.from("workspace_client_onboardings")');

    for (const section of [
      "basics",
      "goals",
      "training_history",
      "injuries_limitations",
      "nutrition_lifestyle",
      "step_state",
    ]) {
      expect(clientOnboardingHook).toContain(section);
    }
  });

  it("copies only universal intake/profile answer columns to the transfer target", () => {
    expect(migration).toContain(
      "create or replace function public.copy_client_universal_onboarding_data",
    );

    for (const column of [
      "basics",
      "goals",
      "training_history",
      "injuries_limitations",
      "nutrition_lifestyle",
      "step_state",
      "submitted_at",
    ]) {
      expect(migration).toContain(column);
    }

    expect(migration).toContain("v_target_client.workspace_id");
    expect(migration).toContain("wco.client_id = p_source_client_id");
  });

  it("creates or updates the target workspace onboarding row idempotently", () => {
    expect(migration).toContain("on conflict (workspace_id, client_id) do update");
    expect(migration).toContain("copy_client_universal_onboarding_data");
    expect(migration).toContain("p_source_client_id uuid");
    expect(migration).toContain("p_target_client_id uuid");
  });

  it("does not copy workspace-specific onboarding delivery, review, or coach fields", () => {
    for (const forbidden of [
      "coach_review_notes = source_onboarding.coach_review_notes",
      "first_program_template_id = source_onboarding.first_program_template_id",
      "first_program_applied_at = source_onboarding.first_program_applied_at",
      "first_checkin_template_id = source_onboarding.first_checkin_template_id",
      "first_checkin_date = source_onboarding.first_checkin_date",
      "first_checkin_scheduled_at = source_onboarding.first_checkin_scheduled_at",
      "reviewed_by_user_id = source_onboarding.reviewed_by_user_id",
      "reviewed_at = source_onboarding.reviewed_at",
      "activated_at = source_onboarding.activated_at",
      "completed_at = source_onboarding.completed_at",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });

  it("keeps delivery, check-in, message, and log tables out of onboarding transfer", () => {
    const forbiddenTables = [
      "assigned_workouts",
      "assigned_nutrition_plans",
      "client_programs",
      "checkins",
      "messages",
      "conversations",
      "workout_sessions",
      "workout_set_logs",
      "nutrition_day_logs",
      "habit_logs",
    ];

    for (const table of forbiddenTables) {
      expect(migration).not.toContain(`insert into public.${table}`);
      expect(migration).not.toContain(`update public.${table}`);
    }
  });

  it("wires explicit safe transfer through account, baseline, and onboarding continuity", () => {
    expect(migration).toContain(
      "perform public.sync_client_account_profile_fields(v_target_client_id)",
    );
    expect(migration).toContain(
      "perform public.copy_client_universal_baseline_data(v_source.id, v_target_client_id)",
    );
    expect(migration).toContain(
      "perform public.copy_client_universal_onboarding_data(v_source.id, v_target_client_id)",
    );
  });

  it("does not broaden frontend reads across transferred_out or removed relationships", () => {
    expect(clientOnboardingHook).toContain(
      '(row.relationship_status ?? "active") === "active"',
    );
    expect(ptClientDetail).toContain('.eq("workspace_id", workspaceQuery.data ?? "")');
    expect(ptClientDetail).toContain('.eq("client_id", clientId ?? "")');
    expect(migration).not.toContain("relationship_status in ('active', 'transferred_out'");
    expect(migration).not.toContain("relationship_status <> 'removed'");
  });
});
