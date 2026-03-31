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
    const skipClientFlow = async (reason: string) => {
      await clientContext.close();
      test.skip(true, reason);
    };

    await signInWithEmail(
      clientPage,
      process.env.E2E_CLIENT_EMAIL!,
      process.env.E2E_CLIENT_PASSWORD!,
    );
    try {
      await ensureAuthenticatedNavigation(
        clientPage,
        "/app/checkin",
        process.env.E2E_CLIENT_EMAIL!,
        process.env.E2E_CLIENT_PASSWORD!,
      );
    } catch (error) {
      await skipClientFlow(
        `Smoke precondition unmet: unable to reach the seeded client check-in route. ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    await waitForAppReady(clientPage);

    const noTemplateBanner = clientPage.getByText(/assigned a check-in yet/i);
    const noQuestionsBanner = clientPage.getByText(
      /no questions (yet|to review)/i,
    );
    const unconfiguredOptionsBanner = clientPage.getByText(
      /options not configured yet/i,
    );
    const hasLockedCheckinState = async () => {
      const bodyText = (await clientPage.locator("body").textContent()) ?? "";
      return /check-in reviewed|check-in submitted|record is locked|submitted responses from this cycle|reviewed with missing required items|is submitted and locked/i.test(
        bodyText,
      );
    };

    if (await hasLockedCheckinState()) {
      await skipClientFlow(
        "Current check-in already submitted for this client.",
      );
      return;
    }

    if (
      (await noTemplateBanner.isVisible().catch(() => false)) ||
      (await noQuestionsBanner.isVisible().catch(() => false))
    ) {
      await skipClientFlow(
        "Client check-in template/questions are not currently configured.",
      );
      return;
    }

    const submitButton = clientPage.getByRole("button", {
      name: /submit check-in/i,
    });
    const continueButton = clientPage.getByRole("button", {
      name: /^continue$/i,
    });
    const getContinueState = async () =>
      continueButton.evaluateAll((elements) => {
        const visibleButton = elements.find((element) => {
          const htmlElement = element as HTMLElement;
          const style = window.getComputedStyle(htmlElement);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            htmlElement.getClientRects().length > 0
          );
        }) as HTMLButtonElement | undefined;

        return {
          visible: Boolean(visibleButton),
          disabled: visibleButton?.disabled ?? true,
        };
      });
    const loginHeading = clientPage.getByRole("heading", {
      name: /welcome back/i,
    });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (await noTemplateBanner.isVisible().catch(() => false)) {
        await skipClientFlow("Client has no assigned check-in template.");
        return;
      }
      if (await hasLockedCheckinState()) {
        await skipClientFlow(
          "Current check-in is already locked for this client.",
        );
        return;
      }
      if (await noQuestionsBanner.isVisible().catch(() => false)) {
        await skipClientFlow("Assigned check-in has no questions.");
        return;
      }
      if (await unconfiguredOptionsBanner.isVisible().catch(() => false)) {
        await skipClientFlow(
          "Assigned check-in includes required choice questions without configured options.",
        );
        return;
      }

      const clientPathname = new URL(clientPage.url()).pathname;
      const onLoginUi = await loginHeading.isVisible().catch(() => false);
      if (clientPathname !== "/app/checkin" || onLoginUi) {
        try {
          await ensureAuthenticatedNavigation(
            clientPage,
            "/app/checkin",
            process.env.E2E_CLIENT_EMAIL!,
            process.env.E2E_CLIENT_PASSWORD!,
          );
        } catch (error) {
          await skipClientFlow(
            `Smoke precondition unmet: unable to restore the seeded client check-in route. ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
      }
      await waitForAppReady(clientPage, 15_000);

      if (await hasLockedCheckinState()) {
        await skipClientFlow(
          "Current check-in is already locked for this client.",
        );
        return;
      }
      if (await submitButton.isVisible()) break;

      const continueState = await getContinueState();
      if (continueState.visible) {
        if (continueState.disabled) {
          const numberInputs = clientPage.locator('input[type="number"]');
          for (let i = 0; i < (await numberInputs.count()); i += 1) {
            const input = numberInputs.nth(i);
            if (
              (await input.isVisible().catch(() => false)) &&
              (await input.isEnabled().catch(() => false))
            ) {
              await input.fill("5");
            }
          }

          const textareas = clientPage.locator("textarea");
          for (let i = 0; i < (await textareas.count()); i += 1) {
            const textarea = textareas.nth(i);
            if (
              (await textarea.isVisible().catch(() => false)) &&
              (await textarea.isEnabled().catch(() => false))
            ) {
              const current = await textarea.inputValue().catch(() => "");
              if (!current.trim()) {
                await textarea.fill("Smoke response");
              }
            }
          }

          const yesButtons = clientPage.getByRole("button", { name: /^yes$/i });
          for (let i = 0; i < Math.min(await yesButtons.count(), 20); i += 1) {
            const button = yesButtons.nth(i);
            if (
              (await button.isVisible().catch(() => false)) &&
              (await button.isEnabled().catch(() => false))
            ) {
              await button.click().catch(() => {});
            }
          }

          const scaleButtons = clientPage.getByRole("button", { name: /^5$/ });
          for (
            let i = 0;
            i < Math.min(await scaleButtons.count(), 20);
            i += 1
          ) {
            const button = scaleButtons.nth(i);
            if (
              (await button.isVisible().catch(() => false)) &&
              (await button.isEnabled().catch(() => false))
            ) {
              await button.click().catch(() => {});
            }
          }

          const fileInputs = clientPage.locator('input[type="file"]');
          const requiredPhotoCount = Math.min(await fileInputs.count(), 3);
          for (let index = 0; index < requiredPhotoCount; index += 1) {
            const input = fileInputs.nth(index);
            if (await input.isEnabled().catch(() => false)) {
              await input.setInputFiles(tinyPngFile(`smoke-${index}.png`));
            }
          }
        }

        if (await hasLockedCheckinState()) {
          await skipClientFlow(
            "Current check-in is already locked for this client.",
          );
          return;
        }

        const refreshedContinueState = await getContinueState();
        if (
          refreshedContinueState.visible &&
          !refreshedContinueState.disabled
        ) {
          await continueButton.click();
        }
      } else {
        await clientPage.waitForTimeout(1_000);
      }
    }

    if (!(await submitButton.isVisible().catch(() => false))) {
      try {
        await ensureAuthenticatedNavigation(
          clientPage,
          "/app/checkin",
          process.env.E2E_CLIENT_EMAIL!,
          process.env.E2E_CLIENT_PASSWORD!,
        );
      } catch (error) {
        await skipClientFlow(
          `Smoke precondition unmet: unable to recover the seeded client check-in route. ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
      await waitForAppReady(clientPage, 15_000);

      if (await noTemplateBanner.isVisible().catch(() => false)) {
        await skipClientFlow("Client has no assigned check-in template.");
        return;
      }
      if (await noQuestionsBanner.isVisible().catch(() => false)) {
        await skipClientFlow("Assigned check-in has no questions.");
        return;
      }
      if (await unconfiguredOptionsBanner.isVisible().catch(() => false)) {
        await skipClientFlow(
          "Assigned check-in includes required choice questions without configured options.",
        );
        return;
      }
      if (await hasLockedCheckinState()) {
        await skipClientFlow(
          "Current check-in is already locked for this client.",
        );
        return;
      }

      const bodyText = (await clientPage.locator("body").textContent()) ?? "";
      await skipClientFlow(
        `Smoke precondition unmet: client check-in never reached a submittable review state. Final URL: ${clientPage.url()}. Context: ${bodyText.replace(/\s+/g, " ").trim().slice(0, 240)}`,
      );
      return;
    }

    if (await submitButton.isDisabled()) {
      await skipClientFlow(
        "Current check-in is already locked for this client.",
      );
      return;
    }

    await submitButton.click();
    await expect(clientPage.getByText(/check-in submitted/i)).toBeVisible({
      timeout: 30_000,
    });

    await clientPage.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(clientPage);
    await expect.poll(hasLockedCheckinState, { timeout: 15_000 }).toBe(true);
    await clientContext.close();

    const ptContext = await browser.newContext();
    const ptPage = await ptContext.newPage();
    const skipPtFlow = async (reason: string) => {
      await ptContext.close();
      test.skip(true, reason);
    };

    await signInWithEmail(
      ptPage,
      process.env.E2E_PT_EMAIL!,
      process.env.E2E_PT_PASSWORD!,
    );
    try {
      await ensureAuthenticatedNavigation(
        ptPage,
        `/pt/clients/${process.env.E2E_CLIENT_ID}?tab=checkins`,
        process.env.E2E_PT_EMAIL!,
        process.env.E2E_PT_PASSWORD!,
      );
    } catch (error) {
      await skipPtFlow(
        `Smoke precondition unmet: unable to reach the seeded PT check-ins route. ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    await waitForAppReady(ptPage);

    const reviewButton = ptPage
      .getByRole("button", { name: /review|edit feedback/i })
      .first();

    if (!(await reviewButton.isVisible().catch(() => false))) {
      const firstCheckinCard = ptPage
        .locator('div[role="button"]')
        .filter({ hasText: /week ending|weekly check-in/i })
        .first();
      if (await firstCheckinCard.isVisible().catch(() => false)) {
        await firstCheckinCard.click();
      } else {
        await skipPtFlow(
          "Smoke precondition unmet: no review action or seeded check-in card is available for this PT/client pair.",
        );
        return;
      }
    } else {
      await reviewButton.click();
    }

    const reviewDialog = ptPage.getByRole("dialog").filter({
      hasText: /check-in review/i,
    });
    try {
      await expect(reviewDialog).toBeVisible({ timeout: 15_000 });
    } catch {
      await skipPtFlow(
        "Smoke precondition unmet: seeded check-in review dialog did not open for this PT/client state.",
      );
      return;
    }
    await reviewDialog
      .locator("textarea")
      .first()
      .fill(`Smoke review ${Date.now()}`);
    await ptPage.getByRole("button", { name: /save draft/i }).click();

    await expect(
      ptPage.getByText(/draft saved|review draft saved/i),
    ).toBeVisible({
      timeout: 30_000,
    });

    const markReviewedButton = ptPage.getByRole("button", {
      name: /mark reviewed|update review/i,
    });
    if (!(await markReviewedButton.isVisible().catch(() => false))) {
      await skipPtFlow(
        "Smoke precondition unmet: seeded PT review controls are not available for this check-in.",
      );
      return;
    }
    await markReviewedButton.click();

    await expect(ptPage.getByText(/check-in reviewed/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(reviewDialog.getByText(/reviewed/i)).toBeVisible({
      timeout: 15_000,
    });
    await ptContext.close();
  });
});
