import { describe, expect, it } from "vitest";
import {
  getClientLifecycleReason,
  getClientRiskState,
  getClientRiskFlagMeta,
  getClientLifecycleMeta,
  isClientAtRisk,
  matchesClientSegment,
  normalizeClientLifecycleState,
  normalizeClientRiskFlags,
} from "../../src/lib/client-lifecycle";

describe("client lifecycle helpers", () => {
  it("returns an explicit unknown lifecycle state instead of silently treating it as active", () => {
    expect(normalizeClientLifecycleState(null)).toBe("unknown");
    expect(normalizeClientLifecycleState("mystery")).toBe("unknown");
    expect(normalizeClientLifecycleState("paused")).toBe("paused");
    expect(getClientLifecycleMeta("mystery").label).toBe("Unknown");
  });

  it("deduplicates and filters risk flags", () => {
    expect(
      normalizeClientRiskFlags([
        "missed_checkins",
        "missed_checkins",
        "inactive_client",
        "unknown",
      ]),
    ).toEqual(["missed_checkins", "inactive_client"]);
  });

  it("surfaces at-risk clients from manual override or derived flags", () => {
    expect(
      isClientAtRisk({
        lifecycle_state: "active",
        risk_flags: ["inactive_client"],
      }),
    ).toBe(true);
    expect(
      isClientAtRisk({
        lifecycle_state: "active",
        manual_risk_flag: true,
        risk_flags: [],
      }),
    ).toBe(true);
    expect(isClientAtRisk({ lifecycle_state: "active", risk_flags: [] })).toBe(
      false,
    );
    expect(
      getClientRiskState({
        lifecycle_state: "active",
        risk_flags: [],
      }),
    ).toBe("healthy");
  });

  it("matches the required smart segments", () => {
    const summary = {
      lifecycle_state: "paused",
      onboarding_incomplete: true,
      has_overdue_checkin: true,
      risk_flags: ["missed_checkins"],
    };

    expect(matchesClientSegment(summary, "all")).toBe(true);
    expect(matchesClientSegment(summary, "paused")).toBe(true);
    expect(matchesClientSegment(summary, "onboarding_incomplete")).toBe(true);
    expect(matchesClientSegment(summary, "checkin_overdue")).toBe(true);
    expect(matchesClientSegment(summary, "at_risk")).toBe(true);
  });

  it("returns the active lifecycle reason only when applicable", () => {
    expect(
      getClientLifecycleReason({
        lifecycleState: "paused",
        pausedReason: "Traveling for work",
      }),
    ).toBe("Traveling for work");
    expect(
      getClientLifecycleReason({
        lifecycleState: "churned",
        churnReason: "Budget",
      }),
    ).toBe("Budget");
    expect(
      getClientLifecycleReason({
        lifecycleState: "active",
        pausedReason: "Old reason",
      }),
    ).toBeNull();
  });

  it("exposes compact risk badge metadata", () => {
    expect(getClientRiskFlagMeta("no_recent_reply")?.shortLabel).toBe(
      "No reply",
    );
    expect(getClientRiskFlagMeta("unknown")).toBeNull();
  });
});
