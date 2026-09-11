import { z } from "zod";
import {
  COMMERCIAL_FEATURE_KEYS,
  COMMERCIAL_PLAN_KEYS,
  PUBLIC_PLAN_KEYS,
} from "../commercial-catalogue/contracts";

export const ACCOUNT_SUBSCRIPTION_KINDS = [
  "trial",
  "paid",
  "complimentary",
  "custom",
] as const;
export const ACCOUNT_SUBSCRIPTION_STORED_STATUSES = [
  "trialing",
  "trial_recovery",
  "active",
  "past_due",
  "grace",
  "restricted",
  "canceled",
  "expired",
  "superseded",
] as const;
export const ACCOUNT_SUBSCRIPTION_EFFECTIVE_STATUSES = [
  ...ACCOUNT_SUBSCRIPTION_STORED_STATUSES,
  "no_subscription",
] as const;
export const ACCOUNT_ACCESS_MODES = [
  "onboarding",
  "full",
  "existing_delivery_only",
  "read_only",
  "none",
] as const;
export type AccountSubscriptionKind =
  (typeof ACCOUNT_SUBSCRIPTION_KINDS)[number];
export type AccountSubscriptionStoredStatus =
  (typeof ACCOUNT_SUBSCRIPTION_STORED_STATUSES)[number];
export type AccountSubscriptionEffectiveStatus =
  (typeof ACCOUNT_SUBSCRIPTION_EFFECTIVE_STATUSES)[number];
export type AccountAccessMode = (typeof ACCOUNT_ACCESS_MODES)[number];
export const ACCOUNT_TRIAL_POLICY_V1 = Object.freeze({
  version: 1,
  durationDays: 14,
  recoveryDays: 7,
  requiresCard: false,
  featurePlanKey: "growth",
  defaultRequestedPlanKey: "growth",
  countedClients: 10,
  includedCoachSeats: 2,
  maxCoachSeats: 2,
  activeWorkspaces: 1,
  publishedPackages: 3,
} as const);
export const ACCESS_MODE_BY_STATUS = {
  no_subscription: "onboarding",
  trialing: "full",
  active: "full",
  past_due: "full",
  trial_recovery: "existing_delivery_only",
  grace: "existing_delivery_only",
  restricted: "read_only",
  canceled: "read_only",
  expired: "none",
  superseded: "none",
} as const satisfies Record<
  AccountSubscriptionEffectiveStatus,
  AccountAccessMode
>;

const timestamp = z.string().datetime({ offset: true });
const positiveLimit = z.number().int().positive().nullable();
const features = z
  .array(z.enum(COMMERCIAL_FEATURE_KEYS))
  .refine(
    (values) => new Set(values).size === values.length,
    "Duplicate feature keys.",
  );
export const accountCapacityLimitsSchema = z
  .object({
    countedClients: positiveLimit,
    includedCoachSeats: positiveLimit,
    maxCoachSeats: positiveLimit,
    activeWorkspaces: positiveLimit,
    publishedPackages: positiveLimit,
  })
  .strict()
  .refine(
    (v) =>
      v.includedCoachSeats === null ||
      v.maxCoachSeats === null ||
      v.includedCoachSeats <= v.maxCoachSeats,
    "Included seats exceed maximum.",
  );
export type AccountCapacityLimits = z.infer<typeof accountCapacityLimitsSchema>;
export const billingAccountSummarySchema = z
  .object({
    id: z.string().uuid().nullable(),
    ownerUserId: z.string().uuid(),
    requestedPaidPlanKey: z.enum(PUBLIC_PLAN_KEYS),
    canManageBilling: z.literal(true),
  })
  .strict();
export type BillingAccountSummary = z.infer<typeof billingAccountSummarySchema>;

const subscriptionFields = {
  effectiveStatus: z.enum(ACCOUNT_SUBSCRIPTION_EFFECTIVE_STATUSES),
  accessMode: z.enum(ACCOUNT_ACCESS_MODES),
  accessLabel: z.string().trim().min(1),
  planKey: z.enum(COMMERCIAL_PLAN_KEYS).nullable(),
  planVersion: z.number().int().positive().nullable(),
  planDisplayName: z.string().trim().min(1).nullable(),
};
export const accountSubscriptionSummarySchema = z
  .object({
    ...subscriptionFields,
    id: z.string().uuid().nullable(),
    kind: z.enum(ACCOUNT_SUBSCRIPTION_KINDS).nullable(),
    storedStatus: z.enum(ACCOUNT_SUBSCRIPTION_EFFECTIVE_STATUSES),
    trialStartedAt: timestamp.nullable(),
    trialEndsAt: timestamp.nullable(),
    trialRecoveryEndsAt: timestamp.nullable(),
    currentPeriodStartedAt: timestamp.nullable(),
    currentPeriodEndsAt: timestamp.nullable(),
    cancelAtPeriodEnd: z.boolean(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (v.accessMode !== ACCESS_MODE_BY_STATUS[v.effectiveStatus])
      reject("Status/access mode mismatch.");
    if (v.storedStatus === "no_subscription") {
      if (
        v.effectiveStatus !== "no_subscription" ||
        v.id !== null ||
        v.kind !== null ||
        v.planKey !== null ||
        v.planVersion !== null ||
        v.planDisplayName !== null ||
        v.trialStartedAt !== null ||
        v.trialEndsAt !== null ||
        v.trialRecoveryEndsAt !== null ||
        v.currentPeriodStartedAt !== null ||
        v.currentPeriodEndsAt !== null ||
        v.cancelAtPeriodEnd
      )
        reject("Malformed no-subscription object.");
    } else {
      if (
        !v.id ||
        !v.kind ||
        !v.planKey ||
        !v.planVersion ||
        !v.planDisplayName ||
        v.effectiveStatus === "no_subscription"
      )
        reject("Missing subscription contract.");
      if (v.kind === "trial") {
        if (
          !v.trialStartedAt ||
          !v.trialEndsAt ||
          !v.trialRecoveryEndsAt ||
          Date.parse(v.trialStartedAt) >= Date.parse(v.trialEndsAt) ||
          Date.parse(v.trialEndsAt) >= Date.parse(v.trialRecoveryEndsAt)
        )
          reject("Invalid trial timestamp ordering.");
        if (v.planKey !== "growth" || v.planVersion !== 1)
          reject("Trial v1 requires Growth v1.");
      } else if (
        v.trialStartedAt ||
        v.trialEndsAt ||
        v.trialRecoveryEndsAt ||
        ["trialing", "trial_recovery"].includes(v.storedStatus)
      )
        reject("Non-trial has trial fields.");
      if (
        v.currentPeriodStartedAt &&
        v.currentPeriodEndsAt &&
        Date.parse(v.currentPeriodStartedAt) >=
          Date.parse(v.currentPeriodEndsAt)
      )
        reject("Invalid period timestamp ordering.");
    }
  });
export type AccountSubscriptionSummary = z.infer<
  typeof accountSubscriptionSummarySchema
>;

function validateLimits(
  v: {
    effectiveStatus: AccountSubscriptionEffectiveStatus;
    limits: AccountCapacityLimits;
    enabledFeatureKeys: string[];
    planKey: string | null;
    planVersion: number | null;
    planDisplayName: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (v.effectiveStatus === "no_subscription") {
    if (
      Object.values(v.limits).some((value) => value !== null) ||
      v.enabledFeatureKeys.length ||
      v.planKey !== null ||
      v.planVersion !== null ||
      v.planDisplayName !== null
    )
      ctx.addIssue({
        code: "custom",
        message: "No subscription cannot grant a contract.",
      });
  } else if (
    !v.planKey ||
    !v.planVersion ||
    !v.planDisplayName ||
    v.limits.countedClients === null ||
    v.limits.includedCoachSeats === null ||
    v.limits.maxCoachSeats === null ||
    v.limits.activeWorkspaces === null
  )
    ctx.addIssue({ code: "custom", message: "Missing plan capacities." });
}
export const effectiveAccountEntitlementsSchema = z
  .object({
    schemaVersion: z.literal(1),
    billingAccount: billingAccountSummarySchema,
    subscription: accountSubscriptionSummarySchema,
    limits: accountCapacityLimitsSchema,
    targetFeatureKeys: features,
    enabledFeatureKeys: features,
    computedAt: timestamp,
  })
  .strict()
  .superRefine((v, ctx) => {
    validateLimits(
      {
        ...v.subscription,
        limits: v.limits,
        enabledFeatureKeys: v.enabledFeatureKeys,
      },
      ctx,
    );
    if (v.subscription.id && !v.billingAccount.id)
      ctx.addIssue({
        code: "custom",
        message: "Subscription requires a billing account.",
      });
    if (
      v.subscription.storedStatus === "no_subscription" &&
      v.targetFeatureKeys.length
    )
      ctx.addIssue({
        code: "custom",
        message: "No subscription cannot map features.",
      });
    const s = v.subscription;
    if (
      s.kind === "trial" &&
      ["trialing", "trial_recovery"].includes(s.storedStatus)
    ) {
      const expected =
        Date.parse(v.computedAt) < Date.parse(s.trialEndsAt!)
          ? "trialing"
          : Date.parse(v.computedAt) < Date.parse(s.trialRecoveryEndsAt!)
            ? "trial_recovery"
            : "expired";
      if (s.effectiveStatus !== expected)
        ctx.addIssue({
          code: "custom",
          message: "Incorrect effective trial status.",
        });
    } else if (
      s.effectiveStatus !== s.storedStatus &&
      !(
        s.kind === "paid" &&
        s.cancelAtPeriodEnd &&
        s.currentPeriodEndsAt &&
        Date.parse(s.currentPeriodEndsAt) <= Date.parse(v.computedAt) &&
        s.effectiveStatus === "expired"
      )
    )
      ctx.addIssue({ code: "custom", message: "Incorrect effective status." });
  });
export type EffectiveAccountEntitlements = z.infer<
  typeof effectiveAccountEntitlementsSchema
>;
export const workspaceEffectiveEntitlementsSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspaceId: z.string().uuid(),
    billingOwnerUserId: z.string().uuid().nullable(),
    canManageBilling: z.boolean(),
    ...subscriptionFields,
    limits: accountCapacityLimitsSchema,
    enabledFeatureKeys: features,
    computedAt: timestamp,
  })
  .strict()
  .superRefine((v, ctx) => {
    validateLimits(v, ctx);
    if (v.accessMode !== ACCESS_MODE_BY_STATUS[v.effectiveStatus])
      ctx.addIssue({ code: "custom", message: "Status/access mode mismatch." });
  });
export type WorkspaceEffectiveEntitlements = z.infer<
  typeof workspaceEffectiveEntitlementsSchema
>;
export const requestedPaidPlanResultSchema = z
  .object({
    billingAccountId: z.string().uuid(),
    requestedPaidPlanKey: z.enum(PUBLIC_PLAN_KEYS),
  })
  .strict();

export class AccountEntitlementError extends Error {
  constructor(
    public readonly code:
      | "UNAVAILABLE"
      | "FORBIDDEN"
      | "INVALID_PAYLOAD"
      | "INVALID_INPUT",
  ) {
    super(
      {
        UNAVAILABLE:
          "Account subscription details are unavailable. Please try again.",
        FORBIDDEN: "You do not have access to these subscription details.",
        INVALID_PAYLOAD: "Account subscription details could not be verified.",
        INVALID_INPUT: "The requested plan or workspace is invalid.",
      }[code],
    );
    this.name = "AccountEntitlementError";
  }
}
