import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ptNutritionBuilderPage = readFileSync(
  resolve(process.cwd(), "src", "pages", "pt", "nutrition-template-builder.tsx"),
  "utf8",
);

describe("pt nutrition template builder wiring", () => {
  it("supports applying a slot to all days in the program", () => {
    expect(ptNutritionBuilderPage).toContain("duplicateSlotToAllDays");
    expect(ptNutritionBuilderPage).toContain("All days");
    expect(ptNutritionBuilderPage).not.toContain("Apply this slot to all days in the program.");
  });
});
