export type PlanChangeMapping = {
  id: string;
  plan_version_id: string;
  plan_key: string;
  cadence: string;
  provider: string;
  environment: string;
  status: string;
  plan_status: string;
  provider_store_id: string;
  provider_product_id: string;
  provider_variant_id: string;
  provider_price_id: string;
  currency_code: string;
  canonical_currency: string;
  unit_amount_minor: number;
  canonical_amount: number;
  renewal_interval_unit: string;
  renewal_interval_quantity: number;
  verified_at: string | null;
};

// Reuse canonical local mappings; provider references are fixture inputs, not
// hardcoded commercial identities. Retired history is never reactivated.
export function validatePlanChangeMappings(
  rows: PlanChangeMapping[],
  sourcePlan: string,
  sourceCadence: string,
) {
  const invalid = () => {
    throw new Error("BILLING_VARIANT_MAPPING_MISMATCH");
  };
  const keys = new Set<string>();
  const first = rows[0];
  if (!first || rows.length !== 6)
    throw new Error("BILLING_VARIANT_MAPPING_MISMATCH");
  for (const row of rows) {
    const key = `${row.plan_key}:${row.cadence}`;
    if (
      row.provider !== "lemonsqueezy" ||
      row.environment !== "test" ||
      row.plan_status !== "active" ||
      !["launch", "growth", "scale"].includes(row.plan_key) ||
      !["monthly", "annual"].includes(row.cadence) ||
      row.status !== (key === "launch:monthly" ? "retired" : "active") ||
      row.currency_code !== "USD" ||
      row.currency_code !== row.canonical_currency ||
      row.unit_amount_minor !== row.canonical_amount ||
      row.renewal_interval_quantity !== 1 ||
      row.renewal_interval_unit !==
        (row.cadence === "monthly" ? "month" : "year") ||
      !row.verified_at ||
      !row.provider_variant_id ||
      !row.provider_price_id ||
      !row.provider_store_id ||
      !row.provider_product_id ||
      row.provider_store_id !== first.provider_store_id ||
      row.provider_product_id !== first.provider_product_id
    )
      invalid();
    if (keys.has(key)) invalid();
    keys.add(key);
  }
  if (
    !rows.some(
      (row) =>
        row.plan_key === sourcePlan &&
        row.cadence === sourceCadence &&
        row.status === "active",
    )
  )
    invalid();
  return rows.filter((row) => row.status === "active");
}
