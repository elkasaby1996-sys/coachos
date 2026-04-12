import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260412113000_align_pt_summary_auth_with_workspace_membership_helper.sql",
  ),
  "utf8",
);

describe("PT summary authorization SQL contract", () => {
  it("aligns pt_dashboard_summary auth with is_pt_workspace_member helper", () => {
    expect(migration).toContain("create or replace function public.pt_dashboard_summary");
    expect(migration).toContain("if not public.is_pt_workspace_member(p_workspace_id) then");
  });

  it("aligns pt_clients_summary auth with is_pt_workspace_member helper", () => {
    expect(migration).toContain("create or replace function public.pt_clients_summary");
    expect(migration).toContain("if not public.is_pt_workspace_member(p_workspace_id) then");
  });

  it("keeps clear workspace-required guardrails for both RPCs", () => {
    expect(migration).toContain("raise exception 'Workspace is required';");
  });
});
