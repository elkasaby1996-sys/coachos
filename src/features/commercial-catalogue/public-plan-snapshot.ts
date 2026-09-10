import type { PublicPlanKey } from "./contracts";
/** Static v1 public price/capacity projection; feature promises await PR-PRICE-10. */
const v1Plans = [
  {
    planKey: "launch",
    planVersion: 1,
    displayName: "Launch",
    currencyCode: "USD",
    monthlyPriceMinor: 1900,
    annualPriceMinor: 19000,
    capacities: {
      countedClients: 10,
      includedCoachSeats: 1,
      maxCoachSeats: 2,
      activeWorkspaces: 1,
      publishedPackages: 3,
    },
    isMostPopular: false,
  },
  {
    planKey: "growth",
    planVersion: 1,
    displayName: "Growth",
    currencyCode: "USD",
    monthlyPriceMinor: 5900,
    annualPriceMinor: 59000,
    capacities: {
      countedClients: 50,
      includedCoachSeats: 2,
      maxCoachSeats: 5,
      activeWorkspaces: 3,
      publishedPackages: null,
    },
    isMostPopular: true,
  },
  {
    planKey: "scale",
    planVersion: 1,
    displayName: "Scale",
    currencyCode: "USD",
    monthlyPriceMinor: 11900,
    annualPriceMinor: 119000,
    capacities: {
      countedClients: 100,
      includedCoachSeats: 5,
      maxCoachSeats: 10,
      activeWorkspaces: 5,
      publishedPackages: null,
    },
    isMostPopular: false,
  },
] as const;
export const PUBLIC_PLAN_SNAPSHOT_V1 = Object.freeze(
  v1Plans.map((plan) =>
    Object.freeze({
      ...plan,
      capacities: Object.freeze(plan.capacities),
    }),
  ),
);
export type PublicPlanSnapshot = (typeof PUBLIC_PLAN_SNAPSHOT_V1)[number];
export function getPublicPlanSnapshot(
  planKey: PublicPlanKey,
): PublicPlanSnapshot {
  return PUBLIC_PLAN_SNAPSHOT_V1.find((plan) => plan.planKey === planKey)!;
}
export function formatCommercialPrice(
  amountMinor: number,
  currencyCode = "USD",
  locale = "en-US",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
export function formatPublishedPackageCapacity(limit: number | null) {
  return limit === null
    ? "Unlimited published packages"
    : `${limit} published packages`;
}
