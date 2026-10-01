import type { BillingProviderSummary } from "./billing-management-contracts";
import type { PaymentMethodState } from "./payment-method-contracts";
export const PAYMENT_METHOD_POLL_MS = 2_000;
export const PAYMENT_METHOD_POLL_DURATION_MS = 30_000;
/** Active update-only completion is not exposed by these safe RPCs. Never infer it. */
export function paymentMethodRecoveryConfirmed(
  wasPastDue: boolean,
  state?: PaymentMethodState,
  summary?: BillingProviderSummary,
) {
  return Boolean(
    wasPastDue &&
    state?.available &&
    state.status === "active" &&
    !state.maySettleExistingBalance &&
    summary?.linked &&
    summary.status === "active" &&
    summary.reconciliationStatus === "processed" &&
    !summary.pending,
  );
}
