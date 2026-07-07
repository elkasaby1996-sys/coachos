import type {
  ClientAccessMode,
  InviteStatus,
  InvitableWorkspaceRole,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from "./contracts";
import {
  createWorkspaceTeamInvite,
  resendWorkspaceTeamInvite,
  revokeWorkspaceTeamInvite,
} from "./invite-api";

export type WorkspaceTeamMemberRow = {
  id: string | null;
  workspaceId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  clientAccessMode: ClientAccessMode;
  sourceInviteId: string | null;
  invitedByUserId: string | null;
  joinedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  assignedClientCount: number | null;
  assignedClientIds: string[] | null;
};

export type WorkspaceTeamInviteRow = {
  id: string;
  workspaceId: string;
  email: string;
  role: InvitableWorkspaceRole;
  status: InviteStatus;
  clientAccessMode: ClientAccessMode;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  assignedClientCount: number;
  assignedClientIds: string[];
};

export type WorkspaceTeamSettingsSummary = {
  members: WorkspaceTeamMemberRow[];
  pendingInvites: WorkspaceTeamInviteRow[];
};

export type WorkspaceTeamClientOption = {
  id: string;
  displayName: string;
  email: string | null;
};

const memberStatusRank: Record<WorkspaceMemberStatus, number> = {
  active: 0,
  suspended: 1,
  removed: 2,
};

const memberRoleRank: Record<WorkspaceRole, number> = {
  owner: 0,
  admin: 1,
  coach: 2,
  assistant_coach: 3,
  viewer: 4,
};

async function getSupabaseClient() {
  const { supabase } = await import("../../lib/supabase");
  return supabase;
}

function parseRpcJson<T>(value: unknown): T {
  return value as T;
}

function getMemberDedupeKey(member: WorkspaceTeamMemberRow) {
  return member.userId || member.id || member.email?.toLowerCase() || "";
}

function shouldReplaceMember(
  current: WorkspaceTeamMemberRow,
  candidate: WorkspaceTeamMemberRow,
) {
  if (candidate.role === "owner" && current.role !== "owner") return true;
  if (current.role === "owner" && candidate.role !== "owner") return false;

  const candidateStatusRank = memberStatusRank[candidate.status] ?? 99;
  const currentStatusRank = memberStatusRank[current.status] ?? 99;
  if (candidateStatusRank !== currentStatusRank) {
    return candidateStatusRank < currentStatusRank;
  }

  const candidateRoleRank = memberRoleRank[candidate.role] ?? 99;
  const currentRoleRank = memberRoleRank[current.role] ?? 99;
  if (candidateRoleRank !== currentRoleRank) {
    return candidateRoleRank < currentRoleRank;
  }

  if (!current.id && candidate.id) return false;
  if (current.id && !candidate.id) return true;

  return false;
}

export function dedupeWorkspaceTeamMembers(
  members: WorkspaceTeamMemberRow[],
) {
  const deduped = new Map<string, WorkspaceTeamMemberRow>();

  for (const member of members) {
    const key = getMemberDedupeKey(member);
    if (!key) continue;

    const current = deduped.get(key);
    if (!current || shouldReplaceMember(current, member)) {
      deduped.set(key, member);
    }
  }

  return Array.from(deduped.values());
}

export async function listWorkspaceTeamSettings(workspaceId: string) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(
    "workspace_team_settings_summary",
    {
      p_workspace_id: workspaceId,
    },
  );
  if (error) throw error;
  const summary = parseRpcJson<WorkspaceTeamSettingsSummary>(data);
  return {
    members: dedupeWorkspaceTeamMembers(summary.members ?? []),
    pendingInvites: summary.pendingInvites ?? [],
  };
}

export async function searchWorkspaceTeamClients(input: {
  workspaceId: string;
  search?: string;
  limit?: number;
}) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("workspace_team_client_picker", {
    p_workspace_id: input.workspaceId,
    p_search: input.search ?? null,
    p_limit: input.limit ?? 50,
  });
  if (error) throw error;
  return (
    (data ?? []) as Array<{
      id: string;
      display_name: string;
      email: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
  }));
}

export async function updateWorkspaceTeamMemberRole(input: {
  workspaceId: string;
  memberId: string;
  role: InvitableWorkspaceRole;
}) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(
    "update_workspace_team_member_role",
    {
      p_workspace_id: input.workspaceId,
      p_member_id: input.memberId,
      p_role: input.role,
    },
  );
  if (error) throw error;
  return parseRpcJson<{ memberId: string; role: InvitableWorkspaceRole }>(data);
}

export async function updateWorkspaceTeamMemberStatus(input: {
  workspaceId: string;
  memberId: string;
  status: WorkspaceMemberStatus;
}) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(
    "update_workspace_team_member_status",
    {
      p_workspace_id: input.workspaceId,
      p_member_id: input.memberId,
      p_status: input.status,
    },
  );
  if (error) throw error;
  return parseRpcJson<{ memberId: string; status: WorkspaceMemberStatus }>(
    data,
  );
}

export async function updateWorkspaceTeamMemberClients(input: {
  workspaceId: string;
  memberId: string;
  clientIds: string[];
}) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc(
    "update_workspace_team_member_clients",
    {
      p_workspace_id: input.workspaceId,
      p_member_id: input.memberId,
      p_client_ids: input.clientIds,
    },
  );
  if (error) throw error;
  return parseRpcJson<{
    memberId: string;
    assignedClientCount: number;
  }>(data);
}

export {
  createWorkspaceTeamInvite,
  resendWorkspaceTeamInvite,
  revokeWorkspaceTeamInvite,
};
