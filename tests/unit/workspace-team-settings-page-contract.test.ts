import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  "src/pages/workspace/settings/tabs/team.tsx",
  "utf8",
);
const serviceSource = readFileSync(
  "src/features/workspace-team/team-settings.ts",
  "utf8",
);
const migrationSource = readFileSync(
  "supabase/migrations/20260509183000_workspace_team_settings_apis.sql",
  "utf8",
);

describe("workspace team settings page contract", () => {
  it("renders the required workspace team settings surface", () => {
    expect(pageSource).toContain("WorkspaceTeamSettingsPage");
    expect(pageSource).toContain("Team & Permissions");
    expect(pageSource).toContain(
      "Invite coaches and assistants to help manage clients in this workspace.",
    );
    expect(pageSource).toContain("Invite member");
    expect(pageSource).toContain("Active members");
    expect(pageSource).toContain("Pending invites");
  });

  it("gates management actions to owner/admin context", () => {
    expect(pageSource).toContain("!canManage");
    expect(pageSource).toContain("Permission denied");
    expect(pageSource).toContain("Team management is limited");
    expect(pageSource).toContain("canManage ? (");
  });

  it("defaults invites to assistant coach and assigned-client access", () => {
    expect(pageSource).toContain(
      'useState<InvitableWorkspaceRole>("assistant_coach")',
    );
    expect(pageSource).toContain("useState<ClientAccessMode>");
    expect(pageSource).toContain('"assigned_clients_only"');
    expect(pageSource).toContain("This member will not see any clients");
  });

  it("does not offer owner as an invite or role-edit option", () => {
    expect(pageSource).toContain('value: "admin"');
    expect(pageSource).toContain('value: "coach"');
    expect(pageSource).toContain('value: "assistant_coach"');
    expect(pageSource).toContain('value: "viewer"');
    expect(pageSource).not.toContain('value: "owner"');
  });

  it("validates invite email before submit", () => {
    expect(pageSource).toContain("/\\S+@\\S+\\.\\S+/.test");
    expect(pageSource).toContain("Enter a valid email address.");
  });

  it("wires invite, resend, and revoke APIs", () => {
    expect(pageSource).toContain("createWorkspaceTeamInvite");
    expect(pageSource).toContain("resendWorkspaceTeamInvite");
    expect(pageSource).toContain("revokeWorkspaceTeamInvite");
    expect(pageSource).toContain("Revoke invite?");
    expect(pageSource).toContain("Invite created");
    expect(pageSource).toContain("Email delivery is queued.");
    expect(pageSource).toContain("Copy link");
  });

  it("protects the owner row from demotion/removal actions", () => {
    expect(pageSource).toContain('member.role === "owner"');
    expect(pageSource).toContain("Owner protected");
    expect(pageSource).toContain("owner cannot be removed");
  });

  it("renders client access and status badges", () => {
    expect(pageSource).toContain("ClientAccessBadge");
    expect(pageSource).toContain("MemberStatusBadge");
    expect(pageSource).toContain("InviteStatusBadge");
    expect(pageSource).toContain("assigned clients");
  });
});

describe("workspace team settings backend contract", () => {
  it("uses dedicated team settings RPCs from the client service", () => {
    expect(serviceSource).toContain("workspace_team_settings_summary");
    expect(serviceSource).toContain("workspace_team_client_picker");
    expect(serviceSource).toContain("update_workspace_team_member_role");
    expect(serviceSource).toContain("update_workspace_team_member_status");
    expect(serviceSource).toContain("update_workspace_team_member_clients");
  });

  it("requires workspace team management permission server-side", () => {
    expect(migrationSource).toContain("public.can_manage_workspace_team");
    expect(migrationSource).toContain("WORKSPACE_PERMISSION_DENIED");
  });

  it("blocks owner role assignment through settings RPCs", () => {
    expect(migrationSource).toContain(
      "v_next_role not in ('admin', 'coach', 'assistant_coach', 'viewer')",
    );
    expect(migrationSource).toContain(
      "public.normalize_workspace_role(v_member.role::text) = 'owner'",
    );
  });
});
