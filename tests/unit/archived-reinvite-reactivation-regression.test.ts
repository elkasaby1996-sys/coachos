import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const reactivationMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704121500_reactivate_removed_client_relationships.sql",
);
const emailClaimMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260705123000_archived_reinvite_email_claim.sql",
);
const archivedNavigationMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260705110000_archived_client_history_navigation.sql",
);
const baselineSchema = readRepoFile(
  "supabase",
  "migrations",
  "20260326084615_baseline_schema.sql",
);
const publicInvitePage = readRepoFile("src", "pages", "public", "invite.tsx");

function functionBody(
  source: string,
  signature: string,
  nextSignature?: string,
) {
  const start = source.indexOf(signature);
  const end = nextSignature
    ? source.indexOf(nextSignature, start + signature.length)
    : source.length;

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("archived reinvite reactivation regression", () => {
  it("same-workspace token invite reactivates a removed relationship before standalone reuse or insert", () => {
    const tokenInvite = functionBody(
      reactivationMigration,
      "create or replace function public.accept_invite(p_token text)",
      "create or replace function public.accept_invite(",
    );

    const sameWorkspaceLookup = tokenInvite.indexOf(
      "where c.workspace_id = v_invite.workspace_id",
    );
    const reactivation = tokenInvite.indexOf(
      "perform public.reactivate_removed_client_relationship(v_client_id)",
    );
    const standaloneLookup = tokenInvite.indexOf(
      "where c.workspace_id is null",
    );
    const insertClient = tokenInvite.indexOf("insert into public.clients");

    expect(sameWorkspaceLookup).toBeGreaterThan(-1);
    expect(reactivation).toBeGreaterThan(sameWorkspaceLookup);
    expect(standaloneLookup).toBeGreaterThan(reactivation);
    expect(insertClient).toBeGreaterThan(standaloneLookup);
  });

  it("same-workspace code invite uses the same removed-row reactivation path", () => {
    const codeInvite = functionBody(
      reactivationMigration,
      "create or replace function public.accept_invite(\n  p_code text",
      "create or replace function public.pt_hub_approve_lead",
    );

    const sameWorkspaceLookup = codeInvite.indexOf(
      "where c.workspace_id = v_inv.workspace_id",
    );
    const reactivation = codeInvite.indexOf(
      "perform public.reactivate_removed_client_relationship(v_client_id)",
    );
    const standaloneLookup = codeInvite.indexOf("where c.workspace_id is null");
    const insertClient = codeInvite.indexOf("insert into public.clients");

    expect(sameWorkspaceLookup).toBeGreaterThan(-1);
    expect(reactivation).toBeGreaterThan(sameWorkspaceLookup);
    expect(standaloneLookup).toBeGreaterThan(reactivation);
    expect(insertClient).toBeGreaterThan(standaloneLookup);
  });

  it("reactivation clears removal metadata and preserves the same client row", () => {
    const helper = functionBody(
      reactivationMigration,
      "create or replace function public.reactivate_removed_client_relationship",
      "create or replace function public.accept_invite(p_token text)",
    );

    expect(helper).toContain("where c.id = p_client_id");
    expect(helper).toContain("relationship_status = 'active'");
    expect(helper).toContain("removed_at = null");
    expect(helper).toContain("removed_by_user_id = null");
    expect(helper).toContain("return p_client_id");
    expect(helper).not.toContain("insert into public.clients");
    expect(helper).not.toContain("delete from public.clients");
  });

  it("active and archived client list scopes move a reactivated row out of Archived", () => {
    expect(archivedNavigationMigration).toContain(
      "coalesce(c.relationship_status, 'active') = 'active'",
    );
    expect(archivedNavigationMigration).toContain(
      "coalesce(c.relationship_status, 'active') in ('removed', 'transferred_out')",
    );
    expect(archivedNavigationMigration).toContain(
      "p_relationship_scope text default 'active'",
    );
  });

  it("generic invites still reject transferred-out relationships", () => {
    expect(reactivationMigration).toContain(
      "coalesce(v_relationship_status, 'active') = 'transferred_out'",
    );
    expect(reactivationMigration).toContain(
      "detail = 'CLIENT_RELATIONSHIP_TRANSFERRED_OUT'",
    );
    expect(reactivationMigration).toContain(
      "Transferred client relationships require the transfer flow",
    );
  });

  it("schema keeps one client row per workspace and user", () => {
    expect(baselineSchema).toContain(
      'ADD CONSTRAINT "clients_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id")',
    );
    expect(baselineSchema).toContain(
      'CREATE UNIQUE INDEX "clients_workspace_user_uidx"',
    );
  });

  it("public invite acceptance invalidates client workspace and PT Hub client list state", () => {
    expect(publicInvitePage).toContain("useQueryClient");
    expect(publicInvitePage).toContain('queryKey: ["bootstrap-auth"]');
    expect(publicInvitePage).toContain('queryKey: ["client-home-profiles"]');
    expect(publicInvitePage).toContain('queryKey: ["pt-hub-clients"]');
    expect(publicInvitePage).toContain('queryKey: ["pt-hub-clients-page"]');
    expect(publicInvitePage).toContain('queryKey: ["pt-hub-client-stats"]');
  });

  it("real generic invite path claims a same-workspace removed row by accepting email before insert", () => {
    const tokenInvite = functionBody(
      emailClaimMigration,
      "create or replace function public.accept_invite(p_token text)",
      "create or replace function public.accept_invite(",
    );

    const sameUserLookup = tokenInvite.indexOf(
      "where c.workspace_id = v_invite.workspace_id\n    and c.user_id = v_user_id",
    );
    const sameEmailLookup = tokenInvite.indexOf(
      "nullif(lower(btrim(coalesce(c.email, ''))), '') = v_user_email",
    );
    const reusableRelationshipGuard = tokenInvite.indexOf(
      "coalesce(c.relationship_status, 'active') in ('removed', 'transferred_out')",
    );
    const claimUser = tokenInvite.indexOf(
      "user_id = v_user_id",
      reusableRelationshipGuard,
    );
    const standaloneLookup = tokenInvite.indexOf(
      "where c.workspace_id is null",
    );
    const insertClient = tokenInvite.indexOf("insert into public.clients");

    expect(sameUserLookup).toBeGreaterThan(-1);
    expect(sameEmailLookup).toBeGreaterThan(sameUserLookup);
    expect(reusableRelationshipGuard).toBeGreaterThan(sameEmailLookup);
    expect(claimUser).toBeGreaterThan(reusableRelationshipGuard);
    expect(standaloneLookup).toBeGreaterThan(claimUser);
    expect(insertClient).toBeGreaterThan(standaloneLookup);
  });

  it("invite reactivation keeps onboarding continuity attached to the reused row", () => {
    expect(emailClaimMigration).toContain(
      "perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite')",
    );
    expect(emailClaimMigration).not.toContain(
      "account_onboarding_completed_at = null",
    );
    expect(emailClaimMigration).not.toContain("delete from public.clients");
  });
});
