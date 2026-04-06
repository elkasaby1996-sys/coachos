import { expect, test } from "@playwright/test";
import { authSmokeFixtures, seedAuthSmokeStates } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
  waitForPageReady,
} from "./utils/test-helpers";

test.describe("Smoke: auth and onboarding", () => {
  test.beforeEach(async () => {
    await seedAuthSmokeStates();
  });

  test("Invalid credentials keep user on login", async ({ page }) => {
    await page.goto("/login");

    await page
      .getByPlaceholder("you@repsync.com")
      .fill(`invalid-${Date.now()}@example.com`);
    await page.getByPlaceholder("Enter password").fill("wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });

  test("PT with workspace can sign in and reach PT Hub", async ({
    page,
  }) => {
    await signInWithEmail(
      page,
      authSmokeFixtures.ptComplete.email,
      authSmokeFixtures.ptComplete.password,
    );
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "pt-hub-page",
      urlPattern: /\/pt-hub$/,
    });
  });

  test("PT with incomplete profile still resolves to a stable PT Hub route", async ({
    page,
  }) => {
    await signInWithEmail(
      page,
      authSmokeFixtures.ptIncompleteProfile.email,
      authSmokeFixtures.ptIncompleteProfile.password,
    );
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "pt-hub-page",
      urlPattern: /\/pt-hub$/,
    });
  });

  test("Client without workspace lands on no-workspace", async ({ page }) => {
    await signInWithEmail(
      page,
      authSmokeFixtures.clientNoWorkspace.email,
      authSmokeFixtures.clientNoWorkspace.password,
    );
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "no-workspace-page",
      urlPattern: /\/no-workspace$/,
    });
  });

  test("Client invite flow lands in workspace onboarding", async ({ page }) => {
    await signInWithEmail(
      page,
      authSmokeFixtures.clientInvite.email,
      authSmokeFixtures.clientInvite.password,
    );
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "no-workspace-page",
      urlPattern: /\/no-workspace$/,
    });

    await page.goto(`/invite/${authSmokeFixtures.clientInvite.inviteToken}`);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "client-workspace-onboarding-page",
      urlPattern: /\/app\/onboarding$/,
    });
  });
});
