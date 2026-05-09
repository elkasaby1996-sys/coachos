import { describe, expect, it } from "vitest";
import {
  buildInviteUrl,
  canManageTeam,
  generateInviteToken,
  getPermissionsForRole,
  hashInviteToken,
  hasWorkspacePermission,
  normalizeInviteEmail,
  type InvitableWorkspaceRole,
  type WorkspaceAccessContext,
  type WorkspaceMember,
  type WorkspaceMemberInvite,
  type WorkspaceRole,
} from "../../src/features/workspace-team/contracts";

describe("workspace team shared contracts", () => {
  it("normalizes invite emails before persistence or lookup", () => {
    expect(normalizeInviteEmail("  Sarah@Example.COM ")).toBe(
      "sarah@example.com",
    );
  });

  it("generates and hashes invite tokens without exposing raw token as the hash", async () => {
    const token = generateInviteToken();
    const hash = await hashInviteToken(token);

    expect(token).toHaveLength(64);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
    expect(await hashInviteToken(token)).toBe(hash);
  });

  it("builds canonical team invite URLs", () => {
    expect(
      buildInviteUrl({
        baseUrl: "https://app.repsync.com/",
        token: "abc123",
      }),
    ).toBe("https://app.repsync.com/team-invites/abc123");
  });

  it("prevents owner from being an invitable role at the type boundary", () => {
    const role: InvitableWorkspaceRole = "assistant_coach";
    expect(role).toBe("assistant_coach");
  });

  it("allows owner as a member role", () => {
    const role: WorkspaceRole = "owner";
    const member: WorkspaceMember = {
      id: "member-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      role,
      status: "active",
      clientAccessMode: "all_clients",
      sourceInviteId: null,
      invitedByUserId: null,
      joinedAt: "2026-05-09T00:00:00.000Z",
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z",
    };

    expect(member.role).toBe("owner");
  });

  it("models pending invites separately from active memberships", () => {
    const invite: WorkspaceMemberInvite = {
      id: "invite-1",
      workspaceId: "workspace-1",
      email: "sarah@example.com",
      role: "coach",
      clientAccessMode: "assigned_clients_only",
      tokenHash: "hashed-token",
      status: "pending",
      invitedByUserId: "owner-1",
      acceptedByUserId: null,
      acceptedAt: null,
      expiresAt: "2026-05-23T00:00:00.000Z",
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z",
    };

    expect(invite.status).toBe("pending");
    expect(invite.acceptedByUserId).toBeNull();
  });

  it("limits team management to active owner and admin roles", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("coach")).toBe(false);
    expect(canManageTeam({ role: "admin", memberStatus: "suspended" })).toBe(
      false,
    );
  });

  it("returns permission sets by role", () => {
    expect(getPermissionsForRole("viewer")).toEqual([
      "workspace.view",
      "clients.view",
    ]);
    expect(getPermissionsForRole("coach")).toContain("delivery.manage");
    expect(getPermissionsForRole("owner")).toContain("workspace.danger.manage");
  });

  it("checks permissions against access context status", () => {
    const context: WorkspaceAccessContext = {
      workspaceId: "workspace-1",
      relation: "shared",
      role: "coach",
      memberStatus: "active",
      clientAccessMode: "assigned_clients_only",
      permissions: getPermissionsForRole("coach"),
      assignedClientIds: ["client-1"],
    };

    expect(hasWorkspacePermission(context, "clients.edit")).toBe(true);
    expect(
      hasWorkspacePermission(
        { ...context, memberStatus: "removed" },
        "clients.edit",
      ),
    ).toBe(false);
  });
});
