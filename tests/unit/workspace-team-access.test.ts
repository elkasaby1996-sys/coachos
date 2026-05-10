import { describe, expect, it } from "vitest";
import {
  ROLE_PERMISSIONS,
  WorkspaceAccessDeniedError,
  assertCanManageTeam,
  assertClientAccess,
  assertWorkspaceAccess,
  canAccessClient,
  getAccessibleClientScope,
  getWorkspaceAccessContext,
  hasWorkspacePermission,
  type WorkspaceAccessClient,
  type WorkspaceAccessDataSource,
  type WorkspaceAccessMember,
  type WorkspaceAccessWorkspace,
  type WorkspaceRole,
} from "../../src/features/workspace-team";

function buildDataSource(params: {
  workspaces?: WorkspaceAccessWorkspace[];
  members?: WorkspaceAccessMember[];
  clients?: WorkspaceAccessClient[];
  assignments?: Array<{
    workspaceId: string;
    memberId: string;
    clientId: string;
  }>;
}): WorkspaceAccessDataSource {
  const workspaces = new Map(
    (params.workspaces ?? []).map((workspace) => [workspace.id, workspace]),
  );
  const clients = new Map(
    (params.clients ?? []).map((client) => [client.id, client]),
  );
  const members = params.members ?? [];
  const assignments = params.assignments ?? [];

  return {
    async getWorkspace(workspaceId) {
      return workspaces.get(workspaceId) ?? null;
    },
    async getWorkspaceMember(workspaceId, userId) {
      return (
        members.find(
          (member) =>
            member.workspaceId === workspaceId && member.userId === userId,
        ) ?? null
      );
    },
    async getClient(clientId) {
      return clients.get(clientId) ?? null;
    },
    async hasClientAssignment({ workspaceId, memberId, clientId }) {
      return assignments.some(
        (assignment) =>
          assignment.workspaceId === workspaceId &&
          assignment.memberId === memberId &&
          assignment.clientId === clientId,
      );
    },
    async listClientAssignments({ workspaceId, memberId }) {
      return assignments
        .filter(
          (assignment) =>
            assignment.workspaceId === workspaceId &&
            assignment.memberId === memberId,
        )
        .map((assignment) => assignment.clientId);
    },
  };
}

function member(
  overrides: Partial<WorkspaceAccessMember> = {},
): WorkspaceAccessMember {
  return {
    id: "member-1",
    workspaceId: "workspace-1",
    userId: "coach-1",
    role: "coach",
    status: "active",
    clientAccessMode: "assigned_clients_only",
    ...overrides,
  };
}

describe("workspace team access helpers", () => {
  it("exposes the role permission matrix from a centralized contract", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("workspace.danger.manage");
    expect(ROLE_PERMISSIONS.admin).toContain("team.manage");
    expect(ROLE_PERMISSIONS.coach).not.toContain("team.manage");
    expect(ROLE_PERMISSIONS.viewer).toEqual(["workspace.view", "clients.view"]);
  });

  it("allows workspace owner access without a membership row", async () => {
    const dataSource = buildDataSource({
      workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
    });

    await expect(
      getWorkspaceAccessContext(dataSource, {
        workspaceId: "workspace-1",
        userId: "owner-1",
      }),
    ).resolves.toMatchObject({
      relation: "owned",
      role: "owner",
      memberStatus: "active",
      clientAccessMode: "all_clients",
    });
  });

  it("allows active shared member access", async () => {
    const dataSource = buildDataSource({
      workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
      members: [member()],
    });

    await expect(
      getWorkspaceAccessContext(dataSource, {
        workspaceId: "workspace-1",
        userId: "coach-1",
      }),
    ).resolves.toMatchObject({
      relation: "shared",
      role: "coach",
      memberStatus: "active",
    });
  });

  it("denies suspended and removed members", async () => {
    for (const status of ["suspended", "removed"] as const) {
      const dataSource = buildDataSource({
        workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
        members: [member({ status })],
      });

      await expect(
        getWorkspaceAccessContext(dataSource, {
          workspaceId: "workspace-1",
          userId: "coach-1",
        }),
      ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
    }
  });

  it("does not treat pending invites as access", async () => {
    const dataSource = buildDataSource({
      workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
    });

    await expect(
      assertWorkspaceAccess(dataSource, {
        workspaceId: "workspace-1",
        userId: "invited-user",
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
  });

  it("enforces assigned client access without widening empty assignments", async () => {
    const dataSource = buildDataSource({
      workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
      members: [member()],
      clients: [
        { id: "client-1", workspaceId: "workspace-1" },
        { id: "client-2", workspaceId: "workspace-1" },
      ],
      assignments: [
        {
          workspaceId: "workspace-1",
          memberId: "member-1",
          clientId: "client-1",
        },
      ],
    });

    await expect(
      canAccessClient(dataSource, {
        workspaceId: "workspace-1",
        clientId: "client-1",
        userId: "coach-1",
      }),
    ).resolves.toBe(true);
    await expect(
      canAccessClient(dataSource, {
        workspaceId: "workspace-1",
        clientId: "client-2",
        userId: "coach-1",
      }),
    ).resolves.toBe(false);
    await expect(
      getAccessibleClientScope(dataSource, {
        workspaceId: "workspace-1",
        userId: "coach-1",
      }),
    ).resolves.toEqual({
      mode: "assigned_clients",
      workspaceId: "workspace-1",
      clientIds: ["client-1"],
    });
  });

  it("allows all-client members to access any workspace client only when the role permits", async () => {
    const dataSource = buildDataSource({
      workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
      members: [member({ clientAccessMode: "all_clients" })],
      clients: [{ id: "client-2", workspaceId: "workspace-1" }],
    });

    await expect(
      assertClientAccess(dataSource, {
        workspaceId: "workspace-1",
        clientId: "client-2",
        userId: "coach-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps team management limited to owner and admin", async () => {
    const adminSource = buildDataSource({
      workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
      members: [member({ role: "admin" })],
    });
    const coachSource = buildDataSource({
      workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
      members: [member({ role: "coach" })],
    });

    await expect(
      assertCanManageTeam(adminSource, {
        workspaceId: "workspace-1",
        userId: "coach-1",
      }),
    ).resolves.toMatchObject({ role: "admin" });
    await expect(
      assertCanManageTeam(coachSource, {
        workspaceId: "workspace-1",
        userId: "coach-1",
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
  });

  it("blocks viewer edit access while preserving read access", () => {
    const context = {
      role: "viewer" as WorkspaceRole,
      memberStatus: "active" as const,
    };

    expect(hasWorkspacePermission(context, "clients.view")).toBe(true);
    expect(hasWorkspacePermission(context, "clients.edit")).toBe(false);
  });

  it("enforces assigned-client scope across coach and viewer roles in one workspace", async () => {
    const dataSource = buildDataSource({
      workspaces: [{ id: "workspace-1", ownerUserId: "owner-1" }],
      members: [
        member({
          id: "coach-member",
          userId: "coach-1",
          role: "coach",
          clientAccessMode: "assigned_clients_only",
        }),
        member({
          id: "viewer-member",
          userId: "viewer-1",
          role: "viewer",
          clientAccessMode: "assigned_clients_only",
        }),
      ],
      clients: [
        { id: "assigned-client", workspaceId: "workspace-1" },
        { id: "unassigned-client", workspaceId: "workspace-1" },
      ],
      assignments: [
        {
          workspaceId: "workspace-1",
          memberId: "coach-member",
          clientId: "assigned-client",
        },
        {
          workspaceId: "workspace-1",
          memberId: "viewer-member",
          clientId: "assigned-client",
        },
      ],
    });

    await expect(
      getAccessibleClientScope(dataSource, {
        workspaceId: "workspace-1",
        userId: "owner-1",
      }),
    ).resolves.toMatchObject({ mode: "all_clients" });
    await expect(
      canAccessClient(dataSource, {
        workspaceId: "workspace-1",
        userId: "coach-1",
        clientId: "assigned-client",
      }),
    ).resolves.toBe(true);
    await expect(
      assertClientAccess(dataSource, {
        workspaceId: "workspace-1",
        userId: "coach-1",
        clientId: "unassigned-client",
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
    await expect(
      assertClientAccess(dataSource, {
        workspaceId: "workspace-1",
        userId: "viewer-1",
        clientId: "assigned-client",
        permission: "clients.edit",
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
  });
});
