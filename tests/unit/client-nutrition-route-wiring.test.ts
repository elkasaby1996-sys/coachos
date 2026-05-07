import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoutes = readFileSync(
  resolve(process.cwd(), "src", "routes", "app.tsx"),
  "utf8",
);

describe("client nutrition route wiring", () => {
  it("registers /app/nutrition as a real page route", () => {
    expect(appRoutes).toContain("path=\"nutrition\" element={<ClientNutritionPage />}"); // prettier-ignore
  });

  it("registers a dedicated create-plan route", () => {
    expect(appRoutes).toContain("path=\"nutrition/new\"");
    expect(appRoutes).toContain("element={<ClientNutritionCreatePlanPage />}");
  });

  it("keeps the shared day-detail route for logging", () => {
    expect(appRoutes).toContain("path=\"nutrition/:assigned_nutrition_day_id\"");
    expect(appRoutes).toContain("element={<ClientNutritionDayPage />}");
  });
});
