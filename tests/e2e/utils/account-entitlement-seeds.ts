import { randomUUID } from "node:crypto";
import { createAuthSmokeFixtures } from "./auth-fixtures";
import { ensureUser, pgQuery } from "./auth-seeds";

export async function seedEntitlementCoach(
  scope: string,
  complimentary = false,
) {
  const api = new URL(
    process.env.E2E_SUPABASE_API_URL?.trim() || "http://127.0.0.1:54321",
  );
  if (!["127.0.0.1", "localhost"].includes(api.hostname))
    throw new Error("Commercial fixtures require local Supabase.");
  const fixture = createAuthSmokeFixtures(
    `${process.env.REPSYNC_E2E_RUN_ID}:${process.env.TEST_PARALLEL_INDEX}:price02:${scope}:${randomUUID()}`,
  ).ptComplete;
  const userId = await ensureUser(fixture);
  await pgQuery(`insert into public.pt_profiles(user_id,workspace_id,full_name,display_name,onboarding_completed_at)
    values('${userId}',null,'Commercial test coach','Commercial test coach',now());`);
  if (complimentary) {
    // Emulate the migration's pre-trigger beta state without disabling any
    // shared trigger or changing another worker's rows. Actual backfill is pgTAP-tested.
    await pgQuery(`
      select public.ensure_commercial_billing_account('${userId}','legacy_backfill');
      insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
      select a.id,p.id,'complimentary','active','legacy_beta_backfill'
      from public.billing_accounts a cross join public.commercial_plan_versions p
      where a.owner_user_id='${userId}' and p.plan_key='scale' and p.version=1 and p.status='active';
      insert into public.workspaces(id,name,owner_user_id) values('${fixture.workspaceId}','Commercial beta workspace','${userId}');
    `);
  }
  return { ...fixture, userId };
}
