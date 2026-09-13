import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PUBLIC_CATALOGUE_V2 } from "../../src/features/commercial-catalogue/public-catalogue-snapshot";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { pgQuery } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForBootstrapResolved,
} from "./utils/test-helpers";

test("local anonymous catalogue exactly matches the reviewed TypeScript snapshot", async () => {
  // The local gateway is fixed intentionally; this cannot target a linked project.
  const rows = await pgQuery<{ catalogue: unknown }>(
    "select public.get_public_commercial_catalogue_v2() as catalogue",
  );
  expect(rows[0].catalogue).toEqual(PUBLIC_CATALOGUE_V2);
});

test("pricing compares reviewed features offline at desktop and 375px", async ({
  page,
}, info) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/\/rest\/v1\/|\/auth\/v1\/|supabase\.co/.test(request.url()))
      requests.push(request.url());
  });
  await page.route("**/rest/v1/**", (route) => route.abort());
  await page.goto("/pricing");
  await expect(page.locator(".rs-pricing-plan")).toHaveCount(3);
  await page
    .getByRole("link", { name: "Compare all capacities and features" })
    .click();
  await expect(page.getByRole("table")).toContainText(
    "Manage client lifecycle states",
  );
  await expect(page.getByRole("table")).toContainText(
    "Maximum total coach seats",
  );
  await expect(
    page
      .getByRole("table")
      .getByRole("cell", { name: "Included", exact: true }),
  ).toHaveCount(6);
  await expect(
    page.getByRole("region", { name: "Additional coach seats", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("$12 monthly");
  await expect(page.locator("main")).not.toContainText("Studio");
  await page.getByRole("button", { name: "Annual" }).click();
  await expect(page.locator(".rs-pricing-plan__price strong")).toHaveText([
    "$190",
    "$590",
    "$1,190",
  ]);
  await page.screenshot({
    path: info.outputPath("pricing-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const region = page.getByRole("region", { name: /Plan comparison table/ });
  await region.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(region).toBeFocused();
  await page.screenshot({
    path: info.outputPath("pricing-mobile.png"),
    fullPage: true,
  });
  expect(requests).toEqual([]);
});

test("client list and lifecycle save persist through reload", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`catalogue:${info.testId}`, true);
  const user = randomUUID();
  const client = randomUUID();
  await pgQuery(`insert into auth.users(id,email) values('${user}','${user}@catalogue.test');
    insert into public.clients(id,user_id,workspace_id,display_name,lifecycle_state) values('${client}','${user}','${coach.workspaceId}','Catalogue review client','active');`);
  await signInWithEmail(page, coach.email, coach.password);
  await page.goto("/pt-hub/clients");
  await waitForBootstrapResolved(page);
  await expect(page.getByText("Catalogue review client").first()).toBeVisible();
  await page
    .getByLabel("Search", { exact: true })
    .fill("no-matching-catalogue-client");
  await expect(
    page.getByText("Catalogue review client", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Search", { exact: true }).fill("Catalogue review");
  await expect(page.getByText("Catalogue review client").first()).toBeVisible();
  await page.goto(`/pt/clients/${client}`);
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Mark completed", exact: true })
    .click();
  const saved = page.waitForResponse((response) =>
    response.url().endsWith("/rpc/pt_update_client_lifecycle"),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save lifecycle", exact: true })
    .click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await pgQuery(
      `select lifecycle_state from public.clients where id='${client}'`,
    ),
  ).toEqual([{ lifecycle_state: "completed" }]);
  const reloaded = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/rest/v1/rpc/pt_clients_summary",
  );
  await page.reload();
  const summaryResponse = await reloaded;
  expect(summaryResponse.ok()).toBe(true);
  await summaryResponse.finished();
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
});
