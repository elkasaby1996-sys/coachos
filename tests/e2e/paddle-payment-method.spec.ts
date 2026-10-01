import { test, expect } from "@playwright/test";
import {
  paymentMethodFixture,
  syntheticTransaction,
} from "./utils/payment-method-fixture";
test.describe.configure({ mode: "parallel" });
test.use({ trace: "off", video: "off", screenshot: "off" });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});
test("active update opens exact transaction, stays pending, and preserves privacy", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "active");
  await page.clock.install();
  await page
    .getByRole("button", { name: "Update payment method", exact: true })
    .click();
  await expect
    .poll(() => f.fixture.opened)
    .toEqual([{ transactionId: syntheticTransaction }]);
  expect(f.fixture.initializationCount).toBe(1);
  expect(f.fixture.requests).toBe(1);
  await f.signal("checkout.completed");
  await expect(
    page.getByText("Verifying billing update…", { exact: false }),
  ).toBeVisible();
  await f.waitForReads();
  await page.clock.fastForward(31_000);
  await expect(
    page.getByText("Billing update is not yet confirmed.", { exact: false }),
  ).toBeVisible();
  await f.waitForReads();
  const reads = f.fixture.summaryReads;
  await page.clock.fastForward(60_000);
  await f.waitForReads();
  expect(f.fixture.summaryReads).toBe(reads);
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await expect.poll(() => f.fixture.summaryReads).toBeGreaterThan(reads);
  await f.waitForReads();
  expect(page.url()).not.toContain(syntheticTransaction);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain(syntheticTransaction);
  expect(await page.locator("body").innerText()).not.toMatch(
    /Payment successful|payment method updated/i,
  );
  expect(f.fixture.telemetry.join()).not.toContain(syntheticTransaction);
  expect(f.fixture.portalRequests).toBe(0);
  expect(f.fixture.externalRequests).toBe(0);
});
test("past-due checkout waits for backend recovery, not a completion callback", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "past-due", "past_due");
  await page.clock.install();
  await expect(
    page.getByText("may collect your existing outstanding balance", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Update payment method", exact: true })
    .click();
  await expect
    .poll(() => f.fixture.opened)
    .toEqual([{ transactionId: syntheticTransaction }]);
  await f.signal("checkout.completed");
  await expect(
    page.getByText("Verifying billing update…", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("A payment failed.", { exact: false }),
  ).toBeVisible();
  await f.waitForReads();
  f.fixture.summary.status = "active";
  f.fixture.summary.revision = "recovered";
  f.fixture.state = {
    available: true,
    status: "active",
    maySettleExistingBalance: false,
  };
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/rpc/get_my_billing_payment_method_state_v1"),
    ),
    page.clock.fastForward(2_000),
  ]);
  await f.waitForReads();
  await expect(
    page.getByText("Billing status refreshed from the server.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Your paid subscription is active.", { exact: true }),
  ).toBeVisible();
  expect(f.fixture.requests).toBe(1);
  expect(f.fixture.capacityReads).toBeGreaterThan(1);
  expect(f.fixture.portalRequests).toBe(0);
  await f.waitForReads();
});
test("launch failure is safe and double activation never prepares twice", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(
    page,
    context,
    "launch-failure",
    "active",
    true,
    true,
  );
  await page
    .getByRole("button", { name: "Update payment method", exact: true })
    .dblclick();
  await expect(page.getByRole("alert")).toContainText("could not be opened");
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeDisabled();
  expect(f.fixture.requests).toBe(1);
  expect(f.fixture.opened).toHaveLength(1);
  expect(f.fixture.telemetry.join()).not.toContain(syntheticTransaction);
});
test("provider ambiguity is safe and never triggers a second preparation", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "provider-error");
  f.fixture.failed = true;
  await page
    .getByRole("button", { name: "Update payment method", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("do not submit it again");
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeDisabled();
  expect(f.fixture.requests).toBe(1);
  expect(f.fixture.opened).toHaveLength(0);
  expect(await page.locator("body").innerText()).not.toContain(
    syntheticTransaction,
  );
});
test("asynchronous SDK error withholds success and never prepares again", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "sdk-event-error");
  await page
    .getByRole("button", { name: "Update payment method", exact: true })
    .click();
  await expect
    .poll(() => f.fixture.opened)
    .toEqual([{ transactionId: syntheticTransaction }]);
  await f.signal("checkout.error");
  await expect(page.getByRole("alert")).toContainText("could not be opened");
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeDisabled();
  expect(f.fixture.requests).toBe(1);
  expect(await page.locator("body").innerText()).not.toContain(
    syntheticTransaction,
  );
});
