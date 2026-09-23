import { expect, test } from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import {
  pgQuery,
  authSmokeFixtures,
  seedAuthSmokeStates,
} from "./utils/auth-seeds";
import {
  signInWithEmail,
  clickVisibleEnabledSignInButton,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./utils/test-helpers";

// Real local Auth/DB; provider traffic is denied, never dispatched.
test.beforeEach(async ({ context, baseURL }) => {
  for (const value of [
    baseURL,
    process.env.E2E_SUPABASE_API_URL || "http://127.0.0.1:54321",
  ]) {
    if (!value || !["localhost", "127.0.0.1"].includes(new URL(value).hostname))
      throw new Error(
        "Pre-workspace Billing regression requires local services",
      );
  }
  await context.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
});

async function snapshot(userId: string) {
  const [row] = await pgQuery<Record<string, unknown>>(`
    select
      (select count(*) from public.workspaces where owner_user_id='${userId}') workspaces,
      (select count(*) from public.account_subscriptions where billing_account_id=a.id) subscriptions,
      (select count(*) from public.account_subscriptions where billing_account_id=a.id and subscription_kind='trial') trials,
      (select count(*) from public.account_feature_entitlement_overrides where billing_account_id=a.id) overrides,
      (select count(*) from public.billing_checkouts_v2 where billing_account_id=a.id) checkouts,
      (select count(*) from public.billing_operations_v2 where billing_account_id=a.id) operations,
      (select count(*) from public.billing_plan_change_operations where billing_account_id=a.id) plan_operations,
      (select count(*) from public.billing_seat_quantity_operations where billing_account_id=a.id) seat_operations,
      public.resolve_account_capacity(a.owner_user_id,a.id)-'computedAt' capacity,
      (select jsonb_agg(to_jsonb(r) order by r.id) from public.account_capacity_reservations r where billing_account_id=a.id) reservations,
      (select jsonb_agg(to_jsonb(e) order by e.id) from public.account_capacity_events e where billing_account_id=a.id) capacity_events,
      public.resolve_account_entitlements(a.id)-'computedAt' entitlements,
      to_jsonb(a) account,
      (select jsonb_agg(to_jsonb(p) order by p.id) from public.pt_profiles p where user_id='${userId}') profiles,
      (select jsonb_build_object('app',raw_app_meta_data,'user',raw_user_meta_data) from auth.users where id='${userId}') metadata,
      (select count(*) from public.notification_preferences where user_id='${userId}') preferences,
      (select count(*) from public.pt_hub_profiles where user_id='${userId}') hub_profiles,
      (select count(*) from public.pt_hub_settings where user_id='${userId}') hub_settings
    from public.billing_accounts a where owner_user_id='${userId}';`);
  expect(row).toBeDefined();
  return row;
}

for (const suffix of ["", "/?anything=preserved"]) {
  test(`PT without workspace can open Billing without side effects (${suffix || "exact"})`, async ({
    page,
  }, info) => {
    const coach = await seedEntitlementCoach(info.testId);
    // Deliberately incomplete identity onboarding; never insert a workspace.
    await pgQuery(`update public.pt_profiles set onboarding_completed_at=null where user_id='${coach.userId}';
      select public.ensure_commercial_billing_account('${coach.userId}','signup');`);
    const before = await snapshot(coach.userId);
    for (const key of [
      "workspaces",
      "subscriptions",
      "trials",
      "overrides",
      "checkouts",
      "operations",
      "plan_operations",
      "seat_operations",
    ])
      expect(Number(before[key])).toBe(0);
    const target = `/pt-hub/settings/billing${suffix}`;
    // Normal login with the existing redirect parameter avoids visiting onboarding.
    await page.goto(`/login?redirect=${encodeURIComponent(target)}`);
    await page.getByLabel("Email", { exact: true }).fill(coach.email);
    await page.getByLabel("Password", { exact: true }).fill(coach.password);
    await clickVisibleEnabledSignInButton(page);
    await waitForAuthSessionReady(page);
    await waitForBootstrapResolved(page);
    await expect(
      page.getByRole("button", { name: "Start subscription", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Your 14-day Growth trial begins when you create your first workspace.",
      ),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(
      `/pt-hub/settings/billing${suffix ? "/" : ""}`,
    );
    if (suffix) expect(new URL(page.url()).search).toBe("?anything=preserved");
    // A reload also exercises the already-authenticated bootstrap path.
    await page.reload();
    await waitForBootstrapResolved(page);
    await expect(
      page.getByRole("button", { name: "Start subscription", exact: true }),
    ).toBeVisible();
    const afterBilling = await snapshot(coach.userId);
    await info.attach("billing-side-effects", {
      contentType: "application/json",
      body: JSON.stringify({
        billingRendered: true,
        changedFields: Object.keys(before).filter(
          (key) =>
            JSON.stringify(before[key]) !== JSON.stringify(afterBilling[key]),
        ),
        counts: Object.fromEntries(
          [
            "workspaces",
            "subscriptions",
            "trials",
            "overrides",
            "checkouts",
            "operations",
            "plan_operations",
            "seat_operations",
            "preferences",
            "hub_profiles",
            "hub_settings",
          ].map((key) => [
            key,
            { before: before[key], after: afterBilling[key] },
          ]),
        ),
      }),
    });
    expect(afterBilling).toEqual(before);
    // This existing destination may initialize profile defaults on mount; the
    // read-only Billing contract is measured before intentionally visiting it.
    await page.goto("/pt-hub/clients");
    await expect(page).toHaveURL(/\/pt\/onboarding\/workspace$/);
    const afterGuard = await snapshot(coach.userId);
    expect(Number(afterGuard.workspaces)).toBe(0);
    expect(Number(afterGuard.subscriptions)).toBe(0);
    await info.attach("existing-onboarding-initialization", {
      contentType: "application/json",
      body: JSON.stringify({
        changedFields: Object.keys(afterBilling).filter(
          (key) =>
            JSON.stringify(afterBilling[key]) !==
            JSON.stringify(afterGuard[key]),
        ),
        preferencesDelta:
          Number(afterGuard.preferences) - Number(afterBilling.preferences),
        hubProfilesDelta:
          Number(afterGuard.hub_profiles) - Number(afterBilling.hub_profiles),
        hubSettingsDelta:
          Number(afterGuard.hub_settings) - Number(afterBilling.hub_settings),
      }),
    });
  });
}

test("unauthenticated Billing keeps the login gate", async ({ page }) => {
  await page.goto("/pt-hub/settings/billing");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("client cannot enter PT Billing", async ({ page }) => {
  expect(await seedAuthSmokeStates()).toBeTruthy();
  await signInWithEmail(
    page,
    authSmokeFixtures.clientNoWorkspace.email,
    authSmokeFixtures.clientNoWorkspace.password,
  );
  await page.goto("/pt-hub/settings/billing");
  await waitForBootstrapResolved(page);
  await expect(page).toHaveURL(/\/app\/home$/);
  await expect(
    page.getByRole("button", { name: "Start subscription", exact: true }),
  ).toHaveCount(0);
});
