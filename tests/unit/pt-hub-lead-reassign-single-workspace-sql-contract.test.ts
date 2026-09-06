import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260704103000_client_continuity_disable_destructive_lead_transfer.sql",
  ),
  "utf8",
);

describe("pt_hub_approve_lead reassignment single-workspace guard", () => {
  it("detaches the previous converted client row from PT workspaces when reassigning", () => {
    expect(migration).toContain("if v_was_converted");
    expect(migration).toContain(
      "v_lead.converted_client_id <> v_target_client_id",
    );
    expect(migration).toContain("set workspace_id = null");
    expect(migration).toContain("where c.id = v_lead.converted_client_id");
  });

  it("blocks continuity conflicts instead of deleting prior client history", () => {
    expect(migration).toContain("when unique_violation then");
    expect(migration).toContain(
      "detail = 'CLIENT_CONTINUITY_REASSIGNMENT_CONFLICT'",
    );
    expect(migration).not.toContain("delete from public.clients");
  });
});
