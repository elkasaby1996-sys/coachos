import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260507154500_auth_notification_delivery_hardening.sql",
  "utf8",
);
const privilegeMigration = readFileSync(
  "supabase/migrations/20260507162000_auth_notification_privilege_hardening.sql",
  "utf8",
);

describe("auth notification delivery hardening migration", () => {
  it("adds security event and delivery metadata tables/columns without rewriting history", () => {
    expect(migration).toContain(
      "create table if not exists public.auth_security_events",
    );
    expect(migration).toContain("add column if not exists recipient_email");
    expect(migration).toContain("add column if not exists notification_type");
    expect(migration).toContain("add column if not exists template_key");
    expect(migration).toContain("add column if not exists retry_count");
    expect(migration).toContain("add column if not exists failure_reason");
  });

  it("keeps user-owned preferences and push devices protected by RLS", () => {
    expect(migration).toContain(
      "alter table public.auth_security_events enable row level security",
    );
    expect(migration).toContain(
      "alter table public.push_subscriptions enable row level security",
    );
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("auth.uid() = recipient_user_id");
  });

  it("grants privileges that match the notification RLS policies", () => {
    expect(privilegeMigration).toContain(
      "grant select on public.notification_events to authenticated",
    );
    expect(privilegeMigration).toContain(
      "grant all on public.notification_events to service_role",
    );
    expect(privilegeMigration).toContain(
      "grant select on public.notification_deliveries to authenticated",
    );
    expect(privilegeMigration).toContain(
      "grant select, insert, update on public.push_subscriptions to authenticated",
    );
  });
});
