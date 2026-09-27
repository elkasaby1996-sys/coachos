-- Paddle Sandbox additional seats. No rollout policy or historical item changes.
begin;

create function public.billing_paddle_current_seat_mapping_v1(p_subscription uuid) returns uuid
language sql stable set search_path=pg_catalog,public as $$
 select target_seat_mapping_id from public.billing_operations_v2
 where subscription_id=p_subscription and operation_kind='seat_quantity' and status='completed'
 order by completed_at desc,id desc limit 1
$$;

create function public.billing_paddle_seat_items_v1(p_base uuid,p_seat uuid,p_count integer,p_status text default null) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare b public.billing_price_mappings%rowtype;a public.billing_price_mappings%rowtype;items jsonb;
begin
 select * into b from public.billing_price_mappings where id=p_base;
 select * into a from public.billing_price_mappings where id=p_seat;
 if b.id is null or b.provider<>'paddle' or b.environment<>'test' or b.identity_kind<>'plan' or b.status not in ('active','retired')
 or b.catalogue_evidence_id is null or b.currency_code<>'USD' or p_count is null or p_count not between 0 and 5
 or (p_count>0 and (a.id is null or a.provider<>'paddle' or a.environment<>'test' or a.identity_kind<>'addon'
 or a.canonical_key<>'coach-seat' or a.cadence<>b.cadence or a.currency_code<>'USD' or a.status not in ('active','retired')
 or a.catalogue_evidence_id is null or a.unit_amount_minor<>(case b.cadence when 'monthly' then 1200 else 12000 end)))
 then raise exception 'PADDLE_SEAT_ITEMS';end if;
 items:=jsonb_build_array(jsonb_build_object('priceRef',b.provider_price_ref,'productRef',b.provider_product_ref,'quantity',1,
 'unitPrice',jsonb_build_object('amount',b.unit_amount_minor::text,'currency','USD'))||case when p_status is null then '{}'::jsonb else jsonb_build_object('status',p_status) end);
 if p_count>0 then items:=items||jsonb_build_array(jsonb_build_object('priceRef',a.provider_price_ref,'productRef',a.provider_product_ref,'quantity',p_count,
 'unitPrice',jsonb_build_object('amount',a.unit_amount_minor::text,'currency','USD'))||case when p_status is null then '{}'::jsonb else jsonb_build_object('status',p_status) end);end if;
 return items;
end $$;

create function public.paddle_seat_quantity_context_v1(p_owner uuid,p_target integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account uuid;s public.billing_subscriptions_v2%rowtype;c public.account_subscriptions%rowtype;b public.billing_price_mappings%rowtype;
 a public.billing_price_mappings%rowtype;p public.commercial_plan_versions%rowtype;
begin
 perform public.billing_guard_actor();
 if not exists(select 1 from public.pt_profiles where user_id=p_owner and workspace_id is null) then raise exception 'BILLING_SEAT_QUANTITY_OWNER_REQUIRED' using errcode='42501';end if;
 select id into account from public.billing_accounts where owner_user_id=p_owner;
 perform public.billing_guard_lock(account,'test');
 select * into s from public.billing_subscriptions_v2 where billing_account_id=account and environment='test' and shadow_status='current' and account_subscription_id is not null for update;
 select * into c from public.account_subscriptions where id=s.account_subscription_id;
 select * into b from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(s.id) for share;
 select * into p from public.commercial_plan_versions where id=c.plan_version_id;
 if not coalesce((select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1),false)
 or s.id is null or s.provider_status<>'active' or s.reconciliation_status<>'processed' or s.scheduled_cancel_at is not null
 or c.status<>'active' or c.subscription_kind<>'paid' or c.source<>'billing_provider' or c.cancel_at_period_end
 or b.id is null or b.plan_version_id<>c.plan_version_id or b.provider<>'paddle' or b.environment<>'test' or b.identity_kind<>'plan'
 or b.status<>'active' or b.catalogue_evidence_id is null or b.currency_code<>'USD'
 or c.current_period_started_at is null or c.current_period_ends_at is null or c.current_period_ends_at<=public.billing_paddle_plan_now_v1()
 or (c.current_period_started_at,c.current_period_ends_at) is distinct from (s.current_period_started_at,s.current_period_ends_at)
 or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=c.id and storage_contract='billing.v2')
 then raise exception 'BILLING_SEAT_QUANTITY_NOT_ELIGIBLE';end if;
 if exists(select 1 from public.billing_operations_v2 where subscription_id=s.id and status not in ('completed','canceled','failed')) then raise exception 'BILLING_SEAT_QUANTITY_OPERATION_CONFLICT';end if;
 if p_target is null or p_target<0 or p_target>p.max_coach_seats-p.included_coach_seats then raise exception 'BILLING_SEAT_QUANTITY_TARGET_INVALID';end if;
 select * into a from public.billing_price_mappings where provider='paddle' and environment='test' and canonical_key='coach-seat' and cadence=b.cadence and status='active' for share;
 if a.id is null or a.catalogue_evidence_id is null or a.currency_code<>'USD' or a.unit_amount_minor<>(case b.cadence when 'monthly' then 1200 else 12000 end)
 or (s.approved_additional_coach_seats>0 and a.id is distinct from public.billing_paddle_current_seat_mapping_v1(s.id)) then raise exception 'BILLING_SEAT_QUANTITY_MAPPING_UNAVAILABLE';end if;
 return jsonb_build_object('subscriptionId',s.id,'accountId',account,'canonicalId',c.id,'baseMappingId',b.id,'seatMappingId',a.id,
 'subscriptionRef',s.provider_subscription_ref,'customerRef',(select provider_customer_ref from public.billing_customers_v2 where id=s.customer_id and identity_status='current' and identity_source='verified_provider_event'),
 'base',jsonb_build_object('priceRef',b.provider_price_ref,'productRef',b.provider_product_ref,'amount',b.unit_amount_minor),
 'seat',jsonb_build_object('priceRef',a.provider_price_ref,'productRef',a.provider_product_ref,'amount',a.unit_amount_minor),
 'cadence',b.cadence,'additionalSeats',s.approved_additional_coach_seats,'maximumAdditionalSeats',p.max_coach_seats-p.included_coach_seats,
 'periodStart',c.current_period_started_at,'periodEnd',c.current_period_ends_at,'providerUpdatedAt',s.provider_updated_at);
end $$;

create function public.preview_paddle_seat_quantity_v1(p_owner uuid,p_target integer,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c jsonb;p public.commercial_plan_versions%rowtype;d jsonb;n integer;lim integer;blocked boolean;direction text;
begin
 c:=public.paddle_seat_quantity_context_v1(p_owner,p_target);n:=(c->>'additionalSeats')::integer;
 if (p_snapshot->>'subscriptionRef',p_snapshot->>'customerRef',p_snapshot->>'status',p_snapshot->>'cadence',p_snapshot->>'basePriceRef',p_snapshot->>'seatPriceRef')
 is distinct from (c->>'subscriptionRef',c->>'customerRef','active',c->>'cadence',c#>>'{base,priceRef}',case when n>0 then c#>>'{seat,priceRef}' end)
 or p_snapshot->'additionalSeats' is distinct from to_jsonb(n) or p_snapshot->>'updatedAt' is null
 or (p_snapshot->>'updatedAt')::timestamptz<(c->>'providerUpdatedAt')::timestamptz
 or ((p_snapshot->>'periodStart')::timestamptz,(p_snapshot->>'periodEnd')::timestamptz) is distinct from ((c->>'periodStart')::timestamptz,(c->>'periodEnd')::timestamptz)
 then raise exception 'BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT';end if;
 select v.* into p from public.commercial_plan_versions v join public.account_subscriptions a on a.plan_version_id=v.id where a.id=(c->>'canonicalId')::uuid;
 select value into d from jsonb_array_elements(public.resolve_account_capacity(p_owner,(c->>'accountId')::uuid)->'dimensions') where value->>'key'='coach_seats';
 lim:=least(p.max_coach_seats,p.included_coach_seats+p_target);
 blocked:=(d->>'dataQualityIssue')::boolean or (p_target<n and (d->>'committed')::integer>lim);
 direction:=case when p_target>n then 'increase' when p_target<n then 'reduction' else 'no-op' end;
 return jsonb_build_object('provider','paddle','planKey',p.plan_key,'cadence',c->'cadence','includedSeats',p.included_coach_seats,
 'currentAdditionalSeats',n,'targetAdditionalSeats',p_target,'maximumSeats',p.max_coach_seats,'maximumAdditionalSeats',p.max_coach_seats-p.included_coach_seats,
 'currentProviderQuantity',n,'targetProviderQuantity',p_target,'currentEffectiveLimit',public.billing_seat_effective_limit((c->>'accountId')::uuid),'targetEffectiveLimit',lim,
 'actual',d->'actual','pending',d->'pending','reserved',d->'reserved','committed',d->'committed','unitPriceMinor',c#>'{seat,amount}',
 'currentTotalMinor',(c#>>'{base,amount}')::bigint+n*(c#>>'{seat,amount}')::bigint,'targetTotalMinor',(c#>>'{base,amount}')::bigint+p_target*(c#>>'{seat,amount}')::bigint,
 'direction',direction,'timing',case when p_target<n then 'period_end' else 'immediate' end,'effectiveAt',case when p_target<n then c->>'periodEnd' end,
 'currency','USD','capacityBlocked',blocked,'eligible',not blocked,'errorCode',case when blocked then 'BILLING_SEAT_QUANTITY_CAPACITY_BLOCKED' end,
 'disclosure','Paddle calculates proration, taxes and credits. No payment has been collected by this preview. Increased capacity requires verified payment.');
end $$;

create function public.begin_paddle_seat_quantity_v1(p_owner uuid,p_target integer,p_operation uuid,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account uuid;o public.billing_operations_v2%rowtype;c jsonb;v jsonb;n integer;
begin
 perform public.billing_guard_actor();select id into account from public.billing_accounts where owner_user_id=p_owner;perform public.billing_guard_lock(account,'test');
 if p_operation is null then raise exception 'BILLING_SEAT_QUANTITY_TARGET_INVALID';end if;
 select * into o from public.billing_operations_v2 where billing_account_id=account and operation_id=p_operation;
 if o.id is not null then
  if o.operation_kind<>'seat_quantity' or o.environment<>'test' or o.target_additional_seats is distinct from p_target then raise exception 'BILLING_SEAT_QUANTITY_OPERATION_CONFLICT';end if;
  return jsonb_build_object('id',o.id,'dispatch',false);
 end if;
 if p_snapshot is null then return jsonb_build_object('needsSnapshot',true);end if;
 v:=public.preview_paddle_seat_quantity_v1(p_owner,p_target,p_snapshot);
 if v->>'errorCode' is not null then raise exception '%',v->>'errorCode';end if;
 if v->>'direction'='no-op' then return jsonb_build_object('dispatch',false);end if;
 c:=public.paddle_seat_quantity_context_v1(p_owner,p_target);n:=(c->>'additionalSeats')::integer;
 insert into public.billing_operations_v2(operation_id,billing_account_id,subscription_id,provider,environment,source_account_subscription_id,operation_kind,
 source_base_mapping_id,target_base_mapping_id,source_seat_mapping_id,target_seat_mapping_id,source_seat_mapping_kind,target_seat_mapping_kind,
 source_cadence,target_cadence,source_additional_seats,target_additional_seats,effective_timing,status,preflight_snapshot,provider_requested_at,effective_at,created_by_user_id,source_period_started_at,source_period_ends_at)
 values(p_operation,account,(c->>'subscriptionId')::uuid,'paddle','test',(c->>'canonicalId')::uuid,'seat_quantity',(c->>'baseMappingId')::uuid,(c->>'baseMappingId')::uuid,
 case when n>0 then (c->>'seatMappingId')::uuid end,case when p_target>0 then (c->>'seatMappingId')::uuid end,case when n>0 then 'addon' end,case when p_target>0 then 'addon' end,
 c->>'cadence',c->>'cadence',n,p_target,v->>'timing','provider_pending',public.resolve_account_capacity(p_owner,account)-array['billingAccountId','ownerUserId','subscription','computedAt'],
 public.billing_paddle_plan_now_v1(),(v->>'effectiveAt')::timestamptz,p_owner,(c->>'periodStart')::timestamptz,(c->>'periodEnd')::timestamptz) returning * into o;
 insert into public.billing_operation_events_v2(operation_id,event_type) values(o.id,'billing.seat_quantity_requested');
 return jsonb_build_object('id',o.id,'dispatch',true,'context',c);
end $$;

create function public.fail_paddle_seat_quantity_v1(p_owner uuid,p_operation uuid,p_ambiguous boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account uuid;begin
 perform public.billing_guard_actor();select id into account from public.billing_accounts where owner_user_id=p_owner;perform public.billing_guard_lock(account,'test');
 update public.billing_operations_v2 set status=case when p_ambiguous then 'ambiguous' else 'failed' end,
 ambiguous_at=case when p_ambiguous then clock_timestamp() end,failed_at=case when not p_ambiguous then clock_timestamp() end,
 error_code=case when p_ambiguous then 'BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS' else 'BILLING_SEAT_QUANTITY_PAYMENT_FAILED' end,updated_at=clock_timestamp()
 where id=p_operation and billing_account_id=account and operation_kind='seat_quantity' and status='provider_pending';
end $$;

-- Narrow settlement shape: target add-on charge, and (when nonzero) source
-- add-on credit. No unchanged base line; exact signed magnitudes, not net sums.
create function public.billing_paddle_seat_settlement_items_v1(p_operation uuid) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare o public.billing_operations_v2%rowtype;items jsonb;begin
 select * into o from public.billing_operations_v2 where id=p_operation;
 items:=jsonb_build_array(public.billing_paddle_seat_items_v1(o.target_base_mapping_id,o.target_seat_mapping_id,o.target_additional_seats)->1);
 if o.source_additional_seats>0 then items:=items||jsonb_build_array(jsonb_set(public.billing_paddle_seat_items_v1(o.source_base_mapping_id,o.source_seat_mapping_id,o.source_additional_seats)->1,'{quantity}',to_jsonb(-o.source_additional_seats)));end if;
 return items;
end $$;

create function public.billing_paddle_seat_facts_v1(p_operation uuid,p_subscription_event uuid,p_transaction_event uuid default null) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare op public.billing_operations_v2%rowtype;s public.billing_subscriptions_v2%rowtype;a public.account_subscriptions%rowtype;m public.billing_price_mappings%rowtype;
 so jsonb;tx jsonb;se uuid;te uuid;expected jsonb;stamp timestamptz;begin
 select * into op from public.billing_operations_v2 where id=p_operation;
 perform public.billing_guard_lock(op.billing_account_id,'test');select * into s from public.billing_subscriptions_v2 where id=op.subscription_id for update;
 select * into a from public.account_subscriptions where id=op.source_account_subscription_id for update;
 select * into m from public.billing_price_mappings where id=op.source_base_mapping_id;
 if not coalesce((select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1),false)
 or op.id is null or op.operation_kind<>'seat_quantity' or op.environment<>'test' or op.status not in ('provider_pending','awaiting_payment','ambiguous')
 or op.source_base_mapping_id<>op.target_base_mapping_id or op.source_cadence<>op.target_cadence
 or s.account_subscription_id is distinct from a.id or s.shadow_status<>'current' or s.reconciliation_status<>'processed'
 or s.approved_additional_coach_seats<>op.source_additional_seats or s.provider_status<>'active' or s.scheduled_cancel_at is not null
 or a.status<>'active' or a.cancel_at_period_end or a.plan_version_id<>m.plan_version_id
 or public.billing_paddle_current_mapping_v1(s.id) is distinct from op.source_base_mapping_id
 then raise exception 'PADDLE_SEAT_IDENTITY';end if;
 se:=public.billing_paddle_reconciliation_event_v1(p_subscription_event);
 select observation into so from public.billing_paddle_event_observations where event_id=p_subscription_event;
 expected:=public.billing_paddle_seat_items_v1(op.target_base_mapping_id,op.target_seat_mapping_id,op.target_additional_seats,'active');
 if so->>'kind' is distinct from 'subscription.updated' or so->>'status' is distinct from 'active'
 or so->>'subscriptionRef' is distinct from s.provider_subscription_ref::text
 or so->>'customerRef' is distinct from (select provider_customer_ref::text from public.billing_customers_v2 where id=s.customer_id and identity_status='current' and identity_source='verified_provider_event')
 or so->>'seatQuantityOperationId' is distinct from op.operation_id::text or so ? 'planChangeOperationId'
 or so->'pausedAt' is distinct from 'null'::jsonb or so->'canceledAt' is distinct from 'null'::jsonb or so->'scheduledChange' is distinct from 'null'::jsonb
 or jsonb_array_length(so->'items')<>jsonb_array_length(expected) or (so->'items' @> expected) is not true
 or not public.billing_paddle_period_equal_v1(so->'currentBillingPeriod',jsonb_build_object('startsAt',op.source_period_started_at,'endsAt',op.source_period_ends_at))
 or (so->>'nextBilledAt')::timestamptz is distinct from op.source_period_ends_at
 then raise exception 'PADDLE_SEAT_SUBSCRIPTION';end if;
 stamp:=(so->>'updatedAt')::timestamptz;
 if stamp is null or stamp<op.provider_requested_at or stamp<s.provider_updated_at or stamp>(so->>'occurredAt')::timestamptz then raise exception 'PADDLE_SEAT_STALE';end if;
 if p_transaction_event is not null then
  te:=public.billing_paddle_reconciliation_event_v1(p_transaction_event);
  select observation into tx from public.billing_paddle_event_observations where event_id=p_transaction_event;
  expected:=public.billing_paddle_seat_settlement_items_v1(op.id);
  if op.effective_timing<>'immediate' or tx->>'kind' is distinct from 'transaction.completed' or tx->>'status' is distinct from 'completed'
  or tx->>'origin' is distinct from 'subscription_update' or tx->>'currency' is distinct from 'USD'
  or tx->'subscriptionRef' is distinct from so->'subscriptionRef' or tx->'customerRef' is distinct from so->'customerRef'
  or tx->>'seatQuantityOperationId' is distinct from op.operation_id::text or tx ? 'planChangeOperationId'
  or (tx->>'occurredAt')::timestamptz<op.provider_requested_at
  or not public.billing_paddle_period_equal_v1(tx->'billingPeriod',so->'currentBillingPeriod')
  or jsonb_array_length(tx->'items')<>jsonb_array_length(expected) or (tx->'items' @> expected) is not true
  or coalesce((tx#>>'{paymentTotals,total}')::bigint,0)<=0 or (tx#>>'{paymentTotals,balance}')::bigint is distinct from 0::bigint
  or coalesce((tx#>>'{paymentTotals,paid}')::bigint,0)<(tx#>>'{paymentTotals,total}')::bigint
  or exists(select 1 from public.billing_checkouts_v2 where provider='paddle' and environment='test' and provider_transaction_ref=tx->>'transactionRef')
  or exists(select 1 from public.billing_payment_applications_v2 where provider='paddle' and environment='test' and provider_transaction_ref=tx->>'transactionRef')
  then raise exception 'PADDLE_SEAT_PAYMENT';end if;
 end if;
 return jsonb_build_object('operationId',op.id,'subscriptionId',s.id,'billingAccountId',s.billing_account_id,'canonicalId',a.id,
 'subscriptionEventId',p_subscription_event,'transactionEventId',p_transaction_event,'subscriptionVerifiedEvidenceId',se,'transactionVerifiedEvidenceId',te,
 'approvedSeats',op.target_additional_seats,'sourceSeats',op.source_additional_seats,'providerStatus','active','providerUpdatedAt',stamp,
 'periodStart',op.source_period_started_at,'periodEnd',op.source_period_ends_at,
 'subscriptionObservationSha256',(select observation_sha256 from public.billing_paddle_event_observations where event_id=p_subscription_event),
 'transactionObservationSha256',(select observation_sha256 from public.billing_paddle_event_observations where event_id=p_transaction_event));
end $$;

alter table public.billing_evidence_v2 drop constraint billing_evidence_version_pair;
alter table public.billing_evidence_v2 add constraint billing_evidence_version_pair check (
 (proof_schema='billing-foundation-v1' and validator_version='structure-only-v1') or
 (provider='paddle' and environment='test' and proof_kind in ('subscription','transaction') and source_kind='webhook' and
 ((proof_schema='paddle-initial-purchase-v1' and validator_version='paddle-reconciliation-v1') or
 (proof_schema='paddle-subscription-lifecycle-v1' and validator_version='paddle-lifecycle-v1') or
 (proof_schema='paddle-plan-change-v1' and validator_version='paddle-plan-v1') or
 (proof_schema='paddle-seat-quantity-v1' and validator_version='paddle-seat-v1'))));
create unique index paddle_seat_event_once on public.billing_evidence_v2(event_id,proof_kind) where proof_schema='paddle-seat-quantity-v1';
create function public.billing_paddle_seat_evidence_v1(p_operation uuid,p_subscription_event uuid,p_transaction_event uuid,p_kind text) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare facts jsonb;ev public.billing_webhook_events_v2%rowtype;v public.billing_verified_evidence_v2%rowtype;p jsonb;result uuid;
begin
 facts:=public.billing_paddle_seat_facts_v1(p_operation,p_subscription_event,p_transaction_event);
 select id into result from public.billing_evidence_v2 where event_id=case when p_kind='subscription' then p_subscription_event else p_transaction_event end and proof_schema='paddle-seat-quantity-v1' and proof_kind=p_kind;
 if result is not null then return result;end if;
 select * into ev from public.billing_webhook_events_v2 where id=(facts->>(p_kind||'EventId'))::uuid;
 select * into v from public.billing_verified_evidence_v2 where id=(facts->>(p_kind||'VerifiedEvidenceId'))::uuid;
 if p_kind not in ('subscription','transaction') or v.id is null then raise exception 'PADDLE_SEAT_PROOF'; end if;
 p:=jsonb_build_object('schema','paddle-seat-quantity-v1','provider','paddle','environment','test','kind',p_kind,'identity',jsonb_build_object('subscriptionRef',ev.subscription_ref,'customerRef',ev.customer_ref,'eventRef',ev.provider_event_ref,'resourceRef',ev.resource_ref)
 ||case when p_kind='transaction' then jsonb_build_object('transactionRef',ev.resource_ref) else '{}'::jsonb end,'observation',facts);
 insert into public.billing_evidence_v2(provider,environment,source_kind,proof_kind,proof_schema,validator_version,replay_algorithm,replay_key,normalized_sha256,proof,verified_at,event_id,subscription_id,provider_notification_ref,raw_payload_sha256,provider_transaction_ref)
 values('paddle','test','webhook',p_kind,'paddle-seat-quantity-v1','paddle-seat-v1','delivery-evidence-v1',
 encode(extensions.digest(jsonb_build_array(ev.provider_event_ref,v.provider_notification_ref,v.raw_payload_sha256)::text,'sha256'),'hex'),
 encode(extensions.digest(p::text,'sha256'),'hex'),p,public.billing_paddle_plan_now_v1(),ev.id,(facts->>'subscriptionId')::uuid,v.provider_notification_ref,v.raw_payload_sha256,
 case when p_kind='transaction' then ev.resource_ref end) returning id into result;
 return result;
end $$;

create function public.billing_paddle_seat_proof_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare f jsonb; e public.billing_evidence_v2%rowtype;v public.billing_verified_evidence_v2%rowtype;
begin
 if tg_table_name='billing_evidence_v2' then e:=new;
 else select * into e from public.billing_evidence_v2 where id=new.evidence_id; end if;
 if e.proof_schema<>'paddle-seat-quantity-v1' then
  if tg_table_name='billing_payment_applications_v2' then
   if new.application_kind='seat_increase' then raise exception 'PADDLE_SEAT_PROOF'; end if;
  end if;
  return new;
 end if;
 f:=public.billing_paddle_seat_facts_v1((e.proof#>>'{observation,operationId}')::uuid,(e.proof#>>'{observation,subscriptionEventId}')::uuid,(e.proof#>>'{observation,transactionEventId}')::uuid);
 select * into v from public.billing_verified_evidence_v2 where id=(f->>(e.proof_kind||'VerifiedEvidenceId'))::uuid;
 if e.proof->'observation' is distinct from f or e.subscription_id is distinct from (f->>'subscriptionId')::uuid
 or e.event_id is distinct from (f->>(e.proof_kind||'EventId'))::uuid
 or (e.provider_notification_ref,e.raw_payload_sha256) is distinct from (v.provider_notification_ref,v.raw_payload_sha256)
 then raise exception 'PADDLE_SEAT_PROOF'; end if;
 if tg_table_name='billing_payment_applications_v2' then
  if new.application_kind<>'seat_increase' or e.proof_kind<>'transaction' or new.operation_id is distinct from (f->>'operationId')::uuid
  or new.subscription_id<>e.subscription_id or new.billing_account_id is distinct from (f->>'billingAccountId')::uuid then raise exception 'PADDLE_SEAT_PAYMENT'; end if;
 end if;
 return new;
end $$;
create trigger paddle_seat_proof_guard before insert on public.billing_evidence_v2 for each row execute function public.billing_paddle_seat_proof_guard_v1();
create trigger paddle_seat_payment_guard before insert on public.billing_payment_applications_v2 for each row execute function public.billing_paddle_seat_proof_guard_v1();


create function public.reconcile_paddle_seat_quantity_event_v1(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype;op public.billing_operations_v2%rowtype;o jsonb;so jsonb;se uuid;te uuid;n integer;
 facts jsonb;e uuid;pay uuid;result text;begin
 perform public.billing_guard_actor();perform 1 from public.billing_runtime_policy where id=1 for share;
 if not (select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1) then return jsonb_build_object('status','disabled');end if;
 select observation into o from public.billing_paddle_event_observations where event_id=p_event;
 select * into s from public.billing_subscriptions_v2 where provider='paddle' and environment='test' and provider_subscription_ref=o->>'subscriptionRef';
 perform public.billing_guard_lock(s.billing_account_id,'test');select * into s from public.billing_subscriptions_v2 where id=s.id for update;
 if exists(select 1 from public.billing_evidence_v2 where event_id=p_event and proof_schema='paddle-seat-quantity-v1') then return jsonb_build_object('status','reused');end if;
 select * into op from public.billing_operations_v2 where subscription_id=s.id and operation_kind='seat_quantity' and status not in ('completed','canceled','failed') for update;
 if op.id is null then return jsonb_build_object('status','not_applicable');end if;
 -- A verified schedule's subsequent lifecycle evidence uses the existing paired
 -- renewal/degradation pipeline. It never re-enters immediate settlement.
 if op.status='scheduled' or (o->>'kind'='subscription.updated' and (o->>'status'<>'active' or o->'scheduledChange'<>'null'::jsonb)) then return jsonb_build_object('status','not_applicable');end if;
 if op.status='manual_review' then return jsonb_build_object('status','manual_review');end if;
 begin
  perform public.billing_paddle_reconciliation_event_v1(p_event);
  if o->>'seatQuantityOperationId' is distinct from op.operation_id::text or o ? 'planChangeOperationId' then raise exception 'PADDLE_SEAT_CORRELATION';end if;
  if o->>'kind'='subscription.updated' then se:=p_event;so:=o;
  elsif o->>'kind'='transaction.completed' then
   if o->>'origin' is distinct from 'subscription_update' then raise exception 'PADDLE_SEAT_PAYMENT';end if;
   select count(*),min(event_id::text)::uuid into n,se from public.billing_paddle_event_observations
   where observation->>'subscriptionRef'=s.provider_subscription_ref and observation->>'kind'='subscription.updated'
   and observation->>'status'='active' and observation->>'seatQuantityOperationId'=op.operation_id::text
   and (observation->>'updatedAt')::timestamptz>=op.provider_requested_at;
   if n=0 then return jsonb_build_object('status','pending');end if;
   if n<>1 then raise exception 'PADDLE_SEAT_AMBIGUOUS_EVIDENCE';end if;
   select observation into so from public.billing_paddle_event_observations where event_id=se;
  else return jsonb_build_object('status','not_applicable');end if;
  select count(*),min(event_id::text)::uuid into n,te from public.billing_paddle_event_observations
  where observation->>'subscriptionRef'=s.provider_subscription_ref and observation->>'kind'='transaction.completed'
  and observation->>'seatQuantityOperationId'=op.operation_id::text;
  if n>1 then raise exception 'PADDLE_SEAT_AMBIGUOUS_PAYMENT';end if;
  if op.effective_timing='period_end' and n<>0 then raise exception 'PADDLE_SEAT_UNEXPECTED_PAYMENT';end if;
  facts:=public.billing_paddle_seat_facts_v1(op.id,se,te);
  if op.effective_timing='immediate' and te is null then
   update public.billing_operations_v2 set status='awaiting_payment',provider_applied_at=clock_timestamp(),error_code='BILLING_SEAT_QUANTITY_AWAITING_PAYMENT',updated_at=clock_timestamp() where id=op.id;
   return jsonb_build_object('status','pending');
  end if;
  e:=public.billing_paddle_seat_evidence_v1(op.id,se,te,'subscription');
  if te is not null then
   pay:=public.billing_paddle_seat_evidence_v1(op.id,se,te,'transaction');
   insert into public.billing_payment_applications_v2(provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind,operation_id)
   select 'paddle','test',provider_transaction_ref,s.billing_account_id,s.id,id,'seat_increase',op.id from public.billing_evidence_v2 where id=pay;
  end if;
  update public.billing_operations_v2 set status=case when te is null then 'scheduled' else 'awaiting_payment' end,
   provider_applied_at=clock_timestamp(),last_evidence_id=e,error_code=null,updated_at=clock_timestamp() where id=op.id;
  update public.billing_subscriptions_v2 set approved_additional_coach_seats=case when te is null then approved_additional_coach_seats else op.target_additional_seats end,
   provider_updated_at=(facts->>'providerUpdatedAt')::timestamptz,latest_evidence_id=e,
   latest_snapshot_sha256=(select normalized_sha256 from public.billing_evidence_v2 where id=e),last_reconciled_at=clock_timestamp(),updated_at=clock_timestamp() where id=s.id;
  if te is not null then
   update public.billing_operations_v2 set status='completed',completed_at=clock_timestamp(),payment_confirmed_at=clock_timestamp(),updated_at=clock_timestamp() where id=op.id;
  end if;
  insert into public.billing_operation_events_v2(operation_id,event_type) values(op.id,case when te is null then 'billing.seat_quantity_scheduled' else 'billing.seat_quantity_completed' end) on conflict do nothing;
  update public.billing_webhook_events_v2 set processing_status='processed',processed_at=clock_timestamp(),last_error_code=null where id in (se,te);
  result:='applied';
 exception when raise_exception then
  if sqlerrm like 'PADDLE_SEAT_%' or sqlerrm='PADDLE_RECONCILIATION_VERIFIED_EVENT_REQUIRED' then
   update public.billing_operations_v2 set status='manual_review',error_code='BILLING_SEAT_QUANTITY_MANUAL_REVIEW',updated_at=clock_timestamp() where id=op.id;
   update public.billing_webhook_events_v2 set processing_status='manual_review',last_error_code='PADDLE_SEAT_REVIEW' where id=p_event;result:='manual_review';
  else raise;end if;
 end;
 return jsonb_build_object('status',result);
end $$;

-- Only the verified schedule can explain provider quantity diverging from paid
-- approval. The capacity reader does not lower approval on the wall clock alone.
create function public.billing_paddle_seat_lifecycle_count_v1(p_subscription uuid,p_observation jsonb,p_approved boolean) returns integer
language plpgsql stable set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype;o public.billing_operations_v2%rowtype;begin
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 select * into o from public.billing_operations_v2 where subscription_id=s.id and operation_kind='seat_quantity'
 and status in ('provider_pending','awaiting_payment','ambiguous','scheduled','manual_review') order by provider_requested_at desc nulls last limit 1;
 if o.id is not null and o.operation_id::text=p_observation->>'seatQuantityOperationId' and not (p_observation ? 'planChangeOperationId')
 and (p_observation->>'updatedAt')::timestamptz>=o.provider_requested_at then
  -- Review cannot settle or grant seats, but authenticated degradation must
  -- still accept the known dispatched item set and retain paid approval.
  if o.status='manual_review' and (p_approved or p_observation->>'status'='active') then return s.approved_additional_coach_seats;end if;
  if not p_approved then return o.target_additional_seats;end if;
  if o.status='scheduled' and o.effective_timing='period_end' and o.effective_at<=public.billing_paddle_plan_now_v1()
  and p_observation->>'status'='active' and p_observation->'scheduledChange'='null'::jsonb
  and (p_observation#>>'{currentBillingPeriod,startsAt}')::timestamptz=o.effective_at
  and exists(select 1 from public.billing_evidence_v2 e where e.id=o.last_evidence_id and e.proof_schema='paddle-seat-quantity-v1'
   and e.proof#>>'{observation,operationId}'=o.id::text and e.proof#>>'{observation,approvedSeats}'=o.target_additional_seats::text)
  then return o.target_additional_seats;end if;
 end if;
 return s.approved_additional_coach_seats;
end $$;

create function public.billing_paddle_seat_lifecycle_items_v1(p_subscription uuid,p_observation jsonb,p_candidate jsonb) returns boolean
language plpgsql stable set search_path=pg_catalog,public as $$
declare n integer;mapping uuid;expected jsonb;op public.billing_operations_v2%rowtype;actual jsonb;
begin
 n:=public.billing_paddle_seat_lifecycle_count_v1(p_subscription,p_observation,false);
 mapping:=public.billing_paddle_current_seat_mapping_v1(p_subscription);
 select * into op from public.billing_operations_v2 where subscription_id=p_subscription and operation_kind='seat_quantity'
 and (status in ('provider_pending','awaiting_payment','ambiguous','scheduled') or (status='manual_review' and p_observation->>'status' in ('past_due','canceled'))) and operation_id::text=p_observation->>'seatQuantityOperationId';
 if op.id is not null then mapping:=op.target_seat_mapping_id;end if;
 expected:=public.billing_paddle_seat_items_v1(public.billing_paddle_current_mapping_v1(p_subscription),mapping,n);
 select jsonb_agg(value-'status') into actual from jsonb_array_elements(p_candidate->'items');
 if p_candidate->>'kind'='subscription.updated' and exists(select 1 from jsonb_array_elements(p_candidate->'items') i
  where i->>'status' not in ('active','inactive') or (p_candidate->>'status'<>'canceled' and i->>'status'<>'active')) then return false;end if;
 return coalesce(jsonb_array_length(actual)=jsonb_array_length(expected) and actual @> expected,false);
end $$;

create function public.billing_paddle_seat_approval_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_evidence_v2%rowtype;o public.billing_operations_v2%rowtype;f jsonb;begin
 if tg_op='INSERT' then
  if new.approved_additional_coach_seats<>0 then raise exception 'PADDLE_SEAT_APPROVAL_PROOF' using errcode='23514';end if;return new;
 end if;
 select * into e from public.billing_evidence_v2 where id=new.latest_evidence_id;f:=e.proof->'observation';
 if e.proof_schema='paddle-seat-quantity-v1' then
  select * into o from public.billing_operations_v2 where id=(f->>'operationId')::uuid;
  if e.proof_kind<>'subscription' or e.subscription_id<>new.id or new.account_subscription_id is distinct from old.account_subscription_id
  or new.shadow_status<>'current' or new.environment<>'test' or new.reconciliation_status<>'processed'
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
end $$;
alter table public.billing_subscriptions_v2 drop constraint billing_v2_seat_approval_disabled;
create trigger paddle_seat_approval_guard before insert or update on public.billing_subscriptions_v2 for each row execute function public.billing_paddle_seat_approval_guard_v1();

-- Shape-checked extensions; existing plan settlement predicates stay intact.
create function pg_temp.seat_patch(p_signature regprocedure,p_needle text,p_replacement text,p_count integer default 1) returns void language plpgsql as $$
declare body text:=replace(pg_get_functiondef(p_signature),chr(13),'');begin
 if (length(body)-length(replace(body,p_needle,'')))/length(p_needle)<>p_count then raise exception 'PADDLE_SEAT_MIGRATION_SHAPE: %',p_signature;end if;
 execute replace(body,p_needle,p_replacement);
end $$;
select pg_temp.seat_patch('public.billing_v2_protect_subscription_lifecycle()',
 '''reconciliation_status'',''provider_status''','''approved_additional_coach_seats'',''reconciliation_status'',''provider_status''',2);
select pg_temp.seat_patch('public.billing_paddle_initial_link_guard_v1()', 'begin', $patch$begin
 if exists(select 1 from public.billing_evidence_v2 where id=new.latest_evidence_id and proof_schema='paddle-seat-quantity-v1') then
  -- The dedicated proof guard checks this same row in this transaction.
  return new;
 end if;$patch$);
select pg_temp.seat_patch('public.billing_paddle_initial_link_guard_v1()',
 'or new.approved_additional_coach_seats<>0 or e.proof_kind<>''subscription''',
 'or new.approved_additional_coach_seats is distinct from (facts->>''approvedSeats'')::integer or e.proof_kind<>''subscription''');
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)', 'plan_delta boolean:=false;','plan_delta boolean:=false;seat_delta boolean:=false;');
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)',
 'array[''planChangeOperationId'',''paymentTotals'']','array[''planChangeOperationId'',''seatQuantityOperationId'',''paymentTotals'']');
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)',
 'array[''planChangeOperationId'',''paymentTotals'',''origin''','array[''planChangeOperationId'',''seatQuantityOperationId'',''paymentTotals'',''origin''');
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)',
 'perform public.billing_paddle_lifecycle_shape_v1(o);', $patch$perform public.billing_paddle_lifecycle_shape_v1(o);
 if o ? 'seatQuantityOperationId' and (o ? 'planChangeOperationId' or jsonb_typeof(o->'seatQuantityOperationId')<>'string'
 or (o->>'seatQuantityOperationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'PADDLE_INGRESS_INVALID';end if;$patch$);
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)',
 'kind=''transaction.completed'' and o ? ''planChangeOperationId'' and o->>''origin''=''subscription_update'' then',
 'kind=''transaction.completed'' and (o ? ''planChangeOperationId'' or o ? ''seatQuantityOperationId'') and o->>''origin''=''subscription_update'' then');
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)',
 '-- Unknown/mismatched items are retained as manual-review evidence only.', $patch$seat_delta:=coalesce(kind='transaction.completed' and o->>'origin'='subscription_update'
 and o ? 'seatQuantityOperationId' and not found_checkout and exists(select 1 from public.billing_operations_v2 op
 where op.operation_id::text=o->>'seatQuantityOperationId' and op.provider='paddle' and op.environment='test'
 and op.operation_kind='seat_quantity' and op.status in ('provider_pending','awaiting_payment','ambiguous')
 and op.billing_account_id=account and op.subscription_id=sub.id and op.effective_timing='immediate'
 and op.source_base_mapping_id=op.target_base_mapping_id and op.source_cadence=op.target_cadence),false);
 -- Unknown/mismatched items are retained as manual-review evidence only.$patch$);
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)',
 '(mapping.identity_kind=any(roles) and not (plan_delta and mapping.identity_kind=''plan''))',
 '(mapping.identity_kind=any(roles) and not (plan_delta and mapping.identity_kind=''plan'') and not (seat_delta and mapping.identity_kind=''addon''))');
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)',
 '(mapping.identity_kind=''addon'' and (item->>''quantity'')::int>5)',
 '(mapping.identity_kind=''addon'' and (abs((item->>''quantity'')::int)>5 or ((item->>''quantity'')::int<1 and not seat_delta)))');
select pg_temp.seat_patch('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)',
 'if not (''plan''=any(roles)) then valid_items:=false; end if;', $patch$if not ('plan'=any(roles)) and not seat_delta then valid_items:=false;end if;
 if seat_delta and not exists(select 1 from public.billing_operations_v2 op where op.operation_id::text=o->>'seatQuantityOperationId'
 and jsonb_array_length(o->'items')=jsonb_array_length(public.billing_paddle_seat_settlement_items_v1(op.id))
 and o->'items' @> public.billing_paddle_seat_settlement_items_v1(op.id)) then valid_items:=false;end if;$patch$);
select pg_temp.seat_patch('public.reconcile_paddle_initial_purchase_event_v1(uuid)',
 'result:=public.reconcile_paddle_plan_change_event_v1(p_event);',
 'result:=public.reconcile_paddle_seat_quantity_event_v1(p_event); if result->>''status''<>''not_applicable'' then return result;end if; result:=public.reconcile_paddle_plan_change_event_v1(p_event);');
select pg_temp.seat_patch('public.reconcile_paddle_initial_purchase_event_v1(uuid)',
 'le.proof_schema in (''paddle-subscription-lifecycle-v1'',''paddle-plan-change-v1'')',
 'le.proof_schema in (''paddle-subscription-lifecycle-v1'',''paddle-plan-change-v1'',''paddle-seat-quantity-v1'')');
select pg_temp.seat_patch('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)',
 'or s.account_subscription_id is null or s.approved_additional_coach_seats<>0','or s.account_subscription_id is null');
select pg_temp.seat_patch('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)',
 '''quantity'',1,''approvedSeats'',0', '''quantity'',1,''approvedSeats'',public.billing_paddle_seat_lifecycle_count_v1(s.id,o,true)');
do $$
declare body text;part text;start_pos integer;end_pos integer;begin
 body:=replace(pg_get_functiondef('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)'::regprocedure),chr(13),'');
 start_pos:=position(' foreach kind in array' in body);end_pos:=position(' end loop;' in substring(body from start_pos));
 if start_pos=0 or end_pos=0 then raise exception 'PADDLE_SEAT_MIGRATION_SHAPE';end if;
 part:=substring(body from start_pos for end_pos+length(' end loop;')-1);
 perform pg_temp.seat_patch('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)',part,
 $patch$ if s.approved_additional_coach_seats>0 or exists(select 1 from public.billing_operations_v2 seat_op where seat_op.subscription_id=s.id and seat_op.operation_kind='seat_quantity' and seat_op.status not in ('completed','canceled','failed')) then
  if not public.billing_paddle_seat_lifecycle_items_v1(s.id,o,o) or (t is not null and not public.billing_paddle_seat_lifecycle_items_v1(s.id,o,t)) then raise exception 'PADDLE_LIFECYCLE_ITEMS';end if;
  if t is not null and (coalesce((t#>>'{paymentTotals,total}')::bigint,0)<=0 or (t#>>'{paymentTotals,balance}')::bigint is distinct from 0::bigint
   or coalesce((t#>>'{paymentTotals,paid}')::bigint,0)<(t#>>'{paymentTotals,total}')::bigint) then raise exception 'PADDLE_LIFECYCLE_PAYMENT';end if;
 else $patch$||part||' end if;');
end $$;
select pg_temp.seat_patch('public.reconcile_paddle_lifecycle_event_v1(uuid)',
 'update public.billing_subscriptions_v2 set provider_status=facts->>''providerStatus'',',
 'update public.billing_subscriptions_v2 set approved_additional_coach_seats=(facts->>''approvedSeats'')::integer,provider_status=facts->>''providerStatus'',');
select pg_temp.seat_patch('public.reconcile_paddle_lifecycle_event_v1(uuid)', 'result:=''applied'';', $patch$update public.billing_operations_v2 set status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp()
 where subscription_id=s.id and operation_kind='seat_quantity' and status='scheduled' and effective_timing='period_end'
 and target_additional_seats=(facts->>'approvedSeats')::integer and effective_at=(facts->>'periodStart')::timestamptz and facts->'renewal'='true'::jsonb;
 insert into public.billing_operation_events_v2(operation_id,event_type) select id,'billing.seat_quantity_completed' from public.billing_operations_v2
 where subscription_id=s.id and operation_kind='seat_quantity' and status='completed' on conflict do nothing;
 if facts->>'providerStatus'<>'active' or facts->>'scheduledCancelAt' is not null then
  update public.billing_operations_v2 set status='manual_review',error_code='BILLING_SEAT_QUANTITY_MANUAL_REVIEW',updated_at=clock_timestamp()
  where subscription_id=s.id and operation_kind='seat_quantity' and status not in ('completed','canceled','failed');
 end if;
 result:='applied';$patch$);

alter function public.billing_seat_effective_limit(uuid,boolean) rename to billing_legacy_seat_effective_limit;
create function public.billing_seat_effective_limit(p_account uuid,p_growth boolean default false) returns integer
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e jsonb:=public.resolve_account_entitlements(p_account);s public.billing_subscriptions_v2%rowtype;o public.billing_operations_v2%rowtype;n integer;begin
 select * into s from public.billing_subscriptions_v2 where billing_account_id=p_account and shadow_status='current' and account_subscription_id=(e#>>'{subscription,id}')::uuid;
 if s.id is null then return public.billing_legacy_seat_effective_limit(p_account,p_growth);end if;
 n:=s.approved_additional_coach_seats;
 if p_growth then
  select * into o from public.billing_operations_v2 where subscription_id=s.id and operation_kind='seat_quantity' and effective_timing='period_end' and status not in ('completed','canceled','failed');
  if o.id is not null then n:=least(n,o.target_additional_seats);end if;
 end if;
 return least((e#>>'{limits,maxCoachSeats}')::integer,(e#>>'{limits,includedCoachSeats}')::integer+n);
end $$;
alter function public.get_my_billing_seat_quantity_state() rename to get_my_legacy_billing_seat_quantity_state;
create function public.get_my_billing_seat_quantity_state() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype;m public.billing_price_mappings%rowtype;p public.commercial_plan_versions%rowtype;o public.billing_operations_v2%rowtype;d jsonb;unit integer;begin
 if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null) then raise exception 'BILLING_SEAT_QUANTITY_OWNER_REQUIRED' using errcode='42501';end if;
 select bs.* into s from public.billing_subscriptions_v2 bs join public.billing_accounts a on a.id=bs.billing_account_id where a.owner_user_id=auth.uid() and bs.shadow_status='current' and bs.account_subscription_id is not null;
 if s.id is null then return public.get_my_legacy_billing_seat_quantity_state();end if;
 select * into m from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(s.id);
 select * into p from public.commercial_plan_versions where id=m.plan_version_id;
 select * into o from public.billing_operations_v2 where subscription_id=s.id and operation_kind='seat_quantity' order by provider_requested_at desc nulls last,id desc limit 1;
 select value into d from jsonb_array_elements(public.resolve_account_capacity(auth.uid(),s.billing_account_id)->'dimensions') where value->>'key'='coach_seats';
 unit:=case m.cadence when 'monthly' then 1200 else 12000 end;
 return jsonb_build_object('available',true,'provider','paddle','canCancel',false,
 'blockingOperation',case when exists(select 1 from public.billing_operations_v2 where subscription_id=s.id and operation_kind='plan_change' and status not in ('completed','canceled','failed')) then 'plan_change' end,
 'summary',jsonb_build_object('planKey',p.plan_key,'cadence',m.cadence,'includedSeats',p.included_coach_seats,'currentAdditionalSeats',s.approved_additional_coach_seats,
 'maximumSeats',p.max_coach_seats,'maximumAdditionalSeats',p.max_coach_seats-p.included_coach_seats,'currentEffectiveLimit',public.billing_seat_effective_limit(s.billing_account_id),
 'growthLimit',public.billing_seat_effective_limit(s.billing_account_id,true),'actual',d->'actual','pending',d->'pending','reserved',d->'reserved','committed',d->'committed',
 'unitPriceMinor',unit,'currentTotalMinor',m.unit_amount_minor+unit*s.approved_additional_coach_seats,'manualReview',s.reconciliation_status='manual_review' or coalesce(o.status='manual_review',false)),
 'operation',case when o.id is null then null else jsonb_build_object('id',o.operation_id,'status',o.status,'direction',case when o.effective_timing='immediate' then 'increase' else 'reduction' end,
 'targetAdditionalSeats',o.target_additional_seats,'effectiveAt',o.effective_at,'errorCode',o.error_code) end);
end $$;
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and (p.proname like 'billing_paddle_seat_%' or p.proname='billing_paddle_current_seat_mapping_v1'
 or p.proname in ('paddle_seat_quantity_context_v1','preview_paddle_seat_quantity_v1','begin_paddle_seat_quantity_v1','fail_paddle_seat_quantity_v1','reconcile_paddle_seat_quantity_event_v1',
 'billing_seat_effective_limit','get_my_billing_seat_quantity_state','get_my_legacy_billing_seat_quantity_state')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.paddle_seat_quantity_context_v1(uuid,integer),public.preview_paddle_seat_quantity_v1(uuid,integer,jsonb),
 public.begin_paddle_seat_quantity_v1(uuid,integer,uuid,jsonb),public.fail_paddle_seat_quantity_v1(uuid,uuid,boolean),public.reconcile_paddle_seat_quantity_event_v1(uuid) to service_role;
grant execute on function public.get_my_billing_seat_quantity_state() to authenticated;
commit;
