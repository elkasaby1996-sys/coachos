import { buildUnifiedSourceLabel } from "../../../lib/source-labels";
import type { MyLeadChatThreadSummary } from "./lead-chat";

export type ClientInboxThreadRef =
  | { type: "workspace"; conversationId: string }
  | { type: "lead"; leadId: string };

export type ClientInboxHideableThread = {
  id: string;
  type: "workspace" | "lead";
};

export type ClientInboxSortableThread = {
  id: string;
  unreadCount: number;
  timestamp: string | null;
};

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

export function isClientInboxThreadHideable(
  thread: ClientInboxHideableThread,
) {
  return thread.type !== "workspace";
}

export function filterClientInboxVisibleThreads<
  Thread extends ClientInboxHideableThread,
>(params: {
  threads: Thread[];
  hiddenThreadIds: string[];
}): Thread[] {
  if (params.hiddenThreadIds.length === 0) return params.threads;

  const hidden = new Set(params.hiddenThreadIds);
  return params.threads.filter(
    (thread) => !isClientInboxThreadHideable(thread) || !hidden.has(thread.id),
  );
}

export function resolveStableClientInboxSelection(params: {
  currentThreadId: string | null;
  requestedThreadId: string | null;
  threadIds: string[];
  sourcesLoading: boolean;
}) {
  const threadIdSet = new Set(params.threadIds);

  if (
    params.requestedThreadId &&
    threadIdSet.has(params.requestedThreadId)
  ) {
    return params.requestedThreadId;
  }

  if (params.currentThreadId && threadIdSet.has(params.currentThreadId)) {
    return params.currentThreadId;
  }

  if (params.threadIds.length > 0) {
    return params.threadIds[0] ?? null;
  }

  if (params.sourcesLoading) {
    return params.currentThreadId;
  }

  return null;
}

export function sortClientInboxThreads<Thread extends ClientInboxSortableThread>(
  threads: Thread[],
): Thread[] {
  return [...threads].sort((a, b) => {
    if (a.unreadCount !== b.unreadCount) {
      return b.unreadCount - a.unreadCount;
    }

    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return a.id.localeCompare(b.id);
  });
}

function normalizeDisplayName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isEmailLikeDisplayName(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeCoachDisplayName(value: string | null | undefined) {
  const normalized = normalizeDisplayName(value);
  if (!normalized || isEmailLikeDisplayName(normalized)) return null;
  return normalized;
}

export function resolveWorkspaceThreadTitle(params: {
  workspaceName?: string | null;
  coachDisplayName?: string | null;
  latestCoachSenderName?: string | null;
  lastMessageSenderName?: string | null;
  lastMessageSenderRole?: string | null;
}) {
  const coachDisplayName = normalizeCoachDisplayName(params.coachDisplayName);
  if (coachDisplayName) return coachDisplayName;

  const workspaceName = normalizeDisplayName(params.workspaceName);
  if (workspaceName) {
    return workspaceName.replace(/^coach\s+/i, "").trim();
  }

  const coachSenderName = normalizeCoachDisplayName(
    params.latestCoachSenderName,
  );
  if (coachSenderName) return coachSenderName;

  if (params.lastMessageSenderRole === "pt") {
    const lastPtSenderName = normalizeCoachDisplayName(
      params.lastMessageSenderName,
    );
    if (lastPtSenderName) return lastPtSenderName;
  }

  const hasExplicitEmptyWorkspaceContext =
    "workspaceName" in params ||
    "coachDisplayName" in params ||
    "latestCoachSenderName" in params ||
    "lastMessageSenderName" in params ||
    "lastMessageSenderRole" in params;

  return hasExplicitEmptyWorkspaceContext ? "Conversation" : "Coach";
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
