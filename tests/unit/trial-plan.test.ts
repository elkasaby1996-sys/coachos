import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLIC_TRIAL_POLICY,
  TRIAL_DURATION_DAYS,
} from "../../src/features/commercial-catalogue/contracts";
import {
  buildPtSignupPath,
  buildTrialPath,
  getTrialPlanFromSearch,
  getTrialPlanLabel,
  normalizeTrialPlan,
  defaultTrialPlan,
  trialPlanIds,
  persistPendingTrialPlan,
  getPendingTrialPlan,
  clearPendingTrialPlan,
} from "../../src/lib/trial-plan";

describe("trial plan selection", () => {
  it("keeps every supported pricing tier through the trial redirect", () => {
    for (const plan of ["launch", "growth", "scale"] as const) {
      expect(buildPtSignupPath(`?plan=${plan}`)).toBe(
        `/signup/pt?plan=${plan}`,
      );
      expect(getTrialPlanFromSearch(`?plan=${plan}`)).toBe(plan);
      expect(buildTrialPath(plan)).toBe(`/start-trial?plan=${plan}`);
    }
  });

  afterEach(() => vi.unstubAllGlobals());

  it("normalizes retired, unknown, and blank intent to Growth", () => {
    for (const value of ["studio", "unknown", "", " ", null, undefined])
      expect(normalizeTrialPlan(value)).toBe("growth");
    expect(defaultTrialPlan).toBe("growth");
    expect(trialPlanIds).toEqual(["launch", "growth", "scale"]);
    expect(normalizeTrialPlan(" SCALE ")).toBe("scale");
    expect(buildPtSignupPath("?plan=studio")).toBe("/signup/pt?plan=growth");
  });

  it("defines a 14-day no-card Growth experience with trial capacities", () => {
    expect(TRIAL_DURATION_DAYS).toBe(14);
    expect(PUBLIC_TRIAL_POLICY).toEqual({
      durationDays: 14,
      featurePlanKey: "growth",
      defaultRequestedPlanKey: "growth",
      requiresCard: false,
      capacities: {
        countedClients: 10,
        coachSeats: 2,
        activeWorkspaces: 1,
        publishedPackages: 3,
      },
    });
  });

  it("retains the storage key, clears intent, and normalizes legacy stored values", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    expect(getPendingTrialPlan()).toBe("growth");
    persistPendingTrialPlan("scale");
    expect(values.get("repsync_pending_trial_plan")).toBe("scale");
    expect(getPendingTrialPlan()).toBe("scale");
    values.set("repsync_pending_trial_plan", "studio");
    expect(getPendingTrialPlan()).toBe("growth");
    clearPendingTrialPlan();
    expect(values.size).toBe(0);
  });

  it("is safe without a browser", () => {
    vi.stubGlobal("window", undefined);
    expect(getPendingTrialPlan()).toBe("growth");
    expect(() => persistPendingTrialPlan("launch")).not.toThrow();
    expect(() => clearPendingTrialPlan()).not.toThrow();
  });

  it("falls back safely to Growth for missing or unsupported plan values", () => {
    expect(normalizeTrialPlan(null)).toBe("growth");
    expect(normalizeTrialPlan("enterprise")).toBe("growth");
    expect(buildPtSignupPath("")).toBe("/signup/pt");
    expect(buildPtSignupPath("?plan=enterprise")).toBe(
      "/signup/pt?plan=growth",
    );
    expect(getTrialPlanLabel("growth")).toBe("Growth");
  });
});
