import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildClientInboxSourceLabel,
  buildClientInboxThreadParam,
  dedupeLeadThreadSummaries,
  filterClientInboxVisibleThreads,
  isClientInboxThreadHideable,
  parseClientInboxThreadParam,
  resolveStableClientInboxSelection,
  resolveWorkspaceThreadTitle,
  sortClientInboxThreads,
} from "../../src/features/lead-chat/lib/client-inbox";
import type { MyLeadChatThreadSummary } from "../../src/features/lead-chat/lib/lead-chat";

const clientMessagesPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "messages.tsx"),
  "utf8",
);

function makeLeadThread(
  overrides: Partial<MyLeadChatThreadSummary> = {},
): MyLeadChatThreadSummary {
  return {
    leadId: "lead-1",
    conversationId: "conv-1",
    conversationStatus: "open",
    archivedReason: null,
    leadStatus: "contacted",
    submittedAt: "2026-04-01T08:00:00.000Z",
    ptUserId: "pt-1",
    ptDisplayName: "Coach Sarah",
    ptSlug: "coach-sarah",
    lastMessageAt: "2026-04-01T08:00:00.000Z",
    lastMessagePreview: "Hello",
    unreadCount: 0,
    ...overrides,
  };
}

describe("client inbox helper", () => {
  it("builds and parses workspace thread params", () => {
    const param = buildClientInboxThreadParam({
      type: "workspace",
      conversationId: "workspace-conv-1",
    });

    expect(param).toBe("workspace:workspace-conv-1");
    expect(parseClientInboxThreadParam(param)).toEqual({
      type: "workspace",
      conversationId: "workspace-conv-1",
    });
  });

  it("keeps active workspace conversations visible even when hidden locally", () => {
    const workspaceThread = {
      id: "workspace:workspace-conv-1",
      type: "workspace" as const,
      title: "Coach Sarah",
    };
    const leadThread = {
      id: "lead:lead-1",
      type: "lead" as const,
      title: "Lead chat",
    };

    expect(isClientInboxThreadHideable(workspaceThread)).toBe(false);
    expect(isClientInboxThreadHideable(leadThread)).toBe(true);

    expect(
      filterClientInboxVisibleThreads({
        threads: [workspaceThread, leadThread],
        hiddenThreadIds: [workspaceThread.id, leadThread.id],
      }),
    ).toEqual([workspaceThread]);
  });

  it("preserves selected threads across refetch and only falls back when absent", () => {
    expect(
      resolveStableClientInboxSelection({
        currentThreadId: "workspace:conv-1",
        requestedThreadId: null,
        threadIds: ["workspace:conv-2", "workspace:conv-1"],
        sourcesLoading: false,
      }),
    ).toBe("workspace:conv-1");

    expect(
      resolveStableClientInboxSelection({
        currentThreadId: "lead:converted",
        requestedThreadId: null,
        threadIds: ["workspace:conv-1"],
        sourcesLoading: false,
      }),
    ).toBe("workspace:conv-1");

    expect(
      resolveStableClientInboxSelection({
        currentThreadId: "workspace:conv-1",
        requestedThreadId: null,
        threadIds: [],
        sourcesLoading: true,
      }),
    ).toBe("workspace:conv-1");
  });

  it("sorts inbox threads deterministically when activity and unread state match", () => {
    const sorted = sortClientInboxThreads([
      {
        id: "workspace:b",
        unreadCount: 0,
        timestamp: "2026-04-01T08:00:00.000Z",
      },
      {
        id: "workspace:a",
        unreadCount: 0,
        timestamp: "2026-04-01T08:00:00.000Z",
      },
    ]);

    expect(sorted.map((thread) => thread.id)).toEqual([
      "workspace:a",
      "workspace:b",
    ]);
  });

  it("wires active workspace conversations as non-hideable in the client messages page", () => {
    expect(clientMessagesPage).toContain("filterClientInboxVisibleThreads");
    expect(clientMessagesPage).toContain("isClientInboxThreadHideable");
    expect(clientMessagesPage).toContain("canHideSelectedThread");
    expect(clientMessagesPage).toContain("Hide conversation?");
    expect(clientMessagesPage).toContain("Hide from inbox");
    expect(clientMessagesPage).not.toContain("Delete conversation?");
    expect(clientMessagesPage).not.toContain("Delete from inbox");
  });

  it("wires stable selection and previous data into the client messages page", () => {
    expect(clientMessagesPage).toContain("resolveStableClientInboxSelection");
    expect(clientMessagesPage).toContain("sortClientInboxThreads");
    expect(clientMessagesPage).toContain("visibleThreadIds");
    expect(clientMessagesPage).toContain("placeholderData: keepPreviousData");
    expect(clientMessagesPage).not.toContain(
      "convertedLeadHistoryMessages.length,\n    renderedWorkspaceMessages.length",
    );
  });

  it("wires active workspace message realtime without touching lead history", () => {
    expect(clientMessagesPage).toContain(
      "client-workspace-messages-${activeWorkspaceConversationId}",
    );
    expect(clientMessagesPage).toContain('table: "messages"');
    expect(clientMessagesPage).toContain(
      "filter: `conversation_id=eq.${activeWorkspaceConversationId}`",
    );
    expect(clientMessagesPage).toContain('"client-workspace-thread-messages"');
    expect(clientMessagesPage).toContain("activeWorkspaceConversationId");
    expect(clientMessagesPage).toContain(
      '"client-messages-workspace-conversations"',
    );
    expect(clientMessagesPage).toContain("session?.user?.id");
    expect(clientMessagesPage).not.toContain(
      'queryKey: ["converted-lead-history", activeWorkspaceConversationId]',
    );
  });

  it("uses an owned scroll timeline and attached composer in the client chat panel", () => {
    expect(clientMessagesPage).toContain(
      'className="min-h-0 flex-1 overflow-y-auto bg-background/10 overscroll-contain"',
    );
    expect(clientMessagesPage).toContain(
      'className="flex min-h-full flex-col justify-end gap-3 px-4 pb-5 pt-4"',
    );
    expect(clientMessagesPage).toContain("sticky bottom-0 border-t");
    expect(clientMessagesPage).not.toContain(
      "min-h-0 flex-1 space-y-3 overflow-y-auto",
    );
  });

  it("builds and parses lead thread params", () => {
    const param = buildClientInboxThreadParam({
      type: "lead",
      leadId: "lead-42",
    });

    expect(param).toBe("lead:lead-42");
    expect(parseClientInboxThreadParam(param)).toEqual({
      type: "lead",
      leadId: "lead-42",
    });
  });

  it("returns lead source labels for active and archived threads", () => {
    expect(
      buildClientInboxSourceLabel({
        threadType: "lead",
        archived: false,
      }),
    ).toBe("Lead chat");

    expect(
      buildClientInboxSourceLabel({
        threadType: "lead",
        archived: true,
      }),
    ).toBe("Lead chat (Archived)");
  });

  it("dedupes lead summaries by selecting the latest thread activity", () => {
    const deduped = dedupeLeadThreadSummaries([
      makeLeadThread({
        leadId: "lead-dup",
        submittedAt: "2026-04-01T08:00:00.000Z",
        lastMessageAt: "2026-04-01T09:00:00.000Z",
        unreadCount: 0,
      }),
      makeLeadThread({
        leadId: "lead-dup",
        submittedAt: "2026-04-01T08:00:00.000Z",
        lastMessageAt: "2026-04-01T11:00:00.000Z",
        unreadCount: 2,
        lastMessagePreview: "Most recent",
      }),
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.lastMessagePreview).toBe("Most recent");
    expect(deduped[0]?.unreadCount).toBe(2);
  });

  it("prefers latest coach sender name for workspace thread titles", () => {
    expect(
      resolveWorkspaceThreadTitle({
        workspaceName: "Alpha Performance",
        latestCoachSenderName: "Coach Sarah",
        lastMessageSenderName: "Client Name",
        lastMessageSenderRole: "client",
      }),
    ).toBe("Coach Sarah");
  });

  it("uses last PT sender name when available", () => {
    expect(
      resolveWorkspaceThreadTitle({
        workspaceName: "Alpha Performance",
        latestCoachSenderName: null,
        lastMessageSenderName: "Omar",
        lastMessageSenderRole: "pt",
      }),
    ).toBe("Omar");
  });

  it("falls back to workspace name (without coach prefix) then generic label", () => {
    expect(
      resolveWorkspaceThreadTitle({
        workspaceName: "Coach Sarah",
        latestCoachSenderName: null,
        lastMessageSenderName: "Client Name",
        lastMessageSenderRole: "client",
      }),
    ).toBe("Sarah");

    expect(
      resolveWorkspaceThreadTitle({
        workspaceName: null,
        latestCoachSenderName: null,
        lastMessageSenderName: null,
        lastMessageSenderRole: null,
      }),
    ).toBe("Conversation");
  });
});
