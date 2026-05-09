import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260509173000_workspace_team_access_permissions.sql",
  ),
  "utf8",
);

describe("workspace team access PR 2 SQL contract", () => {
  it("adds centralized role permission and access-context helpers", () => {
    expect(migration).toContain(
      "create or replace function public.workspace_role_permissions",
    );
    expect(migration).toContain(
      "create or replace function public.has_workspace_permission",
    );
    expect(migration).toContain(
      "create or replace function public.workspace_access_context",
    );
    expect(migration).toContain("'team.manage'");
    expect(migration).toContain("'assistant_coach'");
    expect(migration).toContain("when 'pt_owner' then 'owner'");
  });

  it("does not use pending invites as workspace access", () => {
    const accessContextBody = migration.slice(
      migration.indexOf(
        "create or replace function public.workspace_access_context",
      ),
      migration.indexOf(
        "create or replace function public.can_access_workspace",
      ),
    );

    expect(accessContextBody).not.toContain("workspace_member_invites");
  });

  it("denies suspended and removed members by only returning active shared context", () => {
    expect(migration).toContain("and wm.status = 'active'");
    expect(migration).toContain("coalesce(p_member_status, 'removed')");
  });

  it("centralizes client access by role, access mode, and assignments", () => {
    expect(migration).toContain(
      "create or replace function public.can_access_client",
    );
    expect(migration).toContain(
      "from public.workspace_member_client_assignments wmca",
    );
    expect(migration).toContain("v_context.client_access_mode = 'all_clients'");
    expect(migration).toContain("v_context.role in ('owner', 'admin')");
  });

  it("patches direct client RLS and primary PT list RPCs", () => {
    expect(migration).toContain("drop policy if exists clients_select_access");
    expect(migration).toContain(
      "or public.can_access_client(id, 'clients.view')",
    );
    expect(migration).toContain(
      "or public.can_access_client(id, 'clients.edit')",
    );
    expect(migration).toContain(
      "create or replace function public.pt_clients_summary",
    );
    expect(migration).toContain(
      "create or replace function public.pt_hub_clients_page",
    );
    expect(migration).toContain(
      "create or replace function public.pt_dashboard_summary",
    );
    expect(migration).toContain("public.accessible_client_ids(p_workspace_id)");
  });

  it("does not use lifecycle, risk, or onboarding state to decide access", () => {
    const accessFunctionBodies = [
      "public.workspace_access_context",
      "public.can_access_client",
      "public.accessible_client_ids",
    ].map((name, index, names) => {
      const start = migration.indexOf(`create or replace function ${name}`);
      const end =
        index + 1 < names.length
          ? migration.indexOf(
              `create or replace function ${names[index + 1]}`,
              start + 1,
            )
          : migration.indexOf("create or replace function public.accessible_workspace_relations_for_user");
      return migration.slice(start, end);
    });

    for (const body of accessFunctionBodies) {
      expect(body).not.toContain("lifecycle_state");
      expect(body).not.toContain("manual_risk_flag");
      expect(body).not.toContain("onboarding_status");
    }
  });
});
