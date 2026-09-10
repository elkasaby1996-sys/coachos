import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_PLAN_SNAPSHOT_V1 } from "../../src/features/commercial-catalogue/public-plan-snapshot";

const source = readFileSync("src/pages/public/marketing-content.tsx", "utf8");
describe("commercial marketing compatibility", () => {
  it("derives exactly three public cards from the v1 snapshot", () => {
    expect(source).toContain(
      "const pricingPlans = PUBLIC_PLAN_SNAPSHOT_V1.map",
    );
    expect(source).toContain("pricingPlans.map((plan)");
    expect(source).toMatch(/formatCommercialPrice\(\s*plan\.monthlyPriceMinor/);
    expect(source).toMatch(/formatCommercialPrice\(\s*plan\.annualPriceMinor/);
    expect(PUBLIC_PLAN_SNAPSHOT_V1.map((p) => p.displayName)).toEqual([
      "Launch",
      "Growth",
      "Scale",
    ]);
    for (const stale of [
      "Studio",
      "$49",
      "$490",
      "$99",
      "$990",
      "35 active clients",
      "10 workspaces",
    ])
      expect(source).not.toContain(stale);
  });
  it("uses corrected capacity and featured fields", () => {
    expect(source).toContain(
      "Client capacity: ${plan.capacities.countedClients}",
    );
    expect(source).toContain("featured: plan.isMostPopular");
    expect(PUBLIC_PLAN_SNAPSHOT_V1[1].capacities.countedClients).toBe(50);
    expect(PUBLIC_PLAN_SNAPSHOT_V1[2].capacities.activeWorkspaces).toBe(5);
    expect(
      PUBLIC_PLAN_SNAPSHOT_V1.filter((p) => p.isMostPopular).map(
        (p) => p.planKey,
      ),
    ).toEqual(["growth"]);
  });
  it("keeps trial feature experience separate from intended paid plan", () => {
    const signup = readFileSync("src/pages/public/pt-signup.tsx", "utf8");
    expect(signup).toContain("${TRIAL_DURATION_DAYS}-day Growth trial");
    expect(signup).toContain("is your intended paid plan");
    expect(signup).toContain("requested_plan: selectedPlan");
    expect(signup).toContain("No card required");
    expect(source).toContain("PR-PRICE-10");
    expect(source).not.toMatch(/7-day|seven\s+(?:calendar\s+)?days/i);
  });
});
