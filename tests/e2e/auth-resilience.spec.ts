import { expect, test } from "@playwright/test";
import {
  seedAuthSmokeStates,
} from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
  waitForPageReady,
} from "./utils/test-helpers";

test.describe("Auth resilience", () => {
  test("client session can recover after local session loss", async ({
    page,
  }) => {
    const seeded = await seedAuthSmokeStates();

    await signInWithEmail(
      page,
      seeded.clientNoWorkspace.email,
      seeded.clientNoWorkspace.password,
    );
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await waitForPageReady(page, {
      testId: "client-lead-dashboard",
      urlPattern: /\/app\/home$/,
    });

    await page.context().clearCookies();
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await page.goto("/app/home");
    await expect(page).toHaveURL(/\/login$/);

    await signInWithEmail(
      page,
      seeded.clientNoWorkspace.email,
      seeded.clientNoWorkspace.password,
    );
    await waitForAuthSessionReady(page);
    await waitForPageReady(page, {
      testId: "client-lead-dashboard",
      urlPattern: /\/app\/home$/,
    });
  });
});
