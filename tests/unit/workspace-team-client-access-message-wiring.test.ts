import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ptMessagesPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "messages.tsx"),
  "utf8",
);
const ptMessageCompose = readFileSync(
  resolve(process.cwd(), "src", "components", "pt", "pt-message-compose.tsx"),
  "utf8",
);
const messageService = readFileSync(
  resolve(process.cwd(), "src", "lib", "messages.ts"),
  "utf8",
);

describe("workspace team client access message wiring", () => {
  it("loads PT inbox clients and conversations through assignment-aware RPCs", () => {
    for (const source of [ptMessagesPage, ptMessageCompose]) {
      expect(source).toContain('.rpc("pt_message_recipients"');
      expect(source).toContain("pt_accessible_conversations");
      expect(source).toContain('.rpc("ensure_pt_conversation"');
      expect(source).not.toContain('.from("clients")');
      expect(source).not.toContain('.from("conversations")');
    }
  });

  it("sends messages through the protected server RPC instead of direct inserts", () => {
    expect(messageService).toContain('.rpc("send_conversation_message"');
    expect(messageService).not.toContain('.from("messages")');
  });

  it("keeps the assigned-only empty state clear in PT inbox surfaces", () => {
    expect(ptMessagesPage).toContain("No clients assigned yet");
    expect(ptMessageCompose).toContain("No clients assigned yet");
    expect(ptMessagesPage).toContain(
      "Ask the workspace owner or admin to assign clients to you.",
    );
  });

  it("keeps PT message refetches from blanking or smooth-jumping the active thread", () => {
    expect(ptMessagesPage).toContain("placeholderData: keepPreviousData");
    expect(ptMessagesPage).toContain('behavior: "auto"');
    expect(ptMessagesPage).not.toContain('behavior: "smooth"');
  });
});
