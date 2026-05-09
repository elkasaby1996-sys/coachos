import {
  canManageTeam,
  getPermissionsForRole,
  hasWorkspacePermission,
  type ClientAccessMode,
  type PtHubWorkspaceRelation,
  type WorkspaceAccessContext,
  type WorkspaceMemberStatus,
  type WorkspacePermission,
  type WorkspaceRelation,
  type WorkspaceRole,
} from "./contracts";

export type WorkspaceAccessWorkspace = {
  id: string;
  name?: string | null;
  ownerUserId: string | null;
};

export type WorkspaceAccessMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  clientAccessMode: ClientAccessMode;
};

export type WorkspaceAccessClient = {
  id: string;
  workspaceId: string | null;
};

export type WorkspaceRelationRow = {
  workspaceId: string;
  workspaceName?: string | null;
  ownerUserId: string | null;
  relation: PtHubWorkspaceRelation;
  role: WorkspaceRole;
  memberStatus: WorkspaceMemberStatus;
  clientAccessMode: ClientAccessMode;
  memberId: string | null;
};

export type AccessibleClientScope =
  | { mode: "all_clients"; workspaceId: string }
  | { mode: "assigned_clients"; workspaceId: string; clientIds: string[] };

export type WorkspaceAccessDataSource = {
  getWorkspace: (
    workspaceId: string,
  ) => Promise<WorkspaceAccessWorkspace | null>;
  getWorkspaceMember: (
    workspaceId: string,
    userId: string,
  ) => Promise<WorkspaceAccessMember | null>;
  getClient: (clientId: string) => Promise<WorkspaceAccessClient | null>;
  hasClientAssignment: (params: {
    workspaceId: string;
    memberId: string;
    clientId: string;
  }) => Promise<boolean>;
  listClientAssignments: (params: {
    workspaceId: string;
    memberId: string;
  }) => Promise<string[]>;
  listWorkspaceRelationsForUser?: (
    userId: string,
  ) => Promise<WorkspaceRelationRow[]>;
};

export class WorkspaceAccessDeniedError extends Error {
  constructor(message = "Workspace access denied.") {
    super(message);
    this.name = "WorkspaceAccessDeniedError";
  }
}

function assertAuthenticatedUser(
  userId: string | null | undefined,
): asserts userId is string {
  if (!userId) {
    throw new WorkspaceAccessDeniedError("Authentication is required.");
  }
}

function buildOwnedContext(
  workspaceId: string,
): WorkspaceAccessContext & { memberId: null } {
  return {
    workspaceId,
    relation: "owned",
    role: "owner",
    memberStatus: "active",
    clientAccessMode: "all_clients",
    permissions: getPermissionsForRole("owner"),
    memberId: null,
  };
}

function buildSharedContext(
  member: WorkspaceAccessMember,
): WorkspaceAccessContext & { memberId: string } {
  return {
    workspaceId: member.workspaceId,
    relation: "shared",
    role: member.role,
    memberStatus: member.status,
    clientAccessMode: member.clientAccessMode,
    permissions:
      member.status === "active" ? getPermissionsForRole(member.role) : [],
    memberId: member.id,
  };
}

export function assertWorkspacePermission(
  context: Pick<WorkspaceAccessContext, "role" | "memberStatus">,
  permission: WorkspacePermission,
) {
  if (!hasWorkspacePermission(context, permission)) {
    throw new WorkspaceAccessDeniedError(
      `Missing workspace permission: ${permission}`,
    );
  }
}

export async function getWorkspaceAccessContext(
  dataSource: WorkspaceAccessDataSource,
  params: { workspaceId: string; userId: string | null | undefined },
): Promise<WorkspaceAccessContext & { memberId: string | null }> {
  assertAuthenticatedUser(params.userId);
  const userId = params.userId;

  const workspace = await dataSource.getWorkspace(params.workspaceId);
  if (!workspace) {
    throw new WorkspaceAccessDeniedError("Workspace not found.");
  }

  if (workspace.ownerUserId === userId) {
    return buildOwnedContext(workspace.id);
  }

  const member = await dataSource.getWorkspaceMember(
    workspace.id,
    userId,
  );
  if (!member) {
    throw new WorkspaceAccessDeniedError("Workspace membership not found.");
  }
  if (member.status !== "active") {
    throw new WorkspaceAccessDeniedError("Workspace membership is not active.");
  }

  return buildSharedContext(member);
}

export async function assertWorkspaceAccess(
  dataSource: WorkspaceAccessDataSource,
  params: {
    workspaceId: string;
    userId: string | null | undefined;
    permission?: WorkspacePermission;
  },
) {
  const context = await getWorkspaceAccessContext(dataSource, params);
  if (params.permission) {
    assertWorkspacePermission(context, params.permission);
  }
  return context;
}

export async function assertCanManageTeam(
  dataSource: WorkspaceAccessDataSource,
  params: { workspaceId: string; userId: string | null | undefined },
) {
  const context = await getWorkspaceAccessContext(dataSource, params);
  if (!canManageTeam(context)) {
    throw new WorkspaceAccessDeniedError("Team management is not allowed.");
  }
  return context;
}

export async function canAccessClient(
  dataSource: WorkspaceAccessDataSource,
  params: {
    workspaceId: string;
    clientId: string;
    userId: string | null | undefined;
    permission?: WorkspacePermission;
  },
) {
  const permission = params.permission ?? "clients.view";
  try {
    const context = await getWorkspaceAccessContext(dataSource, params);
    if (!hasWorkspacePermission(context, permission)) return false;

    const client = await dataSource.getClient(params.clientId);
    if (!client || client.workspaceId !== params.workspaceId) return false;

    if (context.role === "owner" || context.role === "admin") return true;
    if (context.clientAccessMode === "all_clients") return true;
    if (!context.memberId) return false;

    return dataSource.hasClientAssignment({
      workspaceId: params.workspaceId,
      memberId: context.memberId,
      clientId: params.clientId,
    });
  } catch (error) {
    if (error instanceof WorkspaceAccessDeniedError) return false;
    throw error;
  }
}

export async function assertClientAccess(
  dataSource: WorkspaceAccessDataSource,
  params: {
    workspaceId: string;
    clientId: string;
    userId: string | null | undefined;
    permission?: WorkspacePermission;
  },
) {
  const allowed = await canAccessClient(dataSource, params);
  if (!allowed) {
    throw new WorkspaceAccessDeniedError("Client access denied.");
  }
}

export async function getAccessibleClientScope(
  dataSource: WorkspaceAccessDataSource,
  params: { workspaceId: string; userId: string | null | undefined },
): Promise<AccessibleClientScope> {
  const context = await assertWorkspaceAccess(dataSource, {
    ...params,
    permission: "clients.view",
  });

  if (
    context.role === "owner" ||
    context.role === "admin" ||
    context.clientAccessMode === "all_clients"
  ) {
    return { mode: "all_clients", workspaceId: params.workspaceId };
  }

  return {
    mode: "assigned_clients",
    workspaceId: params.workspaceId,
    clientIds: context.memberId
      ? await dataSource.listClientAssignments({
          workspaceId: params.workspaceId,
          memberId: context.memberId,
        })
      : [],
  };
}

export async function getAccessibleWorkspaceRelationsForUser(
  dataSource: WorkspaceAccessDataSource,
  userId: string | null | undefined,
) {
  assertAuthenticatedUser(userId);
  const authenticatedUserId = userId;
  if (!dataSource.listWorkspaceRelationsForUser) return [];

  const rows =
    await dataSource.listWorkspaceRelationsForUser(authenticatedUserId);
  return rows
    .filter((row) => row.memberStatus === "active")
    .map((row) => ({
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName ?? null,
      ownerUserId: row.ownerUserId,
      relation: row.relation as WorkspaceRelation,
      role: row.role,
      memberStatus: row.memberStatus,
      clientAccessMode: row.clientAccessMode,
      permissions: getPermissionsForRole(row.role),
      memberId: row.memberId,
    }));
}
