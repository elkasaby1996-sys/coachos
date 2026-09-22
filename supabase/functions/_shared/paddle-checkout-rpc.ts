/** Translate only reviewed checkout RPC errors; never pass arbitrary DB text onward. */
export function paddleCheckoutRpcError(
  name: string,
  error: { message: string; code?: string },
): string | null {
  if (
    ![
      "begin_paddle_checkout_v1",
      "mark_paddle_checkout_ready_v1",
      "mark_paddle_checkout_failed_v1",
      "mark_paddle_checkout_ambiguous_v1",
    ].includes(name)
  )
    return null;
  const direct = [
    "INVALID",
    "FORBIDDEN",
    "LEGAL_REQUIRED",
    "DISABLED",
    "SEAT_POLICY",
    "MAPPING",
    "CONFLICT",
    "AMBIGUOUS",
  ].map((suffix) => `PADDLE_CHECKOUT_${suffix}`);
  if (direct.includes(error.message)) return error.message;
  if (
    [
      "BILLING_GUARD_FORBIDDEN",
      "BILLING_GUARD_ACCOUNT_MISMATCH",
      "BILLING_V2_OWNER_MISMATCH",
      "BILLING_CATALOGUE_FORBIDDEN",
    ].includes(error.message)
  )
    return "PADDLE_CHECKOUT_FORBIDDEN";
  if (
    [
      "BILLING_ALREADY_SUBSCRIBED",
      "BILLING_GUARD_CHECKOUT_ALREADY_OPEN",
      "BILLING_GUARD_OPERATION_ALREADY_OPEN",
      "BILLING_GUARD_OPERATION_CONFLICT",
    ].includes(error.message) ||
    ["55P03", "40001"].includes(error.code ?? "")
  )
    return "PADDLE_CHECKOUT_CONFLICT";
  if (
    [
      "BILLING_CATALOGUE_INCOMPLETE",
      "BILLING_CATALOGUE_EVIDENCE_REQUIRED",
      "BILLING_CATALOGUE_MAPPING_MISMATCH",
      "BILLING_CATALOGUE_ENVIRONMENT",
      "BILLING_V2_MAPPING_UNAVAILABLE",
      "BILLING_V2_MAPPING_MISMATCH",
      "BILLING_V2_MAPPING_EVIDENCE_MISMATCH",
    ].includes(error.message)
  )
    return "PADDLE_CHECKOUT_MAPPING";
  return "PADDLE_CHECKOUT_PERSISTENCE";
}
