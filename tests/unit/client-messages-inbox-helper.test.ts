import { describe, expect, it } from "vitest";
import {
  buildClientInboxSourceLabel,
  buildClientInboxThreadParam,
  dedupeLeadThreadSummaries,
  parseClientInboxThreadParam,
  resolveWorkspaceThreadTitle,
} from "../../src/features/lead-chat/lib/client-inbox";
import type { MyLeadChatThreadSummary } from "../../src/features/lead-chat/lib/lead-chat";

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
