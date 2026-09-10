import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  "supabase/migrations/20260910120000_account_subscription_entitlements_foundation.sql",
  "utf8",
);
const tables = [
  "billing_accounts",
  "commercial_trial_policy_versions",
  "account_subscriptions",
  "account_feature_entitlement_overrides",
  "account_subscription_events",
];
describe("account entitlement SQL boundary", () => {
  it.each(tables)("creates and protects %s", (table) => {
    expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain(
      `alter table public.${table} enable row level security`,
    );
    const revoke = sql.slice(sql.indexOf("revoke all on table"));
    expect(revoke).toContain(`public.${table}`);
    expect(revoke).toContain("from public, anon, authenticated, service_role");
  });
  it("locks critical indices, policy and history contracts", () => {
    expect(sql).toMatch(
      /account_one_current_subscription[\s\S]*?where status in \('trialing', 'trial_recovery', 'active', 'past_due', 'grace', 'restricted'\)/,
    );
    expect(sql).toMatch(
      /account_one_lifetime_trial[^;]*where subscription_kind = 'trial'/,
    );
    for (const text of [
      "Active trial policy contracts are immutable",
      "Retired trial policies are immutable",
      "account_events_append_only",
      "trial_started_at < trial_ends_at",
      "trial_ends_at < trial_recovery_ends_at",
      "max_coach_seats >= included_coach_seats",
      "jsonb_typeof(metadata) = 'object'",
      "on delete restrict",
      "Subscription identity and trial clock are immutable",
    ])
      expect(sql).toContain(text);
  });
  it("revokes every new function and fixes every search path", () => {
    const functions = [...sql.matchAll(/create function public\.(\w+)\(/g)].map(
      (match) => match[1],
    );
    expect(functions.length).toBeGreaterThan(10);
    for (const name of functions)
      expect(sql).toContain(`revoke all on function public.${name}(`);
    expect(sql.match(/set search_path = pg_catalog, public/g)?.length).toBe(
      functions.length,
    );
    expect(sql).not.toMatch(/execute\s+format|execute\s+'|create policy/i);
  });
  it("backfills Scale before installing the ownership trial trigger", () => {
    expect(sql).toContain("select id into strict v_scale");
    expect(sql).toContain("select id into strict v_growth");
    expect(sql).toContain(
      "values(v_account,v_scale,'complimentary','active','legacy_beta_backfill')",
    );
    expect(
      sql.indexOf("select public.backfill_legacy_billing_accounts();"),
    ).toBeLessThan(sql.indexOf("create trigger workspace_account_trial"));
    expect(sql).toContain(
      "after insert or update of owner_user_id on public.workspaces",
    );
    expect(sql).toContain(
      "values(1,'active',v_growth,14,7,false,'growth',10,2,2,1,3,",
    );
    expect(sql).toContain("transaction_timestamp()");
    expect(sql).toContain("where id = v_account for update");
  });
  it("grants only intended RPCs and never enforces access or integrates a provider", () => {
    for (const name of [
      "set_my_requested_paid_plan(text)",
      "get_my_effective_account_entitlements()",
      "get_workspace_effective_entitlements(uuid)",
    ])
      expect(sql).toContain(
        `grant execute on function public.${name} to authenticated`,
      );
    expect(sql).toContain(
      "grant execute on function public.reconcile_account_subscription_state(uuid) to service_role",
    );
    expect(sql).not.toMatch(
      /grant execute[^;]*reconcile[^;]*to authenticated/i,
    );
    expect(sql).not.toMatch(
      /\b(update|delete from|alter table) public\.(workspaces|clients|workspace_members|pt_hub_settings)\b/i,
    );
    expect(sql).not.toMatch(/stripe|checkout|cron\.schedule|http_post/i);
  });
  it("filters readiness before overrides and projects a safe workspace payload", () => {
    expect(sql).toContain("f.readiness_status = 'COMMERCIALLY_SALEABLE'");
    expect(sql).toContain("o.effect = 'disable'");
    expect(sql).toContain("o.expires_at > now()");
    expect(sql).toContain("public.can_access_workspace(p_workspace_id)");
    const projection = sql
      .split("create function public.get_workspace_effective_entitlements")[1]
      .split("create function")[0];
    expect(projection).not.toMatch(
      /requestedPaidPlanKey|overrideReasons|invoices|paymentMethod/,
    );
  });
});
