import type {
  BillingProviderSummary,
  BillingRecoveryState,
  PortalReturnState,
} from "./portal-contracts";
export const PORTAL_POLL_MS = 2_000;
export const PORTAL_POLL_DURATION_MS = 30_000;
export function billingRecoveryState(
  summary?: BillingProviderSummary,
): BillingRecoveryState {
  if (!summary?.linked) return "unavailable";
  if (summary.reconciliationStatus === "manual_review") return "manual_review";
  if (["expired", "canceled"].includes(summary.status ?? "")) return "expired";
  if (summary.status === "past_due") return "past_due";
  if (["grace", "restricted"].includes(summary.status ?? "")) return "grace";
  return summary.cancelAtPeriodEnd ? "cancellation_scheduled" : "active";
}
export function portalReturnState(
  previous: BillingProviderSummary | undefined,
  current: BillingProviderSummary | undefined,
  polling: boolean,
  unavailable = false,
): PortalReturnState {
  if (unavailable) return "provider_unavailable";
  const state = billingRecoveryState(current);
  if (current && !current.linked) return "unavailable";
  if (["manual_review", "expired", "cancellation_scheduled"].includes(state))
    return state;
  if (
    previous?.cancelAtPeriodEnd &&
    current?.status === "active" &&
    !current.cancelAtPeriodEnd
  )
    return "resumed";
  if (current?.pending) return "reconciliation_pending";
  if (
    previous &&
    current &&
    (previous.revision !== current.revision ||
      previous.status !== current.status)
  )
    return state;
  return polling ? "checking" : "no_detected_change";
}
export function cleanPortalReturn(search: URLSearchParams) {
  const next = new URLSearchParams(search);
  next.delete("portal");
  return next;
}
