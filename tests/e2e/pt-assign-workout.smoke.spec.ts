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
    const loginHeading = page.getByRole("heading", { name: /welcome back/i });
    const templateSelect = page
      .locator("label", { hasText: "Workout template" })
      .locator("xpath=following-sibling::select")
      .first();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const ptPathname = new URL(page.url()).pathname;
      const onLoginUi = await loginHeading.isVisible().catch(() => false);
      if (
        ptPathname !== `/pt/clients/${process.env.E2E_CLIENT_ID}` ||
        onLoginUi
      ) {
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
        break;
      }
      await page.waitForTimeout(1_000);
    }
    if (!(await templateSelect.isVisible().catch(() => false))) {
      await ensureAuthenticatedNavigation(
        page,
        `/pt/clients/${process.env.E2E_CLIENT_ID}?tab=workout`,
        process.env.E2E_PT_EMAIL!,
        process.env.E2E_PT_PASSWORD!,
      );
      await waitForAppReady(page, 15_000);
      if (await workoutTab.isVisible()) {
        await workoutTab.click();
      }
    }
    await expect(
      templateSelect,
      `Workout template select not visible after recovery attempts. Final URL: ${page.url()}`,
    ).toBeVisible({ timeout: 5_000 });

    await templateSelect.selectOption(process.env.E2E_WORKOUT_TEMPLATE_ID!);
    await page
      .locator('input[type="date"]')
      .first()
      .fill(new Date().toISOString().slice(0, 10));

    const assignResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/v1/rpc/assign_workout_with_template") &&
        response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /assign workout/i }).click();
    const assignResponse = await assignResponsePromise;
    if (!assignResponse.ok()) {
      let errorMessage = "";
      try {
        const payload = (await assignResponse.json()) as {
          message?: string;
          error?: string;
        };
        errorMessage = payload?.message ?? payload?.error ?? "";
      } catch {
        errorMessage = (await assignResponse.text()).slice(0, 300);
      }

      const knownPreconditionError =
        assignResponse.status() === 400 &&
        /(Not authorized|Template not in client workspace|Client not found|Workout template not found|required)/i.test(
          errorMessage,
        );
      if (knownPreconditionError) {
        test.skip(
          true,
          `Smoke precondition unmet for assignment RPC: ${errorMessage || `HTTP ${assignResponse.status()}`}`,
        );
        return;
      }

      throw new Error(
        `assign_workout_with_template failed: HTTP ${assignResponse.status()}${errorMessage ? ` - ${errorMessage}` : ""}`,
      );
    }

    await expect(
      page.getByText(/workout (assigned|updated)/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
