import { createAuthSmokeFixtures } from "./utils/auth-fixtures";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { ensureUser, pgQuery } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./utils/test-helpers";
test.describe.configure({ mode: "parallel" });
async function fixture(page: Page, scope: string, status = "active") {
  const coach = await seedEntitlementCoach(`access-${scope}`, true);
  const templateId = randomUUID();
  await pgQuery(`insert into public.workout_templates(id,workspace_id,name) values('${templateId}','${coach.workspaceId}','Existing delivery');
 update public.account_subscriptions set status='${status}',status_changed_at=now(),restricted_at=case when '${status}'='restricted' then now() end,expired_at=case when '${status}'='expired' then now() end where billing_account_id=(select id from public.billing_accounts where owner_user_id='${coach.userId}');`);
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  return { ...coach, templateId };
}
async function changeStatus(
  userId: string,
  status: "active" | "restricted" | "expired",
) {
  await pgQuery(
    `update public.account_subscriptions set status='${status}',status_changed_at=now(),restricted_at=case when '${status}'='restricted' then now() else restricted_at end,expired_at=case when '${status}'='expired' then now() else expired_at end where billing_account_id=(select id from public.billing_accounts where owner_user_id='${userId}');`,
  );
}
async function editTemplate(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const modulePath = "/src/lib/supabase.ts";
    const { supabase } = await import(modulePath);
    const { error } = await supabase
      .from("workout_templates")
      .update({ name: "Updated existing delivery" })
      .eq("id", id);
    return error ? { message: error.message, details: error.details } : null;
  }, id);
}
test("grace preserves existing delivery and blocks business edits", async ({
  page,
}, info) => {
  const coach = await fixture(page, info.testId, "grace");
  await page.goto("/pt-hub");
  await expect(
    page.getByText("Existing client delivery remains available.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(await editTemplate(page, coach.templateId)).toBeNull();
  await page.goto("/pt-hub/profile");
  await expect(page.locator("fieldset[disabled]")).toHaveCount(1);
  const rows = await pgQuery<{ name: string }>(
    `select name from public.workout_templates where id='${coach.templateId}'`,
  );
  expect(rows[0].name).toBe("Updated existing delivery");
});
test("read only permits browsing and denies direct mutation without data loss", async ({
  page,
}, info) => {
  const coach = await fixture(page, info.testId, "restricted");
  await page.goto("/pt-hub");
  await expect(
    page.getByText("Your account is read only.", { exact: false }),
  ).toBeVisible();
  expect((await editTemplate(page, coach.templateId))?.message).toBe(
    "ACCOUNT_ACCESS_READ_ONLY",
  );
  const rows = await pgQuery<{ name: string }>(
    `select name from public.workout_templates where id='${coach.templateId}'`,
  );
  expect(rows[0].name).toBe("Existing delivery");
  await page.goto("/pt-hub/settings/billing");
  await expect(
    page.getByRole("button", { name: "Review commitments" }),
  ).toBeEnabled();
});
test("expired owner has recovery shell and restored access resumes normal UI", async ({
  page,
}, info) => {
  const coach = await fixture(page, info.testId, "expired");
  await page.goto("/pt-hub");
  await expect(
    page.getByRole("heading", { name: "Recover your coaching access" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("access-recovery-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByRole("link", { name: "Billing and recovery", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review commitments" }),
  ).toBeEnabled();
  await changeStatus(coach.userId, "active");
  await page.goto("/pt-hub");
  await expect(page.getByTestId("pt-hub-page")).toBeVisible();
  expect(await editTemplate(page, coach.templateId)).toBeNull();
});
test("public availability changes without changing publication preference", async ({
  page,
}, info) => {
  const coach = await fixture(page, info.testId);
  const slug = `access-${randomUUID().slice(0, 8)}`;
  await pgQuery(`insert into public.pt_hub_profiles(user_id,slug,is_published,marketplace_visible) values('${coach.userId}','${slug}',true,true) on conflict(user_id) do update set slug=excluded.slug,is_published=true,marketplace_visible=true;
 insert into public.pt_hub_settings(user_id,profile_visibility) values('${coach.userId}','listed') on conflict(user_id) do update set profile_visibility='listed';`);
  async function availability() {
    return page.evaluate(async (slug) => {
      const modulePath = "/src/lib/supabase.ts";
      const { supabase } = await import(modulePath);
      const { data, error } = await supabase.rpc(
        "get_public_commercial_coach_profiles",
        { p_slug: slug },
      );
      if (error) throw new Error("Public read failed");
      return data.length;
    }, slug);
  }
  expect(await availability()).toBe(1);
  await changeStatus(coach.userId, "restricted");
  expect(await availability()).toBe(0);
  expect(
    (
      await pgQuery<{ is_published: boolean }>(
        `select is_published from public.pt_hub_profiles where user_id='${coach.userId}'`,
      )
    )[0].is_published,
  ).toBe(true);
  await changeStatus(coach.userId, "active");
  expect(await availability()).toBe(1);
});
test("expired personal account does not block a full shared workspace", async ({
  page,
}, info) => {
  const coach = await fixture(page, info.testId, "expired");
  const other = await seedEntitlementCoach(`shared-${info.testId}`, true);
  await pgQuery(
    `insert into public.workspace_members(workspace_id,user_id,role,status) values('${other.workspaceId}','${coach.userId}','admin','active');`,
  );
  const result = await page.evaluate(async (workspaceId) => {
    const modulePath = "/src/features/commercial-access/access-api.ts";
    const api = await import(modulePath);
    return api.getWorkspaceAccess(workspaceId);
  }, other.workspaceId);
  expect(result.accessMode).toBe("full");
  expect(result.canManageBilling).toBe(false);
  expect(result.canWriteExistingDelivery).toBe(true);
  expect(result).not.toHaveProperty("planKey");
});

test("trial recovery preserves delivery without growing the business", async ({
  page,
}, info) => {
  const coach = await fixture(page, info.testId);
  await pgQuery(`begin; update public.account_subscriptions set status='canceled',canceled_at=now(),status_changed_at=now() where billing_account_id=(select id from public.billing_accounts where owner_user_id='${coach.userId}');
 insert into public.account_subscriptions(billing_account_id,plan_version_id,trial_policy_version_id,subscription_kind,status,source,trial_started_at,trial_ends_at,trial_recovery_ends_at) select a.id,t.feature_plan_version_id,t.id,'trial','trialing','first_workspace',now()-interval '15 days',now()-interval '1 day',now()+interval '6 days' from public.billing_accounts a cross join public.commercial_trial_policy_versions t where a.owner_user_id='${coach.userId}' and t.status='active';commit;`);
  await page.goto("/pt-hub");
  await expect(
    page.getByText("Existing client delivery remains available.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(await editTemplate(page, coach.templateId)).toBeNull();
});

test("direct public application is prospect safe and creates no lead", async ({
  page,
}, info) => {
  await fixture(page, info.testId);
  const target = await seedEntitlementCoach(`prospect-${info.testId}`, true);
  const slug = `access-${randomUUID().slice(0, 8)}`;
  await pgQuery(
    `insert into public.pt_hub_profiles(user_id,slug,is_published,marketplace_visible) values('${target.userId}','${slug}',true,true);insert into public.pt_hub_settings(user_id,profile_visibility) values('${target.userId}','listed');`,
  );
  await changeStatus(target.userId, "restricted");
  const error = await page.evaluate(async (slug) => {
    const modulePath = "/src/lib/supabase.ts";
    const { supabase } = await import(modulePath);
    const { error } = await supabase.rpc("submit_public_pt_application", {
      p_slug: slug,
      p_full_name: "Prospect",
      p_phone: "",
      p_goal_summary: "Coaching",
      p_training_experience: "Beginner",
      p_package_interest_id: null,
      p_package_interest_label_snapshot: null,
    });
    return error;
  }, slug);
  expect(error.message).toBe("PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS");
  expect(JSON.stringify(error)).not.toMatch(/planKey|price|provider|past_due/);
  expect(
    (
      await pgQuery<{ count: string }>(
        `select count(*)::text as count from public.pt_hub_leads where user_id='${target.userId}'`,
      )
    )[0].count,
  ).toBe("0");
  await page.goto(`/p/${slug}`);
  await expect(
    page.getByText("This coach is not accepting new applications right now.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("client history and independent nutrition remain available after coach expiry", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`client-${info.testId}`, true);
  const identity = createAuthSmokeFixtures(
    `client-access-${info.testId}-${randomUUID()}`,
  ).clientNoWorkspace;
  const userId = await ensureUser(identity);
  const clientId = randomUUID();
  await pgQuery(
    `insert into public.clients(id,workspace_id,user_id,status,full_name,display_name,email,account_onboarding_completed_at) values('${clientId}','${coach.workspaceId}','${userId}','active','Access client','Access client','${identity.email}',now());`,
  );
  await changeStatus(coach.userId, "expired");
  await signInWithEmail(page, identity.email, identity.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await page.goto("/app/home");
  await expect(
    page.getByText("Coaching interaction is currently unavailable.", {
      exact: false,
    }),
  ).toBeVisible();
  const result = await page.evaluate(
    async ({ clientId }) => {
      const modulePath = "/src/lib/supabase.ts";
      const { supabase } = await import(modulePath);
      const { data: access, error } = await supabase.rpc(
        "get_client_coaching_access",
        { p_client_id: clientId },
      );
      if (error) throw new Error("Client summary failed");
      const independent = await supabase.from("nutrition_templates").insert({
        name: "Personal nutrition",
        workspace_id: null,
        owner_client_id: clientId,
        duration_weeks: 1,
      });
      const coached = await supabase
        .from("habit_logs")
        .insert({ client_id: clientId, log_date: "2026-09-12", steps: 100 });
      return {
        access,
        independentError: independent.error,
        coachedError: coached.error,
      };
    },
    { clientId },
  );
  expect(result.access.serviceMode).toBe("unavailable");
  expect(result.access.canReadCoachedContent).toBe(true);
  expect(result.independentError).toBeNull();
  expect(result.coachedError.message).toBe(
    "CLIENT_COACHING_INTERACTION_UNAVAILABLE",
  );
  await page.goto("/app/find-coach");
  await expect(page).toHaveURL(/find-coach/);
  await expect(
    page.getByRole("heading", { name: "Recover your coaching access" }),
  ).toHaveCount(0);
});
