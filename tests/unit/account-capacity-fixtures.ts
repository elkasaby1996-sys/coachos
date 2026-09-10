import { accountSubscriptionSummarySchema } from "../../src/features/account-entitlements/contracts";
import {
  ACCOUNT_CAPACITY_DIMENSION_KEYS,
  capacityPercent,
  capacityState,
  type AccountCapacityDimension,
  type AccountCapacitySnapshot,
} from "../../src/features/account-capacity/contracts";
export function dimension(
  key: AccountCapacityDimension["key"],
  actual = 1,
  limit: number | null = 10,
  pending = 0,
  reserved = 0,
  available = true,
): AccountCapacityDimension {
  const committed = actual + pending + reserved;
  return {
    key,
    actual,
    pending,
    reserved,
    committed,
    limit: available ? limit : null,
    remaining:
      available && limit !== null ? Math.max(limit - committed, 0) : null,
    utilizationPercent:
      available && limit !== null ? capacityPercent(committed, limit) : null,
    state: capacityState(committed, limit, available),
    overBy: available && limit !== null ? Math.max(committed - limit, 0) : 0,
    wouldExceedNext: available ? limit !== null && committed + 1 > limit : null,
    dataQualityIssue: false,
    ...(key === "coach_seats"
      ? {
          included: available ? 2 : null,
          aboveIncludedBy: available ? Math.max(committed - 2, 0) : null,
        }
      : {}),
  } as AccountCapacityDimension;
}
export function snapshot(unavailable = false): AccountCapacitySnapshot {
  return {
    schemaVersion: 1,
    billingAccountId: unavailable
      ? null
      : "a0300000-0000-4000-8000-000000000001",
    ownerUserId: "a0300000-0000-4000-8000-000000000002",
    subscription: accountSubscriptionSummarySchema.parse({
      id: unavailable ? null : "a0300000-0000-4000-8000-000000000003",
      kind: unavailable ? null : "complimentary",
      storedStatus: unavailable ? "no_subscription" : "active",
      effectiveStatus: unavailable ? "no_subscription" : "active",
      accessMode: unavailable ? "onboarding" : "full",
      accessLabel: unavailable
        ? "Trial not started"
        : "Complimentary beta access",
      planKey: unavailable ? null : "scale",
      planVersion: unavailable ? null : 1,
      planDisplayName: unavailable ? null : "Scale",
      trialStartedAt: null,
      trialEndsAt: null,
      trialRecoveryEndsAt: null,
      currentPeriodStartedAt: null,
      currentPeriodEndsAt: null,
      cancelAtPeriodEnd: false,
    }),
    dimensions: ACCOUNT_CAPACITY_DIMENSION_KEYS.map((key) =>
      dimension(key, 1, 10, 0, 0, !unavailable),
    ),
    hasAnyDataQualityIssue: false,
    computedAt: "2026-09-10T12:00:00.000Z",
  };
}
