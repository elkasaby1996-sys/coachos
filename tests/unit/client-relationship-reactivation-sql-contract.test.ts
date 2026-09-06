import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const migration = readRepoFile(
  "supabase",
  "migrations",
  "20260704121500_reactivate_removed_client_relationships.sql",
);

describe("client relationship reactivation SQL contract", () => {
  it("centralizes removed relationship reactivation and clears removal metadata", () => {
    expect(migration).toContain(
      "create or replace function public.reactivate_removed_client_relationship",
    );
    expect(migration).toContain("relationship_status = 'active'");
    expect(migration).toContain("removed_at = null");
    expect(migration).toContain("removed_by_user_id = null");
    expect(migration).not.toContain("delete from public.clients");
  });

  it("does not let generic re-add reactivate transferred-out relationships", () => {
    expect(migration).toContain(
      "coalesce(v_relationship_status, 'active') = 'transferred_out'",
    );
    expect(migration).toContain(
      "detail = 'CLIENT_RELATIONSHIP_TRANSFERRED_OUT'",
    );
    expect(migration).toContain(
      "Use the dedicated transfer flow to reactivate a transferred client relationship.",
    );
  });

  it("invite acceptance reuses same-workspace client rows before standalone rows or inserts", () => {
    const tokenInviteStart = migration.indexOf(
      "create or replace function public.accept_invite(p_token text)",
    );
    const tokenInviteEnd = migration.indexOf(
      "create or replace function public.accept_invite(",
      tokenInviteStart + 1,
    );
    const tokenInvite = migration.slice(tokenInviteStart, tokenInviteEnd);

    const sameWorkspaceLookup = tokenInvite.indexOf(
      "where c.workspace_id = v_invite.workspace_id",
    );
    const reactivation = tokenInvite.indexOf(
      "perform public.reactivate_removed_client_relationship(v_client_id)",
    );
    const standaloneLookup = tokenInvite.indexOf(
      "where c.workspace_id is null",
    );
    const insertClient = tokenInvite.indexOf("insert into public.clients");

    expect(sameWorkspaceLookup).toBeGreaterThan(-1);
    expect(reactivation).toBeGreaterThan(sameWorkspaceLookup);
    expect(standaloneLookup).toBeGreaterThan(reactivation);
    expect(insertClient).toBeGreaterThan(standaloneLookup);
  });

  it("invite acceptance preserves account onboarding by updating existing rows only", () => {
    expect(migration).toContain("where c.id = v_client_id");
    expect(migration).toContain("relationship_status = 'active'");
    expect(migration).toContain("removed_at = null");
    expect(migration).toContain("removed_by_user_id = null");
    expect(migration).not.toContain("account_onboarding_completed_at = null");
  });

  it("lead approval reactivates same-workspace removed clients before creating rows", () => {
    const leadStart = migration.indexOf(
      "create or replace function public.pt_hub_approve_lead",
    );
    const leadFunction = migration.slice(leadStart);
    const sameWorkspaceLookup = leadFunction.indexOf(
      "where c.workspace_id = v_target_workspace_id",
    );
    const reactivation = leadFunction.indexOf(
      "perform public.reactivate_removed_client_relationship(v_target_client_id)",
    );
    const standaloneLookup = leadFunction.indexOf(
      "where c.workspace_id is null",
    );
    const insertClient = leadFunction.indexOf("insert into public.clients");

    expect(sameWorkspaceLookup).toBeGreaterThan(-1);
    expect(reactivation).toBeGreaterThan(sameWorkspaceLookup);
    expect(standaloneLookup).toBeGreaterThan(reactivation);
    expect(insertClient).toBeGreaterThan(standaloneLookup);
  });

  it("lead approval preserves history by keeping the same client id attached", () => {
    expect(migration).toContain("converted_client_id = v_target_client_id");
    expect(migration).toContain(
      "perform public.ensure_workspace_client_onboarding",
    );
    expect(migration).not.toContain("delete from public.assigned_workouts");
    expect(migration).not.toContain(
      "delete from public.assigned_nutrition_plans",
    );
    expect(migration).not.toContain("delete from public.checkins");
    expect(migration).not.toContain("delete from public.messages");
  });
});
