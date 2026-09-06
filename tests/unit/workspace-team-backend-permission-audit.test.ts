import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(resolve(process.cwd(), ...segments), "utf8");
}

function readOptionalSource(...segments: string[]) {
  const path = resolve(process.cwd(), ...segments);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function functionBody(source: string, functionName: string) {
  const marker = `create or replace function public.${functionName}`;
  const start = source.indexOf(marker);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);

  const next = source.indexOf(
    "\ncreate or replace function public.",
    start + 1,
  );
  const grant = source.indexOf("\ngrant ", start + 1);
  const candidates = [next, grant].filter((index) => index > start);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

const migrationDir = resolve(process.cwd(), "supabase", "migrations");
const allMigrationSql = readdirSync(migrationDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(resolve(migrationDir, file), "utf8"))
  .join("\n\n");

const accessSql = readSource(
  "supabase",
  "migrations",
  "20260509173000_workspace_team_access_permissions.sql",
);
const settingsSql = readSource(
  "supabase",
  "migrations",
  "20260509183000_workspace_team_settings_apis.sql",
);
const clientAccessSql = readSource(
  "supabase",
  "migrations",
  "20260509190000_workspace_team_client_access_hardening.sql",
);
const operationalSql = readSource(
  "supabase",
  "migrations",
  "20260509193000_workspace_team_operational_hardening.sql",
);
const invitePreviewSql = readSource(
  "supabase",
  "migrations",
  "20260629150000_harden_workspace_team_invite_preview.sql",
);
const permissionAuditSql = readOptionalSource(
  "supabase",
  "migrations",
  "20260630120000_workspace_permission_audit_hardening.sql",
);

const backendPermissionMatrix = [
  {
    role: "owner",
    canManageTeam: true,
    canEditWorkspaceSettings: true,
    canUseDangerActions: true,
    clientScope: "all clients",
  },
  {
    role: "assistant_coach",
    canManageTeam: false,
    canEditWorkspaceSettings: false,
    canUseDangerActions: false,
    clientScope: "assigned clients only unless explicitly configured otherwise",
  },
  {
    role: "viewer",
    canManageTeam: false,
    canEditWorkspaceSettings: false,
    canUseDangerActions: false,
    clientScope: "view only",
  },
] as const;

describe("workspace team backend permission audit", () => {
  it("documents the launch-critical backend permission matrix", () => {
    expect(backendPermissionMatrix).toEqual([
      expect.objectContaining({
        role: "owner",
        canManageTeam: true,
        canEditWorkspaceSettings: true,
        canUseDangerActions: true,
      }),
      expect.objectContaining({
        role: "assistant_coach",
        canManageTeam: false,
        canEditWorkspaceSettings: false,
        canUseDangerActions: false,
      }),
      expect.objectContaining({
        role: "viewer",
        canManageTeam: false,
        canEditWorkspaceSettings: false,
        canUseDangerActions: false,
      }),
    ]);
  });

  it("keeps assistant and viewer roles out of restricted backend permissions", () => {
    const rolePermissions = functionBody(
      accessSql,
      "workspace_role_permissions",
    );

    expect(rolePermissions).toContain("when 'assistant_coach' then array[");
    expect(rolePermissions).toContain("'clients.edit'");
    expect(rolePermissions).toContain("when 'viewer' then array[");
    expect(rolePermissions).toContain("'clients.view'");

    const assistantBlock = rolePermissions.slice(
      rolePermissions.indexOf("when 'assistant_coach' then array["),
      rolePermissions.indexOf("when 'viewer' then array["),
    );
    expect(assistantBlock).not.toContain("'team.manage'");
    expect(assistantBlock).not.toContain("'clients.create'");
    expect(assistantBlock).not.toContain("'delivery.manage'");
    expect(assistantBlock).not.toContain("'workspace.danger.manage'");

    const viewerBlock = rolePermissions.slice(
      rolePermissions.indexOf("when 'viewer' then array["),
      rolePermissions.indexOf("else '{}'::text[]"),
    );
    expect(viewerBlock).not.toContain("'team.manage'");
    expect(viewerBlock).not.toContain("'clients.create'");
    expect(viewerBlock).not.toContain("'clients.edit'");
    expect(viewerBlock).not.toContain("'clients.message'");
    expect(viewerBlock).not.toContain("'workspace.danger.manage'");
  });

  it("enforces assigned-client visibility through backend helpers and list RPCs", () => {
    const canAccessClient = functionBody(accessSql, "can_access_client");
    expect(canAccessClient).toContain("from public.workspace_access_context");
    expect(canAccessClient).toContain("public.has_workspace_permission(");
    expect(canAccessClient).toContain("p_permission");
    expect(canAccessClient).toContain("v_context.role in ('owner', 'admin')");
    expect(canAccessClient).toContain(
      "v_context.client_access_mode = 'all_clients'",
    );
    expect(canAccessClient).toContain(
      "from public.workspace_member_client_assignments wmca",
    );
    expect(canAccessClient).toContain("wmca.client_id = v_client.id");

    const accessibleClientIds = functionBody(
      accessSql,
      "accessible_client_ids",
    );
    expect(accessibleClientIds).toContain(
      "from public.workspace_access_context",
    );
    expect(accessibleClientIds).toContain("'clients.view'");
    expect(accessibleClientIds).toContain(
      "v_context.role in ('owner', 'admin')",
    );
    expect(accessibleClientIds).toContain(
      "v_context.client_access_mode = 'all_clients'",
    );
    expect(accessibleClientIds).toContain(
      "from public.workspace_member_client_assignments wmca",
    );

    for (const functionName of [
      "pt_clients_summary",
      "pt_hub_clients_page",
      "pt_hub_client_stats",
      "pt_dashboard_summary",
    ]) {
      expect(functionBody(accessSql, functionName)).toContain(
        "public.accessible_client_ids",
      );
    }
  });

  it("keeps current assistant coaching writes assignment-aware", () => {
    expect(
      functionBody(clientAccessSql, "pt_update_client_admin_fields"),
    ).toContain("public.can_access_client(p_client_id, 'clients.edit')");
    expect(
      functionBody(clientAccessSql, "send_conversation_message"),
    ).toContain(
      "public.can_access_conversation(p_conversation_id, 'clients.message')",
    );
    expect(functionBody(clientAccessSql, "ensure_pt_conversation")).toContain(
      "public.can_access_client(p_client_id, 'clients.message')",
    );
    expect(
      functionBody(clientAccessSql, "pt_update_client_checkin_settings"),
    ).toContain("public.can_access_client(p_client_id, 'delivery.manage')");
  });

  it("guards restricted invite, team, and settings RPCs with team.manage", () => {
    const restrictedBodies = [
      functionBody(operationalSql, "create_workspace_team_invite"),
      functionBody(settingsSql, "workspace_team_settings_summary"),
      functionBody(settingsSql, "workspace_team_client_picker"),
      functionBody(operationalSql, "update_workspace_team_member_role"),
      functionBody(operationalSql, "update_workspace_team_member_status"),
      functionBody(operationalSql, "update_workspace_team_member_clients"),
    ];

    for (const body of restrictedBodies) {
      expect(body).toContain(
        "public.can_manage_workspace_team(p_workspace_id)",
      );
      expect(body).toContain("'WORKSPACE_PERMISSION_DENIED'");
    }
  });

  it("blocks owner removal and owner client-assignment mutation in team RPCs", () => {
    expect(
      functionBody(operationalSql, "update_workspace_team_member_role"),
    ).toContain("v_previous_role = 'owner'");
    expect(
      functionBody(operationalSql, "update_workspace_team_member_status"),
    ).toContain(
      "public.normalize_workspace_role(v_member.role::text) = 'owner'",
    );
    expect(
      functionBody(operationalSql, "update_workspace_team_member_clients"),
    ).toContain("public.normalize_workspace_role(wm.role::text) <> 'owner'");
  });

  it("keeps removed members out of workspace and client access", () => {
    const workspaceAccessContext = functionBody(
      operationalSql,
      "workspace_access_context",
    );
    expect(workspaceAccessContext).toContain(
      "wm.status in ('suspended', 'removed')",
    );
    expect(workspaceAccessContext).toContain("return;");
    expect(workspaceAccessContext).toContain("wm.status = 'active'");

    expect(functionBody(accessSql, "has_workspace_permission")).toContain(
      "coalesce(p_member_status, 'removed') = 'active'",
    );
  });

  it("keeps invite preview metadata restricted to the invited authenticated coach", () => {
    expect(invitePreviewSql).toContain(
      "grant execute on function public.preview_workspace_team_invite(text) to authenticated;",
    );
    expect(invitePreviewSql).toContain("v_user_email is null");
    expect(invitePreviewSql).toContain("lower(v_invite.email) <> v_user_email");
    expect(invitePreviewSql).toContain("'INVITE_EMAIL_MISMATCH'");
    expect(invitePreviewSql).toContain("'WORKSPACE_PERMISSION_DENIED'");
  });

  it("hardens direct workspace settings and danger RLS to backend permissions", () => {
    expect(permissionAuditSql).toContain(
      "drop policy if exists workspaces_update_access",
    );
    expect(permissionAuditSql).toContain(
      "create policy workspaces_update_access",
    );
    expect(permissionAuditSql).toContain(
      "public.can_manage_workspace_team(id)",
    );
    expect(permissionAuditSql).toContain(
      "with check (public.can_manage_workspace_team(id))",
    );
    expect(permissionAuditSql).toContain(
      "create policy workspaces_delete_owner_access",
    );
    expect(permissionAuditSql).toContain("public.has_workspace_permission(");
    expect(permissionAuditSql).toContain("ctx.role");
    expect(permissionAuditSql).toContain("ctx.member_status");
    expect(permissionAuditSql).toContain("'workspace.danger.manage'");
  });

  it("does not grant direct authenticated client deletes or workspace deletes to broad roles", () => {
    expect(allMigrationSql).not.toMatch(
      /create policy\s+clients_delete_access/i,
    );
    expect(allMigrationSql).not.toMatch(
      /create policy\s+workspaces_delete_access[\s\S]*can_manage_workspace_team/i,
    );
  });
});
