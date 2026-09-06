import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification mark-all-read trigger contract", () => {
  it("lets the inbox update trigger own updated_at when bulk marking read", () => {
    const migration = readFileSync(
      "supabase/migrations/20260706100000_fix_mark_all_notifications_read_updated_at_trigger.sql",
      "utf8",
    );

    expect(migration).toContain(
      "create or replace function public.mark_all_notifications_read()",
    );
    expect(migration).toContain("set read_at = now()");
    expect(migration).toContain("seen_at = coalesce(seen_at, now())");
    expect(migration).not.toContain("updated_at = now()");
    expect(migration).toContain(
      "grant execute on function public.mark_all_notifications_read()",
    );
  });
});
