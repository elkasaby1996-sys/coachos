import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
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
const migrationSql = readdirSync(
  resolve(process.cwd(), "supabase", "migrations"),
)
  .filter((fileName) => fileName.endsWith(".sql"))
  .map((fileName) =>
    readFileSync(
      resolve(process.cwd(), "supabase", "migrations", fileName),
      "utf8",
    ),
  )
  .join("\n");

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

  it("wires PT active message realtime to the same query keys used by the thread", () => {
    expect(ptMessagesPage).toContain("pt-messages-${activeConversationId}");
    expect(ptMessagesPage).toContain('table: "messages"');
    expect(ptMessagesPage).toContain(
      "filter: `conversation_id=eq.${activeConversationId}`",
    );
    expect(ptMessagesPage).toContain(
      'queryKey: ["pt-messages-thread", activeConversationId]',
    );
    expect(ptMessagesPage).toContain(
      'queryKey: ["pt-messages-conversations", workspaceId]',
    );
    expect(ptMessagesPage).toContain("getPtMessagesUnreadKey(workspaceId)");
  });

  it("wires PT sidebar previews to accessible conversation message events without switching threads", () => {
    expect(ptMessagesPage).toContain(
      "pt-sidebar-message-previews-${workspaceId}",
    );
    expect(ptMessagesPage).toContain("conversationIds.forEach");
    expect(ptMessagesPage).toContain(
      "filter: `conversation_id=eq.${conversationId}`",
    );
    expect(ptMessagesPage).toContain(
      'queryKey: ["pt-messages-conversations", workspaceId]',
    );
    expect(ptMessagesPage).toContain("getPtMessagesUnreadKey(workspaceId)");
    expect(ptMessagesPage).not.toContain(
      "setSelectedClientId(payload.new.client_id",
    );
  });

  it("uses an owned scroll timeline and attached composer in the PT chat panel", () => {
    expect(ptMessagesPage).toContain('className="flex h-[560px] flex-col"');
    expect(ptMessagesPage).toContain(
      'className="min-h-0 flex-1 overflow-y-auto px-1 pb-4 pr-2"',
    );
    expect(ptMessagesPage).toContain(
      'className="flex min-h-full flex-col justify-end gap-3"',
    );
    expect(ptMessagesPage).toContain(
      "border-t border-border/60 bg-background/60 p-3",
    );
    expect(ptMessagesPage).not.toContain(
      'className="flex h-[560px] flex-col gap-4"',
    );
    expect(ptMessagesPage).not.toContain("justify-between rounded-[24px]");
  });

  it("enables realtime publication for active conversation messages", () => {
    expect(migrationSql).toContain("supabase_realtime");
    expect(migrationSql).toContain("public.messages");
    expect(migrationSql).toContain("pg_publication_tables");
  });
});
