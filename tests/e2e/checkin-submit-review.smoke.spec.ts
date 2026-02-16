import { expect, test } from "@playwright/test";
import {
  requireEnvVars,
  signInWithEmail,
  tinyPngFile,
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
    await clientPage.goto("/app/checkin");
    if (clientPage.url().includes("/login")) {
      await signInWithEmail(
        clientPage,
        process.env.E2E_CLIENT_EMAIL!,
        process.env.E2E_CLIENT_PASSWORD!,
      );
      await clientPage.goto("/app/checkin");
    }
    await expect(clientPage).toHaveURL(/\/app\/checkin/);

    const alreadySubmittedBanner = clientPage.getByText(
      /is submitted and locked/i,
    );
    if (await alreadySubmittedBanner.isVisible()) {
      await clientContext.close();
      test.skip(true, "Current check-in already submitted for this client.");
      return;
    }

    const continueButton = clientPage.getByRole("button", {
      name: /^continue$/i,
    });
    for (let index = 0; index < 2; index += 1) {
      if (await continueButton.isVisible()) {
        await continueButton.click();
      }
    }

    const submitButton = clientPage.getByRole("button", {
      name: /submit check-in/i,
    });
    if (clientPage.url().includes("/login")) {
      await signInWithEmail(
        clientPage,
        process.env.E2E_CLIENT_EMAIL!,
        process.env.E2E_CLIENT_PASSWORD!,
      );
      await clientPage.goto("/app/checkin");
    }
    await expect(submitButton).toBeVisible({ timeout: 30_000 });
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
    await ptPage.goto(`/pt/clients/${process.env.E2E_CLIENT_ID}?tab=checkins`);
    if (ptPage.url().includes("/login")) {
      await signInWithEmail(
        ptPage,
        process.env.E2E_PT_EMAIL!,
        process.env.E2E_PT_PASSWORD!,
      );
      await ptPage.goto(
        `/pt/clients/${process.env.E2E_CLIENT_ID}?tab=checkins`,
      );
    }

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
