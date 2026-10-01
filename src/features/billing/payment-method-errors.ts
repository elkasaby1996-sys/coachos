const messages = {
  BILLING_PAYMENT_METHOD_UNAVAILABLE:
    "Payment-method update is not available for this subscription. Refresh billing or contact support.",
  BILLING_PAYMENT_METHOD_AMBIGUOUS:
    "A billing update is pending or needs review. Refresh billing before trying again.",
  BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED:
    "Billing details changed. Refresh billing before trying again.",
  BILLING_PAYMENT_METHOD_OWNER_REQUIRED:
    "Only the billing account owner can update the payment method.",
  BILLING_PAYMENT_METHOD_PROVIDER_FAILED:
    "Payment-method update is temporarily unavailable. Refresh billing before trying again.",
  BILLING_PAYMENT_METHOD_PROVIDER_AMBIGUOUS:
    "The billing request could not be confirmed. Refresh billing or contact support; do not submit it again.",
  // Browser-only outcomes, never presented as server error codes.
  client_configuration:
    "Payment-method checkout is not configured for this application. Please contact support.",
  client_launch:
    "Payment-method checkout could not be opened. Refresh billing before trying again.",
} as const;
type Code = keyof typeof messages;
export class PaymentMethodError extends Error {
  constructor(public readonly code: Code) {
    super(messages[code]);
    this.name = "PaymentMethodError";
  }
}
export function safePaymentMethodError(error: unknown): PaymentMethodError {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  return new PaymentMethodError(
    typeof code === "string" &&
      Object.prototype.hasOwnProperty.call(messages, code)
      ? (code as Code)
      : "BILLING_PAYMENT_METHOD_PROVIDER_FAILED",
  );
}
