import { z } from "zod";
export const planKey = z.enum(["launch", "growth", "scale"]);
export const cadence = z.enum(["monthly", "annual"]);
export const planChangeInputSchema = z
  .object({
    targetPlanKey: planKey,
    targetCadence: cadence,
    operationId: z.string().uuid(),
  })
  .strict();
export type PlanChangeInput = z.infer<typeof planChangeInputSchema>;
export const planChangePreviewSchema = z
  .object({
    sourcePlanKey: planKey,
    sourceCadence: cadence,
    targetPlanKey: planKey,
    targetCadence: cadence,
    changeKind: z.enum([
      "tier_upgrade",
      "cadence_upgrade",
      "combined_upgrade",
      "tier_downgrade",
      "cadence_downgrade",
      "combined_downgrade",
    ]),
    effectiveTiming: z.enum(["immediate", "period_end"]),
    prorationMode: z.enum(["invoice_immediately", "disable_prorations"]),
    currentPriceMinor: z.number().int().positive(),
    targetPriceMinor: z.number().int().positive(),
    currency: z.literal("USD"),
    effectiveAt: z.string().datetime({ offset: true }).nullable(),
    dataQualityIssue: z.boolean(),
    blockers: z.array(
      z
        .object({
          dimension: z.enum([
            "counted_clients",
            "coach_seats",
            "active_workspaces",
            "published_packages",
          ]),
          committed: z.number().int().nonnegative(),
          targetLimit: z.number().int().positive().nullable(),
          overBy: z.number().int().nonnegative(),
          managementRoute: z.enum([
            "/pt-hub/clients",
            "/pt-hub/workspaces",
            "/pt-hub/packages",
          ]),
          remediation: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type PlanChangePreview = z.infer<typeof planChangePreviewSchema>;
export const planChangeStateSchema = z
  .object({
    linked: z.boolean(),
    cadence: cadence.nullable(),
    eligible: z.boolean(),
    operation: z
      .object({
        operationId: z.string().uuid(),
        status: z.enum([
          "requested",
          "provider_pending",
          "awaiting_payment",
          "scheduled",
          "cancel_pending",
          "completed",
          "canceled",
          "failed",
          "ambiguous",
          "manual_review",
        ]),
        targetPlanKey: planKey,
        targetCadence: cadence,
        effectiveAt: z.string().datetime({ offset: true }).nullable(),
        effectiveTiming: z.enum(["immediate", "period_end"]),
        errorCode: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PlanChangeState = z.infer<typeof planChangeStateSchema>;
const messages: Record<string, string> = {
  PAYPAL_UNSUPPORTED:
    "Plan changes for PayPal subscriptions are not supported. Contact support for help.",
  MIXED_DIRECTION_UNSUPPORTED:
    "A higher plan with annual to monthly billing is not supported. Change one direction at a time.",
  NOOP: "Choose a different plan or billing frequency.",
  NOT_ELIGIBLE:
    "Recover payment or resume your subscription before changing plans.",
  OWNER_REQUIRED: "Only the billing account owner can change plans.",
  CAPACITY_BLOCKED:
    "Current commitments exceed the target plan. Review the capacity blockers and preview again.",
  DATA_QUALITY_BLOCKED:
    "Capacity could not be verified. Resolve the capacity warning before changing plans.",
  ALREADY_PENDING:
    "A plan change is already pending. Refresh its status before making another change.",
  PROVIDER_AMBIGUOUS:
    "The provider result is not yet confirmed. Refresh billing; do not repeat the request.",
  CANNOT_CANCEL:
    "This change cannot be canceled now. Refresh to see its latest status.",
  TARGET_MAPPING_UNAVAILABLE:
    "This plan change is currently unavailable. Contact support.",
};
export class PlanChangeError extends Error {
  constructor(public code: string) {
    super(
      messages[code.replace("BILLING_PLAN_CHANGE_", "")] ??
        "The plan change could not be verified. Refresh billing or contact support.",
    );
  }
}
export function safePlanChangeError(value: unknown) {
  if (value instanceof PlanChangeError) return value;
  const code =
    value && typeof value === "object" && "code" in value
      ? String(value.code)
      : "";
  return new PlanChangeError(
    Object.keys(messages).some((key) => code === `BILLING_PLAN_CHANGE_${key}`)
      ? code
      : "BILLING_PLAN_CHANGE_PROVIDER_FAILED",
  );
}
