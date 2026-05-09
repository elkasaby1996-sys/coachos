import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260509110000_notification_center_in_app_inbox.sql",
  "utf8",
);

describe("notification center in-app inbox migration", () => {
  it("adds inbox state to notification deliveries without replacing event storage", () => {
    expect(migration).toContain(
      "alter table if exists public.notification_deliveries",
    );
    expect(migration).toContain("add column if not exists seen_at");
    expect(migration).toContain("add column if not exists read_at");
    expect(migration).toContain("add column if not exists archived_at");
    expect(migration).toContain("add column if not exists clicked_at");
    expect(migration).toContain("add column if not exists action_label");
  });

  it("creates indexed delivery-backed inbox queries", () => {
    expect(migration).toContain(
      "notification_deliveries_in_app_recipient_archive_created_idx",
    );
    expect(migration).toContain(
      "notification_deliveries_in_app_recipient_read_archive_idx",
    );
  });

  it("lets users update only their own inbox state fields", () => {
    expect(migration).toContain("auth.uid() = recipient_user_id");
    expect(migration).toContain(
      "Only notification inbox state can be updated.",
    );
    expect(migration).toContain(
      "create trigger restrict_notification_delivery_inbox_updates_trigger",
    );
  });

  it("creates or suppresses in-app deliveries from notification events based on preferences", () => {
    expect(migration).toContain(
      "create or replace function public.create_in_app_delivery_for_notification_event",
    );
    expect(migration).toContain("after insert on public.notification_events");
    expect(migration).toContain("suppressed_preference");
    expect(migration).toContain("new.transactional");
    expect(migration).toContain("notification_center_preference_enabled");
  });

  it("provides read-count and mark-all helpers scoped to the current user", () => {
    expect(migration).toContain(
      "create or replace function public.get_unread_notification_count",
    );
    expect(migration).toContain(
      "create or replace function public.mark_all_notifications_read",
    );
    expect(migration).toContain("channel = 'in_app'");
    expect(migration).toContain("archived_at is null");
  });
});
