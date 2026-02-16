import { expect, test } from "@playwright/test";
import {
  ensureAuthenticatedNavigation,
  requireEnvVars,
  signInWithEmail,
  waitForAppReady,
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
    await waitForAppReady(page);

    const workoutTab = page.getByRole("tab", { name: /^workout$/i }).first();
    if (await workoutTab.isVisible()) {
      await workoutTab.click();
    }

    const workoutTemplateLabel = page.locator("label", {
      hasText: "Workout template",
    });
    let templateVisible = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (!page.url().includes(`/pt/clients/${process.env.E2E_CLIENT_ID}`)) {
        await ensureAuthenticatedNavigation(
          page,
          `/pt/clients/${process.env.E2E_CLIENT_ID}?tab=workout`,
          process.env.E2E_PT_EMAIL!,
          process.env.E2E_PT_PASSWORD!,
        );
      }
      await waitForAppReady(page, 15_000);

      if (await workoutTab.isVisible()) {
        await workoutTab.click();
      }

      if (await workoutTemplateLabel.isVisible()) {
        templateVisible = true;
        break;
      }
      await page.waitForTimeout(1_000);
    }
    expect(templateVisible).toBeTruthy();

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
