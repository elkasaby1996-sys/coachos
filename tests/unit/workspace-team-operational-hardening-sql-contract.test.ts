import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260509193000_workspace_team_operational_hardening.sql",
  ),
  "utf8",
);

describe("workspace team operational hardening SQL contract", () => {
  it("adds safe invite email queueing for recipients who may not be users yet", () => {
    expect(migration).toContain(
      "create table if not exists public.workspace_team_email_deliveries",
    );
    expect(migration).toContain(
      "create or replace function public.queue_workspace_team_email",
    );
    expect(migration).toContain("recipient_email text not null");
    expect(migration).toContain("unique (idempotency_key)");
    expect(migration).toContain("'workspace_team_invite'");
  });

  it("standardizes safe audit metadata without token leakage", () => {
    expect(migration).toContain(
      "create or replace function public.record_workspace_team_audit_event",
    );
    expect(migration).toContain("- 'token'");
    expect(migration).toContain("- 'acceptUrl'");
    expect(migration).toContain("- 'token_hash'");
    expect(migration).toContain("- 'rawToken'");
    expect(migration).not.toContain("'tokenHash'");
  });

  it("queues notifications for invite, acceptance, assignments, role and status changes", () => {
    for (const marker of [
      "team_invite_received",
      "team_invite_accepted",
      "team_clients_assigned",
      "team_role_changed",
      "team_member_suspended",
      "team_member_removed",
      "team_member_reactivated",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain("public.notify_user");
  });

  it("hardens idempotency and race behavior for invites and assignments", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("'INVITE_NOT_PENDING'");
    expect(migration).toContain("set token_hash = v_token_hash");
    expect(migration).toContain(
      "on conflict (workspace_id, member_id, client_id) do nothing",
    );
    expect(migration).toContain("'previousRole'");
    expect(migration).toContain("'nextRole'");
    expect(migration).toContain("'previousStatus'");
    expect(migration).toContain("'nextStatus'");
  });

  it("adds safe observability for denied and suspicious team actions", () => {
    for (const marker of [
      "team.invite_email_mismatch_attempt",
      "team.invite_expired_access_attempt",
      "team.invite_revoked_access_attempt",
      "team.duplicate_pending_invite_attempt",
      "team.access_denied_suspended_member",
      "team.access_denied_removed_member",
    ]) {
      expect(migration).toContain(marker);
    }
  });

  it("does not use lifecycle, risk, onboarding, tokens, or client names in operational payloads", () => {
    expect(migration).not.toContain("manual_risk_flag");
    expect(migration).not.toContain("onboarding_status");
    expect(migration).not.toContain("clientNames");
    expect(migration).not.toContain("full invite url");
  });
});
