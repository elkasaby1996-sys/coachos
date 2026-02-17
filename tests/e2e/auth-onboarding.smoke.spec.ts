import { expect, test } from "@playwright/test";
import { requireEnvVars, signInWithEmail } from "./utils/test-helpers";

test.describe("Smoke: auth and onboarding", () => {
  test("Invalid credentials keep user on login", async ({ page }) => {
    await page.goto("/login");

    await page
      .getByPlaceholder("you@coachos.com")
      .fill(`invalid-${Date.now()}@example.com`);
    await page.getByPlaceholder("Enter password").fill("wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });

  test("PT can sign in and reach dashboard or workspace onboarding", async ({
    page,
  }) => {
    const required = requireEnvVars(["E2E_PT_EMAIL", "E2E_PT_PASSWORD"]);
    test.skip(!required.ok, `Missing env: ${required.missing.join(", ")}`);

    await signInWithEmail(
      page,
      process.env.E2E_PT_EMAIL!,
      process.env.E2E_PT_PASSWORD!,
    );

    await expect(page).toHaveURL(/\/pt\/(dashboard|onboarding\/workspace)/);

    if (page.url().includes("/pt/onboarding/workspace")) {
      await page
        .getByLabel(/workspace name/i)
        .fill(`Smoke Workspace ${Date.now()}`);
      await page.getByRole("button", { name: /create workspace/i }).click();
      await expect(page).toHaveURL(/\/pt\/dashboard/);
    }
  });

  test("Client can sign in and reach onboarding or home", async ({ page }) => {
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

    if (page.url().includes("/app/onboarding")) {
      await expect(
        page.getByRole("heading", { name: /set up your profile/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /continue|finish setup/i }),
      ).toBeVisible();
    }
  });
});
