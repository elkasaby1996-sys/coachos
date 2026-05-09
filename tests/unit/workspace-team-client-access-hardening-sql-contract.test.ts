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
    expect(migration).toContain(
      "p_sender_user_id is distinct from v_user_id",
    );
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
    expect(lintFixMigration).toContain("where conv.workspace_id = p_workspace_id");
  });
});
