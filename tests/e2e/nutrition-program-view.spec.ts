import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./utils/test-helpers";

test.skip(
  process.env.E2E_WORKSPACE_DEMO !== "1",
  "Requires the local PT demo account",
);

for (const width of [1602, 375]) {
  test(`Nutrition cards and read-only preview at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 732 });
    await signInWithEmail(page, "demo.pt@repsync.test", "DemoPass123!");
    const templates = ["Balanced sample", "Empty sample"].map(
      (name, index) => ({
        id: `00000000-0000-4000-8000-00000000000${index + 1}`,
        name,
        description: index
          ? "A longer description that wraps across several lines to check that program cards remain the same height."
          : "Simple daily meals.",
        nutrition_type_tag: "Balanced",
        duration_weeks: 2,
        is_active: true,
        created_at: "2026-09-06T09:00:00Z",
        updated_at: "2026-09-06T09:00:00Z",
      }),
    );
    const fixtures: Record<string, unknown[]> = {
      nutrition_templates: templates,
      nutrition_template_days: [
        {
          id: "day-1",
          nutrition_template_id: templates[0].id,
          week_index: 1,
          day_of_week: 1,
          title: "Training day",
          notes: "Pack lunch ahead.",
        },
        {
          id: "day-2",
          nutrition_template_id: templates[0].id,
          week_index: 1,
          day_of_week: 2,
        },
      ],
      nutrition_template_meals: [
        {
          id: "meal-1",
          nutrition_template_day_id: "day-1",
          meal_order: 1,
          meal_name: "Breakfast oats",
          notes: "Serve warm.",
          calories: 999,
        },
        {
          id: "meal-2",
          nutrition_template_day_id: "day-2",
          meal_order: 1,
          meal_name: "Lunch bowl",
          calories: 540,
          protein_g: 30,
          carbs_g: 60,
          fat_g: 20,
        },
      ],
      nutrition_template_meal_components: [
        {
          id: "component-1",
          nutrition_template_meal_id: "meal-1",
          sort_order: 1,
          component_name: "Rolled oats",
          quantity: 60,
          unit: "g",
          calories: 230,
          protein_g: 8,
          carbs_g: 40,
          fat_g: 4,
          recipe_text: "Simmer until soft.",
        },
        {
          id: "component-2",
          nutrition_template_meal_id: "meal-1",
          sort_order: 2,
          component_name: "Milk",
          quantity: 200,
          unit: "ml",
          calories: 100,
          protein_g: 7,
          carbs_g: 10,
          fat_g: 3,
        },
      ],
    };
    const methods: string[] = [];
    for (const [table, rows] of Object.entries(fixtures)) {
      await page.route(`**/rest/v1/${table}?*`, (route) => {
        methods.push(route.request().method());
        return route.fulfill({ json: rows });
      });
    }
    await page.goto("/pt/nutrition-programs");
    const cards = page
      .locator(".ui-card")
      .filter({ has: page.getByRole("button", { name: "View", exact: true }) });
    await expect(cards).toHaveCount(2, { timeout: 30000 });
    const dimensions = await cards.evaluateAll((elements) =>
      elements.map((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    );
    expect(dimensions[0].width).toBeCloseTo(dimensions[1].width, 0);
    expect(dimensions[0].height).toBeCloseTo(dimensions[1].height, 0);
    for (const action of ["View", "Edit", "Duplicate", "Delete"]) {
      await expect(
        cards
          .first()
          .locator(".ui-card-header")
          .getByRole("button", { name: action, exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", { name: "All nutrition types", exact: true })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();
    const clearance = await page
      .locator('.app-select-trigger[data-state="open"]')
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top -
          el.closest("main")!.getBoundingClientRect().top,
      );
    expect(clearance).toBeGreaterThanOrEqual(4);
    await page
      .getByRole("menuitem", { name: "All nutrition types", exact: true })
      .click();
    await page.screenshot({
      path: `test-results/nutrition-cards-${width}.png`,
      animations: "disabled",
    });
    await cards
      .filter({ hasText: "Balanced sample" })
      .getByRole("button", { name: "View", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Breakfast oats");
    await expect(dialog).toContainText("330 kcal");
    await expect(dialog).toContainText("60 g");
    await expect(dialog).toContainText("Simmer until soft.");
    await expect(dialog).toContainText("Pack lunch ahead.");
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(page).toHaveURL(/\/pt\/nutrition-programs$/);
    await expect(dialog).toHaveCSS("opacity", "1");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/nutrition-view-${width}.png`,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "Program day", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Tuesday", exact: true }).click();
    await expect(dialog).toContainText("Lunch bowl");
    await expect(dialog).toContainText("540 kcal");
    await dialog
      .getByRole("button", { name: "Program week", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Week 2", exact: true }).click();
    await expect(dialog).toContainText("No meals added for this day yet.");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await cards
      .filter({ hasText: "Empty sample" })
      .getByRole("button", { name: "View", exact: true })
      .click();
    await expect(dialog).toContainText("No meals added for this day yet.");
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((method) => method === "GET")).toBe(true);
  });
}
