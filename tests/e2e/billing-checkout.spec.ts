import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { pgQuery } from "./utils/auth-seeds";
import { trackRpcReads } from "./utils/rpc-readiness";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./utils/test-helpers";

test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
});
// Browser boundary fixtures are worker-isolated. Actual SQL transitions/locks are
// verified in pgTAP; no fake mappings are committed or enabled in the application.
async function fixture(
  page: Page,
  context: BrowserContext,
  scope: string,
  complimentary = false,
) {
  const waitForReads = trackRpcReads(page);
  const coach = await seedEntitlementCoach(scope, complimentary);
  if (!complimentary)
    await pgQuery(
      `insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Billing browser fixture','${coach.userId}')`,
    );
  let open = false,
    paid = false,
    calls = 0;
  await context.route(
    "**/rest/v1/rpc/get_my_effective_account_entitlements",
    async (route) => {
      const result = await route.fetch();
      const body = await result.json();
      if (paid) {
        body.subscription = {
          ...body.subscription,
          kind: "paid",
          storedStatus: "active",
          effectiveStatus: "active",
          accessLabel: "Launch",
          planKey: "launch",
          planDisplayName: "Launch",
          accessMode: "full",
          trialStartedAt: null,
          trialEndsAt: null,
          trialRecoveryEndsAt: null,
        };
        body.limits.countedClients = 10;
      }
      await route.fulfill({ json: body });
    },
  );
  await context.route(
    "**/functions/v1/billing-create-lemon-squeezy-checkout",
    () => {
      throw new Error("Paddle checkout must not invoke Lemon Squeezy");
    },
  );
  await context.route(
    "**/functions/v1/billing-create-paddle-checkout",
    async (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
          },
        });
      calls++;
      if (open)
        return route.fulfill({
          status: 409,
          json: { code: "PADDLE_CHECKOUT_CONFLICT", retryable: false },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      open = true;
      await route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          status: "ready",
          checkoutUrl:
            "https://sandbox-pay.paddle.io/checkout/browser-test?transaction_id=synthetic_transaction",
        },
      });
    },
  );
  await context.route("https://sandbox-pay.paddle.io/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Deterministic hosted checkout</h1>",
    }),
  );
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await page.goto("/pt-hub/settings/billing");
  await waitForBootstrapResolved(page);
  await expect(
    page.getByRole("button", { name: "Start subscription", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "I accept the Terms of Service" })
    .check();
  await page
    .getByRole("checkbox", { name: "I acknowledge the Refund Policy" })
    .check();
  await waitForReads();
  return {
    waitForReads,
    calls: () => calls,
    async returnFromCheckout(checkoutAttempt = randomUUID()) {
      await page.goto(
        `/pt-hub/settings/billing?checkout=return&attempt=${checkoutAttempt}`,
      );
      await waitForBootstrapResolved(page);
    },
    confirm: async () => {
      paid = true;
      await page.reload();
      await waitForBootstrapResolved(page);
    },
  };
}
for (const complimentary of [false, true])
  test(`${complimentary ? "complimentary" : "trial"} hosted checkout waits for canonical confirmation`, async ({
    page,
    context,
  }, info) => {
    const f = await fixture(page, context, info.testId, complimentary);
    await expect(
      page.getByText("Paid plan starts immediately", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Plan", { exact: true }).selectOption("launch");
    await page.getByLabel("Billing frequency").selectOption("annual");
    await expect(
      page.getByText("Base plan: $190 USD charged annually", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start subscription", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Deterministic hosted checkout" }),
    ).toBeVisible();
    expect(f.calls()).toBe(1);
    await f.returnFromCheckout();
    await expect(page.getByText(/Paid subscription confirmed/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Start subscription" }),
    ).toBeVisible();
    await f.confirm();
    // This browser fixture changes the canonical entitlement read only; it is
    // not provider settlement evidence (covered by Paddle SQL/runtime tests).
    await expect(page.getByText(/Paid subscription confirmed/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", {
        name: /portal|cancel subscription|purchase seats/i,
      }),
    ).toHaveCount(0);
    // Canonical paid access exposes the reviewed payment-method action, but
    // this fixture has no provider payment-method authority to enable it.
    await expect(
      page.getByRole("button", { name: "Update payment method", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: info.outputPath("billing-confirmed.png"),
      fullPage: true,
    });
    await f.waitForReads();
  });
test("unavailable provider retains selected plan and cadence", async ({
  page,
  context,
}, info) => {
  await fixture(page, context, info.testId);
  await page.route("**/functions/v1/billing-create-paddle-checkout", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "PADDLE_CHECKOUT_ROLLOUT_DISABLED", retryable: false },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.getByLabel("Plan", { exact: true }).selectOption("scale");
  await page.getByLabel("Billing frequency").selectOption("annual");
  await page
    .getByRole("button", { name: "Start subscription", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "currently unavailable" }),
  ).toBeVisible();
  await expect(page.getByLabel("Plan", { exact: true })).toHaveValue("scale");
  await expect(page.getByLabel("Billing frequency")).toHaveValue("annual");
});
test("return query is not payment proof", async ({ page, context }, info) => {
  const f = await fixture(page, context, info.testId);
  await f.returnFromCheckout(randomUUID());
  await expect(page.getByText(/Paid subscription confirmed/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start subscription" }),
  ).toBeVisible();
});

test("double activation dispatches one Checkout request", async ({
  page,
  context,
}, info) => {
  const f = await fixture(page, context, info.testId);
  await page
    .getByRole("button", { name: "Start subscription", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(
    page.getByRole("heading", { name: "Deterministic hosted checkout" }),
  ).toBeVisible();
  expect(f.calls()).toBe(1);
});

test("second tab reports an existing open Checkout", async ({
  page,
  context,
}, info) => {
  const f = await fixture(page, context, info.testId);
  const second = await context.newPage();
  await second.goto("/pt-hub/settings/billing");
  await waitForBootstrapResolved(second);
  await expect(
    second.getByRole("button", { name: "Start subscription", exact: true }),
  ).toBeVisible();
  await second
    .getByRole("checkbox", { name: "I accept the Terms of Service" })
    .check();
  await second
    .getByRole("checkbox", { name: "I acknowledge the Refund Policy" })
    .check();
  await page
    .getByRole("button", { name: "Start subscription", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Deterministic hosted checkout" }),
  ).toBeVisible();
  await second
    .getByRole("button", { name: "Start subscription", exact: true })
    .click();
  await expect(
    second.getByRole("alert").filter({ hasText: "already in progress" }),
  ).toBeVisible();
  expect(f.calls()).toBe(2);
});

test("nonowner canonical permission hides initiation", async ({
  page,
  context,
}, info) => {
  await fixture(page, context, info.testId);
  await page.route(
    "**/rest/v1/rpc/get_my_effective_account_entitlements",
    (route) =>
      route.fulfill({
        status: 403,
        json: { code: "42501", message: "PT authentication required." },
      }),
  );
  await page.reload();
  // Reload starts auth/bootstrap and the independent Billing query again.
  // Wait for its rejected result before asserting that initiation is hidden.
  await page
    .getByText("Subscription details unavailable", { exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await expect(
    page.getByText("Subscription details unavailable", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start subscription", exact: true }),
  ).toHaveCount(0);
});
