-- Local implementation only: no policy change, provider transport or data repair.
begin;

-- Retained observations are a closed projection, never a raw provider payload.
create function public.billing_paddle_timestamp_v1(v jsonb) returns timestamptz
language plpgsql immutable set search_path=pg_catalog,public as $$
declare t text; result timestamptz;
begin
 t:=v#>>'{}';
 if jsonb_typeof(v) is distinct from 'string' or t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
 or left(t,4)='0000' or substring(t,12,2)::int>23 or substring(t,15,2)::int>59 or substring(t,18,2)::int>59 then
 raise exception 'PADDLE_LIFECYCLE_TIMESTAMP'; end if;
 -- PostgreSQL rejects invalid calendar days (unlike JavaScript rollover).
 begin result:=t::timestamptz; exception when datetime_field_overflow or invalid_datetime_format then
 raise exception 'PADDLE_LIFECYCLE_TIMESTAMP'; end;
 return result;
end $$;

create function public.billing_paddle_lifecycle_shape_v1(o jsonb) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare k text; p jsonb;
begin
 for k in select unnest(array['updatedAt','nextBilledAt','canceledAt','pausedAt']) loop
  if o ? k and (o->k<>'null'::jsonb or k='updatedAt') then perform public.billing_paddle_timestamp_v1(o->k); end if;
 end loop;
 for k in select unnest(array['currentBillingPeriod','billingPeriod']) loop
  if o ? k and o->k<>'null'::jsonb then
   p:=o->k; perform public.billing_v2_proof_object(p,array['startsAt','endsAt']);
   if public.billing_paddle_timestamp_v1(p->'startsAt')>=public.billing_paddle_timestamp_v1(p->'endsAt') then
    raise exception 'PADDLE_LIFECYCLE_PERIOD'; end if;
  end if;
 end loop;
 if o ? 'scheduledChange' and o->'scheduledChange'<>'null'::jsonb then
  p:=o->'scheduledChange'; perform public.billing_v2_proof_object(p,array['action','effectiveAt']);
  perform public.billing_v2_proof_ref(p->'action'); perform public.billing_paddle_timestamp_v1(p->'effectiveAt');
 end if;
 if o ? 'origin' then perform public.billing_v2_proof_ref(o->'origin'); end if;
end $$;

-- Compare authority by instants; exact wire spelling remains in replay hashes.
create function public.billing_paddle_period_equal_v1(a jsonb,b jsonb) returns boolean
language sql immutable set search_path=pg_catalog,public as $$
 select case when jsonb_typeof(a)='object' and jsonb_typeof(b)='object' then
 public.billing_paddle_timestamp_v1(a->'startsAt')=public.billing_paddle_timestamp_v1(b->'startsAt')
 and public.billing_paddle_timestamp_v1(a->'endsAt')=public.billing_paddle_timestamp_v1(b->'endsAt') else false end
$$;

alter table public.billing_evidence_v2 drop constraint billing_evidence_version_pair;
alter table public.billing_evidence_v2 add constraint billing_evidence_version_pair check (
 (proof_schema='billing-foundation-v1' and validator_version='structure-only-v1') or
 (proof_schema='paddle-initial-purchase-v1' and validator_version='paddle-reconciliation-v1'
 and provider='paddle' and environment='test' and proof_kind in ('subscription','transaction') and source_kind='webhook') or
 (proof_schema='paddle-subscription-lifecycle-v1' and validator_version='paddle-lifecycle-v1'
 and provider='paddle' and environment='test' and proof_kind in ('subscription','transaction') and source_kind='webhook'));
alter table public.billing_payment_applications_v2 drop constraint billing_payment_kind;
alter table public.billing_payment_applications_v2 add constraint billing_payment_kind check
 (application_kind in ('initial','initial_purchase','plan_change','seat_increase','renewal'));
alter table public.billing_payment_applications_v2 drop constraint billing_payment_effect_scope;
alter table public.billing_payment_applications_v2 add constraint billing_payment_effect_scope check
 ((application_kind in ('initial','initial_purchase') and checkout_id is not null and operation_id is null)
 or (application_kind in ('plan_change','seat_increase') and operation_id is not null and checkout_id is null)
 or (application_kind='renewal' and operation_id is null and checkout_id is null));
-- An event can authorize at most one lifecycle effect, even across deliveries.
create unique index paddle_lifecycle_event_once on public.billing_evidence_v2(event_id,proof_kind)
 where proof_schema='paddle-subscription-lifecycle-v1';

-- Recomputed at every authority boundary. Inputs are retained internal UUIDs,
-- never caller-supplied periods, identities, mappings, amounts or proof JSON.
create function public.billing_paddle_lifecycle_facts_v1(p_subscription_event uuid,p_transaction_event uuid default null) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare o jsonb; t jsonb; s public.billing_subscriptions_v2%rowtype;
 a public.account_subscriptions%rowtype; m public.billing_price_mappings%rowtype;
 initial jsonb; se uuid; te uuid; stamp timestamptz; start_at timestamptz; end_at timestamptz;
 paid_start timestamptz; paid_end timestamptz; cancel_at timestamptz; initial_at timestamptz;
 status text; advancing boolean; row_item jsonb; kind text; candidate jsonb;
begin
 perform public.billing_guard_actor();
 select observation into o from public.billing_paddle_event_observations where event_id=p_subscription_event;
 select * into s from public.billing_subscriptions_v2 where provider='paddle' and environment='test'
 and provider_subscription_ref=o->>'subscriptionRef';
 perform public.billing_guard_lock(s.billing_account_id,'test');
 select * into s from public.billing_subscriptions_v2 where id=s.id for update;
 if not coalesce((select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1),false)
 or s.id is null or s.shadow_status<>'current' or s.reconciliation_status<>'processed'
 or s.account_subscription_id is null or s.approved_additional_coach_seats<>0
 or not exists(select 1 from public.billing_customers_v2 c where c.id=s.customer_id
 and c.identity_status='current' and c.identity_source='verified_provider_event' and c.provider_customer_ref=o->>'customerRef')
 then raise exception 'PADDLE_LIFECYCLE_IDENTITY'; end if;
 se:=public.billing_paddle_reconciliation_event_v1(p_subscription_event);
 if o->>'kind' is distinct from 'subscription.updated'
 or not (o ?& array['updatedAt','currentBillingPeriod','nextBilledAt','canceledAt','pausedAt','scheduledChange'])
 then raise exception 'PADDLE_LIFECYCLE_FACTS_REQUIRED'; end if;
 perform public.billing_paddle_lifecycle_shape_v1(o);
 stamp:=public.billing_paddle_timestamp_v1(o->'updatedAt');
 if stamp>(o->>'occurredAt')::timestamptz or stamp<=s.provider_updated_at then raise exception 'PADDLE_LIFECYCLE_STALE'; end if;
 select * into a from public.account_subscriptions where id=s.account_subscription_id for update;
 select e.proof->'observation' into initial from public.billing_payment_applications_v2 p
 join public.billing_evidence_v2 e on e.id=p.evidence_id
 where p.subscription_id=s.id and p.application_kind='initial_purchase' and e.proof_schema='paddle-initial-purchase-v1';
 if initial is null or a.billing_account_id is distinct from s.billing_account_id or a.subscription_kind<>'paid'
 or a.source<>'billing_provider' or a.status not in ('active','past_due')
 or a.plan_version_id is distinct from (initial->>'planVersionId')::uuid
 or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=a.id and storage_contract='billing.v2')
 or exists(select 1 from public.account_subscriptions other where other.billing_account_id=s.billing_account_id and other.id<>a.id
 and other.status in ('trialing','trial_recovery','active','past_due','grace','restricted'))
 or exists(select 1 from public.billing_provider_subscriptions where billing_account_id=s.billing_account_id and provider_status not in ('expired','cancelled'))
 then raise exception 'PADDLE_LIFECYCLE_CANONICAL_CONFLICT'; end if;
 select * into m from public.billing_price_mappings where id=(initial->>'mappingId')::uuid for share;
 if m.status not in ('active','retired') or m.provider<>'paddle' or m.environment<>'test' or m.identity_kind<>'plan'
 or m.canonical_key<>'growth' or m.cadence<>'monthly' or m.currency_code<>'USD'
 or m.plan_version_id<>a.plan_version_id or m.catalogue_evidence_id is distinct from (initial->>'catalogueEvidenceId')::uuid
 or m.unit_amount_minor is distinct from (initial->>'amountMinor')::bigint
 or (select count(*) from public.billing_subscription_items_v2 where subscription_id=s.id)<>1
 or not exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id and mapping_id=m.id
 and item_role='base_plan' and cadence='monthly' and quantity=1)
 then raise exception 'PADDLE_LIFECYCLE_ITEMS'; end if;
 if p_transaction_event is not null then
  te:=public.billing_paddle_reconciliation_event_v1(p_transaction_event);
  select observation into t from public.billing_paddle_event_observations where event_id=p_transaction_event;
  if t->>'kind' is distinct from 'transaction.completed' or t->>'origin' is distinct from 'subscription_recurring'
  or t->>'status' is distinct from 'completed' or t->>'currency' is distinct from 'USD'
  or t->'customerRef' is distinct from o->'customerRef' or t->'subscriptionRef' is distinct from o->'subscriptionRef'
  or not public.billing_paddle_period_equal_v1(t->'billingPeriod',o->'currentBillingPeriod')
  or exists(select 1 from public.billing_checkouts_v2 where provider='paddle' and environment='test' and provider_transaction_ref=t->>'transactionRef')
  or exists(select 1 from public.billing_payment_applications_v2 where provider='paddle' and environment='test' and provider_transaction_ref=t->>'transactionRef')
  then raise exception 'PADDLE_LIFECYCLE_PAYMENT'; end if;
 end if;
 foreach kind in array array['subscription','transaction'] loop
  candidate:=case when kind='subscription' then o else t end;
  if candidate is null then continue; end if;
  if jsonb_array_length(candidate->'items')<>1 then raise exception 'PADDLE_LIFECYCLE_ITEMS'; end if;
  row_item:=candidate#>'{items,0}';
  if row_item->>'priceRef' is distinct from m.provider_price_ref::text
  or row_item->>'productRef' is distinct from m.provider_product_ref::text
  or row_item->'quantity' is distinct from '1'::jsonb
  or row_item#>>'{unitPrice,currency}' is distinct from 'USD'
  or (row_item#>>'{unitPrice,amount}')::numeric is distinct from m.unit_amount_minor::numeric
  or (kind='subscription' and ((o->>'status'='canceled' and row_item->>'status' not in ('active','inactive')) or (o->>'status'<>'canceled' and row_item->>'status' is distinct from 'active')))
  then raise exception 'PADDLE_LIFECYCLE_ITEMS'; end if;
 end loop;
 status:=o->>'status';
 if status not in ('active','past_due','canceled') or o->'pausedAt'<>'null'::jsonb then raise exception 'PADDLE_LIFECYCLE_UNSUPPORTED'; end if;
 if o->'currentBillingPeriod'<>'null'::jsonb then
  start_at:=public.billing_paddle_timestamp_v1(o#>'{currentBillingPeriod,startsAt}');
  end_at:=public.billing_paddle_timestamp_v1(o#>'{currentBillingPeriod,endsAt}');
  if end_at<>(start_at at time zone 'UTC'+interval '1 month') at time zone 'UTC' then raise exception 'PADDLE_LIFECYCLE_PERIOD'; end if;
  if start_at>stamp then raise exception 'PADDLE_LIFECYCLE_PERIOD'; end if;
 elsif status<>'canceled' then raise exception 'PADDLE_LIFECYCLE_PERIOD'; end if;
 select occurred_at into initial_at from public.billing_webhook_events_v2 where id=(initial->>'transactionEventId')::uuid;
 -- Historical initial purchases legitimately have NULL bounds. Bootstrap only
 -- a period containing the authenticated initial settlement; never invent dates.
 advancing:=case when a.current_period_ends_at is null then start_at>initial_at else end_at>a.current_period_ends_at end;
 paid_start:=a.current_period_started_at; paid_end:=a.current_period_ends_at;
 if start_at is not null then
  if (a.current_period_ends_at is not null and ((not advancing and
   (start_at is distinct from a.current_period_started_at or end_at is distinct from a.current_period_ends_at))
   or (advancing and start_at<>a.current_period_ends_at)))
   or (a.current_period_ends_at is null and end_at<=initial_at)
  then raise exception 'PADDLE_LIFECYCLE_PERIOD'; end if;
  if t is not null and (not advancing or status<>'active' or (t->>'occurredAt')::timestamptz<start_at) then raise exception 'PADDLE_LIFECYCLE_PAYMENT'; end if;
  -- Degradation can apply without payment; it cannot extend the paid period.
  if not advancing or t is not null then paid_start:=start_at; paid_end:=end_at; end if;
 end if;
 if o->'scheduledChange'<>'null'::jsonb then
  cancel_at:=public.billing_paddle_timestamp_v1(o#>'{scheduledChange,effectiveAt}');
  if status<>'active' or o#>>'{scheduledChange,action}'<>'cancel' or cancel_at<=stamp
  or cancel_at is distinct from end_at or ((not advancing or t is not null) and end_at is distinct from paid_end)
  or o->'canceledAt'<>'null'::jsonb or (o->'nextBilledAt'<>'null'::jsonb and public.billing_paddle_timestamp_v1(o->'nextBilledAt') is distinct from end_at) then raise exception 'PADDLE_LIFECYCLE_CANCEL'; end if;
 end if;
 if status='canceled' then
  if o->'canceledAt'='null'::jsonb or public.billing_paddle_timestamp_v1(o->'canceledAt')>stamp
  or public.billing_paddle_timestamp_v1(o->'canceledAt')<s.provider_updated_at
  or o->'scheduledChange'<>'null'::jsonb or o->'nextBilledAt'<>'null'::jsonb
  then raise exception 'PADDLE_LIFECYCLE_CANCEL'; end if;
 elsif o->'canceledAt'<>'null'::jsonb then raise exception 'PADDLE_LIFECYCLE_CANCEL'; end if;
 if status='active' and cancel_at is null and
  (o->'nextBilledAt'='null'::jsonb or public.billing_paddle_timestamp_v1(o->'nextBilledAt') is distinct from end_at)
 then raise exception 'PADDLE_LIFECYCLE_PERIOD'; end if;
 if advancing and status='active' and t is null then raise exception 'PADDLE_LIFECYCLE_PAYMENT_REQUIRED'; end if;
 return jsonb_build_object('subscriptionId',s.id,'billingAccountId',s.billing_account_id,'canonicalId',a.id,
 'subscriptionEventId',p_subscription_event,'transactionEventId',p_transaction_event,
 'subscriptionVerifiedEvidenceId',se,'transactionVerifiedEvidenceId',te,
 'subscriptionObservationSha256',(select observation_sha256 from public.billing_paddle_event_observations where event_id=p_subscription_event),
 'transactionObservationSha256',(select observation_sha256 from public.billing_paddle_event_observations where event_id=p_transaction_event),
 'planVersionId',a.plan_version_id,'mappingId',m.id,'catalogueEvidenceId',m.catalogue_evidence_id,
 'cadence','monthly','currency','USD','amountMinor',m.unit_amount_minor,'quantity',1,'approvedSeats',0,
 'providerStatus',status,'providerUpdatedAt',stamp,'canonicalStatus',case when status='canceled' then 'expired' else status end,
 'periodStart',paid_start,'periodEnd',paid_end,'scheduledCancelAt',cancel_at,'renewal',t is not null);
end $$;

create function public.billing_paddle_lifecycle_evidence_v1(p_subscription_event uuid,p_transaction_event uuid,p_kind text) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare facts jsonb; ev public.billing_webhook_events_v2%rowtype; v public.billing_verified_evidence_v2%rowtype;
 s public.billing_subscriptions_v2%rowtype; c public.billing_customers_v2%rowtype; p jsonb; result uuid;
begin
 if p_kind not in ('subscription','transaction') then raise exception 'PADDLE_LIFECYCLE_KIND'; end if;
 facts:=public.billing_paddle_lifecycle_facts_v1(p_subscription_event,p_transaction_event);
 select * into ev from public.billing_webhook_events_v2 where id=(facts->>(p_kind||'EventId'))::uuid;
 select * into v from public.billing_verified_evidence_v2 where id=(facts->>(p_kind||'VerifiedEvidenceId'))::uuid;
 select * into s from public.billing_subscriptions_v2 where id=(facts->>'subscriptionId')::uuid;
 select * into c from public.billing_customers_v2 where id=s.customer_id;
 p:=jsonb_build_object('schema','paddle-subscription-lifecycle-v1','provider','paddle','environment','test','kind',p_kind,
 'identity',jsonb_build_object('subscriptionRef',s.provider_subscription_ref,'customerRef',c.provider_customer_ref,
 'eventRef',ev.provider_event_ref,'resourceRef',ev.resource_ref)||case when p_kind='transaction' then jsonb_build_object('transactionRef',ev.resource_ref) else '{}'::jsonb end,
 'observation',facts);
 insert into public.billing_evidence_v2(provider,environment,source_kind,proof_kind,proof_schema,validator_version,
 replay_algorithm,replay_key,normalized_sha256,proof,verified_at,event_id,subscription_id,provider_notification_ref,raw_payload_sha256,provider_transaction_ref)
 values('paddle','test','webhook',p_kind,'paddle-subscription-lifecycle-v1','paddle-lifecycle-v1','delivery-evidence-v1',
 encode(extensions.digest(jsonb_build_array(ev.provider_event_ref,v.provider_notification_ref,v.raw_payload_sha256)::text,'sha256'),'hex'),
 encode(extensions.digest(p::text,'sha256'),'hex'),p,clock_timestamp(),ev.id,s.id,v.provider_notification_ref,v.raw_payload_sha256,
 case when p_kind='transaction' then ev.resource_ref else null end) returning id into result;
 return result;
end $$;

create function public.billing_paddle_lifecycle_evidence_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare facts jsonb; v public.billing_verified_evidence_v2%rowtype;
begin
 if new.proof_schema<>'paddle-subscription-lifecycle-v1' then return new; end if;
 facts:=public.billing_paddle_lifecycle_facts_v1((new.proof#>>'{observation,subscriptionEventId}')::uuid,(new.proof#>>'{observation,transactionEventId}')::uuid);
 select * into v from public.billing_verified_evidence_v2 where id=(facts->>(new.proof_kind||'VerifiedEvidenceId'))::uuid;
 if new.proof->'observation' is distinct from facts or new.subscription_id is distinct from (facts->>'subscriptionId')::uuid
 or new.event_id is distinct from (facts->>(new.proof_kind||'EventId'))::uuid or v.id is null
 or (new.provider_notification_ref,new.raw_payload_sha256) is distinct from (v.provider_notification_ref,v.raw_payload_sha256)
 then raise exception 'PADDLE_LIFECYCLE_PROOF'; end if;
 return new;
end $$;
create trigger paddle_lifecycle_evidence_guard before insert on public.billing_evidence_v2
 for each row execute function public.billing_paddle_lifecycle_evidence_guard_v1();

create function public.billing_paddle_renewal_payment_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_evidence_v2%rowtype; facts jsonb;
begin
 select * into e from public.billing_evidence_v2 where id=new.evidence_id;
 if new.application_kind<>'renewal' and e.proof_schema<>'paddle-subscription-lifecycle-v1' then return new; end if;
 facts:=public.billing_paddle_lifecycle_facts_v1((e.proof#>>'{observation,subscriptionEventId}')::uuid,(e.proof#>>'{observation,transactionEventId}')::uuid);
 if new.application_kind<>'renewal' or e.proof_schema<>'paddle-subscription-lifecycle-v1' or e.proof_kind<>'transaction'
 or e.proof->'observation' is distinct from facts or facts->'renewal'<>'true'::jsonb
 or new.billing_account_id is distinct from (facts->>'billingAccountId')::uuid
 or new.subscription_id is distinct from (facts->>'subscriptionId')::uuid
 then raise exception 'PADDLE_LIFECYCLE_PAYMENT'; end if;
 return new;
end $$;
create trigger paddle_renewal_payment_guard before insert on public.billing_payment_applications_v2
 for each row execute function public.billing_paddle_renewal_payment_guard_v1();

create function public.reconcile_paddle_lifecycle_event_v1(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o jsonb; so jsonb; s public.billing_subscriptions_v2%rowtype; e public.billing_webhook_events_v2%rowtype;
 se uuid; te uuid; evidence uuid; payment_evidence uuid; facts jsonb; matches integer; result text; applied_at timestamptz;
begin
 perform public.billing_guard_actor();
 perform 1 from public.billing_runtime_policy where id=1 for share;
 if not coalesce((select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1),false) then return jsonb_build_object('status','disabled'); end if;
 select * into e from public.billing_webhook_events_v2 where id=p_event;
 select observation into o from public.billing_paddle_event_observations where event_id=p_event;
 if e.provider is distinct from 'paddle' or e.environment is distinct from 'test' or o is null then raise exception 'PADDLE_LIFECYCLE_SCOPE'; end if;
 if o->>'kind' not in ('subscription.updated','transaction.completed')
 or (o->>'kind'='subscription.updated' and not (o ? 'updatedAt')) then return jsonb_build_object('status','not_applicable'); end if;
 select * into s from public.billing_subscriptions_v2 where provider='paddle' and environment='test' and provider_subscription_ref=e.subscription_ref;
 perform public.billing_guard_lock(s.billing_account_id,'test');
 select * into s from public.billing_subscriptions_v2 where id=s.id for update;
 if s.account_subscription_id is null then return jsonb_build_object('status','pending'); end if;
 -- Retained immutable application evidence proves replay even after newer state.
 if exists(select 1 from public.billing_evidence_v2 where event_id=p_event and subscription_id=s.id and proof_schema='paddle-subscription-lifecycle-v1') then
 return jsonb_build_object('status','reused'); end if;
 begin
  perform public.billing_paddle_reconciliation_event_v1(p_event);
  if o->>'kind'='transaction.completed' then
   if o->>'origin' is distinct from 'subscription_recurring' or o->'billingPeriod' is null or o->'billingPeriod'='null'::jsonb then raise exception 'PADDLE_LIFECYCLE_PAYMENT'; end if;
   te:=p_event;
   select count(*) into matches from public.billing_paddle_event_observations po
   where po.observation->>'subscriptionRef'=e.subscription_ref and po.observation->>'kind'='subscription.updated'
   and po.observation->>'status'='active' and public.billing_paddle_period_equal_v1(po.observation->'currentBillingPeriod',o->'billingPeriod');
   if matches=0 then return jsonb_build_object('status','pending'); end if;
   -- Only the newest matching lifecycle observation can authorize renewal.
   select po.event_id,po.observation into se,so from public.billing_paddle_event_observations po
   where po.observation->>'subscriptionRef'=e.subscription_ref and po.observation->>'kind'='subscription.updated'
   and po.observation->>'status'='active' and public.billing_paddle_period_equal_v1(po.observation->'currentBillingPeriod',o->'billingPeriod')
   order by (po.observation->>'updatedAt')::timestamptz desc nulls last,po.event_id limit 1;
  else se:=p_event; so:=o; end if;
  if exists(select 1 from public.billing_paddle_event_observations po where po.event_id<>se
   and po.observation->>'subscriptionRef'=so->>'subscriptionRef' and po.observation->>'kind'='subscription.updated'
   and (po.observation->>'updatedAt')::timestamptz=(so->>'updatedAt')::timestamptz
   and (po.observation-array['eventRef','occurredAt'])<>(so-array['eventRef','occurredAt'])) then
   raise exception 'PADDLE_LIFECYCLE_AMBIGUOUS_STATE'; end if;
  if so->>'status'='active' and (o->>'kind'='transaction.completed' or
   (so#>>'{currentBillingPeriod,endsAt}')::timestamptz>coalesce(s.current_period_ends_at,'-infinity'::timestamptz)) then
   select count(*),min(po.event_id::text)::uuid into matches,te from public.billing_paddle_event_observations po
   where po.observation->>'subscriptionRef'=e.subscription_ref and po.observation->>'kind'='transaction.completed'
   and po.checkout_id is null and public.billing_paddle_period_equal_v1(po.observation->'billingPeriod',so->'currentBillingPeriod');
   if matches>1 then raise exception 'PADDLE_LIFECYCLE_AMBIGUOUS_PAYMENT'; end if;
  end if;
  facts:=public.billing_paddle_lifecycle_facts_v1(se,te);
  evidence:=public.billing_paddle_lifecycle_evidence_v1(se,te,'subscription');
  if te is not null then
   payment_evidence:=public.billing_paddle_lifecycle_evidence_v1(se,te,'transaction');
   insert into public.billing_payment_applications_v2(provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind)
   select 'paddle','test',provider_transaction_ref,s.billing_account_id,s.id,id,'renewal' from public.billing_evidence_v2 where id=payment_evidence;
  end if;
  applied_at:=clock_timestamp();
  update public.account_subscriptions set status=facts->>'canonicalStatus',
   status_changed_at=case when status<>facts->>'canonicalStatus' then applied_at else status_changed_at end,
   expired_at=case when facts->>'canonicalStatus'='expired' then applied_at else expired_at end,
   current_period_started_at=(facts->>'periodStart')::timestamptz,current_period_ends_at=(facts->>'periodEnd')::timestamptz,
   cancel_at_period_end=facts->>'scheduledCancelAt' is not null where id=s.account_subscription_id;
  update public.billing_subscriptions_v2 set provider_status=facts->>'providerStatus',provider_updated_at=(facts->>'providerUpdatedAt')::timestamptz,
   current_period_started_at=(facts->>'periodStart')::timestamptz,current_period_ends_at=(facts->>'periodEnd')::timestamptz,
   scheduled_cancel_at=(facts->>'scheduledCancelAt')::timestamptz,latest_evidence_id=evidence,
   latest_snapshot_sha256=(select normalized_sha256 from public.billing_evidence_v2 where id=evidence),
   last_reconciled_at=clock_timestamp(),updated_at=clock_timestamp() where id=s.id;
  update public.billing_webhook_events_v2 set processing_status='processed',processed_at=clock_timestamp(),last_error_code=null where id in (se,te);
  result:='applied';
 exception when raise_exception then
  -- Only enumerated proof failures become review. Unexpected database errors
  -- propagate and roll back; no partial payment or canonical write survives.
  if sqlerrm='PADDLE_LIFECYCLE_PAYMENT_REQUIRED' then result:='pending';
  elsif sqlerrm like 'PADDLE_LIFECYCLE_%' or sqlerrm='PADDLE_RECONCILIATION_VERIFIED_EVENT_REQUIRED' then
   update public.billing_webhook_events_v2 set processing_status='manual_review',last_error_code='PADDLE_LIFECYCLE_REVIEW' where id=p_event;
   result:='manual_review';
  else raise; end if;
 end;
 return jsonb_build_object('status',result);
end $$;

create or replace function public.ingest_verified_paddle_event_v1(p_proof jsonb,p_raw_payload_sha256 text,p_notification_ref text,p_observation jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p jsonb; o jsonb:=p_observation; kind text; logical jsonb; digest text; ev uuid; verified jsonb;
 account uuid; initial_account uuid; sid uuid; cid uuid; tx text; checkout public.billing_checkouts_v2%rowtype;
 sub public.billing_subscriptions_v2%rowtype; old_sub public.billing_subscriptions_v2%rowtype;
 current_customer public.billing_customers_v2%rowtype; snapshot public.billing_paddle_checkout_snapshots%rowtype;
 old public.billing_paddle_event_observations%rowtype; delivery public.billing_paddle_event_deliveries%rowtype;
 item jsonb; mapping public.billing_price_mappings%rowtype; roles text[]:='{}'; cadence text;
 valid_items boolean:=true; state text:='pending'; observed timestamptz; found_checkout boolean; count_items integer:=0;
 supersede boolean:=false; old_cid uuid; old_sid uuid; transition_at timestamptz;
begin
 perform public.billing_guard_actor();
 p:=public.billing_v2_proof_validate(p_proof,'event');
 if p->>'environment'<>'test' or p->>'provider'<>'paddle' then raise exception 'PADDLE_INGRESS_SCOPE'; end if;
 kind:=o->>'kind';
 if kind is null or kind not in ('transaction.completed','subscription.created','subscription.updated') then raise exception 'PADDLE_INGRESS_INVALID'; end if;
 perform public.billing_v2_proof_object(o,array['provider','environment','eventRef','notificationRef','eventType','occurredAt','kind','customerRef','subscriptionRef','status','items'] ||
  case when kind='transaction.completed' then array['transactionRef','currency'] || case when o ? 'origin' then array['origin'] else '{}'::text[] end || case when o ? 'billingPeriod' then array['billingPeriod'] else '{}'::text[] end else array['transactionCorrelationRef'] || case when kind='subscription.updated' then array(select key from jsonb_object_keys(o) key where key=any(array['updatedAt','currentBillingPeriod','nextBilledAt','canceledAt','pausedAt','scheduledChange'])) else '{}'::text[] end end);
 perform public.billing_paddle_lifecycle_shape_v1(o);
 perform public.billing_v2_proof_ref(o->'notificationRef');
 perform public.billing_v2_proof_ref(o->'customerRef',true);
 perform public.billing_v2_proof_ref(o->'subscriptionRef',kind='transaction.completed');
 if kind='transaction.completed' then perform public.billing_v2_proof_ref(o->'transactionRef');
 else perform public.billing_v2_proof_ref(o->'transactionCorrelationRef',true); end if;
 if (o->>'provider'='paddle' and o->>'environment'='test' and o->>'eventRef'=p#>>'{eventEvidence,eventRef}'
 and o->>'eventType'=kind and kind=p#>>'{eventEvidence,eventName}' and o->>'notificationRef'=p_notification_ref
 and o->'customerRef'=p#>'{identity,customerRef}' and o->'subscriptionRef'=p#>'{identity,subscriptionRef}') is not true
 then raise exception 'PADDLE_INGRESS_INVALID'; end if;
 if jsonb_typeof(o->'occurredAt')<>'string' or length(o->>'occurredAt')>64 or (o->>'occurredAt') !~ '^\d{4}-\d{2}-\d{2}T' then raise exception 'PADDLE_INGRESS_INVALID'; end if;
 observed:=(o->>'occurredAt')::timestamptz;
 -- PREP proof uses milliseconds; exact provider timestamp is retained separately.
 if date_trunc('milliseconds',observed)<>(p#>>'{eventEvidence,occurredAt}')::timestamptz then raise exception 'PADDLE_INGRESS_INVALID'; end if;
 if kind='transaction.completed' then
  if (o->>'status'='completed' and o->>'currency'='USD' and o->'transactionRef'=p#>'{identity,transactionRef}') is not true then raise exception 'PADDLE_INGRESS_INVALID'; end if;
 else
  if o->>'status' is null or o->>'status' not in ('active','trialing','past_due','paused','canceled') or (kind='subscription.updated' and o->'transactionCorrelationRef'<>'null'::jsonb) then raise exception 'PADDLE_INGRESS_INVALID'; end if;
 end if;
 if jsonb_typeof(o->'items')<>'array' or jsonb_array_length(o->'items') not between 1 and 32 then raise exception 'PADDLE_INGRESS_INVALID'; end if;
 -- Validate a closed sanitized shape before any durable retention.
 for item in select value from jsonb_array_elements(o->'items') loop
  perform public.billing_v2_proof_object(item,array['priceRef','productRef','quantity','unitPrice'] || case when kind='transaction.completed' then array[]::text[] else array['status'] end);
  perform public.billing_v2_proof_ref(item->'priceRef'); perform public.billing_v2_proof_ref(item->'productRef',true);
  perform public.billing_v2_proof_object(item->'unitPrice',array['amount','currency']);
  if public.billing_v2_proof_money(item->'quantity') not between 1 and 2147483647
   or jsonb_typeof(item#>'{unitPrice,amount}')<>'string' or (item#>>'{unitPrice,amount}') !~ '^(0|[1-9][0-9]{0,15})$'
   or item#>>'{unitPrice,currency}' is null or item#>>'{unitPrice,currency}' !~ '^[A-Z]{3}$'
   or (kind<>'transaction.completed' and (item->>'status' is null or item->>'status' not in ('active','inactive','trialing')))
   then raise exception 'PADDLE_INGRESS_INVALID'; end if;
 end loop;
 logical:=o-'notificationRef'; digest:=encode(extensions.digest(logical::text,'sha256'),'hex');
 tx:=case when kind='transaction.completed' then o->>'transactionRef' else o->>'transactionCorrelationRef' end;
 select * into checkout from public.billing_checkouts_v2 where provider='paddle' and environment='test' and provider_transaction_ref=tx;
 found_checkout:=found;
 select * into sub from public.billing_subscriptions_v2 where provider='paddle' and environment='test' and provider_subscription_ref=o->>'subscriptionRef';
 account:=coalesce(checkout.billing_account_id,sub.billing_account_id); initial_account:=account;
 if checkout.billing_account_id is not null and sub.billing_account_id is not null and checkout.billing_account_id<>sub.billing_account_id then raise exception 'PADDLE_INGRESS_IDENTITY_CONFLICT'; end if;
 -- Existing policy -> account -> ingress/logical evidence order. No new account
 -- is acquired after the ingress lock; concurrent identity discovery retries.
 perform public.billing_guard_lock(account,'test');
 perform pg_advisory_xact_lock(hashtextextended('paddle-ingress-test-v1',0));
 select * into checkout from public.billing_checkouts_v2 where provider='paddle' and environment='test' and provider_transaction_ref=tx;
 found_checkout:=found;
 select * into sub from public.billing_subscriptions_v2 where provider='paddle' and environment='test' and provider_subscription_ref=o->>'subscriptionRef';
 if coalesce(checkout.billing_account_id,sub.billing_account_id) is distinct from initial_account then raise exception 'PADDLE_INGRESS_RETRY'; end if;
 if found_checkout and exists(select 1 from public.billing_paddle_event_observations po where po.checkout_id=checkout.id and po.disposition='correlated' and ((po.observation->>'subscriptionRef' is not null and o->>'subscriptionRef' is not null and po.observation->>'subscriptionRef'<>o->>'subscriptionRef') or (po.observation->>'customerRef' is not null and o->>'customerRef' is not null and po.observation->>'customerRef'<>o->>'customerRef'))) then raise exception 'PADDLE_INGRESS_IDENTITY_CONFLICT'; end if;
 if sub.id is not null and (sub.billing_account_id is distinct from account or not exists(select 1 from public.billing_customers_v2 c where c.id=sub.customer_id and c.provider_customer_ref=o->>'customerRef')) then raise exception 'PADDLE_INGRESS_IDENTITY_CONFLICT'; end if;
 select e.id into ev from public.billing_webhook_events_v2 e where provider='paddle' and environment='test' and provider_event_ref=o->>'eventRef';
 if ev is not null then
  select * into old from public.billing_paddle_event_observations where event_id=ev;
  -- Pre-lifecycle events retain their original projection forever. A replay
  -- may now expose added fields, but cannot retrofit authority into old rows.
  if old.event_id is null or (old.observation_sha256<>digest and
   old.observation is distinct from (logical-array(select k from unnest(array['origin','billingPeriod','updatedAt','currentBillingPeriod','nextBilledAt','canceledAt','pausedAt','scheduledChange']) k where not (old.observation ? k))))
  then raise exception 'PADDLE_INGRESS_REPLAY_CONFLICT'; end if;
 end if;
 select * into delivery from public.billing_paddle_event_deliveries where notification_ref=p_notification_ref;
 if found then
  if delivery.event_id is distinct from ev or delivery.raw_payload_sha256 is distinct from p_raw_payload_sha256 then raise exception 'PADDLE_INGRESS_REPLAY_CONFLICT'; end if;
  return jsonb_build_object('accepted',true,'reused',true,'eventId',ev,'eventType',kind);
 end if;
 if ev is not null then
  verified:=public.record_verified_billing_event_v2(p,p_raw_payload_sha256,p_notification_ref);
  insert into public.billing_paddle_event_deliveries values(p_notification_ref,ev,p_raw_payload_sha256,(verified->>'id')::uuid,now());
  return jsonb_build_object('accepted',true,'reused',true,'eventId',ev,'eventType',kind);
 end if;
 -- Unknown/mismatched items are retained as manual-review evidence only.
 for item in select value from jsonb_array_elements(o->'items') loop
  count_items:=count_items+1;
  select * into mapping from public.billing_price_mappings where provider='paddle' and environment='test' and provider_price_ref=item->>'priceRef' and status in ('active','retired') for share;
  if not found then valid_items:=false; continue; end if;
  if mapping.catalogue_evidence_id is null or mapping.verification_sha256 is null
   or mapping.identity_kind=any(roles) or (cadence is not null and mapping.cadence<>cadence)
   or (item->>'productRef' is not null and item->>'productRef' is distinct from mapping.provider_product_ref)
   or item#>>'{unitPrice,currency}'<>'USD' or (item#>>'{unitPrice,amount}')::numeric<>mapping.unit_amount_minor
   or (mapping.identity_kind='plan' and (item->>'quantity')::int<>1)
   or (mapping.identity_kind='addon' and (item->>'quantity')::int>5)
   then valid_items:=false; end if;
  roles:=array_append(roles,mapping.identity_kind); cadence:=mapping.cadence;
  if found_checkout then
   if mapping.status<>'active' or not coalesce(((mapping.id=checkout.base_mapping_id and (item->>'quantity')::int=1)
    or (mapping.id=checkout.seat_mapping_id and (item->>'quantity')::int=checkout.requested_additional_seats)),false) then valid_items:=false; end if;
  end if;
 end loop;
 if not ('plan'=any(roles)) then valid_items:=false; end if;
 if found_checkout then
  select * into snapshot from public.billing_paddle_checkout_snapshots where checkout_id=checkout.id;
  if snapshot.checkout_id is null or not exists(select 1 from public.billing_price_mappings m where m.id=checkout.base_mapping_id and m.provider_price_ref=snapshot.base_price_ref and m.provider_product_ref=snapshot.base_product_ref and m.catalogue_evidence_id=snapshot.base_evidence_id) or (checkout.requested_additional_seats>0 and not exists(select 1 from public.billing_price_mappings m where m.id=checkout.seat_mapping_id and m.provider_price_ref=snapshot.seat_price_ref and m.provider_product_ref=snapshot.seat_product_ref and m.catalogue_evidence_id=snapshot.seat_evidence_id)) or count_items<>(case when checkout.requested_additional_seats>0 then 2 else 1 end) then valid_items:=false; end if;
  if valid_items then state:='correlated'; else state:='manual_review'; end if;
 elsif sub.id is not null then
  state:=case when valid_items then 'correlated' else 'manual_review' end;
 end if;
 if not valid_items then state:='manual_review'; end if;
 if kind<>'transaction.completed' and state='correlated' then
  if sub.id is null then
   if o->>'customerRef' is null then state:='pending';
   else
    if exists(
      select 1 from public.billing_customers_v2 c
      where c.provider='paddle' and c.environment='test'
        and c.provider_customer_ref=o->>'customerRef'
        and c.billing_account_id<>account
    ) then raise exception 'PADDLE_INGRESS_IDENTITY_CONFLICT'; end if;
    select * into current_customer
    from public.billing_customers_v2 c
    where c.billing_account_id=account and c.provider='paddle'
      and c.environment='test' and c.identity_status='current';
    if current_customer.id is null then
      insert into public.billing_customers_v2(
        billing_account_id,provider,environment,provider_customer_ref,identity_source
      ) values(
        account,'paddle','test',o->>'customerRef','verified_provider_event'
      ) returning id into cid;
      insert into public.billing_subscriptions_v2(
        billing_account_id,customer_id,provider,environment,
        provider_subscription_ref,provider_status,provider_updated_at
      ) values(
        account,cid,'paddle','test',o->>'subscriptionRef',o->>'status',observed
      ) returning id into sid;
    elsif current_customer.provider_customer_ref=o->>'customerRef' then
      cid:=current_customer.id;
      insert into public.billing_subscriptions_v2(
        billing_account_id,customer_id,provider,environment,
        provider_subscription_ref,provider_status,provider_updated_at
      ) values(
        account,cid,'paddle','test',o->>'subscriptionRef',o->>'status',observed
      ) returning id into sid;
    elsif kind<>'subscription.created'
      or not found_checkout
      or exists(
        select 1 from public.billing_paddle_checkout_certification_fixtures f
        where f.checkout_id=checkout.id
      )
      or current_customer.identity_source<>'certification_fixture'
    then raise exception 'PADDLE_INGRESS_IDENTITY_CONFLICT';
    else
      select * into old_sub
      from public.billing_subscriptions_v2 s
      where s.customer_id=current_customer.id and s.shadow_status='current';
      if old_sub.id is null
        or not public.billing_paddle_certification_shadow_v1(current_customer.id,old_sub.id)
      then raise exception 'PADDLE_INGRESS_IDENTITY_CONFLICT'; end if;
      cid:=gen_random_uuid();
      sid:=gen_random_uuid();
      transition_at:=clock_timestamp();
      old_cid:=current_customer.id;
      old_sid:=old_sub.id;
      update public.billing_customers_v2
      set identity_status='superseded',superseded_at=transition_at,
        superseded_by_customer_id=cid,updated_at=transition_at
      where id=old_cid;
      insert into public.billing_customers_v2(
        id,billing_account_id,provider,environment,provider_customer_ref,
        identity_status,identity_source
      ) values(
        cid,account,'paddle','test',o->>'customerRef',
        'current','verified_provider_event'
      );
      insert into public.billing_subscriptions_v2(
        id,billing_account_id,customer_id,provider,environment,
        provider_subscription_ref,provider_status,provider_updated_at,shadow_status
      ) values(
        sid,account,cid,'paddle','test',o->>'subscriptionRef',
        o->>'status',observed,'current'
      );
      update public.billing_subscriptions_v2
      set shadow_status='superseded',superseded_at=transition_at,
        superseded_by_subscription_id=sid,updated_at=transition_at
      where id=old_sid;
      supersede:=true;
    end if;
   end if;
  elsif sub.account_subscription_id is not null then
   -- Linked subscriptions change only through paired lifecycle authority.
   null;
  elsif sub.shadow_status='superseded' then
   state:='stale';
  else
   if sub.provider_updated_at>observed then state:='stale';
   elsif sub.provider_updated_at=observed then
    if sub.provider_status is distinct from o->>'status' or exists(select 1 from public.billing_paddle_event_observations po where po.observation->>'subscriptionRef'=o->>'subscriptionRef' and po.observation->>'kind' like 'subscription.%' and (po.observation->>'occurredAt')::timestamptz=observed and po.observation->'items'<>o->'items') then state:='manual_review'; end if;
   else
    update public.billing_subscriptions_v2 set provider_status=o->>'status',provider_updated_at=observed,updated_at=now() where id=sub.id;
   end if;
  end if;
 end if;
 verified:=public.record_verified_billing_event_v2(p,p_raw_payload_sha256,p_notification_ref);
 insert into public.billing_webhook_events_v2(provider,environment,provider_event_ref,provider_event_name,resource_type,resource_ref,occurred_at,first_payload_sha256,subscription_ref,customer_ref,processing_status)
 values('paddle','test',o->>'eventRef',kind,p#>>'{eventEvidence,resourceType}',p#>>'{eventEvidence,resourceRef}',observed,p_raw_payload_sha256,o->>'subscriptionRef',o->>'customerRef',case when state='manual_review' then 'manual_review' else 'deferred' end) returning id into ev;
 insert into public.billing_paddle_event_observations(event_id,observation,observation_sha256,checkout_id,disposition) values(ev,logical,digest,checkout.id,state);
 insert into public.billing_paddle_event_deliveries values(p_notification_ref,ev,p_raw_payload_sha256,(verified->>'id')::uuid,now());
 if supersede then
  insert into public.billing_provider_identity_transitions_v2(
    billing_account_id,provider,environment,old_customer_id,new_customer_id,
    old_subscription_id,new_subscription_id,triggering_event_id,
    triggering_verified_evidence_id,correlated_checkout_id,transition_reason
  ) values(
    account,'paddle','test',old_cid,cid,old_sid,sid,ev,
    (verified->>'id')::uuid,checkout.id,
    'certification_identity_superseded_by_verified_provider_identity'
  );
 end if;
 return jsonb_build_object('accepted',true,'reused',false,'eventId',ev,'eventType',kind);
end $$;


create or replace function public.billing_paddle_initial_link_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_evidence_v2%rowtype; facts jsonb;
begin
 if tg_op='UPDATE' and old.account_subscription_id is not null and new.account_subscription_id is distinct from old.account_subscription_id then
 raise exception 'PADDLE_RECONCILIATION_LINK_IMMUTABLE'; end if;
 if new.account_subscription_id is null then return new; end if;
 select * into e from public.billing_evidence_v2 where id=new.latest_evidence_id;
 facts:=e.proof->'observation';
 if e.proof_schema='paddle-subscription-lifecycle-v1' then
  if tg_op<>'UPDATE' or old.account_subscription_id is null or new.account_subscription_id<>old.account_subscription_id
  or new.shadow_status<>'current' or new.reconciliation_status<>'processed' or new.environment<>'test'
  or new.approved_additional_coach_seats<>0 or e.proof_kind<>'subscription' or e.subscription_id<>new.id
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
   and pe.proof#>>'{observation,planVersionId}'=facts->>'planVersionId')
  or (facts->'renewal'='true'::jsonb and not exists(select 1 from public.billing_payment_applications_v2 p
   join public.billing_evidence_v2 pe on pe.id=p.evidence_id where p.subscription_id=new.id and p.application_kind='renewal'
   and pe.proof_schema='paddle-subscription-lifecycle-v1' and pe.proof->'observation'=facts))
  then raise exception 'PADDLE_LIFECYCLE_LINK_PROOF'; end if;
  return new;
 end if;

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

create or replace function public.reconcile_paddle_initial_purchase_event_v1(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare enabled boolean; e public.billing_webhook_events_v2%rowtype;
 o public.billing_paddle_event_observations%rowtype; s public.billing_subscriptions_v2%rowtype;
 checkout public.billing_checkouts_v2%rowtype; account uuid; counterpart text; result jsonb;
begin
 perform public.billing_guard_actor();
 select paddle_reconciliation_enabled into enabled from public.billing_runtime_policy where id=1 for share;
 if not coalesce(enabled,false) then return jsonb_build_object('status','disabled'); end if;
 select * into e from public.billing_webhook_events_v2 where id=p_event;
 select * into o from public.billing_paddle_event_observations where event_id=p_event;
 if e.id is null or o.event_id is null or e.provider<>'paddle' or e.environment<>'test' then
 raise exception 'PADDLE_AUTO_RECONCILIATION_SCOPE'; end if;
 if o.observation->>'kind'='subscription.updated' or (o.observation->>'kind'='transaction.completed' and o.checkout_id is null) then
 return public.reconcile_paddle_lifecycle_event_v1(p_event); end if;
 if o.observation->>'kind' not in ('transaction.completed','subscription.created') then
 return jsonb_build_object('status','not_applicable'); end if;
 select * into checkout from public.billing_checkouts_v2 where id=o.checkout_id;
 select * into s from public.billing_subscriptions_v2 where provider='paddle' and environment='test'
 and provider_subscription_ref=e.subscription_ref;
 account:=coalesce(checkout.billing_account_id,s.billing_account_id);
 -- Same policy -> account ordering as ingress. No ingress lock is acquired
 -- here, and no provider/event row is locked before the account lock.
 perform public.billing_guard_lock(account,'test');
 select * into s from public.billing_subscriptions_v2 where provider='paddle' and environment='test'
 and provider_subscription_ref=e.subscription_ref;
 if s.id is not null and s.billing_account_id<>account then raise exception 'PADDLE_AUTO_RECONCILIATION_IDENTITY'; end if;
 counterpart:=case when o.observation->>'kind'='transaction.completed' then 'subscription.created' else 'transaction.completed' end;
 -- Include rejected/manual-review counterparts: presence must never hide a
 -- hard proof failure behind an ordering response.
 if not exists(select 1 from public.billing_paddle_event_observations other
 join public.billing_webhook_events_v2 oe on oe.id=other.event_id
 where oe.provider='paddle' and oe.environment='test' and other.observation->>'kind'=counterpart
 and (other.checkout_id=checkout.id or oe.subscription_ref=e.subscription_ref
 or coalesce(other.observation->>'transactionRef',other.observation->>'transactionCorrelationRef')=
 coalesce(o.observation->>'transactionRef',o.observation->>'transactionCorrelationRef'))) then
 return jsonb_build_object('status','pending'); end if;
 if account is null or checkout.id is null or checkout.provider<>'paddle' or checkout.environment<>'test'
 or checkout.billing_account_id<>account or coalesce(o.observation->>'transactionRef',o.observation->>'transactionCorrelationRef')
 is distinct from checkout.provider_transaction_ref::text then raise exception 'PADDLE_AUTO_RECONCILIATION_CORRELATION'; end if;
 if s.id is null or s.shadow_status<>'current' or s.billing_account_id<>account then
 raise exception 'PADDLE_AUTO_RECONCILIATION_IDENTITY'; end if;
 -- An initial replay after a lifecycle transition must not restore initial state.
 if exists(select 1 from public.billing_evidence_v2 le where le.id=s.latest_evidence_id
 and le.subscription_id=s.id and le.proof_schema='paddle-subscription-lifecycle-v1') then
  perform public.billing_paddle_reconciliation_event_v1(p_event);
  if checkout.status<>'completed' or checkout.completed_subscription_id is distinct from s.id
  or not exists(select 1 from public.billing_payment_applications_v2 p join public.billing_evidence_v2 pe on pe.id=p.evidence_id
   where p.subscription_id=s.id and p.checkout_id=checkout.id and p.application_kind='initial_purchase'
   and pe.proof_schema='paddle-initial-purchase-v1'
   and p_event in ((pe.proof#>>'{observation,subscriptionEventId}')::uuid,(pe.proof#>>'{observation,transactionEventId}')::uuid))
  then raise exception 'PADDLE_AUTO_RECONCILIATION_CORRELATION'; end if;
  return jsonb_build_object('status','reused');
 end if;
 result:=public.reconcile_paddle_initial_purchase_v1(s.id,'initial_purchase');
 if result->'success' is distinct from 'true'::jsonb or jsonb_typeof(result->'reused') is distinct from 'boolean' then
 raise exception 'PADDLE_AUTO_RECONCILIATION_RESULT'; end if;
 return jsonb_build_object('status',case when (result->>'reused')::boolean then 'reused' else 'applied' end);
end $$;


-- Private helpers have no direct service/browser execution. Only UUID dispatcher
-- and existing authenticated-ingress boundary are reachable by service_role.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('billing_paddle_timestamp_v1','billing_paddle_lifecycle_shape_v1','billing_paddle_period_equal_v1',
 'billing_paddle_lifecycle_facts_v1','billing_paddle_lifecycle_evidence_v1','billing_paddle_lifecycle_evidence_guard_v1',
 'billing_paddle_renewal_payment_guard_v1','reconcile_paddle_lifecycle_event_v1') loop
 execute format('alter function %s owner to postgres',f.signature);
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.reconcile_paddle_lifecycle_event_v1(uuid) to service_role;
commit;
