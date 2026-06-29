import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260511205000_calendar_event_mentions.sql",
  "utf8",
);

describe("calendar event mentions SQL contract", () => {
  it("exposes mentionable workspace clients and coaches through a guarded RPC", () => {
    expect(migration).toContain(
      "create or replace function public.list_calendar_mention_users",
    );
    expect(migration).toContain("wm.role::text like 'pt_%'");
    expect(migration).toContain("from public.clients c");
    expect(migration).toContain("from public.workspace_members wm");
  });

  it("creates calendar events and notification events for valid mentioned users", () => {
    expect(migration).toContain(
      "create or replace function public.create_coach_calendar_event_with_mentions",
    );
    expect(migration).toContain("insert into public.coach_calendar_events");
    expect(migration).toContain("insert into public.notification_events");
    expect(migration).toContain("'calendar_mention'");
    expect(migration).toContain(
      "'calendar_mention:' || v_event_id::text || ':' || v_mention.user_id::text",
    );
  });
});
