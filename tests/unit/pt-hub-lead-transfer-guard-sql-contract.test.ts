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

describe("pt_hub_approve_lead transfer confirmation contract", () => {
  it("keeps the legacy transfer parameter but blocks transfer during beta", () => {
    expect(migration).toContain("p_allow_transfer boolean default false");
    expect(migration).toContain("if v_transfer_requested then");
    expect(migration).toContain("Lead transfer is disabled during beta");
    expect(migration).toContain("detail = 'LEAD_TRANSFER_DISABLED_FOR_BETA'");
  });

  it("keeps reassignment PT-owned without deleting client relationship rows", () => {
    expect(migration).toContain(
      "and workspace.owner_user_id = v_actor_user_id",
    );
    expect(migration).not.toContain("delete from public.clients");
    expect(migration).not.toContain("v_target_client_id := null;");
    expect(migration).toContain(
      "detail = 'CLIENT_CONTINUITY_REASSIGNMENT_CONFLICT'",
    );
  });
});
