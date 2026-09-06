import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260701120000_client_conversation_discoverability.sql",
  ),
  "utf8",
);

const clientMessagesPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "messages.tsx"),
  "utf8",
);

describe("client conversation discoverability", () => {
  it("adds a client-owned conversation ensure RPC without spoofable ids", () => {
    expect(migration).toContain(
      "create or replace function public.client_accessible_conversations_with_ensure()",
    );
    expect(migration).not.toContain("p_client_id");
    expect(migration).not.toContain("p_workspace_id");
    expect(migration).toContain("v_user_id uuid := (select auth.uid())");
    expect(migration).toContain("c.user_id = v_user_id");
    expect(migration).toContain("c.workspace_id is not null");
    expect(migration).toContain("c.status = 'active'::public.client_status");
  });

  it("creates missing conversations idempotently through the workspace/client unique key", () => {
    expect(migration).toContain(
      "insert into public.conversations (workspace_id, client_id)",
    );
    expect(migration).toContain(
      "on conflict on constraint conversations_workspace_client_key do nothing",
    );
    expect(migration).toContain(
      "where conv.workspace_id = relationship.workspace_id",
    );
    expect(migration).toContain("and conv.client_id = relationship.client_id");
  });

  it("grants only authenticated execution and leaves PT message helpers intact", () => {
    expect(migration).toContain(
      "revoke all on function public.client_accessible_conversations_with_ensure() from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.client_accessible_conversations_with_ensure() to authenticated",
    );
    expect(migration).toContain(
      "revoke all on function public.can_access_conversation(uuid, text) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.can_access_conversation(uuid, text) to authenticated",
    );
    expect(migration).not.toContain("ensure_pt_conversation");
    expect(migration).not.toContain("lead_conversations");
    expect(migration).not.toContain("lead_messages");
  });

  it("keeps copied old conversation ids unusable after the client relationship is inactive", () => {
    const accessFunction = migration.slice(
      migration.indexOf(
        "create or replace function public.can_access_conversation",
      ),
      migration.indexOf(
        "create or replace function public.client_accessible_conversations_with_ensure",
      ),
    );

    expect(accessFunction).toContain("c.user_id = (select auth.uid())");
    expect(accessFunction).toContain("c.workspace_id is not null");
    expect(accessFunction).toContain(
      "c.status = 'active'::public.client_status",
    );
  });

  it("wires /app/messages to the client-safe ensure/discovery RPC", () => {
    expect(clientMessagesPage).toContain("supabase.rpc");
    expect(clientMessagesPage).toContain(
      '"client_accessible_conversations_with_ensure"',
    );
    expect(clientMessagesPage).not.toContain('.from("conversations")');
    expect(clientMessagesPage).toContain(
      'queryKey: ["client-messages-workspace-conversations", session?.user?.id]',
    );
    expect(clientMessagesPage).not.toContain(
      'queryKey: ["client-messages-workspace-conversations", clientId]',
    );
  });
});
