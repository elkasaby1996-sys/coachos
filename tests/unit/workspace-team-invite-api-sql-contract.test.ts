import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260509180000_workspace_team_invite_apis.sql",
  ),
  "utf8",
);

describe("workspace team invite PR 3 SQL contract", () => {
  it("adds the backend RPCs backing the requested invite APIs", () => {
    expect(migration).toContain(
      "create or replace function public.create_workspace_team_invite",
    );
    expect(migration).toContain(
      "create or replace function public.preview_workspace_team_invite",
    );
    expect(migration).toContain(
      "create or replace function public.accept_workspace_team_invite",
    );
    expect(migration).toContain(
      "create or replace function public.resend_workspace_team_invite",
    );
    expect(migration).toContain(
      "create or replace function public.revoke_workspace_team_invite",
    );
  });

  it("requires team.manage for create, resend, and revoke", () => {
    expect(migration.match(/public\.can_manage_workspace_team\(p_workspace_id\)/g)).toHaveLength(3);
    expect(migration).toContain("'WORKSPACE_PERMISSION_DENIED'");
  });

  it("validates invite role, duplicate pending invite, active member email, and staged clients", () => {
    expect(migration).toContain(
      "v_role not in ('admin', 'coach', 'assistant_coach', 'viewer')",
    );
    expect(migration).toContain("'DUPLICATE_PENDING_INVITE'");
    expect(migration).toContain("'USER_ALREADY_WORKSPACE_MEMBER'");
    expect(migration).toContain("'INVALID_CLIENT_ASSIGNMENT'");
    expect(migration).toContain("lower(trim(coalesce(p_email, '')))");
  });

  it("generates raw tokens only for responses and stores token_hash only", () => {
    expect(migration).toContain("encode(gen_random_bytes(32), 'hex')");
    expect(migration).toContain(
      "public.hash_workspace_team_invite_token(v_token)",
    );
    expect(migration).toContain("token_hash");
    expect(migration).not.toContain("insert into public.workspace_member_invites (\n    workspace_id,\n    email,\n    role,\n    client_access_mode,\n    token,");
  });

  it("keeps unauthenticated preview safe and low information", () => {
    const previewBody = migration.slice(
      migration.indexOf(
        "create or replace function public.preview_workspace_team_invite",
      ),
      migration.indexOf(
        "create or replace function public.accept_workspace_team_invite",
      ),
    );

    expect(previewBody).toContain("'requiresAuth', true");
    expect(previewBody).toContain("'workspaceName'");
    expect(previewBody).toContain("'invitedEmail'");
    expect(previewBody).not.toContain("workspace_invite_client_assignments");
    expect(previewBody).not.toContain("public.clients");
  });

  it("requires authenticated verified matching email to accept", () => {
    expect(migration).toContain("v_user_id uuid := (select auth.uid())");
    expect(migration).toContain("'UNAUTHENTICATED'");
    expect(migration).toContain("email_confirmed_at");
    expect(migration).toContain("'AUTHENTICATED_EMAIL_NOT_VERIFIED'");
    expect(migration).toContain("lower(v_invite.email) <> v_user_email");
    expect(migration).toContain("'INVITE_EMAIL_MISMATCH'");
  });

  it("acceptance is locked, creates membership only on success, and converts staged assignments", () => {
    const acceptBody = migration.slice(
      migration.indexOf(
        "create or replace function public.accept_workspace_team_invite",
      ),
      migration.indexOf(
        "create or replace function public.resend_workspace_team_invite",
      ),
    );

    expect(acceptBody).toContain("for update");
    expect(acceptBody).toContain("insert into public.workspace_members");
    expect(acceptBody).toContain(
      "insert into public.workspace_member_client_assignments",
    );
    expect(acceptBody).toContain(
      "from public.workspace_invite_client_assignments wica",
    );
    expect(acceptBody).toContain("set status = 'accepted'");
    expect(acceptBody).toContain(
      "'redirectTo', '/pt-hub/workspaces?acceptedWorkspace='",
    );
  });

  it("handles expired, revoked, already accepted, resend, and revoke states", () => {
    expect(migration).toContain("'INVITE_EXPIRED'");
    expect(migration).toContain("'INVITE_REVOKED'");
    expect(migration).toContain("'INVITE_NOT_PENDING'");
    expect(migration).toContain("set status = 'revoked'");
    expect(migration).toContain("set token_hash = v_token_hash");
  });

  it("writes audit events for sensitive team invite actions", () => {
    for (const event of [
      "team.invite_created",
      "team.invite_accepted",
      "team.invite_email_mismatch_attempt",
      "team.invite_resent",
      "team.invite_revoked",
    ]) {
      expect(migration).toContain(event);
    }
  });

  it("does not use lifecycle, risk, or onboarding fields for invite access logic", () => {
    expect(migration).not.toContain("lifecycle_state");
    expect(migration).not.toContain("manual_risk_flag");
    expect(migration).not.toContain("onboarding_status");
  });
});
