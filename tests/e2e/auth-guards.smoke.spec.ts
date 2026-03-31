import { expect, test, type Page } from "@playwright/test";
import { requireEnvVars, signInWithEmail } from "./utils/test-helpers";

test.describe("Smoke: auth guards and recovery", () => {
  const expectClientLandingRoute = async (page: Page) => {
    await expect(page).toHaveURL(/\/(app\/(onboarding|home)|no-workspace)/);

    if (page.url().includes("/no-workspace")) {
      await expect(
        page.getByRole("heading", {
          name: /no workspace found|no workspace yet/i,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("button", { name: /use an invite code/i })
          .or(page.getByRole("link", { name: /join with invite code/i })),
      ).toBeVisible();
    }
  };

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
    await expectClientLandingRoute(page);

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
    await expectClientLandingRoute(page);
  });
});
