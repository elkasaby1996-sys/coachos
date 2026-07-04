import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const clientDetailPage = readRepoFile("src", "pages", "pt", "client-detail.tsx");
const clientHomePage = readRepoFile("src", "pages", "client", "home.tsx");
const latestInviteAcceptanceMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260405120000_account_profiles_and_standalone_clients.sql",
);
const transferDisabledMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704103000_client_continuity_disable_destructive_lead_transfer.sql",
);
const accountContinuityMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704110000_account_level_onboarding_continuity.sql",
);
const archiveRelationshipMigration = readRepoFile(
  "supabase",
  "migrations",
  "20260704113000_client_relationship_archive_semantics.sql",
);
const baselineSchema = readRepoFile(
  "supabase",
  "migrations",
  "20260326084615_baseline_schema.sql",
);
const onboardingSchema = readRepoFile(
  "supabase",
  "migrations",
  "20260326123000_onboarding_baseline_mvp.sql",
);

describe("client continuity beta contract", () => {
  it("normal coach client-detail lifecycle actions do not hard-delete clients", () => {
    expect(clientDetailPage).toContain("pt_update_client_lifecycle");
    expect(clientDetailPage).toContain('openLifecycleDialog("paused")');
    expect(clientDetailPage).toContain('openLifecycleDialog("churned")');
    expect(clientDetailPage).not.toContain('.from("clients").delete');
    expect(clientDetailPage).not.toContain(".from('clients').delete");
    expect(clientDetailPage).not.toContain("delete from public.clients");
  });

  it("invite acceptance prefers existing workspace relationship before creating a client row", () => {
    const acceptInviteStart = latestInviteAcceptanceMigration.indexOf(
      "create or replace function public.accept_invite(p_token text)",
    );
    const acceptInviteEnd = latestInviteAcceptanceMigration.indexOf(
      "create or replace function public.accept_invite",
      acceptInviteStart + 1,
    );
    const acceptInviteTokenFunction = latestInviteAcceptanceMigration.slice(
      acceptInviteStart,
      acceptInviteEnd,
    );

    const existingWorkspaceLookup = acceptInviteTokenFunction.indexOf(
      "where c.workspace_id = v_invite.workspace_id",
    );
    const standaloneLookup = acceptInviteTokenFunction.indexOf(
      "where c.workspace_id is null",
    );
    const insertClient = acceptInviteTokenFunction.indexOf(
      "insert into public.clients",
    );

    expect(acceptInviteStart).toBeGreaterThan(-1);
    expect(acceptInviteEnd).toBeGreaterThan(acceptInviteStart);
    expect(existingWorkspaceLookup).toBeGreaterThan(-1);
    expect(standaloneLookup).toBeGreaterThan(existingWorkspaceLookup);
    expect(insertClient).toBeGreaterThan(standaloneLookup);
    expect(acceptInviteTokenFunction).toContain(
      "perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite')",
    );
  });

  it("standalone profile reuse preserves account onboarding on the reused client row", () => {
    expect(latestInviteAcceptanceMigration).toContain(
      "create unique index if not exists clients_standalone_user_uidx",
    );
    expect(latestInviteAcceptanceMigration).toContain(
      "where c.workspace_id is null",
    );
    expect(latestInviteAcceptanceMigration).toContain(
      "update public.clients c",
    );
    expect(latestInviteAcceptanceMigration).not.toContain(
      "account_onboarding_completed_at = null",
    );
    expect(accountContinuityMigration).toContain(
      "new.account_onboarding_completed_at := coalesce",
    );
    expect(accountContinuityMigration).toContain(
      "v_row := public.sync_client_account_profile_fields(v_row.id)",
    );
  });

  it("lead transfer is blocked for beta rather than deleting prior client rows", () => {
    expect(transferDisabledMigration).toContain(
      "detail = 'LEAD_TRANSFER_DISABLED_FOR_BETA'",
    );
    expect(transferDisabledMigration).not.toContain("delete from public.clients");
  });

  it("client removal archives the relationship instead of hard-deleting the client row", () => {
    expect(clientDetailPage).toContain("pt_archive_client_relationship");
    expect(clientDetailPage).toContain("Archive client relationship");
    expect(archiveRelationshipMigration).toContain(
      "relationship_status = 'removed'",
    );
    expect(archiveRelationshipMigration).toContain("removed_at");
    expect(archiveRelationshipMigration).not.toContain(
      "delete from public.clients",
    );
  });

  it("direct invite re-add can reactivate a previously removed relationship", () => {
    expect(archiveRelationshipMigration).toContain(
      "relationship_status = 'active'",
    );
    expect(archiveRelationshipMigration).toContain("removed_at = null");
    expect(archiveRelationshipMigration).toContain(
      "removed_by_user_id = null",
    );
  });

  it("removed-only clients get a safe no-active-workspace home state", () => {
    expect(clientHomePage).toContain(
      "You do not currently have an active coaching workspace.",
    );
    expect(clientHomePage).toContain(
      "Your client account is still active.",
    );
    expect(clientHomePage).toContain("!hasWorkspaceMembership");
  });

  it("assignment and history tables are cascade-sensitive to client deletion", () => {
    const cascadeSensitiveConstraints = [
      "assigned_nutrition_plans_client_id_fkey",
      "assigned_workouts_client_id_fkey",
      "baseline_entries_client_id_fkey",
      "checkins_client_id_fkey",
      "client_programs_client_id_fkey",
      "conversations_client_id_fkey",
      "workout_logs_client_id_fkey",
    ];

    for (const constraint of cascadeSensitiveConstraints) {
      const constraintIndex = baselineSchema.indexOf(constraint);
      expect(constraintIndex).toBeGreaterThan(-1);
      expect(
        baselineSchema.slice(constraintIndex, constraintIndex + 220),
      ).toContain("ON DELETE CASCADE");
    }
  });

  it("workspace onboarding is relationship-scoped and must be preserved with the client row", () => {
    expect(onboardingSchema).toContain(
      "client_id uuid not null references public.clients(id) on delete cascade",
    );
    expect(onboardingSchema).toContain("workspace_id uuid not null");
    expect(onboardingSchema).toContain(
      "where wco.workspace_id = v_client.workspace_id",
    );
    expect(onboardingSchema).toContain("and wco.client_id = p_client_id");
  });
});
