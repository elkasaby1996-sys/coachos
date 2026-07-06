import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nutritionProgramsSource = readFileSync(
  resolve(process.cwd(), "src/pages/pt/nutrition.tsx"),
  "utf8",
);

describe("PT nutrition programs surface", () => {
  it("does not render summary KPI cards above the nutrition program list", () => {
    expect(nutritionProgramsSource).not.toContain("page-kpi-block");
    expect(nutritionProgramsSource).not.toContain(
      "Reusable plans ready to assign",
    );
    expect(nutritionProgramsSource).not.toContain(
      "Available for current assignments",
    );
    expect(nutritionProgramsSource).not.toContain(
      "Stored for reference without clutter",
    );
  });

  it("keeps the working list controls available", () => {
    expect(nutritionProgramsSource).toContain("Search templates");
    expect(nutritionProgramsSource).toContain("All nutrition types");
    expect(nutritionProgramsSource).toContain("Sort by updated");
  });
});
