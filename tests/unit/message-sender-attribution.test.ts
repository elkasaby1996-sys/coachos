import { describe, expect, it } from "vitest";
import {
  formatMessageSenderLabel,
  type MessageSenderAttribution,
} from "../../src/lib/message-sender-attribution";

const ownerAttribution: MessageSenderAttribution = {
  senderUserId: "coach-a",
  displayName: "Coach A",
  workspaceRole: "owner",
};

const assistantAttribution: MessageSenderAttribution = {
  senderUserId: "coach-c",
  displayName: "Coach C",
  workspaceRole: "assistant_coach",
};

describe("message sender attribution", () => {
  it("uses the actual message sender instead of the conversation owner", () => {
    expect(
      formatMessageSenderLabel({
        currentUserId: "client-1",
        message: {
          senderUserId: "coach-c",
          senderRole: "pt",
          senderName: "Coach C",
        },
        senderAttribution: assistantAttribution,
      }),
    ).toBe("Coach C · Co-coach");
  });

  it("maps owner coach messages to Coach", () => {
    expect(
      formatMessageSenderLabel({
        currentUserId: "client-1",
        message: {
          senderUserId: "coach-a",
          senderRole: "pt",
          senderName: "Coach A",
        },
        senderAttribution: ownerAttribution,
      }),
    ).toBe("Coach A · Coach");
  });

  it("maps assistant coach messages to Co-coach", () => {
    expect(
      formatMessageSenderLabel({
        currentUserId: "client-1",
        message: {
          senderUserId: "coach-c",
          senderRole: "pt",
          senderName: "Coach C",
        },
        senderAttribution: assistantAttribution,
      }),
    ).toBe("Coach C · Co-coach");
  });

  it("maps the current user's own message to You", () => {
    expect(
      formatMessageSenderLabel({
        currentUserId: "coach-c",
        message: {
          senderUserId: "coach-c",
          senderRole: "pt",
          senderName: "Coach C",
        },
        senderAttribution: assistantAttribution,
      }),
    ).toBe("You");
  });

  it("maps client messages to Client for coach-facing views", () => {
    expect(
      formatMessageSenderLabel({
        currentUserId: "coach-a",
        message: {
          senderUserId: "client-1",
          senderRole: "client",
          senderName: "Taylor",
        },
        senderAttribution: {
          senderUserId: "client-1",
          displayName: "Taylor",
          workspaceRole: "client",
        },
      }),
    ).toBe("Taylor · Client");
  });

  it("does not fall back to the owner for a removed or missing coach", () => {
    expect(
      formatMessageSenderLabel({
        currentUserId: "client-1",
        message: {
          senderUserId: "removed-coach",
          senderRole: "pt",
          senderName: null,
        },
        conversationOwnerName: "Coach A",
        senderAttribution: null,
      }),
    ).toBe("Former coach");
  });
});
