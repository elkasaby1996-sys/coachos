import * as Sentry from "@sentry/react";
import type { QueryClient } from "@tanstack/react-query";
import {
  clearPendingTrialPlan,
  getPendingTrialPlan,
  hasPendingTrialPlan,
} from "../../lib/trial-plan";
import { setMyRequestedPaidPlan } from "./account-entitlements-api";
import { invalidateAccountEntitlements } from "./query-keys";

/** Caller already has an authenticated session and has ensured the PT profile.
 * Signup/callback dispatch this without awaiting, so RPC latency cannot gate login.
 * Workspace creation awaits a retry, but persistence errors remain non-fatal.
 */
export async function persistPendingRequestedPaidPlan(
  queryClient?: QueryClient,
): Promise<boolean> {
  try {
    if (!hasPendingTrialPlan()) return true;
    const selectedPlan = getPendingTrialPlan();
    await setMyRequestedPaidPlan(selectedPlan);
    // A newer selection made while the request was in flight must survive.
    if (hasPendingTrialPlan() && getPendingTrialPlan() === selectedPlan)
      clearPendingTrialPlan();
    if (queryClient) await invalidateAccountEntitlements(queryClient);
    return true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        feature: "account-entitlements",
        operation: "persist-requested-plan",
      },
    });
    return false;
  }
}
