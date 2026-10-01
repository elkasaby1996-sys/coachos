import { z } from "zod";

export const billingProviderSummarySchema = z.strictObject({
  linked: z.boolean(),
  status: z
    .enum(["active", "past_due", "grace", "restricted", "expired", "canceled"])
    .nullable(),
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEndsAt: z.iso.datetime({ offset: true }).nullable(),
  reconciliationStatus: z.enum(["processed", "manual_review"]).nullable(),
  errorCode: z
    .enum([
      "BILLING_UNAPPROVED_PLAN_CHANGE",
      "BILLING_RECONCILIATION_MANUAL_REVIEW",
    ])
    .nullable(),
  revision: z.string().nullable(),
  pending: z.boolean(),
});
export type BillingProviderSummary = z.infer<
  typeof billingProviderSummarySchema
>;

export function billingRecoveryState(summary?: BillingProviderSummary) {
  if (!summary?.linked) return "unavailable";
  if (summary.reconciliationStatus === "manual_review") return "manual_review";
  if (["expired", "canceled"].includes(summary.status ?? "")) return "expired";
  if (summary.status === "past_due") return "past_due";
  if (["grace", "restricted"].includes(summary.status ?? "")) return "grace";
  return summary.cancelAtPeriodEnd ? "cancellation_scheduled" : "active";
}
