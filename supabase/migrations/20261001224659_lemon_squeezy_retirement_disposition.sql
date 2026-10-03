-- PAY-03B LS-rooted read-only disposition. Paddle finances are outside authority.
begin;
create function public.inspect_lemon_squeezy_retirement_disposition_v1(p_as_of timestamptz)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
with recursive
-- Physical LS rows are unconditional roots. Shared discovery is independent of
-- validation; a missing parent/target never removes its retained referring row.
ls_anchors(id) as (
  select account_subscription_id from public.billing_provider_subscriptions where account_subscription_id is not null
  union select source_account_subscription_id from public.billing_plan_change_operations
  union select account_subscription_id from public.billing_seat_quantity_operations
  union select account_subscription_id from public.billing_canonical_origins where storage_contract='lemonsqueezy.v1'
  union select e.subscription_id from public.account_subscription_events e where e.subscription_id is not null and (
    exists(select 1 from public.billing_plan_change_operations o where o.id::text=e.metadata->>'operationId')
    or exists(select 1 from public.billing_seat_quantity_operations o where o.id::text=e.metadata->>'operationId')
    or exists(select 1 from public.billing_checkout_attempts c where c.id::text=e.metadata->>'checkoutAttemptId'))
), canonical_edges(parent,child) as (
  select id,superseded_by_subscription_id from public.account_subscriptions where superseded_by_subscription_id is not null
), ls_scope(id) as (
  select id from ls_anchors
  union select case when e.parent=s.id then e.child else e.parent end
    from ls_scope s join canonical_edges e on s.id in (e.parent,e.child)
), canonical_scope(id) as (
  select id from ls_scope
  union select id from public.account_subscriptions where source='billing_provider'
  union select account_subscription_id from public.billing_canonical_origins
  union select subscription_id from public.account_subscription_events where subscription_id is not null and
    (source='billing_provider' or event_type in ('subscription.plan_superseded','subscription.converted_to_paid') or metadata ? 'operationId' or metadata ? 'checkoutAttemptId')
), canonical_raw as (
  select a.*,o.storage_contract,o.billing_account_id origin_account_id,o.recorded_at origin_recorded_at,
    exists(select 1 from ls_anchors r where r.id=a.id) ls_anchor
  from public.account_subscriptions a left join public.billing_canonical_origins o on o.account_subscription_id=a.id
  where exists(select 1 from canonical_scope r where r.id=a.id)
), canonical_attribution as (
  -- A v2 label or successor path is not a witness. Installed v2 plan writers
  -- preserve the historical source canonical on its physical operation.
  select c.*,(not c.ls_anchor and c.storage_contract='billing.v2' and c.origin_account_id=c.billing_account_id
    and c.source='billing_provider' and c.subscription_kind='paid'
    and exists(select 1 from public.billing_accounts a where a.id=c.billing_account_id)
    and isfinite(c.created_at) and c.created_at<=p_as_of
    and isfinite(c.origin_recorded_at) and c.origin_recorded_at<=p_as_of
    and (exists(select 1 from public.billing_subscriptions_v2 v where v.account_subscription_id=c.id and v.billing_account_id=c.billing_account_id
      and (v.created_at is null or isfinite(v.created_at) and v.created_at<=p_as_of))
      or exists(select 1 from public.billing_operations_v2 o join public.billing_subscriptions_v2 v
        on v.id=o.subscription_id and v.billing_account_id=o.billing_account_id
        where o.source_account_subscription_id=c.id and o.billing_account_id=c.billing_account_id
          and (o.provider,o.environment)=(v.provider,v.environment)
          and (o.created_at is null or isfinite(o.created_at) and o.created_at<=p_as_of)
          and (v.created_at is null or isfinite(v.created_at) and v.created_at<=p_as_of)))) is true routed_v2
  from canonical_raw c
), canonical_paths(root_id,id,path) as (
  select id,id,array[id] from canonical_raw c where exists(select 1 from ls_anchors r where r.id=c.id)
  union all select w.root_id,a.id,w.path||a.id from canonical_paths w
  join canonical_raw p on p.id=w.id join canonical_raw a on a.id=p.superseded_by_subscription_id
  where not a.id=any(w.path)
), account_event_candidates as (
  select e.* from public.account_subscription_events e where e.source='billing_provider'
    or e.event_type in ('subscription.plan_superseded','subscription.converted_to_paid')
    or e.metadata ? 'operationId' or e.metadata ? 'checkoutAttemptId'
    or e.event_type like 'subscription.%' and exists(select 1 from public.billing_provider_subscriptions l where l.billing_account_id=e.billing_account_id)
    or exists(select 1 from canonical_scope r where r.id=e.subscription_id)
), account_events as (
  select e.* from account_event_candidates e where not (
    exists(select 1 from canonical_attribution c where c.id=e.subscription_id and c.billing_account_id=e.billing_account_id and c.routed_v2)
    and not exists(select 1 from public.billing_plan_change_operations o where o.id::text=e.metadata->>'operationId')
    and not exists(select 1 from public.billing_seat_quantity_operations o where o.id::text=e.metadata->>'operationId')
    and not exists(select 1 from public.billing_checkout_attempts c where c.id::text=e.metadata->>'checkoutAttemptId')
    and (not e.metadata ? 'operationId' or exists(select 1 from public.billing_operations_v2 o
      where o.id::text=e.metadata->>'operationId' and o.billing_account_id=e.billing_account_id))
    and (not e.metadata ? 'checkoutAttemptId' or exists(select 1 from public.billing_checkouts_v2 c
      where c.id::text=e.metadata->>'checkoutAttemptId' and c.billing_account_id=e.billing_account_id)))
), account_refs(id) as (
  select billing_account_id from public.billing_provider_customers
  union select billing_account_id from public.billing_provider_subscriptions
  union select billing_account_id from public.billing_checkout_attempts
  union select billing_account_id from public.billing_plan_change_operations
  union select billing_account_id from public.billing_seat_quantity_operations
  union select billing_account_id from public.billing_canonical_origins
  union select billing_account_id from canonical_attribution where not routed_v2
  union select billing_account_id from account_events
), accounts as (
  select a.* from public.billing_accounts a where exists(select 1 from account_refs r where r.id=a.id)
), plans as (
  select p.* from public.commercial_plan_versions p where exists(select 1 from public.billing_provider_variant_mappings m where m.plan_version_id=p.id)
    or exists(select 1 from canonical_attribution a where not a.routed_v2 and a.plan_version_id=p.id)
), addons as (
  select a.* from public.commercial_addon_versions a where exists(select 1 from public.billing_quantity_price_contracts c where c.addon_version_id=a.id)
), cross_facts(kind,id,relationship_valid,conflict) as (
  -- Only guard-facing headers are read. No financial/audit/item/catalogue graph.
  -- Native plan/seat keys share the same account namespace as the v2 ledger.
  select 'cross_native_operation',p.id::text||':'||s.id::text,true,true
  from public.billing_plan_change_operations p join public.billing_seat_quantity_operations s
    on s.billing_account_id=p.billing_account_id and s.operation_id=p.operation_id
  union all
  select 'cross_canonical',e.parent::text||':'||e.child::text,
    (exists(select 1 from canonical_raw p join canonical_raw c on c.id=e.child where p.id=e.parent and p.billing_account_id=c.billing_account_id)) is true,
    (exists(select 1 from canonical_attribution p join canonical_attribution c on c.id=e.child where p.id=e.parent
      and (p.routed_v2 and c.ls_anchor or p.ls_anchor and c.routed_v2))) is true
  from canonical_edges e where exists(select 1 from ls_anchors r where r.id in (e.parent,e.child))
  union all
  select 'cross_subscription',v.id::text,
    (v.billing_account_id is not null and v.provider='paddle' and v.environment in ('test','live')
      and v.shadow_status in ('current','superseded') and exists(select 1 from public.billing_accounts a where a.id=v.billing_account_id)
      and (v.account_subscription_id is null or exists(select 1 from public.account_subscriptions c
        where c.id=v.account_subscription_id and c.billing_account_id=v.billing_account_id))) is true,
    (exists(select 1 from ls_anchors r where r.id=v.account_subscription_id)
      or v.shadow_status='current' and exists(select 1 from canonical_attribution l where l.ls_anchor and l.billing_account_id=v.billing_account_id
        and l.status in ('trialing','trial_recovery','active','past_due','grace','restricted') and exists(
          select 1 from public.account_subscriptions c where c.id=v.account_subscription_id and c.status in ('trialing','trial_recovery','active','past_due','grace','restricted')))) is true
  from public.billing_subscriptions_v2 v where exists(select 1 from ls_anchors r where r.id=v.account_subscription_id)
    or exists(select 1 from canonical_attribution l where l.ls_anchor and l.billing_account_id=v.billing_account_id
      and l.status in ('trialing','trial_recovery','active','past_due','grace','restricted'))
  union all
  select 'cross_operation',v.id::text,
    (v.billing_account_id is not null and v.status in ('requested','provider_pending','awaiting_payment','scheduled','cancel_pending','completed','canceled','failed','ambiguous','manual_review')
      and exists(select 1 from public.billing_subscriptions_v2 s where s.id=v.subscription_id and s.billing_account_id=v.billing_account_id)
      and (v.source_account_subscription_id is null or exists(select 1 from public.account_subscriptions c where c.id=v.source_account_subscription_id and c.billing_account_id=v.billing_account_id))) is true,
    (exists(select 1 from ls_anchors r where r.id=v.source_account_subscription_id)
      or exists(select 1 from public.billing_plan_change_operations l where l.billing_account_id=v.billing_account_id and
        (l.operation_id=v.operation_id or (l.status in ('completed','canceled','failed')) is not true and (v.status in ('completed','canceled','failed')) is not true))
      or exists(select 1 from public.billing_seat_quantity_operations l where l.billing_account_id=v.billing_account_id and
        (l.operation_id=v.operation_id or (l.status in ('completed','canceled','failed')) is not true and (v.status in ('completed','canceled','failed')) is not true))) is true
  from public.billing_operations_v2 v where exists(select 1 from ls_anchors r where r.id=v.source_account_subscription_id)
    or exists(select 1 from public.billing_plan_change_operations l where l.billing_account_id=v.billing_account_id and
      (l.operation_id=v.operation_id or (l.status in ('completed','canceled','failed')) is not true))
    or exists(select 1 from public.billing_seat_quantity_operations l where l.billing_account_id=v.billing_account_id and
      (l.operation_id=v.operation_id or (l.status in ('completed','canceled','failed')) is not true))
  union all
  select 'cross_checkout',v.id::text,
    (v.billing_account_id is not null and v.status in ('creating','ready','completed','failed','ambiguous','expired')
      and exists(select 1 from public.billing_accounts a where a.id=v.billing_account_id)) is true,
    exists(select 1 from public.billing_checkout_attempts l where l.billing_account_id=v.billing_account_id and
      (l.operation_id=v.operation_id or l.status in ('creating','ready','ambiguous') and v.status in ('creating','ready','ambiguous')))
  from public.billing_checkouts_v2 v where exists(select 1 from public.billing_checkout_attempts l where l.billing_account_id=v.billing_account_id
    and (l.operation_id=v.operation_id or (l.status in ('completed','failed','expired')) is not true))
), inventory(kind,id) as (
  select 'account',id::text from accounts
  union all select 'customer',id::text from public.billing_provider_customers
  union all select 'mapping',id::text from public.billing_provider_variant_mappings
  union all select 'quantity_contract',id::text from public.billing_quantity_price_contracts
  union all select 'plan',id::text from plans
  union all select 'addon',id::text from addons
  union all select 'subscription',id::text from public.billing_provider_subscriptions
  union all select 'checkout',id::text from public.billing_checkout_attempts
  union all select 'plan_operation',id::text from public.billing_plan_change_operations
  union all select 'seat_operation',id::text from public.billing_seat_quantity_operations
  union all select 'plan_event',id::text from public.billing_plan_change_events
  union all select 'seat_event',id::text from public.billing_seat_quantity_events
  union all select 'webhook',id::text from public.billing_provider_webhook_deliveries
  union all select 'canonical',id::text from canonical_raw
  union all select 'origin',account_subscription_id::text from public.billing_canonical_origins
  union all select 'account_event',id::text from account_events
  union all select kind,id from cross_facts
),
identifier_inputs(kind,id,identifiers) as (
  select 'customer',id::text,array[provider_customer_id,provider_store_id] from public.billing_provider_customers
  union all select 'mapping',id::text,array[provider_store_id,provider_product_id,provider_variant_id,provider_price_id] from public.billing_provider_variant_mappings
  union all select 'subscription',id::text,array[provider_store_id,provider_subscription_id,provider_customer_id,provider_product_id,provider_variant_id,provider_price_id] from public.billing_provider_subscriptions
  union all select 'webhook',id::text,array_remove(array[object_id,normalized_payload->>'store_id',provider_subscription_id,provider_customer_id],null) from public.billing_provider_webhook_deliveries
), identifier_facts as (
  select kind,id,not exists(select 1 from unnest(identifiers) v where
    (case when v ~ '^[1-9][0-9]*$' and length(v)<=16 then v::numeric<=9007199254740991 else false end) is not true) identifiers_valid
  from identifier_inputs
),
-- Normalized facts are total: parsing occurs inside CASE, never behind an AND.
webhook_normalized as (
  select d.*,
    (event_name in ('subscription_created','subscription_updated','subscription_cancelled','subscription_resumed','subscription_expired','subscription_paused','subscription_unpaused','subscription_plan_changed')) is true subscription_event,
    (event_name in ('subscription_payment_success','subscription_payment_failed','subscription_payment_recovered')) is true payment_event,
    case when jsonb_typeof(normalized_payload->'created_at')='string' and normalized_payload->>'created_at' ~ '^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:\d\d)$'
      and pg_input_is_valid(normalized_payload->>'created_at','timestamp with time zone') then (normalized_payload->>'created_at')::timestamptz end payload_created_at,
    case when jsonb_typeof(normalized_payload->'updated_at')='string' and normalized_payload->>'updated_at' ~ '^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:\d\d)$'
      and pg_input_is_valid(normalized_payload->>'updated_at','timestamp with time zone') then (normalized_payload->>'updated_at')::timestamptz end payload_updated_at
  from public.billing_provider_webhook_deliveries d
), lifecycle_payloads as (
  select d.*,
    case when jsonb_typeof(normalized_payload)='object' then (
      normalized_payload ?& array['store_id','test_mode','subscription_id','customer_id','created_at','updated_at']
      and (normalized_payload ?& array['product_id','variant_id'] and normalized_payload-array['store_id','test_mode','subscription_id','customer_id','created_at','updated_at','product_id','variant_id','billing_account_id','checkout_attempt_id','plan_version_id']='{}'::jsonb
        or event_name='subscription_updated' and normalized_payload-array['store_id','test_mode','subscription_id','customer_id','created_at','updated_at']='{}'::jsonb)
      and not exists(select 1 from jsonb_each(normalized_payload) k where k.key in ('store_id','subscription_id','customer_id','product_id','variant_id') and
        (case when jsonb_typeof(k.value)='string' and k.value#>>'{}' ~ '^[1-9][0-9]*$' and length(k.value#>>'{}')<=16
          then (k.value#>>'{}')::numeric<=9007199254740991 else false end) is not true)
      and jsonb_typeof(normalized_payload->'test_mode')='boolean'
      and not exists(select 1 from jsonb_each(normalized_payload) k where k.key in ('billing_account_id','checkout_attempt_id','plan_version_id') and
        (jsonb_typeof(k.value)='string' and k.value#>>'{}' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') is not true)
    ) else false end lifecycle_schema_valid
  from webhook_normalized d
), webhook_facts as (
  select d.*,
    (not subscription_event and not payment_event and processing_status='ignored' and isfinite(processed_at)
      and processed_at<=p_as_of and last_error_code='BILLING_WEBHOOK_UNSUPPORTED_EVENT') is true unsupported_ignored,
    (processing_status in ('processed','ignored') and isfinite(processed_at) and processed_at<=p_as_of
      and (last_error_code is null or processing_status='ignored' and (last_error_code='BILLING_RECONCILIATION_STALE'
        or last_error_code='BILLING_WEBHOOK_UNSUPPORTED_EVENT' and not subscription_event and not payment_event))) is true drained,
    (object_type='subscription-invoices' or payment_event) is true invoice_observation,
    (jsonb_typeof(normalized_payload->'status')='string' and normalized_payload->>'status' in ('pending','paid','void','refunded','partial_refund')) is true known_invoice_status,
    (subscription_event and object_type='subscriptions' and object_id=provider_subscription_id
      or payment_event and object_type='subscription-invoices') is true supported_shape,
    (provider='lemonsqueezy' and environment in ('test','live') and processing_status in ('received','processed','ignored','deferred','failed')
      and event_name ~ '^[a-z][a-z0-9_]*$' and object_type ~ '^[a-z][a-z0-9_-]*$' and object_id ~ '^[1-9][0-9]*$'
      and (not subscription_event or lifecycle_schema_valid) and jsonb_typeof(normalized_payload)='object' and jsonb_typeof(normalized_payload->'store_id')='string' and normalized_payload->>'store_id' ~ '^[1-9][0-9]*$' and normalized_payload->'test_mode'=to_jsonb(environment='test')) is true domain_valid,
    (payload_sha256 ~ '^[0-9a-f]{64}$' and delivery_fingerprint ~ '^[0-9a-f]{64}$'
      and delivery_fingerprint=encode(extensions.digest(environment||chr(10)||event_name||chr(10)||payload_sha256,'sha256'),'hex')) is true provenance_valid,
    (isfinite(received_at) and received_at<=p_as_of
      and (processed_at is null or isfinite(processed_at) and processed_at<=p_as_of)
      and (not subscription_event and not payment_event or isfinite(provider_created_at) and isfinite(provider_updated_at)
        and provider_created_at<=provider_updated_at and provider_updated_at<=p_as_of
        and payload_created_at=provider_created_at and payload_updated_at=provider_updated_at)) is true time_valid,
    exists(select 1 from public.billing_provider_subscriptions s join public.billing_provider_customers c
      on c.billing_account_id=s.billing_account_id and c.provider=s.provider and c.environment=s.environment
        and c.provider_customer_id=s.provider_customer_id and c.provider_store_id=s.provider_store_id
      join accounts a on a.id=s.billing_account_id
      where s.provider=d.provider and s.environment=d.environment and s.provider_subscription_id=d.provider_subscription_id
        and s.provider_customer_id=d.provider_customer_id and jsonb_typeof(d.normalized_payload->'subscription_id')='string' and jsonb_typeof(d.normalized_payload->'customer_id')='string' and d.normalized_payload->>'subscription_id'=d.provider_subscription_id
        and d.normalized_payload->>'customer_id'=d.provider_customer_id and d.normalized_payload->>'store_id'=s.provider_store_id
        and d.normalized_payload->'test_mode'=to_jsonb(d.environment='test') and (not d.normalized_payload ? 'billing_account_id' or lower(d.normalized_payload->>'billing_account_id')=s.billing_account_id::text) and (not d.normalized_payload ? 'checkout_attempt_id' or exists(select 1 from public.billing_checkout_attempts c where c.id::text=lower(d.normalized_payload->>'checkout_attempt_id') and c.billing_account_id=s.billing_account_id and c.provider=s.provider and c.environment=s.environment and c.completed_provider_subscription_id=s.provider_subscription_id)) and (not d.normalized_payload ? 'plan_version_id' or exists(select 1 from public.billing_provider_variant_mappings m where m.plan_version_id::text=lower(d.normalized_payload->>'plan_version_id') and m.provider=s.provider and m.environment=s.environment and m.provider_store_id=s.provider_store_id
          and (m.id=s.variant_mapping_id or exists(select 1 from public.billing_plan_change_operations op where op.billing_provider_subscription_id=s.id
            and op.billing_account_id=s.billing_account_id and m.id in (op.source_variant_mapping_id,op.target_variant_mapping_id))
            or exists(select 1 from public.billing_seat_quantity_operations op where op.billing_provider_subscription_id=s.id and op.billing_account_id=s.billing_account_id and op.variant_mapping_id=m.id))))
        and (not d.subscription_event or d.provider_created_at=s.provider_created_at and d.provider_updated_at<=s.provider_updated_at
          and (not d.normalized_payload ? 'product_id' or exists(select 1 from public.billing_provider_variant_mappings m
            where (m.provider,m.environment,m.provider_store_id,m.provider_product_id,m.provider_variant_id)=
              (s.provider,s.environment,s.provider_store_id,d.normalized_payload->>'product_id',d.normalized_payload->>'variant_id')
              and (m.id=s.variant_mapping_id or exists(select 1 from public.billing_plan_change_operations op where op.billing_provider_subscription_id=s.id
                and op.billing_account_id=s.billing_account_id and m.id in (op.source_variant_mapping_id,op.target_variant_mapping_id))
                or exists(select 1 from public.billing_seat_quantity_operations op where op.billing_provider_subscription_id=s.id and op.billing_account_id=s.billing_account_id and op.variant_mapping_id=m.id)))))) relationship_valid
  from lifecycle_payloads d
), subscription_facts as (
  select b.*,a.status canonical_status,a.source canonical_source,a.cancel_at_period_end,a.current_period_ends_at,o.storage_contract,
    (b.provider='lemonsqueezy' and b.environment in ('test','live') and b.provider_status in ('active','paused','past_due','unpaid','cancelled','expired')
      and b.reconciliation_status in ('processed','manual_review') and b.quantity>=1 and b.approved_additional_coach_seats>=0
      and b.provider_store_id ~ '^[1-9][0-9]*$' and b.provider_product_id ~ '^[1-9][0-9]*$' and b.provider_variant_id ~ '^[1-9][0-9]*$' and b.provider_price_id ~ '^[1-9][0-9]*$'
      and b.provider_subscription_id ~ '^[1-9][0-9]*$' and b.provider_customer_id ~ '^[1-9][0-9]*$'
      and (b.reconciliation_status<>'processed' or b.reconciliation_error_code is null)) is true domain_valid,
    (exists(select 1 from accounts ba where ba.id=b.billing_account_id)
      and exists(select 1 from public.billing_provider_customers c where c.billing_account_id=b.billing_account_id and c.provider=b.provider and c.environment=b.environment
        and c.provider_customer_id=b.provider_customer_id and c.provider_store_id=b.provider_store_id)
      and exists(select 1 from public.billing_provider_variant_mappings m where m.id=b.variant_mapping_id
        and (m.provider,m.environment,m.provider_store_id,m.provider_product_id,m.provider_variant_id,m.provider_price_id)=
          (b.provider,b.environment,b.provider_store_id,b.provider_product_id,b.provider_variant_id,b.provider_price_id)
        and (m.plan_version_id=a.plan_version_id or exists(select 1 from public.billing_plan_change_operations op
          where op.billing_provider_subscription_id=b.id and op.billing_account_id=b.billing_account_id and op.source_account_subscription_id=a.id
            and op.target_variant_mapping_id=m.id and op.status in ('provider_pending','awaiting_payment','scheduled','cancel_pending','ambiguous','manual_review'))))
      and a.source='billing_provider' and a.subscription_kind='paid' and o.storage_contract='lemonsqueezy.v1') is true relationship_valid,
    (isfinite(b.provider_created_at) and isfinite(b.provider_updated_at) and b.provider_created_at<=b.provider_updated_at and b.provider_updated_at<=p_as_of
      and isfinite(b.last_reconciled_at) and b.last_reconciled_at<=p_as_of) is true time_valid,
    (b.latest_snapshot_sha256 ~ '^[0-9a-f]{64}$') is true provenance_valid,
    (b.provider_status in ('cancelled','expired') and b.reconciliation_status='processed' and b.reconciliation_error_code is null
      and a.source='billing_provider' and a.subscription_kind='paid' and a.status in ('canceled','expired')
      and a.superseded_at is null and a.superseded_by_subscription_id is null and o.storage_contract='lemonsqueezy.v1'
      and isfinite(b.provider_ends_at) and b.provider_ends_at<=p_as_of and a.current_period_ends_at=b.provider_ends_at
      and b.provider_created_at<b.provider_ends_at and b.quantity::bigint=1+b.approved_additional_coach_seats::bigint
      and (a.current_period_started_at<b.provider_ends_at or a.current_period_started_at is null and exists(
        select 1 from public.billing_plan_change_operations op join public.account_subscriptions predecessor on predecessor.id=op.source_account_subscription_id
        where op.billing_provider_subscription_id=b.id and op.billing_account_id=b.billing_account_id and op.status='completed'
          and op.target_plan_version_id=a.plan_version_id and predecessor.superseded_by_subscription_id=a.id))
      and (a.status='expired' and isfinite(a.expired_at) and a.expired_at<=p_as_of or a.status='canceled' and isfinite(a.canceled_at) and a.canceled_at<=p_as_of)
      and (b.provider_status<>'cancelled' or b.provider_cancelled) and (not a.cancel_at_period_end or a.current_period_ends_at<=p_as_of)) is true terminal_proof
  from public.billing_provider_subscriptions b
  left join public.account_subscriptions a on a.id=b.account_subscription_id and a.billing_account_id=b.billing_account_id
  left join public.billing_canonical_origins o on o.account_subscription_id=a.id and o.billing_account_id=a.billing_account_id
), checkout_facts as (
  select c.*,
    (provider='lemonsqueezy' and environment in ('test','live') and cadence in ('monthly','annual')
      and status in ('creating','ready','completed','failed','ambiguous','expired')
      and (status='completed')=(completed_at is not null) and (status='completed')=(completed_provider_subscription_id is not null)
      and (status='failed')=(failed_at is not null) and (status='expired')=(expired_at is not null)
      and (status='ready')=(provider_checkout_url is not null) and (error_code is null or error_code in
      ('BILLING_CHECKOUT_CREATION_FAILED','BILLING_CHECKOUT_CREATION_AMBIGUOUS','BILLING_CHECKOUT_EXPIRED','BILLING_VARIANT_MAPPING_MISMATCH'))) is true domain_valid,
    (exists(select 1 from accounts a where a.id=c.billing_account_id and a.owner_user_id=c.created_by_user_id)
      and exists(select 1 from public.billing_provider_variant_mappings m where m.id=c.variant_mapping_id
        and (m.plan_version_id,m.cadence,m.provider,m.environment)=(c.plan_version_id,c.cadence,c.provider,c.environment))
      and (c.completed_provider_subscription_id is null or exists(select 1 from subscription_facts s
        where (s.provider,s.environment,s.provider_subscription_id,s.billing_account_id)
          =(c.provider,c.environment,c.completed_provider_subscription_id,c.billing_account_id)))) is true relationship_valid,
    (isfinite(created_at) and created_at<=p_as_of and isfinite(expected_expires_at) and isfinite(creation_lease_expires_at)
      and created_at<creation_lease_expires_at and creation_lease_expires_at<=expected_expires_at
      and (status<>'completed' or isfinite(completed_at) and completed_at<=p_as_of)
      and (status<>'failed' or isfinite(failed_at) and failed_at<=p_as_of)
      and (status<>'expired' or isfinite(expired_at) and expired_at<=p_as_of)) is true time_valid,
    (provider_checkout_id is null or isfinite(provider_expires_at) and isfinite(expected_expires_at)
      and floor(extract(epoch from provider_expires_at))=floor(extract(epoch from expected_expires_at))) is true provenance_valid,
    (provider_checkout_id is not null and isfinite(provider_expires_at) and isfinite(expected_expires_at)
      and floor(extract(epoch from provider_expires_at))=floor(extract(epoch from expected_expires_at))) is true verified_creation,
    (status='completed' and exists(select 1 from subscription_facts s where s.provider=c.provider and s.environment=c.environment
      and s.provider_subscription_id=c.completed_provider_subscription_id and s.billing_account_id=c.billing_account_id)
      or status='failed' and provider_checkout_id is null and error_code in ('BILLING_CHECKOUT_CREATION_FAILED','BILLING_VARIANT_MAPPING_MISMATCH')) is true terminal_proof
  from public.billing_checkout_attempts c
),
-- Admission stores capacity observations, not a provider identity snapshot.
-- Validate the exact retained JSON contracts without inventing provider fields.
operation_snapshots(kind,id,snapshot) as (
  select 'plan',id,preflight_snapshot from public.billing_plan_change_operations
  union all select 'seat',id,preflight_snapshot from public.billing_seat_quantity_operations
), snapshot_facts as (
  select x.kind,x.id,(case when jsonb_typeof(x.snapshot)='object' then
    case x.kind when 'seat' then
      x.snapshot ?& array['actual','pending','reserved','committed']
      and x.snapshot-array['actual','pending','reserved','committed']='{}'::jsonb
      and not exists(select 1 from jsonb_each(x.snapshot) f where jsonb_typeof(f.value)<>'number' or f.value::text !~ '^[0-9]+$')
      and case when not exists(select 1 from jsonb_each(x.snapshot) f where jsonb_typeof(f.value)<>'number' or f.value::text !~ '^[0-9]+$') then
        (x.snapshot->>'committed')::numeric=(x.snapshot->>'actual')::numeric+(x.snapshot->>'pending')::numeric+(x.snapshot->>'reserved')::numeric
        and not exists(select 1 from jsonb_each(x.snapshot) f where f.value::text::numeric>9223372036854775807) else false end
    else
      x.snapshot ?& array['dimensions','hasAnyDataQualityIssue']
      and x.snapshot-array['dimensions','hasAnyDataQualityIssue']='{}'::jsonb
      and jsonb_typeof(x.snapshot->'hasAnyDataQualityIssue')='boolean'
      and case when jsonb_typeof(x.snapshot->'dimensions')='array' then
        jsonb_array_length(x.snapshot->'dimensions')=4
        and (select count(distinct d->>'key') from jsonb_array_elements(x.snapshot->'dimensions') d)=4
        and not exists(select 1 from jsonb_array_elements(x.snapshot->'dimensions') d where
          (case when jsonb_typeof(d)='object' then
            d->>'key' in ('counted_clients','coach_seats','active_workspaces','published_packages')
            and d ?& array['key','actual','pending','reserved','committed','limit','remaining','utilizationPercent','state','overBy','wouldExceedNext','dataQualityIssue']
            and d-array['key','actual','pending','reserved','committed','limit','remaining','utilizationPercent','state','overBy','wouldExceedNext','dataQualityIssue',
              'included','aboveIncludedBy']='{}'::jsonb
            and (d->>'key'<>'coach_seats' or d ?& array['included','aboveIncludedBy'])
            and (d->>'key'='coach_seats' or not d ?| array['included','aboveIncludedBy'])
            and jsonb_typeof(d->'key')='string' and jsonb_typeof(d->'dataQualityIssue')='boolean'
            and d->>'state' in ('unavailable','unlimited','over_limit','at_limit','approaching','available')
            and jsonb_typeof(d->'wouldExceedNext') in ('boolean','null')
            and jsonb_typeof(d->'utilizationPercent') in ('number','null')
            and not exists(select 1 from jsonb_each(d) f where f.key in ('actual','pending','reserved','committed','overBy')
              and (jsonb_typeof(f.value)<>'number' or f.value::text !~ '^[0-9]+$'))
            and not exists(select 1 from jsonb_each(d) f where f.key in ('limit','remaining','included','aboveIncludedBy')
              and not (jsonb_typeof(f.value)='null' or jsonb_typeof(f.value)='number' and f.value::text ~ '^[0-9]+$'))
            and case when not exists(select 1 from jsonb_each(d) f where f.key in ('actual','pending','reserved','committed','overBy')
              and (jsonb_typeof(f.value)<>'number' or f.value::text !~ '^[0-9]+$')) then
                (d->>'committed')::numeric=(d->>'actual')::numeric+(d->>'pending')::numeric+(d->>'reserved')::numeric
                and not exists(select 1 from jsonb_each(d) f where f.key in ('actual','pending','reserved','committed','overBy') and f.value::text::numeric>9223372036854775807)
              else false end
          else false end) is not true)
        and x.snapshot->'hasAnyDataQualityIssue'=to_jsonb(exists(select 1 from jsonb_array_elements(x.snapshot->'dimensions') d where d->'dataQualityIssue'='true'::jsonb))
      else false end
    end else false end) is true snapshot_valid
  from operation_snapshots x
), plan_audit_counts as (
  select operation_id,event_type,count(*) n from public.billing_plan_change_events group by operation_id,event_type
), seat_audit_counts as (
  select operation_id,event_type,count(*) n from public.billing_seat_quantity_events group by operation_id,event_type
), plan_carried_seats as (
  -- The native admission guard serializes plan/seat operations on the account.
  -- A prior completed seat admission therefore settled before this plan was
  -- admitted. Use dispatch wall-clock order, never transaction milestone order
  -- or a clamped/display preflight limit. Later purchases cannot change history.
  select o.id,coalesce(h.approval,0)::bigint approval,coalesce(h.coherent,true) coherent
  from public.billing_plan_change_operations o left join lateral (
    select min(s.target_additional_seats) approval,min(s.target_additional_seats)=max(s.target_additional_seats) coherent
    from public.billing_seat_quantity_operations s where s.billing_provider_subscription_id=o.billing_provider_subscription_id
      and s.billing_account_id=o.billing_account_id and s.status='completed'
      and s.provider_requested_at=(select max(p.provider_requested_at) from public.billing_seat_quantity_operations p
        where p.billing_provider_subscription_id=o.billing_provider_subscription_id and p.billing_account_id=o.billing_account_id
          and p.status='completed' and p.provider_requested_at<=o.provider_requested_at)
  ) h on true
), plan_operation_facts as (
  select o.*,
    (source_cadence in ('monthly','annual') and target_cadence in ('monthly','annual')
      and change_kind in ('tier_upgrade','cadence_upgrade','combined_upgrade','tier_downgrade','cadence_downgrade','combined_downgrade')
      and effective_timing in ('immediate','period_end') and proration_mode in ('invoice_immediately','disable_prorations') and provider_payment_processor='card'
      and status in ('requested','provider_pending','awaiting_payment','scheduled','cancel_pending','completed','canceled','failed','ambiguous','manual_review')
      -- Terminal milestones are exclusive; only immediate completion is paid.
      -- ambiguous_at may survive a later resolution and is not a terminal flag.
      and (status='completed')=(completed_at is not null)
      and (status='canceled')=(canceled_at is not null)
      and (status='failed')=(failed_at is not null)
      and (status='completed' and effective_timing='immediate')=(payment_confirmed_at is not null)
      and (effective_timing='period_end')=(effective_at is not null)
      and (status<>'failed' or error_code='BILLING_PLAN_CHANGE_PROVIDER_FAILED'
        and provider_applied_at is null and provider_updated_at is null and provider_snapshot_sha256 is null)
      and (error_code is null or error_code in ('BILLING_PLAN_CHANGE_PROVIDER_FAILED','BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS','BILLING_PLAN_CHANGE_MANUAL_REVIEW','BILLING_PLAN_CHANGE_PAYMENT_FAILED','BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE'))
      -- Cancellation clears errors. Immediate paid completion clears them;
      -- a due period-end application may complete on a payment-failed event.
      and (status<>'canceled' or error_code is null)
      and (status<>'completed' or error_code is null or effective_timing='period_end' and error_code='BILLING_PLAN_CHANGE_PAYMENT_FAILED')
      and exists(select 1 from snapshot_facts f where f.kind='plan' and f.id=o.id and f.snapshot_valid)) is true domain_valid,
    (exists(select 1 from accounts a where a.id=o.billing_account_id and a.owner_user_id=o.created_by_user_id)
      and exists(select 1 from subscription_facts s where s.id=o.billing_provider_subscription_id and s.billing_account_id=o.billing_account_id
        and exists(select 1 from canonical_paths cp where cp.root_id=o.source_account_subscription_id and cp.id=s.account_subscription_id)
        and exists(select 1 from public.billing_provider_variant_mappings m where m.id=o.source_variant_mapping_id
          and (m.provider,m.environment,m.provider_store_id,m.plan_version_id,m.cadence)=(s.provider,s.environment,s.provider_store_id,o.source_plan_version_id,o.source_cadence))
        and exists(select 1 from public.billing_provider_variant_mappings m where m.id=o.target_variant_mapping_id
          and (m.provider,m.environment,m.provider_store_id,m.plan_version_id,m.cadence)=(s.provider,s.environment,s.provider_store_id,o.target_plan_version_id,o.target_cadence)))
      and exists(select 1 from canonical_raw a where a.id=o.source_account_subscription_id and a.billing_account_id=o.billing_account_id
        and a.subscription_kind='paid' and a.storage_contract='lemonsqueezy.v1' and a.plan_version_id=o.source_plan_version_id)
      and exists(select 1 from public.billing_plan_change_events e where e.operation_id=o.id and e.event_type='billing.plan_change_requested' and e.occurred_at=o.requested_at)
      and not exists(select 1 from plan_audit_counts e where e.operation_id=o.id and e.n<>1)
      and exists(select 1 from plans source_plan cross join plans target_plan where source_plan.id=o.source_plan_version_id and target_plan.id=o.target_plan_version_id
        and (source_plan.plan_key,o.source_cadence)<>(target_plan.plan_key,o.target_cadence)
        and not (array_position(array['launch','growth','scale'],target_plan.plan_key)>array_position(array['launch','growth','scale'],source_plan.plan_key) and o.source_cadence='annual' and o.target_cadence='monthly')
        and o.effective_timing=case when array_position(array['launch','growth','scale'],target_plan.plan_key)<array_position(array['launch','growth','scale'],source_plan.plan_key) or o.source_cadence='annual' and o.target_cadence='monthly' then 'period_end' else 'immediate' end
        and o.proration_mode=case when o.effective_timing='period_end' then 'disable_prorations' else 'invoice_immediately' end
        and o.change_kind=(case when source_plan.plan_key=target_plan.plan_key then 'cadence' when o.source_cadence=o.target_cadence then 'tier' else 'combined' end)||case when o.effective_timing='period_end' then '_downgrade' else '_upgrade' end
        and exists(select 1 from plan_carried_seats h where h.id=o.id and h.coherent and h.approval>=0
          and h.approval<=source_plan.max_coach_seats::bigint-source_plan.included_coach_seats::bigint
          and h.approval<=target_plan.max_coach_seats::bigint-target_plan.included_coach_seats::bigint))
      and (o.provider_applied_at is null or exists(select 1 from public.billing_plan_change_events e where e.operation_id=o.id and e.event_type='billing.plan_change_provider_applied' and e.occurred_at=o.provider_applied_at))
      -- The installed apply writer records its intermediate state even when it
      -- completes in the same call; cancellation necessarily traverses scheduled.
      and (o.provider_applied_at is null and o.status not in ('completed','canceled','cancel_pending') or exists(
        select 1 from public.billing_plan_change_events e where e.operation_id=o.id and e.event_type=
          case o.effective_timing when 'immediate' then 'billing.plan_change_awaiting_payment' else 'billing.plan_change_scheduled' end
          and e.occurred_at=o.provider_applied_at))
      and (o.status not in ('canceled','cancel_pending') or o.effective_timing='period_end' and exists(
        select 1 from public.billing_plan_change_events e where e.operation_id=o.id and e.event_type='billing.plan_change_cancel_requested'))
      -- Dispatch ambiguity writes this pair together. A later cancellation
      -- failure can overwrite ambiguous_at without a new manual-review event.
      and (o.ambiguous_at is null or exists(select 1 from public.billing_plan_change_events e where e.operation_id=o.id and e.event_type='billing.plan_change_cancel_requested')
        or exists(select 1 from public.billing_plan_change_events e where e.operation_id=o.id and e.event_type='billing.plan_change_manual_review' and e.occurred_at=o.ambiguous_at))
      and exists(select 1 from public.billing_plan_change_events e where e.operation_id=o.id and e.event_type='billing.plan_change_'||
        case o.status when 'provider_pending' then 'requested' when 'cancel_pending' then 'cancel_requested' when 'ambiguous' then 'manual_review' else o.status end
        and case o.status when 'completed' then e.occurred_at=o.completed_at
          when 'canceled' then e.occurred_at=o.canceled_at when 'failed' then e.occurred_at=o.failed_at
          when 'scheduled' then e.occurred_at=o.provider_applied_at else true end)) is true relationship_valid,
    (isfinite(requested_at) and requested_at<=p_as_of and isfinite(provider_requested_at) and provider_requested_at<=p_as_of
      and (provider_applied_at is null or isfinite(provider_applied_at) and provider_applied_at<=p_as_of)
      -- Paid completion assigns both fields from now() in the same action.
      -- Do not order transaction timestamps against the dispatch wall clock.
      and (payment_confirmed_at is null or isfinite(payment_confirmed_at) and payment_confirmed_at<=p_as_of and payment_confirmed_at=completed_at)
      and (provider_updated_at is null or isfinite(provider_updated_at) and provider_updated_at<=p_as_of)
      and (status<>'completed' or isfinite(completed_at) and completed_at<=p_as_of and isfinite(provider_updated_at) and provider_updated_at>=provider_requested_at and provider_applied_at is not null and (effective_timing<>'immediate' or payment_confirmed_at is not null))
      and (status<>'canceled' or isfinite(canceled_at) and canceled_at<=p_as_of)
      and (status<>'failed' or isfinite(failed_at) and failed_at<=p_as_of)
      and (ambiguous_at is null or isfinite(ambiguous_at) and ambiguous_at<=p_as_of)
      -- due and completed_at use the same transaction now() in the apply writer.
      and (effective_timing<>'period_end' or isfinite(effective_at) and (status<>'completed' or effective_at<=completed_at))) is true time_valid,
    ((provider_snapshot_sha256 is null or provider_snapshot_sha256 ~ '^[0-9a-f]{64}$') and (status<>'completed' or provider_snapshot_sha256 is not null)) is true provenance_valid
  from public.billing_plan_change_operations o
), seat_operation_facts as (
  select o.*,
    (direction in ('increase','reduction') and effective_timing in ('immediate','period_end') and proration_mode in ('invoice_immediately','disable_prorations')
      and status in ('requested','provider_pending','awaiting_payment','scheduled','cancel_pending','completed','canceled','failed','ambiguous','manual_review')
      and (status='completed')=(completed_at is not null)
      and (status='canceled')=(canceled_at is not null)
      and (status='completed' and direction='increase')=(payment_confirmed_at is not null)
      and (effective_timing='period_end')=(effective_at is not null)
      -- Direct failure is before application; there is no historical failed_at.
      and (status<>'failed' or error_code='BILLING_SEAT_QUANTITY_PROVIDER_FAILED'
        and provider_applied_at is null and provider_updated_at is null and provider_snapshot_sha256 is null and cancel_requested_at is null)
      and source_additional_seats>=0 and target_additional_seats>=0 and source_quantity::bigint=1+source_additional_seats::bigint and target_quantity::bigint=1+target_additional_seats::bigint
      and source_quantity<>target_quantity and (direction='increase')=(target_quantity>source_quantity)
      and (direction='increase')=(effective_timing='immediate') and (effective_timing='immediate')=(proration_mode='invoice_immediately')
      and (error_code is null or error_code in ('BILLING_SEAT_QUANTITY_PROVIDER_FAILED','BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS','BILLING_SEAT_QUANTITY_MANUAL_REVIEW','BILLING_SEAT_QUANTITY_PAYMENT_FAILED','BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT','BILLING_SEAT_QUANTITY_AWAITING_PAYMENT'))
      and (status not in ('completed','canceled') or error_code is null)
      and exists(select 1 from snapshot_facts f where f.kind='seat' and f.id=o.id and f.snapshot_valid)) is true domain_valid,
    (exists(select 1 from accounts a where a.id=o.billing_account_id and a.owner_user_id=o.created_by_user_id)
      and exists(select 1 from subscription_facts s join public.billing_provider_variant_mappings m on m.id=o.variant_mapping_id
        where s.id=o.billing_provider_subscription_id and s.billing_account_id=o.billing_account_id
          and exists(select 1 from canonical_paths cp where cp.root_id=o.account_subscription_id and cp.id=s.account_subscription_id)
          and (m.provider,m.environment,m.provider_store_id)=(s.provider,s.environment,s.provider_store_id)
          and exists(select 1 from canonical_raw a where a.id=o.account_subscription_id and a.billing_account_id=o.billing_account_id
            and a.plan_version_id=m.plan_version_id and a.subscription_kind='paid' and a.storage_contract='lemonsqueezy.v1'))
      and exists(select 1 from public.billing_quantity_price_contracts c where c.id=o.quantity_price_contract_id and c.variant_mapping_id=o.variant_mapping_id)
      and exists(select 1 from canonical_raw a join plans p on p.id=a.plan_version_id where a.id=o.account_subscription_id
        and o.source_additional_seats::bigint<=p.max_coach_seats::bigint-p.included_coach_seats::bigint
        and o.target_additional_seats::bigint<=p.max_coach_seats::bigint-p.included_coach_seats::bigint
        and o.source_effective_limit=least(p.max_coach_seats,p.included_coach_seats::bigint+o.source_additional_seats::bigint)
        and o.target_effective_limit=least(p.max_coach_seats,p.included_coach_seats::bigint+o.target_additional_seats::bigint))
      and exists(select 1 from public.billing_seat_quantity_events e where e.operation_id=o.id and e.event_type='billing.seat_provider_pending' and e.occurred_at=o.requested_at)
      and not exists(select 1 from seat_audit_counts e where e.operation_id=o.id and e.n<>1)
      and (o.provider_applied_at is null and o.status not in ('completed','canceled','cancel_pending') or exists(
        select 1 from public.billing_seat_quantity_events e where e.operation_id=o.id and e.event_type=
          case o.direction when 'increase' then 'billing.seat_awaiting_payment' else 'billing.seat_scheduled' end
          and e.occurred_at=o.provider_applied_at))
      -- The first paid-increase application writes a state and an error audit.
      -- A first failed-payment event retains PAYMENT_FAILED through recovery.
      and (o.direction<>'increase' or o.provider_applied_at is null or exists(
        select 1 from public.billing_seat_quantity_events e where e.operation_id=o.id
          and e.event_type in ('BILLING_SEAT_QUANTITY_AWAITING_PAYMENT','BILLING_SEAT_QUANTITY_PAYMENT_FAILED')
          and e.occurred_at=o.provider_applied_at))
      and (o.status not in ('canceled','cancel_pending') or o.direction='reduction' and exists(
        select 1 from public.billing_seat_quantity_events e where e.operation_id=o.id and e.event_type='billing.seat_cancel_pending'))
      and exists(select 1 from public.billing_seat_quantity_events e where e.operation_id=o.id and e.event_type='billing.seat_'||o.status
        and case o.status when 'completed' then e.occurred_at=o.completed_at
          when 'canceled' then e.occurred_at=o.canceled_at when 'scheduled' then e.occurred_at=o.provider_applied_at else true end)
      and (o.status<>'failed' or exists(select 1 from public.billing_seat_quantity_events state_event
        join public.billing_seat_quantity_events error_event on error_event.operation_id=state_event.operation_id
          and error_event.occurred_at=state_event.occurred_at
        where state_event.operation_id=o.id and state_event.event_type='billing.seat_failed'
          and error_event.event_type='BILLING_SEAT_QUANTITY_PROVIDER_FAILED'))) is true relationship_valid,
    (isfinite(requested_at) and requested_at<=p_as_of and isfinite(provider_requested_at) and provider_requested_at<=p_as_of
      and (provider_applied_at is null or isfinite(provider_applied_at) and provider_applied_at<=p_as_of)
      and (payment_confirmed_at is null or isfinite(payment_confirmed_at) and payment_confirmed_at<=p_as_of and payment_confirmed_at=completed_at)
      and (provider_updated_at is null or isfinite(provider_updated_at) and provider_updated_at<=p_as_of)
      and (status<>'completed' or isfinite(completed_at) and completed_at<=p_as_of and isfinite(provider_updated_at) and provider_updated_at>=provider_requested_at and provider_applied_at is not null and (direction<>'increase' or payment_confirmed_at is not null))
      and (cancel_requested_at is null or isfinite(cancel_requested_at) and cancel_requested_at<=p_as_of)
      and (status not in ('canceled','cancel_pending') or cancel_requested_at is not null)
      and (status<>'canceled' or isfinite(canceled_at) and canceled_at<=p_as_of)
      and (effective_timing<>'period_end' or isfinite(effective_at) and (status<>'completed' or effective_at<=completed_at))) is true time_valid,
    ((provider_snapshot_sha256 is null or provider_snapshot_sha256 ~ '^[0-9a-f]{64}$') and (status<>'completed' or provider_snapshot_sha256 is not null)) is true provenance_valid
  from public.billing_seat_quantity_operations o
),
quantity_facts as (
  select b.id,((b.approved_additional_coach_seats=0 or exists(select 1 from seat_operation_facts o
    where o.billing_provider_subscription_id=b.id and o.billing_account_id=b.billing_account_id and o.status='completed'
      and o.target_additional_seats=b.approved_additional_coach_seats and o.domain_valid and o.relationship_valid and o.time_valid and o.provenance_valid))
    and (b.quantity::bigint=1+b.approved_additional_coach_seats::bigint or (
    (select count(*) from public.billing_seat_quantity_operations o where o.billing_provider_subscription_id=b.id
      and (o.status in ('completed','canceled','failed')) is not true)=1
    and exists(select 1 from seat_operation_facts o where o.billing_provider_subscription_id=b.id and o.billing_account_id=b.billing_account_id
      and o.domain_valid and o.relationship_valid and o.time_valid and o.provenance_valid
      and o.status in ('provider_pending','awaiting_payment','scheduled','cancel_pending','ambiguous','manual_review')
      and o.variant_mapping_id=b.variant_mapping_id and b.approved_additional_coach_seats=o.source_additional_seats and b.quantity=o.target_quantity
      and b.first_subscription_item_id ~ '^[1-9][0-9]*$'
      and isfinite(o.provider_applied_at) and o.provider_snapshot_sha256 ~ '^[0-9a-f]{64}$'
      and isfinite(o.provider_updated_at) and o.provider_updated_at>=o.provider_requested_at
      and b.provider_updated_at>=o.provider_updated_at)))) is true quantity_valid
  from public.billing_provider_subscriptions b
), context_facts as (
  select 'account' kind,x.id::text id,(x.owner_user_id is not null) is true domain_valid,
    (true) is true relationship_valid,
    (isfinite(x.created_at) and x.created_at<=p_as_of) is true time_valid,(true) is true provenance_valid
  from accounts x
  union all
  select 'plan' kind,x.id::text id,(x.plan_key in ('launch','growth','scale') and x.status in ('draft','active','retired') and x.currency_code='USD' and x.monthly_price_minor>0 and x.annual_price_minor>0) is true domain_valid,
    (true) is true relationship_valid,
    (true) is true time_valid,(true) is true provenance_valid
  from plans x
  union all
  select 'addon' kind,x.id::text id,(x.addon_key='coach_seat' and x.status in ('draft','active','retired') and x.currency_code='USD' and x.monthly_unit_amount_minor>0 and x.annual_unit_amount_minor>0) is true domain_valid,
    (true) is true relationship_valid,
    (true) is true time_valid,(true) is true provenance_valid
  from addons x
  union all
  select 'customer' kind,x.id::text id,(x.provider='lemonsqueezy' and x.environment in ('test','live') and x.provider_customer_id ~ '^[1-9][0-9]*$' and x.provider_store_id ~ '^[1-9][0-9]*$') is true domain_valid,
    (exists(select 1 from accounts a where a.id=x.billing_account_id)) is true relationship_valid,
    (isfinite(x.first_seen_at) and x.first_seen_at<=p_as_of and isfinite(x.last_seen_at) and x.last_seen_at<=p_as_of) is true time_valid,(true) is true provenance_valid
  from public.billing_provider_customers x
  union all
  select 'mapping' kind,x.id::text id,(x.provider='lemonsqueezy' and x.environment in ('test','live') and x.cadence in ('monthly','annual') and x.status in ('draft','active','retired') and x.currency_code='USD' and x.unit_amount_minor>0 and x.renewal_interval_quantity=1 and (x.cadence='monthly' and x.renewal_interval_unit='month' or x.cadence='annual' and x.renewal_interval_unit='year') and x.provider_store_id ~ '^[1-9][0-9]*$' and x.provider_product_id ~ '^[1-9][0-9]*$' and x.provider_variant_id ~ '^[1-9][0-9]*$' and x.provider_price_id ~ '^[1-9][0-9]*$') is true domain_valid,
    (exists(select 1 from plans p where p.id=x.plan_version_id and p.currency_code=x.currency_code and x.unit_amount_minor=case x.cadence when 'annual' then p.annual_price_minor else p.monthly_price_minor end)) is true relationship_valid,
    ((x.status<>'active' or isfinite(x.verified_at) and x.verified_at<=p_as_of) and (x.status<>'retired' or isfinite(x.retired_at) and x.retired_at<=p_as_of)) is true time_valid,(true) is true provenance_valid
  from public.billing_provider_variant_mappings x
  union all
  select 'quantity_contract' kind,x.id::text id,(x.status in ('draft','active','retired') and x.pricing_scheme='graduated' and x.base_quantity=1 and jsonb_typeof(x.normalized_price_contract)='object') is true domain_valid,
    (exists(select 1 from public.billing_provider_variant_mappings m join addons a on a.id=x.addon_version_id where m.id=x.variant_mapping_id and x.normalized_price_contract=jsonb_build_object('price_id',m.provider_price_id,'variant_id',m.provider_variant_id,'category','subscription','scheme','graduated','usage_aggregation',null,'setup_fee_enabled',false,'setup_fee',null,'package_size',1,'trial_interval_unit',null,'trial_interval_quantity',null,'renewal_interval_unit',m.renewal_interval_unit,'renewal_interval_quantity',1,'tiers',jsonb_build_array(jsonb_build_object('last_unit',1,'unit_price',m.unit_amount_minor,'fixed_fee',0,'unit_price_decimal',null),jsonb_build_object('last_unit','inf','unit_price',case m.cadence when 'monthly' then a.monthly_unit_amount_minor else a.annual_unit_amount_minor end,'fixed_fee',0,'unit_price_decimal',null))))) is true relationship_valid,
    (isfinite(x.verified_at) and x.verified_at<=p_as_of) is true time_valid,(x.price_contract_sha256=encode(extensions.digest(x.normalized_price_contract::text,'sha256'),'hex')) is true provenance_valid
  from public.billing_quantity_price_contracts x
  union all
  select 'origin' kind,x.account_subscription_id::text id,(x.storage_contract in ('lemonsqueezy.v1','billing.v2')) is true domain_valid,
    (exists(select 1 from accounts a where a.id=x.billing_account_id) and exists(select 1 from canonical_raw a where a.id=x.account_subscription_id and a.billing_account_id=x.billing_account_id and a.source='billing_provider' and a.subscription_kind='paid')) is true relationship_valid,
    (isfinite(x.recorded_at) and x.recorded_at<=p_as_of) is true time_valid,(true) is true provenance_valid
  from public.billing_canonical_origins x
  union all
  select 'canonical' kind,x.id::text id,(x.routed_v2 or x.source='billing_provider' and x.subscription_kind='paid'
    and x.status in ('trialing','trial_recovery','active','past_due','grace','restricted','canceled','expired','superseded')
    and x.storage_contract='lemonsqueezy.v1') is true domain_valid,
    (x.routed_v2 or exists(select 1 from accounts a where a.id=x.billing_account_id)
      and x.origin_account_id=x.billing_account_id and exists(select 1 from plans p where p.id=x.plan_version_id)
      and (x.superseded_by_subscription_id is null or exists(select 1 from canonical_raw n where n.id=x.superseded_by_subscription_id and n.billing_account_id=x.billing_account_id))) is true relationship_valid,
    (x.routed_v2 or isfinite(x.created_at) and x.created_at<=p_as_of and isfinite(x.status_changed_at) and x.status_changed_at<=p_as_of
      and (x.current_period_started_at is null or isfinite(x.current_period_started_at))
      and (x.current_period_ends_at is null or isfinite(x.current_period_ends_at))
      and (x.status<>'expired' or isfinite(x.expired_at) and x.expired_at<=p_as_of)
      and (x.status<>'canceled' or isfinite(x.canceled_at) and x.canceled_at<=p_as_of)
      and ((x.status='superseded')=(x.superseded_at is not null))
      and (x.status<>'superseded' or isfinite(x.superseded_at) and x.superseded_at<=p_as_of)) is true time_valid,true provenance_valid
  from canonical_attribution x
  union all
  select 'plan_event' kind,x.id::text id,(x.event_type in ('billing.plan_change_requested','billing.plan_change_awaiting_payment','billing.plan_change_scheduled','billing.plan_change_cancel_requested','billing.plan_change_completed','billing.plan_change_canceled','billing.plan_change_failed','billing.plan_change_manual_review','billing.plan_change_provider_applied')) is true domain_valid,
    (exists(select 1 from public.billing_plan_change_operations o where o.id=x.operation_id and exists(select 1 from public.billing_provider_subscriptions b where b.id=o.billing_provider_subscription_id and b.billing_account_id=o.billing_account_id)
      and exists(select 1 from plan_audit_counts e where e.operation_id=x.operation_id and e.event_type=x.event_type and e.n=1)
      and (x.event_type not in ('billing.plan_change_completed','billing.plan_change_canceled','billing.plan_change_failed') or x.event_type='billing.plan_change_'||o.status)
      and (x.event_type<>'billing.plan_change_awaiting_payment' or o.effective_timing='immediate')
      and (x.event_type not in ('billing.plan_change_scheduled','billing.plan_change_cancel_requested','billing.plan_change_canceled') or o.effective_timing='period_end')
      and (x.event_type<>'billing.plan_change_provider_applied' or o.provider_applied_at is not null))) is true relationship_valid,
    (isfinite(x.occurred_at) and x.occurred_at<=p_as_of and exists(select 1 from public.billing_plan_change_operations o where o.id=x.operation_id
      and case x.event_type when 'billing.plan_change_requested' then x.occurred_at=o.requested_at
        when 'billing.plan_change_awaiting_payment' then x.occurred_at=o.provider_applied_at
        when 'billing.plan_change_scheduled' then x.occurred_at=o.provider_applied_at
        when 'billing.plan_change_provider_applied' then x.occurred_at=o.provider_applied_at
        when 'billing.plan_change_completed' then x.occurred_at=o.completed_at
        when 'billing.plan_change_canceled' then x.occurred_at=o.canceled_at
        when 'billing.plan_change_failed' then x.occurred_at=o.failed_at
        when 'billing.plan_change_manual_review' then o.ambiguous_at is null
          or exists(select 1 from public.billing_plan_change_events e where e.operation_id=o.id and e.event_type='billing.plan_change_cancel_requested')
          or x.occurred_at=o.ambiguous_at else true end)) is true time_valid,(true) is true provenance_valid
  from public.billing_plan_change_events x
  union all
  select 'seat_event' kind,x.id::text id,(x.event_type in ('billing.seat_requested','billing.seat_provider_pending','billing.seat_awaiting_payment','billing.seat_scheduled','billing.seat_cancel_pending','billing.seat_completed','billing.seat_canceled','billing.seat_failed','billing.seat_ambiguous','billing.seat_manual_review','BILLING_SEAT_QUANTITY_PROVIDER_FAILED','BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS','BILLING_SEAT_QUANTITY_MANUAL_REVIEW','BILLING_SEAT_QUANTITY_PAYMENT_FAILED','BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT','BILLING_SEAT_QUANTITY_AWAITING_PAYMENT')) is true domain_valid,
    (exists(select 1 from public.billing_seat_quantity_operations o where o.id=x.operation_id and exists(select 1 from public.billing_provider_subscriptions b where b.id=o.billing_provider_subscription_id and b.billing_account_id=o.billing_account_id)
      and exists(select 1 from seat_audit_counts e where e.operation_id=x.operation_id and e.event_type=x.event_type and e.n=1)
      and (x.event_type not in ('billing.seat_completed','billing.seat_canceled','billing.seat_failed') or x.event_type='billing.seat_'||o.status)
      and (x.event_type<>'billing.seat_awaiting_payment' or o.direction='increase')
      and (x.event_type not in ('billing.seat_scheduled','billing.seat_cancel_pending','billing.seat_canceled') or o.direction='reduction')
      and (x.event_type<>'BILLING_SEAT_QUANTITY_PROVIDER_FAILED' or o.status in ('failed','cancel_pending','canceled')))) is true relationship_valid,
    (isfinite(x.occurred_at) and x.occurred_at<=p_as_of and exists(select 1 from public.billing_seat_quantity_operations o where o.id=x.operation_id
      and case x.event_type when 'billing.seat_provider_pending' then x.occurred_at=o.requested_at
        when 'billing.seat_awaiting_payment' then x.occurred_at=o.provider_applied_at
        when 'billing.seat_scheduled' then x.occurred_at=o.provider_applied_at
        when 'billing.seat_completed' then x.occurred_at=o.completed_at
        when 'billing.seat_canceled' then x.occurred_at=o.canceled_at
        when 'BILLING_SEAT_QUANTITY_AWAITING_PAYMENT' then o.direction='increase' and x.occurred_at=o.provider_applied_at
        when 'billing.seat_ambiguous' then exists(select 1 from public.billing_seat_quantity_events e
          where e.operation_id=o.id and e.event_type='BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS' and e.occurred_at=x.occurred_at)
        when 'BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS' then o.cancel_requested_at is not null or exists(select 1 from public.billing_seat_quantity_events e
          where e.operation_id=o.id and e.event_type='billing.seat_ambiguous' and e.occurred_at=x.occurred_at)
        when 'billing.seat_manual_review' then exists(select 1 from public.billing_seat_quantity_events e
          where e.operation_id=o.id and e.event_type='BILLING_SEAT_QUANTITY_MANUAL_REVIEW' and e.occurred_at=x.occurred_at)
        when 'BILLING_SEAT_QUANTITY_MANUAL_REVIEW' then o.cancel_requested_at is not null or exists(select 1 from public.billing_seat_quantity_events e
          where e.operation_id=o.id and e.event_type='billing.seat_manual_review' and e.occurred_at=x.occurred_at)
        when 'billing.seat_failed' then exists(select 1 from public.billing_seat_quantity_events e
          where e.operation_id=o.id and e.event_type='BILLING_SEAT_QUANTITY_PROVIDER_FAILED' and e.occurred_at=x.occurred_at)
        when 'BILLING_SEAT_QUANTITY_PROVIDER_FAILED' then o.status<>'failed' or exists(select 1 from public.billing_seat_quantity_events e
          where e.operation_id=o.id and e.event_type='billing.seat_failed' and e.occurred_at=x.occurred_at)
        else true end)) is true time_valid,(true) is true provenance_valid
  from public.billing_seat_quantity_events x
  union all
  select 'account_event' kind,x.id::text id,
    (x.source in ('first_workspace','workspace_transfer','legacy_beta_backfill','manual','billing_provider')
      and x.event_type in ('subscription.created','subscription.status_changed','subscription.plan_superseded','subscription.converted_to_paid','subscription.trial_started','subscription.complimentary_access_created')
      and jsonb_typeof(x.metadata)='object'
      and (x.from_status is null or x.from_status in ('trialing','trial_recovery','active','past_due','grace','restricted','canceled','expired','superseded'))
      and x.to_status in ('trialing','trial_recovery','active','past_due','grace','restricted','canceled','expired','superseded')
      and (x.event_type<>'subscription.created' or x.from_status is null)
      and (x.event_type<>'subscription.status_changed' or x.from_status is not null and x.from_status<>x.to_status)
      and (x.event_type not in ('subscription.plan_superseded','subscription.converted_to_paid') or x.source='billing_provider')) is true domain_valid,
    (exists(select 1 from accounts a where a.id=x.billing_account_id)
      and exists(select 1 from canonical_raw a where a.id=x.subscription_id and a.billing_account_id=x.billing_account_id
        and (x.event_type<>'subscription.created' or jsonb_typeof(x.metadata->'planVersionId')='string' and x.metadata->>'planVersionId'=a.plan_version_id::text)
        and (x.event_type<>'subscription.plan_superseded' or x.to_status='superseded' and a.status='superseded' and exists(
          select 1 from public.billing_plan_change_operations o join canonical_raw n on n.id=a.superseded_by_subscription_id
          where o.id::text=x.metadata->>'operationId' and jsonb_typeof(x.metadata->'operationId')='string'
            and o.billing_account_id=x.billing_account_id and o.source_account_subscription_id=a.id and o.status='completed'
            and o.source_plan_version_id=a.plan_version_id and o.target_plan_version_id=n.plan_version_id and n.billing_account_id=a.billing_account_id))
        and (x.event_type<>'subscription.converted_to_paid' or x.to_status='active' and exists(
          select 1 from public.billing_checkout_attempts c join public.billing_provider_subscriptions s on s.billing_account_id=c.billing_account_id
            and s.provider=c.provider and s.environment=c.environment and s.provider_subscription_id=c.completed_provider_subscription_id
          where c.id::text=x.metadata->>'checkoutAttemptId' and jsonb_typeof(x.metadata->'checkoutAttemptId')='string'
            and c.billing_account_id=x.billing_account_id and c.status='completed'
            and exists(select 1 from canonical_paths cp where cp.root_id=a.id and cp.id=s.account_subscription_id))))
      and (not x.metadata ? 'operationId' or exists(select 1 from public.billing_plan_change_operations o
        where o.id::text=x.metadata->>'operationId' and jsonb_typeof(x.metadata->'operationId')='string' and o.billing_account_id=x.billing_account_id)
        or exists(select 1 from public.billing_seat_quantity_operations o where o.id::text=x.metadata->>'operationId'
          and jsonb_typeof(x.metadata->'operationId')='string' and o.billing_account_id=x.billing_account_id))
      and (not x.metadata ? 'checkoutAttemptId' or exists(select 1 from public.billing_checkout_attempts c
        where c.id::text=x.metadata->>'checkoutAttemptId' and jsonb_typeof(x.metadata->'checkoutAttemptId')='string' and c.billing_account_id=x.billing_account_id))) is true relationship_valid,
    (isfinite(x.occurred_at) and x.occurred_at<=p_as_of) is true time_valid,true provenance_valid
  from account_events x
  union all
  select kind,id,true domain_valid,relationship_valid,true time_valid,true provenance_valid from cross_facts
),
-- One total integrity fact for every inventory root, before capability filtering.
normalized_facts as (
  select c.kind,c.id,c.domain_valid and coalesce(n.identifiers_valid,true) domain_valid,c.relationship_valid,c.time_valid,c.provenance_valid from context_facts c left join identifier_facts n using(kind,id)
  union all select 'subscription',s.id::text,s.domain_valid and q.quantity_valid and n.identifiers_valid,s.relationship_valid,s.time_valid,s.provenance_valid from subscription_facts s join quantity_facts q on q.id=s.id join identifier_facts n on n.kind='subscription' and n.id=s.id::text
  union all select 'checkout',id::text,domain_valid,relationship_valid,time_valid,provenance_valid from checkout_facts
  union all select 'plan_operation',id::text,domain_valid,relationship_valid,time_valid,provenance_valid from plan_operation_facts
  union all select 'seat_operation',id::text,domain_valid,relationship_valid,time_valid,provenance_valid from seat_operation_facts
  union all select 'webhook',id::text,
    domain_valid and exists(select 1 from identifier_facts n where n.kind='webhook' and n.id=webhook_facts.id::text and n.identifiers_valid) and (supported_shape or unsupported_ignored) and (not invoice_observation or unsupported_ignored or known_invoice_status),
    (unsupported_ignored or relationship_valid) is true,time_valid,provenance_valid from webhook_facts
), row_integrity as (
  select f.*,(domain_valid and relationship_valid and time_valid and provenance_valid) is true integrity_valid,
    array_remove(array[case when not domain_valid then 'domain' end,case when not relationship_valid then 'relationship' end,
      case when not time_valid then 'time' end,case when not provenance_valid then 'provenance' end],null) reasons
  from normalized_facts f
), subscriptions as (
  select s.*,i.integrity_valid,(i.integrity_valid and s.terminal_proof) is true closed
  from subscription_facts s join row_integrity i on i.kind='subscription' and i.id=s.id::text
), checkouts as (
  select c.*,i.integrity_valid,(i.integrity_valid and c.terminal_proof and (c.status<>'completed' or exists(select 1 from subscriptions s where s.provider=c.provider and s.environment=c.environment and s.provider_subscription_id=c.completed_provider_subscription_id and s.billing_account_id=c.billing_account_id and s.closed))) is true closed
  from checkout_facts c join row_integrity i on i.kind='checkout' and i.id=c.id::text
), operations as (
  select 'plan_operation' kind,'planOperations' category,o.id,o.billing_account_id,o.status,o.error_code,o.provider_requested_at,o.payment_confirmed_at,i.integrity_valid
  from plan_operation_facts o join row_integrity i on i.kind='plan_operation' and i.id=o.id::text
  union all select 'seat_operation','seatOperations',o.id,o.billing_account_id,o.status,o.error_code,o.provider_requested_at,o.payment_confirmed_at,i.integrity_valid
  from seat_operation_facts o join row_integrity i on i.kind='seat_operation' and i.id=o.id::text
), webhook_capabilities as (
  -- API finish writers retain subscription_id as object_id for payment_success.
  -- That overlapping shape is valid limited context, never invoice identity proof.
  select d.*,i.integrity_valid,
    case when not i.integrity_valid then 'ineligible'
      when d.payment_event and (d.event_name<>'subscription_payment_success' or d.object_id<>d.provider_subscription_id) then 'invoice_identity'
      when d.payment_event then 'api_invoice_context'
      when d.subscription_event then 'subscription_observation'
      when d.unsupported_ignored then 'unsupported_context' else 'ineligible' end capability
  from webhook_facts d join row_integrity i on i.kind='webhook' and i.id=d.id::text
), invoice_observations as (
  select d.*,d.normalized_payload->>'store_id' store_id,d.normalized_payload->>'status' invoice_status,
    (d.processing_status='processed' and d.drained and d.event_name in ('subscription_payment_success','subscription_payment_recovered')
      and d.normalized_payload->>'status'='paid') is true paid_witness,
    (d.event_name in ('subscription_payment_success','subscription_payment_recovered') and d.normalized_payload->>'status'='paid') is true compatible_paid
  from webhook_capabilities d where capability='invoice_identity'
), invoice_heads as (
  select provider,environment,store_id,object_type,object_id,provider_subscription_id,provider_customer_id,max(provider_updated_at) revision
  from invoice_observations group by 1,2,3,4,5,6,7
), invoice_ownership as (
  select provider,environment,store_id,object_type,object_id,count(distinct (provider_subscription_id,provider_customer_id))=1 ownership_valid
  from invoice_observations group by 1,2,3,4,5
), invoice_authority as (
  -- Provider revisions, never receipt/UUID/processing/insertion order. A processed
  -- witness EXISTS and ALL greatest-revision observations must be compatible.
  select h.*,
    (own.ownership_valid and count(distinct d.provider_created_at)=1
      and bool_or(d.paid_witness) filter(where d.provider_updated_at=h.revision)
      and bool_and(d.compatible_paid) filter(where d.provider_updated_at=h.revision)) is true settled,
    (not own.ownership_valid or count(distinct d.provider_created_at)<>1
      or count(distinct d.invoice_status) filter(where d.provider_updated_at=h.revision)>1
      or bool_or(d.compatible_paid) filter(where d.provider_updated_at=h.revision)
        and bool_or(d.event_name='subscription_payment_failed') filter(where d.provider_updated_at=h.revision)) is true ambiguous
  from invoice_heads h join invoice_observations d
    on (d.provider,d.environment,d.store_id,d.object_type,d.object_id,d.provider_subscription_id,d.provider_customer_id)=
       (h.provider,h.environment,h.store_id,h.object_type,h.object_id,h.provider_subscription_id,h.provider_customer_id)
  join invoice_ownership own on (own.provider,own.environment,own.store_id,own.object_type,own.object_id)=
    (h.provider,h.environment,h.store_id,h.object_type,h.object_id)
  group by h.provider,h.environment,h.store_id,h.object_type,h.object_id,h.provider_subscription_id,h.provider_customer_id,h.revision,own.ownership_valid
), webhooks as (
  select d.*,(d.capability='invoice_identity' and a.settled) is true invoice_settled
  from webhook_capabilities d left join invoice_authority a
    on (a.provider,a.environment,a.store_id,a.object_type,a.object_id,a.provider_subscription_id,a.provider_customer_id)=
      (d.provider,d.environment,d.normalized_payload->>'store_id',d.object_type,d.object_id,d.provider_subscription_id,d.provider_customer_id)
), canonical as (
  select c.*,i.integrity_valid,
    exists(select 1 from subscriptions s where s.account_subscription_id=c.id) legacy_link,
    exists(select 1 from public.billing_subscriptions_v2 v where v.account_subscription_id=c.id) paddle_link
  from canonical_attribution c join row_integrity i on i.kind='canonical' and i.id=c.id::text
), legacy_chains as (
  select c.id root_id,c.billing_account_id,c.id,c.status,c.superseded_at,c.superseded_by_subscription_id,array[c.id] path
  from canonical c where c.integrity_valid and c.storage_contract='lemonsqueezy.v1'
  union all select w.root_id,w.billing_account_id,n.id,n.status,n.superseded_at,n.superseded_by_subscription_id,w.path||n.id
  from legacy_chains w join canonical n on n.id=w.superseded_by_subscription_id and n.billing_account_id=w.billing_account_id
  where w.status='superseded' and n.integrity_valid and n.storage_contract='lemonsqueezy.v1' and not n.id=any(w.path)
), valid_legacy_history as (
  select distinct w.root_id from legacy_chains w join subscriptions s on s.account_subscription_id=w.id and s.billing_account_id=w.billing_account_id and s.closed
  where w.superseded_at is null and w.superseded_by_subscription_id is null
    and not exists(select 1 from public.billing_subscriptions_v2 v where v.account_subscription_id=any(w.path))
    and not exists(select 1 from canonical p join canonical n on n.id=p.superseded_by_subscription_id
      where p.id=any(w.path) and p.id<>w.id and not exists(
        select 1 from plan_operation_facts o join row_integrity i on i.kind='plan_operation' and i.id=o.id::text and i.integrity_valid
        where o.billing_account_id=w.billing_account_id and o.billing_provider_subscription_id=s.id
          and o.source_account_subscription_id=p.id and o.source_plan_version_id=p.plan_version_id and o.target_plan_version_id=n.plan_version_id and o.status='completed'))
), canonical_dispositions as (
  select c.*,
    (c.integrity_valid and exists(select 1 from valid_legacy_history h where h.root_id=c.id)) is true ls_closed,
    c.routed_v2 out_of_scope_non_ls
  from canonical c
), row_assessments as (
  -- Exactly one exclusive disposition for each retained row. Invalid facts stay
  -- here even when capability selection excluded them from all authority joins.
  select i.kind,i.id,i.reasons,
    case when not i.integrity_valid then 'integrity_failure'
      when i.kind='subscription' then case when s.closed then 'proven_terminal_history' else 'unresolved_obligation' end
      when i.kind='checkout' then case when co.closed then 'proven_terminal_history' else 'unresolved_obligation' end
      when i.kind in ('plan_operation','seat_operation') then case when op.status in ('completed','canceled','failed') and (op.error_code like '%AMBIGUOUS%') is not true then 'proven_terminal_history' else 'unresolved_obligation' end
      when i.kind='webhook' then case when d.drained and (d.event_name='subscription_payment_failed' or d.object_type='subscription-invoices' and d.normalized_payload->>'status' in ('pending','unpaid','past_due')) is not true then 'valid_context'
        when d.drained and d.invoice_settled then 'proven_terminal_history' else 'unresolved_obligation' end
      when i.kind='canonical' then case when ca.ls_closed then 'proven_terminal_history' when ca.out_of_scope_non_ls then 'out_of_scope_non_ls' else 'unresolved_obligation' end
      else 'valid_context' end disposition
  from row_integrity i
  left join subscriptions s on i.kind='subscription' and i.id=s.id::text
  left join checkouts co on i.kind='checkout' and i.id=co.id::text
  left join operations op on i.kind=op.kind and i.id=op.id::text
  left join webhooks d on i.kind='webhook' and i.id=d.id::text
  left join canonical_dispositions ca on i.kind='canonical' and i.id=ca.id::text
), resource_assessments as (
  select 'invoice' kind,jsonb_build_array(provider,environment,store_id,object_type,object_id,provider_subscription_id,provider_customer_id)::text id,
    case when ambiguous then 'integrity_failure' when settled then 'proven_terminal_history' else 'unresolved_obligation' end disposition
  from invoice_authority
), blocker_contributions as (
  select 'unknownStates' category,kind,id from row_assessments where disposition='integrity_failure'
  union all select 'unknownStates',kind,id from resource_assessments where disposition='integrity_failure'
  union all select 'unknownStates','subscription',id::text from subscriptions where provider_status in ('cancelled','expired') and not closed
  union all select 'unknownStates','checkout',id::text from checkouts where status='completed' and not closed
  union all select 'unknownStates','webhook',id::text from webhooks where processing_status in ('processed','ignored') and not drained
  union all select 'unknownStates','canonical',id::text from canonical_dispositions where not ls_closed and not out_of_scope_non_ls
    and (storage_contract='billing.v2' or not legacy_link)
  union all select 'subscriptions','subscription',id::text from subscriptions where not closed
  union all select 'paymentObligations','subscription',id::text from subscriptions where provider_status in ('past_due','unpaid') or canonical_status in ('past_due','grace','restricted')
  union all select 'paymentObligations',kind,id::text from operations where status='awaiting_payment'
    or error_code in ('BILLING_PLAN_CHANGE_PAYMENT_FAILED','BILLING_SEAT_QUANTITY_PAYMENT_FAILED') and payment_confirmed_at is null
  union all select 'paymentObligations','webhook',id::text from webhooks where
    (event_name='subscription_payment_failed' or object_type='subscription-invoices' and normalized_payload->>'status' in ('pending','unpaid','past_due')) and not invoice_settled
  union all select 'checkouts','checkout',id::text from checkouts where not closed
  union all select category,kind,id::text from operations where not integrity_valid or (status in ('completed','canceled','failed')) is not true or error_code like '%AMBIGUOUS%'
  union all select 'webhookWork','webhook',id::text from webhooks where not drained
  union all select 'ambiguousDispatches','checkout',id::text from checkouts where status in ('creating','ambiguous') or error_code='BILLING_CHECKOUT_CREATION_AMBIGUOUS'
    or status='failed' and not closed or status='expired' and not verified_creation
  union all select 'ambiguousDispatches',kind,id::text from operations where status in ('provider_pending','cancel_pending','ambiguous')
    or error_code like '%AMBIGUOUS%' or status in ('requested','manual_review') and provider_requested_at is not null
  union all select 'manualReview','subscription',id::text from subscriptions where reconciliation_status='manual_review'
  union all select 'manualReview',kind,id::text from operations where status='manual_review' or error_code like '%MANUAL_REVIEW%'
  union all select 'manualReview','webhook',id::text from webhooks where processing_status='ignored' and not drained
  union all select 'canonicalConflicts',kind,id from cross_facts where conflict
  union all select 'canonicalConflicts','canonical',id::text from canonical_dispositions where
    (storage_contract='lemonsqueezy.v1' or legacy_link) and (not ls_closed or paddle_link or storage_contract is distinct from 'lemonsqueezy.v1')
    or source='billing_provider' and storage_contract is null
), contributions as (
  -- Count units are retained evidence rows/resources, not distinct debts/owners.
  select distinct category,kind,id from blocker_contributions
), coverage as (
  select not exists(select 1 from inventory v left join row_assessments a using(kind,id) where a.id is null)
    and not exists(select 1 from row_assessments a left join inventory v using(kind,id) where v.id is null)
    and not exists(select 1 from inventory group by kind,id having count(*)<>1)
    and not exists(select 1 from row_assessments group by kind,id having count(*)<>1 or count(distinct disposition)<>1)
    and not exists(select 1 from row_assessments where (disposition in ('integrity_failure','unresolved_obligation','proven_terminal_history','valid_context','out_of_scope_non_ls')) is not true)
    and not exists(select 1 from resource_assessments group by kind,id having count(*)<>1 or count(distinct disposition)<>1)
    and not exists(select 1 from invoice_observations o where not exists(select 1 from invoice_authority a where (a.provider,a.environment,a.store_id,a.object_type,a.object_id,a.provider_subscription_id,a.provider_customer_id)=(o.provider,o.environment,o.store_id,o.object_type,o.object_id,o.provider_subscription_id,o.provider_customer_id)))
    and not exists(select 1 from contributions c where not exists(select 1 from row_assessments a where a.kind=c.kind and a.id=c.id)
      and not exists(select 1 from resource_assessments a where a.kind=c.kind and a.id=c.id)) complete
), categories(ordinal,category,outcome) as (
  values (1,'subscriptions','BLOCKED_BY_ACTIVE_SUBSCRIPTION'),(2,'paymentObligations','BLOCKED_BY_PAYMENT_OBLIGATION'),
    (3,'checkouts','BLOCKED_BY_CHECKOUT'),(4,'planOperations','BLOCKED_BY_PLAN_OPERATION'),(5,'seatOperations','BLOCKED_BY_SEAT_OPERATION'),
    (6,'webhookWork','BLOCKED_BY_WEBHOOK_RECONCILIATION'),(7,'ambiguousDispatches','BLOCKED_BY_AMBIGUOUS_PROVIDER_DISPATCH'),
    (8,'manualReview','BLOCKED_BY_MANUAL_REVIEW'),(9,'canonicalConflicts','BLOCKED_BY_CANONICAL_CONFLICT'),(10,'unknownStates','BLOCKED_BY_UNKNOWN_STATE')
), counts as (
  select k.*,count(c.id)+case when k.category='unknownStates' and
    (p_as_of is null or not isfinite(p_as_of) or (select complete from coverage) is not true) then 1 else 0 end n
  from categories k left join contributions c on c.category=k.category group by k.ordinal,k.category,k.outcome
)
select jsonb_build_object('contract','lemon-squeezy-retirement-disposition-v1','schemaVersion',1,
  'safeToRetire',(select complete from coverage) is true and not exists(select 1 from counts where n>0),
  'outcomes',coalesce((select jsonb_agg(outcome order by ordinal) from counts where n>0),'["SAFE_TO_RETIRE"]'::jsonb),
  'blockers',(select jsonb_object_agg(category,n) from counts))
$$;
revoke all on function public.inspect_lemon_squeezy_retirement_disposition_v1(timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.inspect_lemon_squeezy_retirement_disposition_v1(timestamptz) to service_role;
comment on function public.inspect_lemon_squeezy_retirement_disposition_v1(timestamptz) is
  'PAY-03B count-only LS-rooted read-only gate across both LS environments. Paddle finances are out of scope. Explicit finite inspection time required. No runtime retirement authority.';
commit;
