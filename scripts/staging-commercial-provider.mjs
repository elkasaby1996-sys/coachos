import { z } from "zod";
import { parseSafe, requireCheck } from "./staging-commercial-contracts.mjs";

// Advisory Paddle facts only: no transport, credentials, receipt minting or DB authority.
const reference = z
  .string()
  .regex(/^(?:fake:[a-z0-9:-]+|sha256:[a-f0-9]{64})$/);
const taxMode = z.enum(["account_setting", "internal", "external", "location"]);
const mapping = z.strictObject({
  environment: z.literal("test"),
  productRef: reference,
  priceRef: reference,
  seatProductRef: reference,
  seatPriceRef: reference,
  planKey: z.enum(["launch", "growth", "scale"]),
  planVersion: z.literal(1),
  cadence: z.enum(["monthly", "annual"]),
  currency: z.literal("USD"),
  amountMinor: z.number().int().positive(),
  seatAmountMinor: z.number().int().positive(),
  interval: z.enum(["month", "year"]),
  intervalCount: z.literal(1),
  trial: z.null(),
  hasUnitPriceOverrides: z.literal(false),
  taxCategory: z.literal("saas"),
  taxMode,
  baseQuantityMinimum: z.literal(1),
  baseQuantityMaximum: z.literal(1),
  seatQuantityMinimum: z.literal(1),
  seatQuantityMaximum: z.literal(5),
  productStatus: z.literal("active"),
  priceStatus: z.literal("active"),
});
export const providerMappingsSchema = z.strictObject({
  provider: z.literal("paddle"),
  environment: z.literal("test"),
  expectedTaxMode: taxMode,
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
    prices = new Set(),
    products = new Map(),
    seats = new Map();
  const amounts = {
    launch: [1900, 19000],
    growth: [5900, 59000],
    scale: [11900, 119000],
  };
  for (const m of value.mappings) {
    const annual = m.cadence === "annual";
    requireCheck(
      m.amountMinor === amounts[m.planKey][annual ? 1 : 0] &&
        m.interval === (annual ? "year" : "month"),
      "PROVIDER_AMOUNT_OR_CADENCE_MISMATCH",
    );
    requireCheck(
      m.seatAmountMinor === (annual ? 12000 : 1200),
      "PROVIDER_SEAT_TIER_MISMATCH",
    );
    requireCheck(m.taxMode === value.expectedTaxMode, "PROVIDER_TAX_MISMATCH");
    const refs = [m.productRef, m.priceRef, m.seatProductRef, m.seatPriceRef];
    requireCheck(
      refs.every((r) => !value.liveReferences.includes(r)),
      "PROVIDER_TEST_LIVE_COLLISION",
    );
    requireCheck(
      !products.has(m.planKey) || products.get(m.planKey) === m.productRef,
      "PROVIDER_MAPPING_SET_MISMATCH",
    );
    requireCheck(
      !seats.has(m.cadence) ||
        JSON.stringify(seats.get(m.cadence)) ===
          JSON.stringify([m.seatProductRef, m.seatPriceRef]),
      "PROVIDER_MAPPING_SET_MISMATCH",
    );
    products.set(m.planKey, m.productRef);
    seats.set(m.cadence, [m.seatProductRef, m.seatPriceRef]);
    keys.add(m.planKey + ":" + m.cadence);
    prices.add(m.priceRef);
  }
  const allProducts = new Set([
    ...products.values(),
    ...[...seats.values()].map((v) => v[0]),
  ]);
  const allPrices = new Set([
    ...prices,
    ...[...seats.values()].map((v) => v[1]),
  ]);
  requireCheck(
    keys.size === 6 &&
      prices.size === 6 &&
      allProducts.size === 4 &&
      allPrices.size === 8 &&
      seats.size === 2 &&
      [...seats.values()][0][0] === [...seats.values()][1][0],
    "PROVIDER_MAPPING_SET_MISMATCH",
  );
  return value;
}
