import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260509123000_email_notification_delivery_channel.sql",
  "utf8",
);

describe("email notification delivery channel migration", () => {
  it("creates email deliveries from notification events without duplicating triggers", () => {
    expect(migration).toContain(
      "create or replace function public.create_email_delivery_for_notification_event",
    );
    expect(migration).toContain("after insert on public.notification_events");
    expect(migration).toContain("'email'");
    expect(migration).toContain("new.idempotency_key || ':email'");
    expect(migration).toContain("on conflict (idempotency_key) do nothing");
  });

  it("checks product email preferences and bypasses transactional/security email suppression", () => {
    expect(migration).toContain(
      "public.notification_center_preference_enabled",
    );
    expect(migration).toContain(
      "new.notification_class in ('transactional', 'security')",
    );
    expect(migration).toContain("suppressed_preference");
    expect(migration).toContain("suppressed_no_channel");
  });

  it("resolves recipient email server-side and logs provider-ready metadata", () => {
    expect(migration).toContain("auth.users");
    expect(migration).toContain("recipient_email");
    expect(migration).toContain("template_key");
    expect(migration).toContain("provider_message_id");
    expect(migration).toContain("sent_at");
    expect(migration).toContain("delivered_at");
  });

  it("prevents authenticated users from creating arbitrary email deliveries", () => {
    expect(migration).toContain(
      "Service role can manage notification deliveries",
    );
    expect(migration).toContain(
      "grant all on public.notification_deliveries to service_role",
    );
    expect(migration).not.toContain(
      "grant insert on public.notification_deliveries to authenticated",
    );
  });
});
