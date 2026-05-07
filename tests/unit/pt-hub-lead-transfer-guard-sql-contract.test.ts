import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260412133000_guard_pt_hub_lead_transfer_confirmation.sql",
  ),
  "utf8",
);

describe("pt_hub_approve_lead transfer confirmation contract", () => {
  it("adds explicit transfer confirmation parameter and blocks silent transfers", () => {
    expect(migration).toContain("p_allow_transfer boolean default false");
    expect(migration).toContain("if v_transfer_requested and not coalesce(p_allow_transfer, false) then");
    expect(migration).toContain("detail = 'LEAD_TRANSFER_REQUIRES_CONFIRMATION'");
  });

  it("keeps reassignment PT-owned and forces transfer to start from a fresh workspace row", () => {
    expect(migration).toContain("and workspace.owner_user_id = v_actor_user_id");
    expect(migration).toContain("if v_transfer_requested and v_target_client_id is not null then");
    expect(migration).toContain("delete from public.clients c");
    expect(migration).toContain("v_target_client_id := null;");
  });
});
