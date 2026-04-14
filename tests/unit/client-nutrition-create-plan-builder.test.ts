import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const createPlanPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "client", "nutrition-create-plan.tsx"),
  "utf8",
);

describe("client nutrition create-plan builder", () => {
  it("uses day tabs for per-day meal editing", () => {
    expect(createPlanPage).toContain("TabsList");
    expect(createPlanPage).toContain("selectedDay");
    expect(createPlanPage).toContain("dayTabValue");
  });

  it("persists meal components in the shared nutrition model", () => {
    expect(createPlanPage).toContain("nutrition_template_meal_components");
    expect(createPlanPage).toContain("component_name");
    expect(createPlanPage).toContain("quantity");
    expect(createPlanPage).toContain("unit");
    expect(createPlanPage).toContain("protein_g");
    expect(createPlanPage).toContain("carbs_g");
    expect(createPlanPage).toContain("fat_g");
  });
});

