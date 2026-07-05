import { describe, expect, it } from "vitest";
import {
  clientLifecycleStates,
  type ClientSegmentKey,
} from "../../src/lib/client-lifecycle";
import {
  getAttentionBadgeDisplay,
  getAttentionReasons,
  getClientGlobalStatusDisplay,
  getLifecycleBadgeDisplay,
  getRelationshipBadgeDisplay,
} from "../../src/lib/client-status-display";

describe("client status display taxonomy", () => {
  it("returns one lifecycle badge for an active client with active lifecycle", () => {
    const display = getClientGlobalStatusDisplay({
      relationshipStatus: "active",
      lifecycleState: "active",
      riskFlags: [],
    });

    expect(display.relationshipBadge).toBeUndefined();
    expect(display.lifecycleBadge).toMatchObject({
      key: "lifecycle:active",
      label: "Active",
      kind: "lifecycle",
      tone: "success",
    });
    expect(display.attentionBadge).toBeUndefined();
    expect(display.globalBadges).toEqual([display.lifecycleBadge]);
  });

  it("returns an Onboarding lifecycle badge for an active onboarding client", () => {
    expect(getLifecycleBadgeDisplay("onboarding")).toMatchObject({
      key: "lifecycle:onboarding",
      label: "Onboarding",
      kind: "lifecycle",
      tone: "warning",
    });
  });

  it("returns a Paused lifecycle badge for an active paused client", () => {
    expect(getLifecycleBadgeDisplay("paused")).toMatchObject({
      key: "lifecycle:paused",
      label: "Paused",
      kind: "lifecycle",
      tone: "warning",
    });
  });

  it("returns lifecycle plus one Needs attention badge for manual risk", () => {
    const display = getClientGlobalStatusDisplay({
      relationship_status: "active",
      lifecycle_state: "active",
      manual_risk_flag: true,
      risk_flags: [],
    });

    expect(display.globalBadges.map((badge) => badge.label)).toEqual([
      "Active",
      "Needs attention",
    ]);
    expect(display.attentionBadge?.reasons).toEqual([
      {
        code: "manual_at_risk",
        label: "Manually flagged by coach",
        severity: "high",
        priority: 1,
      },
    ]);
    expect(display.attentionBadge?.description).toBe(
      "Reason: Manually flagged by coach.",
    );
  });

  it("returns lifecycle plus one Needs attention badge for overdue check-ins", () => {
    const display = getClientGlobalStatusDisplay({
      relationshipStatus: "active",
      lifecycleState: "active",
      hasOverdueCheckin: true,
      overdueCheckinsCount: 3,
    });

    expect(display.globalBadges.map((badge) => badge.label)).toEqual([
      "Active",
      "Needs attention",
    ]);
    expect(display.attentionReasons).toEqual([
      {
        code: "checkin_overdue",
        label: "Overdue check-in",
        severity: "high",
        priority: 2,
      },
    ]);
  });

  it("collapses multiple risk flags into one attention badge with multiple reasons", () => {
    const display = getClientGlobalStatusDisplay({
      relationshipStatus: "active",
      lifecycleState: "active",
      manualRiskFlag: true,
      hasOverdueCheckin: true,
      riskFlags: [
        "no_recent_reply",
        "missed_checkins",
        "low_adherence_trend",
        "inactive_client",
      ],
    });

    expect(display.globalBadges).toHaveLength(2);
    expect(display.globalBadges[1]).toMatchObject({
      key: "attention:needs_attention",
      label: "Needs attention",
      kind: "attention",
      tone: "danger",
    });
    expect(display.attentionBadge?.reasons.map((reason) => reason.code)).toEqual(
      [
        "manual_at_risk",
        "checkin_overdue",
        "missed_checkins",
        "no_recent_reply",
        "low_adherence",
        "inactive_client",
      ],
    );
    expect(display.attentionBadge?.description).toBe(
      "Reasons: Manually flagged by coach; Overdue check-in; Missed latest check-in; No recent client reply; Adherence trending down; No recent client activity.",
    );
    expect(display.attentionBadge?.description).not.toContain(
      "This client has one or more existing coaching attention signals.",
    );
  });

  it("explains a single risk flag with the concrete attention reason", () => {
    const display = getClientGlobalStatusDisplay({
      relationshipStatus: "active",
      lifecycleState: "active",
      riskFlags: ["missed_checkins"],
    });

    expect(display.globalBadges.map((badge) => badge.label)).toEqual([
      "Active",
      "Needs attention",
    ]);
    expect(display.attentionBadge?.description).toBe(
      "Reason: Missed latest check-in.",
    );
  });

  it("uses a defensive fallback when an aggregate attention signal has no resolved reason", () => {
    const display = getClientGlobalStatusDisplay({
      relationshipStatus: "active",
      lifecycleState: "active",
      riskState: "needs_attention",
      riskFlags: [],
    });

    expect(display.lifecycleBadge).toMatchObject({
      key: "lifecycle:active",
      kind: "lifecycle",
    });
    expect(display.attentionReasons).toEqual([]);
    expect(display.attentionBadge).toMatchObject({
      key: "attention:needs_attention",
      label: "Needs attention",
      kind: "attention",
      description:
        "Attention signal detected, but the reason could not be resolved.",
    });
  });

  it("can render the unresolved fallback without treating attention as lifecycle", () => {
    const badge = getAttentionBadgeDisplay([], true);

    expect(badge).toMatchObject({
      label: "Needs attention",
      kind: "attention",
      description:
        "Attention signal detected, but the reason could not be resolved.",
    });
    expect(getLifecycleBadgeDisplay("needs_attention")).toBeUndefined();
  });

  it("sorts attention reasons by locked priority", () => {
    expect(
      getAttentionReasons({
        riskFlags: ["inactive_client", "low_adherence_trend"],
        manualRiskFlag: true,
        hasOverdueCheckin: true,
      }).map((reason) => reason.code),
    ).toEqual([
      "manual_at_risk",
      "checkin_overdue",
      "low_adherence",
      "inactive_client",
    ]);
  });

  it("does not return an attention badge for healthy or no-risk clients", () => {
    const healthyDisplay = getClientGlobalStatusDisplay({
      relationshipStatus: "active",
      lifecycleState: "active",
      riskState: "healthy",
      riskFlags: [],
    });

    expect(healthyDisplay.attentionBadge).toBeUndefined();
    expect(healthyDisplay.globalBadges.map((badge) => badge.label)).not.toContain(
      "Healthy",
    );
  });

  it("returns only Removed globally for a removed relationship", () => {
    const display = getClientGlobalStatusDisplay({
      relationshipStatus: "removed",
      lifecycleState: "active",
      manualRiskFlag: true,
      riskFlags: ["missed_checkins"],
    });

    expect(getRelationshipBadgeDisplay("removed")).toMatchObject({
      key: "relationship:removed",
      label: "Removed",
      kind: "relationship",
      tone: "warning",
    });
    expect(display.globalBadges).toEqual([display.relationshipBadge]);
    expect(display.globalBadges.map((badge) => badge.label)).toEqual([
      "Removed",
    ]);
  });

  it("returns only Transferred out globally for a transferred-out relationship", () => {
    const display = getClientGlobalStatusDisplay({
      relationship_status: "transferred_out",
      lifecycle_state: "paused",
      has_overdue_checkin: true,
      risk_flags: ["no_recent_reply"],
    });

    expect(display.relationshipBadge).toMatchObject({
      key: "relationship:transferred_out",
      label: "Transferred out",
      kind: "relationship",
      tone: "info",
    });
    expect(display.globalBadges).toEqual([display.relationshipBadge]);
  });

  it("suppresses lifecycle and attention from global badges for historical relationships", () => {
    for (const relationshipStatus of ["removed", "transferred_out"] as const) {
      const display = getClientGlobalStatusDisplay({
        relationshipStatus,
        lifecycleState: "active",
        manualRiskFlag: true,
        riskFlags: ["missed_checkins"],
      });

      expect(display.lifecycleBadge).toBeDefined();
      expect(display.attentionBadge).toBeDefined();
      expect(display.globalBadges).toHaveLength(1);
      expect(display.globalBadges[0]?.kind).toBe("relationship");
    }
  });

  it("does not treat at_risk as lifecycle", () => {
    const display = getClientGlobalStatusDisplay({
      relationshipStatus: "active",
      lifecycleState: "at_risk",
      riskState: "at_risk",
    });

    expect(display.lifecycleBadge).toBeUndefined();
    expect(display.globalBadges.map((badge) => badge.kind)).toEqual([
      "attention",
    ]);
    expect(display.attentionBadge?.description).toBe(
      "Attention signal detected, but the reason could not be resolved.",
    );
  });

  it("preserves stored lifecycle and filter taxonomy values", () => {
    const filterValues: ClientSegmentKey[] = [
      "all",
      "onboarding_incomplete",
      "checkin_overdue",
      "at_risk",
      "paused",
    ];

    expect(clientLifecycleStates).toEqual([
      "invited",
      "onboarding",
      "active",
      "paused",
      "completed",
      "churned",
    ]);
    expect(filterValues).toEqual([
      "all",
      "onboarding_incomplete",
      "checkin_overdue",
      "at_risk",
      "paused",
    ]);
  });

  it("excludes workflow and domain statuses from global client badges", () => {
    for (const workflowStatus of ["submitted", "reviewed", "assigned"]) {
      const display = getClientGlobalStatusDisplay({
        relationshipStatus: "active",
        lifecycleState: "active",
        status: workflowStatus,
        onboardingStatus: workflowStatus,
        assignmentStatus: workflowStatus,
      });

      expect(display.globalBadges.map((badge) => badge.label)).toEqual([
        "Active",
      ]);
    }
  });
});
