import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260509170000_workspace_team_management.sql",
  ),
  "utf8",
);
const baselineSchema = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260326084615_baseline_schema.sql",
  ),
  "utf8",
);

describe("workspace team management PR 1 SQL contract", () => {
  it("adds invite records that store token_hash only and do not create membership", () => {
    expect(migration).toContain(
      "create table if not exists public.workspace_member_invites",
    );
    expect(migration).toContain("token_hash text not null");
    expect(migration).not.toContain(" token text");
    expect(migration).not.toContain(
      "create or replace function public.accept_workspace_member_invite",
    );
    expect(migration).not.toContain(
      "create or replace function public.create_workspace_member_invite",
    );
  });

  it("constrains invite role/status/client access and blocks duplicate pending invites", () => {
    expect(migration).toContain(
      "constraint workspace_member_invites_role_check check (role in ('admin', 'coach', 'assistant_coach', 'viewer'))",
    );
    expect(migration).toContain(
      "constraint workspace_member_invites_status_check check (status in ('pending', 'accepted', 'expired', 'revoked'))",
    );
    expect(migration).toContain(
      "constraint workspace_member_invites_client_access_mode_check check (client_access_mode in ('all_clients', 'assigned_clients_only'))",
    );
    expect(migration).toContain(
      "create unique index if not exists workspace_member_invites_pending_email_uidx",
    );
    expect(migration).toContain("where status = 'pending'");
  });

  it("extends workspace_members with status, access mode, and invite source", () => {
    expect(migration).toContain("alter table public.workspace_members");
    expect(migration).toContain(
      "add column if not exists status text not null default 'active'",
    );
    expect(migration).toContain(
      "add column if not exists client_access_mode text not null default 'all_clients'",
    );
    expect(migration).toContain("add column if not exists source_invite_id uuid");
    expect(migration).toContain(
      "constraint workspace_members_status_check",
    );
    expect(migration).toContain(
      "constraint workspace_members_client_access_mode_check",
    );
    expect(baselineSchema).toContain(
      "workspace_members_workspace_id_user_id_key",
    );
  });

  it("adds staged invite assignments and accepted member assignments", () => {
    expect(migration).toContain(
      "create table if not exists public.workspace_invite_client_assignments",
    );
    expect(migration).toContain(
      "create table if not exists public.workspace_member_client_assignments",
    );
    expect(migration).toContain("unique (invite_id, client_id)");
    expect(migration).toContain("unique (workspace_id, member_id, client_id)");
    expect(migration).toContain("references public.clients(id)");
  });

  it("adds workspace audit storage because existing events are notification-specific", () => {
    expect(migration).toContain(
      "create table if not exists public.workspace_audit_events",
    );
    expect(migration).toContain("event_type text not null");
    expect(migration).toContain("metadata jsonb not null default '{}'::jsonb");
  });

  it("enables RLS and useful read policies on new workspace team tables", () => {
    expect(migration).toContain(
      "alter table public.workspace_member_invites enable row level security",
    );
    expect(migration).toContain(
      "alter table public.workspace_invite_client_assignments enable row level security",
    );
    expect(migration).toContain(
      "alter table public.workspace_member_client_assignments enable row level security",
    );
    expect(migration).toContain(
      "alter table public.workspace_audit_events enable row level security",
    );
    expect(migration).toContain(
      "create policy workspace_member_invites_owner_admin_read",
    );
  });
});
