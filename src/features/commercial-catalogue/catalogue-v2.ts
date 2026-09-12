import { z } from "zod";
import { PUBLIC_PLAN_SNAPSHOT_V1 } from "./public-plan-snapshot";
import reviewedPayload from "./public-catalogue-v2.generated";
import {
  COMMERCIAL_FEATURE_KEYS,
  FEATURE_DOMAINS,
  PUBLIC_PLAN_KEYS,
} from "./contracts";

const positive = z.number().int().positive();
const approvedFeatureKeys = new Set<string>(
  reviewedPayload.plans.flatMap((plan) =>
    plan.features.map((item) => item.featureKey),
  ),
);
const feature = z
  .object({
    featureKey: z.enum(COMMERCIAL_FEATURE_KEYS),
    domain: z.enum(FEATURE_DOMAINS),
    displayName: z.string().trim().min(1),
    marketingLabel: z.string().trim().min(1),
  })
  .strict()
  .refine(
    (value) => value.featureKey.startsWith(`${value.domain}.`),
    "Feature domain mismatch",
  )
  .refine(
    (value) => approvedFeatureKeys.has(value.featureKey),
    "Feature has no reviewed publication approval",
  );
const plan = z
  .object({
    planKey: z.enum(PUBLIC_PLAN_KEYS),
    planVersion: positive,
    displayName: z.string().min(1),
    currencyCode: z.literal("USD"),
    monthlyPriceMinor: positive,
    annualPriceMinor: positive,
    capacities: z
      .object({
        countedClients: positive,
        includedCoachSeats: positive,
        maxCoachSeats: positive,
        activeWorkspaces: positive,
        publishedPackages: positive.nullable(),
      })
      .strict(),
    isMostPopular: z.boolean(),
    features: z.array(feature),
  })
  .strict()
  .refine(
    (value) =>
      value.capacities.includedCoachSeats <= value.capacities.maxCoachSeats,
    "Included seats exceed maximum",
  )
  .refine(
    (value) =>
      new Set(value.features.map((item) => item.featureKey)).size ===
      value.features.length,
    "Duplicate feature",
  );

// Rendering supports this shape; publication remains a separate reviewed migration.
export const publicSeatAddonSchema = z
  .object({
    addonKey: z.literal("additional_coach_seat"),
    displayName: z.string().min(1),
    currencyCode: z.literal("USD"),
    monthlyPriceMinor: z.literal(1200),
    annualPriceMinor: z.literal(12000),
  })
  .strict();
export const publicCommercialCatalogueV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    plans: z.array(plan).length(3),
    trial: z
      .object({
        durationDays: z.literal(14),
        cardRequired: z.literal(false),
        experiencePlanKey: z.literal("growth"),
        capacities: z
          .object({
            countedClients: z.literal(10),
            coachSeats: z.literal(2),
            activeWorkspaces: z.literal(1),
            publishedPackages: z.literal(3),
          })
          .strict(),
      })
      .strict(),
    addons: z
      .array(publicSeatAddonSchema)
      .max(0, "No add-on has publication approval"),
  })
  .strict()
  .refine(
    (value) =>
      value.plans.map((item) => item.planKey).join() ===
      PUBLIC_PLAN_KEYS.join(),
    "Invalid plan order",
  )
  .refine(
    (value) =>
      value.plans.every((item, index) => {
        const expected = PUBLIC_PLAN_SNAPSHOT_V1[index];
        if (!expected) return false;
        return (
          item.planVersion === expected.planVersion &&
          item.displayName === expected.displayName &&
          item.monthlyPriceMinor === expected.monthlyPriceMinor &&
          item.annualPriceMinor === expected.annualPriceMinor &&
          item.isMostPopular === expected.isMostPopular &&
          Object.entries(expected.capacities).every(
            ([key, capacity]) =>
              item.capacities[key as keyof typeof item.capacities] === capacity,
          )
        );
      }),
    "Locked plan contract changed",
  );
export type PublicCommercialCatalogueV2 = z.infer<
  typeof publicCommercialCatalogueV2Schema
>;
export type PublicSeatAddon = z.infer<typeof publicSeatAddonSchema>;
export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
export function groupCatalogueFeatures(
  plans: DeepReadonly<PublicCommercialCatalogueV2["plans"]>,
) {
  const unique = new Map(
    plans.flatMap((plan) =>
      plan.features.map((item) => [item.featureKey, item] as const),
    ),
  );
  return FEATURE_DOMAINS.map((domain) => ({
    domain,
    features: [...unique.values()].filter((item) => item.domain === domain),
  })).filter((group) => group.features.length > 0);
}
