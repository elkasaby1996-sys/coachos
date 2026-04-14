import { buildUnifiedSourceLabel } from "../../../lib/source-labels";
import type { MyLeadChatThreadSummary } from "./lead-chat";

export type ClientInboxThreadRef =
  | { type: "workspace"; conversationId: string }
  | { type: "lead"; leadId: string };

export function buildClientInboxThreadParam(ref: ClientInboxThreadRef) {
  if (ref.type === "workspace") {
    return `workspace:${ref.conversationId}`;
  }
  return `lead:${ref.leadId}`;
}

export function parseClientInboxThreadParam(
  value: string | null | undefined,
): ClientInboxThreadRef | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;

  if (normalized.startsWith("workspace:")) {
    const conversationId = normalized.slice("workspace:".length).trim();
    if (!conversationId) return null;
    return { type: "workspace", conversationId };
  }

  if (normalized.startsWith("lead:")) {
    const leadId = normalized.slice("lead:".length).trim();
    if (!leadId) return null;
    return { type: "lead", leadId };
  }

  return null;
}

export function buildClientInboxSourceLabel(params: {
  threadType: "workspace" | "lead";
  workspaceId?: string | null;
  workspaceName?: string | null;
  archived?: boolean;
}) {
  if (params.threadType === "workspace") {
    return buildUnifiedSourceLabel({
      workspaceId: params.workspaceId ?? null,
      workspaceName: params.workspaceName ?? null,
    });
  }

  return params.archived ? "Lead chat (Archived)" : "Lead chat";
}

function normalizeDisplayName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveWorkspaceThreadTitle(params: {
  workspaceName?: string | null;
  latestCoachSenderName?: string | null;
  lastMessageSenderName?: string | null;
  lastMessageSenderRole?: string | null;
}) {
  const coachSenderName = normalizeDisplayName(params.latestCoachSenderName);
  if (coachSenderName) return coachSenderName;

  if (params.lastMessageSenderRole === "pt") {
    const lastPtSenderName = normalizeDisplayName(params.lastMessageSenderName);
    if (lastPtSenderName) return lastPtSenderName;
  }

  const workspaceName = normalizeDisplayName(params.workspaceName);
  if (workspaceName) {
    return workspaceName.replace(/^coach\s+/i, "").trim();
  }

  return "Conversation";
}

function getThreadActivityTimestamp(
  thread: Pick<MyLeadChatThreadSummary, "lastMessageAt" | "submittedAt">,
) {
  return thread.lastMessageAt ?? thread.submittedAt ?? "";
}

export function dedupeLeadThreadSummaries(
  threads: MyLeadChatThreadSummary[],
): MyLeadChatThreadSummary[] {
  return Array.from(
    threads
      .reduce((map, thread) => {
        const key =
          thread.leadId ||
          `${thread.ptSlug ?? "unknown-coach"}:${thread.submittedAt ?? thread.lastMessageAt ?? "unknown-time"}`;
        const current = map.get(key);
        if (!current) {
          map.set(key, thread);
          return map;
        }

        const threadActivity = getThreadActivityTimestamp(thread);
        const currentActivity = getThreadActivityTimestamp(current);
        if (
          threadActivity > currentActivity ||
          thread.unreadCount > current.unreadCount
        ) {
          map.set(key, thread);
        }

        return map;
      }, new Map<string, MyLeadChatThreadSummary>())
      .values(),
  );
}
