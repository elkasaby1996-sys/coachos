import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260509134500_notification_events_updated_at.sql",
  "utf8",
);

describe("notification events updated_at migration", () => {
  it("adds updated_at before notify_user conflict handlers rely on it", () => {
    expect(migration).toContain(
      "alter table if exists public.notification_events",
    );
    expect(migration).toContain("add column if not exists updated_at");
  });

  it("keeps notification event timestamps current on updates", () => {
    expect(migration).toContain(
      "create or replace function public.touch_notification_events_updated_at",
    );
    expect(migration).toContain(
      "create trigger touch_notification_events_updated_at_trigger",
    );
    expect(migration).toContain("new.updated_at = now()");
  });
});
