export type MessageSenderAttribution = {
  senderUserId: string;
  displayName: string | null;
  workspaceRole: string | null;
};

export type MessageSenderLike = {
  senderUserId: string | null;
  senderRole: string | null;
  senderName: string | null;
};

function cleanDisplayName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getCoachRoleLabel(workspaceRole: string | null | undefined) {
  switch (workspaceRole) {
    case "assistant_coach":
      return "Co-coach";
    case "viewer":
      return "Viewer";
    case "owner":
    case "admin":
    case "coach":
    case "pt_owner":
    case "pt_coach":
    default:
      return "Coach";
  }
}

export function formatMessageSenderLabel({
  currentUserId,
  message,
  senderAttribution,
}: {
  currentUserId: string | null | undefined;
  message: MessageSenderLike;
  senderAttribution?: MessageSenderAttribution | null;
  conversationOwnerName?: string | null;
}) {
  if (message.senderUserId && message.senderUserId === currentUserId) {
    return "You";
  }

  if (message.senderRole === "system") {
    return "System";
  }

  const resolvedName =
    cleanDisplayName(senderAttribution?.displayName) ??
    cleanDisplayName(message.senderName);

  if (message.senderRole === "client") {
    return `${resolvedName ?? "Client"} · Client`;
  }

  if (message.senderRole === "pt") {
    const role = senderAttribution?.workspaceRole ?? null;
    if (!resolvedName && !role) {
      return "Former coach";
    }

    const safeName =
      resolvedName ??
      (role ? "Coach" : "Former coach");
    if (safeName === "Former coach") {
      return safeName;
    }
    return `${safeName} · ${getCoachRoleLabel(role)}`;
  }

  return resolvedName ?? "RepSync";
}
