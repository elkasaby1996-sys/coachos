import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) => {
  const path = resolve(process.cwd(), ...parts);
  return existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : "";
};

const migration = readRepoFile(
  "supabase",
  "migrations",
  "20260705133000_client_operational_inactive_threshold.sql",
);

describe("client operational inactive threshold SQL contract", () => {
  it("replaces client_operational_snapshot with an inactivity rule that includes join and profile activity dates", () => {
    expect(migration).toContain(
      "create or replace function public.client_operational_snapshot",
    );
    expect(migration).toContain("client_profile as");
    expect(migration).toContain("c.created_at as joined_at");
    expect(migration).toContain("c.updated_at as profile_updated_at");
    expect(migration).toContain("last_message_at");
    expect(migration).toContain("latest_activity_at");
    expect(migration).toContain("< now() - interval '14 days'");
  });

  it("does not derive inactive_client from missing activity alone", () => {
    expect(migration).not.toContain(
      "coalesce((select raw_last_activity_at from activity), '-infinity'::timestamptz)\n          < now() - interval '14 days'",
    );
    expect(migration).not.toContain(
      "raw_last_activity_at from activity), '-infinity'::timestamptz)\r\n          < now() - interval '14 days'",
    );
  });
});
