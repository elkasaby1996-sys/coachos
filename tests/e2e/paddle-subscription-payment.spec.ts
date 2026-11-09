import { expect, test } from "@playwright/test";
import {
  paymentMethodFixture,
  syntheticTransaction,
} from "./utils/payment-method-fixture";

test.afterEach(async ({ context }) => context.unrouteAll({ behavior: "wait" }));

test("checkout opens once and waits for this transaction's verified server confirmation", async ({
  page,
  context,
}, info) => {
  const fixture = await paymentMethodFixture(page, context, info.testId);
  let confirmed = false,
    reads = 0;
  await context.route(
    "**/rest/v1/rpc/get_my_paddle_checkout_status_v1",
    async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        p_transaction: syntheticTransaction,
      });
      reads++;
      await route.fulfill({
        json: { status: confirmed ? "confirmed" : "pending" },
      });
    },
  );
  await page.goto(`/billing/checkout?_ptxn=${syntheticTransaction}`);
  await expect.poll(() => fixture.opened.length).toBe(1);
  expect(fixture.opened[0]).toEqual({ transactionId: syntheticTransaction });
  await expect(page).toHaveURL(/\/billing\/checkout$/);
  await page.evaluate(() => {
    const emit = (
      window as unknown as { emitMockCheckout: (name: string) => void }
    ).emitMockCheckout;
    emit("checkout.completed");
    emit("checkout.closed");
  });
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(
    page.getByText("Payment submitted.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Subscription confirmed" }),
  ).toHaveCount(0);
  confirmed = true;
  await expect(
    page.getByRole("heading", { name: "Subscription confirmed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return to billing" }),
  ).toHaveAttribute("href", "/pt-hub/settings/billing");
  expect(fixture.opened).toHaveLength(1);
});

test("closing checkout grants no access and offers a status check", async ({
  page,
  context,
}, info) => {
  const fixture = await paymentMethodFixture(page, context, info.testId);
  let reads = 0;
  await context.route(
    "**/rest/v1/rpc/get_my_paddle_checkout_status_v1",
    (route) => {
      reads++;
      return route.fulfill({ json: { status: "unavailable" } });
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/billing/checkout?_ptxn=${syntheticTransaction}`);
  await expect.poll(() => fixture.opened.length).toBe(1);
  await page.evaluate(() =>
    (
      window as unknown as { emitMockCheckout: (name: string) => void }
    ).emitMockCheckout("checkout.closed"),
  );
  await expect(
    page.getByText("Checkout closed.", { exact: false }),
  ).toBeVisible();
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(
    page.getByText("Payment confirmation is still pending.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Subscription confirmed" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("owner opens Paddle invoices and cancellation with no client-supplied identity", async ({
  page,
  context,
}, info) => {
  await paymentMethodFixture(page, context, info.testId);
  const url =
    "https://sandbox-customer-portal.paddle.com/cpl_synthetic?token=synthetic-session";
  let requests = 0;
  await context.route(
    "**/functions/v1/billing-create-paddle-portal",
    (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
          },
        });
      requests++;
      expect(route.request().postDataJSON()).toEqual({});
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      return route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: { portalUrl: url, environment: "test" },
      });
    },
  );
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Synthetic Paddle billing portal</h1>",
    }),
  );
  await page
    .getByRole("button", { name: "Invoices and subscription management" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synthetic Paddle billing portal" }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("an invalid payment link shows a recoverable error without launching Paddle", async ({
  page,
}) => {
  await page.goto("/billing/checkout?_ptxn=invalid");
  await expect(page.getByRole("alert")).toContainText(
    "Checkout could not be completed",
  );
  await expect(
    page.getByRole("link", { name: "Return to billing" }),
  ).toBeVisible();
});
