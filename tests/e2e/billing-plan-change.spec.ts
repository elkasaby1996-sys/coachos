import { expect, test } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import { planChangeFixture } from "./utils/plan-change-fixture";
test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});
test("nonowner cannot view or forge plan changes", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId);
  f.denyActor();
  await context.route(
    "**/rest/v1/rpc/get_my_effective_account_entitlements",
    (route) =>
      route.fulfill({
        status: 403,
        json: { code: "42501", message: "PT authentication required." },
      }),
  );
  await page.reload();
  await expect(
    page.getByText("Subscription details unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change plan", exact: true }),
  ).toHaveCount(0);
  const status = await page.evaluate(async () => {
    const r = await fetch("/functions/v1/billing-change-subscription-plan", {
      method: "POST",
      body: JSON.stringify({
        targetPlanKey: "growth",
        targetCadence: "monthly",
        operationId: crypto.randomUUID(),
      }),
    });
    return r.status;
  });
  expect(status).toBe(403);
  expect(f.patches()).toBe(0);
});
test("unauthorized provider mapping remains manual review", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId);
  f.snapshot().variant_id = "99999999";
  await f.payment();
  await page.reload();
  await expect(
    page.getByText("Your billing needs manual review.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toHaveAttribute("aria-valuetext", /committed of 10;/);
  await expect(
    page.getByRole("button", { name: "Change plan", exact: true }),
  ).toHaveCount(0);
});
test("Launch upgrade waits for verified updated invoice", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId);
  await f.preview("growth");
  await expect(
    page.getByText("Immediate change.", { exact: false }),
  ).toBeVisible();
  await f.apply();
  await expect(
    page.getByText("Waiting for verified payment.", { exact: false }),
  ).toBeVisible();
  expect(f.patches()).toBe(1);
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toHaveAttribute("aria-valuetext", /committed of 10;/);
  await f.payment();
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toHaveAttribute("aria-valuetext", /committed of 50;/);
});
test("failed payment preserves Launch and recovery completes", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId);
  await f.preview("growth");
  await f.apply();
  await expect(
    page.getByText("Waiting for verified payment.", { exact: false }),
  ).toBeVisible();
  await f.payment(false);
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toHaveAttribute("aria-valuetext", /committed of 10;/);
  await f.payment();
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toHaveAttribute("aria-valuetext", /committed of 50;/);
  expect(f.patches()).toBe(1);
});
test("renewal invoice is not upgrade payment proof", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId);
  await f.preview("growth");
  await f.apply();
  await expect(
    page.getByText("Waiting for verified payment.", { exact: false }),
  ).toBeVisible();
  await f.payment(true, "renewal");
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toHaveAttribute("aria-valuetext", /committed of 10;/);
});
test("Scale downgrade blocks commitments then schedules after remediation", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId, "scale");
  const reservation = await f.reserve(51);
  expect(reservation.granted).toBe(true);
  await f.preview("growth");
  await expect(page.getByText("51 committed", { exact: false })).toBeVisible();
  expect(f.patches()).toBe(0);
  await f.release(reservation.reservationId);
  await page
    .getByRole("button", { name: "Preview plan change", exact: true })
    .click();
  await f.apply();
  await expect(
    page.getByText("The target plan limits new capacity commitments.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toHaveAttribute("aria-valuetext", /committed of 50;/);
  expect((await f.reserve(51)).granted).toBe(false);
  await page
    .getByRole("button", { name: "Cancel scheduled change", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toHaveAttribute("aria-valuetext", /committed of 100;/);
});
test("annual to monthly schedules and shows full monthly list price", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "growth",
    "annual",
  );
  await f.preview("growth", "monthly");
  await expect(
    page.getByText("Current: $590.00 USD charged annually", { exact: true }),
  ).toBeVisible();
  await f.apply();
  await expect(
    page.getByRole("button", { name: "Cancel scheduled change", exact: true }),
  ).toBeVisible();
});
test("monthly to annual shows full annual amount", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId);
  await f.preview("launch", "annual");
  await expect(
    page.getByText("Target: $190.00 USD charged annually", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("These list prices are not an exact charge preview.", {
      exact: false,
    }),
  ).toBeVisible();
});
test("higher tier and annual to monthly is unsupported", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "launch",
    "annual",
  );
  await f.preview("growth", "monthly");
  await expect(
    page.getByRole("alert").filter({ hasText: "not supported" }),
  ).toBeVisible();
  expect(f.patches()).toBe(0);
});
test("PayPal has support guidance without provider mutation", async ({
  page,
  context,
}, info) => {
  // Reproduce CI's late canonical-state arrival without changing its response.
  // Fixture readiness must outlive the default five-second UI assertion window.
  await context.route(
    "**/rest/v1/rpc/get_my_billing_plan_change_state",
    async (route) => {
      const response = await route.fetch();
      await delay(6_000);
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  const f = await planChangeFixture(
    page,
    context,
    info.testId,
    "launch",
    "monthly",
    "paypal",
  );
  await f.preview("growth");
  await expect(
    page.getByRole("alert").filter({ hasText: "PayPal" }),
  ).toBeVisible();
  expect(f.patches()).toBe(0);
});
test("forged provider identifiers are rejected at browser boundary", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId);
  const response = await page.evaluate(async () => {
    const r = await fetch("/functions/v1/billing-change-subscription-plan", {
      method: "POST",
      body: JSON.stringify({
        targetPlanKey: "growth",
        targetCadence: "monthly",
        operationId: crypto.randomUUID(),
        subscriptionId: "forged",
      }),
    });
    return { status: r.status, body: await r.json() };
  });
  expect(response).toEqual({
    status: 400,
    body: { code: "BILLING_INVALID_INPUT" },
  });
  expect(f.patches()).toBe(0);
});
test("mobile plan preview fits and exposes no provider data", async ({
  page,
  context,
}, info) => {
  const f = await planChangeFixture(page, context, info.testId);
  await page.setViewportSize({ width: 375, height: 812 });
  await f.preview("growth");
  await expect(
    page.getByRole("button", { name: "Review and confirm", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.locator("body").innerText()).not.toContain(
    f.snapshot().subscription_id,
  );
  await page.screenshot({
    path: info.outputPath("plan-change-mobile.png"),
    fullPage: true,
  });
});
