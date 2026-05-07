import { describe, expect, it } from "vitest";
import {
  applyUnifiedNutritionFilter,
  groupUnifiedNutritionByDate,
  type UnifiedNutritionDayRow,
} from "../../src/pages/client/nutrition-unified";
import {
  buildUnifiedSourceLabel,
  classifyUnifiedSourceKind,
} from "../../src/lib/source-labels";

const todayKey = "2026-04-13";

const rows: UnifiedNutritionDayRow[] = [
  {
    id: "today-personal",
    date: "2026-04-13",
    planId: "plan-1",
    planStatus: "active",
    planName: "Personal Lean Week",
    sourceKind: "personal",
    sourceLabel: "Personal",
    sourceWorkspaceId: null,
    mealsTotal: 3,
    mealsCompleted: 1,
    macros: { calories: 2100, protein_g: 160, carbs_g: 190, fat_g: 70 },
  },
  {
    id: "today-assigned",
    date: "2026-04-13",
    planId: "plan-2",
    planStatus: "active",
    planName: "Coach Cut Phase",
    sourceKind: "assigned",
    sourceLabel: "Coach Sarah",
    sourceWorkspaceId: "ws-1",
    mealsTotal: 4,
    mealsCompleted: 2,
    macros: { calories: 2400, protein_g: 180, carbs_g: 220, fat_g: 75 },
  },
  {
    id: "upcoming-assigned",
    date: "2026-04-15",
    planId: "plan-2",
    planStatus: "active",
    planName: "Coach Cut Phase",
    sourceKind: "assigned",
    sourceLabel: "Coach Sarah",
    sourceWorkspaceId: "ws-1",
    mealsTotal: 4,
    mealsCompleted: 0,
    macros: { calories: 2350, protein_g: 175, carbs_g: 210, fat_g: 72 },
  },
  {
    id: "recent-personal",
    date: "2026-04-10",
    planId: "plan-1",
    planStatus: "active",
    planName: "Personal Lean Week",
    sourceKind: "personal",
    sourceLabel: "Personal",
    sourceWorkspaceId: null,
    mealsTotal: 3,
    mealsCompleted: 3,
    macros: { calories: 2050, protein_g: 158, carbs_g: 180, fat_g: 68 },
  },
];

describe("nutrition source helper", () => {
  it("classifies personal vs assigned source from workspace ownership", () => {
    expect(classifyUnifiedSourceKind({ workspaceId: null })).toBe("personal");
    expect(classifyUnifiedSourceKind({ workspaceId: "ws-1" })).toBe("assigned");
  });

  it("builds compact source labels", () => {
    expect(buildUnifiedSourceLabel({ workspaceId: null })).toBe("Personal");
    expect(
      buildUnifiedSourceLabel({ workspaceId: "ws-1", workspaceName: "Sarah" }),
    ).toBe("Coach Sarah");
    expect(
      buildUnifiedSourceLabel({
        workspaceId: "ws-1",
        workspaceName: "Coach Omar",
      }),
    ).toBe("Coach Omar");
  });
});

describe("groupUnifiedNutritionByDate", () => {
  it("keeps nutrition merged by function and date relevance", () => {
    const grouped = groupUnifiedNutritionByDate(rows, todayKey);

    expect(grouped.today.map((row) => row.id)).toEqual([
      "today-assigned",
      "today-personal",
    ]);
    expect(grouped.upcoming.map((row) => row.id)).toEqual([
      "upcoming-assigned",
    ]);
    expect(grouped.recent.map((row) => row.id)).toEqual(["recent-personal"]);
  });
});

describe("applyUnifiedNutritionFilter", () => {
  it("supports All, Assigned, Personal, Today, Upcoming", () => {
    expect(applyUnifiedNutritionFilter(rows, "all", todayKey)).toHaveLength(4);
    expect(
      applyUnifiedNutritionFilter(rows, "assigned", todayKey).every(
        (row) => row.sourceKind === "assigned",
      ),
    ).toBe(true);
    expect(
      applyUnifiedNutritionFilter(rows, "personal", todayKey).every(
        (row) => row.sourceKind === "personal",
      ),
    ).toBe(true);
    expect(
      applyUnifiedNutritionFilter(rows, "today", todayKey).map((row) => row.id),
    ).toEqual(["today-personal", "today-assigned"]);
    expect(
      applyUnifiedNutritionFilter(rows, "upcoming", todayKey).map(
        (row) => row.id,
      ),
    ).toEqual(["upcoming-assigned"]);
  });
});
