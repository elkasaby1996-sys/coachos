import { z } from "zod";
export const portalLinkRequestSchema = z.strictObject({
  purpose: z.enum(["manage_billing", "update_payment_method"]),
});
export type PortalLinkPurpose = z.infer<
  typeof portalLinkRequestSchema
>["purpose"];
export const customerPortalLinkResponseSchema = z.strictObject({
  purpose: portalLinkRequestSchema.shape.purpose,
  portalUrl: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash
    );
  }),
  expiresAt: z.iso
    .datetime({ offset: true })
    .refine((value) => Date.parse(value) > Date.now())
    .optional(),
});
export type CustomerPortalLinkResponse = z.infer<
  typeof customerPortalLinkResponseSchema
>;
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
export type BillingRecoveryState =
  | "unavailable"
  | "active"
  | "cancellation_scheduled"
  | "past_due"
  | "grace"
  | "expired"
  | "manual_review";
export type PortalReturnState =
  | BillingRecoveryState
  | "checking"
  | "no_detected_change"
  | "reconciliation_pending"
  | "resumed"
  | "provider_unavailable";
