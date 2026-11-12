import { test, expect } from "@playwright/test";
import {
  paymentMethodFixture,
  gotoBilling,
} from "./utils/payment-method-fixture";
test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});
test("scheduled reduction explains the payment-method restriction without provider calls", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "scheduled-reduction");
  f.fixture.state = {
    available: false,
    reason: "not_available",
    maySettleExistingBalance: false,
  };
  await context.route(
    "**/rest/v1/rpc/get_my_billing_seat_quantity_state",
    (route) =>
      route.fulfill({
        json: {
          provider: "paddle",
          available: false,
          canCancel: false,
          blockingOperation: null,
          summary: {
            planKey: "growth",
            cadence: "monthly",
            includedSeats: 2,
            currentAdditionalSeats: 1,
            maximumSeats: 10,
            maximumAdditionalSeats: 8,
            currentEffectiveLimit: 3,
            actual: 1,
            pending: 0,
            reserved: 0,
            committed: 1,
            unitPriceMinor: 1200,
            currentTotalMinor: 7100,
            growthLimit: 2,
            manualReview: false,
          },
          operation: {
            id: "00000000-0000-4000-8000-000000000001",
            status: "scheduled",
            direction: "reduction",
            targetAdditionalSeats: 0,
            effectiveAt: "2026-12-10T22:23:38.061119Z",
            errorCode: null,
          },
        },
      }),
  );
  await gotoBilling(page);
  await expect(
    page.getByText("RepSync pauses payment-method updates", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeDisabled();
  const section = page.getByText("RepSync pauses payment-method updates", {
    exact: false,
  });
  await expect(section.locator("time")).toHaveAttribute(
    "datetime",
    "2026-12-10T22:23:38.061119Z",
  );
  expect(f.fixture.requests).toBe(0);
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await expect(section).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeDisabled();
  expect(f.fixture.requests).toBe(0);
});
test("owner sees payment and invoice actions without portal-return polling", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "management");
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Invoices and subscription management",
      exact: true,
    }),
  ).toBeEnabled();
  await gotoBilling(page, "/pt-hub/settings/billing?portal=return");
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Confirming your payment update with Paddle…", {
      exact: false,
    }),
  ).toHaveCount(0);
  expect(f.fixture.requests).toBe(0);
  expect(f.fixture.portalRequests).toBe(0);
  expect(f.fixture.summaryReads).toBe(0);
  await f.waitForReads();
});
test("nonowner has no payment-method or customer portal action", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(
    page,
    context,
    "member",
    "active",
    false,
  );
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Invoices and subscription management" }),
  ).toHaveCount(0);
  expect(f.fixture.requests).toBe(0);
});
test("manual review preserves capacity and disables payment action", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "review");
  const capacity = await page
    .getByRole("progressbar")
    .evaluateAll((bars) =>
      bars.map((bar) => bar.getAttribute("aria-valuetext")),
    );
  f.fixture.state = {
    available: false,
    reason: "not_available",
    maySettleExistingBalance: false,
  };
  f.fixture.summary.errorCode = "BILLING_UNAPPROVED_PLAN_CHANGE";
  await gotoBilling(page);
  await expect(
    page.getByText("Payment-method update is unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toBeVisible();
  await f.waitForReads();
  expect(
    await page
      .getByRole("progressbar")
      .evaluateAll((bars) =>
        bars.map((bar) => bar.getAttribute("aria-valuetext")),
      ),
  ).toEqual(capacity);
  await f.waitForReads();
});
test("unavailable safe state disables recovery, cancellation has no portal instruction", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "unavailable");
  f.fixture.state = {
    available: false,
    reason: "not_available",
    maySettleExistingBalance: false,
  };
  f.fixture.summary.cancelAtPeriodEnd = true;
  await gotoBilling(page);
  await expect(
    page.getByText("Cancellation scheduled", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeDisabled();
  expect(await page.locator("body").innerText()).not.toContain(
    "Open Manage billing",
  );
  await f.waitForReads();
});
test("expired mobile billing has no payment-method action", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "expired");
  f.fixture.summary.status = "expired";
  f.fixture.state = {
    available: false,
    reason: "not_available",
    maySettleExistingBalance: false,
  };
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoBilling(page);
  await expect(
    page.getByRole("button", { name: "Start subscription", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await f.waitForReads();
});
