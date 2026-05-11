import { expect, test } from "@playwright/test";
import { authSmokeFixtures, seedAuthSmokeStates } from "./utils/auth-seeds";
import {
  clickVisibleEnabledSignInButton,
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
  waitForPageReady,
} from "./utils/test-helpers";

test.describe("Smoke: auth and onboarding", () => {
  test.beforeEach(async () => {
    const seeded = await seedAuthSmokeStates();
    test.skip(
      !seeded,
      "Local Supabase seed API unavailable for fixed auth smoke fixtures.",
    );
  });

  test("Invalid credentials keep user on login", async ({ page }) => {
    await page.goto("/login");

    await page
      .locator('input[aria-label="Email"]')
      .fill(`invalid-${Date.now()}@example.com`);
    await page.locator('input[aria-label="Password"]').fill("wrong-password");
    await clickVisibleEnabledSignInButton(page);

    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("button", { name: /^sign in$/i }).first(),
    ).toBeVisible();
  });

  test("PT with workspace can sign in and reach PT Hub", async ({ page }) => {
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

  test("Client without workspace lands on dashboard lead mode", async ({
    page,
  }) => {
    await signInWithEmail(
      page,
      authSmokeFixtures.clientNoWorkspace.email,
      authSmokeFixtures.clientNoWorkspace.password,
    );
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "client-home-page",
      urlPattern: /\/app\/home$/,
    });
  });

  test("Client invite flow lands in client home with joined workspace context", async ({
    page,
  }) => {
    await signInWithEmail(
      page,
      authSmokeFixtures.clientInvite.email,
      authSmokeFixtures.clientInvite.password,
    );
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "client-home-page",
      urlPattern: /\/app\/home$/,
    });

    await page.goto(`/invite/${authSmokeFixtures.clientInvite.inviteToken}`);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "client-home-page",
      urlPattern: /\/app\/home\?invite_joined=1/,
    });
    await expect(page).toHaveURL(/joined_workspace_id=/);
  });
});
