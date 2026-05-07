import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260411193000_workspace_owner_membership_consistency.sql",
  ),
  "utf8",
);

describe("workspace owner membership consistency SQL contract", () => {
  it("allows workspace owners through is_pt_workspace_member checks", () => {
    expect(migration).toContain("create or replace function public.is_pt_workspace_member");
    expect(migration).toContain("from public.workspaces w");
    expect(migration).toContain("w.owner_user_id = v_user_id");
  });

  it("keeps owner workspace_members rows in sync via trigger", () => {
    expect(migration).toContain(
      "create or replace function public.sync_workspace_owner_membership()",
    );
    expect(migration).toContain(
      "create trigger workspace_owner_membership_sync_trigger",
    );
    expect(migration).toContain(
      "on conflict on constraint workspace_members_workspace_id_user_id_key do update",
    );
    expect(migration).toContain("set role = 'pt_owner'");
  });

  it("backfills missing owner memberships for existing workspaces", () => {
    expect(migration).toContain(
      "insert into public.workspace_members (workspace_id, user_id, role)",
    );
    expect(migration).toContain("from public.workspaces w");
    expect(migration).toContain("where w.owner_user_id is not null");
  });
});
