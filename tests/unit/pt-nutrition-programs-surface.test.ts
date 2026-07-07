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
    expect(nutritionProgramsSource).toContain(
      "xl:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]",
    );
    expect(nutritionProgramsSource).toContain("New template");
  });

  it("does not render nutrition type chips on program cards", () => {
    const cardTagBuilderStart =
      nutritionProgramsSource.indexOf("const buildTemplateTags");
    expect(cardTagBuilderStart).toBeGreaterThanOrEqual(0);
    const cardTagBuilderEnd = nutritionProgramsSource.indexOf(
      "const nutritionTypeOptions",
      cardTagBuilderStart,
    );
    expect(cardTagBuilderEnd).toBeGreaterThan(cardTagBuilderStart);
    const cardTagBuilder = nutritionProgramsSource.slice(
      cardTagBuilderStart,
      cardTagBuilderEnd,
    );

    expect(cardTagBuilder).toContain("Updated ${formatRelativeTime");
    expect(cardTagBuilder).not.toContain("formatNutritionTypeTag");
  });

  it("keeps the empty state concise", () => {
    expect(nutritionProgramsSource).toContain("Create the first program");
    expect(nutritionProgramsSource).not.toContain("Start with one template.");
  });
});
