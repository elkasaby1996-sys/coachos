import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "20260412153000_backfill_converted_clients_active_lifecycle.sql",
  ),
  "utf8",
);

describe("converted client lifecycle backfill SQL contract", () => {
  it("promotes converted clients to active lifecycle state", () => {
    expect(migration).toContain("update public.clients c");
    expect(migration).toContain("from public.pt_hub_leads l");
    expect(migration).toContain("l.status = 'converted'");
    expect(migration).toContain("l.converted_client_id = c.id");
    expect(migration).toContain("lifecycle_state = 'active'");
  });
});

