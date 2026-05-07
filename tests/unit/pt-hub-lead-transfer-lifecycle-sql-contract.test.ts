import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260412152000_transfer_lead_sets_client_lifecycle_active.sql",
  ),
  "utf8",
);

describe("pt_hub_approve_lead transfer lifecycle contract", () => {
  it("forces converted or transferred clients into active lifecycle", () => {
    expect(migration).toContain("lifecycle_state");
    expect(migration).toContain("lifecycle_changed_at");
    expect(migration).toContain("paused_reason");
    expect(migration).toContain("churn_reason");
    expect(migration).toContain("lifecycle_state = 'active'");
    expect(migration).toContain("lifecycle_changed_at = now()");
  });
});

