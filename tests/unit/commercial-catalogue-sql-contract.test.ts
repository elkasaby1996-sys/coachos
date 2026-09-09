import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_FEATURE_KEYS,
  PLAN_FEATURE_KEYS,
  PUBLIC_PLAN_KEYS,
} from "../../src/features/commercial-catalogue/contracts";

const sql = readFileSync(
  "supabase/migrations/20260909160000_commercial_catalogue_foundation.sql",
  "utf8",
).replace(/\r\n/g, "\n");
describe("commercial catalogue SQL contracts", () => {
  it("creates private RLS tables without runtime policies", () => {
    for (const table of [
      "commercial_features",
      "commercial_plan_versions",
      "commercial_plan_feature_entitlements",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain(
      "revoke all on table public.commercial_features, public.commercial_plan_versions, public.commercial_plan_feature_entitlements",
    );
    expect(sql).not.toMatch(/create policy/i);
  });
  it("constrains identity, prices, capacities and lifecycle", () => {
    for (const constraint of [
      "unique (plan_key, version)",
      "version > 0",
      "btrim(display_name) <> ''",
      "currency_code ~ '^[A-Z]{3}$'",
      "monthly_price_minor >= 0",
      "annual_price_minor >= 0",
      "monthly_price_minor > 0 and annual_price_minor > 0",
      "max_counted_clients > 0",
      "included_coach_seats > 0",
      "max_coach_seats >= included_coach_seats",
      "max_active_workspaces > 0",
      "max_published_packages is null or max_published_packages > 0",
      "not is_public or status = 'active'",
      "not is_most_popular or is_public",
      "(status = 'retired') = (retired_at is not null)",
      "plan_key <> 'custom' or not is_public",
      "split_part(feature_key, '.', 1) = domain",
      "sort_order >= 0",
      "jsonb_typeof(configuration) = 'object'",
      "on update restrict on delete restrict",
      "references public.commercial_plan_versions(id) on delete restrict",
    ])
      expect(sql).toContain(constraint);
    expect(sql).toContain("commercial_feature_key_syntax");
    for (const index of [
      "commercial_one_active_version",
      "commercial_one_most_popular",
      "commercial_public_sort_order",
    ])
      expect(sql).toContain(`create unique index ${index}`);
    expect(sql).toContain(
      "where status = 'active' and is_public and is_most_popular",
    );
  });
  it("protects active contracts, entitlement edits and permanent feature keys", () => {
    for (const trigger of [
      "commercial_feature_immutable",
      "commercial_plan_version_immutable",
      "commercial_entitlement_immutable",
    ])
      expect(sql).toContain(`create trigger ${trigger}`);
    expect(sql).toContain("new.feature_key is distinct from old.feature_key");
    expect(sql).toContain("old.status = 'active'");
    expect(sql).toContain("old.status = 'retired'");
    expect(sql).toContain(
      "where id in (v_old_id, v_new_id) order by id for update",
    );
    expect(sql).toContain("v_plan.status <> 'draft'");
    expect(sql).toContain("Commercial plan versions cannot be deleted.");
    expect(sql).toContain("Commercial features cannot be deleted.");
    expect(sql).toContain("execute function public.set_updated_at()");
  });
  it("exposes only a safe filtered RPC", () => {
    expect(sql).toContain(
      "create function public.get_public_commercial_catalogue()",
    );
    expect(sql).toContain(
      "returns jsonb language sql stable security definer\nset search_path = pg_catalog, public",
    );
    expect(sql).toContain(
      "revoke all on function public.get_public_commercial_catalogue() from public",
    );
    expect(sql).toContain(
      "grant execute on function public.get_public_commercial_catalogue() to anon, authenticated, service_role",
    );
    expect(sql).toContain("f.visibility = 'public'");
    expect(sql).toContain("f.readiness_status = 'COMMERCIALLY_SALEABLE'");
    expect(sql).toContain("e.plan_version_id = p.id");
    expect(sql).not.toContain("execute format");
  });
  it("seeds exact draft contracts, then maps every canonical feature before activation", () => {
    for (const row of [
      "('launch', 1, 'Launch', 'draft', 'USD', 1900, 19000, 10, 1, 2, 1, 3, false, false, 10",
      "('growth', 1, 'Growth', 'draft', 'USD', 5900, 59000, 50, 2, 5, 3, null, false, false, 20",
      "('scale', 1, 'Scale', 'draft', 'USD', 11900, 119000, 100, 5, 10, 5, null, false, false, 30",
    ])
      expect(sql).toContain(row);
    expect(sql.toLowerCase()).not.toContain("studio");
    const mappings = [
      ...sql.matchAll(/\('([a-z]+\.[a-z_]+)', (10|20|30)\)/g),
    ].map((m) => ({ key: m[1], min: Number(m[2]) }));
    expect(mappings).toHaveLength(COMMERCIAL_FEATURE_KEYS.length);
    for (const [index, plan] of PUBLIC_PLAN_KEYS.entries()) {
      expect(
        mappings
          .filter((m) => m.min <= (index + 1) * 10)
          .map((m) => m.key)
          .sort(),
      ).toEqual([...PLAN_FEATURE_KEYS[plan]].sort());
    }
    for (const key of COMMERCIAL_FEATURE_KEYS)
      expect(sql).toContain(`('${key}', '${key.split(".")[0]}'`);
    expect(
      sql.indexOf("insert into public.commercial_plan_feature_entitlements"),
    ).toBeLessThan(sql.indexOf("set status = 'active', is_public = true"));
    expect(sql).not.toMatch(/disable trigger/i);
  });
});
