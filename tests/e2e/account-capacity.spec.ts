import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { pgQuery } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./utils/test-helpers";
import type { AccountCapacitySnapshot } from "../../src/features/account-capacity/contracts";

test.describe.configure({ mode: "parallel" });
async function openBilling(
  page: Page,
  coach: { email: string; password: string },
) {
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  const capacityResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(
      "/rpc/get_my_account_capacity_snapshot",
    ),
  );
  await page.goto("/pt-hub/settings/billing");
  const response = await capacityResponse;
  expect(response.ok()).toBe(true);
  await response.finished();
  await expect(page.getByTestId("capacity-counted_clients")).toBeVisible();
}
async function readCapacity(page: Page): Promise<AccountCapacitySnapshot> {
  return page.evaluate(async () => {
    const path = "/src/features/account-capacity/account-capacity-api.ts";
    return (await import(path)).fetchMyAccountCapacitySnapshot();
  });
}
async function createWorkspace(coach: { workspaceId: string; userId: string }) {
  await pgQuery(
    `insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Capacity workspace','${coach.userId}');`,
  );
}
test("trial owner sees lifecycle usage, pending staff and published packages", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price03:${info.testId}`);
  await createWorkspace(coach);
  for (const lifecycle of [
    "invited",
    "onboarding",
    "active",
    "paused",
    "completed",
    "churned",
  ]) {
    const id = randomUUID();
    await pgQuery(`insert into auth.users(id,email) values('${id}','${id}@capacity.test');
      insert into public.clients(user_id,workspace_id,lifecycle_state,paused_reason,churn_reason) values('${id}','${coach.workspaceId}','${lifecycle}','Fixture pause','Fixture churn');`);
  }
  await pgQuery(`insert into public.workspace_member_invites(workspace_id,email,role,token_hash,invited_by_user_id,expires_at) values('${coach.workspaceId}','${randomUUID()}@capacity.test','viewer','${randomUUID()}','${coach.userId}',now()+interval '1 day');
    insert into public.pt_packages(pt_user_id,title,status,is_public) values('${coach.userId}','Capacity public package','active',true),('${coach.userId}','Private package','active',false);`);
  await openBilling(page, coach);
  await expect(page.getByTestId("capacity-counted_clients")).toContainText(
    "4 current clients of 10",
  );
  await expect(page.getByTestId("capacity-coach_seats")).toContainText(
    "1 active + 1 pending of 2",
  );
  await expect(page.getByTestId("capacity-active_workspaces")).toContainText(
    "1 workspace of 1",
  );
  await expect(page.getByTestId("capacity-published_packages")).toContainText(
    "1 published of 3",
  );
  await expect(page.getByTestId("capacity-coach_seats")).toContainText(
    "At limit",
  );
  expect((await readCapacity(page)).dimensions.map((d) => d.actual)).toEqual([
    4, 1, 1, 1,
  ]);
  // Existing browser action remains successful despite an at-limit workspace.
  await page.evaluate(async () => {
    const path = "/src/features/pt-hub/lib/pt-hub.ts";
    await (
      await import(path)
    ).createPtWorkspace("Capacity still permits workspace creation");
  });
  expect(
    (await readCapacity(page)).dimensions.find(
      (d) => d.key === "active_workspaces",
    )?.state,
  ).toBe("over_limit");
  await page.screenshot({
    path: info.outputPath("capacity-trial-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByTestId("capacity-counted_clients")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("capacity-trial-mobile.png"),
    fullPage: true,
  });
});

test("complimentary overage preserves access and unlimited packages", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price03:${info.testId}`, true);
  const clients = Array.from({ length: 101 }, () => randomUUID());
  await pgQuery(`insert into auth.users(id,email) values ${clients.map((id) => `('${id}','${id}@capacity.test')`).join(",")};
    insert into public.clients(user_id,workspace_id,lifecycle_state) values ${clients.map((id) => `('${id}','${coach.workspaceId}','active')`).join(",")};
    insert into public.pt_packages(pt_user_id,title,status,is_public) values('${coach.userId}','Beta package','active',true);`);
  await openBilling(page, coach);
  await expect(page.getByTestId("capacity-counted_clients")).toContainText(
    "101 current clients of 100",
  );
  await expect(page.getByTestId("capacity-counted_clients")).toContainText(
    "Over limit",
  );
  await expect(page.getByTestId("capacity-published_packages")).toContainText(
    "1 published · Unlimited",
  );
  await expect(
    page.getByText(
      "Current usage is above the standard Scale allowance. Complimentary beta access is unchanged.",
    ),
  ).toBeVisible();
  await expect(
    page.getByTestId("capacity-published_packages").getByRole("progressbar"),
  ).toHaveCount(0);
  // The real publication API is still available while client capacity is exceeded.
  await page.evaluate(async (userId) => {
    const path = "/src/features/pt-hub/lib/pt-hub.ts";
    const api = await import(path);
    await api.createPtPackage({
      ptUserId: userId,
      input: {
        title: "Beta still available",
        status: "active",
        isPublic: true,
        features: [],
      },
    });
  }, coach.userId);
  expect((await readCapacity(page)).dimensions[0].actual).toBe(101);
  await page.screenshot({
    path: info.outputPath("capacity-beta-desktop.png"),
    fullPage: true,
  });
});

test("concurrent final-slot service reservations grant at most one", async ({
  page,
}, info) => {
  expect(page).toBeDefined();
  const coach = await seedEntitlementCoach(`price03:${info.testId}`);
  await createWorkspace(coach);
  const reserve = (id: string) =>
    pgQuery<{ result: { granted: boolean; reservationId: string | null } }>(
      `select public.reserve_account_capacity((select id from public.billing_accounts where owner_user_id='${coach.userId}'),'coach_seats',1,'${id}','user','user:${id}',null,'e2e',now()+interval '2 minutes') as result;`,
    );
  const ids = [randomUUID(), randomUUID()];
  const results = await Promise.all(ids.map(reserve));
  expect(results.flat().filter((r) => r.result.granted)).toHaveLength(1);
  const counts = await pgQuery<{ active: number; denied: number }>(
    `select (select count(*)::int from public.account_capacity_reservations where billing_account_id=a.id and status='active') as active,(select count(*)::int from public.account_capacity_events where billing_account_id=a.id and event_type='capacity.reservation_denied') as denied from public.billing_accounts a where owner_user_id='${coach.userId}';`,
  );
  expect(counts[0]).toEqual({ active: 1, denied: 1 });
  const again = await Promise.all(ids.map(reserve));
  expect(again).toEqual(results);
});

test("capacity service failure leaves Billing entitlements and navigation usable", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price03:${info.testId}`, true);
  await page.route("**/rpc/get_my_account_capacity_snapshot", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"message":"Capacity unavailable"}',
    }),
  );
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  const entitlementResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(
      "/rpc/get_my_effective_account_entitlements",
    ),
  );
  const failedCapacityResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(
      "/rpc/get_my_account_capacity_snapshot",
    ),
  );
  await page.goto("/pt-hub/settings/billing");
  const [entitlements, capacity] = await Promise.all([
    entitlementResponse,
    failedCapacityResponse,
  ]);
  expect(entitlements.ok()).toBe(true);
  expect(capacity.status()).toBe(503);
  await Promise.all([entitlements.finished(), capacity.finished()]);
  await expect(
    page.getByText("Complimentary beta access", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Account capacity unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry capacity" }),
  ).toBeEnabled();
});
