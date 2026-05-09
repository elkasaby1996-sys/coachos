import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260509133000_legacy_notify_user_event_bridge.sql",
  "utf8",
);

describe("legacy notify_user event bridge migration", () => {
  it("keeps the legacy notify_user signature used by workout assignment triggers", () => {
    expect(migration).toContain(
      "create or replace function public.notify_user(",
    );
    expect(migration).toContain("p_image_url text default null");
    expect(migration).toContain("p_metadata jsonb default '{}'::jsonb");
    expect(migration).toContain("p_category text default 'general'");
    expect(migration).toContain("p_priority text default 'normal'");
  });

  it("bridges legacy notification calls into notification_events", () => {
    expect(migration).toContain("insert into public.notification_events");
    expect(migration).toContain("recipient_user_id");
    expect(migration).toContain("notification_class");
    expect(migration).toContain("category");
    expect(migration).toContain("priority");
    expect(migration).toContain("image_url");
    expect(migration).toContain("idempotency_key");
  });

  it("preserves legacy notifications while allowing delivery triggers to create inbox and email rows", () => {
    expect(migration).toContain("insert into public.notifications");
    expect(migration).toContain(
      "public.notification_center_preference_enabled",
    );
    expect(migration).toContain("'in_app'");
    expect(migration).toContain("on conflict (idempotency_key)");
    expect(migration).toContain("grant execute on function public.notify_user");
  });
});
