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
