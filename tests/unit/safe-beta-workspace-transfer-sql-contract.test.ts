import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const migration = readRepoFile(
  "supabase",
  "migrations",
  "20260704123000_safe_beta_workspace_transfer.sql",
);

describe("safe beta workspace transfer SQL contract", () => {
  it("marks the source relationship transferred_out without deleting it", () => {
    expect(migration).toContain(
      "create or replace function public.pt_transfer_client_relationship",
    );
    expect(migration).toContain("relationship_status = 'transferred_out'");
    expect(migration).toContain("removed_at = coalesce");
    expect(migration).toContain("removed_by_user_id = coalesce");
    expect(migration).not.toContain("delete from public.clients");
    expect(migration).not.toContain("set workspace_id = null");
  });

  it("creates or reuses an active target relationship without copying delivery history", () => {
    expect(migration).toContain("v_target_relationship_status");
    expect(migration).toContain("relationship_status = 'active'");
    expect(migration).toContain(
      "perform public.reactivate_removed_client_relationship",
    );
    expect(migration).toContain("insert into public.clients");
    expect(migration).toContain("workspace_id = p_target_workspace_id");
    expect(migration).not.toContain("insert into public.assigned_workouts");
    expect(migration).not.toContain(
      "insert into public.assigned_nutrition_plans",
    );
    expect(migration).not.toContain("insert into public.checkins");
    expect(migration).not.toContain("insert into public.messages");
  });

  it("preserves account onboarding and profile continuity on the target relationship", () => {
    expect(migration).toContain(
      "perform public.sync_client_account_profile_fields(v_target_client_id)",
    );
    expect(migration).not.toContain("account_onboarding_completed_at = null");
  });

  it("requires explicit owner or admin access to both workspaces", () => {
    expect(migration).toContain(
      "v_source_context.role not in ('owner', 'admin')",
    );
    expect(migration).toContain(
      "v_target_context.role not in ('owner', 'admin')",
    );
    expect(migration).toContain("detail = 'CLIENT_TRANSFER_PERMISSION_DENIED'");
  });

  it("wires converted lead transfer through the safe transfer helper", () => {
    expect(migration).toContain("p_allow_transfer boolean default false");
    expect(migration).toContain("if v_transfer_requested then");
    expect(migration).toContain(
      "select transferred.target_client_id into v_target_client_id",
    );
    expect(migration).toContain("from public.pt_transfer_client_relationship(");
    expect(migration).toContain("converted_client_id = v_target_client_id");
    expect(migration).not.toContain("LEAD_TRANSFER_DISABLED_FOR_BETA");
  });
});
