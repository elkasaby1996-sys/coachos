import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260629150000_harden_workspace_team_invite_preview.sql",
  ),
  "utf8",
);

describe("workspace team invite preview RPC security", () => {
  it("redefines the preview RPC in a forward migration", () => {
    expect(migration).toContain(
      "create or replace function public.preview_workspace_team_invite(p_token text)",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain(
      "set search_path = pg_catalog, public, extensions",
    );
  });

  it("blocks anon callers from direct metadata preview", () => {
    expect(migration).toContain("v_user_id uuid := (select auth.uid())");
    expect(migration).toContain("if v_user_id is null then");
    expect(migration).toContain(
      "perform public.workspace_team_invite_error('UNAUTHENTICATED')",
    );
    expect(migration).toContain(
      "revoke all on function public.preview_workspace_team_invite(text) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.preview_workspace_team_invite(text) to authenticated;",
    );
  });

  it("blocks wrong authenticated users before returning invite metadata", () => {
    const emailMismatchIndex = migration.indexOf(
      "if lower(v_invite.email) <> v_user_email then",
    );
    const metadataReturnIndex = migration.indexOf(
      "'workspaceName', v_workspace_name",
    );

    expect(emailMismatchIndex).toBeGreaterThan(-1);
    expect(migration).toContain(
      "perform public.workspace_team_invite_error('INVITE_EMAIL_MISMATCH')",
    );
    expect(emailMismatchIndex).toBeLessThan(metadataReturnIndex);
  });

  it("blocks client-only accounts from assistant-coach invite metadata", () => {
    const clientCheckIndex = migration.indexOf(
      "if v_has_client_identity and not v_has_pt_identity then",
    );
    const metadataReturnIndex = migration.indexOf(
      "'workspaceName', v_workspace_name",
    );

    expect(migration).toContain("from public.clients c");
    expect(migration).toContain("from public.pt_profiles pp");
    expect(migration).toContain("from public.pt_hub_profiles php");
    expect(migration).toContain("from public.workspace_members wm");
    expect(migration).toContain(
      "perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED')",
    );
    expect(clientCheckIndex).toBeGreaterThan(-1);
    expect(clientCheckIndex).toBeLessThan(metadataReturnIndex);
  });

  it("still returns full metadata after authorization checks pass", () => {
    expect(migration).toContain("'inviteId', v_invite.id");
    expect(migration).toContain("'workspaceId', v_invite.workspace_id");
    expect(migration).toContain("'workspaceName', v_workspace_name");
    expect(migration).toContain("'invitedEmail', v_invite.email");
    expect(migration).toContain("'role', v_invite.role");
    expect(migration).toContain(
      "'clientAccessMode', v_invite.client_access_mode",
    );
    expect(migration).toContain("'status', v_status");
    expect(migration).toContain("'expiresAt', v_invite.expires_at");
  });
});
