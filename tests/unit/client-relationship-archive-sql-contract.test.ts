import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const archiveMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704113000_client_relationship_archive_semantics.sql",
);
const transferCompatibilityMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704114500_client_relationship_transfer_compatibility.sql",
);
const bootstrapIdentityMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704120000_removed_client_bootstrap_identity.sql",
);

describe("client relationship archive SQL contract", () => {
  it("adds a relationship access state separate from lifecycle", () => {
    expect(archiveMigration).toContain(
      "add column if not exists relationship_status text not null default 'active'",
    );
    expect(archiveMigration).toContain(
      "add column if not exists removed_at timestamptz",
    );
    expect(archiveMigration).toContain(
      "add column if not exists removed_by_user_id uuid references auth.users(id) on delete set null",
    );
    expect(transferCompatibilityMigration).toContain(
      "check (relationship_status in ('active', 'removed', 'transferred_out'))",
    );
  });

  it("keeps relationship status compatible with future non-destructive transfer", () => {
    expect(transferCompatibilityMigration).toContain("'transferred_out'");
    expect(archiveMigration).toContain("relationship_status = 'removed'");
    expect(archiveMigration).not.toContain(
      "relationship_status = 'transferred_out'",
    );
  });

  it("archives a client relationship by updating state rather than deleting history", () => {
    const archiveFunctionStart = archiveMigration.indexOf(
      "create or replace function public.pt_archive_client_relationship",
    );
    const archiveFunction = archiveMigration.slice(archiveFunctionStart);

    expect(archiveFunctionStart).toBeGreaterThan(-1);
    expect(archiveFunction).toContain("relationship_status = 'removed'");
    expect(archiveFunction).toContain("removed_at = coalesce");
    expect(archiveFunction).toContain("removed_by_user_id = coalesce");
    expect(archiveFunction).not.toContain("delete from public.clients");
    expect(archiveFunction).not.toContain("delete from public.assigned_workouts");
    expect(archiveFunction).not.toContain(
      "delete from public.assigned_nutrition_plans",
    );
    expect(archiveFunction).not.toContain("delete from public.checkins");
    expect(archiveFunction).not.toContain("delete from public.messages");
  });

  it("excludes removed relationships from active access helpers and active client lists", () => {
    expect(archiveMigration).toContain(
      "or coalesce(c.relationship_status, 'active') = 'active'",
    );
    expect(archiveMigration).toContain(
      "and coalesce(c.relationship_status, 'active') = 'active'",
    );
    expect(archiveMigration).toContain(
      "or coalesce(relationship_status, 'active') = 'active'",
    );
    expect(archiveMigration).toContain(
      "on public.clients\nfor select\nto authenticated",
    );
    expect(archiveMigration).toContain(
      "create or replace function public.accessible_client_ids",
    );
  });

  it("preserves client self-read for removed rows so bootstrap cannot lose identity", () => {
    const policyStart = bootstrapIdentityMigration.indexOf(
      "create policy clients_select_access",
    );
    const policyBody = bootstrapIdentityMigration.slice(policyStart);

    expect(bootstrapIdentityMigration).toContain(
      "drop policy if exists clients_select_access on public.clients",
    );
    expect(policyBody).toContain(
      "user_id = (select auth.uid())\n  or public.can_access_client(id, 'clients.view')",
    );
    expect(policyBody).not.toContain("relationship_status");
  });

  it("keeps coach historical access permissioned by workspace access", () => {
    expect(archiveMigration).toContain(
      "create or replace function public.can_access_client",
    );
    expect(archiveMigration).toContain(
      "if v_context.role in ('owner', 'admin') then\n    return true;",
    );
    expect(archiveMigration).toContain(
      "return exists (\n    select 1\n    from public.workspace_member_client_assignments",
    );
  });

  it("reactivates existing removed invite relationships on re-add", () => {
    expect(archiveMigration).toContain(
      "where c.workspace_id = v_invite.workspace_id",
    );
    expect(archiveMigration).toContain(
      "relationship_status = 'active'",
    );
    expect(archiveMigration).toContain("removed_at = null");
    expect(archiveMigration).toContain("removed_by_user_id = null");
    expect(archiveMigration).toContain(
      "perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite')",
    );
  });
});
