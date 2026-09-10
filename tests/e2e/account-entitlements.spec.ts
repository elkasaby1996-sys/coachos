import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { pgQuery } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
  waitForPageReady,
} from "./utils/test-helpers";
import type { EffectiveAccountEntitlements } from "../../src/features/account-entitlements/contracts";

test.describe.configure({ mode: "parallel" });

async function openBilling(page: Page) {
  const response = page.waitForResponse((value) =>
    new URL(value.url()).pathname.endsWith(
      "/rpc/get_my_effective_account_entitlements",
    ),
  );
  await page.goto("/pt-hub/settings/billing");
  const resolved = await response;
  expect(resolved.ok()).toBe(true);
  await resolved.finished();
}

async function readOwner(page: Page): Promise<EffectiveAccountEntitlements> {
  return page.evaluate(async () => {
    const modulePath =
      "/src/features/account-entitlements/account-entitlements-api.ts";
    const api = await import(modulePath);
    return api.fetchMyEffectiveAccountEntitlements();
  });
}
test("selected paid intent stays separate from first-workspace Growth trial", async ({
  page,
}, testInfo) => {
  const coach = await seedEntitlementCoach(testInfo.testId);
  await page.goto("/login");
  await page.evaluate(() =>
    window.localStorage.setItem("repsync_pending_trial_plan", "launch"),
  );
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await expect(
    page.getByRole("heading", { name: "Create your workspace" }),
  ).toBeVisible();
  const before = await readOwner(page);
  expect(before.subscription.effectiveStatus).toBe("no_subscription");
  expect(before.subscription.trialStartedAt).toBeNull();
  await page.getByLabel("Workspace name").fill("Commercial trial workspace");
  const workspaceCreated = page.waitForResponse((value) =>
    new URL(value.url()).pathname.endsWith("/rpc/create_workspace"),
  );
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  expect((await workspaceCreated).ok()).toBe(true);
  await waitForPageReady(page, {
    testId: "pt-hub-page",
    urlPattern: /\/pt-hub$/,
  });
  await openBilling(page);
  await expect(page.getByText("Growth trial", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Intended paid plan", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Launch", { exact: true })).toBeVisible();
  const after = await readOwner(page);
  expect(after.subscription.kind).toBe("trial");
  expect(after.subscription.planKey).toBe("growth");
  expect(after.billingAccount.requestedPaidPlanKey).toBe("launch");
  expect(after.limits.countedClients).toBe(10);
  expect(after.subscription.trialEndsAt).not.toBeNull();
  const endDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(after.subscription.trialEndsAt!));
  await expect(page.getByText("Trial end date", { exact: true })).toBeVisible();
  await expect(page.getByText(endDate, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Manage subscription (Unavailable)",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Add payment method (Unavailable)",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("repsync_pending_trial_plan"),
    ),
  ).toBeNull();
  await page.screenshot({
    path: testInfo.outputPath("trial-billing.png"),
    fullPage: true,
  });
});

test("existing beta owner sees complimentary Scale access without renewal", async ({
  page,
}, testInfo) => {
  const coach = await seedEntitlementCoach(testInfo.testId, true);
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await openBilling(page);
  await expect(
    page.getByText("Complimentary beta access", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Complimentary beta access follows the Scale v1 entitlement contract.",
      { exact: true },
    ),
  ).toBeVisible();
  const owner = await readOwner(page);
  expect(owner.subscription.kind).toBe("complimentary");
  expect(owner.subscription.planKey).toBe("scale");
  expect(owner.subscription.currentPeriodEndsAt).toBeNull();
  expect(owner.subscription.trialStartedAt).toBeNull();
  await expect(
    page.getByText(/renewal|renews on|current period|trial end date/i),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Manage subscription (Unavailable)",
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("complimentary-billing.png"),
    fullPage: true,
  });
});

test("concurrent first workspace inserts create exactly one account and trial", async ({
  request,
}, testInfo) => {
  const coach = await seedEntitlementCoach(testInfo.testId);
  const workspaceIds = [randomUUID(), randomUUID()];
  await Promise.all(
    workspaceIds.map(async (id) => {
      const response = await request.post(
        `${process.env.E2E_SUPABASE_API_URL?.trim() || "http://127.0.0.1:54321"}/pg/query`,
        {
          data: {
            query: `insert into public.workspaces(id,name,owner_user_id) values('${id}','Concurrent commercial fixture','${coach.userId}');`,
          },
        },
      );
      expect(response.ok()).toBe(true);
    }),
  );
  const [row] = await pgQuery<{
    accounts: number;
    trials: number;
    events: number;
  }>(`
    select (select count(*)::int from public.billing_accounts where owner_user_id='${coach.userId}') accounts,
      (select count(*)::int from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='${coach.userId}') trials,
      (select count(*)::int from public.account_subscription_events e join public.billing_accounts a on a.id=e.billing_account_id where a.owner_user_id='${coach.userId}' and e.event_type='subscription.trial_started') events;
  `);
  expect(row).toEqual({ accounts: 1, trials: 1, events: 1 });
});
