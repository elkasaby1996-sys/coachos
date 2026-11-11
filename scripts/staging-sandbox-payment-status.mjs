// Read-only stored facts, not a runtime entitlement evaluation. Private billing
// helpers intentionally remain unavailable to the Management API query role.
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  STAGING_PROJECT,
  readBoundedStagingJson,
} from "./staging-billing-status.mjs";

export function sandboxPaymentQuery(userId) {
  if (!z.uuid().safeParse(userId).success)
    throw new Error("PAYMENT_STATUS_OWNER_INVALID");
  return `with account as (
    select id from public.billing_accounts where owner_user_id='${userId}'::uuid
  ), canonical as (
    select distinct on (s.billing_account_id) s.*
    from public.account_subscriptions s join account a on a.id=s.billing_account_id
    where s.status<>'superseded'
    order by s.billing_account_id,
      (s.status in ('trialing','trial_recovery','active','past_due','grace','restricted')) desc,
      s.created_at desc,s.id desc
  ), subscriptions as (
    select s.* from public.billing_subscriptions_v2 s join account a on a.id=s.billing_account_id
    where s.provider='paddle' and s.environment='test'
  ), checkouts as (
    select c.* from public.billing_checkouts_v2 c join account a on a.id=c.billing_account_id
    where c.provider='paddle' and c.environment='test'
  ), payments as (
    select p.* from public.billing_payment_applications_v2 p join account a on a.id=p.billing_account_id
    where p.provider='paddle' and p.environment='test'
  ), related_events as (
    select e.* from public.billing_webhook_events_v2 e
    where e.provider='paddle' and e.environment='test' and (
      e.subscription_ref in (select provider_subscription_ref from subscriptions)
      or e.resource_ref in (select provider_transaction_ref from checkouts)
      or exists(select 1 from public.billing_paddle_event_observations o join checkouts c on c.id=o.checkout_id where o.event_id=e.id)
    )
  ), applied_initial as (
    select p.id from payments p
    join subscriptions s on s.id=p.subscription_id and s.billing_account_id=p.billing_account_id
    join canonical a on a.id=s.account_subscription_id and a.billing_account_id=s.billing_account_id
    join checkouts c on c.id=p.checkout_id and c.billing_account_id=p.billing_account_id
      and c.completed_subscription_id=s.id and c.provider_transaction_ref=p.provider_transaction_ref
    join public.billing_evidence_v2 v on v.id=p.evidence_id and v.subscription_id=s.id
      and v.provider='paddle' and v.environment='test' and v.provider_transaction_ref=p.provider_transaction_ref
    join related_events e on e.id=v.event_id and e.provider_event_name='transaction.completed'
    where p.application_kind='initial_purchase' and p.operation_id is null
      and s.shadow_status='current' and s.reconciliation_status='processed'
      and a.subscription_kind='paid' and a.status='active' and a.source='billing_provider'
      and c.status='completed' and c.completed_at is not null
      and v.proof_schema='paddle-initial-purchase-v1' and v.proof_kind='transaction' and v.source_kind='webhook'
      and v.proof#>>'{observation,checkoutId}'=c.id::text
      and v.proof#>>'{observation,billingAccountId}'=s.billing_account_id::text
      and v.normalized_sha256=encode(extensions.digest(v.proof::text,'sha256'),'hex')
      and e.processing_status='processed' and exists(
        select 1 from public.billing_paddle_event_deliveries d
        join public.billing_verified_evidence_v2 r on r.id=d.verified_evidence_id
        where d.event_id=e.id and d.notification_ref=v.provider_notification_ref
          and d.raw_payload_sha256=v.raw_payload_sha256
          and r.provider='paddle' and r.environment='test' and r.source_kind='webhook'
          and r.provider_event_ref=e.provider_event_ref and r.proof_kind='event'
          and r.evidence_class='authenticated_provider'
      )
  ) select jsonb_build_object(
    'accountCount',(select count(*)::integer from account),
    'environment',(select entitlement_environment from public.billing_runtime_policy where id=1),
    'subscription',(select jsonb_build_object(
      'kind',a.subscription_kind,'status',a.status,'plan',p.plan_key,
      'includedCoachSeats',case when a.subscription_kind='trial' then t.included_coach_seats else p.included_coach_seats end,
      'maxCoachSeats',case when a.subscription_kind='trial' then t.max_coach_seats else p.max_coach_seats end,
      'approvedExtraSeats',s.approved_additional_coach_seats,
      'storedCoachSeatLimit',case when a.subscription_kind='paid' and s.id is not null
        then least(p.max_coach_seats,p.included_coach_seats+s.approved_additional_coach_seats) end,
      'currentPeriodEndsAt',a.current_period_ends_at,'cancelAtPeriodEnd',a.cancel_at_period_end
    ) from canonical a
    left join public.commercial_plan_versions p on p.id=a.plan_version_id
    left join public.commercial_trial_policy_versions t on t.id=a.trial_policy_version_id
    left join subscriptions s on s.account_subscription_id=a.id and s.shadow_status='current'),
    'seatOperations',coalesce((select jsonb_agg(jsonb_build_object(
      'status',o.status,'timing',o.effective_timing,
      'sourceExtraSeats',o.source_additional_seats,'targetExtraSeats',o.target_additional_seats,
      'effectiveAt',o.effective_at,'completedAt',o.completed_at,
      'error',case when o.error_code ~ '^[A-Z][A-Z0-9_]{0,95}$' then o.error_code when o.error_code is not null then 'UNRECOGNIZED' else null end
    ) order by o.created_at,o.id) from public.billing_operations_v2 o
      join subscriptions s on s.id=o.subscription_id and s.billing_account_id=o.billing_account_id
      where o.operation_kind='seat_quantity' and o.provider='paddle' and o.environment='test'),'[]'::jsonb),
    'providerSubscriptions',coalesce((select jsonb_agg(jsonb_build_object(
      'status',s.provider_status,'reconciliation',s.reconciliation_status,'shadow',s.shadow_status,
      'linked',s.account_subscription_id is not null,'approvedExtraSeats',s.approved_additional_coach_seats,
      'cadence',(select i.cadence from public.billing_subscription_items_v2 i where i.subscription_id=s.id and i.item_role='base_plan'),
      'error',case when s.reconciliation_error_code ~ '^[A-Z][A-Z0-9_]{0,95}$' then s.reconciliation_error_code when s.reconciliation_error_code is not null then 'UNRECOGNIZED' else null end
    ) order by s.created_at) from subscriptions s),'[]'::jsonb),
    'checkouts',coalesce((select jsonb_agg(to_jsonb(c)) from (
      select status,cadence,requested_additional_seats as "extraSeats",count(*)::integer as count
      from checkouts group by status,cadence,requested_additional_seats order by status,cadence,requested_additional_seats
    ) c),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p)) from (
      select application_kind as kind,count(*)::integer as count from payments group by application_kind order by application_kind
    ) p),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from (
      select case when provider_event_name ~ '^(transaction|subscription)\\.[a-z_]+$' then provider_event_name else 'other' end as name,
        processing_status as status,
        case when last_error_code ~ '^[A-Z][A-Z0-9_]{0,95}$' then last_error_code when last_error_code is not null then 'UNRECOGNIZED' else null end as error,
        count(*)::integer as count from related_events group by 1,2,3 order by 1,2,3
    ) e),'[]'::jsonb),
    'verifiedInitialPayments',(select count(*)::integer from applied_initial)
  ) as payment_status;`;
}

const count = z.number().int().nonnegative();
const safeWord = z.string().regex(/^[a-z][a-z_]{0,47}$/);
const errorCode = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,95}$/)
  .nullable();
const cadence = z.enum(["monthly", "annual"]);
const stateSchema = z.strictObject({
  accountCount: count,
  environment: z.literal("test"),
  subscription: z
    .strictObject({
      kind: z.enum(["trial", "paid", "complimentary", "custom"]).nullable(),
      status: safeWord,
      plan: z.enum(["launch", "growth", "scale", "custom"]).nullable(),
      includedCoachSeats: count.nullable(),
      maxCoachSeats: count.nullable(),
      approvedExtraSeats: count.nullable(),
      storedCoachSeatLimit: count.nullable(),
      cancelAtPeriodEnd: z.boolean(),
      currentPeriodEndsAt: z.string().datetime({ offset: true }).nullable(),
    })
    .nullable(),
  seatOperations: z
    .array(
      z.strictObject({
        status: safeWord,
        timing: z.enum(["immediate", "period_end"]),
        sourceExtraSeats: count,
        targetExtraSeats: count,
        effectiveAt: z.string().datetime({ offset: true }).nullable(),
        completedAt: z.string().datetime({ offset: true }).nullable(),
        error: errorCode,
      }),
    )
    .max(100),
  providerSubscriptions: z
    .array(
      z.strictObject({
        status: safeWord.nullable(),
        reconciliation: safeWord,
        shadow: safeWord,
        linked: z.boolean(),
        approvedExtraSeats: count,
        cadence: cadence.nullable(),
        error: errorCode,
      }),
    )
    .max(50),
  checkouts: z
    .array(
      z.strictObject({ status: safeWord, cadence, extraSeats: count, count }),
    )
    .max(100),
  payments: z.array(z.strictObject({ kind: safeWord, count })).max(30),
  events: z
    .array(
      z.strictObject({
        name: z
          .string()
          .regex(/^(?:(?:transaction|subscription)\.[a-z_]+|other)$/),
        status: safeWord,
        error: errorCode,
        count,
      }),
    )
    .max(100),
  verifiedInitialPayments: count,
});
export function summarizeSandboxPayment(value) {
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) throw new Error("PAYMENT_STATUS_RESPONSE_INVALID");
  const s = parsed.data;
  const current = s.providerSubscriptions.filter((p) => p.shadow === "current");
  const subscriptionPaymentVerified =
    s.accountCount === 1 &&
    s.subscription?.kind === "paid" &&
    s.subscription.status === "active" &&
    s.verifiedInitialPayments === 1 &&
    current.length === 1 &&
    current[0].status === "active" &&
    current[0].reconciliation === "processed" &&
    current[0].linked;
  return {
    ...s,
    observationBasis: "stored_records",
    runtimeEntitlementsEvaluated: false,
    subscriptionPaymentVerified,
    outcome: subscriptionPaymentVerified
      ? "paid_subscription_active"
      : s.accountCount === 0
        ? "account_missing"
        : s.checkouts.length === 0
          ? "checkout_not_started"
          : "payment_needs_review",
    // This observation does not certify renewals, later seats or recovery flows.
    fullPaymentSuiteVerified: false,
  };
}

export async function paymentReadDiagnostic(response) {
  const diagnostic = { category: "http_error" };
  try {
    const body = await readBoundedStagingJson(response, 16 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return diagnostic;
    const message = typeof body.message === "string" ? body.message : "";
    const structured =
      typeof body.code === "string" ? body.code : body.sqlstate;
    const sqlstate = /^[0-9A-Z]{5}$/.test(structured ?? "")
      ? structured
      : /\bERROR:\s+([0-9A-Z]{5}):/.exec(message)?.[1];
    // Only recognized SQLSTATEs are published: arbitrary five-character strings
    // from an untrusted response could themselves contain private information.
    const categories = {
      42501: "insufficient_privilege",
      25006: "read_only_violation",
      "42P01": "undefined_table",
      42703: "undefined_column",
      42883: "undefined_function",
      21000: "cardinality_violation",
      57014: "query_canceled",
      42601: "syntax_error",
    };
    if (Object.hasOwn(categories, sqlstate)) {
      diagnostic.category = categories[sqlstate];
      diagnostic.sqlstate = sqlstate;
      if (sqlstate === "42501") {
        const dependency =
          /permission denied for function (?:public\.)?(resolve_account_entitlements|billing_seat_effective_limit)(?:\(|\s|$)/.exec(
            message,
          )?.[1];
        if (dependency) diagnostic.dependency = dependency;
      }
    } else if (sqlstate) diagnostic.category = "database_error";
  } catch {
    /* Malformed, non-JSON, oversized and unreadable bodies stay private. */
  }
  return diagnostic;
}

export async function inspectSandboxPayment({
  env = process.env,
  transport = fetch,
} = {}) {
  const report = {
    status: "blocked",
    readOnly: true,
    project: STAGING_PROJECT,
  };
  try {
    if (
      env.STAGING_SUPABASE_PROJECT_REF !== STAGING_PROJECT ||
      env.PADDLE_ENVIRONMENT !== "sandbox"
    )
      throw new Error("PAYMENT_STATUS_TARGET_INVALID");
    const query = sandboxPaymentQuery(env.STAGING_PILOT_USER_ID);
    if (!env.SUPABASE_ACCESS_TOKEN)
      throw new Error("SUPABASE_ACCESS_TOKEN_MISSING");
    report.ownerSha256 = createHash("sha256")
      .update(env.STAGING_PILOT_USER_ID)
      .digest("hex");
    const response = await transport(
      `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/database/query/read-only`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
    );
    if (!response.ok) {
      report.httpStatus = response.status;
      report.diagnostic = await paymentReadDiagnostic(response);
      throw new Error(
        report.diagnostic.sqlstate
          ? "PAYMENT_STATUS_DATABASE_ERROR"
          : "PAYMENT_STATUS_READ_FAILED",
      );
    }
    const rows = await readBoundedStagingJson(response);
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new Error("PAYMENT_STATUS_RESPONSE_INVALID");
    report.payment = summarizeSandboxPayment(rows[0].payment_status);
    report.status = "inspected";
  } catch (error) {
    report.code = [
      "PAYMENT_STATUS_TARGET_INVALID",
      "PAYMENT_STATUS_OWNER_INVALID",
      "SUPABASE_ACCESS_TOKEN_MISSING",
      "PAYMENT_STATUS_DATABASE_ERROR",
      "PAYMENT_STATUS_READ_FAILED",
      "PAYMENT_STATUS_RESPONSE_INVALID",
    ].includes(error.message)
      ? error.message
      : "PAYMENT_STATUS_READ_FAILED";
  }
  return report;
}
