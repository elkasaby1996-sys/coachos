-- PAY-03B: inspection only. No history rewrite, queue drain or retirement.
begin;

create function public.inspect_lemon_squeezy_retirement_disposition_v1(p_as_of timestamptz)
returns jsonb language sql stable security definer
set search_path=pg_catalog
as $$
with recursive subscriptions as (
  select b.*, a.status canonical_status, a.source canonical_source,
    a.cancel_at_period_end, a.current_period_ends_at, o.storage_contract,
    (b.provider_status in ('cancelled','expired')
      and b.reconciliation_status='processed' and b.reconciliation_error_code is null
      and a.source='billing_provider' and a.subscription_kind='paid'
      and a.status in ('canceled','expired')
      and o.storage_contract='lemonsqueezy.v1'
      and b.provider_ends_at is not null and isfinite(b.provider_ends_at) and b.provider_ends_at<=p_as_of
      and a.current_period_ends_at=b.provider_ends_at
      and a.current_period_started_at<b.provider_ends_at
      and (a.status='expired' and isfinite(a.expired_at) and a.expired_at<=p_as_of
        or a.status='canceled' and isfinite(a.canceled_at) and a.canceled_at<=p_as_of)
      and (b.provider_status<>'cancelled' or b.provider_cancelled)
      and (not a.cancel_at_period_end or a.current_period_ends_at<=p_as_of)) is true closed
  from public.billing_provider_subscriptions b
  left join public.account_subscriptions a on a.id=b.account_subscription_id and a.billing_account_id=b.billing_account_id
  left join public.billing_canonical_origins o on o.account_subscription_id=a.id and o.billing_account_id=a.billing_account_id
), checkouts as (
  select c.*, (c.status='completed' and exists (
    select 1 from subscriptions s where s.provider=c.provider and s.environment=c.environment
      and s.provider_subscription_id=c.completed_provider_subscription_id and s.billing_account_id=c.billing_account_id
  ) or c.status='failed' and c.provider_checkout_id is null
      and c.error_code in ('BILLING_CHECKOUT_CREATION_FAILED','BILLING_VARIANT_MAPPING_MISMATCH')) is true closed,
    -- Exact final legacy writer/constraint rule (20260916100118), not closure.
    (c.provider_checkout_id is not null and isfinite(c.provider_expires_at)
      and isfinite(c.expected_expires_at) and floor(extract(epoch from c.provider_expires_at))=
        floor(extract(epoch from c.expected_expires_at))) is true verified_creation
  from public.billing_checkout_attempts c
), operations as (
  select 'planOperations' category, billing_account_id, status, provider_requested_at, provider_applied_at,
    payment_confirmed_at, error_code, billing_provider_subscription_id,
    (source_cadence in ('monthly','annual') and target_cadence in ('monthly','annual')
      and change_kind in ('tier_upgrade','cadence_upgrade','combined_upgrade','tier_downgrade','cadence_downgrade','combined_downgrade')
      and effective_timing in ('immediate','period_end') and proration_mode in ('invoice_immediately','disable_prorations')
      and provider_payment_processor='card') is true known_domain
  from public.billing_plan_change_operations
  union all
  select 'seatOperations', billing_account_id, status, provider_requested_at, provider_applied_at,
    payment_confirmed_at, error_code, billing_provider_subscription_id,
    (direction in ('increase','reduction') and effective_timing in ('immediate','period_end')
      and proration_mode in ('invoice_immediately','disable_prorations')) is true
  from public.billing_seat_quantity_operations
), webhooks as (
  select d.*, (d.processing_status in ('processed','ignored') and d.processed_at is not null
    and (d.last_error_code is null or d.processing_status='ignored'
      and d.last_error_code in ('BILLING_WEBHOOK_UNSUPPORTED_EVENT','BILLING_RECONCILIATION_STALE'))) is true drained,
    (d.object_type='subscription-invoices' or d.event_name in
      ('subscription_payment_success','subscription_payment_failed','subscription_payment_recovered')) is true invoice_observation,
    (jsonb_typeof(d.normalized_payload->'status')='string' and
      d.normalized_payload->>'status' in ('pending','paid','void','refunded','partial_refund')) is true known_invoice_status,
    -- Closed admission provenance: handleBillingWebhook records verified resource IDs;
    -- BOTH installed finish_billing_plan_change writers instead record subscription_id.
    -- API invoice admission emits only subscription_payment_success. Exclude its
    -- entire overlapping shape, even genuine success webhooks with colliding IDs.
    -- Only the remaining signed-ingress shape can retain actual invoice identity.
    -- Fingerprints bind admission scope; they are not a substitute for provenance.
    (d.provider='lemonsqueezy' and d.environment in ('test','live')
      and d.event_name in ('subscription_payment_success','subscription_payment_failed','subscription_payment_recovered')
      and d.object_type='subscription-invoices' and d.object_id ~ '^[1-9][0-9]*$'
      and d.provider_subscription_id ~ '^[1-9][0-9]*$'
      and (d.event_name in ('subscription_payment_failed','subscription_payment_recovered')
        or d.object_id<>d.provider_subscription_id)
      and d.normalized_payload->>'subscription_id'=d.provider_subscription_id
      and d.normalized_payload->>'customer_id'=d.provider_customer_id
      and d.normalized_payload->'test_mode'=to_jsonb(d.environment='test')
      and d.delivery_fingerprint=encode(extensions.digest(
        d.environment||chr(10)||d.event_name||chr(10)||d.payload_sha256,'sha256'),'hex')
      and exists(select 1 from subscriptions s where s.provider=d.provider and s.environment=d.environment
        and s.provider_subscription_id=d.provider_subscription_id and s.provider_customer_id=d.provider_customer_id
        and s.provider_store_id=d.normalized_payload->>'store_id')) is true trusted_invoice_identity
  from public.billing_provider_webhook_deliveries d
), canonical as (
  select a.*, o.storage_contract,
    exists(select 1 from subscriptions s where s.account_subscription_id=a.id) legacy_link,
    exists(select 1 from public.billing_subscriptions_v2 v where v.account_subscription_id=a.id
      and v.billing_account_id=a.billing_account_id and v.provider='paddle' and v.shadow_status='current') paddle_link
  from public.account_subscriptions a
  left join public.billing_canonical_origins o on o.account_subscription_id=a.id and o.billing_account_id=a.billing_account_id
  where a.source='billing_provider' or o.account_subscription_id is not null
    or exists(select 1 from subscriptions s where s.account_subscription_id=a.id)
    or exists(select 1 from public.billing_subscriptions_v2 v where v.account_subscription_id=a.id)
), paddle_chains as (
  -- Follow the existing same-account append-only canonical supersession contract.
  -- A repeated ID stops recursion and cannot reach a valid current authority.
  select c.id root_id,c.billing_account_id,c.id,c.status,c.superseded_at,c.superseded_by_subscription_id,
    array[c.id] path
  from canonical c where c.storage_contract='billing.v2'
    and c.source='billing_provider' and c.subscription_kind='paid'
  union all
  select w.root_id,w.billing_account_id,n.id,n.status,n.superseded_at,n.superseded_by_subscription_id,w.path||n.id
  from paddle_chains w join canonical n on n.id=w.superseded_by_subscription_id and n.billing_account_id=w.billing_account_id
  where w.status='superseded' and isfinite(w.superseded_at) and w.superseded_at<=p_as_of
    and n.storage_contract='billing.v2' and n.source='billing_provider' and n.subscription_kind='paid'
    and not n.id=any(w.path)
), valid_paddle_history as (
  select w.root_id from paddle_chains w
  join canonical a on a.id=w.id and a.billing_account_id=w.billing_account_id
  join public.billing_subscriptions_v2 v on v.account_subscription_id=w.id and v.billing_account_id=w.billing_account_id
  join public.billing_customers_v2 c on c.id=v.customer_id and c.billing_account_id=v.billing_account_id
    and c.provider=v.provider and c.environment=v.environment
  where w.status in ('active','past_due','canceled','expired') and w.superseded_at is null and w.superseded_by_subscription_id is null
    and v.provider='paddle' and v.environment in ('test','live') and v.shadow_status='current'
    and v.superseded_at is null and v.superseded_by_subscription_id is null
    and v.reconciliation_status='processed' and v.reconciliation_error_code is null
    and v.provider_status in ('active','past_due','canceled') and v.latest_evidence_id is not null
    and (w.status=v.provider_status or v.provider_status='canceled' and w.status in ('canceled','expired'))
    and a.current_period_started_at=v.current_period_started_at and a.current_period_ends_at=v.current_period_ends_at
    and c.identity_status='current' and c.identity_source='verified_provider_event'
    and c.superseded_at is null and c.superseded_by_customer_id is null
    and not exists(select 1 from subscriptions s where s.account_subscription_id=any(w.path))
    and not exists(select 1 from public.billing_subscriptions_v2 h where h.account_subscription_id=any(w.path)
      and (h.billing_account_id=w.billing_account_id and h.provider=v.provider and h.environment=v.environment
        and (h.shadow_status='current' and h.id=v.id or h.shadow_status='superseded' and isfinite(h.superseded_at)
          and h.superseded_by_subscription_id=v.id)) is not true)
), unknowns as (
  select 1 from subscriptions where (provider='lemonsqueezy' and environment in ('test','live')
    and provider_status in ('active','paused','past_due','unpaid','cancelled','expired')
    and reconciliation_status in ('processed','manual_review')) is not true
    or account_subscription_id is null or canonical_status is null or storage_contract is distinct from 'lemonsqueezy.v1'
    or reconciliation_status='processed' and reconciliation_error_code is not null
    or provider_status in ('cancelled','expired') and not closed
  union all select 1 from checkouts where (provider='lemonsqueezy' and environment in ('test','live')
    and cadence in ('monthly','annual') and status in ('creating','ready','completed','failed','ambiguous','expired')
    and (error_code is null or error_code in ('BILLING_CHECKOUT_CREATION_FAILED','BILLING_CHECKOUT_CREATION_AMBIGUOUS',
      'BILLING_CHECKOUT_EXPIRED','BILLING_VARIANT_MAPPING_MISMATCH'))) is not true
    or status='completed' and not closed
    or provider_checkout_id is not null and not verified_creation
  union all select 1 from operations where not known_domain or (status in
    ('requested','provider_pending','awaiting_payment','scheduled','cancel_pending','completed','canceled','failed','ambiguous','manual_review')) is not true
    or error_code is not null and (category='planOperations' and error_code in
      ('BILLING_PLAN_CHANGE_PROVIDER_FAILED','BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS','BILLING_PLAN_CHANGE_MANUAL_REVIEW',
       'BILLING_PLAN_CHANGE_PAYMENT_FAILED','BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE')
      or category='seatOperations' and error_code in
      ('BILLING_SEAT_QUANTITY_PROVIDER_FAILED','BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS','BILLING_SEAT_QUANTITY_MANUAL_REVIEW',
       'BILLING_SEAT_QUANTITY_PAYMENT_FAILED','BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT','BILLING_SEAT_QUANTITY_AWAITING_PAYMENT')) is not true
    or not exists(select 1 from subscriptions s where s.id=operations.billing_provider_subscription_id
      and s.billing_account_id=operations.billing_account_id)
  union all select 1 from webhooks where (provider='lemonsqueezy' and environment in ('test','live')
    and processing_status in ('received','processed','ignored','deferred','failed')) is not true
    or processing_status in ('processed','ignored') and not drained
    or invoice_observation and not known_invoice_status
      and (processing_status='ignored' and drained and last_error_code='BILLING_WEBHOOK_UNSUPPORTED_EVENT') is not true
    or invoice_observation and not exists(select 1 from subscriptions s where s.provider=webhooks.provider
      and s.environment=webhooks.environment and s.provider_subscription_id=webhooks.provider_subscription_id
      and s.provider_customer_id=webhooks.provider_customer_id)
      and (processing_status='ignored' and drained and last_error_code='BILLING_WEBHOOK_UNSUPPORTED_EVENT') is not true
    or (object_type in ('subscriptions','subscription-invoices') and event_name in
      ('subscription_created','subscription_updated','subscription_cancelled','subscription_resumed','subscription_expired',
       'subscription_paused','subscription_unpaused','subscription_plan_changed','subscription_payment_success',
       'subscription_payment_failed','subscription_payment_recovered')) is not true
      and (processing_status='ignored' and drained and last_error_code='BILLING_WEBHOOK_UNSUPPORTED_EVENT') is not true
  union all select 1 from canonical c where (status in
    ('trialing','trial_recovery','active','past_due','grace','restricted','canceled','expired','superseded')
    and source='billing_provider' and subscription_kind='paid' and storage_contract in ('lemonsqueezy.v1','billing.v2')) is not true
    or storage_contract='billing.v2' and not exists(select 1 from valid_paddle_history v where v.root_id=c.id)
    or storage_contract='lemonsqueezy.v1' and not legacy_link and (status in ('canceled','expired','superseded')) is not true
  union all select 1 from public.billing_provider_variant_mappings where (provider='lemonsqueezy'
    and environment in ('test','live') and cadence in ('monthly','annual') and status in ('draft','active','retired')
    and currency_code='USD' and renewal_interval_unit in ('month','year')) is not true
  union all select 1 from public.billing_quantity_price_contracts where (status in ('draft','active','retired')
    and pricing_scheme='graduated') is not true
  union all select 1 from public.billing_provider_customers where (provider='lemonsqueezy' and environment in ('test','live')) is not true
  union all select 1 where p_as_of is null or not isfinite(p_as_of)
), counts as (
  select 1 ordinal, 'subscriptions' category, 'BLOCKED_BY_ACTIVE_SUBSCRIPTION' outcome, count(*) n from subscriptions where not closed
  union all select 2,'paymentObligations','BLOCKED_BY_PAYMENT_OBLIGATION',count(*) from (
    select 1 from subscriptions where provider_status in ('past_due','unpaid') or canonical_status in ('past_due','grace','restricted')
    union all select 1 from operations where status='awaiting_payment'
      or error_code in ('BILLING_PLAN_CHANGE_PAYMENT_FAILED','BILLING_SEAT_QUANTITY_PAYMENT_FAILED') and payment_confirmed_at is null
    union all select 1 from webhooks d where (d.event_name='subscription_payment_failed'
      or d.object_type='subscription-invoices' and d.normalized_payload->>'status' in ('pending','unpaid','past_due'))
      and not exists(select 1 from webhooks paid where paid.provider=d.provider and paid.environment=d.environment
        and d.trusted_invoice_identity and paid.trusted_invoice_identity
        and paid.object_type=d.object_type and paid.object_id=d.object_id
        and paid.provider_subscription_id=d.provider_subscription_id
        and paid.provider_customer_id is not distinct from d.provider_customer_id
        and paid.processing_status='processed' and paid.drained
        and paid.event_name in ('subscription_payment_success','subscription_payment_recovered')
        and paid.normalized_payload->>'status'='paid')
  ) debt
  union all select 3,'checkouts','BLOCKED_BY_CHECKOUT',count(*) from checkouts where not closed
  union all select 4,'planOperations','BLOCKED_BY_PLAN_OPERATION',count(*) from operations
    where category='planOperations' and ((status in ('completed','canceled','failed')) is not true or error_code like '%AMBIGUOUS%')
  union all select 5,'seatOperations','BLOCKED_BY_SEAT_OPERATION',count(*) from operations
    where category='seatOperations' and ((status in ('completed','canceled','failed')) is not true or error_code like '%AMBIGUOUS%')
  union all select 6,'webhookWork','BLOCKED_BY_WEBHOOK_RECONCILIATION',count(*) from webhooks where not drained
  union all select 7,'ambiguousDispatches','BLOCKED_BY_AMBIGUOUS_PROVIDER_DISPATCH',count(*) from (
    select 1 from checkouts where status in ('creating','ambiguous') or error_code='BILLING_CHECKOUT_CREATION_AMBIGUOUS'
      or status='failed' and not closed or status='expired' and not verified_creation
    union all select 1 from operations where status in ('provider_pending','cancel_pending','ambiguous')
      or error_code like '%AMBIGUOUS%' or status in ('requested','manual_review') and provider_requested_at is not null
  ) dispatches
  union all select 8,'manualReview','BLOCKED_BY_MANUAL_REVIEW',count(*) from (
    select 1 from subscriptions where reconciliation_status='manual_review'
    union all select 1 from operations where status='manual_review' or error_code like '%MANUAL_REVIEW%'
    union all select 1 from webhooks where processing_status='ignored' and not drained
  ) reviews
  union all select 9,'canonicalConflicts','BLOCKED_BY_CANONICAL_CONFLICT',count(*) from canonical c where
    (c.storage_contract='lemonsqueezy.v1' or c.legacy_link) and (
      (c.status in ('canceled','expired','superseded')) is not true
      or c.cancel_at_period_end and (c.current_period_ends_at is null or c.current_period_ends_at>p_as_of)
      or c.paddle_link or c.storage_contract is distinct from 'lemonsqueezy.v1')
    or c.source='billing_provider' and c.storage_contract is null
  union all select 10,'unknownStates','BLOCKED_BY_UNKNOWN_STATE',count(*) from unknowns
)
select jsonb_build_object('contract','lemon-squeezy-retirement-disposition-v1','schemaVersion',1,
  'safeToRetire',not exists(select 1 from counts where n>0),
  'outcomes',coalesce((select jsonb_agg(outcome order by ordinal) from counts where n>0),'["SAFE_TO_RETIRE"]'::jsonb),
  'blockers',(select jsonb_object_agg(category,n) from counts))
$$;

revoke all on function public.inspect_lemon_squeezy_retirement_disposition_v1(timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.inspect_lemon_squeezy_retirement_disposition_v1(timestamptz) to service_role;
comment on function public.inspect_lemon_squeezy_retirement_disposition_v1(timestamptz) is
  'PAY-03B count-only read-only gate across both LS environments. Explicit finite inspection time required. No runtime retirement authority.';
commit;
