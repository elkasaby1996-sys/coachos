import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("lead chat SQL contracts", () => {
  const leadChatMigration = readMigration(
    "20260409160000_add_lead_chat_architecture.sql",
  );
  const hardeningMigration = readMigration(
    "20260409193000_harden_lead_chat_permissions.sql",
  );

  it("keeps actionable lead statuses open for lead chat", () => {
    expect(leadChatMigration).toMatch(
      /array\[\s*'new'::text,\s*'contacted'::text,\s*'approved_pending_workspace'::text\s*\]/m,
    );
  });

  it("moves lead status to contacted on first meaningful chat flow", () => {
    expect(leadChatMigration).toContain("set status = 'contacted'");
    expect(leadChatMigration).toContain("and lead.status = 'new'");
  });

  it("archives lead conversations on converted or declined transitions", () => {
    expect(leadChatMigration).toContain("lead_conversation_archived_converted");
    expect(leadChatMigration).toContain("lead_conversation_archived_declined");
  });

  it("keeps approved_pending_workspace path open with explicit fallback", () => {
    expect(leadChatMigration).toContain("'approved_pending_workspace'::text");
    expect(leadChatMigration).toContain("lead_workspace_assignment_failed");
  });

  it("enforces archived conversations as read-only at send-message RPC level", () => {
    expect(leadChatMigration).toContain("Lead conversation is archived");
  });

  it("contains explicit authorization checks for send and read RPCs", () => {
    expect(leadChatMigration).toContain("Not allowed to message this lead");
    expect(leadChatMigration).toContain(
      "Not allowed to access this conversation",
    );
  });

  it("keeps participant-scoped RLS policies on lead chat tables", () => {
    expect(leadChatMigration).toContain(
      "create policy lead_conversations_select_participants",
    );
    expect(leadChatMigration).toContain(
      "create policy lead_messages_select_participants",
    );
    expect(leadChatMigration).toContain(
      "create policy lead_conversation_participants_select_own",
    );
  });

  it("does not migrate lead chat into workspace chat tables", () => {
    expect(leadChatMigration).not.toMatch(/insert\s+into\s+public\.messages\b/i);
    expect(leadChatMigration).not.toMatch(
      /insert\s+into\s+public\.conversations\b/i,
    );
  });

  it("restricts direct conversation-ensure calls to owning PT or lead participant", () => {
    expect(hardeningMigration).toContain(
      "Not allowed to access this lead conversation",
    );
    expect(hardeningMigration).toContain("v_actor_user_id := auth.uid()");
    expect(hardeningMigration).toContain(
      "v_actor_user_id <> v_lead.applicant_user_id",
    );
    expect(hardeningMigration).toContain(
      "v_actor_user_id <> v_lead.user_id",
    );
  });
});
