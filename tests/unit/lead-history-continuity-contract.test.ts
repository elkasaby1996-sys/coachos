import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260701130000_converted_lead_history_for_active_conversation.sql",
  ),
  "utf8",
);

const leadChatLib = readFileSync(
  resolve(process.cwd(), "src", "features", "lead-chat", "lib", "lead-chat.ts"),
  "utf8",
);

const clientMessagesPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "messages.tsx"),
  "utf8",
);

const ptMessagesPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "messages.tsx"),
  "utf8",
);

describe("converted lead history continuity", () => {
  it("adds an active-conversation scoped RPC for converted lead history", () => {
    expect(migration).toContain(
      "create or replace function public.converted_lead_history_for_conversation",
    );
    expect(migration).toContain("p_conversation_id uuid");
    expect(migration).toContain(
      "public.can_access_conversation(p_conversation_id, 'clients.message')",
    );
    expect(migration).toContain(
      "lc.converted_conversation_id = v_conversation.id",
    );
    expect(migration).toContain("join public.lead_messages lm");
    expect(migration).toContain("order by lm.sent_at asc, lm.id asc");
  });

  it("allows only the converted client or workspace owner/admin to read lead history", () => {
    expect(migration).toContain("c.user_id = v_actor_user_id");
    expect(migration).toContain("c.status = 'active'::public.client_status");
    expect(migration).toContain("v_context.role in ('owner', 'admin')");
    expect(migration).not.toContain("v_context.role in ('owner', 'admin', 'assistant_coach')");
    expect(migration).not.toContain("workspace_member_client_assignments");
    expect(migration).not.toContain("accessible_client_ids");
  });

  it("does not copy or delete lead messages while exposing them read-only", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.messages\b/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.lead_messages\b/i);
    expect(migration).not.toMatch(/update\s+public\.lead_messages\b/i);
    expect(migration).toContain(
      "revoke all on function public.converted_lead_history_for_conversation(uuid) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.converted_lead_history_for_conversation(uuid) to authenticated",
    );
  });

  it("loads converted lead history through the lead chat helper", () => {
    expect(leadChatLib).toContain("ConvertedLeadHistoryMessage");
    expect(leadChatLib).toContain(
      '.rpc("converted_lead_history_for_conversation"',
    );
    expect(leadChatLib).toContain(
      'queryKey: ["converted-lead-history", conversationId]',
    );
  });

  it("renders lead history above active messages in client and PT active chats", () => {
    for (const source of [clientMessagesPage, ptMessagesPage]) {
      expect(source).toContain("Previous application conversation");
      expect(source).toContain("convertedLeadHistoryMessages.length");
      expect(source).toContain("Read-only history");
      expect(source).toContain("Active coaching conversation");
      expect(source).toContain("useConvertedLeadHistory");
      expect(source).toContain("leadHistoryCollapseThreshold");
      expect(source).toContain("isLeadHistoryExpanded");
      expect(source).toContain("aria-expanded={isLeadHistoryExpanded}");
      expect(source).not.toContain(
        "rounded-[20px] border border-border/65 bg-background/30 px-4 py-4",
      );
      expect(source).not.toContain(
        "Messages from before this client joined the workspace.",
      );
    }
  });
});
