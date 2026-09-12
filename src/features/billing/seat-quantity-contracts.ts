import { z } from "zod";
const count = z.number().int().nonnegative();
const summary = {
  planKey: z.enum(["launch", "growth", "scale"]),
  cadence: z.enum(["monthly", "annual"]),
  includedSeats: count,
  currentAdditionalSeats: count,
  maximumSeats: count,
  maximumAdditionalSeats: count,
  currentEffectiveLimit: count,
  actual: count,
  pending: count,
  reserved: count,
  committed: count,
  unitPriceMinor: count,
  currentTotalMinor: count,
};
export const seatQuantityStateSchema = z
  .object({
    available: z.boolean(),
    summary: z
      .object({ ...summary, growthLimit: count, manualReview: z.boolean() })
      .strict()
      .nullable(),
    operation: z
      .object({
        id: z.string().uuid(),
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
        direction: z.enum(["increase", "reduction"]),
        targetAdditionalSeats: count,
        effectiveAt: z.string().nullable(),
        errorCode: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const seatQuantityPreviewSchema = z
  .object({
    ...summary,
    targetAdditionalSeats: count,
    currentProviderQuantity: count,
    targetProviderQuantity: count,
    targetEffectiveLimit: count,
    direction: z.enum(["increase", "reduction", "no-op"]),
    timing: z.enum(["immediate", "period_end"]),
    effectiveAt: z.string().nullable(),
    targetTotalMinor: count,
    currency: z.literal("USD"),
    capacityBlocked: z.boolean(),
    eligible: z.boolean(),
    errorCode: z.string().nullable(),
    disclosure: z.string(),
  })
  .strict();
export type SeatQuantityPreview = z.infer<typeof seatQuantityPreviewSchema>;
export type SeatQuantityState = z.infer<typeof seatQuantityStateSchema>;
const messages: Record<string, string> = {
  OWNER_REQUIRED: "Only the billing owner can manage coach seats.",
  NOT_ELIGIBLE:
    "Recover payment or resume your subscription before changing coach seats.",
  MAPPING_UNAVAILABLE:
    "Additional coach-seat billing is not available for this subscription. Contact support.",
  PRICE_CONTRACT_MISMATCH: "Coach-seat pricing needs review. Contact support.",
  ITEM_MISSING: "The subscription needs review before coach seats can change.",
  PAYPAL_UNSUPPORTED:
    "Coach-seat changes are unavailable for PayPal subscriptions.",
  TARGET_INVALID: "Choose an additional-seat count within your plan maximum.",
  OPERATION_CONFLICT:
    "A seat or plan change is already pending. Refresh its status first.",
  CAPACITY_BLOCKED:
    "Active team identities, pending invitations and reservations must fit the target limit. Review your team and preview again.",
  PROVIDER_FAILED:
    "The coach-seat change could not be completed. Refresh billing.",
  PROVIDER_AMBIGUOUS:
    "The provider result is not confirmed. Refresh billing; do not repeat the purchase.",
  AWAITING_PAYMENT:
    "Awaiting verified payment. Your current seat capacity is unchanged.",
  PAYMENT_FAILED:
    "Payment failed. Your current seat capacity is unchanged. Update payment details and refresh after recovery.",
  UNAPPROVED_DRIFT:
    "An unexpected subscription quantity needs review. Approved seat capacity is preserved.",
  MANUAL_REVIEW: "Coach-seat billing needs review. Contact support.",
  CANNOT_CANCEL: "This reduction cannot be canceled now. Refresh its status.",
};
export function seatQuantityMessage(code: string | null) {
  return (
    messages[(code ?? "").replace("BILLING_SEAT_QUANTITY_", "")] ??
    messages.PROVIDER_FAILED
  );
}
export function safeSeatQuantityError(value: unknown) {
  const code =
    value && typeof value === "object" && "code" in value
      ? String(value.code)
      : "";
  return new Error(seatQuantityMessage(code));
}
