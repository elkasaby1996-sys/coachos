import { expect, test } from "@playwright/test";
import { signInWithEmail } from "./utils/test-helpers";

test.skip(
  process.env.E2E_WORKSPACE_DEMO !== "1",
  "Requires the local PT demo account",
);

for (const width of [1602, 375]) {
  test(`View opens a read-only workout dialog at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 732 });
    await signInWithEmail(page, "demo.pt@repsync.test", "DemoPass123!");
    const templates = ["Strength sample", "Empty sample", "Retry sample"].map(
      (name, index) => ({
        id: `00000000-0000-4000-8000-00000000000${index + 1}`,
        name,
        description: "Sample workout for preview QA.",
        workout_type: "bodybuilding",
        workout_type_tag: "Strength",
        created_at: "2026-09-06T09:00:00Z",
      }),
    );
    const exercises = [
      {
        id: "row-1",
        sort_order: 1,
        sets: 4,
        reps: "6–8",
        rest_seconds: 90,
        tempo: "3-1-1",
        rpe: 8,
        superset_group: null,
        notes: "Keep a controlled descent.",
        video_url: null,
        exercise: {
          id: "squat",
          name: "Back squat",
          video_url: "https://example.com/squat",
        },
      },
      {
        id: "row-2",
        sort_order: 2,
        sets: 3,
        reps: "12",
        rest_seconds: 0,
        tempo: null,
        rpe: null,
        superset_group: "A",
        notes: null,
        video_url: null,
        exercise: [{ id: "row", name: "Cable row", video_url: null }],
      },
    ];
    const methods: string[] = [];
    let fail = true;
    await page.route("**/rest/v1/workout_templates?*", (route) =>
      route.fulfill({ json: templates }),
    );
    await page.route("**/rest/v1/workout_template_exercises?*", (route) => {
      methods.push(route.request().method());
      const id = new URL(route.request().url()).searchParams.get(
        "workout_template_id",
      );
      if (id?.endsWith("3") && fail)
        return route.fulfill({
          status: 500,
          json: { message: "Preview unavailable" },
        });
      return route.fulfill({ json: id?.endsWith("2") ? [] : exercises });
    });
    await page.goto("/pt/templates/workouts");
    const cards = page
      .locator(".ui-card")
      .filter({ has: page.getByRole("button", { name: "View", exact: true }) });
    await expect(cards).toHaveCount(3, { timeout: 30000 });
    for (const name of ["All workout types", "Sort by newest"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      const clearance = await page
        .locator('.app-select-trigger[data-state="open"]')
        .evaluate(
          (el) =>
            el.getBoundingClientRect().top -
            el.closest("main")!.getBoundingClientRect().top,
        );
      expect(clearance).toBeGreaterThanOrEqual(4);
      await page.getByRole("menuitem", { name, exact: true }).click();
    }
    expect(methods).toEqual([]);
    const open = async (name: string) =>
      cards
        .filter({ hasText: name })
        .getByRole("button", { name: "View", exact: true })
        .click();
    await open("Strength sample");
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Strength sample", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("listitem")).toHaveCount(2);
    await expect(dialog).toContainText("Back squat");
    await expect(dialog).toContainText("6–8");
    await expect(dialog).toContainText("90s");
    await expect(dialog).toContainText("3-1-1");
    await expect(dialog).toContainText("Keep a controlled descent.");
    await expect(dialog).toContainText("Superset A");
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(page).toHaveURL(/\/pt\/templates\/workouts$/);
    await expect(
      dialog.getByRole("link", { name: /Video: Back squat/ }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    await expect(dialog).toHaveCSS("opacity", "1");
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(733);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/workout-view-${width}.png`,
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await open("Empty sample");
    await expect(dialog).toContainText(
      "No exercises added to this workout yet.",
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await open("Retry sample");
    await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 30000 });
    fail = false;
    await dialog.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(dialog.getByRole("listitem")).toHaveCount(2);
    expect(methods.every((method) => method === "GET")).toBe(true);
  });
}
