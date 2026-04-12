import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("PT packages SQL contracts", () => {
  const migration = readMigration(
    "20260410100000_add_pt_packages_canonical_model.sql",
  );
  const deleteGuardMigration = readMigration(
    "20260411140000_add_guarded_pt_package_delete.sql",
  );
  const publicProfileRlsFixMigration = readMigration(
    "20260411152000_fix_public_profile_rls_visibility.sql",
  );

  it("creates canonical pt_packages schema with state and visibility", () => {
    expect(migration).toContain("create table if not exists public.pt_packages");
    expect(migration).toContain("status text not null default 'draft'");
    expect(migration).toContain("is_public boolean not null default false");
    expect(migration).toContain("'active'::text");
    expect(migration).toContain("'archived'::text");
  });

  it("keeps PT ownership policies and public selectable policy", () => {
    expect(migration).toContain("create policy pt_packages_select_owner");
    expect(migration).toContain("create policy pt_packages_insert_owner");
    expect(migration).toContain("create policy pt_packages_update_owner");
    expect(migration).toContain("create policy pt_packages_select_public");
    expect(migration).toContain("status = 'active' and is_public = true");
  });

  it("adds a safe FK from leads package interest to pt_packages", () => {
    expect(migration).toContain(
      "add constraint pt_hub_leads_package_interest_id_fkey",
    );
    expect(migration).toContain("foreign key (package_interest_id)");
    expect(migration).toContain("references public.pt_packages(id)");
    expect(migration).toContain("on delete set null");
  });

  it("validates selected package against PT ownership and public active state", () => {
    expect(migration).toContain("from public.pt_packages pkg");
    expect(migration).toContain("and pkg.pt_user_id = v_profile.user_id");
    expect(migration).toContain("and pkg.status = 'active'");
    expect(migration).toContain("and pkg.is_public = true");
    expect(migration).toContain(
      "raise exception 'Selected package is no longer available.'",
    );
  });

  it("stores package label snapshot from canonical package title", () => {
    expect(migration).toContain("v_selected_package.title");
    expect(migration).toContain("package_interest_label_snapshot = v_package_interest_label");
    expect(migration).toContain("package_interest = v_package_interest_label");
  });

  it("enforces stale and tampered package rejection server-side", () => {
    expect(migration).toContain("if p_package_interest_id is not null then");
    expect(migration).toContain("raise exception 'Selected package is no longer available.'");
    expect(migration).toContain("and pkg.status = 'active'");
    expect(migration).toContain("and pkg.is_public = true");
    expect(migration).toContain("and pkg.pt_user_id = v_profile.user_id");
  });

  it("supports no-package submissions while preserving nullable package fields", () => {
    expect(migration).toContain("p_package_interest_id uuid default null");
    expect(migration).toContain("p_package_interest_label_snapshot text default null");
    expect(migration).toContain("package_interest_id = p_package_interest_id");
    expect(migration).toContain("v_package_interest_label := nullif(");
  });

  it("keeps server-side canonical snapshot assignment when package id is provided", () => {
    expect(migration).toContain("if p_package_interest_id is not null then");
    expect(migration).toContain("v_package_interest_label := nullif(");
    expect(migration).toContain("coalesce(v_selected_package.title, '')");
    expect(migration).toContain("else");
    expect(migration).toContain("coalesce(p_package_interest_label_snapshot, '')");
  });

  it("adds guarded package delete function with ownership checks", () => {
    expect(deleteGuardMigration).toContain(
      "create or replace function public.delete_pt_package_guarded",
    );
    expect(deleteGuardMigration).toContain("v_actor_user_id := auth.uid()");
    expect(deleteGuardMigration).toContain("detail = 'FORBIDDEN'");
    expect(deleteGuardMigration).toContain("v_package.pt_user_id <> v_actor_user_id");
  });

  it("blocks delete when leads reference package and returns explicit error code", () => {
    expect(deleteGuardMigration).toContain("from public.pt_hub_leads lead");
    expect(deleteGuardMigration).toContain(
      "where lead.package_interest_id = v_package.id",
    );
    expect(deleteGuardMigration).toContain(
      "detail = 'PACKAGE_DELETE_BLOCKED_REFERENCED'",
    );
    expect(deleteGuardMigration).toContain("Archive it instead");
  });

  it("allows guarded hard delete only when unreferenced and grants execute to authenticated", () => {
    expect(deleteGuardMigration).toContain("delete from public.pt_packages pkg");
    expect(deleteGuardMigration).toContain("grant execute on function public.delete_pt_package_guarded(uuid)");
    expect(deleteGuardMigration).toContain("to authenticated, service_role");
    expect(deleteGuardMigration).not.toContain("update public.pt_hub_leads");
  });

  it("keeps public coach profile readable for anon without depending on pt_hub_settings RLS", () => {
    expect(publicProfileRlsFixMigration).toContain(
      "drop policy if exists pt_hub_profiles_select_access",
    );
    expect(publicProfileRlsFixMigration).toContain(
      "drop policy if exists pt_hub_profiles_select_published",
    );
    expect(publicProfileRlsFixMigration).toContain(
      "create policy pt_hub_profiles_select_published",
    );
    expect(publicProfileRlsFixMigration).toContain("to anon");
    expect(publicProfileRlsFixMigration).toContain("is_published = true");
    expect(publicProfileRlsFixMigration).toContain("btrim(slug) <> ''");
    expect(publicProfileRlsFixMigration).not.toContain("pt_hub_settings");
  });
});
