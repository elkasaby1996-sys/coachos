import {
  buildInviteUrl,
  normalizeInviteEmail,
  type ClientAccessMode,
  type InvitableWorkspaceRole,
  type InviteStatus,
  type TeamInvitePreview,
} from "./contracts";

export type WorkspaceTeamInviteErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_PERMISSION_DENIED"
  | "INVITE_NOT_FOUND"
  | "INVITE_NOT_PENDING"
  | "INVITE_EXPIRED"
  | "INVITE_REVOKED"
  | "INVITE_EMAIL_MISMATCH"
  | "AUTHENTICATED_EMAIL_NOT_VERIFIED"
  | "USER_ALREADY_WORKSPACE_MEMBER"
  | "DUPLICATE_PENDING_INVITE"
  | "INVALID_INVITE_ROLE"
  | "INVALID_CLIENT_ASSIGNMENT"
  | "INVALID_INVITE_EMAIL"
  | "INVALID_CLIENT_ACCESS_MODE";

export type WorkspaceTeamInviteEmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export type CreateWorkspaceTeamInviteInput = {
  workspaceId: string;
  email: string;
  role?: InvitableWorkspaceRole;
  clientAccessMode?: ClientAccessMode;
  clientIds?: string[];
  baseUrl: string;
};

export type WorkspaceTeamInviteCreated = {
  inviteId: string;
  workspaceId: string;
  workspaceName: string | null;
  invitedEmail: string;
  role: InvitableWorkspaceRole;
  clientAccessMode: ClientAccessMode;
  status: InviteStatus;
  expiresAt: string;
  acceptUrl: string;
  email: WorkspaceTeamInviteEmailPayload;
};

export type WorkspaceTeamInviteAccepted = {
  workspaceId: string;
  membershipId: string;
  relation: "shared";
  role: InvitableWorkspaceRole;
  redirectTo: string;
};

export type WorkspaceTeamInviteResent = {
  inviteId: string;
  workspaceId: string;
  invitedEmail: string;
  status: InviteStatus;
  expiresAt: string;
  acceptUrl: string;
};

export type WorkspaceTeamInviteRevoked = {
  inviteId: string;
  workspaceId: string;
  status: Extract<InviteStatus, "revoked">;
};

export const WORKSPACE_TEAM_INVITE_RATE_LIMITS = {
  createInviteMs: 30_000,
  resendInviteMs: 60_000,
  wrongAccountAttemptMs: 60_000,
} as const;

export const WORKSPACE_TEAM_SAFE_LOG_FIELDS = {
  blocked: [
    "token",
    "rawToken",
    "acceptUrl",
    "token_hash",
    "authToken",
    "sessionToken",
    "privateMessageBody",
    "paymentData",
  ],
} as const;

export const WORKSPACE_TEAM_INVITE_API_ROUTES = {
  create: "/api/workspaces/:workspaceId/team/invites",
  preview: "/api/team-invites/:token",
  accept: "/api/team-invites/:token/accept",
  resend: "/api/workspaces/:workspaceId/team/invites/:inviteId/resend",
  revoke: "/api/workspaces/:workspaceId/team/invites/:inviteId/revoke",
} as const;

function parseRpcJson<T>(value: unknown): T {
  return value as T;
}

async function getSupabaseClient() {
  const { supabase } = await import("../../lib/supabase");
  return supabase;
}

export function getWorkspaceTeamInviteErrorCode(
  error: unknown,
): WorkspaceTeamInviteErrorCode | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { hint?: unknown; message?: unknown };
  const hint = typeof candidate.hint === "string" ? candidate.hint : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  const code = hint || message;
  return isWorkspaceTeamInviteErrorCode(code) ? code : null;
}

function isWorkspaceTeamInviteErrorCode(
  value: string,
): value is WorkspaceTeamInviteErrorCode {
  return [
    "UNAUTHENTICATED",
    "WORKSPACE_PERMISSION_DENIED",
    "INVITE_NOT_FOUND",
    "INVITE_NOT_PENDING",
    "INVITE_EXPIRED",
    "INVITE_REVOKED",
    "INVITE_EMAIL_MISMATCH",
    "AUTHENTICATED_EMAIL_NOT_VERIFIED",
    "USER_ALREADY_WORKSPACE_MEMBER",
    "DUPLICATE_PENDING_INVITE",
    "INVALID_INVITE_ROLE",
    "INVALID_CLIENT_ASSIGNMENT",
    "INVALID_INVITE_EMAIL",
    "INVALID_CLIENT_ACCESS_MODE",
  ].includes(value);
}

export function buildWorkspaceTeamInviteEmail(params: {
  to: string;
  workspaceName: string;
  ownerName: string;
  role: InvitableWorkspaceRole;
  acceptUrl: string;
  expiresAt: string;
}): WorkspaceTeamInviteEmailPayload {
  const normalizedEmail = normalizeInviteEmail(params.to);
  return {
    to: normalizedEmail,
    subject: `${params.ownerName} invited you to join ${params.workspaceName}`,
    text: [
      `${params.ownerName} invited you to join ${params.workspaceName} on RepSync as ${params.role}.`,
      `Accept invite: ${params.acceptUrl}`,
      `This invite expires on ${params.expiresAt}.`,
      `You must sign in or create a RepSync account with ${normalizedEmail} to accept.`,
    ].join("\n\n"),
  };
}

export function buildWorkspaceTeamInviteUrl(params: {
  baseUrl: string;
  token: string;
}) {
  return buildInviteUrl(params);
}

export async function createWorkspaceTeamInvite(
  input: CreateWorkspaceTeamInviteInput,
) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("create_workspace_team_invite", {
    p_workspace_id: input.workspaceId,
    p_email: normalizeInviteEmail(input.email),
    p_role: input.role ?? "assistant_coach",
    p_client_access_mode: input.clientAccessMode ?? "assigned_clients_only",
    p_client_ids: input.clientIds ?? [],
    p_base_url: input.baseUrl,
  });
  if (error) throw error;
  return parseRpcJson<WorkspaceTeamInviteCreated>(data);
}

export async function previewWorkspaceTeamInvite(token: string) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("preview_workspace_team_invite", {
    p_token: token,
  });
  if (error) throw error;
  return parseRpcJson<TeamInvitePreview>(data);
}

export async function acceptWorkspaceTeamInvite(token: string) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("accept_workspace_team_invite", {
    p_token: token,
  });
  if (error) throw error;
  return parseRpcJson<WorkspaceTeamInviteAccepted>(data);
}

export async function resendWorkspaceTeamInvite(input: {
  workspaceId: string;
  inviteId: string;
  baseUrl: string;
}) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("resend_workspace_team_invite", {
    p_workspace_id: input.workspaceId,
    p_invite_id: input.inviteId,
    p_base_url: input.baseUrl,
  });
  if (error) throw error;
  return parseRpcJson<WorkspaceTeamInviteResent>(data);
}

export async function revokeWorkspaceTeamInvite(input: {
  workspaceId: string;
  inviteId: string;
}) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("revoke_workspace_team_invite", {
    p_workspace_id: input.workspaceId,
    p_invite_id: input.inviteId,
  });
  if (error) throw error;
  return parseRpcJson<WorkspaceTeamInviteRevoked>(data);
}
