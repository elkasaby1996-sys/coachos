import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(filename: string) {
  return readFileSync(
    resolve(process.cwd(), "supabase", "migrations", filename),
    "utf8",
  );
}

describe("baseline marker assignment SQL contract", () => {
  const migration = readMigration(
    "20260414164000_add_baseline_entry_marker_assignments.sql",
  );
  const sharedLibraryMigration = readMigration(
    "20260415103000_shared_performance_markers_library.sql",
  );

  it("adds a per-baseline marker assignment table", () => {
    expect(migration).toContain(
      "create table if not exists public.baseline_entry_marker_templates",
    );
    expect(migration).toContain(
      "constraint baseline_entry_marker_templates_pkey primary key (baseline_id, template_id)",
    );
  });

  it("guards assignments so markers stay inside the PT-owned performance marker library", () => {
    expect(sharedLibraryMigration).toContain(
      "create or replace function public.validate_performance_marker_assignment_match()",
    );
    expect(sharedLibraryMigration).toContain(
      "Performance marker assignments must stay inside the same PT marker library.",
    );
  });

  it("allows PTs to manage assignments while clients can only read them", () => {
    expect(migration).toContain(
      "create policy baseline_entry_marker_templates_select_access",
    );
    expect(migration).toContain(
      "create policy baseline_entry_marker_templates_insert_pt",
    );
    expect(migration).toContain(
      "create policy baseline_entry_marker_templates_delete_pt",
    );
  });

  it("adds a PT-only RPC that syncs marker assignments atomically", () => {
    expect(sharedLibraryMigration).toContain(
      "create or replace function public.pt_assign_performance_markers(",
    );
    expect(sharedLibraryMigration).toContain(
      "insert into public.baseline_entry_marker_templates (baseline_id, template_id)",
    );
    expect(sharedLibraryMigration).toContain(
      "delete from public.baseline_entry_marker_templates bet",
    );
  });

  it("supports onboarding clients before clients.workspace_id is attached", () => {
    expect(sharedLibraryMigration).toContain(
      "from public.workspace_client_onboardings wco",
    );
    expect(sharedLibraryMigration).toContain(
      "insert into public.workspace_client_onboardings (",
    );
    expect(sharedLibraryMigration).toContain(
      "Client not found in this workspace.",
    );
  });

  it("lets the PT pass an explicit workspace context for marker assignment", () => {
    expect(sharedLibraryMigration).toContain(
      "p_workspace_id uuid default null",
    );
    expect(sharedLibraryMigration).toContain(
      "if p_workspace_id is not null then",
    );
    expect(sharedLibraryMigration).toContain(
      "revoke all on function public.pt_assign_performance_markers(uuid, uuid[], uuid) from public;",
    );
    expect(sharedLibraryMigration).toContain(
      "create or replace function public.pt_assign_baseline_markers(",
    );
  });
});
