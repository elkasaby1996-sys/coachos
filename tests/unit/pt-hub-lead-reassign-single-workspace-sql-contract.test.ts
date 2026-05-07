import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260411213000_enforce_single_workspace_client_on_reassign.sql",
  ),
  "utf8",
);

describe("pt_hub_approve_lead reassignment single-workspace guard", () => {
  it("detaches the previous converted client row from PT workspaces when reassigning", () => {
    expect(migration).toContain("if v_was_converted");
    expect(migration).toContain("v_lead.converted_client_id <> v_target_client_id");
    expect(migration).toContain("set workspace_id = null");
    expect(migration).toContain("where c.id = v_lead.converted_client_id");
  });

  it("has a unique-violation fallback so reassignment still completes", () => {
    expect(migration).toContain("when unique_violation then");
    expect(migration).toContain("delete from public.clients c");
  });
});
