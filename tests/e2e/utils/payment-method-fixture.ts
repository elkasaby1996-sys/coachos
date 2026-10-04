import { expect, type Page, type BrowserContext } from "@playwright/test";
import { seedEntitlementCoach } from "./account-entitlement-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./test-helpers";
import { trackRpcReads } from "./rpc-readiness";
import type { BillingProviderSummary } from "../../../src/features/billing/billing-management-contracts";
import type { PaymentMethodState } from "../../../src/features/billing/payment-method-contracts";
import { ACCESS_MODE_BY_STATUS } from "../../../src/features/account-entitlements/contracts";
import { assertPaymentMethodFixtureTarget } from "./payment-method-fixture-target";

export const syntheticTransaction = `txn_${"a".repeat(26)}`;
export async function gotoBilling(
  page: Page,
  path = "/pt-hub/settings/billing",
  owner = true,
) {
  const read = owner
    ? page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response
            .url()
            .endsWith("/rpc/get_my_billing_payment_method_state_v1"),
      )
    : undefined;
  await page.goto(path);
  await waitForBootstrapResolved(page);
  if (read) {
    const response = await read;
    expect(response.ok()).toBe(true);
    await response.finished();
  }
}
export async function paymentMethodFixture(
  page: Page,
  context: BrowserContext,
  scope: string,
  status: "active" | "past_due" = "active",
  owner = true,
  launchFailure = false,
) {
  assertPaymentMethodFixtureTarget(process.env);
  const coach = await seedEntitlementCoach(`payment-method-${scope}`, true);
  const summary: BillingProviderSummary = {
    linked: false,
    status,
    cancelAtPeriodEnd: false,
    currentPeriodEndsAt: "2027-01-01T00:00:00Z",
    reconciliationStatus: "processed",
    errorCode: null,
    revision: "initial",
    pending: false,
  };
  const fixture = {
    summary,
    state: {
      available: true,
      status,
      maySettleExistingBalance: status === "past_due",
    } as PaymentMethodState,
    requests: 0,
    portalRequests: 0,
    summaryReads: 0,
    stateReads: 0,
    capacityReads: 0,
    failed: false,
    opened: [] as unknown[],
    initializationCount: 0,
    telemetry: [] as string[],
    externalRequests: 0,
  };
  const waitForReads = trackRpcReads(page);
  page.on("console", (message) => fixture.telemetry.push(message.text()));
  page.on("pageerror", (error) => fixture.telemetry.push(error.message));
  // No provider network: the only SDK document is an injected synthetic implementation.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(url.hostname))
      return route.continue();
    fixture.externalRequests++;
    return route.abort();
  });
  await context.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.exposeFunction("recordMockCheckout", (input: unknown) => {
    fixture.opened.push(input);
  });
  await page.exposeFunction("recordMockInitialization", () => {
    fixture.initializationCount++;
  });
  await context.route("https://cdn.paddle.com/paddle/v2/paddle.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    window.PaddleBillingV1 = {
      Initialized: false,
      Environment: { set(value) { if (value !== 'sandbox') throw Error('wrong environment'); } },
      Initialize(options) { this.Initialized = true; window.recordMockInitialization(); window.emitMockCheckout = name => options.eventCallback({name, data: {status: 'completed'}}); },
      Update() { throw Error('unexpected repeated initialization'); },
      Checkout: { open(input) { window.recordMockCheckout(input); ${launchFailure ? "throw Error('private checkout failure');" : ""} } }
    };`,
    }),
  );
  await context.route(
    "**/rest/v1/rpc/get_my_billing_provider_summary",
    (route) => {
      fixture.summaryReads++;
      return route.abort();
    },
  );
  await context.route(
    "**/rest/v1/rpc/get_my_billing_payment_method_state_v1",
    (route) => {
      fixture.stateReads++;
      return route.fulfill({ json: fixture.state });
    },
  );
  await context.route(
    "**/rest/v1/rpc/get_my_effective_account_entitlements",
    async (route) => {
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
      fixture.capacityReads++;
      await route.fulfill({ response: await route.fetch() });
    },
  );
  page.on("request", (request) => {
    if (request.url().includes("/billing-create-customer-portal-link"))
      fixture.portalRequests++;
  });
  await context.route(
    "**/functions/v1/billing-update-payment-method",
    (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
          },
        });
      fixture.requests++;
      expect(route.request().postDataJSON()).toEqual({
        intent: "update_payment_method",
      });
      if (!owner)
        return route.fulfill({
          status: 403,
          headers: { "Access-Control-Allow-Origin": "*" },
          json: { code: "BILLING_PAYMENT_METHOD_OWNER_REQUIRED" },
        });
      if (fixture.failed)
        return route.fulfill({
          status: 503,
          headers: { "Access-Control-Allow-Origin": "*" },
          json: {
            code: "BILLING_PAYMENT_METHOD_PROVIDER_AMBIGUOUS",
            message: syntheticTransaction,
          },
        });
      return route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          intent: "update_payment_method",
          effect:
            status === "past_due"
              ? {
                  kind: "settle_existing_balance",
                  amountMinor: "5900",
                  currency: "USD",
                }
              : { kind: "update_only" },
          continuation: {
            kind: "provider_checkout",
            provider: "paddle",
            environment: "test",
            token: syntheticTransaction,
          },
        },
      });
    },
  );
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await gotoBilling(page, "/pt-hub/settings/billing", owner);
  if (owner && status === "past_due")
    await expect(
      page.getByText("A payment failed.", { exact: false }),
    ).toBeVisible();
  else
    await expect(
      page.getByText(
        owner ? "Your paid subscription is active." : "Account capacity",
        { exact: true },
      ),
    ).toBeVisible();
  await waitForReads();
  return {
    ...fixture,
    fixture,
    waitForReads,
    async signal(
      name: "checkout.completed" | "checkout.closed" | "checkout.error",
    ) {
      await page.evaluate((value) => {
        const emit = (
          window as unknown as { emitMockCheckout: (name: string) => void }
        ).emitMockCheckout;
        emit(value);
      }, name);
    },
  };
}
