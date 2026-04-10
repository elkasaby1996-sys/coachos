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
});
