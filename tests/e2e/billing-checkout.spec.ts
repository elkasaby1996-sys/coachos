import { randomUUID, createHmac } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { pgQuery } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./utils/test-helpers";
import {
  handleBillingWebhook,
  type BillingDependencies,
} from "../../supabase/functions/_shared/billing-handlers";

test.describe.configure({ mode: "parallel" });
// Browser boundary fixtures are worker-isolated. Actual SQL transitions/locks are
// verified in pgTAP; no fake mappings are committed or enabled in the application.
async function fixture(
  page: Page,
  context: BrowserContext,
  scope: string,
  complimentary = false,
) {
  const coach = await seedEntitlementCoach(scope, complimentary);
  if (!complimentary)
    await pgQuery(
      `insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Billing browser fixture','${coach.userId}')`,
    );
  const attempt = randomUUID();
  let open = false,
    paid = false,
    calls = 0;
  const expiresAt = new Date(Date.now() + 1800000).toISOString();
  await context.route("**/rest/v1/rpc/get_my_billing_checkout_state", (route) =>
    route.fulfill({
      json: {
        checkoutAttemptId: open ? attempt : null,
        status: paid ? "completed" : open ? "ready" : null,
        expiresAt: open ? expiresAt : null,
        errorCode: null,
      },
    }),
  );
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
    async (route) => {
      calls++;
      if (open)
        return route.fulfill({
          status: 409,
          json: { code: "BILLING_CHECKOUT_ALREADY_OPEN" },
        });
      open = true;
      await route.fulfill({
        json: {
          checkoutAttemptId: attempt,
          checkoutUrl:
            "https://fake-store.lemonsqueezy.com/checkout/custom/browser-test",
          expiresAt,
        },
      });
    },
  );
  await context.route("https://fake-store.lemonsqueezy.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Deterministic hosted checkout</h1>",
    }),
  );
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await page.goto("/pt-hub/settings/billing");
  await expect(
    page.getByRole("button", { name: "Start subscription", exact: true }),
  ).toBeVisible();
  return {
    attempt,
    calls: () => calls,
    confirm: async () => {
      const snapshot = {
        provider: "lemonsqueezy" as const,
        environment: "test" as const,
        store_id: "95001",
        subscription_id: "95005",
        customer_id: "95006",
        order_id: "95007",
        order_item_id: "95008",
        product_id: "95002",
        variant_id: "95003",
        price_id: "95004",
        first_subscription_item_id: "95009",
        quantity: 1,
        status: "active",
        cancelled: false,
        renews_at: expiresAt,
        ends_at: null,
        trial_ends_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const body = JSON.stringify({
        meta: { event_name: "subscription_created" },
        data: {
          type: "subscriptions",
          id: "95005",
          attributes: { ...snapshot, test_mode: true },
        },
      });
      const deps: BillingDependencies = {
        config: () => ({
          environment: "test",
          appBaseUrl: "http://localhost",
          webhookSecret: "browser-fixture",
          provider: {
            createCheckout: async () => {
              throw new Error("unused");
            },
            retrieveSubscription: async () => snapshot,
          },
        }),
        authenticate: async () => null,
        ownerRpc: () => async () => null,
        serviceRpc: async (name) => {
          if (name === "get_billing_provider_store") return "95001";
          if (name === "record_billing_webhook_delivery") return attempt;
          if (name === "reconcile_billing_provider_subscription") {
            paid = true;
            return "processed";
          }
        },
      };
      const result = await handleBillingWebhook(
        new Request("http://local.test/webhook", {
          method: "POST",
          body,
          headers: {
            "x-event-name": "subscription_created",
            "x-signature": createHmac("sha256", "browser-fixture")
              .update(body)
              .digest("hex"),
          },
        }),
        deps,
      );
      expect(result.status).toBe(200);
    },
  };
}
for (const complimentary of [false, true])
  test(`${complimentary ? "complimentary" : "trial"} hosted checkout waits for verified confirmation`, async ({
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
      page.getByText("$190 USD charged annually", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start subscription", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Deterministic hosted checkout" }),
    ).toBeVisible();
    expect(f.calls()).toBe(1);
    await page.goto(
      `/pt-hub/settings/billing?checkout=return&attempt=${f.attempt}`,
    );
    await expect(page.getByText(/Finalizing your subscription/)).toBeVisible();
    await f.confirm();
    await page
      .getByRole("button", { name: "Refresh subscription", exact: true })
      .click();
    await expect(page.getByText(/Paid subscription confirmed/)).toBeVisible();
    await expect(page).not.toHaveURL(/checkout=return/);
    await expect(
      page.getByRole("button", {
        name: /portal|cancel subscription|purchase seats|payment method/i,
      }),
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("billing-confirmed.png"),
      fullPage: true,
    });
  });
test("unavailable provider retains selected plan and cadence", async ({
  page,
  context,
}, info) => {
  await fixture(page, context, info.testId);
  await page.route(
    "**/functions/v1/billing-create-lemon-squeezy-checkout",
    (route) =>
      route.fulfill({
        status: 503,
        json: { code: "BILLING_PROVIDER_NOT_CONFIGURED" },
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
  await fixture(page, context, info.testId);
  await page.goto(
    `/pt-hub/settings/billing?checkout=return&attempt=${randomUUID()}`,
  );
  await expect(page.getByText(/Finalizing your subscription/)).toBeVisible();
  await expect(page.getByText(/Paid subscription confirmed/)).toHaveCount(0);
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
  await expect(
    second.getByRole("button", { name: "Start subscription", exact: true }),
  ).toBeVisible();
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
    second.getByRole("alert").filter({ hasText: "checkout is already open" }),
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
  await expect(
    page.getByText("Subscription details unavailable", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start subscription", exact: true }),
  ).toHaveCount(0);
});
