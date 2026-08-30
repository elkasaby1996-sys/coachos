export const trialPlanIds = ["launch", "growth", "scale", "studio"] as const;

export type TrialPlanId = (typeof trialPlanIds)[number];

export const defaultTrialPlan: TrialPlanId = "growth";

const trialPlanLabels: Record<TrialPlanId, string> = {
  launch: "Launch",
  growth: "Growth",
  scale: "Scale",
  studio: "Studio",
};

const pendingTrialPlanStorageKey = "repsync_pending_trial_plan";

export function normalizeTrialPlan(value: string | null | undefined): TrialPlanId {
  const normalized = value?.trim().toLowerCase();
  return trialPlanIds.includes(normalized as TrialPlanId)
    ? (normalized as TrialPlanId)
    : defaultTrialPlan;
}

export function getTrialPlanLabel(plan: TrialPlanId) {
  return trialPlanLabels[plan];
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
