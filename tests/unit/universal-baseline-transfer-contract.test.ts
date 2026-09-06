import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const migration = readRepoFile(
  "supabase",
  "migrations",
  "20260704131500_universal_baseline_transfer_continuity.sql",
);

describe("universal baseline transfer continuity SQL contract", () => {
  it("tracks copied baseline rows by canonical source id for idempotent transfer", () => {
    expect(migration).toContain(
      "add column if not exists universal_source_baseline_id uuid",
    );
    expect(migration).toContain(
      "baseline_entries_client_universal_source_uidx",
    );
    expect(migration).toContain(
      "coalesce(source_baseline.universal_source_baseline_id, source_baseline.id)",
    );
  });

  it("copies only universal baseline data to the explicit transfer target", () => {
    expect(migration).toContain(
      "create or replace function public.copy_client_universal_baseline_data",
    );
    expect(migration).toContain("insert into public.baseline_entries");
    expect(migration).toContain("insert into public.baseline_metrics");
    expect(migration).toContain("insert into public.baseline_marker_values");
    expect(migration).toContain("insert into public.baseline_photos");
    expect(migration).toContain(
      "insert into public.baseline_entry_marker_templates",
    );
    expect(migration).toContain("v_target_client.workspace_id");
  });

  it("updates existing target baseline rows instead of duplicating transfer-back data", () => {
    expect(migration).toContain("v_existing_target_baseline_id");
    expect(migration).toContain(
      "universal_source_baseline_id = v_canonical_baseline_id",
    );
    expect(migration).toContain("be.id = v_canonical_baseline_id");
    expect(migration).toContain("on conflict (baseline_id) do update");
    expect(migration).toContain(
      "on conflict (baseline_id, template_id) do update",
    );
    expect(migration).toContain(
      "on conflict (baseline_id, photo_type) do update",
    );
  });

  it("wires explicit safe transfer through baseline continuity after target activation", () => {
    expect(migration).toContain(
      "perform public.copy_client_universal_baseline_data(v_source.id, v_target_client_id)",
    );
    expect(migration).toContain(
      "perform public.sync_client_account_profile_fields(v_target_client_id)",
    );
  });

  it("does not copy workspace-specific delivery, messages, check-ins, or onboarding rows", () => {
    const forbiddenTables = [
      "assigned_workouts",
      "assigned_nutrition_plans",
      "client_programs",
      "checkins",
      "messages",
      "conversations",
      "workspace_client_onboardings",
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
});
