import { describe, expect, it } from "vitest";
import {
  buildPtSignupPath,
  buildTrialPath,
  getTrialPlanFromSearch,
  getTrialPlanLabel,
  normalizeTrialPlan,
} from "../../src/lib/trial-plan";

describe("trial plan selection", () => {
  it("keeps every supported pricing tier through the trial redirect", () => {
    for (const plan of ["launch", "growth", "scale", "studio"] as const) {
      expect(buildPtSignupPath(`?plan=${plan}`)).toBe(
        `/signup/pt?plan=${plan}`,
      );
      expect(getTrialPlanFromSearch(`?plan=${plan}`)).toBe(plan);
      expect(buildTrialPath(plan)).toBe(`/start-trial?plan=${plan}`);
    }
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
