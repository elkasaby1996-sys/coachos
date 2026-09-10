import { z } from "zod";
import { accountSubscriptionSummarySchema } from "../account-entitlements/contracts";

export const ACCOUNT_CAPACITY_DIMENSION_KEYS = [
  "counted_clients",
  "coach_seats",
  "active_workspaces",
  "published_packages",
] as const;
export const ACCOUNT_CAPACITY_STATES = [
  "unavailable",
  "unlimited",
  "available",
  "approaching",
  "at_limit",
  "over_limit",
] as const;
export type AccountCapacityDimensionKey =
  (typeof ACCOUNT_CAPACITY_DIMENSION_KEYS)[number];
export type AccountCapacityState = (typeof ACCOUNT_CAPACITY_STATES)[number];
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().datetime({ offset: true });

export function capacityState(
  committed: number,
  limit: number | null,
  available = true,
): AccountCapacityState {
  if (!available) return "unavailable";
  if (limit === null) return "unlimited";
  if (committed > limit) return "over_limit";
  if (committed === limit) return "at_limit";
  return committed >= limit * 0.8 ? "approaching" : "available";
}
export function capacityPercent(committed: number, limit: number) {
  return limit === 0
    ? committed === 0
      ? 100
      : committed * 100
    : Math.round((committed * 10_000) / limit) / 100;
}
const fields = {
  actual: count,
  pending: count,
  reserved: count,
  committed: count,
  limit: count.nullable(),
  remaining: count.nullable(),
  utilizationPercent: z.number().finite().nonnegative().nullable(),
  state: z.enum(ACCOUNT_CAPACITY_STATES),
  overBy: count,
  wouldExceedNext: z.boolean().nullable(),
  dataQualityIssue: z.boolean(),
};
export const accountCapacityDimensionSchema = z
  .discriminatedUnion("key", [
    z.object({ key: z.literal("counted_clients"), ...fields }).strict(),
    z
      .object({
        key: z.literal("coach_seats"),
        ...fields,
        included: count.nullable(),
        aboveIncludedBy: count.nullable(),
      })
      .strict(),
    z.object({ key: z.literal("active_workspaces"), ...fields }).strict(),
    z.object({ key: z.literal("published_packages"), ...fields }).strict(),
  ])
  .superRefine((v, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (v.committed !== v.actual + v.pending + v.reserved)
      reject("Committed quantity mismatch.");
    if (v.state === "unavailable" || v.state === "unlimited") {
      if (
        v.limit !== null ||
        v.remaining !== null ||
        v.utilizationPercent !== null ||
        v.overBy !== 0 ||
        v.wouldExceedNext !== (v.state === "unavailable" ? null : false)
      )
        reject("Invalid unbounded capacity.");
    } else if (v.limit === null) reject("Finite capacity requires a limit.");
    else {
      if (v.state !== capacityState(v.committed, v.limit))
        reject("Incorrect capacity state.");
      if (v.remaining !== Math.max(v.limit - v.committed, 0))
        reject("Incorrect remaining quantity.");
      if (v.overBy !== Math.max(v.committed - v.limit, 0))
        reject("Incorrect overage.");
      if (v.utilizationPercent !== capacityPercent(v.committed, v.limit))
        reject("Incorrect utilization percentage.");
      if (v.wouldExceedNext !== v.committed + 1 > v.limit)
        reject("Incorrect next-unit evaluation.");
    }
    if (v.key === "coach_seats") {
      if (v.state === "unavailable") {
        if (v.included !== null || v.aboveIncludedBy !== null)
          reject("Unavailable seat metadata must be null.");
      } else if (
        v.included === null ||
        (v.limit !== null && v.included > v.limit) ||
        v.aboveIncludedBy !== Math.max(v.committed - v.included, 0)
      )
        reject("Invalid included seats.");
    }
  });
export type AccountCapacityDimension = z.infer<
  typeof accountCapacityDimensionSchema
>;
export type CoachSeatCapacityDimension = Extract<
  AccountCapacityDimension,
  { key: "coach_seats" }
>;
export const accountCapacitySubscriptionContextSchema =
  accountSubscriptionSummarySchema;
export type AccountCapacitySubscriptionContext = z.infer<
  typeof accountCapacitySubscriptionContextSchema
>;
export const accountCapacitySnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    billingAccountId: z.string().uuid().nullable(),
    ownerUserId: z.string().uuid(),
    subscription: accountCapacitySubscriptionContextSchema,
    dimensions: z.array(accountCapacityDimensionSchema).length(4),
    hasAnyDataQualityIssue: z.boolean(),
    computedAt: timestamp,
  })
  .strict()
  .superRefine((v, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Set(v.dimensions.map((d) => d.key)).size !== 4)
      reject("All four dimensions must occur exactly once.");
    const unavailable = v.subscription.effectiveStatus === "no_subscription";
    if (v.dimensions.some((d) => (d.state === "unavailable") !== unavailable))
      reject("Subscription/capacity mismatch.");
    if (!unavailable && !v.billingAccountId)
      reject("Subscription requires an account.");
    if (
      v.hasAnyDataQualityIssue !== v.dimensions.some((d) => d.dataQualityIssue)
    )
      reject("Data quality summary mismatch.");
  });
export type AccountCapacitySnapshot = z.infer<
  typeof accountCapacitySnapshotSchema
>;
export const capacityChangeEvaluationSchema = z
  .object({
    dimension: z.enum(ACCOUNT_CAPACITY_DIMENSION_KEYS),
    currentCommitted: count,
    proposedQuantity: count.positive(),
    projectedCommitted: count,
    limit: count.nullable(),
    currentState: z.enum(ACCOUNT_CAPACITY_STATES),
    projectedState: z.enum(ACCOUNT_CAPACITY_STATES),
    allowedUnderCurrentContract: z.boolean().nullable(),
    reasonCode: z.enum([
      "capacity_available",
      "capacity_unlimited",
      "capacity_unavailable",
      "capacity_would_exceed",
      "capacity_already_over_limit",
    ]),
    computedAt: timestamp,
  })
  .strict()
  .superRefine((v, ctx) => {
    const unavailable = v.currentState === "unavailable";
    const allowed = unavailable
      ? null
      : v.limit === null || v.projectedCommitted <= v.limit;
    const reason = unavailable
      ? "capacity_unavailable"
      : v.limit === null
        ? "capacity_unlimited"
        : v.currentCommitted > v.limit
          ? "capacity_already_over_limit"
          : !allowed
            ? "capacity_would_exceed"
            : "capacity_available";
    if (
      v.projectedCommitted !== v.currentCommitted + v.proposedQuantity ||
      (unavailable && v.limit !== null) ||
      v.currentState !==
        capacityState(v.currentCommitted, v.limit, !unavailable) ||
      v.projectedState !==
        capacityState(v.projectedCommitted, v.limit, !unavailable) ||
      v.allowedUnderCurrentContract !== allowed ||
      v.reasonCode !== reason
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent capacity evaluation.",
      });
  });
export type CapacityChangeEvaluation = z.infer<
  typeof capacityChangeEvaluationSchema
>;
export class AccountCapacityError extends Error {
  constructor(
    public readonly code:
      | "UNAVAILABLE"
      | "FORBIDDEN"
      | "INVALID_PAYLOAD"
      | "INVALID_INPUT",
  ) {
    super(
      {
        UNAVAILABLE: "Account capacity is unavailable. Please try again.",
        FORBIDDEN: "You do not have access to account capacity.",
        INVALID_PAYLOAD: "Account capacity could not be verified.",
        INVALID_INPUT: "The requested capacity change is invalid.",
      }[code],
    );
    this.name = "AccountCapacityError";
  }
}
