const messages = {
  BILLING_PORTAL_NOT_AVAILABLE:
    "This billing action is not available for your subscription.",
  BILLING_PORTAL_OWNER_REQUIRED:
    "Only the billing account owner can manage billing.",
  BILLING_PORTAL_PROVIDER_NOT_CONFIGURED:
    "Billing management is not available yet. Please try again later.",
  BILLING_PORTAL_SUBSCRIPTION_NOT_FOUND:
    "No linked paid subscription is available to manage.",
  BILLING_PORTAL_IDENTITY_MISMATCH:
    "Billing details changed. Refresh and try again.",
  BILLING_PORTAL_URL_MISSING:
    "Billing management is temporarily unavailable. Please try again.",
  BILLING_PORTAL_URL_INVALID:
    "Billing management is temporarily unavailable. Please try again.",
  BILLING_PORTAL_HOST_NOT_ALLOWED:
    "Billing management is temporarily unavailable. Please try again.",
  BILLING_PORTAL_RETRIEVAL_FAILED:
    "We could not open billing management. Please try again.",
  BILLING_UNAPPROVED_PLAN_CHANGE:
    "Your billing needs manual review. Your previous plan has been preserved.",
  BILLING_RECOVERY_PENDING:
    "Waiting for verified billing reconciliation. Refresh to check again.",
  BILLING_RECONCILIATION_MANUAL_REVIEW:
    "Your billing needs manual review. Please contact support.",
};
type Code = keyof typeof messages;
export class CustomerPortalError extends Error {
  constructor(public code: Code) {
    super(messages[code]);
    this.name = "CustomerPortalError";
  }
}
export function safePortalError(error: unknown): CustomerPortalError {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  return new CustomerPortalError(
    typeof code === "string" &&
      Object.prototype.hasOwnProperty.call(messages, code)
      ? (code as Code)
      : "BILLING_PORTAL_RETRIEVAL_FAILED",
  );
}
