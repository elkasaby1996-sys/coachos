import { expect, type BrowserContext, type Page } from "@playwright/test";
import { seedEntitlementCoach } from "./account-entitlement-seeds";
import { pgQuery } from "./auth-seeds";
import { trackRpcReads } from "./rpc-readiness";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./test-helpers";

/** Shared synthetic canonical capacity, with no LS customer, mapping, transport,
 * subscription or webhook. The spec injects the actual Paddle HTTP preview
 * handler and mocks its application response; it is not DB/provider certification. */
export async function paddlePlanFixture(
  page: Page,
  context: BrowserContext,
  scope: string,
  plan: "growth" | "scale",
  cadence: "monthly" | "annual",
) {
  const coach = await seedEntitlementCoach(`paddle-plan-${scope}`, true);
  const waitForReads = trackRpcReads(page);
  if (plan === "growth")
    await pgQuery(`begin;
    update public.account_subscriptions set status='canceled',canceled_at=now(),status_changed_at=now()
      where billing_account_id=(select id from public.billing_accounts where owner_user_id='${coach.userId}'::uuid)
      and status='active';
    insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
      select a.id,p.id,'complimentary','active','legacy_beta_backfill'
      from public.billing_accounts a cross join public.commercial_plan_versions p
      where a.owner_user_id='${coach.userId}'::uuid and p.plan_key='growth' and p.version=1 and p.status='active';
    commit;`);
  let unexpectedMutations = 0;
  await context.route(
    (url) => !["localhost", "127.0.0.1"].includes(url.hostname),
    async (route) => {
      unexpectedMutations++;
      await route.abort();
    },
  );
  await context.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await context.route("**/functions/v1/*", (route) => {
    unexpectedMutations++;
    throw new Error("Unexpected billing function dispatch");
  });
  await context.route(
    "**/rest/v1/rpc/get_my_billing_plan_change_state",
    (route) =>
      route.fulfill({
        json: {
          provider: "paddle",
          linked: true,
          cadence,
          eligible: true,
          operation: null,
        },
      }),
  );
  await context.route(
    "**/rest/v1/rpc/get_my_billing_seat_quantity_state",
    (route) =>
      route.fulfill({
        json: {
          available: false,
          canCancel: false,
          summary: null,
          operation: null,
        },
      }),
  );
  await context.route(
    "**/rest/v1/rpc/get_my_billing_payment_method_state_v1",
    (route) =>
      route.fulfill({
        json: {
          available: false,
          reason: "not_available",
          maySettleExistingBalance: false,
        },
      }),
  );
  await context.route(
    "**/rest/v1/rpc/get_my_effective_account_entitlements",
    async (route) => {
      const body = await (await route.fetch()).json();
      body.subscription = {
        ...body.subscription,
        kind: "paid",
        storedStatus: "active",
        effectiveStatus: "active",
        planKey: plan,
        planDisplayName: plan === "growth" ? "Growth" : "Scale",
        accessLabel: plan === "growth" ? "Growth" : "Scale",
        accessMode: "full",
      };
      await route.fulfill({ json: body });
    },
  );
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await page.goto("/pt-hub/settings/billing");
  await waitForBootstrapResolved(page);
  await expect(
    page.getByRole("button", { name: "Change plan", exact: true }),
  ).toBeVisible();
  await waitForReads();
  return {
    patches: () => unexpectedMutations,
    async commercialCounts() {
      const rows = await pgQuery<{ operations: number; applications: number }>(`
        with account as (select id from public.billing_accounts where owner_user_id='${coach.userId}'::uuid)
        select ((select count(*) from public.billing_plan_change_operations where billing_account_id in (select id from account))+
          (select count(*) from public.billing_seat_quantity_operations where billing_account_id in (select id from account))+
          (select count(*) from public.billing_operations_v2 where billing_account_id in (select id from account)))::int operations,
          (select count(*)::int from public.billing_payment_applications_v2 where billing_account_id in (select id from account)) applications`);
      return rows[0];
    },
    async apply() {
      await page
        .getByRole("button", { name: "Review and confirm", exact: true })
        .click();
      await Promise.all([
        ...[
          "/functions/v1/billing-change-subscription-plan",
          "/rest/v1/rpc/get_my_billing_plan_change_state",
          "/rest/v1/rpc/get_my_effective_account_entitlements",
          "/rest/v1/rpc/get_my_account_capacity_snapshot",
        ].map(async (path) => {
          const response = await page.waitForResponse(
            (response) =>
              response.request().method() === "POST" &&
              new URL(response.url()).pathname === path,
          );
          expect(response.ok()).toBe(true);
          await response.finished();
        }),
        page
          .getByRole("button", { name: "Confirm plan change", exact: true })
          .click(),
      ]);
      await waitForReads();
      await page.locator('[data-ui="dialog"]').waitFor({ state: "detached" });
      await expect(
        page.getByRole("button", { name: "Refresh plan change", exact: true }),
      ).toBeEnabled();
    },
  };
}
