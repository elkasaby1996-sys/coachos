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
  const rpcMigration = readMigration(
    "20260414183000_fix_pt_baseline_marker_assignment_rpc.sql",
  );
  const onboardingSupportMigration = readMigration(
    "20260414193000_support_pt_baseline_assignment_for_onboarding_clients.sql",
  );
  const explicitWorkspaceMigration = readMigration(
    "20260414210000_pt_assign_baseline_markers_with_workspace_context.sql",
  );

  it("adds a per-baseline marker assignment table", () => {
    expect(migration).toContain(
      "create table if not exists public.baseline_entry_marker_templates",
    );
    expect(migration).toContain(
      "constraint baseline_entry_marker_templates_pkey primary key (baseline_id, template_id)",
    );
  });

  it("guards assignments so markers stay in the same workspace as the baseline", () => {
    expect(migration).toContain(
      "create or replace function public.validate_baseline_entry_marker_template_match()",
    );
    expect(migration).toContain(
      "Baseline marker assignments must stay inside the same workspace.",
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
    expect(rpcMigration).toContain(
      "create or replace function public.pt_assign_baseline_markers(",
    );
    expect(rpcMigration).toContain(
      "insert into public.baseline_entry_marker_templates (baseline_id, template_id)",
    );
    expect(rpcMigration).toContain(
      "delete from public.baseline_entry_marker_templates bet",
    );
  });

  it("supports onboarding clients before clients.workspace_id is attached", () => {
    expect(onboardingSupportMigration).toContain(
      "from public.workspace_client_onboardings wco",
    );
    expect(onboardingSupportMigration).toContain(
      "insert into public.workspace_client_onboardings (",
    );
    expect(onboardingSupportMigration).toContain(
      "Client not found in this workspace.",
    );
  });

  it("lets the PT pass an explicit workspace context for marker assignment", () => {
    expect(explicitWorkspaceMigration).toContain(
      "p_workspace_id uuid default null",
    );
    expect(explicitWorkspaceMigration).toContain(
      "if p_workspace_id is not null then",
    );
    expect(explicitWorkspaceMigration).toContain(
      "revoke all on function public.pt_assign_baseline_markers(uuid, uuid[], uuid) from public;",
    );
  });
});
