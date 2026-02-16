import { expect, test } from "@playwright/test";
import {
  ensureAuthenticatedNavigation,
  requireEnvVars,
  signInWithEmail,
  tinyPngFile,
  waitForAppReady,
} from "./utils/test-helpers";

test.describe("Smoke: check-in submit and PT review", () => {
  test("Client can submit check-in and PT can review", async ({ browser }) => {
    const required = requireEnvVars([
      "E2E_CLIENT_EMAIL",
      "E2E_CLIENT_PASSWORD",
      "E2E_PT_EMAIL",
      "E2E_PT_PASSWORD",
      "E2E_CLIENT_ID",
    ]);
    test.skip(!required.ok, `Missing env: ${required.missing.join(", ")}`);

    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();

    await signInWithEmail(
      clientPage,
      process.env.E2E_CLIENT_EMAIL!,
      process.env.E2E_CLIENT_PASSWORD!,
    );
    await ensureAuthenticatedNavigation(
      clientPage,
      "/app/checkin",
      process.env.E2E_CLIENT_EMAIL!,
      process.env.E2E_CLIENT_PASSWORD!,
    );
    await waitForAppReady(clientPage);
    await expect(clientPage).toHaveURL(/\/app\/checkin/);

    const alreadySubmittedBanner = clientPage.getByText(
      /is submitted and locked/i,
    );
    if (await alreadySubmittedBanner.isVisible()) {
      await clientContext.close();
      test.skip(true, "Current check-in already submitted for this client.");
      return;
    }

    const submitButton = clientPage.getByRole("button", {
      name: /submit check-in/i,
    });
    const continueButton = clientPage.getByRole("button", {
      name: /^continue$/i,
    });
    let submitVisible = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const noTemplateBanner = clientPage.getByText(
        /hasn[’']t assigned a check-in yet/i,
      );
      if (await noTemplateBanner.isVisible()) {
        await clientContext.close();
        test.skip(true, "Client has no assigned check-in template.");
        return;
      }

      if (!clientPage.url().includes("/app/checkin")) {
        await ensureAuthenticatedNavigation(
          clientPage,
          "/app/checkin",
          process.env.E2E_CLIENT_EMAIL!,
          process.env.E2E_CLIENT_PASSWORD!,
        );
      }
      await waitForAppReady(clientPage, 15_000);

      if (await submitButton.isVisible()) {
        submitVisible = true;
        break;
      }

      if (await continueButton.isVisible()) {
        await continueButton.click();
      } else {
        await clientPage.waitForTimeout(1_000);
      }
    }
    expect(submitVisible).toBeTruthy();
    if (await submitButton.isDisabled()) {
      await clientContext.close();
      test.skip(true, "Current check-in already submitted for this client.");
      return;
    }

    const fileInputs = clientPage.locator('input[type="file"]');
    const requiredPhotoCount = Math.min(await fileInputs.count(), 3);
    for (let index = 0; index < requiredPhotoCount; index += 1) {
      await fileInputs
        .nth(index)
        .setInputFiles(tinyPngFile(`smoke-${index}.png`));
    }

    await submitButton.click();
    await expect(clientPage.getByText(/check-in submitted/i)).toBeVisible({
      timeout: 30_000,
    });
    await clientContext.close();

    const ptContext = await browser.newContext();
    const ptPage = await ptContext.newPage();

    await signInWithEmail(
      ptPage,
      process.env.E2E_PT_EMAIL!,
      process.env.E2E_PT_PASSWORD!,
    );
    await ensureAuthenticatedNavigation(
      ptPage,
      `/pt/clients/${process.env.E2E_CLIENT_ID}?tab=checkins`,
      process.env.E2E_PT_EMAIL!,
      process.env.E2E_PT_PASSWORD!,
    );
    await waitForAppReady(ptPage);

    const reviewButton = ptPage
      .getByRole("button", { name: /review|edit feedback/i })
      .first();
    await expect(reviewButton).toBeVisible({ timeout: 30_000 });
    await reviewButton.click();

    await ptPage.getByLabel(/feedback/i).fill(`Smoke review ${Date.now()}`);
    await ptPage.getByRole("button", { name: /save feedback/i }).click();

    await expect(ptPage.getByText(/feedback saved/i)).toBeVisible({
      timeout: 30_000,
    });
    await ptContext.close();
  });
});
