import type { BadgeVariant } from "../components/ui/badge";

export const clientLifecycleStates = [
  "invited",
  "onboarding",
  "active",
  "paused",
  "at_risk",
  "completed",
  "churned",
] as const;

export type ClientLifecycleState = (typeof clientLifecycleStates)[number];

export const clientRiskFlags = [
  "missed_checkins",
  "no_recent_reply",
  "low_adherence_trend",
  "inactive_client",
] as const;

export type ClientRiskFlag = (typeof clientRiskFlags)[number];

export type ClientSegmentKey =
  | "all"
  | "onboarding_incomplete"
  | "checkin_overdue"
  | "at_risk"
  | "paused";

type PillVariant = BadgeVariant;

const lifecycleMeta: Record<
  ClientLifecycleState,
  { label: string; variant: PillVariant }
> = {
  invited: { label: "Invited", variant: "warning" },
  onboarding: { label: "Onboarding", variant: "warning" },
  active: { label: "Active", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
  at_risk: { label: "At risk", variant: "danger" },
  completed: { label: "Completed", variant: "neutral" },
  churned: { label: "Churned", variant: "neutral" },
};

const riskMeta: Record<
  ClientRiskFlag,
  { label: string; shortLabel: string; variant: PillVariant }
> = {
  missed_checkins: {
    label: "Missed check-ins",
    shortLabel: "Missed check-ins",
    variant: "danger",
  },
  no_recent_reply: {
    label: "No recent reply",
    shortLabel: "No reply",
    variant: "warning",
  },
  low_adherence_trend: {
    label: "Low adherence trend",
    shortLabel: "Low adherence",
    variant: "warning",
  },
  inactive_client: {
    label: "Inactive client",
    shortLabel: "Inactive",
    variant: "neutral",
  },
};

export type ClientOperationalSummaryLike = {
  lifecycle_state?: string | null;
  lifecycleState?: string | null;
  onboarding_incomplete?: boolean | null;
  onboardingIncomplete?: boolean | null;
  has_overdue_checkin?: boolean | null;
  hasOverdueCheckin?: boolean | null;
  risk_flags?: string[] | null;
  riskFlags?: string[] | null;
};

export function isClientLifecycleState(
  value: string | null | undefined,
): value is ClientLifecycleState {
  return Boolean(
    value && clientLifecycleStates.includes(value as ClientLifecycleState),
  );
}

export function normalizeClientLifecycleState(
  value: string | null | undefined,
): ClientLifecycleState {
  if (isClientLifecycleState(value)) return value;
  return "active";
}

export function getClientLifecycleMeta(value: string | null | undefined) {
  return lifecycleMeta[normalizeClientLifecycleState(value)];
}

export function isClientRiskFlag(
  value: string | null | undefined,
): value is ClientRiskFlag {
  return Boolean(value && clientRiskFlags.includes(value as ClientRiskFlag));
}

export function normalizeClientRiskFlags(values: string[] | null | undefined) {
  const seen = new Set<ClientRiskFlag>();
  for (const value of values ?? []) {
    if (isClientRiskFlag(value)) {
      seen.add(value);
    }
  }
  return Array.from(seen);
}

export function getClientRiskFlagMeta(value: string | null | undefined) {
  if (!isClientRiskFlag(value)) return null;
  return riskMeta[value];
}

export function isClientAtRisk(summary: ClientOperationalSummaryLike) {
  return (
    normalizeClientLifecycleState(
      summary.lifecycle_state ?? summary.lifecycleState,
    ) === "at_risk" ||
    normalizeClientRiskFlags(summary.risk_flags ?? summary.riskFlags).length > 0
  );
}

export function matchesClientSegment(
  summary: ClientOperationalSummaryLike,
  segment: ClientSegmentKey,
) {
  if (segment === "all") return true;
  if (segment === "onboarding_incomplete") {
    return Boolean(
      summary.onboarding_incomplete ?? summary.onboardingIncomplete,
    );
  }
  if (segment === "checkin_overdue") {
    return Boolean(summary.has_overdue_checkin ?? summary.hasOverdueCheckin);
  }
  if (segment === "at_risk") {
    return isClientAtRisk(summary);
  }
  if (segment === "paused") {
    return (
      normalizeClientLifecycleState(
        summary.lifecycle_state ?? summary.lifecycleState,
      ) === "paused"
    );
  }
  return true;
}

export function getClientLifecycleReason(params: {
  lifecycleState: string | null | undefined;
  pausedReason?: string | null;
  churnReason?: string | null;
}) {
  const state = normalizeClientLifecycleState(params.lifecycleState);
  if (state === "paused") return params.pausedReason?.trim() || null;
  if (state === "churned") return params.churnReason?.trim() || null;
  return null;
}
