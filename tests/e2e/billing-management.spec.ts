import { test, expect } from "@playwright/test";
import {
  paymentMethodFixture,
  gotoBilling,
} from "./utils/payment-method-fixture";
test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});
test("owner sees RepSync action, never broad portal or portal-return polling", async ({
  page,
  context,
}) => {
  const f = await paymentMethodFixture(page, context, "management");
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Manage billing", exact: true }),
  ).toHaveCount(0);
  await gotoBilling(page, "/pt-hub/settings/billing?portal=return");
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Verifying billing update…", { exact: false }),
  ).toHaveCount(0);
  expect(f.fixture.requests).toBe(0);
  expect(f.fixture.portalRequests).toBe(0);
  await f.waitForReads();
});
test("nonowner has no payment-method action", async ({ page, context }) => {
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
  f.fixture.summary.reconciliationStatus = "manual_review";
  f.fixture.summary.errorCode = "BILLING_UNAPPROVED_PLAN_CHANGE";
  await gotoBilling(page);
  await expect(
    page.getByText("Your billing needs manual review.", { exact: false }),
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
