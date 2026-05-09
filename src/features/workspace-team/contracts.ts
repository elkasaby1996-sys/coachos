export type WorkspaceRole =
  | "owner"
  | "admin"
  | "coach"
  | "assistant_coach"
  | "viewer";

export type InvitableWorkspaceRole = Exclude<WorkspaceRole, "owner">;

export type InviteStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked"
  | "declined";

export type WorkspaceMemberStatus = "active" | "suspended" | "removed";

export type ClientAccessMode = "all_clients" | "assigned_clients_only";

export type WorkspaceRelation = "owned" | "shared";

export type PtHubWorkspaceRelation = WorkspaceRelation;

export type WorkspacePermission =
  | "workspace.view"
  | "team.view"
  | "team.manage"
  | "clients.view"
  | "clients.create"
  | "clients.edit"
  | "clients.lifecycle.update"
  | "clients.message"
  | "delivery.manage"
  | "billing.manage"
  | "workspace.danger.manage";

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  clientAccessMode: ClientAccessMode;
  sourceInviteId: string | null;
  invitedByUserId: string | null;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMemberInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: InvitableWorkspaceRole;
  clientAccessMode: ClientAccessMode;
  tokenHash: string;
  status: InviteStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceAccessContext = {
  workspaceId: string;
  relation: WorkspaceRelation;
  role: WorkspaceRole;
  memberStatus: WorkspaceMemberStatus;
  clientAccessMode: ClientAccessMode;
  permissions: WorkspacePermission[];
  assignedClientIds?: string[];
};

export type TeamInvitePreview = {
  inviteId: string;
  workspaceId: string;
  workspaceName: string;
  invitedEmail: string;
  role: InvitableWorkspaceRole;
  clientAccessMode: ClientAccessMode;
  status: InviteStatus;
  expiresAt: string;
  requiresAuth: true;
};

export const ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspacePermission[]> = {
  owner: [
    "workspace.view",
    "team.view",
    "team.manage",
    "clients.view",
    "clients.create",
    "clients.edit",
    "clients.lifecycle.update",
    "clients.message",
    "delivery.manage",
    "billing.manage",
    "workspace.danger.manage",
  ],
  admin: [
    "workspace.view",
    "team.view",
    "team.manage",
    "clients.view",
    "clients.create",
    "clients.edit",
    "clients.lifecycle.update",
    "clients.message",
    "delivery.manage",
  ],
  coach: [
    "workspace.view",
    "team.view",
    "clients.view",
    "clients.create",
    "clients.edit",
    "clients.lifecycle.update",
    "clients.message",
    "delivery.manage",
  ],
  assistant_coach: [
    "workspace.view",
    "clients.view",
    "clients.edit",
    "clients.message",
  ],
  viewer: ["workspace.view", "clients.view"],
};

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues || !cryptoApi.subtle) {
    throw new Error("Secure crypto is unavailable in this environment.");
  }
  return cryptoApi;
}

export function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

export function generateInviteToken(byteLength = 32) {
  if (!Number.isInteger(byteLength) || byteLength < 16) {
    throw new Error("Invite token must use at least 16 random bytes.");
  }

  const bytes = new Uint8Array(byteLength);
  getCrypto().getRandomValues(bytes);
  return toHex(bytes);
}

export async function hashInviteToken(token: string) {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error("Invite token is required.");
  }

  const encoded = new TextEncoder().encode(normalizedToken);
  const digest = await getCrypto().subtle.digest("SHA-256", encoded);
  return toHex(new Uint8Array(digest));
}

export function buildInviteUrl(params: { baseUrl: string; token: string }) {
  const baseUrl = params.baseUrl.trim().replace(/\/+$/, "");
  const token = encodeURIComponent(params.token.trim());
  if (!baseUrl || !token) {
    throw new Error("Base URL and token are required.");
  }
  return `${baseUrl}/team-invites/${token}`;
}

export function getPermissionsForRole(role: WorkspaceRole) {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasWorkspacePermission(
  roleOrContext:
    | WorkspaceRole
    | Pick<WorkspaceAccessContext, "role" | "memberStatus">
    | null
    | undefined,
  permission: WorkspacePermission,
) {
  if (!roleOrContext) return false;
  const role =
    typeof roleOrContext === "string" ? roleOrContext : roleOrContext.role;
  const memberStatus =
    typeof roleOrContext === "string" ? "active" : roleOrContext.memberStatus;

  if (memberStatus !== "active") return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canManageTeam(
  roleOrContext:
    | WorkspaceRole
    | Pick<WorkspaceAccessContext, "role" | "memberStatus">
    | null
    | undefined,
) {
  return hasWorkspacePermission(roleOrContext, "team.manage");
}
