import {
  expect,
  test,
  type Page,
  type BrowserContext,
  type Request as BrowserRequest,
} from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { seedAuthSmokeStates } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./utils/test-helpers";
import { handleCustomerPortalLink } from "../../supabase/functions/_shared/billing-portal";
import { BillingError } from "../../supabase/functions/_shared/lemon-squeezy";
import { redactHostedPaymentUrls } from "../../src/lib/redact-hosted-payment-urls";
import type { BillingProviderSummary } from "../../src/features/billing/portal-contracts";
import { ACCESS_MODE_BY_STATUS } from "../../src/features/account-entitlements/contracts";

test.describe.configure({ mode: "parallel" });
// Capability-bearing navigation must not be saved in Playwright traces/videos.
test.use({ trace: "off", video: "off" });
test.afterEach(async ({ context }) => {
  // Finish canonical refetch route callbacks before closing their context.
  await context.unrouteAll({ behavior: "wait" });
});
async function holdCommercialAccess(page: Page, context: BrowserContext) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const response = page.waitForResponse((value) =>
    value.url().endsWith("/rpc/get_my_commercial_access_summary"),
  );
  await context.route(
    "**/rest/v1/rpc/get_my_commercial_access_summary",
    async (route) => {
      const result = await route.fetch();
      await held;
      await route.fulfill({ response: result });
    },
  );
  return async () => {
    release();
    await response;
    await page.waitForLoadState("networkidle");
  };
}
async function fixture(
  page: Page,
  context: BrowserContext,
  scope: string,
  owner = true,
) {
  const coach = await seedEntitlementCoach(`portal-${scope}`, true);
  const summary: BillingProviderSummary = {
    linked: true,
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEndsAt: "2027-01-01T00:00:00Z",
    reconciliationStatus: "processed",
    errorCode: null,
    revision: "initial",
    pending: false,
  };
  let requests = 0,
    failed = false,
    summaryReads = 0,
    capacityReads = 0;
  const telemetry: string[] = [];
  const pendingReads = new Set<BrowserRequest>();
  let lastReadActivity = Date.now();
  page.on("request", (request) => {
    if (!request.url().includes("/rest/v1/rpc/")) return;
    pendingReads.add(request);
    lastReadActivity = Date.now();
  });
  const finishRead = (request: BrowserRequest) => {
    if (pendingReads.delete(request)) lastReadActivity = Date.now();
  };
  page.on("requestfinished", finishRead);
  page.on("requestfailed", finishRead);
  // Unlike the already-reached document load state, this observes new RPCs
  // dispatched by virtual-clock ticks and waits for actual network quiescence.
  const waitForReads = () =>
    expect
      .poll(
        () => pendingReads.size === 0 && Date.now() - lastReadActivity >= 500,
      )
      .toBe(true);
  page.on("console", (message) => telemetry.push(message.text()));
  page.on("pageerror", (error) => telemetry.push(error.message));
  await context.route(
    "**/rest/v1/rpc/get_my_billing_provider_summary",
    (route) => {
      summaryReads++;
      return route.fulfill({ json: summary });
    },
  );
  await context.route(
    "**/rest/v1/rpc/get_my_effective_account_entitlements",
    async (route) => {
      if (!owner)
        return route.fulfill({
          status: 403,
          json: { code: "42501", message: "PT authentication required." },
        });
      const body = await (await route.fetch()).json();
      body.billingAccount.canManageBilling = owner;
      body.subscription = {
        ...body.subscription,
        kind: "paid",
        storedStatus: summary.status,
        effectiveStatus: summary.status,
        accessLabel: "Scale",
        planKey: "scale",
        planDisplayName: "Scale",
        cancelAtPeriodEnd: summary.cancelAtPeriodEnd,
        currentPeriodEndsAt: summary.currentPeriodEndsAt,
        accessMode: ACCESS_MODE_BY_STATUS[summary.status ?? "expired"],
      };
      await route.fulfill({ json: body });
    },
  );
  await context.route(
    "**/rest/v1/rpc/get_my_account_capacity_snapshot",
    async (route) => {
      capacityReads++;
      await route.fulfill({ response: await route.fetch() });
    },
  );
  await context.route(
    "**/functions/v1/billing-create-customer-portal-link",
    async (route) => {
      requests++;
      const input = route.request().postDataJSON();
      // The actual handler runs against a fake provider; no remote API is contacted.
      const response = await handleCustomerPortalLink(
        new Request("https://local.test/portal", {
          method: "POST",
          headers: { authorization: "Bearer fake" },
          body: JSON.stringify(input),
        }),
        {
          authenticate: async () => ({ id: coach.userId }),
          ownerRpc: () => async () => null,
          serviceRpc: async () => {
            if (!owner)
              throw new BillingError("BILLING_PORTAL_OWNER_REQUIRED", 403);
            return {
              provider: "lemonsqueezy",
              environment: "test",
              store_id: "1",
              customer_id: "2",
              subscription_id: "3",
              local_status: summary.status,
            };
          },
          config: () => ({
            environment: "test",
            webhookSecret: "fake",
            appBaseUrl: "https://local.test",
            portalAllowedHosts: "portal.example.test",
            provider: {
              createCheckout: async () => {
                throw new Error("unused");
              },
              retrieveSubscription: async () => {
                throw new Error("unused");
              },
              retrieveSubscriptionForPortal: async () => {
                const capability = (path: string) =>
                  `https://portal.example.test${path}?expires=${Math.floor(Date.now() / 1000) + 3600}&signature=${"a".repeat(64)}`;
                if (failed) throw new Error(capability("/billing"));
                return {
                  provider: "lemonsqueezy",
                  environment: "test",
                  store_id: "1",
                  customer_id: "2",
                  subscription_id: "3",
                  status:
                    summary.status === "grace" ? "unpaid" : summary.status!,
                  customerPortal: capability("/billing"),
                  updatePaymentMethod: capability(
                    "/subscription/3/payment-details",
                  ),
                };
              },
            },
          }),
          log: (tags) =>
            telemetry.push(JSON.stringify(redactHostedPaymentUrls(tags))),
        },
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    },
  );
  await context.route("https://portal.example.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Deterministic Customer Portal</h1>",
    }),
  );
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await page.goto("/pt-hub/settings/billing");
  // Finish the initial routed reads before a test navigates back from the portal.
  // Otherwise navigation can cancel a request while its route.fetch is pending.
  await waitForReads();
  return {
    waitForReads,
    summary,
    telemetry,
    fail: () => {
      failed = true;
    },
    requests: () => requests,
    summaryReads: () => summaryReads,
    capacityReads: () => capacityReads,
  };
}
test("owner opens deterministic portal without persisting capability", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, "owner");
  await page
    .getByRole("button", { name: "Manage billing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Deterministic Customer Portal" }),
  ).toBeVisible();
  expect(f.requests()).toBe(1);
  await page.goto("/pt-hub/settings/billing");
  expect(
    await page.evaluate(() =>
      /signature=/.test(JSON.stringify({ ...localStorage, ...sessionStorage })),
    ),
  ).toBe(false);
  expect(/signature=|a{64}/.test(f.telemetry.join())).toBe(false);
});
test("team member has no portal action and forged request is denied", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, "member", false);
  await expect(
    page.getByText("Subscription details unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage billing", exact: true }),
  ).toHaveCount(0);
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/functions/v1/billing-create-customer-portal-link", {
          method: "POST",
          body: JSON.stringify({ purpose: "manage_billing" }),
        })
      ).status,
  );
  expect(status).toBe(403);
  expect(f.requests()).toBe(1);
});
test("client cannot open billing portal", async ({ page, context }) => {
  const seeded = await seedAuthSmokeStates();
  if (!seeded) throw new Error("Local auth fixtures unavailable");
  await context.route(
    "**/functions/v1/billing-create-customer-portal-link",
    async (route) => {
      const response = await handleCustomerPortalLink(
        new Request("https://local.test", {
          method: "POST",
          headers: { authorization: "Bearer fake" },
          body: JSON.stringify({ purpose: "manage_billing" }),
        }),
        {
          authenticate: async () => ({ id: "client-fixture" }),
          ownerRpc: () => async () => null,
          serviceRpc: async () => {
            throw new BillingError("BILLING_PORTAL_OWNER_REQUIRED", 403);
          },
          config: () => ({
            environment: "test",
            webhookSecret: "fake",
            appBaseUrl: "https://local.test",
            portalAllowedHosts: "portal.example.test",
            provider: {
              createCheckout: async () => {
                throw new Error("unused");
              },
              retrieveSubscription: async () => {
                throw new Error("unused");
              },
              retrieveSubscriptionForPortal: async () => {
                throw new Error("must not retrieve");
              },
            },
          }),
        },
      );
      await route.fulfill({
        status: response.status,
        json: await response.json(),
      });
    },
  );
  await signInWithEmail(
    page,
    seeded.clientNoWorkspace.email,
    seeded.clientNoWorkspace.password,
  );
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/functions/v1/billing-create-customer-portal-link", {
          method: "POST",
        })
      ).status,
  );
  expect(status).toBe(403);
  await expect(
    page.getByRole("button", { name: "Manage billing", exact: true }),
  ).toHaveCount(0);
});
for (const state of ["past_due", "grace"] as const)
  test(`${state} owner can open payment recovery`, async ({
    page,
    context,
  }) => {
    const f = await fixture(page, context, state);
    f.summary.status = state;
    await page.goto("/pt-hub/settings/billing");
    await page
      .getByRole("button", { name: "Update payment method", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Deterministic Customer Portal" }),
    ).toBeVisible();
  });
test("portal return polls only within its bound and offers manual refresh", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, "polling");
  const releaseAccess = await holdCommercialAccess(page, context);
  await page.clock.install();
  await page.goto("/pt-hub/settings/billing?portal=return");
  await expect(
    page.getByText("Checking for billing changes.", { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/billing$/);
  // Resolving commercial access after the return marker was consumed must not
  // remount the recovery page and discard its polling state.
  await releaseAccess();
  await expect(
    page.getByText("Checking for billing changes.", { exact: false }),
  ).toBeVisible();
  // Clock advancement does not flush browser requests or route handlers.
  await f.waitForReads();
  const initialReads = f.summaryReads();
  await page.clock.fastForward(2_000);
  await expect.poll(() => f.summaryReads()).toBeGreaterThan(initialReads);
  await f.waitForReads();
  await page.clock.fastForward(31_000);
  await expect(
    page.getByRole("button", { name: "Refresh billing", exact: true }),
  ).toBeVisible();
  // A tick dispatched before the deadline may still be completing after it.
  await f.waitForReads();
  const count = f.summaryReads();
  await page.clock.fastForward(60_000);
  await f.waitForReads();
  expect(f.summaryReads()).toBe(count);
  const capacityBefore = f.capacityReads();
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await expect.poll(() => f.summaryReads()).toBeGreaterThan(count);
  await expect.poll(() => f.capacityReads()).toBeGreaterThan(capacityBefore);
});
test("canonical cancellation, resume and recovery update without new checkout", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, "lifecycle");
  const releaseAccess = await holdCommercialAccess(page, context);
  f.summary.cancelAtPeriodEnd = true;
  await page.goto("/pt-hub/settings/billing?portal=return");
  await expect(
    page.getByText("Cancellation scheduled", { exact: false }),
  ).toBeVisible();
  await releaseAccess();
  await expect(
    page.getByRole("button", { name: "Refresh billing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start subscription", exact: true }),
  ).toHaveCount(0);
  f.summary.cancelAtPeriodEnd = false;
  f.summary.revision = "resumed";
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await expect(
    page.getByText("Your subscription is active again."),
  ).toBeVisible();
  f.summary.status = "past_due";
  f.summary.revision = "failed";
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeVisible();
  f.summary.status = "active";
  f.summary.revision = "recovered";
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toHaveCount(0);
});
test("unapproved change keeps capacity and exposes only review message", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, "review");
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toBeVisible();
  const capacity = await page
    .getByRole("progressbar")
    .evaluateAll((bars) =>
      bars.map((bar) => bar.getAttribute("aria-valuetext")),
    );
  f.summary.reconciliationStatus = "manual_review";
  f.summary.errorCode = "BILLING_UNAPPROVED_PLAN_CHANGE";
  await page.goto("/pt-hub/settings/billing?portal=return");
  await expect(
    page.getByText("Your billing needs manual review.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Clients committed capacity" }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("progressbar")
      .evaluateAll((bars) =>
        bars.map((bar) => bar.getAttribute("aria-valuetext")),
      ),
  ).toEqual(capacity);
  await expect(
    page.getByRole("combobox", { name: "Plan", exact: true }),
  ).toHaveCount(0);
});
test("provider failure never exposes capability in error or telemetry", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, "error");
  f.fail();
  await page
    .getByRole("button", { name: "Manage billing", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "We could not open billing management",
  );
  expect(/signature=|a{64}/.test(await page.locator("body").innerText())).toBe(
    false,
  );
  expect(/signature=|a{64}/.test(f.telemetry.join())).toBe(false);
});

test("expired history offers new Checkout and mobile recovery fits the page", async ({
  page,
  context,
}) => {
  const f = await fixture(page, context, "mobile-expiry");
  f.summary.status = "expired";
  await page.goto("/pt-hub/settings/billing");
  await expect(
    page.getByRole("button", { name: "Start subscription", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toHaveCount(0);
  f.summary.status = "past_due";
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/pt-hub/settings/billing");
  await expect(
    page.getByRole("button", { name: "Update payment method", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${process.env.TEMP}/pr-price-06-billing-mobile.png`,
    fullPage: true,
  });
});
