import { expect, test } from "@playwright/test";
import {
  ensureAuthenticatedNavigation,
  requireEnvVars,
  signInWithEmail,
} from "./utils/test-helpers";

test.describe("Smoke: PT assign workout", () => {
  test("PT can assign workout to a client", async ({ page }) => {
    const required = requireEnvVars([
      "E2E_PT_EMAIL",
      "E2E_PT_PASSWORD",
      "E2E_CLIENT_ID",
      "E2E_WORKOUT_TEMPLATE_ID",
    ]);
    test.skip(!required.ok, `Missing env: ${required.missing.join(", ")}`);

    await signInWithEmail(
      page,
      process.env.E2E_PT_EMAIL!,
      process.env.E2E_PT_PASSWORD!,
    );
    await ensureAuthenticatedNavigation(
      page,
      `/pt/clients/${process.env.E2E_CLIENT_ID}?tab=workout`,
      process.env.E2E_PT_EMAIL!,
      process.env.E2E_PT_PASSWORD!,
    );
    await expect(page).toHaveURL(/\/pt\/clients\/.+\?tab=workout/);

    const workoutTab = page.getByRole("tab", { name: /^workout$/i }).first();
    if (await workoutTab.isVisible()) {
      await workoutTab.click();
    }

    await expect(
      page.locator("label", { hasText: "Workout template" }),
    ).toBeVisible({ timeout: 30_000 });

    const templateSelect = page
      .locator("label", { hasText: "Workout template" })
      .locator("xpath=following-sibling::select")
      .first();

    await templateSelect.selectOption(process.env.E2E_WORKOUT_TEMPLATE_ID!);
    await page
      .locator('input[type="date"]')
      .first()
      .fill(new Date().toISOString().slice(0, 10));

    await page.getByRole("button", { name: /assign workout/i }).click();

    await expect(page.getByText(/workout assigned/i)).toBeVisible({
      timeout: 30_000,
    });
  });
});
