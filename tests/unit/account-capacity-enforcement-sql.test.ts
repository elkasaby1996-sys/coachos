import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  "supabase/migrations/20260910160000_atomic_capacity_enforcement.sql",
  "utf8",
);
describe("atomic capacity SQL contract", () => {
  it("extends the canonical reservations and locks accounts in UUID order", () => {
    expect(sql).toContain("admission_transaction_id=pg_current_xact_id()");
    expect(sql).toContain("order by a.id for update");
    expect(sql).toContain("public.reserve_account_capacity(");
    expect(sql).toContain("public.consume_account_capacity_reservation(");
    expect(sql).toContain("interval '30 seconds'");
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).not.toMatch(
      /create table|set_config|current_setting|enabledFeatureKeys|execute format/i,
    );
  });
  it.each([
    "clients",
    "workspaces",
    "workspace_members",
    "workspace_member_invites",
    "pt_packages",
  ])("guards all %s writes and consumes after mutation", (table) => {
    expect(sql).toContain(
      `before insert or update or delete on public.${table}`,
    );
    expect(sql).toContain(`after insert or update on public.${table}`);
  });
  it.each([
    "create_workspace",
    "accept_invite",
    "pt_update_client_lifecycle",
    "pt_archive_client_relationship",
    "reactivate_removed_client_relationship",
    "pt_transfer_client_relationship",
    "pt_hub_approve_lead",
    "create_workspace_team_invite",
    "accept_workspace_team_invite",
    "accept_workspace_team_invite_by_id",
    "update_workspace_team_member_status",
  ])("redefines and explicitly protects %s", (name) => {
    expect(sql).toContain(`create or replace function public.${name}(`);
    expect(sql).toContain(`revoke all on function public.${name}(`);
  });
  it("closes direct package writes and internal reactivation execution", () => {
    expect(sql).toContain(
      "revoke insert, update on public.pt_packages from public, anon, authenticated",
    );
    expect(sql).toContain(
      "public.reactivate_removed_client_relationship_internal(uuid) from public,anon,authenticated",
    );
    expect(sql).toContain(
      "create function public.create_my_pt_package(p_input jsonb)",
    );
    expect(sql).toContain(
      "create function public.update_my_pt_package(p_package_id uuid,p_input jsonb)",
    );
  });
  it("reserves both lead dimensions before the new workspace and propagates denials", () => {
    const lead = sql.slice(
      sql.indexOf("create or replace function public.pt_hub_approve_lead"),
    );
    expect(lead.indexOf("'active_workspaces','workspace:'")).toBeLessThan(
      lead.indexOf("insert into public.workspaces"),
    );
    expect(lead.indexOf("'counted_clients','user:'")).toBeLessThan(
      lead.indexOf("insert into public.workspaces"),
    );
    expect(lead).toContain(
      "if v_new_workspace or sqlerrm='Account capacity admission failed.' then raise;",
    );
  });
  it("changes no catalogue capacities or domain history", () => {
    expect(sql).not.toMatch(
      /update public\.commercial_|delete from public\.account_|cron\.|billing_provider/,
    );
    const functions = [
      ...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g),
    ];
    expect(sql.match(/set search_path/g)).toHaveLength(functions.length);
  });
});
