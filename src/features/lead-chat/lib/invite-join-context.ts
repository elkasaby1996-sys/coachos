const INVITE_JOINED_PARAM = "invite_joined";
const JOINED_WORKSPACE_ID_PARAM = "joined_workspace_id";
const JOINED_WORKSPACE_NAME_PARAM = "joined_workspace_name";
const JOINED_PT_NAME_PARAM = "joined_pt_name";

export type InviteJoinContext = {
  shouldShowModal: boolean;
  workspaceName: string;
  message: string;
};

function normalizeQueryValue(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function deriveInviteJoinContext(params: {
  searchParams: URLSearchParams;
  hasWorkspaceMembership: boolean;
}): InviteJoinContext {
  const joinedWorkspaceName = normalizeQueryValue(
    params.searchParams.get(JOINED_WORKSPACE_NAME_PARAM),
  );
  const joinedWorkspaceId = normalizeQueryValue(
    params.searchParams.get(JOINED_WORKSPACE_ID_PARAM),
  );
  const joinedPtDisplayName = normalizeQueryValue(
    params.searchParams.get(JOINED_PT_NAME_PARAM),
  );
  const inviteJoined = params.searchParams.get(INVITE_JOINED_PARAM) === "1";
  const shouldShowModal = inviteJoined && params.hasWorkspaceMembership;

  let message =
    "Your coach assigned you to a workspace. Continue from your dashboard modules.";
  if (joinedWorkspaceId) {
    message =
      "Your coach assigned your account to this workspace. Use Home, Messages, and your training modules to continue.";
  }
  if (joinedPtDisplayName) {
    message = `You can now continue with ${joinedPtDisplayName} from your dashboard.`;
  }

  return {
    shouldShowModal,
    workspaceName: joinedWorkspaceName ?? "your coaching workspace",
    message,
  };
}

export function clearInviteJoinParams(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams);
  next.delete(INVITE_JOINED_PARAM);
  next.delete(JOINED_WORKSPACE_ID_PARAM);
  next.delete(JOINED_WORKSPACE_NAME_PARAM);
  next.delete(JOINED_PT_NAME_PARAM);
  return next;
}
