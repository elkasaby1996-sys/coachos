import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260712120000_marketing_switch_funnel_hardening.sql",
  "utf8",
);

describe("marketing leads switch funnel migration", () => {
  it("adds normalized switch request fields in a forward migration", () => {
    [
      "add column if not exists form_type text",
      "add column if not exists active_clients_range text",
      "add column if not exists current_platform_other text",
      "add column if not exists team_size_range text",
      "add column if not exists migration_needs text[]",
      "add column if not exists consent_at timestamptz",
      "add column if not exists status text not null default 'new'",
    ].forEach((marker) => expect(migration).toContain(marker));
  });

  it("hardens status and form type semantics without granting anonymous reads", () => {
    expect(migration).toContain("marketing_leads_status_check");
    expect(migration).toContain("'contacted'");
    expect(migration).toContain("'qualified'");
    expect(migration).toContain("'spam'");
    expect(migration).toContain("marketing_leads_form_type_check");
    expect(migration).toContain("revoke all on public.marketing_leads from anon, authenticated");
    expect(migration).not.toContain("grant select");
    expect(migration).not.toContain("to anon");
  });
});
