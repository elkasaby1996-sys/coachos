import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validatePlanChangeMappings,
  type PlanChangeMapping,
} from "../e2e/utils/plan-change-mappings";

const baseline = (): PlanChangeMapping[] =>
  ["launch", "growth", "scale"].flatMap((plan) =>
    ["monthly", "annual"].map((cadence) => ({
      id: `synthetic-${plan}-${cadence}`,
      plan_version_id: `synthetic-${plan}`,
      plan_key: plan,
      cadence,
      provider: "lemonsqueezy",
      environment: "test",
      status: plan === "launch" && cadence === "monthly" ? "retired" : "active",
      plan_status: "active",
      provider_store_id: "synthetic-store",
      provider_product_id: "synthetic-product",
      provider_variant_id: `synthetic-variant-${plan}-${cadence}`,
      provider_price_id: `synthetic-price-${plan}-${cadence}`,
      currency_code: "USD",
      canonical_currency: "USD",
      unit_amount_minor: 3900,
      canonical_amount: 3900,
      renewal_interval_unit: cadence === "monthly" ? "month" : "year",
      renewal_interval_quantity: 1,
      verified_at: "2026-09-20T00:00:00Z",
    })),
  );
describe("local plan-change mapping reuse", () => {
  it("allows seeding only an empty inventory under the shared lock", () => {
    const fixture = readFileSync(
      new URL("../e2e/utils/plan-change-fixture.ts", import.meta.url),
      "utf8",
    );
    const seed = fixture.match(
      /await pgQuery\(`begin;([\s\S]*?)commit;`\)/,
    )?.[1];
    expect(seed).toBeDefined();
    expect(seed).toContain(
      "pg_advisory_xact_lock(hashtextextended('billing-mapping:test',0))",
    );
    expect(seed).toContain(
      "and not exists(select 1 from public.billing_provider_variant_mappings where environment='test')",
    );
    expect(seed).toContain(
      "case when p.plan_key='launch' and c.cadence='monthly' then 'retired' else 'active' end",
    );
    expect(seed).not.toMatch(/\b(?:delete|update|on conflict)\b/i);
  });
  it.each([0, 1, 2, 3, 4, 5])(
    "rejects omission of canonical mapping %i",
    (index) => {
      const rows = baseline().filter((_, i) => i !== index);
      expect(() =>
        validatePlanChangeMappings(rows, "growth", "monthly"),
      ).toThrow("BILLING_VARIANT_MAPPING_MISMATCH");
    },
  );
  it.each([1, 3])("rejects a partial baseline of %i rows", (count) => {
    const rows = baseline().slice(2, 2 + count);
    expect(() => validatePlanChangeMappings(rows, "growth", "monthly")).toThrow(
      "BILLING_VARIANT_MAPPING_MISMATCH",
    );
  });
  it.each([0, 1, 2, 3, 4, 5])(
    "rejects wrong retirement status for mapping %i",
    (index) => {
      const rows = baseline();
      rows[index]!.status =
        rows[index]!.status === "active" ? "retired" : "active";
      expect(() =>
        validatePlanChangeMappings(rows, "growth", "monthly"),
      ).toThrow("BILLING_VARIANT_MAPPING_MISMATCH");
    },
  );
  it.each([0, 2])(
    "rejects duplicate logical mapping %i even with six rows",
    (index) => {
      const rows = baseline();
      rows[5] = { ...rows[index]! };
      expect(() =>
        validatePlanChangeMappings(rows, "growth", "monthly"),
      ).toThrow("BILLING_VARIANT_MAPPING_MISMATCH");
    },
  );
  it("reuses canonical active rows repeatedly without altering retired history", () => {
    const rows = baseline();
    const before = structuredClone(rows);
    expect(validatePlanChangeMappings(rows, "growth", "monthly")).toHaveLength(
      5,
    );
    expect(validatePlanChangeMappings(rows, "growth", "monthly")).toHaveLength(
      5,
    );
    expect(rows).toEqual(before);
  });
  it("supports Launch tier coverage through annual without reactivating monthly", () => {
    const rows = baseline();
    const before = structuredClone(rows);
    const active = validatePlanChangeMappings(rows, "launch", "annual");
    expect(
      active.some(
        (row) => row.plan_key === "launch" && row.cadence === "annual",
      ),
    ).toBe(true);
    expect(
      active.some(
        (row) => row.plan_key === "launch" && row.cadence === "monthly",
      ),
    ).toBe(false);
    expect(rows).toEqual(before);
    expect(() => validatePlanChangeMappings(rows, "launch", "monthly")).toThrow(
      "BILLING_VARIANT_MAPPING_MISMATCH",
    );
  });
  it.each([
    { unit_amount_minor: 1 },
    { currency_code: "EUR" },
    { renewal_interval_unit: "week" },
    { renewal_interval_quantity: 2 },
    { provider_store_id: "different-store" },
    { provider_product_id: "different-product" },
    { verified_at: null },
    { provider: "paddle" },
  ])("rejects material mismatch %#", (change) => {
    const rows = baseline();
    Object.assign(rows[2]!, change);
    expect(() => validatePlanChangeMappings(rows, "growth", "monthly")).toThrow(
      "BILLING_VARIANT_MAPPING_MISMATCH",
    );
  });
  it("rejects a retired source and duplicate active logical keys", () => {
    expect(() =>
      validatePlanChangeMappings(baseline(), "launch", "monthly"),
    ).toThrow("BILLING_VARIANT_MAPPING_MISMATCH");
    const rows = baseline();
    rows.push({ ...rows[2]! });
    expect(() => validatePlanChangeMappings(rows, "growth", "monthly")).toThrow(
      "BILLING_VARIANT_MAPPING_MISMATCH",
    );
  });
});
