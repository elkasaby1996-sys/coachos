import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260701123000_lead_conversion_conversation_link.sql",
  ),
  "utf8",
);

const clientMessagesPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "messages.tsx"),
  "utf8",
);

const leadChatLib = readFileSync(
  resolve(process.cwd(), "src", "features", "lead-chat", "lib", "lead-chat.ts"),
  "utf8",
);

describe("lead conversion conversation link", () => {
  it("adds a durable link from converted lead conversations to active conversations", () => {
    expect(migration).toContain("alter table public.lead_conversations");
    expect(migration).toContain(
      "add column if not exists converted_conversation_id uuid",
    );
    expect(migration).toContain(
      "references public.conversations(id) on delete set null",
    );
    expect(migration).toContain(
      "create index if not exists lead_conversations_converted_conversation_id_idx",
    );
  });

  it("ensures and links the active conversation during lead conversion", () => {
    expect(migration).toContain(
      "create or replace function public.link_converted_lead_conversation",
    );
    expect(migration).toContain(
      "insert into public.conversations (workspace_id, client_id)",
    );
    expect(migration).toContain(
      "on conflict on constraint conversations_workspace_client_key do nothing",
    );
    expect(migration).toContain("update public.lead_conversations lc");
    expect(migration).toContain(
      "set converted_conversation_id = v_active_conversation_id",
    );
    expect(migration).toContain("where lc.lead_id = v_lead.id");
    expect(migration).toContain(
      "create trigger trg_link_converted_lead_conversation",
    );
    expect(migration).toContain(
      "execute function public.handle_link_converted_lead_conversation()",
    );
    expect(migration).toContain(
      "grant execute on function public.link_converted_lead_conversation(uuid) to service_role",
    );
    expect(migration).not.toContain(
      "grant execute on function public.link_converted_lead_conversation(uuid) to authenticated",
    );
  });

  it("keeps conversion idempotent and does not copy lead messages into active messages", () => {
    expect(migration).toContain(
      "where conv.workspace_id = v_lead.converted_workspace_id",
    );
    expect(migration).toContain(
      "and conv.client_id = v_lead.converted_client_id",
    );
    expect(migration).not.toMatch(/insert\s+into\s+public\.messages\b/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.lead_messages\b/i);
  });

  it("returns the converted conversation id in client lead thread summaries", () => {
    expect(migration).toContain(
      "drop function if exists public.my_lead_chat_threads()",
    );
    expect(migration).toContain("converted_conversation_id uuid");
    expect(migration).toContain("convo.converted_conversation_id");
    expect(leadChatLib).toContain("convertedConversationId");
    expect(leadChatLib).toContain("converted_conversation_id");
  });

  it("collapses converted linked lead chats when the active conversation is present", () => {
    expect(clientMessagesPage).toContain("workspaceConversationIdsSet");
    expect(clientMessagesPage).toContain("thread.convertedConversationId");
    expect(clientMessagesPage).toContain('thread.leadStatus === "converted"');
    expect(clientMessagesPage).toContain(
      "return !workspaceConversationIdsSet.has",
    );
  });
});
