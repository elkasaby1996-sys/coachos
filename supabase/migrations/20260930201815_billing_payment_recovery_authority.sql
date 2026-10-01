-- No population/backfill. Authority is derived from retained signed observations.
begin;

create index paddle_recovery_transaction on public.billing_paddle_event_observations ((observation->>'transactionRef')) where observation ? 'transactionRef';
create index paddle_recovery_subscription on public.billing_paddle_event_observations ((observation->>'subscriptionRef'),(observation->>'kind'));

create function public.billing_paddle_recovery_money_v1(j jsonb) returns numeric
language plpgsql immutable set search_path=pg_catalog as $$
begin
 if jsonb_typeof(j) is distinct from 'string' or (j#>>'{}') !~ '^(0|[1-9][0-9]{0,15})$'
 or (j#>>'{}')::numeric>9007199254740991 then raise exception 'PADDLE_RECOVERY_FACTS';end if;
 return (j#>>'{}')::numeric;
end $$;

create function public.billing_paddle_recovery_financial_v1(o jsonb) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare f jsonb:=o->'financial'; t jsonb; p jsonb; k text; captured numeric:=0; refs text[]:='{}';
begin
 perform public.billing_v2_proof_object(f,array['resourceUpdatedAt','collectionMode','totals','payments','captured']);
 perform public.billing_paddle_seat_timestamp_key_v1(f->'resourceUpdatedAt');
 if jsonb_typeof(f->'collectionMode') is distinct from 'string' or f->>'collectionMode' not in ('automatic','manual') then raise exception 'PADDLE_RECOVERY_FACTS';end if;
 t:=f->'totals'; perform public.billing_v2_proof_object(t,array['subtotal','tax','discount','total','credit','creditToBalance','grandTotal','balance']);
 foreach k in array array['subtotal','tax','discount','total','credit','creditToBalance','grandTotal','balance'] loop
  perform public.billing_paddle_recovery_money_v1(t->k);
 end loop;
 if jsonb_typeof(f->'payments') is distinct from 'array' or jsonb_array_length(f->'payments')>32 then raise exception 'PADDLE_RECOVERY_FACTS';end if;
 for p in select value from jsonb_array_elements(f->'payments') loop
  perform public.billing_v2_proof_object(p,array['attemptReference','amount','status']);
  perform public.billing_v2_proof_ref(p->'attemptReference');
  perform public.billing_paddle_recovery_money_v1(p->'amount');
  if p->>'attemptReference'=any(refs) or coalesce(p->>'status','') !~ '^[a-z_]{2,40}$' then raise exception 'PADDLE_RECOVERY_FACTS';end if;
  refs:=array_append(refs,p->>'attemptReference');
  if p->>'status'='captured' then captured:=captured+(p->>'amount')::numeric;end if;
 end loop;
 if captured is distinct from public.billing_paddle_recovery_money_v1(f->'captured')
 or (t->>'subtotal')::numeric+(t->>'tax')::numeric-(t->>'discount')::numeric<>(t->>'total')::numeric
 or (t->>'total')::numeric-(t->>'credit')::numeric<>(t->>'grandTotal')::numeric
 or captured+(t->>'balance')::numeric<>(t->>'grandTotal')::numeric
 or o->'paymentTotals' is distinct from jsonb_build_object('total',(t->>'grandTotal')::numeric,'paid',captured,'balance',(t->>'balance')::numeric)
 then raise exception 'PADDLE_RECOVERY_FACTS';end if;
end $$;

-- Separate closed ingestion for the additive vocabulary/financial projection.
-- Original checkout, plan and seat payload contracts stay unchanged.
create function public.ingest_verified_paddle_recovery_event_v1(p_proof jsonb,p_raw_payload_sha256 text,p_notification_ref text,p_observation jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare p jsonb; o jsonb:=p_observation; k text; logical jsonb; digest text; ev uuid; v jsonb;
 s public.billing_subscriptions_v2%rowtype; account uuid; d public.billing_paddle_event_deliveries%rowtype; item jsonb;
begin
 perform public.billing_guard_actor(); p:=public.billing_v2_proof_validate(p_proof,'event'); k:=o->>'kind';
 if k is null or k not in ('transaction.past_due','transaction.payment_failed','transaction.updated','transaction.paid','transaction.completed','transaction.canceled','subscription.past_due','adjustment.created','adjustment.updated')
 or p->>'provider'<>'paddle' or p->>'environment'<>'test' or o->>'provider' is distinct from 'paddle' or o->>'environment' is distinct from 'test'
 or o->>'eventType' is distinct from k or p#>>'{eventEvidence,eventName}' is distinct from k
 or p#>'{identity,customerRef}' is distinct from o->'customerRef' or p#>'{identity,subscriptionRef}' is distinct from o->'subscriptionRef'
 or p#>>'{eventEvidence,eventRef}' is distinct from o->>'eventRef' or o->>'notificationRef' is distinct from p_notification_ref
 then raise exception 'PADDLE_RECOVERY_INGRESS_INVALID';end if;
 perform public.billing_v2_proof_ref(o->'eventRef'); perform public.billing_v2_proof_ref(o->'notificationRef');
 if date_trunc('milliseconds',public.billing_paddle_timestamp_v1(o->'occurredAt')) is distinct from (p#>>'{eventEvidence,occurredAt}')::timestamptz then raise exception 'PADDLE_RECOVERY_INGRESS_INVALID';end if;
 if k='subscription.past_due' then
  perform public.billing_v2_proof_object(o-array['updatedAt','currentBillingPeriod','nextBilledAt','canceledAt','pausedAt','scheduledChange','planChangeOperationId','seatQuantityOperationId'],array['provider','environment','kind','eventRef','notificationRef','eventType','occurredAt','subscriptionRef','customerRef','status','transactionCorrelationRef','items']);
  if o->>'status' is distinct from 'past_due' or o->'transactionCorrelationRef' is distinct from 'null'::jsonb
  or p#>>'{eventEvidence,resourceType}'<>'subscription' or p#>>'{eventEvidence,resourceRef}' is distinct from o->>'subscriptionRef'
  then raise exception 'PADDLE_RECOVERY_INGRESS_INVALID';end if;
  perform public.billing_paddle_lifecycle_shape_v1(o);
 else
  perform public.billing_v2_proof_ref(o->'transactionRef');
  if p#>'{identity,transactionRef}' is distinct from o->'transactionRef' or p#>>'{eventEvidence,resourceType}'<>'transaction'
  or p#>>'{eventEvidence,resourceRef}' is distinct from o->>'transactionRef' then raise exception 'PADDLE_RECOVERY_INGRESS_INVALID';end if;
  if k like 'adjustment.%' then
   perform public.billing_v2_proof_object(o,array['provider','environment','kind','eventRef','notificationRef','eventType','occurredAt','adjustmentRef','transactionRef','customerRef','subscriptionRef','status','resourceUpdatedAt']);
   perform public.billing_v2_proof_ref(o->'adjustmentRef'); perform public.billing_paddle_seat_timestamp_key_v1(o->'resourceUpdatedAt');
  else
   perform public.billing_v2_proof_object(o-array['financial','paymentTotals','origin','billingPeriod','planChangeOperationId','seatQuantityOperationId'],array['provider','environment','kind','eventRef','notificationRef','eventType','occurredAt','transactionRef','subscriptionRef','customerRef','status','currency','items']);
   if o->>'status' is null or o->>'status' not in ('draft','ready','billed','past_due','paid','completed','canceled')
   or (k in ('transaction.past_due','transaction.paid','transaction.completed','transaction.canceled') and o->>'status'<>split_part(k,'.',2))
   or coalesce(o->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'PADDLE_RECOVERY_INGRESS_INVALID';end if;
   if o ? 'financial' then perform public.billing_paddle_recovery_financial_v1(o);end if;
   if o ? 'billingPeriod' and o->'billingPeriod'<>'null'::jsonb then
    if public.billing_paddle_timestamp_v1(o#>'{billingPeriod,startsAt}')>=public.billing_paddle_timestamp_v1(o#>'{billingPeriod,endsAt}') then raise exception 'PADDLE_RECOVERY_INGRESS_INVALID';end if;
   end if;
  end if;
 end if;
 if k not like 'adjustment.%' then
  if jsonb_typeof(o->'items') is distinct from 'array' or jsonb_array_length(o->'items') not between (case when o->>'origin'='subscription_payment_method_change' then 0 else 1 end) and 32 then raise exception 'PADDLE_RECOVERY_INGRESS_INVALID';end if;
  for item in select value from jsonb_array_elements(o->'items') loop
   perform public.billing_v2_proof_ref(item->'priceRef'); perform public.billing_v2_proof_ref(item->'productRef',true);
   perform public.billing_paddle_recovery_money_v1(item#>'{unitPrice,amount}');
   if jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric)
   or (item->>'quantity')::numeric not between 1 and 2147483647 or coalesce(item#>>'{unitPrice,currency}','') !~ '^[A-Z]{3}$'
   then raise exception 'PADDLE_RECOVERY_INGRESS_INVALID';end if;
  end loop;
 end if;
 select * into s from public.billing_subscriptions_v2 where provider='paddle' and environment='test' and provider_subscription_ref=o->>'subscriptionRef';
 account:=s.billing_account_id; perform public.billing_guard_lock(account,'test');
 perform pg_advisory_xact_lock(hashtextextended('paddle-ingress-test-v1',0));
 select * into s from public.billing_subscriptions_v2 where provider='paddle' and environment='test' and provider_subscription_ref=o->>'subscriptionRef';
 if s.billing_account_id is distinct from account then raise exception 'PADDLE_RECOVERY_INGRESS_RETRY';end if;
 logical:=o-'notificationRef';digest:=encode(extensions.digest(logical::text,'sha256'),'hex');
 select id into ev from public.billing_webhook_events_v2 where provider='paddle' and environment='test' and provider_event_ref=o->>'eventRef';
 if ev is not null and not exists(select 1 from public.billing_paddle_event_observations where event_id=ev and observation_sha256=digest) then raise exception 'PADDLE_RECOVERY_REPLAY_CONFLICT';end if;
 select * into d from public.billing_paddle_event_deliveries where notification_ref=p_notification_ref;
 if d.notification_ref is not null then
  if d.event_id is distinct from ev or d.raw_payload_sha256 is distinct from p_raw_payload_sha256 then raise exception 'PADDLE_RECOVERY_REPLAY_CONFLICT';end if;
  return jsonb_build_object('accepted',true,'reused',true,'eventId',ev,'eventType',k);
 end if;
 v:=public.record_verified_billing_event_v2(p,p_raw_payload_sha256,p_notification_ref);
 if ev is null then
  insert into public.billing_webhook_events_v2(provider,environment,provider_event_ref,provider_event_name,resource_type,resource_ref,occurred_at,first_payload_sha256,subscription_ref,customer_ref,processing_status)
  values('paddle','test',o->>'eventRef',k,p#>>'{eventEvidence,resourceType}',p#>>'{eventEvidence,resourceRef}',(o->>'occurredAt')::timestamptz,p_raw_payload_sha256,o->>'subscriptionRef',o->>'customerRef','deferred') returning id into ev;
  insert into public.billing_paddle_event_observations(event_id,observation,observation_sha256,disposition)
  values(ev,logical,digest,case when s.id is not null and exists(select 1 from public.billing_customers_v2 c where c.id=s.customer_id and c.provider_customer_ref=o->>'customerRef' and c.identity_status='current') then 'correlated' else 'pending' end);
 end if;
 insert into public.billing_paddle_event_deliveries(notification_ref,event_id,raw_payload_sha256,verified_evidence_id)
 values(p_notification_ref,ev,p_raw_payload_sha256,(v->>'id')::uuid);
 return jsonb_build_object('accepted',true,'reused',false,'eventId',ev,'eventType',k);
end $$;

-- Provenance check also accepts authenticated uncorrelated invalidation evidence.
create function public.billing_paddle_recovery_event_v1(p_event uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.billing_paddle_event_observations o join public.billing_webhook_events_v2 e on e.id=o.event_id
 join public.billing_paddle_event_deliveries d on d.event_id=e.id join public.billing_verified_evidence_v2 v on v.id=d.verified_evidence_id
 where e.id=p_event and e.provider='paddle' and e.environment='test' and e.processing_status not in ('manual_review','failed')
 and o.observation_sha256=encode(extensions.digest(o.observation::text,'sha256'),'hex')
 and v.provider=e.provider and v.environment=e.environment and v.proof_kind='event' and v.source_kind='webhook'
 and v.proof_schema='billing-proof-v2' and v.validator_version='paddle-contract-v1' and v.evidence_class='authenticated_provider' and not v.payment_authority
 and v.provider_event_ref=e.provider_event_ref and v.provider_notification_ref=d.notification_ref and v.raw_payload_sha256=d.raw_payload_sha256
 and v.provider_resource_ref=e.resource_ref and v.proof#>>'{eventEvidence,eventName}'=e.provider_event_name
 and v.proof#>>'{eventEvidence,resourceType}'=e.resource_type
 and v.proof#>'{identity,customerRef}' is not distinct from o.observation->'customerRef'
 and v.proof#>'{identity,subscriptionRef}' is not distinct from o.observation->'subscriptionRef'
 and e.customer_ref is not distinct from o.observation->>'customerRef' and e.subscription_ref is not distinct from o.observation->>'subscriptionRef'
 and e.provider_event_ref=o.observation->>'eventRef' and e.provider_event_name=o.observation->>'kind'
 and e.occurred_at=(o.observation->>'occurredAt')::timestamptz
 and date_trunc('milliseconds',e.occurred_at)=(v.proof#>>'{eventEvidence,occurredAt}')::timestamptz
 and (e.resource_type<>'transaction' or v.proof#>'{identity,transactionRef}'=o.observation->'transactionRef'))
 then raise exception 'PADDLE_LIFECYCLE_RECOVERY_PROVENANCE';end if;
end $$;

create function public.billing_paddle_recovery_state_v1(o jsonb,p_dynamic boolean) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare state jsonb; period jsonb; items jsonb; payments jsonb;
begin
 period:=jsonb_build_array(public.billing_paddle_seat_timestamp_key_v1(o#>'{billingPeriod,startsAt}'),public.billing_paddle_seat_timestamp_key_v1(o#>'{billingPeriod,endsAt}'));
 select jsonb_agg(value order by value::text collate "C") into items from jsonb_array_elements(o->'items');
 state:=jsonb_build_object('provider',o->'provider','environment',o->'environment','customer',o->'customerRef','subscription',o->'subscriptionRef','transaction',o->'transactionRef','origin',o->'origin','currency',o->'currency','period',period,'items',items,'collection',o#>'{financial,collectionMode}','totals',(o#>'{financial,totals}')-'balance','planMarker',o->'planChangeOperationId','seatMarker',o->'seatQuantityOperationId');
 if p_dynamic then
  select coalesce(jsonb_agg(value order by value::text collate "C"),'[]'::jsonb) into payments from jsonb_array_elements(o#>'{financial,payments}');
  state:=state||jsonb_build_object('status',o->'status','balance',o#>'{financial,totals,balance}','captured',o#>'{financial,captured}','payments',payments);
 end if;
 return state;
end $$;

create function public.billing_paddle_recovery_unresolved_v1(p_subscription uuid) returns boolean
language sql stable set search_path=pg_catalog,public as $$
 select exists(select 1 from public.billing_subscriptions_v2 s join public.billing_paddle_event_observations o on o.observation->>'subscriptionRef'=s.provider_subscription_ref
 where s.id=p_subscription and o.observation->>'kind'='transaction.past_due' and coalesce(o.observation->>'origin','')<>'subscription_payment_method_change' and not exists(select 1 from public.billing_payment_applications_v2 p
 where p.provider='paddle' and p.environment='test' and p.subscription_id=s.id and p.application_kind='renewal' and p.provider_transaction_ref=o.observation->>'transactionRef'))
$$;

create function public.billing_paddle_recovery_candidate_v1(p_canonical uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare a public.account_subscriptions%rowtype;s public.billing_subscriptions_v2%rowtype;c public.billing_customers_v2%rowtype;
r record; debt jsonb;latest jsonb;sub_o jsonb;ref text;n integer;tx_event uuid;latest_event uuid;sub_event uuid;
states jsonb:='{}'; key text;revision numeric;watermark numeric;history jsonb:='[]';amount numeric;expected numeric;mapping uuid;result jsonb;latest_sub jsonb;sub_watermark numeric;
begin
 perform public.billing_guard_actor(); select * into a from public.account_subscriptions where id=p_canonical;
 perform public.billing_guard_lock(a.billing_account_id,'test'); perform pg_advisory_xact_lock(hashtextextended('paddle-ingress-test-v1',0));
 select * into a from public.account_subscriptions where id=p_canonical;
 if a.id is null or a.subscription_kind<>'paid' or a.source<>'billing_provider' or a.status not in ('active','past_due') or a.cancel_at_period_end
 or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=a.id and billing_account_id=a.billing_account_id and storage_contract='billing.v2')
 or exists(select 1 from public.account_subscriptions where billing_account_id=a.billing_account_id and id<>a.id and status in ('active','past_due','trialing','grace','restricted','trial_recovery'))
 or exists(select 1 from public.billing_provider_subscriptions where billing_account_id=a.billing_account_id and provider_status not in ('expired','cancelled'))
 then return jsonb_build_object('available',false,'reason','unsupported');end if;
 select count(*) into n from public.billing_subscriptions_v2 where account_subscription_id=a.id and billing_account_id=a.billing_account_id and shadow_status='current';
 if n<>1 then return jsonb_build_object('available',false,'reason','ambiguous');end if;
 select * into s from public.billing_subscriptions_v2 where account_subscription_id=a.id and shadow_status='current';
 if not exists(select 1 from public.billing_evidence_v2 e join public.billing_webhook_events_v2 w on w.id=e.event_id
 where e.id=s.latest_evidence_id and e.subscription_id=s.id and e.provider=s.provider and e.environment=s.environment and e.proof_kind='subscription'
 and e.normalized_sha256=encode(extensions.digest(e.proof::text,'sha256'),'hex') and w.processing_status='processed')
 then return jsonb_build_object('available',false,'reason','incomplete_evidence');end if;
 select * into c from public.billing_customers_v2 where id=s.customer_id;
 if s.provider<>'paddle' or s.environment<>'test' or s.reconciliation_status<>'processed' or s.provider_status not in ('past_due','active') or s.scheduled_cancel_at is not null
 or c.id is null or c.provider<>s.provider or c.environment<>s.environment or c.billing_account_id<>a.billing_account_id or c.identity_status<>'current' or c.identity_source<>'verified_provider_event'
 then return jsonb_build_object('available',false,'reason','unsupported');end if;
 if exists(select 1 from public.billing_operations_v2 where billing_account_id=a.billing_account_id and status not in ('completed','canceled','failed'))
 or exists(select 1 from public.billing_seat_quantity_operations where billing_account_id=a.billing_account_id and status not in ('completed','canceled','failed'))
 then return jsonb_build_object('available',false,'reason','operation_conflict');end if;
 -- Exclude only already-valid renewal consumption for this same subscription.
 select count(distinct o.observation->>'transactionRef'),min(o.observation->>'transactionRef') into n,ref
 from public.billing_paddle_event_observations o where o.observation->>'subscriptionRef'=s.provider_subscription_ref and o.observation->>'kind'='transaction.past_due' and coalesce(o.observation->>'origin','')<>'subscription_payment_method_change'
 and not exists(select 1 from public.billing_payment_applications_v2 p where p.provider='paddle' and p.environment='test' and p.provider_transaction_ref=o.observation->>'transactionRef' and p.subscription_id=s.id and p.application_kind='renewal');
 if n=0 then return jsonb_build_object('available',false,'reason',case when a.status='past_due' then 'incomplete_evidence' when exists(select 1 from public.billing_payment_applications_v2 where subscription_id=s.id and application_kind='renewal') then 'consumed' else 'none' end);end if;
 if n<>1 then return jsonb_build_object('available',false,'reason','ambiguous');end if;
 if exists(select 1 from public.billing_payment_applications_v2 where provider='paddle' and environment='test' and provider_transaction_ref=ref)
 or exists(select 1 from public.billing_checkouts_v2 where provider='paddle' and environment='test' and provider_transaction_ref=ref)
 then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
 for r in select * from public.billing_paddle_event_observations where observation->>'transactionRef'=ref order by event_id loop
  perform public.billing_paddle_recovery_event_v1(r.event_id);
  history:=history||jsonb_build_array(jsonb_build_array(r.event_id,r.observation_sha256));
  if r.observation->>'kind' like 'adjustment.%' then return jsonb_build_object('available',false,'reason','unsupported');end if;
  if r.observation->>'kind'='transaction.canceled' then return jsonb_build_object('available',false,'reason','canceled');end if;
  if r.observation->>'customerRef' is distinct from c.provider_customer_ref or r.observation->>'subscriptionRef' is distinct from s.provider_subscription_ref
  or r.observation->>'origin' is distinct from 'subscription_recurring'
  then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
  if (r.observation ? 'planChangeOperationId' and not exists(select 1 from public.billing_operations_v2 op where op.subscription_id=s.id and op.operation_kind='plan_change' and op.status='completed' and op.operation_id::text=r.observation->>'planChangeOperationId'))
  or (r.observation ? 'seatQuantityOperationId' and not exists(select 1 from public.billing_operations_v2 op where op.subscription_id=s.id and op.operation_kind='seat_quantity' and op.status='completed' and op.operation_id::text=r.observation->>'seatQuantityOperationId'))
  then return jsonb_build_object('available',false,'reason','operation_conflict');end if;
  if not (r.observation ? 'financial') or r.observation->'billingPeriod' is null or r.observation->'billingPeriod'='null'::jsonb then return jsonb_build_object('available',false,'reason','incomplete_evidence');end if;
  perform public.billing_paddle_recovery_financial_v1(r.observation);
  if r.observation#>>'{financial,collectionMode}'<>'automatic'
  or r.observation#>>'{financial,totals,credit}'<>'0' or r.observation#>>'{financial,totals,creditToBalance}'<>'0'
  or r.observation#>>'{financial,totals,discount}'<>'0'
  or (r.observation#>>'{financial,captured}')::numeric not in (0,(r.observation#>>'{financial,totals,grandTotal}')::numeric)
  or exists(select 1 from jsonb_array_elements(r.observation#>'{financial,payments}') p where p->>'status' not in ('error','failed','captured'))
  then return jsonb_build_object('available',false,'reason','unsupported');end if;
  if r.observation->>'status'='past_due' and r.observation#>>'{financial,captured}'<>'0' then return jsonb_build_object('available',false,'reason','settlement_pending');end if;
  if r.observation->>'status'='canceled' then return jsonb_build_object('available',false,'reason','canceled');end if;
  key:=public.billing_paddle_seat_timestamp_key_v1(r.observation#>'{financial,resourceUpdatedAt}'); revision:=key::numeric;
  if states ? key and states->key is distinct from public.billing_paddle_recovery_state_v1(r.observation,true) then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
  states:=jsonb_set(states,array[key],public.billing_paddle_recovery_state_v1(r.observation,true));
  if debt is not null and public.billing_paddle_recovery_state_v1(debt,false) is distinct from public.billing_paddle_recovery_state_v1(r.observation,false) then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
  if debt is null then debt:=r.observation;end if;
  if r.observation->>'kind'='transaction.past_due' and (tx_event is null or revision<public.billing_paddle_seat_timestamp_key_v1(sub_o#>'{financial,resourceUpdatedAt}')::numeric) then sub_o:=r.observation;tx_event:=r.event_id;end if;
  if watermark is null or revision>watermark then watermark:=revision;latest:=r.observation;latest_event:=r.event_id;end if;
 end loop;
 debt:=sub_o;sub_o:=null;
 if debt is null or debt->>'status'<>'past_due' then return jsonb_build_object('available',false,'reason','incomplete_evidence');end if;
 if latest->>'status'='canceled' then return jsonb_build_object('available',false,'reason','canceled');end if;
 if latest->>'status' not in ('past_due','paid','completed') then return jsonb_build_object('available',false,'reason','unsupported');end if;
 -- A newer failure cannot conceal earlier captured/paid knowledge.
 if latest->>'status'='past_due' and exists(select 1 from public.billing_paddle_event_observations where observation->>'transactionRef'=ref and observation->>'status' in ('paid','completed')) then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
 if debt#>>'{financial,collectionMode}'<>'automatic' or debt->>'currency'<>'USD' or debt#>>'{financial,captured}'<>'0'
 or (debt#>>'{financial,totals,balance}')::numeric is distinct from (debt#>>'{financial,totals,grandTotal}')::numeric
 or (debt#>>'{financial,totals,grandTotal}')::numeric<=0 or debt#>>'{financial,totals,discount}'<>'0' or debt#>>'{financial,totals,credit}'<>'0' or debt#>>'{financial,totals,creditToBalance}'<>'0'
 or exists(select 1 from jsonb_array_elements(debt#>'{financial,payments}') p where p->>'status' not in ('error','failed'))
 then return jsonb_build_object('available',false,'reason','unsupported');end if;
 -- Use the effective lifecycle item authority, not canonical item-row counts.
 if not public.billing_paddle_seat_lifecycle_items_v1(s.id,debt,debt) then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
 select sum((i#>>'{unitPrice,amount}')::numeric*(i->>'quantity')::numeric) into expected from jsonb_array_elements(debt->'items') i;
 if expected is distinct from (debt#>>'{financial,totals,subtotal}')::numeric then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
 mapping:=public.billing_paddle_current_mapping_v1(s.id);
 if not exists(select 1 from public.billing_price_mappings where id=mapping and plan_version_id=a.plan_version_id)
 or a.current_period_ends_at is null or public.billing_paddle_timestamp_v1(debt#>'{billingPeriod,startsAt}')<>a.current_period_ends_at
 or public.billing_paddle_timestamp_v1(debt#>'{billingPeriod,endsAt}')<>(a.current_period_ends_at at time zone 'UTC'+case (select cadence from public.billing_price_mappings where id=mapping) when 'monthly' then interval '1 month' when 'annual' then interval '1 year' else interval '0' end) at time zone 'UTC'
 then return jsonb_build_object('available',false,'reason','unsupported');end if;
 -- Validate every retained subscription pair before choosing supporting evidence.
 states:='{}';
 for r in select * from public.billing_paddle_event_observations where observation->>'subscriptionRef'=s.provider_subscription_ref and observation->>'kind' like 'subscription.%' and observation ? 'updatedAt' order by event_id loop
  perform public.billing_paddle_recovery_event_v1(r.event_id);
  if r.observation->>'customerRef' is distinct from c.provider_customer_ref then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
  key:=public.billing_paddle_seat_timestamp_key_v1(r.observation->'updatedAt');
  if states ? key and states->key is distinct from public.billing_paddle_seat_resource_state_v1(r.observation) then return jsonb_build_object('available',false,'reason','contradictory_evidence');end if;
  states:=jsonb_set(states,array[key],public.billing_paddle_seat_resource_state_v1(r.observation));
  if sub_watermark is null or key::numeric>sub_watermark then sub_watermark:=key::numeric;latest_sub:=r.observation;end if;
  history:=history||jsonb_build_array(jsonb_build_array(r.event_id,r.observation_sha256));
  if r.observation->>'status'='past_due' and public.billing_paddle_period_equal_v1(r.observation->'currentBillingPeriod',debt->'billingPeriod')
   and public.billing_paddle_seat_lifecycle_items_v1(s.id,r.observation,r.observation) and sub_event is null then sub_event:=r.event_id;sub_o:=r.observation;end if;
 end loop;
 if sub_event is null then return jsonb_build_object('available',false,'reason','incomplete_evidence');end if;
 perform public.billing_paddle_lifecycle_shape_v1(latest_sub);
 if latest_sub->>'status' not in ('active','past_due') or latest_sub->'scheduledChange' is distinct from 'null'::jsonb
 or latest_sub->'canceledAt' is distinct from 'null'::jsonb or latest_sub->'pausedAt' is distinct from 'null'::jsonb
 or not public.billing_paddle_period_equal_v1(latest_sub->'currentBillingPeriod',debt->'billingPeriod')
 or not public.billing_paddle_seat_lifecycle_items_v1(s.id,latest_sub,latest_sub)
 then return jsonb_build_object('available',false,'reason','unsupported');end if;
 amount:=(debt#>>'{financial,totals,grandTotal}')::numeric;
 result:=jsonb_build_object('provider','paddle','environment','test','billingAccountId',a.billing_account_id,'canonicalSubscriptionId',a.id,
 'providerSubscriptionReference',s.provider_subscription_ref,'providerCustomerReference',c.provider_customer_ref,'providerTransactionReference',ref,
 'kind','subscription_renewal','state','outstanding','amountMinor',amount::text,'currency',debt->'currency','servicePeriod',debt->'billingPeriod',
 'observedAt',debt->'occurredAt','resourceRevision',debt#>'{financial,resourceUpdatedAt}','evidence',jsonb_build_object('transactionEventId',tx_event,'subscriptionEventId',sub_event),
 'authorityRevision',encode(extensions.digest(jsonb_build_array('renewal-obligation-v1',to_jsonb(a),to_jsonb(s),to_jsonb(c),history,
 (select to_jsonb(m) from public.billing_price_mappings m where m.id=mapping),
 (select to_jsonb(m) from public.billing_price_mappings m where m.id=public.billing_paddle_current_seat_mapping_v1(s.id)))::text,'sha256'),'hex'));
 if latest->>'status'='past_due' and a.status='past_due' and s.provider_status='past_due' and latest_sub->>'status'='past_due' then return jsonb_build_object('available',true,'obligation',result);end if;
 return jsonb_build_object('available',false,'reason','settlement_pending','obligation',result,'latestTransactionEventId',latest_event,'latestSubscriptionRevision',sub_watermark::text);
exception when raise_exception or invalid_text_representation or numeric_value_out_of_range then
 return jsonb_build_object('available',false,'reason','incomplete_evidence');
end $$;

create function public.resolve_billing_outstanding_obligation_v1(p_canonical_subscription uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;begin
 perform public.billing_guard_actor();result:=public.billing_paddle_recovery_candidate_v1(p_canonical_subscription);
 if result->>'available'='false' then result:=result-array['obligation','latestTransactionEventId','latestSubscriptionRevision'];end if;return result;
end $$;

create function public.billing_paddle_recovery_settlement_v1(p_subscription uuid,p_sub_event uuid,p_tx_event uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare r jsonb;t jsonb;so jsonb;s public.billing_subscriptions_v2%rowtype;amount numeric;
begin
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 r:=public.billing_paddle_recovery_candidate_v1(s.account_subscription_id);
 if r->>'reason' is distinct from 'settlement_pending' or r->>'latestTransactionEventId' is distinct from p_tx_event::text or r->'obligation' is null then raise exception 'PADDLE_LIFECYCLE_RECOVERY_REQUIRED';end if;
 select observation into t from public.billing_paddle_event_observations where event_id=p_tx_event;
 select observation into so from public.billing_paddle_event_observations where event_id=p_sub_event;
 if public.billing_paddle_seat_timestamp_key_v1(so->'updatedAt') is distinct from r->>'latestSubscriptionRevision' then raise exception 'PADDLE_LIFECYCLE_RECOVERY_REQUIRED';end if;
 amount:=(r#>>'{obligation,amountMinor}')::numeric;
 if t->>'kind'<>'transaction.completed' or t->>'status'<>'completed' or t->>'origin'<>'subscription_recurring'
 or (t#>>'{financial,captured}')::numeric is distinct from amount or t#>>'{financial,totals,balance}' is distinct from '0'
 or (select count(*) from jsonb_array_elements(t#>'{financial,payments}') p where p->>'status'='captured')<>1
 or exists(select 1 from jsonb_array_elements(t#>'{financial,payments}') p where p->>'status' not in ('error','failed','captured'))
 then raise exception 'PADDLE_LIFECYCLE_RECOVERY_REQUIRED';end if;
 perform public.billing_paddle_recovery_event_v1(p_tx_event);perform public.billing_paddle_recovery_event_v1(p_sub_event);
end $$;

-- Extend the installed (plan- and seat-aware) definitions, with exact shape gates.
create function pg_temp.recovery_patch(signature regprocedure,needle text,replacement text) returns void language plpgsql as $$
declare body text:=replace(pg_get_functiondef(signature),chr(13),'');begin
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'PADDLE_RECOVERY_MIGRATION_SHAPE';end if;
 execute replace(body,needle,replacement);
end $$;
select pg_temp.recovery_patch('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)',
 'if o->>''kind'' is distinct from ''subscription.updated''','if o->>''kind'' not in (''subscription.updated'',''subscription.past_due'')');
select pg_temp.recovery_patch('public.billing_paddle_seat_lifecycle_items_v1(uuid,jsonb,jsonb)',
 'if p_candidate->>''kind''=''subscription.updated''','if p_candidate->>''kind'' in (''subscription.updated'',''subscription.past_due'')');
select pg_temp.recovery_patch('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)',
 'select observation into t from public.billing_paddle_event_observations where event_id=p_transaction_event;',
 $p$select observation into t from public.billing_paddle_event_observations where event_id=p_transaction_event;
  if public.billing_paddle_recovery_unresolved_v1(s.id) then perform public.billing_paddle_recovery_settlement_v1(s.id,p_subscription_event,p_transaction_event);end if;$p$);
select pg_temp.recovery_patch('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)',
 'status:=o->>''status'';',
 $p$status:=o->>'status';
 if status='active' and t is null and public.billing_paddle_recovery_unresolved_v1(s.id) then raise exception 'PADDLE_LIFECYCLE_PAYMENT_REQUIRED';end if;$p$);
select pg_temp.recovery_patch('public.reconcile_paddle_lifecycle_event_v1(uuid)',
 'if o->>''kind'' not in (''subscription.updated'',''transaction.completed'')','if o->>''kind'' not in (''subscription.updated'',''subscription.past_due'',''transaction.completed'')');
-- A retained nonfinancial checkout is not a competing renewal settlement.
select pg_temp.recovery_patch('public.reconcile_paddle_lifecycle_event_v1(uuid)',
 'and po.checkout_id is null and public.billing_paddle_period_equal_v1',
 'and po.checkout_id is null and coalesce(po.observation->>''origin'','''')<>''subscription_payment_method_change'' and public.billing_paddle_period_equal_v1');

create function public.reconcile_paddle_payment_recovery_event_v1(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o jsonb;begin
 perform public.billing_guard_actor();perform 1 from public.billing_runtime_policy where id=1 for share;
 if not (select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1) then return jsonb_build_object('status','disabled');end if;
 select observation into o from public.billing_paddle_event_observations where event_id=p_event;
 if o is null then raise exception 'PADDLE_RECOVERY_SCOPE';end if;
 if o->>'kind'='subscription.past_due' or (o->>'kind'='transaction.completed' and o->>'origin'='subscription_recurring') then return public.reconcile_paddle_lifecycle_event_v1(p_event);end if;
 perform public.billing_paddle_recovery_event_v1(p_event);
 if o->>'origin'='subscription_payment_method_change' then return jsonb_build_object('status','not_applicable');end if;
 return jsonb_build_object('status','pending');
end $$;

do $$declare r record;begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and (p.proname like 'billing_paddle_recovery_%' or p.proname in ('ingest_verified_paddle_recovery_event_v1','resolve_billing_outstanding_obligation_v1','reconcile_paddle_payment_recovery_event_v1')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 end loop;
end $$;
grant execute on function public.ingest_verified_paddle_recovery_event_v1(jsonb,text,text,jsonb),public.resolve_billing_outstanding_obligation_v1(uuid),public.reconcile_paddle_payment_recovery_event_v1(uuid) to service_role;
commit;
