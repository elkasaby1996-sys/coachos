import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260411200000_fix_pt_hub_approve_lead_workspace_reassignment.sql",
  ),
  "utf8",
);

describe("pt_hub_approve_lead workspace assignment contract", () => {
  it("uses workspace_id+user_id unique constraint when upserting owner membership", () => {
    expect(migration).toContain(
      "on conflict on constraint workspace_members_workspace_id_user_id_key",
    );
    expect(migration).not.toContain(
      "on conflict on constraint workspace_members_pkey",
    );
  });

  it("supports converted-lead reassignment by reusing converted_client_id when available", () => {
    expect(migration).toContain("v_was_converted boolean := false");
    expect(migration).toContain("if v_was_converted then");
    expect(migration).toContain("v_lead.converted_client_id is not null");
    expect(migration).toContain("where c.id = v_lead.converted_client_id");
  });

  it("keeps already converted leads safe on reassignment failure", () => {
    expect(migration).toContain("if v_was_converted then");
    expect(migration).toContain("'lead_workspace_assignment_failed'");
    expect(migration).toContain("'converted'::text");
    expect(migration).toContain("v_lead.converted_workspace_id");
  });
});
