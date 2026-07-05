import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260704110000_account_level_onboarding_continuity.sql",
  ),
  "utf8",
);

describe("account-level client onboarding continuity SQL contract", () => {
  it("adds a same-user sync helper for safe account profile fields", () => {
    expect(migration).toContain(
      "create or replace function public.sync_client_account_profile_fields",
    );
    expect(migration).toContain("where c.user_id = v_target.user_id");
    expect(migration).toContain("c.id <> v_target.id");
    expect(migration).toContain("account_onboarding_completed_at = coalesce");
    expect(migration).toContain("date_of_birth = coalesce");
    expect(migration).toContain("weight_value_current = coalesce");
  });

  it("copies account defaults when a client row is inserted or attached to a workspace", () => {
    expect(migration).toContain(
      "create or replace function public.apply_client_account_profile_defaults",
    );
    expect(migration).toContain(
      "before insert or update of user_id, workspace_id on public.clients",
    );
    expect(migration).toContain(
      "execute function public.apply_client_account_profile_defaults()",
    );
  });

  it("keeps ensure_client_profile user-level by syncing from other client rows", () => {
    expect(migration).toContain(
      "create or replace function public.ensure_client_profile",
    );
    expect(migration).toContain(
      "case when c.account_onboarding_completed_at is not null then 0 else 1 end",
    );
    expect(migration).toContain(
      "v_row := public.sync_client_account_profile_fields(v_row.id)",
    );
  });

  it("backfills existing duplicate user rows without copying delivery history", () => {
    expect(migration).toContain("with source_candidates as (");
    expect(migration).toContain("update public.clients c");
    expect(migration).toContain("from source_candidates source");
    expect(migration).toContain("source.target_id = c.id");

    const forbiddenDeliveryTables = [
      "assigned_workouts",
      "assigned_nutrition_plans",
      "client_programs",
      "checkins",
      "conversations",
      "messages",
      "workout_logs",
      "nutrition_day_logs",
      "habit_logs",
    ];

    for (const table of forbiddenDeliveryTables) {
      expect(migration).not.toContain(`update public.${table}`);
      expect(migration).not.toContain(`insert into public.${table}`);
    }
  });
});
