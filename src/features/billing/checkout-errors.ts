const messages = {
  BILLING_PROVIDER_NOT_CONFIGURED:
    "Subscription checkout is currently unavailable. Please try again later.",
  BILLING_VARIANT_MAPPING_UNAVAILABLE:
    "This plan is not available for checkout yet.",
  BILLING_VARIANT_MAPPING_MISMATCH:
    "Checkout details could not be verified. Please contact support.",
  BILLING_CHECKOUT_ALREADY_OPEN:
    "A checkout is already open. Return to it or wait for it to expire before starting another.",
  BILLING_CHECKOUT_OPERATION_CONFLICT:
    "This checkout attempt has a different selection. Refresh before trying again.",
  BILLING_CHECKOUT_CREATION_FAILED:
    "Checkout could not be created. Your selection has been retained.",
  BILLING_CHECKOUT_CREATION_AMBIGUOUS:
    "We could not confirm whether checkout was created. Wait for this attempt to expire before starting again.",
  BILLING_PROVIDER_RATE_LIMITED:
    "Checkout is temporarily busy. Refresh its status before trying again.",
  BILLING_CHECKOUT_EXPIRED:
    "This checkout has expired. You can start a new subscription checkout.",
  BILLING_FORBIDDEN: "Only the account owner can start a subscription.",
  BILLING_ALREADY_SUBSCRIBED: "This account already has a paid subscription.",
  BILLING_INVALID_INPUT: "Select a valid plan and billing frequency.",
  BILLING_RECONCILIATION_FAILED:
    "Billing details are unavailable. Please refresh to check again.",
} as const;
export class BillingCheckoutError extends Error {
  constructor(public code: keyof typeof messages) {
    super(messages[code]);
    this.name = "BillingCheckoutError";
  }
}
export function safeBillingError(value: unknown) {
  if (value instanceof BillingCheckoutError) return value;
  const code =
    value && typeof value === "object" && "code" in value
      ? String(value.code)
      : "";
  return new BillingCheckoutError(
    Object.prototype.hasOwnProperty.call(messages, code)
      ? (code as keyof typeof messages)
      : "BILLING_RECONCILIATION_FAILED",
  );
}
