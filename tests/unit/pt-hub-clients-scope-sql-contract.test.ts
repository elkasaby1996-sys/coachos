import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260412121500_align_pt_hub_clients_scope_with_pt_membership.sql",
  ),
  "utf8",
);

describe("PT Hub clients scope SQL contract", () => {
  it("scopes pt_hub_clients_page by PT-owned or PT-member workspaces", () => {
    expect(migration).toContain("create or replace function public.pt_hub_clients_page");
    expect(migration).toContain("with pt_workspaces as (");
    expect(migration).toContain("wm.role::text like 'pt_%'");
    expect(migration).toContain("if p_workspace_id is not null and not public.is_pt_workspace_member(p_workspace_id) then");
  });

  it("scopes pt_hub_client_stats by PT-owned or PT-member workspaces", () => {
    expect(migration).toContain("create or replace function public.pt_hub_client_stats()");
    expect(migration).toContain("join pt_workspaces pw");
  });
});
