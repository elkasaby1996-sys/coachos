-- Initial Sandbox purchase only. No policy enablement or provider transport.
begin;

-- Preserve every foundation row and FK. Add an explicitly distinct proof class,
-- never relabel structure-only evidence as authenticated provider evidence.
alter table public.billing_evidence_v2 drop constraint billing_evidence_v2_proof_schema_check;
alter table public.billing_evidence_v2 drop constraint billing_evidence_v2_validator_version_check;
alter table public.billing_evidence_v2 add constraint billing_evidence_version_pair check (
 (proof_schema='billing-foundation-v1' and validator_version='structure-only-v1') or
 (proof_schema='paddle-initial-purchase-v1' and validator_version='paddle-reconciliation-v1'
  and provider='paddle' and environment='test' and proof_kind in ('subscription','transaction')
  and source_kind='webhook'));

-- The foundation's exact semantic remains available for historical structural
-- rows, but only initial_purchase is reachable through the new writer.
alter table public.billing_payment_applications_v2 drop constraint billing_payment_applications_v2_application_kind_check;
alter table public.billing_payment_applications_v2 add constraint billing_payment_kind check
 (application_kind in ('initial','initial_purchase','plan_change','seat_increase'));
do $$
declare r record;
begin
 for r in select conname from pg_constraint where conrelid='public.billing_payment_applications_v2'::regclass
 and contype='c' and pg_get_constraintdef(oid) like '%application_kind%' and pg_get_constraintdef(oid) like '%checkout_id%' loop
 execute format('alter table public.billing_payment_applications_v2 drop constraint %I',r.conname);
 end loop;
end $$;
alter table public.billing_payment_applications_v2 add constraint billing_payment_effect_scope check
 ((application_kind in ('initial','initial_purchase') and checkout_id is not null and operation_id is null)
 or (application_kind in ('plan_change','seat_increase') and operation_id is not null and checkout_id is null));

-- Select authenticated delivery provenance, not an event-name assertion. Ingress
-- is the trusted service boundary; no proof or provider facts are RPC inputs.
create function public.billing_paddle_reconciliation_event_v1(p_event uuid) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare result uuid;
begin
 select v.id into result
 from public.billing_paddle_event_observations o
 join public.billing_webhook_events_v2 e on e.id=o.event_id
 join public.billing_paddle_event_deliveries d on d.event_id=e.id
 join public.billing_verified_evidence_v2 v on v.id=d.verified_evidence_id
 where e.id=p_event and e.provider='paddle' and e.environment='test'
 and o.disposition='correlated' and e.processing_status not in ('manual_review','failed')
 and v.provider=e.provider and v.environment=e.environment
 and v.proof_kind='event' and v.source_kind='webhook'
 and v.proof_schema='billing-proof-v2' and v.validator_version='paddle-contract-v1'
 and v.evidence_class='authenticated_provider' and not v.payment_authority
 and v.provider_event_ref=e.provider_event_ref and v.provider_notification_ref=d.notification_ref
 and v.raw_payload_sha256=d.raw_payload_sha256
 and v.provider_resource_ref=e.resource_ref
 and v.proof#>>'{eventEvidence,eventName}'=e.provider_event_name
 and v.proof#>>'{eventEvidence,resourceType}'=e.resource_type
 and v.proof#>>'{identity,customerRef}'=o.observation->>'customerRef'
 and v.proof#>>'{identity,subscriptionRef}'=o.observation->>'subscriptionRef'
 and e.subscription_ref=o.observation->>'subscriptionRef' and e.customer_ref=o.observation->>'customerRef'
 and e.provider_event_ref=o.observation->>'eventRef' and e.provider_event_name=o.observation->>'kind'
 and e.occurred_at=(o.observation->>'occurredAt')::timestamptz
 and date_trunc('milliseconds',e.occurred_at)=(v.proof#>>'{eventEvidence,occurredAt}')::timestamptz
 and (e.resource_type<>'transaction' or v.proof#>>'{identity,transactionRef}'=o.observation->>'transactionRef')
 order by v.recorded_at,v.id limit 1;
 if result is null then raise exception 'PADDLE_RECONCILIATION_VERIFIED_EVENT_REQUIRED'; end if;
 return result;
end $$;

create function public.billing_paddle_initial_proof_v1(p_subscription uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype; c public.billing_customers_v2%rowtype;
 sub public.billing_paddle_event_observations%rowtype; txn public.billing_paddle_event_observations%rowtype;
 co public.billing_checkouts_v2%rowtype; snap public.billing_paddle_checkout_snapshots%rowtype;
 m public.billing_price_mappings%rowtype; item jsonb; observed jsonb; se uuid; te uuid;
begin
 perform public.billing_guard_actor();
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 if s.id is null then raise exception 'PADDLE_RECONCILIATION_SUBSCRIPTION_REQUIRED'; end if;
 perform public.billing_guard_lock(s.billing_account_id,'test');
 if not (select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1) then
 raise exception 'PADDLE_RECONCILIATION_DISABLED'; end if;
 select * into s from public.billing_subscriptions_v2 where id=p_subscription for update;
 select * into c from public.billing_customers_v2 where id=s.customer_id for share;
 if (s.provider,s.environment,s.shadow_status,s.approved_additional_coach_seats)
 is distinct from ('paddle'::text,'test'::text,'current'::text,0)
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
 if co.id is null or (co.billing_account_id,co.provider,co.environment,co.cadence,co.requested_additional_seats)
 is distinct from (s.billing_account_id,'paddle'::text,'test'::text,'monthly'::text,0)
 or co.provider_transaction_ref is null or co.provider_transaction_ref is distinct from sub.observation->>'transactionCorrelationRef'
 or co.seat_mapping_id is not null or (co.completed_subscription_id is not null and co.completed_subscription_id<>s.id)
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
 is distinct from ('paddle'::text,'test'::text,'plan'::text,'growth'::text,'monthly'::text,'USD'::text,co.plan_version_id)
 or m.status not in ('active','retired') or m.catalogue_evidence_id is null
 or (m.status='retired' and m.retired_at<=co.created_at)
 or (snap.base_price_ref,snap.base_product_ref,snap.base_evidence_id)
 is distinct from (m.provider_price_ref,m.provider_product_ref,m.catalogue_evidence_id)
 or snap.seat_price_ref is not null or snap.seat_evidence_id is not null then
 raise exception 'PADDLE_RECONCILIATION_MAPPING'; end if;
 perform public.billing_catalogue_assert_mapping_v1(m);
 -- Exactly one item removes any dependence on array order. Mapping uniqueness
 -- comes from provider/environment/price and the immutable canonical contract.
 foreach observed in array array[sub.observation,txn.observation] loop
 if jsonb_typeof(observed->'items') is distinct from 'array' or jsonb_array_length(observed->'items')<>1 then
 raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
 item:=observed#>'{items,0}';
 if (item->>'priceRef',item->>'productRef',item->>'quantity',item#>>'{unitPrice,currency}',item#>>'{unitPrice,amount}')
 is distinct from (m.provider_price_ref::text,m.provider_product_ref::text,'1'::text,'USD'::text,m.unit_amount_minor::text)
 or (observed->>'kind'='subscription.created' and item->>'status' is distinct from 'active') then
 raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
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
 'quantity',1,'approvedAdditionalCoachSeats',0);
end $$;

create function public.billing_paddle_initial_evidence_v1(p_subscription uuid,p_kind text) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare facts jsonb; ev public.billing_webhook_events_v2%rowtype;
 v public.billing_verified_evidence_v2%rowtype; s public.billing_subscriptions_v2%rowtype;
 c public.billing_customers_v2%rowtype; p jsonb; result uuid;
begin
 if p_kind is null or p_kind not in ('subscription','transaction') then raise exception 'PADDLE_RECONCILIATION_OPERATION'; end if;
 facts:=public.billing_paddle_initial_proof_v1(p_subscription);
 select * into ev from public.billing_webhook_events_v2 where id=(facts->>(p_kind||'EventId'))::uuid;
 select * into v from public.billing_verified_evidence_v2 where id=(facts->>(p_kind||'VerifiedEvidenceId'))::uuid;
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 select * into c from public.billing_customers_v2 where id=s.customer_id;
 p:=jsonb_build_object('schema','paddle-initial-purchase-v1','provider','paddle','environment','test','kind',p_kind,
 'identity',jsonb_build_object('subscriptionRef',s.provider_subscription_ref,'customerRef',c.provider_customer_ref,
 'eventRef',ev.provider_event_ref,'resourceRef',ev.resource_ref) ||
 case when p_kind='transaction' then jsonb_build_object('transactionRef',ev.resource_ref) else '{}'::jsonb end,
 'observation',facts);
 insert into public.billing_evidence_v2(provider,environment,source_kind,proof_kind,proof_schema,validator_version,
 replay_algorithm,replay_key,normalized_sha256,proof,verified_at,event_id,subscription_id,
 provider_notification_ref,raw_payload_sha256,provider_transaction_ref)
 values('paddle','test','webhook',p_kind,'paddle-initial-purchase-v1','paddle-reconciliation-v1',
 'delivery-evidence-v1',encode(extensions.digest(jsonb_build_array(ev.provider_event_ref,v.provider_notification_ref,v.raw_payload_sha256)::text,'sha256'),'hex'),
 encode(extensions.digest(p::text,'sha256'),'hex'),p,clock_timestamp(),ev.id,s.id,v.provider_notification_ref,v.raw_payload_sha256,
 case when p_kind='transaction' then ev.resource_ref else null end) returning id into result;
 return result;
end $$;

-- Independently recompute new proof facts on insertion. Existing structural
-- validation (identity, event, digest and replay key) continues to run unchanged.
create function public.billing_paddle_initial_evidence_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare facts jsonb; v public.billing_verified_evidence_v2%rowtype;
begin
 if new.proof_schema<>'paddle-initial-purchase-v1' then return new; end if;
 facts:=public.billing_paddle_initial_proof_v1(new.subscription_id);
 select * into v from public.billing_verified_evidence_v2 where id=(facts->>(new.proof_kind||'VerifiedEvidenceId'))::uuid;
 if new.proof->'observation' is distinct from facts or new.event_id is distinct from (facts->>(new.proof_kind||'EventId'))::uuid
 or (new.provider_notification_ref,new.raw_payload_sha256) is distinct from (v.provider_notification_ref,v.raw_payload_sha256)
 then raise exception 'PADDLE_RECONCILIATION_PROOF_MISMATCH'; end if;
 return new;
end $$;
create trigger paddle_initial_evidence_guard before insert on public.billing_evidence_v2
 for each row execute function public.billing_paddle_initial_evidence_guard_v1();

create function public.billing_paddle_initial_payment_v1(p_subscription uuid,p_evidence uuid) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_evidence_v2%rowtype; facts jsonb; result uuid;
begin
 facts:=public.billing_paddle_initial_proof_v1(p_subscription);
 select * into e from public.billing_evidence_v2 where id=p_evidence;
 if e.proof_schema is distinct from 'paddle-initial-purchase-v1' or e.proof_kind is distinct from 'transaction'
 or e.subscription_id is distinct from p_subscription or e.proof->'observation' is distinct from facts then
 raise exception 'PADDLE_RECONCILIATION_PAYMENT_PROOF'; end if;
 select id into result from public.billing_payment_applications_v2 where provider='paddle' and environment='test'
 and provider_transaction_ref=e.provider_transaction_ref and subscription_id=p_subscription
 and billing_account_id=(facts->>'billingAccountId')::uuid and checkout_id=(facts->>'checkoutId')::uuid
 and evidence_id=e.id and application_kind='initial_purchase';
 if result is not null then return result; end if;
 if exists(select 1 from public.billing_payment_applications_v2 where
 (provider='paddle' and environment='test' and provider_transaction_ref=e.provider_transaction_ref)
 or checkout_id=(facts->>'checkoutId')::uuid) then raise exception 'PADDLE_RECONCILIATION_PAYMENT_CONSUMED'; end if;
 insert into public.billing_payment_applications_v2(provider,environment,provider_transaction_ref,billing_account_id,
 subscription_id,evidence_id,application_kind,checkout_id)
 values('paddle','test',e.provider_transaction_ref,(facts->>'billingAccountId')::uuid,p_subscription,e.id,
 'initial_purchase',(facts->>'checkoutId')::uuid) returning id into result;
 return result;
end $$;

-- A trigger prevents the new semantic from accepting old structural evidence,
-- including when invoked through an accidentally granted table permission.
create function public.billing_paddle_initial_payment_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_evidence_v2%rowtype; facts jsonb;
begin
 if new.application_kind<>'initial_purchase' then return new; end if;
 facts:=public.billing_paddle_initial_proof_v1(new.subscription_id);
 select * into e from public.billing_evidence_v2 where id=new.evidence_id;
 if e.proof_schema is distinct from 'paddle-initial-purchase-v1' or e.proof_kind is distinct from 'transaction'
 or e.proof->'observation' is distinct from facts or new.checkout_id is distinct from (facts->>'checkoutId')::uuid
 or new.billing_account_id is distinct from (facts->>'billingAccountId')::uuid then
 raise exception 'PADDLE_RECONCILIATION_PAYMENT_PROOF'; end if;
 return new;
end $$;
create trigger paddle_initial_payment_guard before insert on public.billing_payment_applications_v2
 for each row execute function public.billing_paddle_initial_payment_guard_v1();

create function public.billing_paddle_initial_item_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_evidence_v2%rowtype; s public.billing_subscriptions_v2%rowtype;
begin
 select * into e from public.billing_evidence_v2 where id=new.evidence_id;
 select * into s from public.billing_subscriptions_v2 where id=new.subscription_id;
 if e.proof_schema='paddle-initial-purchase-v1' or s.account_subscription_id is not null then
 if e.proof_schema is distinct from 'paddle-initial-purchase-v1' or e.proof_kind<>'subscription'
 or new.item_role<>'base_plan' or new.quantity<>1 or new.cadence<>'monthly'
 or new.mapping_id is distinct from (e.proof#>>'{observation,mappingId}')::uuid
 or new.billing_account_id is distinct from (e.proof#>>'{observation,billingAccountId}')::uuid
 then raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
 end if;
 return new;
end $$;
create trigger paddle_initial_item_guard before insert on public.billing_subscription_items_v2
 for each row execute function public.billing_paddle_initial_item_guard_v1();

-- Replace the blanket NULL constraint with retained-proof authority. The ACLs
-- remain private. No caller-editable GUC is an authority capability.
alter table public.billing_subscriptions_v2 drop constraint billing_v2_canonical_link_disabled;
do $$
declare body text;
begin
 body:=pg_get_functiondef('public.billing_v2_protect_subscription_lifecycle()'::regprocedure);
 if position('array[''reconciliation_status''' in body)=0 then raise exception 'PADDLE_RECONCILIATION_MIGRATION_SHAPE'; end if;
 body:=replace(body,'array[''reconciliation_status''','array[''account_subscription_id'',''reconciliation_status''');
 execute body;
end $$;

create function public.billing_paddle_initial_link_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_evidence_v2%rowtype; facts jsonb;
begin
 if tg_op='UPDATE' and old.account_subscription_id is not null and new.account_subscription_id is distinct from old.account_subscription_id then
 raise exception 'PADDLE_RECONCILIATION_LINK_IMMUTABLE'; end if;
 if new.account_subscription_id is null then return new; end if;
 select * into e from public.billing_evidence_v2 where id=new.latest_evidence_id;
 facts:=e.proof->'observation';
 if new.shadow_status<>'current' or new.reconciliation_status<>'processed' or new.environment<>'test'
 or new.approved_additional_coach_seats<>0 or e.proof_schema is distinct from 'paddle-initial-purchase-v1'
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
end $$;
create trigger paddle_initial_link_guard before insert or update on public.billing_subscriptions_v2
 for each row execute function public.billing_paddle_initial_link_guard_v1();

-- Environment switches cannot reclassify an already-granted test subscription.
create function public.billing_paddle_policy_fence_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.entitlement_environment is distinct from old.entitlement_environment and exists(
 select 1 from public.billing_subscriptions_v2 where account_subscription_id is not null and environment<>new.entitlement_environment) then
 raise exception 'PADDLE_RECONCILIATION_ENVIRONMENT_PINNED'; end if;
 return new;
end $$;
create trigger paddle_reconciliation_policy_fence before update on public.billing_runtime_policy
 for each row execute function public.billing_paddle_policy_fence_v1();

create function public.reconcile_paddle_initial_purchase_v1(p_subscription uuid,p_operation text default 'initial_purchase') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare facts jsonb; s public.billing_subscriptions_v2%rowtype; canonical uuid; se uuid; te uuid; payment uuid;
begin
 perform public.billing_guard_actor();
 if p_operation is distinct from 'initial_purchase' then raise exception 'PADDLE_RECONCILIATION_OPERATION'; end if;
 facts:=public.billing_paddle_initial_proof_v1(p_subscription);
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 if s.reconciliation_status='processed' then
 if s.account_subscription_id is null or not exists(select 1 from public.billing_evidence_v2 e
 where e.id=s.latest_evidence_id and e.proof_schema='paddle-initial-purchase-v1' and e.proof->'observation'=facts)
 or not exists(select 1 from public.billing_payment_applications_v2 p join public.billing_evidence_v2 e on e.id=p.evidence_id
 where p.subscription_id=s.id and p.billing_account_id=s.billing_account_id and p.provider='paddle' and p.environment='test'
 and p.checkout_id=(facts->>'checkoutId')::uuid and p.application_kind='initial_purchase'
 and e.proof_schema='paddle-initial-purchase-v1' and e.proof->'observation'=facts)
 or not exists(select 1 from public.account_subscriptions a join public.billing_canonical_origins o on o.account_subscription_id=a.id
 where a.id=s.account_subscription_id and a.billing_account_id=s.billing_account_id and a.subscription_kind='paid'
 and a.status='active' and a.plan_version_id=(facts->>'planVersionId')::uuid and o.storage_contract='billing.v2')
 or not exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id and item_role='base_plan'
 and quantity=1 and cadence='monthly' and mapping_id=(facts->>'mappingId')::uuid and evidence_id=s.latest_evidence_id)
 or (select count(*) from public.billing_subscription_items_v2 where subscription_id=s.id)<>1 then
 raise exception 'PADDLE_RECONCILIATION_RETRY_MISMATCH'; end if;
 return jsonb_build_object('success',true,'reused',true);
 end if;
 if s.account_subscription_id is not null then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 if exists(select 1 from public.account_subscriptions where billing_account_id=s.billing_account_id
 and status in ('trialing','trial_recovery','active','past_due','grace','restricted'))
 or exists(select 1 from public.billing_provider_subscriptions where billing_account_id=s.billing_account_id
 and provider_status not in ('expired','cancelled'))
 or exists(select 1 from public.billing_subscriptions_v2 where billing_account_id=s.billing_account_id and account_subscription_id is not null)
 then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 if exists(select 1 from public.billing_payment_applications_v2 where checkout_id=(facts->>'checkoutId')::uuid
 or provider_transaction_ref=(select provider_transaction_ref from public.billing_checkouts_v2 where id=(facts->>'checkoutId')::uuid)) then
 raise exception 'PADDLE_RECONCILIATION_PAYMENT_CONSUMED'; end if;
 if exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id) then
 raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
 se:=public.billing_paddle_initial_evidence_v1(s.id,'subscription');
 te:=public.billing_paddle_initial_evidence_v1(s.id,'transaction');
 payment:=public.billing_paddle_initial_payment_v1(s.id,te);
 -- Reuse canonical table constraints/history/audit, not LS proof semantics.
 insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
 values(s.billing_account_id,(facts->>'planVersionId')::uuid,'paid','active','billing_provider') returning id into canonical;
 perform public.billing_guard_claim_canonical(s.billing_account_id,canonical,'billing.v2');
 insert into public.billing_subscription_items_v2(subscription_id,billing_account_id,provider,environment,item_role,mapping_id,cadence,mapping_kind,quantity,evidence_id)
 values(s.id,s.billing_account_id,'paddle','test','base_plan',(facts->>'mappingId')::uuid,'monthly','plan',1,se);
 update public.billing_subscriptions_v2 set account_subscription_id=canonical,latest_evidence_id=se,
 latest_snapshot_sha256=(select normalized_sha256 from public.billing_evidence_v2 where id=se),
 last_reconciled_at=clock_timestamp(),reconciliation_status='processed',reconciliation_error_code=null,updated_at=clock_timestamp()
 where id=s.id;
 -- Existing deferred item-set constraints validate at commit. Any error rolls
 -- back evidence, application, canonical row, origin, item and link together.
 return jsonb_build_object('success',true,'reused',false);
end $$;

do $$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'billing_paddle_initial_%'
 or p.proname in ('billing_paddle_reconciliation_event_v1','billing_paddle_policy_fence_v1','reconcile_paddle_initial_purchase_v1')) loop
 execute format('alter function %s owner to postgres',f.signature);
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.reconcile_paddle_initial_purchase_v1(uuid,text) to service_role;
commit;
