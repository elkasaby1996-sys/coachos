import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  "supabase/migrations/20260910140000_account_capacity_metering_reservations.sql",
  "utf8",
);
describe("capacity SQL boundary", () => {
  it.each(["account_capacity_reservations", "account_capacity_events"])(
    "protects %s with RLS and privilege revocation",
    (table) => {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(sql).toContain("from public,anon,authenticated,service_role");
    },
  );
  it("requires positive quantities, lifetime idempotency and terminal timestamps", () => {
    for (const fragment of [
      "quantity > 0",
      "unique (billing_account_id,dimension,idempotency_key)",
      "consumed_at is not null",
      "released_at is not null",
      "expired_at is not null",
      "expires_at > created_at",
      "old.status <> 'active'",
      "on delete restrict",
    ])
      expect(sql).toContain(fragment);
  });
  it("fixes search paths and revokes default execution for every function", () => {
    const functions = [...sql.matchAll(/create function public\.(\w+)\(/g)].map(
      (m) => m[1],
    );
    expect(sql.match(/set search_path = pg_catalog/g)).toHaveLength(
      functions.length,
    );
    for (const name of functions)
      expect(sql).toContain(`revoke all on function public.${name}(`);
  });
  it("provides locked service operations and read-only owner APIs", () => {
    for (const name of [
      "reserve_account_capacity",
      "consume_account_capacity_reservation",
      "release_account_capacity_reservation",
      "reconcile_account_capacity_reservations",
      "get_my_account_capacity_snapshot",
      "evaluate_my_capacity_change",
    ])
      expect(sql).toContain(`create function public.${name}`);
    expect(sql).toContain("for update");
    expect(sql).toContain("interval '5 minutes'");
    expect(sql).toContain("transaction_timestamp()");
    expect(sql).not.toMatch(
      /create (?:or replace )?function public\.(create_workspace|accept_invite|pt_transfer|reactivate|create_workspace_team|publish)/,
    );
    expect(sql).not.toMatch(
      /materialized view|create policy|execute format|cron\.schedule/i,
    );
    expect(sql).toContain("public.resolve_account_entitlements(p_account)");
  });
});
