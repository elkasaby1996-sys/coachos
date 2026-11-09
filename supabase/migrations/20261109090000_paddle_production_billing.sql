-- One trusted realm per deployment. Preserve all provenance/ownership guards;
-- substitute only the former sandbox constant in this reviewed function list.
-- Existing migrations and their certification hashes stay immutable.
begin;
create function public.billing_paddle_environment_v1() returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select entitlement_environment from public.billing_runtime_policy where id=1
$$;
revoke all on function public.billing_paddle_environment_v1() from public, anon, authenticated;
grant execute on function public.billing_paddle_environment_v1() to service_role;

do $migration$
declare item record; target oid; definition text; occurrences integer;
begin
 for item in select * from (values
      ('begin_paddle_checkout_v1', 7),
      ('begin_paddle_plan_change_v1', 3),
      ('begin_paddle_seat_quantity_v1', 3),
      ('billing_paddle_initial_evidence_v1', 2),
      ('billing_paddle_initial_link_guard_v1', 3),
      ('billing_paddle_initial_payment_v1', 3),
      ('billing_paddle_initial_period_facts_v1', 3),
      ('billing_paddle_initial_proof_v1', 4),
      ('billing_paddle_lifecycle_evidence_v1', 2),
      ('billing_paddle_lifecycle_facts_v1', 5),
      ('billing_paddle_plan_cancel_item_v1', 2),
      ('billing_paddle_plan_evidence_v1', 2),
      ('billing_paddle_plan_facts_v1', 5),
      ('billing_paddle_plan_state_v1', 2),
      ('billing_paddle_reconciliation_event_v1', 1),
      ('billing_paddle_recovery_candidate_v1', 6),
      ('billing_paddle_recovery_event_v1', 1),
      ('billing_paddle_recovery_unresolved_v1', 1),
      ('billing_paddle_seat_approval_guard_v1', 1),
      ('billing_paddle_seat_evidence_v1', 2),
      ('billing_paddle_seat_facts_v1', 4),
      ('billing_paddle_seat_items_v1', 2),
      ('billing_paddle_seat_resource_updated_at_v1', 4),
      ('billing_payment_method_context_authority_v1', 2),
      ('draft_paddle_catalogue_mapping_v1', 1),
      ('fail_billing_payment_method_preparation_v1', 1),
      ('fail_paddle_plan_change_v1', 1),
      ('fail_paddle_seat_quantity_v1', 1),
      ('ingest_verified_paddle_event_v1', 20),
      ('ingest_verified_paddle_recovery_event_v1', 7),
      ('mark_paddle_checkout_ready_v1', 2),
      ('paddle_checkout_outcome_v1', 2),
      ('paddle_plan_change_context_v1', 3),
      ('paddle_seat_quantity_context_v1', 4),
      ('preview_paddle_plan_change_v1', 1),
      ('reconcile_billing_payment_method_preparation_v1', 6),
      ('reconcile_paddle_initial_purchase_event_v1', 6),
      ('reconcile_paddle_initial_purchase_v1', 2),
      ('reconcile_paddle_lifecycle_event_v1', 4),
      ('reconcile_paddle_plan_change_event_v1', 3),
      ('reconcile_paddle_seat_quantity_event_v1', 3),
      ('record_billing_payment_method_preparation_result_v1', 2),
      ('retire_paddle_catalogue_mapping_v1', 1),
      ('validate_paddle_catalogue_v1', 1)
 ) as reviewed(name, expected_occurrences)
 loop
  select p.oid into strict target from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=item.name;
  definition:=pg_get_functiondef(target);
  occurrences:=(length(definition)-length(replace(definition,quote_literal('test'),'')))/length(quote_literal('test'));
  if occurrences<>item.expected_occurrences then raise exception 'PADDLE_REALM_MIGRATION_DRIFT: %',item.name;end if;
  execute replace(definition,quote_literal('test'),'public.billing_paddle_environment_v1()');
 end loop;
end $migration$;

-- Portal authority is derived from the authenticated account owner. Provider IDs
-- and the realm never come from the browser. Ended subscriptions retain invoices.
create function public.paddle_customer_portal_context_v1(p_owner uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account uuid; s public.billing_subscriptions_v2%rowtype; customer public.billing_customers_v2%rowtype;
begin
 perform public.billing_guard_actor();
 select id into account from public.billing_accounts where owner_user_id=p_owner;
 if account is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 perform public.billing_guard_lock(account,public.billing_paddle_environment_v1());
 select * into s from public.billing_subscriptions_v2 where billing_account_id=account
  and provider='paddle' and environment=public.billing_paddle_environment_v1()
  and shadow_status='current' and reconciliation_status='processed' and account_subscription_id is not null
  order by created_at desc limit 1;
 select * into customer from public.billing_customers_v2 where id=s.customer_id and billing_account_id=account
  and provider='paddle' and environment=s.environment;
 if customer.id is null then raise exception 'BILLING_PORTAL_UNAVAILABLE';end if;
 return jsonb_build_object('environment',s.environment,'customerId',customer.provider_customer_ref,'subscriptionId',s.provider_subscription_ref);
end $$;
revoke all on function public.paddle_customer_portal_context_v1(uuid) from public,anon,authenticated;
grant execute on function public.paddle_customer_portal_context_v1(uuid) to service_role;

-- Initial plan + seat purchase: the two authenticated resources must match the
-- admitted immutable catalogue snapshot before either entitlement is granted.
CREATE OR REPLACE FUNCTION public.billing_paddle_initial_proof_v1(p_subscription uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare s public.billing_subscriptions_v2%rowtype; c public.billing_customers_v2%rowtype;
 sub public.billing_paddle_event_observations%rowtype; txn public.billing_paddle_event_observations%rowtype;
 co public.billing_checkouts_v2%rowtype; snap public.billing_paddle_checkout_snapshots%rowtype;
 m public.billing_price_mappings%rowtype; seat public.billing_price_mappings%rowtype; item jsonb; observed jsonb; se uuid; te uuid;
begin
 perform public.billing_guard_actor();
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 if s.id is null then raise exception 'PADDLE_RECONCILIATION_SUBSCRIPTION_REQUIRED'; end if;
 perform public.billing_guard_lock(s.billing_account_id,public.billing_paddle_environment_v1());
 if not (select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1) then
 raise exception 'PADDLE_RECONCILIATION_DISABLED'; end if;
 select * into s from public.billing_subscriptions_v2 where id=p_subscription for update;
 select * into c from public.billing_customers_v2 where id=s.customer_id for share;
 if (s.provider,s.environment,s.shadow_status)
 is distinct from ('paddle'::text,public.billing_paddle_environment_v1()::text,'current'::text)
 or s.reconciliation_status not in ('pending','processed')
 or c.identity_status<>'current' or c.identity_source<>'verified_provider_event'
 or (c.billing_account_id,c.provider,c.environment) is distinct from (s.billing_account_id,s.provider,s.environment)
 then raise exception 'PADDLE_RECONCILIATION_IDENTITY'; end if;
 if s.provider_status is distinct from 'active' or s.scheduled_cancel_at is not null then
 raise exception 'PADDLE_RECONCILIATION_SUBSCRIPTION_STATUS'; end if;
 -- This milestone accepts the current creation snapshot only. Later changes
 -- require their own reconciler, even if their provider status remains active.
 select o.* into sub from public.billing_paddle_event_observations o
 where o.observation->>'subscriptionRef'=s.provider_subscription_ref
 and o.observation->>'customerRef'=c.provider_customer_ref
 and o.observation->>'kind'='subscription.created' and o.disposition='correlated'
 and (o.observation->>'occurredAt')::timestamptz=s.provider_updated_at
 order by o.created_at,o.event_id limit 1;
 if sub.event_id is null or sub.observation->>'status' is distinct from 'active' then
 raise exception 'PADDLE_RECONCILIATION_SUBSCRIPTION_PROOF'; end if;
 select * into co from public.billing_checkouts_v2 where id=sub.checkout_id for update;
 if co.id is null or (co.billing_account_id,co.provider,co.environment,co.cadence)
 is distinct from (s.billing_account_id,'paddle'::text,public.billing_paddle_environment_v1()::text,co.cadence)
 or co.provider_transaction_ref is null or co.provider_transaction_ref is distinct from sub.observation->>'transactionCorrelationRef'
 or co.requested_additional_seats<0 or co.requested_additional_seats>5
 or (co.seat_mapping_id is null)<>(co.requested_additional_seats=0)
 or s.approved_additional_coach_seats<>(case when s.reconciliation_status='processed' then co.requested_additional_seats else 0 end)
 or co.requested_additional_seats>(select max_coach_seats-included_coach_seats from public.commercial_plan_versions where id=co.plan_version_id)
 or (co.completed_subscription_id is not null and co.completed_subscription_id<>s.id)
 then raise exception 'PADDLE_RECONCILIATION_CHECKOUT'; end if;
 if exists(select 1 from public.billing_paddle_checkout_certification_fixtures where checkout_id=co.id) then
 raise exception 'PADDLE_RECONCILIATION_CERTIFICATION'; end if;
 if exists(select 1 from public.billing_paddle_event_observations o join public.billing_webhook_events_v2 e on e.id=o.event_id
 where (o.checkout_id=co.id or o.observation->>'subscriptionRef'=s.provider_subscription_ref
 or o.observation->>'transactionRef'=co.provider_transaction_ref)
 and (o.disposition in ('pending','manual_review') or e.processing_status in ('manual_review','failed'))) then
 raise exception 'PADDLE_RECONCILIATION_MANUAL_REVIEW'; end if;
 select o.* into txn from public.billing_paddle_event_observations o
 where o.checkout_id=co.id and o.disposition='correlated'
 and o.observation->>'kind'='transaction.completed'
 and o.observation->>'transactionRef'=co.provider_transaction_ref
 and o.observation->>'subscriptionRef'=s.provider_subscription_ref
 and o.observation->>'customerRef'=c.provider_customer_ref
 order by o.created_at,o.event_id limit 1;
 if txn.event_id is null or txn.observation->>'status' is distinct from 'completed'
 or txn.observation->>'currency' is distinct from 'USD' then
 raise exception 'PADDLE_RECONCILIATION_PAYMENT_PROOF'; end if;
 se:=public.billing_paddle_reconciliation_event_v1(sub.event_id);
 te:=public.billing_paddle_reconciliation_event_v1(txn.event_id);
 select * into m from public.billing_price_mappings where id=co.base_mapping_id for share;
 select * into snap from public.billing_paddle_checkout_snapshots where checkout_id=co.id;
 if m.id is null or snap.checkout_id is null
 or (m.provider,m.environment,m.identity_kind,m.canonical_key,m.cadence,m.currency_code,m.plan_version_id)
 is distinct from ('paddle'::text,public.billing_paddle_environment_v1()::text,'plan'::text,(select plan_key from public.commercial_plan_versions where id=co.plan_version_id),co.cadence,'USD'::text,co.plan_version_id)
 or m.status not in ('active','retired') or m.catalogue_evidence_id is null
 or (m.status='retired' and m.retired_at<=co.created_at)
 or (snap.base_price_ref,snap.base_product_ref,snap.base_evidence_id)
 is distinct from (m.provider_price_ref,m.provider_product_ref,m.catalogue_evidence_id)
 or (co.requested_additional_seats=0 and (snap.seat_price_ref is not null or snap.seat_product_ref is not null or snap.seat_evidence_id is not null)) then
 raise exception 'PADDLE_RECONCILIATION_MAPPING'; end if;
 perform public.billing_catalogue_assert_mapping_v1(m);
 if co.requested_additional_seats>0 then
  select * into seat from public.billing_price_mappings where id=co.seat_mapping_id for share;
  if seat.id is null or (seat.provider,seat.environment,seat.identity_kind,seat.canonical_key,seat.cadence,seat.currency_code)
   is distinct from ('paddle'::text,s.environment,'addon'::text,'coach-seat'::text,co.cadence,'USD'::text)
   or seat.status not in ('active','retired') or seat.catalogue_evidence_id is null
   or (seat.status='retired' and seat.retired_at<=co.created_at)
   or (snap.seat_price_ref,snap.seat_product_ref,snap.seat_evidence_id)
   is distinct from (seat.provider_price_ref,seat.provider_product_ref,seat.catalogue_evidence_id)
  then raise exception 'PADDLE_RECONCILIATION_MAPPING';end if;
  perform public.billing_catalogue_assert_mapping_v1(seat);
 end if;
 if co.cadence not in ('monthly','annual') or m.canonical_key not in ('launch','growth','scale') then
 raise exception 'PADDLE_RECONCILIATION_MAPPING'; end if;
 if co.cadence='annual' and not public.billing_paddle_initial_period_matches_v1(m.id,txn.observation->'billingPeriod',
 (select occurred_at from public.billing_webhook_events_v2 where id=txn.event_id)) then
 raise exception 'PADDLE_INITIAL_PERIOD_BOUNDS'; end if;

 -- Exact cardinality and unique price matching make item order irrelevant.
 -- Both signed resources must attest the base plan and every purchased seat.
 foreach observed in array array[sub.observation,txn.observation] loop
 if jsonb_typeof(observed->'items') is distinct from 'array' or jsonb_array_length(observed->'items')<>(case when co.requested_additional_seats>0 then 2 else 1 end) then
 raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
 if (select count(*) from jsonb_array_elements(observed->'items') i where i->>'priceRef'=m.provider_price_ref)<>1 then raise exception 'PADDLE_RECONCILIATION_ITEMS';end if;
 select i into item from jsonb_array_elements(observed->'items') i where i->>'priceRef'=m.provider_price_ref;
 if (item->>'priceRef',item->>'productRef',item->>'quantity',item#>>'{unitPrice,currency}',item#>>'{unitPrice,amount}')
 is distinct from (m.provider_price_ref::text,m.provider_product_ref::text,'1'::text,'USD'::text,m.unit_amount_minor::text)
 or (observed->>'kind'='subscription.created' and item->>'status' is distinct from 'active') then
 raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
 if co.requested_additional_seats>0 then
  if (select count(*) from jsonb_array_elements(observed->'items') i where i->>'priceRef'=seat.provider_price_ref)<>1 then raise exception 'PADDLE_RECONCILIATION_ITEMS';end if;
  select i into item from jsonb_array_elements(observed->'items') i where i->>'priceRef'=seat.provider_price_ref;
  if (item->>'priceRef',item->>'productRef',item->>'quantity',item#>>'{unitPrice,currency}',item#>>'{unitPrice,amount}')
   is distinct from (seat.provider_price_ref::text,seat.provider_product_ref::text,co.requested_additional_seats::text,'USD'::text,seat.unit_amount_minor::text)
   or (observed->>'kind'='subscription.created' and item->>'status' is distinct from 'active')
  then raise exception 'PADDLE_RECONCILIATION_ITEMS';end if;
 end if;
 end loop;
 -- Occurrence timestamps do not establish billing periods. Check only the
 -- relationships actually represented by retained facts.
 if s.provider_created_at>s.provider_updated_at
 or s.current_period_ends_at<=s.current_period_started_at then raise exception 'PADDLE_RECONCILIATION_DATES'; end if;
 return jsonb_build_object('schema','paddle-initial-purchase-v1','operation','initial_purchase',
 'subscriptionId',s.id,'billingAccountId',s.billing_account_id,'checkoutId',co.id,
 'subscriptionEventId',sub.event_id,'transactionEventId',txn.event_id,
 'subscriptionVerifiedEvidenceId',se,'transactionVerifiedEvidenceId',te,
 'subscriptionObservationSha256',sub.observation_sha256,'transactionObservationSha256',txn.observation_sha256,
 'mappingId',m.id,'catalogueEvidenceId',m.catalogue_evidence_id,'planVersionId',m.plan_version_id,
 'cadence',m.cadence,'currency',m.currency_code,'amountMinor',m.unit_amount_minor,
 'quantity',1,'approvedAdditionalCoachSeats',co.requested_additional_seats)
 ||case when co.requested_additional_seats>0 then jsonb_build_object('seatMappingId',seat.id,'seatCatalogueEvidenceId',seat.catalogue_evidence_id,'seatAmountMinor',seat.unit_amount_minor) else '{}'::jsonb end;
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_paddle_initial_item_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare e public.billing_evidence_v2%rowtype; s public.billing_subscriptions_v2%rowtype;
begin
 select * into e from public.billing_evidence_v2 where id=new.evidence_id;
 select * into s from public.billing_subscriptions_v2 where id=new.subscription_id;
 if e.proof_schema='paddle-initial-purchase-v1' or s.account_subscription_id is not null then
 if e.proof_schema is distinct from 'paddle-initial-purchase-v1' or e.proof_kind<>'subscription'
 or new.cadence is distinct from e.proof#>>'{observation,cadence}'
 or not coalesce((new.item_role='base_plan' and new.quantity=1 and new.mapping_id=(e.proof#>>'{observation,mappingId}')::uuid)
  or (new.item_role='coach_seat' and new.quantity=(e.proof#>>'{observation,approvedAdditionalCoachSeats}')::integer
   and new.quantity>0 and new.mapping_id=(e.proof#>>'{observation,seatMappingId}')::uuid),false)
 or new.billing_account_id is distinct from (e.proof#>>'{observation,billingAccountId}')::uuid
 then raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_paddle_initial_link_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare e public.billing_evidence_v2%rowtype; facts jsonb;
begin
 if exists(select 1 from public.billing_evidence_v2 where id=new.latest_evidence_id and proof_schema='paddle-seat-quantity-v1') then
  -- The dedicated proof guard checks this same row in this transaction.
  return new;
 end if;
 if new.account_subscription_id is not null and exists(select 1 from public.billing_evidence_v2 where id=new.latest_evidence_id and proof_schema='paddle-plan-change-v1') then
  select * into e from public.billing_evidence_v2 where id=new.latest_evidence_id;facts:=e.proof->'observation';
  if tg_op<>'UPDATE' or e.proof_kind<>'subscription' or e.subscription_id<>new.id or new.environment<>public.billing_paddle_environment_v1() or new.shadow_status<>'current'
  or new.reconciliation_status<>'processed' or new.approved_additional_coach_seats<>0 or new.latest_snapshot_sha256 is distinct from e.normalized_sha256
  or new.provider_updated_at is distinct from (facts->>'providerUpdatedAt')::timestamptz or new.provider_status is distinct from facts->>'providerStatus'
  or new.current_period_started_at is distinct from (facts->>'periodStart')::timestamptz or new.current_period_ends_at is distinct from (facts->>'periodEnd')::timestamptz
  or new.scheduled_cancel_at is not null
  or not exists(select 1 from public.billing_operations_v2 o join public.account_subscriptions source on source.id=o.source_account_subscription_id
   join public.account_subscriptions target on target.id=new.account_subscription_id
   where o.id=(facts->>'operationId')::uuid and o.subscription_id=new.id and o.billing_account_id=new.billing_account_id and o.status in ('awaiting_payment','scheduled','completed')
   and source.status='superseded' and source.superseded_by_subscription_id=target.id and target.billing_account_id=new.billing_account_id
   and target.plan_version_id=(facts->>'targetPlanVersionId')::uuid and target.status=facts->>'providerStatus' and target.subscription_kind='paid'
   and target.current_period_started_at is not distinct from new.current_period_started_at and target.current_period_ends_at is not distinct from new.current_period_ends_at
   and (o.effective_timing='period_end' and o.effective_at<=public.billing_paddle_plan_now_v1() or exists(select 1 from public.billing_payment_applications_v2 p where p.operation_id=o.id and p.application_kind='plan_change'))
   and old.account_subscription_id in (source.id,target.id)) then raise exception 'PADDLE_PLAN_LINK_PROOF';end if;
  return new;
 end if;
 
 if tg_op='UPDATE' and old.account_subscription_id is not null and new.account_subscription_id is distinct from old.account_subscription_id then
 raise exception 'PADDLE_RECONCILIATION_LINK_IMMUTABLE'; end if;
 if new.account_subscription_id is null then return new; end if;
 select * into e from public.billing_evidence_v2 where id=new.latest_evidence_id;
 facts:=e.proof->'observation';
 if e.proof_schema='paddle-subscription-lifecycle-v1' then
  if tg_op<>'UPDATE' or old.account_subscription_id is null or new.account_subscription_id<>old.account_subscription_id
  or new.shadow_status<>'current' or new.reconciliation_status<>'processed' or new.environment<>public.billing_paddle_environment_v1()
  or new.approved_additional_coach_seats is distinct from (facts->>'approvedSeats')::integer or e.proof_kind<>'subscription' or e.subscription_id<>new.id
  or new.latest_snapshot_sha256 is distinct from e.normalized_sha256
  or (facts->>'canonicalId')::uuid is distinct from new.account_subscription_id
  or (facts->>'billingAccountId')::uuid is distinct from new.billing_account_id
  or new.provider_status is distinct from facts->>'providerStatus'
  or new.provider_updated_at is distinct from (facts->>'providerUpdatedAt')::timestamptz
  or new.current_period_started_at is distinct from (facts->>'periodStart')::timestamptz
  or new.current_period_ends_at is distinct from (facts->>'periodEnd')::timestamptz
  or new.scheduled_cancel_at is distinct from (facts->>'scheduledCancelAt')::timestamptz
  or not exists(select 1 from public.account_subscriptions a where a.id=new.account_subscription_id
   and a.billing_account_id=new.billing_account_id and a.subscription_kind='paid' and a.source='billing_provider'
   and a.plan_version_id=(facts->>'planVersionId')::uuid and a.status=facts->>'canonicalStatus'
   and a.current_period_started_at is not distinct from (facts->>'periodStart')::timestamptz
   and a.current_period_ends_at is not distinct from (facts->>'periodEnd')::timestamptz
   and a.cancel_at_period_end=(facts->>'scheduledCancelAt' is not null))
  or not exists(select 1 from public.billing_payment_applications_v2 p join public.billing_evidence_v2 pe on pe.id=p.evidence_id
   where p.subscription_id=new.id and p.application_kind='initial_purchase' and pe.proof_schema='paddle-initial-purchase-v1'
   and (facts->>'planVersionId')::uuid=(select plan_version_id from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(new.id)))
  or (facts->'renewal'='true'::jsonb and not exists(select 1 from public.billing_payment_applications_v2 p
   join public.billing_evidence_v2 pe on pe.id=p.evidence_id where p.subscription_id=new.id and p.application_kind='renewal'
   and pe.proof_schema='paddle-subscription-lifecycle-v1' and pe.proof->'observation'=facts))
  then raise exception 'PADDLE_LIFECYCLE_LINK_PROOF'; end if;
  return new;
 end if;

 if new.shadow_status<>'current' or new.reconciliation_status<>'processed' or new.environment<>public.billing_paddle_environment_v1()
 or new.approved_additional_coach_seats is distinct from (facts->>'approvedAdditionalCoachSeats')::integer or e.proof_schema is distinct from 'paddle-initial-purchase-v1'
 or e.proof_kind is distinct from 'subscription' or e.subscription_id is distinct from new.id
 or new.latest_snapshot_sha256 is distinct from e.normalized_sha256
 or not exists(select 1 from public.account_subscriptions a where a.id=new.account_subscription_id
 and a.billing_account_id=new.billing_account_id and a.subscription_kind='paid' and a.status='active'
 and a.plan_version_id=(facts->>'planVersionId')::uuid and a.source='billing_provider')
 or not exists(select 1 from public.billing_payment_applications_v2 p join public.billing_evidence_v2 pe on pe.id=p.evidence_id
 where p.subscription_id=new.id and p.billing_account_id=new.billing_account_id and p.application_kind='initial_purchase'
 and p.checkout_id=(facts->>'checkoutId')::uuid and pe.proof_schema='paddle-initial-purchase-v1'
 and pe.proof->'observation'=facts)
 then raise exception 'PADDLE_RECONCILIATION_LINK_PROOF'; end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_paddle_seat_approval_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare e public.billing_evidence_v2%rowtype;o public.billing_operations_v2%rowtype;f jsonb;begin
 if tg_op='INSERT' then
  if new.approved_additional_coach_seats<>0 then raise exception 'PADDLE_SEAT_APPROVAL_PROOF' using errcode='23514';end if;return new;
 end if;
 select * into e from public.billing_evidence_v2 where id=new.latest_evidence_id;f:=e.proof->'observation';
 if e.proof_schema='paddle-initial-purchase-v1' then
  if e.proof_kind<>'subscription' or e.subscription_id<>new.id or new.environment<>public.billing_paddle_environment_v1()
   or new.reconciliation_status<>'processed' or new.shadow_status<>'current'
   or old.approved_additional_coach_seats not in (0,new.approved_additional_coach_seats)
   or new.approved_additional_coach_seats is distinct from (f->>'approvedAdditionalCoachSeats')::integer
   or new.latest_snapshot_sha256 is distinct from e.normalized_sha256
   or not exists(select 1 from public.billing_payment_applications_v2 pa join public.billing_evidence_v2 pe on pe.id=pa.evidence_id
    where pa.subscription_id=new.id and pa.application_kind='initial_purchase' and pa.checkout_id=(f->>'checkoutId')::uuid and pe.proof->'observation'=f)
  then raise exception 'PADDLE_SEAT_APPROVAL_PROOF';end if;
 elsif e.proof_schema='paddle-seat-quantity-v1' then
  select * into o from public.billing_operations_v2 where id=(f->>'operationId')::uuid;
  if e.proof_kind<>'subscription' or e.subscription_id<>new.id or new.account_subscription_id is distinct from old.account_subscription_id
  or new.shadow_status<>'current' or new.environment<>public.billing_paddle_environment_v1() or new.reconciliation_status<>'processed'
  or o.operation_kind<>'seat_quantity' or o.source_account_subscription_id<>new.account_subscription_id or o.subscription_id<>new.id
  or o.last_evidence_id<>e.id or o.source_additional_seats<>old.approved_additional_coach_seats
  or new.current_period_started_at is distinct from old.current_period_started_at or new.current_period_ends_at is distinct from old.current_period_ends_at
  or new.provider_updated_at is distinct from (f->>'providerUpdatedAt')::timestamptz or new.provider_status<>'active' or new.scheduled_cancel_at is not null
  or new.latest_snapshot_sha256 is distinct from e.normalized_sha256
  or not ((o.status='scheduled' and o.effective_timing='period_end' and new.approved_additional_coach_seats=old.approved_additional_coach_seats)
   or (o.status='awaiting_payment' and o.effective_timing='immediate' and new.approved_additional_coach_seats=o.target_additional_seats
    and exists(select 1 from public.billing_payment_applications_v2 pa join public.billing_evidence_v2 pe on pe.id=pa.evidence_id
     where pa.operation_id=o.id and pa.application_kind='seat_increase' and pe.proof->'observation'=f)))
  then raise exception 'PADDLE_SEAT_APPROVAL_PROOF';end if;
 elsif new.approved_additional_coach_seats<>old.approved_additional_coach_seats then
  select * into o from public.billing_operations_v2 where subscription_id=new.id and operation_kind='seat_quantity' and status='scheduled';
  if e.proof_schema is distinct from 'paddle-subscription-lifecycle-v1' or o.id is null or o.effective_timing<>'period_end'
  or o.source_additional_seats<>old.approved_additional_coach_seats or o.target_additional_seats<>new.approved_additional_coach_seats
  or new.approved_additional_coach_seats is distinct from (f->>'approvedSeats')::integer or new.current_period_started_at is distinct from o.effective_at
  or e.subscription_id<>new.id or e.proof_kind<>'subscription' or f->'renewal' is distinct from 'true'::jsonb
  or not exists(select 1 from public.billing_payment_applications_v2 pa join public.billing_evidence_v2 pe on pe.id=pa.evidence_id
   where pa.subscription_id=new.id and pa.application_kind='renewal' and pe.proof->'observation'=f)
  then raise exception 'PADDLE_SEAT_APPROVAL_PROOF';end if;
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.reconcile_paddle_initial_purchase_v1(p_subscription uuid, p_operation text DEFAULT 'initial_purchase'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare facts jsonb; s public.billing_subscriptions_v2%rowtype; canonical uuid; se uuid; te uuid; payment uuid; checkout public.billing_checkouts_v2%rowtype;
 current_ids uuid[]; trial public.account_subscriptions%rowtype;
 conversion_at timestamptz:=transaction_timestamp();
begin
 perform public.billing_guard_actor();
 if p_operation is distinct from 'initial_purchase' then raise exception 'PADDLE_RECONCILIATION_OPERATION'; end if;
 facts:=public.billing_paddle_initial_proof_v1(p_subscription);
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 select * into strict checkout from public.billing_checkouts_v2 where id=(facts->>'checkoutId')::uuid;
 if checkout.status not in ('ready','completed') or
 (checkout.status='completed' and (checkout.completed_subscription_id is distinct from s.id
 or checkout.completed_at is null or s.reconciliation_status<>'processed')) then
 raise exception 'PADDLE_RECONCILIATION_CHECKOUT_STATE'; end if;
 if s.reconciliation_status='processed' then
 if s.account_subscription_id is null or not exists(select 1 from public.billing_evidence_v2 e
 where e.id=s.latest_evidence_id and e.proof_schema='paddle-initial-purchase-v1' and e.proof->'observation'=facts)
 or not exists(select 1 from public.billing_payment_applications_v2 p join public.billing_evidence_v2 e on e.id=p.evidence_id
 where p.subscription_id=s.id and p.billing_account_id=s.billing_account_id and p.provider='paddle' and p.environment=public.billing_paddle_environment_v1()
 and p.checkout_id=(facts->>'checkoutId')::uuid and p.application_kind='initial_purchase'
 and e.proof_schema='paddle-initial-purchase-v1' and e.proof->'observation'=facts)
 or not exists(select 1 from public.account_subscriptions a join public.billing_canonical_origins o on o.account_subscription_id=a.id
 where a.id=s.account_subscription_id and a.billing_account_id=s.billing_account_id and a.subscription_kind='paid'
 and a.status='active' and a.plan_version_id=(facts->>'planVersionId')::uuid and o.storage_contract='billing.v2')
 or not exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id and item_role='base_plan'
 and quantity=1 and cadence=facts->>'cadence' and mapping_id=(facts->>'mappingId')::uuid and evidence_id=s.latest_evidence_id)
 or (select count(*) from public.billing_subscription_items_v2 where subscription_id=s.id)<>(case when (facts->>'approvedAdditionalCoachSeats')::integer>0 then 2 else 1 end)
 or ((facts->>'approvedAdditionalCoachSeats')::integer>0 and not exists(select 1 from public.billing_subscription_items_v2
 where subscription_id=s.id and item_role='coach_seat' and quantity=(facts->>'approvedAdditionalCoachSeats')::integer
 and mapping_id=(facts->>'seatMappingId')::uuid and evidence_id=s.latest_evidence_id)) then
 raise exception 'PADDLE_RECONCILIATION_RETRY_MISMATCH'; end if;
 -- Application lifecycle time, not a fabricated provider timestamp. The proof
 -- helper holds the account and checkout locks for this entire transaction.
 if checkout.status='ready' then
 update public.billing_checkouts_v2 set status='completed',completed_subscription_id=s.id,
 completed_at=clock_timestamp(),updated_at=clock_timestamp(),error_code=null where id=checkout.id;
 end if;
 return jsonb_build_object('success',true,'reused',true);
 end if;
 if s.account_subscription_id is not null then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 -- The proof helper already owns policy -> account -> shadow/checkout locks.
 -- Re-read and lock canonical authority only after that account serialization.
 select array_agg(id) into current_ids from (
 select id from public.account_subscriptions where billing_account_id=s.billing_account_id
 and status in ('trialing','trial_recovery','active','past_due','grace','restricted')
 order by id for update) current_rows;
 if cardinality(current_ids)>1 then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 if cardinality(current_ids)=1 then
 select * into strict trial from public.account_subscriptions where id=current_ids[1];
 -- Only normal RepSync trials, including their recovery window. Immutable
 -- published policy/dates remain authoritative, even after policy retirement.
 if trial.subscription_kind<>'trial' or trial.status not in ('trialing','trial_recovery')
 or trial.source not in ('first_workspace','workspace_transfer')
 or trial.canceled_at is not null or trial.expired_at is not null or trial.restricted_at is not null
 or trial.current_period_started_at is not null or trial.current_period_ends_at is not null
 or trial.cancel_at_period_end or trial.trial_started_at>conversion_at
 or public.effective_account_subscription_status(trial.subscription_kind,trial.status,
 trial.trial_ends_at,trial.trial_recovery_ends_at,conversion_at) not in ('trialing','trial_recovery')
 or (trial.status='trial_recovery' and conversion_at<trial.trial_ends_at)
 or not exists(select 1 from public.commercial_trial_policy_versions p
 where p.id=trial.trial_policy_version_id and p.status in ('active','retired')
 and p.feature_plan_version_id=trial.plan_version_id
 and trial.trial_ends_at=trial.trial_started_at+make_interval(days=>p.duration_days)
 and trial.trial_recovery_ends_at=trial.trial_ends_at+make_interval(days=>p.recovery_days))
 or exists(select 1 from public.billing_canonical_origins where account_subscription_id=trial.id)
 then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 end if;
 if exists(select 1 from public.billing_provider_subscriptions where billing_account_id=s.billing_account_id
 and provider_status not in ('expired','cancelled'))
 or exists(select 1 from public.billing_subscriptions_v2 where billing_account_id=s.billing_account_id and account_subscription_id is not null)
 then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 if exists(select 1 from public.billing_payment_applications_v2 where checkout_id=(facts->>'checkoutId')::uuid
 or provider_transaction_ref=(select provider_transaction_ref from public.billing_checkouts_v2 where id=(facts->>'checkoutId')::uuid)) then
 raise exception 'PADDLE_RECONCILIATION_PAYMENT_CONSUMED'; end if;
 if exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id) then
 raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
 -- Terminalization and every subsequent proof/authority/audit write share this
 -- transaction. No exception handler may retain a partially converted trial.
 if trial.id is not null then
 update public.account_subscriptions set status='canceled',canceled_at=conversion_at,
 status_changed_at=conversion_at where id=trial.id;
 end if;
 se:=public.billing_paddle_initial_evidence_v1(s.id,'subscription');
 te:=public.billing_paddle_initial_evidence_v1(s.id,'transaction');
 payment:=public.billing_paddle_initial_payment_v1(s.id,te);
 -- Reuse canonical table constraints/history/audit, not LS proof semantics.
 insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
 values(s.billing_account_id,(facts->>'planVersionId')::uuid,'paid','active','billing_provider') returning id into canonical;
 perform public.billing_guard_claim_canonical(s.billing_account_id,canonical,'billing.v2');
 insert into public.billing_subscription_items_v2(subscription_id,billing_account_id,provider,environment,item_role,mapping_id,cadence,mapping_kind,quantity,evidence_id)
 values(s.id,s.billing_account_id,'paddle',public.billing_paddle_environment_v1(),'base_plan',(facts->>'mappingId')::uuid,facts->>'cadence','plan',1,se);
 if (facts->>'approvedAdditionalCoachSeats')::integer>0 then
 insert into public.billing_subscription_items_v2(subscription_id,billing_account_id,provider,environment,item_role,mapping_id,cadence,mapping_kind,quantity,evidence_id)
 values(s.id,s.billing_account_id,'paddle',s.environment,'coach_seat',(facts->>'seatMappingId')::uuid,facts->>'cadence','addon',(facts->>'approvedAdditionalCoachSeats')::integer,se);
 end if;
 update public.billing_subscriptions_v2 set account_subscription_id=canonical,latest_evidence_id=se,
 approved_additional_coach_seats=(facts->>'approvedAdditionalCoachSeats')::integer,
 latest_snapshot_sha256=(select normalized_sha256 from public.billing_evidence_v2 where id=se),
 last_reconciled_at=clock_timestamp(),reconciliation_status='processed',reconciliation_error_code=null,updated_at=clock_timestamp()
 where id=s.id;
 -- Existing deferred item-set constraints validate at commit. Any error rolls
 -- back evidence, application, canonical row, origin, item and link together.
 -- Application lifecycle time, not a fabricated provider timestamp. The proof
 -- helper holds the account and checkout locks for this entire transaction.
 if checkout.status='ready' then
 update public.billing_checkouts_v2 set status='completed',completed_subscription_id=s.id,
 completed_at=clock_timestamp(),updated_at=clock_timestamp(),error_code=null where id=checkout.id;
 end if;
 if trial.id is not null then
 -- Existing triggers record the trial status change and paid-row creation.
 -- This single semantic event links those two records without duplicating them.
 insert into public.account_subscription_events(billing_account_id,subscription_id,event_type,
 to_status,source,metadata,occurred_at)
 values(s.billing_account_id,canonical,'subscription.converted_to_paid','active','billing_provider',
 jsonb_build_object('previousKind','trial','previousSubscriptionId',trial.id,'checkoutAttemptId',checkout.id),conversion_at);
 end if;
 perform public.bootstrap_paddle_initial_period_v1(s.id);
 return jsonb_build_object('success',true,'reused',false);
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_paddle_initial_period_facts_v1(p_subscription uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare s public.billing_subscriptions_v2%rowtype; a public.account_subscriptions%rowtype;
 p public.billing_payment_applications_v2%rowtype; e public.billing_evidence_v2%rowtype;
 facts jsonb; o jsonb; start_at timestamptz; end_at timestamptz; settled_at timestamptz;
begin
 perform public.billing_guard_actor();
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 perform public.billing_guard_lock(s.billing_account_id,public.billing_paddle_environment_v1());
 select * into s from public.billing_subscriptions_v2 where id=p_subscription for update;
 if s.id is null or (s.provider,s.environment,s.shadow_status,s.reconciliation_status,s.provider_status)
 is distinct from ('paddle'::text,public.billing_paddle_environment_v1()::text,'current'::text,'processed'::text,'active'::text)
 or s.account_subscription_id is null or s.scheduled_cancel_at is not null
 then raise exception 'PADDLE_INITIAL_PERIOD_INELIGIBLE'; end if;
 select * into a from public.account_subscriptions where id=s.account_subscription_id for update;
 if a.id is null or a.billing_account_id is distinct from s.billing_account_id
 or (a.subscription_kind,a.status,a.source) is distinct from ('paid'::text,'active'::text,'billing_provider'::text)
 or a.cancel_at_period_end or a.canceled_at is not null or a.expired_at is not null or a.restricted_at is not null
 or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=a.id
 and billing_account_id=s.billing_account_id and storage_contract='billing.v2')
 or exists(select 1 from public.account_subscriptions where billing_account_id=s.billing_account_id and id<>a.id
 and status in ('trialing','trial_recovery','active','past_due','grace','restricted'))
 or exists(select 1 from public.billing_provider_subscriptions where billing_account_id=s.billing_account_id and provider_status not in ('expired','cancelled'))
 or exists(select 1 from public.billing_operations_v2 where billing_account_id=s.billing_account_id and status not in ('completed','canceled','failed'))
 or exists(select 1 from public.billing_evidence_v2 where subscription_id=s.id and proof_schema<>'paddle-initial-purchase-v1')
 then raise exception 'PADDLE_INITIAL_PERIOD_INELIGIBLE'; end if;
 if (select count(*) from public.billing_payment_applications_v2 where subscription_id=s.id)<>1 then
 raise exception 'PADDLE_INITIAL_PERIOD_PAYMENT'; end if;
 select * into p from public.billing_payment_applications_v2 where subscription_id=s.id and application_kind='initial_purchase';
 select * into e from public.billing_evidence_v2 where id=p.evidence_id;
 facts:=public.billing_paddle_initial_proof_v1(s.id);
 if p.id is null or (p.provider,p.environment,p.billing_account_id,p.checkout_id,p.provider_transaction_ref)
 is distinct from ('paddle'::text,public.billing_paddle_environment_v1()::text,s.billing_account_id,(facts->>'checkoutId')::uuid,e.provider_transaction_ref)
 or e.proof_schema is distinct from 'paddle-initial-purchase-v1' or e.proof_kind is distinct from 'transaction'
 or e.subscription_id is distinct from s.id or e.event_id is distinct from (facts->>'transactionEventId')::uuid
 or e.proof->'observation' is distinct from facts or a.plan_version_id is distinct from (facts->>'planVersionId')::uuid
 or not exists(select 1 from public.billing_evidence_v2 se where se.id=s.latest_evidence_id and se.subscription_id=s.id
 and se.proof_schema='paddle-initial-purchase-v1' and se.proof_kind='subscription' and se.proof->'observation'=facts
 and se.normalized_sha256=s.latest_snapshot_sha256)
 or (select count(*) from public.billing_subscription_items_v2 where subscription_id=s.id)<>(case when (facts->>'approvedAdditionalCoachSeats')::integer>0 then 2 else 1 end)
 or ((facts->>'approvedAdditionalCoachSeats')::integer>0 and not exists(select 1 from public.billing_subscription_items_v2
 where subscription_id=s.id and item_role='coach_seat' and quantity=(facts->>'approvedAdditionalCoachSeats')::integer
 and mapping_id=(facts->>'seatMappingId')::uuid and evidence_id=s.latest_evidence_id))
 or not exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id and item_role='base_plan'
 and quantity=1 and cadence=facts->>'cadence' and mapping_id=(facts->>'mappingId')::uuid and evidence_id=s.latest_evidence_id)
 or not exists(select 1 from public.billing_checkouts_v2 where id=p.checkout_id and billing_account_id=s.billing_account_id
 and status='completed' and completed_subscription_id=s.id and provider_transaction_ref=p.provider_transaction_ref)
 then raise exception 'PADDLE_INITIAL_PERIOD_PAYMENT'; end if;
 -- Known stale observations remain audit history, not superseding authority.
 -- Linked ingress retains old updates as correlated: exclude those only when
 -- both authenticated clocks are strictly behind the stored provider revision.
 -- Pending/manual-review, equal-time, missing-clock and newer state still veto.
 if exists(select 1 from public.billing_paddle_event_observations po where po.observation->>'subscriptionRef'=s.provider_subscription_ref
 and po.observation->>'kind'='subscription.updated'
 and po.disposition<>'stale'
 and not case when po.disposition='correlated'
 and jsonb_typeof(po.observation->'updatedAt')='string'
 and jsonb_typeof(po.observation->'occurredAt')='string'
 then coalesce(public.billing_paddle_timestamp_v1(po.observation->'updatedAt')<s.provider_updated_at
 and public.billing_paddle_timestamp_v1(po.observation->'occurredAt')<s.provider_updated_at,false)
 else false end) then
 raise exception 'PADDLE_INITIAL_PERIOD_SUPERSEDED'; end if;
 select observation into o from public.billing_paddle_event_observations where event_id=e.event_id;
 -- Revalidate delivery/observation provenance, including the immutable digest.
 perform public.billing_paddle_reconciliation_event_v1(e.event_id);
 if o->'billingPeriod' is null or o->'billingPeriod'='null'::jsonb then return null; end if;
 perform public.billing_paddle_lifecycle_shape_v1(o);
 start_at:=public.billing_paddle_timestamp_v1(o#>'{billingPeriod,startsAt}');
 end_at:=public.billing_paddle_timestamp_v1(o#>'{billingPeriod,endsAt}');
 select occurred_at into settled_at from public.billing_webhook_events_v2 where id=e.event_id;
 if settled_at is null or start_at>settled_at or end_at<=settled_at
 or not public.billing_paddle_initial_period_matches_v1((facts->>'mappingId')::uuid,o->'billingPeriod',settled_at)
 then raise exception 'PADDLE_INITIAL_PERIOD_BOUNDS'; end if;
 return jsonb_build_object('schema','paddle-initial-period-v1','subscriptionId',s.id,'canonicalId',a.id,
 'paymentApplicationId',p.id,'initialEvidenceId',e.id,'initialFacts',facts,
 'periodStart',to_char(start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'periodEnd',to_char(end_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end $function$
;

CREATE OR REPLACE FUNCTION public.billing_catalogue_assert_mapping_v1(m billing_price_mappings)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare e public.billing_catalogue_evidence_v1%rowtype; c jsonb; amount bigint; version_id uuid;
begin
  select * into e from public.billing_catalogue_evidence_v1 where id=m.catalogue_evidence_id;
  if not found then raise exception 'BILLING_CATALOGUE_EVIDENCE_REQUIRED'; end if;
  c:=public.billing_catalogue_validate_v1(e.proof)->'catalogue';
  amount:=case m.canonical_key when 'launch' then 1900 when 'growth' then 5900 when 'scale' then 11900 when 'coach-seat' then 1200 end;
  if m.cadence='annual' then amount:=amount*10; end if;
  version_id:=case m.identity_kind when 'plan' then m.plan_version_id when 'addon' then m.addon_version_id end;
  if not (m.provider='paddle' and m.environment=public.billing_paddle_environment_v1() and e.provider=m.provider and e.environment=m.environment
    and m.verification_evidence_id is null and m.verification_sha256=e.normalized_sha256 and m.verified_at=e.observed_at
    and m.provider_price_ref::text=c->>'priceRef' and m.provider_product_ref::text=c->>'productRef'
    and m.identity_kind=c->>'identityKind' and m.canonical_key=c->>'canonicalKey' and version_id::text=c->>'canonicalVersionId'
    and ((m.identity_kind='plan' and m.canonical_key in ('launch','growth','scale') and m.addon_version_id is null)
      or (m.identity_kind='addon' and m.canonical_key='coach-seat' and m.plan_version_id is null))
    and m.cadence=c->>'cadence' and m.currency_code='USD' and c->>'currency'='USD'
    and m.unit_amount_minor=amount and m.unit_amount_minor=(c->>'unitAmountMinor')::bigint
    and m.recurrence_unit=(case m.cadence when 'monthly' then 'month' when 'annual' then 'year' end)
    and m.recurrence_unit=c->>'recurrenceUnit' and m.recurrence_count=1 and c->'recurrenceCount'='1'::jsonb
    and c->'trial'='null'::jsonb and c->>'priceStatus'='active' and c->>'productStatus'='active'
    and m.quantity_model='separate_recurring_item'
    and (c->'quantity'='null'::jsonb or c#>'{quantity,minimum}'='1'::jsonb)) is true then
    raise exception 'BILLING_CATALOGUE_MAPPING_MISMATCH';
  end if;
end $function$
;

-- The row realm remains part of every evidence and payment-method foreign key.
-- Version/schema pairs are unchanged; both isolated Paddle realms are supported.
alter table public.billing_evidence_v2 drop constraint billing_evidence_version_pair;
alter table public.billing_evidence_v2 add constraint billing_evidence_version_pair check (
 (proof_schema='billing-foundation-v1' and validator_version='structure-only-v1') or
 (provider='paddle' and environment in ('test','live') and proof_kind in ('subscription','transaction') and source_kind='webhook' and
 ((proof_schema='paddle-initial-purchase-v1' and validator_version='paddle-reconciliation-v1') or
 (proof_schema='paddle-subscription-lifecycle-v1' and validator_version='paddle-lifecycle-v1') or
 (proof_schema='paddle-plan-change-v1' and validator_version='paddle-plan-v1') or
 (proof_schema='paddle-seat-quantity-v1' and validator_version='paddle-seat-v1'))));
alter table public.billing_payment_method_preparations_v2 drop constraint billing_payment_method_preparations_v2_environment_check;
alter table public.billing_payment_method_preparations_v2 add constraint billing_payment_method_preparations_v2_environment_check check (environment in ('test','live'));

-- Initial checkout seats are the source mapping until a later verified seat
-- operation supersedes them. A completed removal intentionally returns NULL.
create or replace function public.billing_paddle_current_seat_mapping_v1(p_subscription uuid)
returns uuid language sql stable set search_path=pg_catalog,public as $$
 select mapping_id from (
  select target_seat_mapping_id mapping_id,0 priority,completed_at stamp,id
   from public.billing_operations_v2 where subscription_id=p_subscription and operation_kind='seat_quantity' and status='completed'
  union all
  select i.mapping_id,1,e.verified_at,i.id from public.billing_subscription_items_v2 i
   join public.billing_evidence_v2 e on e.id=i.evidence_id
   where i.subscription_id=p_subscription and i.item_role='coach_seat' and e.proof_schema='paddle-initial-purchase-v1'
 ) sources order by priority,stamp desc,id desc limit 1
$$;

do $migration$
declare definition text; needle text:='case when kind=''subscription.updated'' then array(select key from jsonb_object_keys(o) key';
begin
 definition:=pg_get_functiondef('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'PADDLE_INITIAL_RESOURCE_SHAPE_DRIFT';end if;
 execute replace(definition,needle,'case when kind in (''subscription.created'',''subscription.updated'') then array(select key from jsonb_object_keys(o) key');
end $migration$;

-- Mark both consumed initial deliveries processed in the same transaction as
-- the payment application. Subsequent payment-method authority requires this.
do $migration$
declare definition text; needle text:='return jsonb_build_object(''success'',true,''reused''';
begin
 definition:=pg_get_functiondef('public.reconcile_paddle_initial_purchase_v1(uuid,text)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>2 then raise exception 'PADDLE_INITIAL_DELIVERY_DRIFT';end if;
 execute replace(definition,needle,$patch$
 update public.billing_webhook_events_v2 set processing_status='processed',processed_at=coalesce(processed_at,clock_timestamp()),last_error_code=null
 where id in ((facts->>'subscriptionEventId')::uuid,(facts->>'transactionEventId')::uuid);
 return jsonb_build_object('success',true,'reused'$patch$);
end $migration$;

-- Lifecycle validation retains the immutable initial item set. Later seat
-- quantities come from verified operations, not rewriting the original receipt.
do $migration$
declare definition text; needle text:='(select count(*) from public.billing_subscription_items_v2 where subscription_id=s.id)<>1';
begin
 definition:=pg_get_functiondef('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'PADDLE_INITIAL_SEAT_LIFECYCLE_DRIFT';end if;
 execute replace(definition,needle,needle||$patch$ + (case when (initial->>'approvedAdditionalCoachSeats')::integer>0 then 1 else 0 end)
 or ((initial->>'approvedAdditionalCoachSeats')::integer>0 and not exists(select 1 from public.billing_subscription_items_v2
  where subscription_id=s.id and item_role='coach_seat' and mapping_id=(initial->>'seatMappingId')::uuid
   and quantity=(initial->>'approvedAdditionalCoachSeats')::integer))$patch$);
end $migration$;
commit;
