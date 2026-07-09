import {
  parseClientLifecycleState,
  normalizeClientRiskFlags,
} from "./client-lifecycle";

export type ClientRelationshipStatus = "active" | "removed" | "transferred_out";

export type ClientLifecycleStatus =
  | "invited"
  | "onboarding"
  | "active"
  | "paused"
  | "completed"
  | "churned";

export type AttentionReasonCode =
  | "manual_at_risk"
  | "checkin_overdue"
  | "missed_checkins"
  | "no_recent_reply"
  | "low_adherence"
  | "no_active_delivery"
  | "inactive_client";

export type StatusTone =
  | "neutral"
  | "muted"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type ClientStatusBadgeDisplay = {
  key: string;
  label: string;
  tone: StatusTone;
  kind: "relationship" | "lifecycle" | "attention";
  description?: string;
};

export type ClientAttentionReason = {
  code: AttentionReasonCode;
  label: string;
  severity: "low" | "medium" | "high";
  priority: number;
};

export type ClientGlobalStatusDisplay = {
  relationshipBadge?: ClientStatusBadgeDisplay;
  lifecycleBadge?: ClientStatusBadgeDisplay;
  attentionBadge?: ClientStatusBadgeDisplay & {
    reasons: ClientAttentionReason[];
  };
  globalBadges: ClientStatusBadgeDisplay[];
  attentionReasons: ClientAttentionReason[];
};

export type ClientStatusDisplaySummaryLike = {
  relationship_status?: string | null;
  relationshipStatus?: string | null;
  lifecycle_state?: string | null;
  lifecycleState?: string | null;
  manual_risk_flag?: boolean | null;
  manualRiskFlag?: boolean | null;
  risk_state?: string | null;
  riskState?: string | null;
  has_overdue_checkin?: boolean | null;
  hasOverdueCheckin?: boolean | null;
  overdue_checkins_count?: number | null;
  overdueCheckinsCount?: number | null;
  risk_flags?: string[] | null;
  riskFlags?: string[] | null;
  has_active_program?: boolean | null;
  hasActiveProgram?: boolean | null;
  has_active_workout?: boolean | null;
  hasActiveWorkout?: boolean | null;
  has_workout_assigned?: boolean | null;
  hasWorkoutAssigned?: boolean | null;
  has_active_nutrition?: boolean | null;
  hasActiveNutrition?: boolean | null;
  has_nutrition_assigned?: boolean | null;
  hasNutritionAssigned?: boolean | null;
  has_checkin_cadence?: boolean | null;
  hasCheckinCadence?: boolean | null;
  has_checkin_assigned?: boolean | null;
  hasCheckInAssigned?: boolean | null;
  checkin_template_id?: string | null;
  checkinTemplateId?: string | null;
  checkin_frequency?: string | null;
  checkinFrequency?: string | null;
};

const unresolvedAttentionDescription =
  "Attention signal detected, but the reason could not be resolved.";

const relationshipBadgeMeta: Record<
  Exclude<ClientRelationshipStatus, "active">,
  ClientStatusBadgeDisplay
> = {
  removed: {
    key: "relationship:removed",
    label: "Removed",
    tone: "warning",
    kind: "relationship",
    description:
      "This client relationship is no longer active. History is preserved for reference.",
  },
  transferred_out: {
    key: "relationship:transferred_out",
    label: "Transferred out",
    tone: "info",
    kind: "relationship",
    description:
      "This client was transferred to another workspace. Source history is preserved for reference.",
  },
};

const lifecycleBadgeMeta: Record<
  ClientLifecycleStatus,
  ClientStatusBadgeDisplay
> = {
  invited: {
    key: "lifecycle:invited",
    label: "Invited",
    tone: "warning",
    kind: "lifecycle",
    description:
      "The client has been invited into the workspace but has not started coaching yet.",
  },
  onboarding: {
    key: "lifecycle:onboarding",
    label: "Onboarding",
    tone: "warning",
    kind: "lifecycle",
    description:
      "The client is still completing onboarding steps before normal coaching begins.",
  },
  active: {
    key: "lifecycle:active",
    label: "Active",
    tone: "success",
    kind: "lifecycle",
    description: "The client is actively being coached right now.",
  },
  paused: {
    key: "lifecycle:paused",
    label: "Paused",
    tone: "warning",
    kind: "lifecycle",
    description:
      "Coaching is temporarily paused. Check the saved pause reason for more context.",
  },
  completed: {
    key: "lifecycle:completed",
    label: "Completed",
    tone: "neutral",
    kind: "lifecycle",
    description: "The planned coaching journey has been completed.",
  },
  churned: {
    key: "lifecycle:churned",
    label: "Churned",
    tone: "neutral",
    kind: "lifecycle",
    description:
      "The coaching relationship ended before a successful completion.",
  },
};

const attentionReasonMeta: Record<AttentionReasonCode, ClientAttentionReason> =
  {
    manual_at_risk: {
      code: "manual_at_risk",
      label: "Manually flagged by coach",
      severity: "high",
      priority: 1,
    },
    checkin_overdue: {
      code: "checkin_overdue",
      label: "Overdue check-in",
      severity: "high",
      priority: 2,
    },
    missed_checkins: {
      code: "missed_checkins",
      label: "Missed latest check-in",
      severity: "high",
      priority: 3,
    },
    no_recent_reply: {
      code: "no_recent_reply",
      label: "No recent client reply",
      severity: "medium",
      priority: 4,
    },
    low_adherence: {
      code: "low_adherence",
      label: "Adherence trending down",
      severity: "medium",
      priority: 5,
    },
    no_active_delivery: {
      code: "no_active_delivery",
      label: "No active delivery",
      severity: "medium",
      priority: 6,
    },
    inactive_client: {
      code: "inactive_client",
      label: "No recent client activity",
      severity: "medium",
      priority: 7,
    },
  };

const riskFlagReasonMap = {
  missed_checkins: "missed_checkins",
  no_recent_reply: "no_recent_reply",
  low_adherence_trend: "low_adherence",
  inactive_client: "inactive_client",
} as const;

function cloneBadge<T extends ClientStatusBadgeDisplay>(badge: T): T {
  return { ...badge };
}

function normalizeRelationshipStatus(
  value: string | null | undefined,
): ClientRelationshipStatus {
  return value === "removed" || value === "transferred_out" ? value : "active";
}

function addReason(
  reasons: Map<AttentionReasonCode, ClientAttentionReason>,
  code: AttentionReasonCode,
) {
  reasons.set(code, { ...attentionReasonMeta[code] });
}

function hasPositiveCount(value: number | null | undefined) {
  return typeof value === "number" && value > 0;
}

function getRiskState(summary: ClientStatusDisplaySummaryLike) {
  return summary.risk_state ?? summary.riskState;
}

function hasAggregateAttentionSignal(summary: ClientStatusDisplaySummaryLike) {
  const riskState = getRiskState(summary);
  return riskState === "at_risk" || riskState === "needs_attention";
}

function hasRawRiskFlags(summary: ClientStatusDisplaySummaryLike) {
  return (summary.risk_flags ?? summary.riskFlags ?? []).length > 0;
}

function hasExplicitNoActiveDelivery(summary: ClientStatusDisplaySummaryLike) {
  const hasWorkoutOrProgram =
    summary.has_active_program ??
    summary.hasActiveProgram ??
    summary.has_active_workout ??
    summary.hasActiveWorkout ??
    summary.has_workout_assigned ??
    summary.hasWorkoutAssigned;
  const hasNutrition =
    summary.has_active_nutrition ??
    summary.hasActiveNutrition ??
    summary.has_nutrition_assigned ??
    summary.hasNutritionAssigned;
  const hasCheckIn =
    summary.has_checkin_cadence ??
    summary.hasCheckinCadence ??
    summary.has_checkin_assigned ??
    summary.hasCheckInAssigned ??
    ((summary.checkin_template_id ?? summary.checkinTemplateId)
      ? true
      : (summary.checkin_frequency ?? summary.checkinFrequency)
        ? true
        : undefined);

  return (
    hasWorkoutOrProgram === false &&
    hasNutrition === false &&
    hasCheckIn === false
  );
}

export function getRelationshipBadgeDisplay(
  relationshipStatus: string | null | undefined,
) {
  const normalized = normalizeRelationshipStatus(relationshipStatus);
  if (normalized === "active") return undefined;
  return cloneBadge(relationshipBadgeMeta[normalized]);
}

export function getLifecycleBadgeDisplay(
  lifecycleState: string | null | undefined,
) {
  const normalized = parseClientLifecycleState(lifecycleState);
  if (!normalized) return undefined;
  return cloneBadge(lifecycleBadgeMeta[normalized]);
}

export function getAttentionReasons(
  summary: ClientStatusDisplaySummaryLike,
): ClientAttentionReason[] {
  const reasons = new Map<AttentionReasonCode, ClientAttentionReason>();
  const manualRisk =
    summary.manual_risk_flag ?? summary.manualRiskFlag ?? false;

  if (manualRisk) {
    addReason(reasons, "manual_at_risk");
  }

  if (
    Boolean(summary.has_overdue_checkin ?? summary.hasOverdueCheckin) ||
    hasPositiveCount(
      summary.overdue_checkins_count ?? summary.overdueCheckinsCount,
    )
  ) {
    addReason(reasons, "checkin_overdue");
  }

  for (const flag of normalizeClientRiskFlags(
    summary.risk_flags ?? summary.riskFlags,
  )) {
    addReason(reasons, riskFlagReasonMap[flag]);
  }

  const lifecycle = parseClientLifecycleState(
    summary.lifecycle_state ?? summary.lifecycleState,
  );
  if (lifecycle === "active" && hasExplicitNoActiveDelivery(summary)) {
    addReason(reasons, "no_active_delivery");
  }

  // Future inputs, intentionally not computed here:
  // - missed_checkins threshold: 2 missed in the last 4 expected check-ins
  // - no_recent_reply threshold: 7+ days without a client reply
  // - low_adherence threshold: below 60% planned adherence over 14 days
  // - inactive_client threshold: 14+ days without meaningful activity
  // This helper consumes existing summary fields and risk flags only.
  return Array.from(reasons.values()).sort((left, right) => {
    return left.priority - right.priority;
  });
}

export function getAttentionBadgeDisplay(
  attentionReasons: ClientAttentionReason[],
  forceDisplay = false,
) {
  if (attentionReasons.length === 0 && !forceDisplay) return undefined;
  const reasonLabels = attentionReasons.map((reason) => reason.label);

  return {
    key: "attention:needs_attention",
    label: "Needs attention",
    tone: attentionReasons.some((reason) => reason.severity === "high")
      ? "danger"
      : "warning",
    kind: "attention",
    description:
      reasonLabels.length > 0
        ? `${reasonLabels.length === 1 ? "Reason" : "Reasons"}: ${reasonLabels.join("; ")}.`
        : unresolvedAttentionDescription,
    reasons: attentionReasons.map((reason) => ({ ...reason })),
  } satisfies ClientStatusBadgeDisplay & {
    reasons: ClientAttentionReason[];
  };
}

export function getClientGlobalStatusDisplay(
  summary: ClientStatusDisplaySummaryLike,
): ClientGlobalStatusDisplay {
  const relationshipBadge = getRelationshipBadgeDisplay(
    summary.relationship_status ?? summary.relationshipStatus,
  );
  const lifecycleBadge = getLifecycleBadgeDisplay(
    summary.lifecycle_state ?? summary.lifecycleState,
  );
  const attentionReasons = getAttentionReasons(summary);
  const attentionBadge = getAttentionBadgeDisplay(
    attentionReasons,
    hasAggregateAttentionSignal(summary) || hasRawRiskFlags(summary),
  );

  if (relationshipBadge) {
    return {
      relationshipBadge,
      lifecycleBadge,
      attentionBadge,
      globalBadges: [relationshipBadge],
      attentionReasons,
    };
  }

  return {
    relationshipBadge,
    lifecycleBadge,
    attentionBadge,
    globalBadges: [lifecycleBadge, attentionBadge].filter(
      (badge): badge is ClientStatusBadgeDisplay => Boolean(badge),
    ),
    attentionReasons,
  };
}
