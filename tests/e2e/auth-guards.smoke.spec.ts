import { expect, test } from "@playwright/test";
import { requireEnvVars, signInWithEmail } from "./utils/test-helpers";

test.describe("Smoke: auth guards and recovery", () => {
  test("Unauthenticated user is redirected to login from protected PT route", async ({
    page,
  }) => {
    await page.goto("/pt/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });

  test("Client session can recover after local session loss", async ({
    page,
  }) => {
    const required = requireEnvVars([
      "E2E_CLIENT_EMAIL",
      "E2E_CLIENT_PASSWORD",
    ]);
    test.skip(!required.ok, `Missing env: ${required.missing.join(", ")}`);

    await signInWithEmail(
      page,
      process.env.E2E_CLIENT_EMAIL!,
      process.env.E2E_CLIENT_PASSWORD!,
    );
    await expect(page).toHaveURL(/\/app\/(onboarding|home)/);

    await page.context().clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto("/app/home");
    await expect(page).toHaveURL(/\/login/);

    await signInWithEmail(
      page,
      process.env.E2E_CLIENT_EMAIL!,
      process.env.E2E_CLIENT_PASSWORD!,
    );
    await expect(page).toHaveURL(/\/app\/(onboarding|home)/);
  });
});
