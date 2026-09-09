import {
  PUBLIC_PLAN_KEYS,
  PUBLIC_TRIAL_POLICY,
  normalizePublicPlanKey,
  getPublicPlanLabel,
  type PublicPlanKey,
} from "../features/commercial-catalogue/contracts";
export const trialPlanIds = PUBLIC_PLAN_KEYS;
/** @deprecated This is the intended paid plan, not the trial feature experience. */
export type TrialPlanId = PublicPlanKey;
export const defaultTrialPlan: TrialPlanId =
  PUBLIC_TRIAL_POLICY.defaultRequestedPlanKey;

const pendingTrialPlanStorageKey = "repsync_pending_trial_plan";

export function normalizeTrialPlan(
  value: string | null | undefined,
): TrialPlanId {
  return normalizePublicPlanKey(value);
}

export function getTrialPlanLabel(plan: TrialPlanId) {
  return getPublicPlanLabel(plan);
}

export function getTrialPlanFromSearch(search: string) {
  return normalizeTrialPlan(new URLSearchParams(search).get("plan"));
}

export function buildTrialPath(plan: TrialPlanId) {
  return `/start-trial?plan=${encodeURIComponent(plan)}`;
}

export function buildPtSignupPath(search: string) {
  const params = new URLSearchParams(search);
  if (!params.has("plan")) return "/signup/pt";
  return `/signup/pt?plan=${encodeURIComponent(
    normalizeTrialPlan(params.get("plan")),
  )}`;
}

export function persistPendingTrialPlan(plan: TrialPlanId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(pendingTrialPlanStorageKey, plan);
}

export function getPendingTrialPlan() {
  if (typeof window === "undefined") return defaultTrialPlan;
  return normalizeTrialPlan(
    window.localStorage.getItem(pendingTrialPlanStorageKey),
  );
}

export function clearPendingTrialPlan() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(pendingTrialPlanStorageKey);
}
