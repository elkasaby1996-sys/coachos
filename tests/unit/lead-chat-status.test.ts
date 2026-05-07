import { describe, expect, it } from "vitest";
import { isLeadChatWritable } from "../../src/features/lead-chat/lib/lead-chat";

describe("lead chat writability", () => {
  it("allows lead chat while actionable statuses are open", () => {
    expect(
      isLeadChatWritable({ leadStatus: "new", conversationStatus: "open" }),
    ).toBe(true);
    expect(
      isLeadChatWritable({ leadStatus: "contacted", conversationStatus: "open" }),
    ).toBe(true);
    expect(
      isLeadChatWritable({
        leadStatus: "approved_pending_workspace",
        conversationStatus: "open",
      }),
    ).toBe(true);
  });

  it("blocks writes when conversation is archived", () => {
    expect(
      isLeadChatWritable({ leadStatus: "contacted", conversationStatus: "archived" }),
    ).toBe(false);
  });

  it("blocks writes for converted and declined leads", () => {
    expect(
      isLeadChatWritable({ leadStatus: "converted", conversationStatus: "open" }),
    ).toBe(false);
    expect(
      isLeadChatWritable({ leadStatus: "declined", conversationStatus: "open" }),
    ).toBe(false);
  });

  it("keeps approved pending workspace writable even before thread status is hydrated", () => {
    expect(
      isLeadChatWritable({
        leadStatus: "approved_pending_workspace",
        conversationStatus: null,
      }),
    ).toBe(true);
  });

  it("stays read-only for converted/declined even if conversation status is missing", () => {
    expect(
      isLeadChatWritable({
        leadStatus: "converted",
        conversationStatus: null,
      }),
    ).toBe(false);
    expect(
      isLeadChatWritable({
        leadStatus: "declined",
        conversationStatus: null,
      }),
    ).toBe(false);
  });
});
