import { z } from "zod";
import type { CheckoutState } from "./contracts";
export function checkoutReturnAttempt(search: URLSearchParams) {
  const id = search.get("attempt");
  return search.get("checkout") === "return" && z.uuid().safeParse(id).success
    ? id
    : null;
}
export function checkoutReturnState(
  attempt: string | null,
  state: CheckoutState | undefined,
  subscription: { kind: string | null; effectiveStatus: string } | undefined,
) {
  if (!attempt) return "idle";
  if (
    state?.checkoutAttemptId === attempt &&
    state.status === "completed" &&
    subscription?.kind === "paid" &&
    ["active", "past_due", "grace"].includes(subscription.effectiveStatus)
  )
    return "confirmed";
  if (state?.status === "expired" || state?.status === "failed")
    return "stopped";
  return "finalizing";
}
