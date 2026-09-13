import { z } from "zod";
import { parseSafe, requireCheck } from "./staging-commercial-contracts.mjs";

// Adapter boundary: normalize provider responses outside this module, under a
// separate authorization. This module has no transport or credentials.
const reference = z
  .string()
  .regex(/^(?:fake:[a-z0-9:-]+|sha256:[a-f0-9]{64})$/);
const tier = z.strictObject({
  lastUnit: z.union([z.literal(1), z.literal("inf")]),
  unitAmountMinor: z.number().int().positive(),
  fixedFeeMinor: z.literal(0),
});
const mapping = z.strictObject({
  environment: z.literal("test"),
  testMode: z.literal(true),
  storeRef: reference,
  productRef: reference,
  variantRef: reference,
  priceRef: reference,
  planKey: z.enum(["launch", "growth", "scale"]),
  planVersion: z.literal(1),
  cadence: z.enum(["monthly", "annual"]),
  currency: z.literal("USD"),
  amountMinor: z.number().int().positive(),
  interval: z.enum(["month", "year"]),
  intervalCount: z.literal(1),
  trial: z.null(),
  setupFeeMinor: z.literal(0),
  seatCapable: z.literal(true),
  category: z.literal("subscription"),
  scheme: z.literal("graduated"),
  packageSize: z.literal(1),
  usageAggregation: z.null(),
  decimalPrice: z.null(),
  tiers: z.array(tier).length(2),
});
export const providerMappingsSchema = z.strictObject({
  environment: z.literal("test"),
  liveReferences: z.array(reference),
  mappings: z.array(mapping).length(6),
});
export function validateProviderMappings(input) {
  const value = parseSafe(
    providerMappingsSchema,
    input,
    "PROVIDER_MAPPING_SCHEMA_INVALID",
  );
  const keys = new Set(),
    variants = new Set(),
    prices = new Set(),
    stores = new Set(),
    products = new Set();
  const amounts = {
    launch: [1900, 19000],
    growth: [5900, 59000],
    scale: [11900, 119000],
  };
  for (const m of value.mappings) {
    const annual = m.cadence === "annual",
      amount = amounts[m.planKey][annual ? 1 : 0];
    requireCheck(
      m.amountMinor === amount && m.interval === (annual ? "year" : "month"),
      "PROVIDER_AMOUNT_OR_CADENCE_MISMATCH",
    );
    requireCheck(
      m.tiers[0].lastUnit === 1 &&
        m.tiers[0].unitAmountMinor === amount &&
        m.tiers[1].lastUnit === "inf" &&
        m.tiers[1].unitAmountMinor === (annual ? 12000 : 1200),
      "PROVIDER_SEAT_TIER_MISMATCH",
    );
    requireCheck(
      [m.storeRef, m.productRef, m.variantRef, m.priceRef].every(
        (r) => !value.liveReferences.includes(r),
      ),
      "PROVIDER_TEST_LIVE_COLLISION",
    );
    keys.add(`${m.planKey}:${m.cadence}`);
    variants.add(m.variantRef);
    prices.add(m.priceRef);
    stores.add(m.storeRef);
    products.add(m.productRef);
  }
  requireCheck(
    keys.size === 6 &&
      variants.size === 6 &&
      prices.size === 6 &&
      stores.size === 1 &&
      products.size === 1,
    "PROVIDER_MAPPING_SET_MISMATCH",
  );
  return value;
}
