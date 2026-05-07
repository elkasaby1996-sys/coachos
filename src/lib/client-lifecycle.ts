import type { BadgeVariant } from "../components/ui/badge";

export const clientLifecycleStates = [
  "invited",
  "onboarding",
  "active",
  "paused",
  "completed",
  "churned",
] as const;

export type ClientLifecycleState = (typeof clientLifecycleStates)[number];
export type ClientLifecycleDisplayState = ClientLifecycleState | "unknown";
export type ClientRiskState = "healthy" | "at_risk";

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
  { label: string; variant: PillVariant; description: string }
> = {
  invited: {
    label: "Invited",
    variant: "warning",
    description:
      "The client has been invited into the workspace but has not started coaching yet.",
  },
  onboarding: {
    label: "Onboarding",
    variant: "warning",
    description:
      "The client is still completing onboarding steps before normal coaching begins.",
  },
  active: {
    label: "Active",
    variant: "success",
    description: "The client is actively being coached right now.",
  },
  paused: {
    label: "Paused",
    variant: "warning",
    description:
      "Coaching is temporarily paused. Check the saved pause reason for more context.",
  },
  completed: {
    label: "Completed",
    variant: "neutral",
    description: "The planned coaching journey has been completed.",
  },
  churned: {
    label: "Churned",
    variant: "neutral",
    description:
      "The coaching relationship ended before a successful completion.",
  },
};

const unmappedLifecycleMeta = {
  label: "Unknown",
  variant: "warning" as PillVariant,
  description:
    "This lifecycle value is not mapped in the app yet, so it needs review.",
};

const riskStateMeta: Record<
  ClientRiskState,
  { label: string; variant: PillVariant; description: string }
> = {
  healthy: {
    label: "Healthy",
    variant: "success",
    description:
      "No manual risk override or active risk signals are currently flagging this client.",
  },
  at_risk: {
    label: "At risk",
    variant: "danger",
    description:
      "This client needs attention because a PT manually flagged them or one or more risk signals are active.",
  },
};

const riskMeta: Record<
  ClientRiskFlag,
  {
    label: string;
    shortLabel: string;
    variant: PillVariant;
    description: string;
  }
> = {
  missed_checkins: {
    label: "Missed check-ins",
    shortLabel: "Missed check-ins",
    variant: "danger",
    description: "One or more scheduled check-ins are overdue or missing.",
  },
  no_recent_reply: {
    label: "No recent reply",
    shortLabel: "No reply",
    variant: "warning",
    description:
      "The PT messaged the client, but the client has not replied recently.",
  },
  low_adherence_trend: {
    label: "Low adherence trend",
    shortLabel: "Low adherence",
    variant: "warning",
    description:
      "Recent workout completion is trending low compared with assigned work.",
  },
  inactive_client: {
    label: "Inactive client",
    shortLabel: "Inactive",
    variant: "neutral",
    description:
      "Recent client activity is below the inactivity threshold, so follow-up may be needed.",
  },
};

export type ClientOperationalSummaryLike = {
  lifecycle_state?: string | null;
  lifecycleState?: string | null;
  manual_risk_flag?: boolean | null;
  manualRiskFlag?: boolean | null;
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

export function parseClientLifecycleState(
  value: string | null | undefined,
): ClientLifecycleState | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return isClientLifecycleState(normalized) ? normalized : null;
}

export function normalizeClientLifecycleState(
  value: string | null | undefined,
): ClientLifecycleDisplayState {
  return parseClientLifecycleState(value) ?? "unknown";
}

export function getClientLifecycleMeta(value: string | null | undefined) {
  const lifecycleState = parseClientLifecycleState(value);
  return lifecycleState ? lifecycleMeta[lifecycleState] : unmappedLifecycleMeta;
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

export function getClientRiskState(
  summary: ClientOperationalSummaryLike,
): ClientRiskState {
  return isClientAtRisk(summary) ? "at_risk" : "healthy";
}

export function getClientRiskStateMeta(value: ClientRiskState) {
  return riskStateMeta[value];
}

export function isClientAtRisk(summary: ClientOperationalSummaryLike) {
  return (
    Boolean(summary.manual_risk_flag ?? summary.manualRiskFlag) ||
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
  const state = parseClientLifecycleState(params.lifecycleState);
  if (state === "paused") return params.pausedReason?.trim() || null;
  if (state === "churned") return params.churnReason?.trim() || null;
  return null;
}
