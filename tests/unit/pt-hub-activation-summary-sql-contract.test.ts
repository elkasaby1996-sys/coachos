import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702120000_pt_hub_activation_summary.sql",
  ),
  "utf8",
);

describe("PT Hub activation summary SQL contract", () => {
  it("creates an authenticated PT activation summary RPC", () => {
    expect(migration).toContain(
      "create or replace function public.pt_hub_activation_summary",
    );
    expect(migration).toContain("v_user_id := auth.uid()");
    expect(migration).toContain("if v_user_id is null then");
    expect(migration).toContain("raise exception 'Not authenticated'");
    expect(migration).toContain(
      "grant execute on function public.pt_hub_activation_summary(uuid) to authenticated",
    );
  });

  it("selects a deterministic activation workspace without arbitrary client input", () => {
    expect(migration).toContain("p_workspace_id uuid default null");
    expect(migration).toContain("eligible_workspaces as (");
    expect(migration).toContain("w.owner_user_id = v_user_id");
    expect(migration).toContain("wm.user_id = v_user_id");
    expect(migration).toContain("public.normalize_workspace_role");
    expect(migration).toContain("order by");
    expect(migration).toContain("ew.created_at asc nulls last");
    expect(migration).toContain(
      "if p_workspace_id is not null and v_activation_workspace_id is null then",
    );
    expect(migration).not.toContain("p_client_id");
  });

  it("returns only booleans, counts, and safe routing identifiers", () => {
    expect(migration).toContain("workspace_exists boolean");
    expect(migration).toContain("activation_workspace_id uuid");
    expect(migration).toContain("activation_workspace_slug text");
    expect(migration).toContain("first_client_id uuid");
    expect(migration).toContain("client_count integer");
    expect(migration).not.toContain("display_name");
    expect(migration).not.toContain("goal_summary");
    expect(migration).not.toContain("last_message");
  });

  it("uses exists-style checks for delivery and team milestones", () => {
    expect(migration).toContain("exists (");
    expect(migration).toContain("from public.assigned_workouts aw");
    expect(migration).toContain("from public.assigned_nutrition_plans anp");
    expect(migration).toContain("c.checkin_template_id is not null");
    expect(migration).toContain(
      "from public.workspace_client_onboardings wco",
    );
    expect(migration).toContain("from public.checkins ci");
    expect(migration).toContain("from public.workspace_members wm");
    expect(migration).toContain("from public.workspace_member_invites wmi");
    expect(migration).toContain("limit 1");
  });

  it("does not count viewer access as coach activation access", () => {
    expect(migration).toContain("'assistant_coach'");
    expect(migration).not.toContain("'viewer'");
  });
});
