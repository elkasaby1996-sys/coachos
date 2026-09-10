import { expect, test } from "@playwright/test";
import { seedAuthSmokeStates } from "./utils/auth-seeds";
import {
  clickVisibleEnabledSignInButton,
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
  waitForPageReady,
} from "./utils/test-helpers";

test("bootstrap failure offers recovery without losing the session", async ({
  page,
}) => {
  const seeded = await seedAuthSmokeStates();
  if (!seeded) throw new Error("Local Supabase is required for auth recovery.");

  let failBootstrap = true;
  await page.route("**/rest/v1/workspace_members?**", async (route) => {
    const columns = new URL(route.request().url()).searchParams.get("select");
    if (failBootstrap && columns === "workspace_id,role,status") {
      await route.fulfill({
        // A terminal error: the SDK automatically retries HTTP 503.
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Membership service unavailable" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(seeded.clientNoWorkspace.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(seeded.clientNoWorkspace.password);
  const failedMembership = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/rest/v1/workspace_members" &&
      url.searchParams.get("select") === "workspace_id,role,status" &&
      response.status() === 500
    );
  });
  await clickVisibleEnabledSignInButton(page);
  await Promise.all([waitForAuthSessionReady(page), failedMembership]);
  await expect(page.getByTestId("bootstrap-error")).toBeVisible();
  await expect(page.getByTestId("bootstrap-resolved")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();

  failBootstrap = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await waitForBootstrapResolved(page);
  await waitForPageReady(page, {
    testId: "client-home-page",
    urlPattern: /\/app\/home$/,
  });
  await expect(page.getByTestId("bootstrap-error")).toHaveCount(0);
});

test("optional appearance failure cannot block auth bootstrap", async ({
  page,
}) => {
  const seeded = await seedAuthSmokeStates();
  if (!seeded) throw new Error("Local Supabase is required for auth recovery.");

  let appearanceRequests = 0;
  let userValidationRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/auth/v1/user") {
      userValidationRequests += 1;
    }
  });
  await page.route("**/rest/v1/workspace_members?**", async (route) => {
    const columns = new URL(route.request().url()).searchParams.get("select");
    if (columns?.includes("theme_preference")) {
      appearanceRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Appearance service unavailable" }),
      });
      return;
    }
    await route.continue();
  });

  await signInWithEmail(
    page,
    seeded.ptComplete.email,
    seeded.ptComplete.password,
  );
  await waitForPageReady(page, {
    testId: "pt-hub-page",
    urlPattern: /\/pt-hub$/,
  });
  expect(appearanceRequests).toBeGreaterThan(0);
  expect(userValidationRequests).toBe(0);
});
