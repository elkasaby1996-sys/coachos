import { createHmac, randomUUID } from "node:crypto";
import { expect, type Page, type BrowserContext } from "@playwright/test";
import { seedEntitlementCoach } from "./account-entitlement-seeds";
import { pgQuery } from "./auth-seeds";
import { trackRpcReads } from "./rpc-readiness";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./test-helpers";
import { handleSeatQuantity } from "../../../supabase/functions/_shared/billing-seat-quantity";
import { handlePlanChange } from "../../../supabase/functions/_shared/billing-plan-change";
import {
  handleBillingWebhook,
  type BillingDependencies,
} from "../../../supabase/functions/_shared/billing-handlers";
import type { SubscriptionSnapshot } from "../../../supabase/functions/_shared/lemon-squeezy";
const sql = (v: unknown) =>
  v === null
    ? "null"
    : `'${(typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/'/g, "''")}'`;
const functions = new Set([
  "billing_seat_quantity_context",
  "preview_billing_seat_quantity",
  "begin_billing_seat_quantity",
  "begin_cancel_billing_seat_quantity",
  "fail_billing_seat_quantity",
  "billing_plan_change_context",
  "preview_billing_plan_change",
  "begin_billing_plan_change",
  "begin_cancel_billing_plan_change",
  "finish_billing_plan_change",
  "fail_billing_plan_change",
  "get_billing_provider_store",
  "record_billing_webhook_delivery",
  "reconcile_billing_provider_subscription",
  "get_billing_reconciliation_result",
]);
export async function planChangeFixture(
  page: Page,
  context: BrowserContext,
  scope: string,
  plan = "launch",
  cadence = "monthly",
  processor: "card" | "paypal" = "card",
  seatCapable = false,
) {
  const waitForReads = trackRpcReads(page);
  const coach = await seedEntitlementCoach(`plan-${scope}`, true);
  await pgQuery(`insert into public.billing_provider_variant_mappings(plan_version_id,cadence,environment,provider_store_id,provider_product_id,provider_variant_id,provider_price_id,currency_code,unit_amount_minor,renewal_interval_unit,renewal_interval_quantity,status,verified_at)
    select p.id,c.cadence,'test','99001','99002',(99010+row_number() over(order by p.plan_key,c.cadence))::text,(99110+row_number() over(order by p.plan_key,c.cadence))::text,'USD',case c.cadence when 'annual' then p.annual_price_minor else p.monthly_price_minor end,case c.cadence when 'annual' then 'year' else 'month' end,1,'active',now()
    from public.commercial_plan_versions p cross join(values('monthly'),('annual'))c(cadence) where p.status='active' and p.plan_key in ('launch','growth','scale') on conflict do nothing`);
  const mappings = await pgQuery<{
    id: string;
    plan_version_id: string;
    plan_key: string;
    cadence: string;
    provider_variant_id: string;
    provider_price_id: string;
  }>(
    `select m.*,p.plan_key from public.billing_provider_variant_mappings m join public.commercial_plan_versions p on p.id=m.plan_version_id where m.environment='test' and m.status='active'`,
  );
  if (seatCapable)
    await pgQuery(`insert into public.billing_quantity_price_contracts(variant_mapping_id,addon_version_id,status,pricing_scheme,base_quantity,normalized_price_contract,price_contract_sha256,verified_at)
    select m.id,a.id,'active','graduated',1,j.contract,encode(extensions.digest(j.contract::text,'sha256'),'hex'),now()
    from public.billing_provider_variant_mappings m cross join public.commercial_addon_versions a cross join lateral (
      select jsonb_build_object('price_id',m.provider_price_id,'variant_id',m.provider_variant_id,'category','subscription','scheme','graduated','usage_aggregation',null,'setup_fee_enabled',false,'setup_fee',null,'package_size',1,'trial_interval_unit',null,'trial_interval_quantity',null,'renewal_interval_unit',m.renewal_interval_unit,'renewal_interval_quantity',1,
        'tiers',jsonb_build_array(jsonb_build_object('last_unit',1,'unit_price',m.unit_amount_minor,'fixed_fee',0,'unit_price_decimal',null),jsonb_build_object('last_unit','inf','unit_price',case m.cadence when 'monthly' then a.monthly_unit_amount_minor else a.annual_unit_amount_minor end,'fixed_fee',0,'unit_price_decimal',null))) contract
    ) j where m.environment='test' and m.status='active' and a.status='active' on conflict do nothing`);
  const mapping = mappings.find(
    (m) => m.plan_key === plan && m.cadence === cadence,
  )!;
  const sid = String(
    Number.parseInt(randomUUID().replace(/-/g, "").slice(0, 12), 16),
  );
  const created = new Date(Date.now() - 86_400_000).toISOString(),
    renews = new Date(Date.now() + 30 * 86_400_000).toISOString();
  let snapshot: SubscriptionSnapshot = {
    provider: "lemonsqueezy",
    environment: "test",
    store_id: "99001",
    customer_id: sid,
    subscription_id: sid,
    product_id: "99002",
    variant_id: mapping.provider_variant_id,
    price_id: mapping.provider_price_id,
    order_id: sid,
    order_item_id: sid,
    first_subscription_item_id: sid,
    quantity: 1,
    status: "active",
    cancelled: false,
    renews_at: renews,
    ends_at: null,
    trial_ends_at: null,
    created_at: created,
    updated_at: created,
    payment_processor: processor,
  };
  await pgQuery(`begin;
    update public.account_subscriptions set status='canceled',canceled_at=now(),status_changed_at=now() where billing_account_id=(select id from public.billing_accounts where owner_user_id=${sql(coach.userId)}) and status in ('active','trialing');
    insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at) select id,${sql(mapping.plan_version_id)},'paid','active','billing_provider',${sql(created)},${sql(renews)} from public.billing_accounts where owner_user_id=${sql(coach.userId)};
    insert into public.billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id) select id,'lemonsqueezy','test','99001',${sql(sid)} from public.billing_accounts where owner_user_id=${sql(coach.userId)};
    insert into public.billing_provider_subscriptions(billing_account_id,account_subscription_id,variant_mapping_id,provider,environment,provider_store_id,provider_customer_id,provider_subscription_id,provider_order_id,provider_order_item_id,provider_product_id,provider_variant_id,provider_price_id,first_subscription_item_id,quantity,provider_status,provider_cancelled,provider_renews_at,provider_created_at,provider_updated_at,latest_snapshot_sha256,last_reconciled_at,reconciliation_status)
    select a.id,s.id,${sql(mapping.id)},'lemonsqueezy','test','99001',${sql(sid)},${sql(sid)},${sql(sid)},${sql(sid)},'99002',${sql(mapping.provider_variant_id)},${sql(mapping.provider_price_id)},${sql(sid)},1,'active',false,${sql(renews)},${sql(created)},${sql(created)},repeat('0',64),now(),'processed' from public.billing_accounts a join public.account_subscriptions s on s.billing_account_id=a.id where a.owner_user_id=${sql(coach.userId)} and s.status='active';commit;`);
  const serviceRpc = async (name: string, args: Record<string, unknown>) => {
    if (!functions.has(name)) throw new Error("Unexpected fixture RPC");
    const rows = await pgQuery<{ value: unknown }>(
      `select public.${name}(${Object.entries(args)
        .map(([k, v]) => `${k}=>${sql(v)}`)
        .join(",")}) as value`,
    );
    return rows[0]?.value;
  };
  // Preserve the production safe SQL error boundary in the injected fixture.
  const { BillingError } =
    await import("../../../supabase/functions/_shared/lemon-squeezy");
  const safeRpc: typeof serviceRpc = async (name, args) => {
    try {
      return await serviceRpc(name, args);
    } catch (error) {
      const match = String(error).match(
        /BILLING_(?:PLAN_CHANGE|SEAT_QUANTITY)_[A-Z_]+/,
      );
      if (match)
        throw new BillingError(
          match[0],
          match[0] === "BILLING_PLAN_CHANGE_OWNER_REQUIRED" ? 403 : 409,
        );
      throw error;
    }
  };
  let patches = 0;
  let principal = coach.userId;
  const deps: BillingDependencies = {
    authenticate: async () => ({ id: principal }),
    serviceRpc: safeRpc,
    ownerRpc: () => async (name) => {
      if (
        ![
          "get_my_billing_plan_change_state",
          "get_my_billing_seat_quantity_state",
        ].includes(name)
      )
        throw new Error("Unexpected owner RPC");
      const rows = await pgQuery<{ value: unknown }>(
        `with identity as materialized (select set_config('request.jwt.claim.sub',${sql(coach.userId)},true)) select public.${name}() as value from identity`,
      );
      return rows.find((r) => r.value)?.value;
    },
    config: () => ({
      environment: "test",
      appBaseUrl: "http://local.test",
      webhookSecret: "plan-fixture",
      provider: {
        createCheckout: async () => {
          throw new Error("unused");
        },
        retrieveSubscription: async () => ({ ...snapshot }),
        retrieveSubscriptionItem: async () => ({
          item_id: snapshot.first_subscription_item_id,
          subscription_id: snapshot.subscription_id,
          price_id: snapshot.price_id,
          quantity: snapshot.quantity,
          is_usage_based: false,
          created_at: snapshot.created_at,
          updated_at: snapshot.updated_at,
        }),
        updateSubscriptionItemQuantity: async (_id, quantity) => {
          patches++;
          snapshot = {
            ...snapshot,
            quantity,
            updated_at: new Date(
              Math.max(Date.now() + 1000, Date.parse(snapshot.updated_at) + 1),
            ).toISOString(),
          };
          return {
            item_id: snapshot.first_subscription_item_id,
            subscription_id: snapshot.subscription_id,
            price_id: snapshot.price_id,
            quantity,
            is_usage_based: false,
            created_at: snapshot.created_at,
            updated_at: snapshot.updated_at,
          };
        },
        updateSubscriptionVariant: async (_id, variant) => {
          patches++;
          const target = mappings.find(
            (m) => m.provider_variant_id === variant,
          )!;
          snapshot = {
            ...snapshot,
            variant_id: variant,
            price_id: target.provider_price_id,
            updated_at: new Date(Date.now() + 1000).toISOString(),
          };
          return snapshot;
        },
        listSubscriptionInvoices: async () => [],
      },
    }),
  };
  const actions: Record<string, "preview" | "apply" | "cancel" | "refresh"> = {
    "billing-preview-plan-change": "preview",
    "billing-change-subscription-plan": "apply",
    "billing-cancel-scheduled-plan-change": "cancel",
    "billing-refresh-plan-change": "refresh",
  };
  for (const [endpoint, action] of Object.entries(actions))
    await context.route(`**/functions/v1/${endpoint}`, async (route) => {
      const result = await handlePlanChange(
        new Request("http://local.test", {
          method: "POST",
          headers: { authorization: "Bearer fake" },
          body: route.request().postData(),
        }),
        deps,
        action,
      );
      await route.fulfill({
        status: result.status,
        headers: Object.fromEntries(result.headers),
        body: await result.text(),
      });
    });
  for (const [endpoint, action] of Object.entries({
    "billing-preview-coach-seat-change": "preview",
    "billing-change-coach-seat-quantity": "apply",
    "billing-cancel-scheduled-seat-change": "cancel",
    "billing-refresh-coach-seat-change": "refresh",
  } as const))
    await context.route(`**/functions/v1/${endpoint}`, async (route) => {
      const result = await handleSeatQuantity(
        new Request("http://local.test", {
          method: "POST",
          headers: { authorization: "Bearer fake" },
          body: route.request().postData(),
        }),
        deps,
        action,
      );
      await route.fulfill({
        status: result.status,
        headers: Object.fromEntries(result.headers),
        body: await result.text(),
      });
    });
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  // Navigation completion does not mean the lazy billing panel has its state.
  // Start the UI assertion budget only after the real canonical read completes.
  const planState = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/rest/v1/rpc/get_my_billing_plan_change_state",
  );
  await page.goto("/pt-hub/settings/billing");
  const response = await planState;
  expect(response.ok()).toBe(true);
  await response.finished();
  await expect(
    page.getByRole("button", { name: "Change plan", exact: true }),
  ).toBeVisible();
  await waitForReads();
  const planAction = async (
    action: "apply" | "refresh" | "cancel",
    buttonName: string,
  ) => {
    const endpoint = {
      apply: "billing-change-subscription-plan",
      refresh: "billing-refresh-plan-change",
      cancel: "billing-cancel-scheduled-plan-change",
    }[action];
    // The action response precedes the panel's canonical refetches. Await each
    // domain response before starting the existing ready-control assertion.
    await Promise.all([
      ...[
        `/functions/v1/${endpoint}`,
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
      page.getByRole("button", { name: buttonName, exact: true }).click(),
    ]);
    await waitForReads();
    if (action === "apply") {
      // The closing Radix dialog keeps the page aria-hidden until teardown.
      // Await it before querying page controls, even after canonical refetches.
      await page.locator('[data-ui="dialog"]').waitFor({ state: "detached" });
    }
    await expect(
      page.getByRole("button", { name: "Refresh plan change", exact: true }),
    ).toBeEnabled();
  };
  const seatAction = async (
    action: "apply" | "refresh" | "cancel",
    buttonName: string,
  ) => {
    const endpoint = {
      apply: "billing-change-coach-seat-quantity",
      refresh: "billing-refresh-coach-seat-change",
      cancel: "billing-cancel-scheduled-seat-change",
    }[action];
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/functions/v1/${endpoint}`,
    );
    const canonical = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/rest/v1/rpc/get_my_billing_seat_quantity_state",
    );
    await Promise.all([
      submitted.then(async (response) => {
        expect(response.ok()).toBe(true);
        await response.finished();
      }),
      canonical.then(async (response) => {
        expect(response.ok()).toBe(true);
        await response.finished();
      }),
      ...[
        "get_my_effective_account_entitlements",
        "get_my_account_capacity_snapshot",
      ].map(async (name) => {
        const response = await page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === `/rest/v1/rpc/${name}`,
        );
        expect(response.ok()).toBe(true);
        await response.finished();
      }),
      page.getByRole("button", { name: buttonName, exact: true }).click(),
    ]);
    await waitForReads();
    // Check the ready control after all canonical transport has settled.
    await expect(
      page.getByRole("button", { name: "Refresh coach seats", exact: true }),
    ).toBeEnabled();
  };
  return {
    coach,
    cancelScheduledPlanChange: () =>
      planAction("cancel", "Cancel scheduled change"),
    refreshSeats: () => seatAction("refresh", "Refresh coach seats"),
    scheduleSeatReduction: () =>
      seatAction("apply", "Confirm scheduled reduction"),
    cancelSeatReduction: () =>
      seatAction("cancel", "Cancel scheduled reduction"),
    async previewSeats(target: number) {
      await page
        .getByLabel("Additional coach seats", { exact: true })
        .selectOption(String(target));
      const previewed = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname ===
            "/functions/v1/billing-preview-coach-seat-change",
      );
      await page
        .getByRole("button", { name: "Preview seat change", exact: true })
        .click();
      await (await previewed).finished();
    },
    async buySeats(target: number) {
      await this.previewSeats(target);
      await seatAction("apply", "Confirm seat purchase");
      await expect(
        page
          .locator("#coach-seats")
          .getByText("Awaiting verified payment", { exact: false }),
      ).toBeVisible();
    },
    async addSeatCommitments(kind: "active" | "pending", quantity: number) {
      for (let n = 0; n < quantity; n++) {
        const id = randomUUID(),
          email = `seat-${id}@example.test`;
        if (kind === "pending")
          await pgQuery(
            `insert into public.workspace_member_invites(id,workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at) values(${sql(id)},${sql(coach.workspaceId)},${sql(email)},'coach',${sql(id)},'pending',${sql(coach.userId)},now()+interval '1 day')`,
          );
        else
          await pgQuery(
            `begin; insert into auth.users(id,email) values(${sql(id)},${sql(email)}); insert into public.workspace_members(workspace_id,user_id,role,status) values(${sql(coach.workspaceId)},${sql(id)},'coach','active'); commit;`,
          );
      }
    },
    async revokeSeatInvites() {
      await pgQuery(
        `update public.workspace_member_invites set status='revoked' where workspace_id=${sql(coach.workspaceId)} and status='pending'`,
      );
    },
    async reserveSeats(quantity: number) {
      const op = randomUUID();
      const rows = await pgQuery<{
        value: { reservationId: string; granted: boolean };
      }>(
        `select public.reserve_account_capacity((select id from public.billing_accounts where owner_user_id=${sql(coach.userId)}),'coach_seats',${quantity},${sql(op)},'operation',${sql("operation:" + op)},null,'pgtap',now()+interval '2 minutes') as value`,
      );
      return rows[0]!.value;
    },
    denyActor: () => {
      principal = randomUUID();
    },
    patches: () => patches,
    snapshot: () => snapshot,
    async preview(target: string, frequency = "monthly") {
      await page
        .getByRole("button", { name: "Change plan", exact: true })
        .click();
      await page
        .getByLabel("Target plan", { exact: true })
        .selectOption(target);
      await page
        .getByLabel("Target billing frequency", { exact: true })
        .selectOption(frequency);
      const previewed = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname ===
            "/functions/v1/billing-preview-plan-change",
      );
      await page
        .getByRole("button", { name: "Preview plan change", exact: true })
        .click();
      // Both successful previews and expected denials have UI assertions in
      // callers. Start those assertions after the response body arrives.
      await (await previewed).finished();
    },
    async apply() {
      await page
        .getByRole("button", { name: "Review and confirm", exact: true })
        .click();
      await planAction("apply", "Confirm plan change");
    },
    async payment(paid = true, reason = "updated") {
      snapshot = {
        ...snapshot,
        status: paid ? "active" : "past_due",
        updated_at: new Date(Date.now() + 2000).toISOString(),
      };
      const event = paid
        ? "subscription_payment_success"
        : "subscription_payment_failed";
      const body = JSON.stringify({
        meta: { event_name: event },
        data: {
          type: "subscription-invoices",
          id: sid,
          attributes: {
            store_id: "99001",
            subscription_id: sid,
            customer_id: sid,
            test_mode: true,
            billing_reason: reason,
            status: paid ? "paid" : "pending",
            created_at: new Date(Date.now() + 1000).toISOString(),
            updated_at: new Date(Date.now() + 2000).toISOString(),
          },
        },
      });
      const response = await handleBillingWebhook(
        new Request("http://local.test", {
          method: "POST",
          body,
          headers: {
            "x-event-name": event,
            "x-signature": createHmac("sha256", "plan-fixture")
              .update(body)
              .digest("hex"),
          },
        }),
        deps,
      );
      expect(response.status).toBe(200);
      await planAction("refresh", "Refresh plan change");
    },
    async reserve(quantity: number) {
      const op = randomUUID();
      const rows = await pgQuery<{
        value: { reservationId: string; granted: boolean };
      }>(
        `select public.reserve_account_capacity((select id from public.billing_accounts where owner_user_id=${sql(coach.userId)}),'counted_clients',${quantity},${sql(op)},'operation',${sql("operation:" + op)},null,'pgtap',now()+interval '2 minutes') as value`,
      );
      return rows[0]!.value;
    },
    async release(id: string) {
      await pgQuery(
        `select public.release_account_capacity_reservation(${sql(id)},'pgtap')`,
      );
    },
  };
}
