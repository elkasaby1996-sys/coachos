import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260509190000_workspace_team_client_access_hardening.sql",
  ),
  "utf8",
);
const lintFixMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260509194000_workspace_team_conversation_lint_fix.sql",
  ),
  "utf8",
);
const coCoachMessagingMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702100000_co_coach_messaging_permissions.sql",
  ),
  "utf8",
);
const senderAttributionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702103000_message_sender_attribution.sql",
  ),
  "utf8",
);

describe("workspace team client access hardening SQL contract", () => {
  it("adds assignment-aware conversation and messaging helpers", () => {
    expect(migration).toContain(
      "create or replace function public.can_access_conversation",
    );
    expect(migration).toContain(
      "create or replace function public.pt_message_recipients",
    );
    expect(migration).toContain(
      "create or replace function public.pt_accessible_conversations",
    );
    expect(migration).toContain(
      "create or replace function public.ensure_pt_conversation",
    );
    expect(migration).toContain(
      "create or replace function public.send_conversation_message",
    );
    expect(migration).toContain(
      "join public.accessible_client_ids(p_workspace_id) aci",
    );
    expect(migration).toContain(
      "public.can_access_client(p_client_id, 'clients.message')",
    );
    expect(migration).toContain("p_sender_user_id is distinct from v_user_id");
  });

  it("hardens conversation, message, and typing RLS with assignment-aware checks", () => {
    expect(migration).toContain(
      "drop policy if exists conversations_access on public.conversations",
    );
    expect(migration).toContain(
      "drop policy if exists messages_access on public.messages",
    );
    expect(migration).toContain(
      "drop policy if exists message_typing_access on public.message_typing",
    );
    expect(migration).toContain(
      "public.can_access_conversation(id, 'clients.message')",
    );
    expect(migration).toContain(
      "public.can_access_conversation(conversation_id, 'clients.message')",
    );
  });

  it("requires the right permissions for client write and delivery RPCs", () => {
    expect(migration).toContain(
      "public.can_access_client(p_client_id, 'clients.edit')",
    );
    expect(migration).toContain(
      "public.can_access_client(p_client_id, 'delivery.manage')",
    );
    expect(migration).toContain(
      "public.can_access_client(p_client_id, 'clients.lifecycle.update')",
    );
  });

  it("does not use lifecycle, risk, or onboarding values as access-control inputs", () => {
    const accessBody = migration.slice(
      migration.indexOf(
        "create or replace function public.can_access_conversation",
      ),
      migration.indexOf(
        "create or replace function public.pt_update_client_admin_fields",
      ),
    );

    expect(accessBody).not.toContain("manual_risk_flag");
    expect(accessBody).not.toContain("risk");
    expect(accessBody).not.toContain("onboarding");
    expect(accessBody).not.toContain("lifecycle_state =");
  });

  it("keeps conversation creation lint-clean while preserving message access checks", () => {
    expect(lintFixMigration).toContain(
      "create or replace function public.ensure_pt_conversation",
    );
    expect(lintFixMigration).toContain(
      "public.can_access_client(p_client_id, 'clients.message')",
    );
    expect(lintFixMigration).toContain(
      "on conflict on constraint conversations_workspace_client_key do nothing",
    );
    expect(lintFixMigration).toContain(
      "where conv.workspace_id = p_workspace_id",
    );
  });

  it("models active chat as one conversation per workspace/client relationship", () => {
    expect(lintFixMigration).toContain(
      "insert into public.conversations (workspace_id, client_id)",
    );
    expect(lintFixMigration).toContain(
      "on conflict on constraint conversations_workspace_client_key do nothing",
    );
    expect(lintFixMigration).toContain(
      "where conv.workspace_id = p_workspace_id",
    );
    expect(lintFixMigration).toContain("and conv.client_id = p_client_id");
    expect(lintFixMigration).not.toContain("pt_user_id");
    expect(lintFixMigration).not.toContain("coach_user_id");
  });

  it("locks assistant messaging to assigned clients and keeps viewers out", () => {
    expect(coCoachMessagingMigration).toContain(
      "create or replace function public.can_access_client",
    );
    expect(coCoachMessagingMigration).toContain("p_permission = 'clients.message'");
    expect(coCoachMessagingMigration).toContain(
      "v_context.role = 'assistant_coach'",
    );
    expect(coCoachMessagingMigration).toContain(
      "from public.workspace_member_client_assignments wmca",
    );
    expect(coCoachMessagingMigration).toContain(
      "public.can_access_client(c.id, 'clients.message')",
    );
    expect(coCoachMessagingMigration).toContain(
      "public.can_access_conversation(conversation_id, 'clients.message')",
    );

    const assistantMessageBranch = coCoachMessagingMigration.indexOf(
      "p_permission = 'clients.message'",
    );
    const allClientsBranch = coCoachMessagingMigration.indexOf(
      "v_context.client_access_mode = 'all_clients'",
    );
    expect(assistantMessageBranch).toBeGreaterThanOrEqual(0);
    expect(allClientsBranch).toBeGreaterThan(assistantMessageBranch);
  });

  it("does not let assistant all-client scope bypass messaging assignment", () => {
    const assistantBranchStart = coCoachMessagingMigration.indexOf(
      "if p_permission = 'clients.message'",
    );
    const assistantBranchEnd = coCoachMessagingMigration.indexOf(
      "if v_context.client_access_mode = 'all_clients'",
    );
    const assistantBranch = coCoachMessagingMigration.slice(
      assistantBranchStart,
      assistantBranchEnd,
    );

    expect(assistantBranch).toContain("v_context.role = 'assistant_coach'");
    expect(assistantBranch).toContain("return exists (");
    expect(assistantBranch).toContain(
      "from public.workspace_member_client_assignments wmca",
    );
    expect(assistantBranch).toContain("wmca.member_id = v_context.member_id");
    expect(assistantBranch).toContain("wmca.client_id = v_client.id");
    expect(assistantBranch).not.toContain("client_access_mode = 'all_clients'");
  });

  it("routes message notifications through permission-aware recipient logic", () => {
    expect(coCoachMessagingMigration).toContain(
      "create or replace function public.handle_message_received_notifications",
    );
    expect(coCoachMessagingMigration).not.toContain("role like 'pt_%'");
    expect(coCoachMessagingMigration).not.toContain("role::text like 'pt_%'");
    expect(coCoachMessagingMigration).toContain(
      "public.has_workspace_permission(",
    );
    expect(coCoachMessagingMigration).toContain(
      "wmca.client_id = v_conversation.client_id",
    );
    expect(coCoachMessagingMigration).toContain(
      "wm.user_id is distinct from new.sender_user_id",
    );
    expect(coCoachMessagingMigration).toContain("wm.status = 'active'");
    expect(coCoachMessagingMigration).toContain("'clients.message'");
    expect(coCoachMessagingMigration).toContain(
      "public.normalize_workspace_role(wm.role::text) <> 'assistant_coach'",
    );
    expect(coCoachMessagingMigration).toContain(
      "wm.client_access_mode = 'all_clients'",
    );
  });

  it("notifies only the client when a coach or co-coach sends a message", () => {
    const coachSenderBranchStart = coCoachMessagingMigration.indexOf(
      "if new.sender_role = 'pt' then",
    );
    const clientSenderBranchStart = coCoachMessagingMigration.indexOf(
      "if new.sender_role = 'client' then",
    );
    const coachSenderBranch = coCoachMessagingMigration.slice(
      coachSenderBranchStart,
      clientSenderBranchStart,
    );

    expect(coachSenderBranchStart).toBeGreaterThanOrEqual(0);
    expect(clientSenderBranchStart).toBeGreaterThan(coachSenderBranchStart);
    expect(coachSenderBranch).toContain("v_conversation.client_user_id");
    expect(coachSenderBranch).toContain("'/app/messages'");
    expect(coachSenderBranch).toContain("return new;");
    expect(coachSenderBranch).not.toContain("workspace_members");
    expect(coachSenderBranch).not.toContain("workspace_member_client_assignments");
  });

  it("notifies the owner/admin team and assigned co-coaches when a client sends", () => {
    const clientSenderBranchStart = coCoachMessagingMigration.indexOf(
      "if new.sender_role = 'client' then",
    );
    const clientSenderBranch = coCoachMessagingMigration.slice(
      clientSenderBranchStart,
      coCoachMessagingMigration.indexOf("return new;", clientSenderBranchStart),
    );

    expect(clientSenderBranchStart).toBeGreaterThanOrEqual(0);
    expect(clientSenderBranch).toContain(
      "public.normalize_workspace_role(wm.role::text) in ('owner', 'admin')",
    );
    expect(clientSenderBranch).toContain(
      "public.normalize_workspace_role(wm.role::text) <> 'assistant_coach'",
    );
    expect(clientSenderBranch).toContain(
      "from public.workspace_member_client_assignments wmca",
    );
    expect(clientSenderBranch).toContain(
      "wmca.client_id = v_conversation.client_id",
    );
    expect(clientSenderBranch).toContain("wm.status = 'active'");
    expect(clientSenderBranch).toContain("union");
    expect(clientSenderBranch).toContain("select w.owner_user_id");
    expect(clientSenderBranch).not.toContain("'workspaces.view'");
  });

  it("resolves message sender labels only for readable conversations", () => {
    expect(senderAttributionMigration).toContain(
      "create or replace function public.conversation_sender_attributions",
    );
    expect(senderAttributionMigration).toContain(
      "public.can_access_conversation(p_conversation_id, 'clients.message')",
    );
    expect(senderAttributionMigration).toContain(
      "from public.messages m",
    );
    expect(senderAttributionMigration).toContain(
      "m.conversation_id = p_conversation_id",
    );
    expect(senderAttributionMigration).toContain(
      "public.normalize_workspace_role(wm.role::text)",
    );
    expect(senderAttributionMigration).toContain(
      "grant execute on function public.conversation_sender_attributions(uuid) to authenticated",
    );
  });
});
