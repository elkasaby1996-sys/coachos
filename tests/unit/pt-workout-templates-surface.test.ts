import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workoutTemplatesSource = readFileSync(
  resolve(process.cwd(), "src/pages/pt/workout-templates.tsx"),
  "utf8",
);

describe("PT workout templates surface", () => {
  it("does not render summary KPI cards above the template list", () => {
    expect(workoutTemplatesSource).not.toContain("page-kpi-block");
    expect(workoutTemplatesSource).not.toContain("Reusable sessions ready");
    expect(workoutTemplatesSource).not.toContain("Distinct training tags");
    expect(workoutTemplatesSource).not.toContain("Created in the last 30 days");
  });

  it("keeps the working list controls available", () => {
    expect(workoutTemplatesSource).toContain("Search templates");
    expect(workoutTemplatesSource).toContain("All workout types");
    expect(workoutTemplatesSource).toContain("Sort by newest");
  });
});
