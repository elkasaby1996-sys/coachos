-- Sandbox plan changes reuse v2 operations and canonical supersession. No rollout changes.
begin;
create function public.billing_paddle_plan_now_v1() returns timestamptz language sql volatile set search_path=pg_catalog as $$ select clock_timestamp() $$;
alter table public.billing_operations_v2 add column source_period_started_at timestamptz,
 add column source_period_ends_at timestamptz;

-- Initial items remain immutable historical evidence. Completed operations supply
-- the current approved mapping without replacing or weakening that history.
create function public.billing_paddle_current_mapping_v1(p_subscription uuid) returns uuid
language sql stable set search_path=pg_catalog,public as $$
 select coalesce((select target_base_mapping_id from public.billing_operations_v2 where subscription_id=p_subscription
 and operation_kind='plan_change' and status='completed' order by completed_at desc,id desc limit 1),
 (select mapping_id from public.billing_subscription_items_v2 where subscription_id=p_subscription and item_role='base_plan'))
$$;

create function public.paddle_plan_change_route_v1(p_owner uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.billing_accounts a join public.billing_subscriptions_v2 s on s.billing_account_id=a.id
 where a.owner_user_id=p_owner and s.shadow_status='current' and s.account_subscription_id is not null)
$$;

create function public.paddle_plan_change_context_v1(p_owner uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype; a public.account_subscriptions%rowtype; m public.billing_price_mappings%rowtype; account uuid;
begin
 perform public.billing_guard_actor();
 if not exists(select 1 from public.pt_profiles where user_id=p_owner and workspace_id is null) then raise exception 'BILLING_PLAN_CHANGE_OWNER_REQUIRED'; end if;
 select id into account from public.billing_accounts where owner_user_id=p_owner;
 perform public.billing_guard_lock(account,'test');
 select * into s from public.billing_subscriptions_v2 where billing_account_id=account and environment='test' and shadow_status='current' and account_subscription_id is not null for update;
 select * into a from public.account_subscriptions where id=s.account_subscription_id;
 select * into m from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(s.id);
 if s.id is null or s.provider_status<>'active' or s.reconciliation_status<>'processed' or s.approved_additional_coach_seats<>0
 or a.subscription_kind<>'paid' or a.source<>'billing_provider' or a.status<>'active' or a.cancel_at_period_end or s.scheduled_cancel_at is not null
 or m.id is null or m.plan_version_id<>a.plan_version_id or m.status not in ('active','retired') or m.catalogue_evidence_id is null
 or m.provider<>'paddle' or m.environment<>'test' or m.identity_kind<>'plan' or m.canonical_key not in ('launch','growth','scale')
 or (select count(*) from public.billing_subscription_items_v2 where subscription_id=s.id)<>1
 or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=a.id and storage_contract='billing.v2')
 then raise exception 'BILLING_PLAN_CHANGE_NOT_ELIGIBLE'; end if;
 return jsonb_build_object('subscriptionId',s.id,'accountId',account,'canonicalId',a.id,'mappingId',m.id,
 'subscriptionRef',s.provider_subscription_ref,'customerRef',(select provider_customer_ref from public.billing_customers_v2 where id=s.customer_id and identity_status='current' and identity_source='verified_provider_event'),
 'sourcePriceRef',m.provider_price_ref,'sourceProductRef',m.provider_product_ref,'sourceAmount',m.unit_amount_minor,
 'sourcePlan',m.canonical_key,'cadence',m.cadence,'providerUpdatedAt',s.provider_updated_at,
 'periodStart',a.current_period_started_at,'periodEnd',a.current_period_ends_at);
end $$;

create function public.preview_paddle_plan_change_v1(p_owner uuid,p_target_plan text,p_target_cadence text,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c jsonb; t public.billing_price_mappings%rowtype; classification jsonb; pf jsonb; start_at timestamptz; end_at timestamptz;
begin
 c:=public.paddle_plan_change_context_v1(p_owner);
 if not (select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1) then raise exception 'BILLING_PLAN_CHANGE_NOT_ELIGIBLE'; end if;
 if p_target_cadence is distinct from c->>'cadence' then raise exception 'BILLING_PLAN_CHANGE_MIXED_DIRECTION_UNSUPPORTED'; end if;
 if p_target_plan not in ('launch','growth','scale') or p_target_plan is null then raise exception 'BILLING_INVALID_INPUT'; end if;
 if exists(select 1 from public.billing_operations_v2 where subscription_id=(c->>'subscriptionId')::uuid and status not in ('completed','canceled','failed')) then raise exception 'BILLING_PLAN_CHANGE_ALREADY_PENDING'; end if;
 if (p_snapshot->>'subscriptionRef',p_snapshot->>'customerRef',p_snapshot->>'priceRef',p_snapshot->>'productRef',p_snapshot->>'status',p_snapshot->>'cadence')
 is distinct from (c->>'subscriptionRef',c->>'customerRef',c->>'sourcePriceRef',c->>'sourceProductRef','active',c->>'cadence')
 or p_snapshot->'quantity' is distinct from '1'::jsonb or p_snapshot->'cancelled' is distinct from 'false'::jsonb
 or p_snapshot->>'updatedAt' is null or (p_snapshot->>'updatedAt')::timestamptz<(c->>'providerUpdatedAt')::timestamptz
 then raise exception 'BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE'; end if;
 start_at:=public.billing_paddle_timestamp_v1(p_snapshot->'periodStart');end_at:=public.billing_paddle_timestamp_v1(p_snapshot->'periodEnd');
 if end_at<=public.billing_paddle_plan_now_v1() or end_at<>(start_at at time zone 'UTC'+case when p_target_cadence='monthly' then interval '1 month' else interval '1 year' end) at time zone 'UTC'
 or c->>'periodEnd' is null or (c->>'periodEnd' is not null and ((c->>'periodStart')::timestamptz,(c->>'periodEnd')::timestamptz) is distinct from (start_at,end_at))
 then raise exception 'BILLING_PLAN_CHANGE_EFFECTIVE_DATE_INVALID'; end if;
 select * into t from public.billing_price_mappings where provider='paddle' and environment='test' and identity_kind='plan' and status='active'
 and canonical_key=p_target_plan and cadence=p_target_cadence and currency_code='USD' and catalogue_evidence_id is not null for share;
 if t.id is null then raise exception 'BILLING_PLAN_CHANGE_TARGET_MAPPING_UNAVAILABLE'; end if;
 classification:=public.classify_billing_plan_change(c->>'sourcePlan',p_target_cadence,p_target_plan,p_target_cadence);
 pf:=public.billing_plan_change_preflight(p_owner,(c->>'accountId')::uuid,t.plan_version_id);
 return jsonb_build_object('context',c,'targetMappingId',t.id,'targetPriceRef',t.provider_price_ref,'targetProductRef',t.provider_product_ref,
 'snapshot',pf->'snapshot','preview',classification||jsonb_build_object('provider','paddle','sourcePlanKey',c->>'sourcePlan','sourceCadence',p_target_cadence,
 'targetPlanKey',p_target_plan,'targetCadence',p_target_cadence,'currentPriceMinor',(c->>'sourceAmount')::bigint,'targetPriceMinor',t.unit_amount_minor,
 'currency','USD','effectiveAt',case when classification->>'effectiveTiming'='period_end' then end_at else null end,
 'blockers',case when classification->>'effectiveTiming'='period_end' then pf->'blockers' else '[]'::jsonb end,'dataQualityIssue',pf#>'{snapshot,hasAnyDataQualityIssue}'));
end $$;

create function public.begin_paddle_plan_change_v1(p_owner uuid,p_target_plan text,p_target_cadence text,p_operation uuid,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account uuid; o public.billing_operations_v2%rowtype; v jsonb; c jsonb;
begin
 perform public.billing_guard_actor();
 select id into account from public.billing_accounts where owner_user_id=p_owner;
 perform public.billing_guard_lock(account,'test');
 select * into o from public.billing_operations_v2 where billing_account_id=account and operation_id=p_operation;
 if o.id is not null then
  if o.operation_kind<>'plan_change' or o.environment<>'test' or o.target_cadence is distinct from p_target_cadence
  or not exists(select 1 from public.billing_price_mappings where id=o.target_base_mapping_id and canonical_key=p_target_plan) then raise exception 'BILLING_PLAN_CHANGE_OPERATION_CONFLICT'; end if;
  return jsonb_build_object('id',o.id,'dispatch',false);
 end if;
 if p_snapshot is null then return jsonb_build_object('needsSnapshot',true);end if;
 v:=public.preview_paddle_plan_change_v1(p_owner,p_target_plan,p_target_cadence,p_snapshot);c:=v->'context';
 if v#>'{preview,dataQualityIssue}'='true'::jsonb then raise exception 'BILLING_PLAN_CHANGE_DATA_QUALITY_BLOCKED'; end if;
 if v#>'{preview,blockers}'<>'[]'::jsonb then raise exception 'BILLING_PLAN_CHANGE_CAPACITY_BLOCKED'; end if;
 insert into public.billing_operations_v2(operation_id,billing_account_id,subscription_id,provider,environment,source_account_subscription_id,operation_kind,
 source_base_mapping_id,target_base_mapping_id,source_cadence,target_cadence,source_additional_seats,target_additional_seats,effective_timing,status,
 preflight_snapshot,change_kind,provider_requested_at,effective_at,created_by_user_id,source_period_started_at,source_period_ends_at)
 values(p_operation,account,(c->>'subscriptionId')::uuid,'paddle','test',(c->>'canonicalId')::uuid,'plan_change',(c->>'mappingId')::uuid,(v->>'targetMappingId')::uuid,
 p_target_cadence,p_target_cadence,0,0,v#>>'{preview,effectiveTiming}','provider_pending',jsonb_build_object('schemaVersion',1)|| (v->'snapshot'),
 v#>>'{preview,changeKind}',public.billing_paddle_plan_now_v1(),(v#>>'{preview,effectiveAt}')::timestamptz,p_owner,(p_snapshot->>'periodStart')::timestamptz,(p_snapshot->>'periodEnd')::timestamptz) returning * into o;
 insert into public.billing_operation_events_v2(operation_id,event_type) values(o.id,'billing.plan_change_requested');
 return jsonb_build_object('id',o.id,'dispatch',true,'subscriptionRef',c->>'subscriptionRef','priceRef',v->>'targetPriceRef','productRef',v->>'targetProductRef',
 'amount',v#>'{preview,targetPriceMinor}','timing',o.effective_timing,'operationId',p_operation);
end $$;

create function public.fail_paddle_plan_change_v1(p_owner uuid,p_operation uuid,p_ambiguous boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account uuid;
begin
 perform public.billing_guard_actor(); select id into account from public.billing_accounts where owner_user_id=p_owner;
 perform public.billing_guard_lock(account,'test');
 update public.billing_operations_v2 set status=case when p_ambiguous then 'ambiguous' else 'failed' end,
 ambiguous_at=case when p_ambiguous then public.billing_paddle_plan_now_v1() end,failed_at=case when not p_ambiguous then public.billing_paddle_plan_now_v1() end,
 error_code=case when p_ambiguous then 'BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS' else 'BILLING_PLAN_CHANGE_PAYMENT_FAILED' end,updated_at=public.billing_paddle_plan_now_v1()
 where id=p_operation and billing_account_id=account and operation_kind='plan_change' and status='provider_pending';
end $$;

create function public.billing_paddle_plan_facts_v1(p_operation uuid,p_subscription_event uuid,p_transaction_event uuid default null) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare op public.billing_operations_v2%rowtype;s public.billing_subscriptions_v2%rowtype;a public.account_subscriptions%rowtype;
 m public.billing_price_mappings%rowtype;so jsonb;tx jsonb;stamp timestamptz;start_at timestamptz;end_at timestamptz;se uuid;te uuid;row_item jsonb;
begin
 select * into op from public.billing_operations_v2 where id=p_operation;
 perform public.billing_guard_lock(op.billing_account_id,'test');
 select * into s from public.billing_subscriptions_v2 where id=op.subscription_id for update;
 select * into a from public.account_subscriptions where id=op.source_account_subscription_id for update;
 select * into m from public.billing_price_mappings where id=op.target_base_mapping_id for share;
 if not (select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1)
 or op.operation_kind is distinct from 'plan_change' or op.environment<>'test' or op.source_cadence<>op.target_cadence
 or op.source_additional_seats<>0 or op.target_additional_seats<>0 or op.status in ('completed','failed','canceled','manual_review')
 or s.account_subscription_id is distinct from a.id or s.shadow_status<>'current' or s.reconciliation_status<>'processed' or s.approved_additional_coach_seats<>0
 or a.status not in ('active','past_due') or a.cancel_at_period_end or s.scheduled_cancel_at is not null
 or public.billing_paddle_current_mapping_v1(s.id) is distinct from op.source_base_mapping_id
 or m.id is null or m.status not in ('active','retired') or m.catalogue_evidence_id is null or m.environment<>'test' or m.provider<>'paddle' or m.identity_kind<>'plan' or m.cadence<>op.target_cadence or m.currency_code<>'USD'
 then raise exception 'PADDLE_PLAN_IDENTITY'; end if;
 se:=public.billing_paddle_reconciliation_event_v1(p_subscription_event);
 select observation into so from public.billing_paddle_event_observations where event_id=p_subscription_event;
 if so->>'kind' is distinct from 'subscription.updated' or so->>'subscriptionRef' is distinct from s.provider_subscription_ref::text
 or so->>'customerRef' is distinct from (select provider_customer_ref::text from public.billing_customers_v2 where id=s.customer_id and identity_status='current')
 or so->>'planChangeOperationId' is distinct from op.operation_id::text
 or not (so ?& array['updatedAt','currentBillingPeriod','nextBilledAt','canceledAt','pausedAt','scheduledChange'])
 or so->>'status' not in ('active','past_due') or so->'canceledAt'<>'null'::jsonb or so->'pausedAt'<>'null'::jsonb or so->'scheduledChange'<>'null'::jsonb
 then raise exception 'PADDLE_PLAN_STATE'; end if;
 perform public.billing_paddle_lifecycle_shape_v1(so);
 stamp:=public.billing_paddle_timestamp_v1(so->'updatedAt');
 if stamp<op.provider_requested_at or stamp<=s.provider_updated_at or stamp>(so->>'occurredAt')::timestamptz then raise exception 'PADDLE_PLAN_STALE'; end if;
 start_at:=public.billing_paddle_timestamp_v1(so#>'{currentBillingPeriod,startsAt}');end_at:=public.billing_paddle_timestamp_v1(so#>'{currentBillingPeriod,endsAt}');
 if (start_at,end_at) is distinct from (op.source_period_started_at,op.source_period_ends_at)

 then raise exception 'PADDLE_PLAN_PERIOD'; end if;
 if so->>'status'='active' and public.billing_paddle_timestamp_v1(so->'nextBilledAt') is distinct from end_at then raise exception 'PADDLE_PLAN_PERIOD'; end if;
 if jsonb_array_length(so->'items')<>1 then raise exception 'PADDLE_PLAN_ITEMS'; end if;
 row_item:=so#>'{items,0}';
 if (row_item->>'priceRef',row_item->>'productRef',row_item->>'status',row_item#>>'{unitPrice,currency}')
 is distinct from (m.provider_price_ref::text,m.provider_product_ref::text,'active','USD')
 or row_item->'quantity' is distinct from '1'::jsonb or (row_item#>>'{unitPrice,amount}')::numeric<>m.unit_amount_minor
 then raise exception 'PADDLE_PLAN_ITEMS'; end if;
 if p_transaction_event is not null then
  te:=public.billing_paddle_reconciliation_event_v1(p_transaction_event);
  select observation into tx from public.billing_paddle_event_observations where event_id=p_transaction_event;
  if tx->>'kind' is distinct from 'transaction.completed' or tx->>'origin' is distinct from 'subscription_update'
  or tx->>'status' is distinct from 'completed' or tx->>'currency' is distinct from 'USD'
  or tx->'subscriptionRef' is distinct from so->'subscriptionRef' or tx->'customerRef' is distinct from so->'customerRef'
  or tx->>'planChangeOperationId' is distinct from op.operation_id::text or (tx->>'occurredAt')::timestamptz<op.provider_requested_at
  or tx->'items' is distinct from jsonb_build_array(row_item-'status')
  or public.billing_paddle_timestamp_v1(tx#>'{billingPeriod,startsAt}')<start_at or public.billing_paddle_timestamp_v1(tx#>'{billingPeriod,startsAt}')>=end_at
  or public.billing_paddle_timestamp_v1(tx#>'{billingPeriod,endsAt}') is distinct from end_at
  or not (tx ? 'paymentTotals') or (tx#>>'{paymentTotals,total}')::numeric<=0
  or (tx#>>'{paymentTotals,paid}')::numeric is distinct from (tx#>>'{paymentTotals,total}')::numeric
  or (tx#>>'{paymentTotals,balance}')::numeric is distinct from 0
  or exists(select 1 from public.billing_payment_applications_v2 where provider='paddle' and environment='test' and provider_transaction_ref=tx->>'transactionRef')
  then raise exception 'PADDLE_PLAN_PAYMENT'; end if;
 end if;
 return jsonb_build_object('operationId',op.id,'subscriptionId',s.id,'billingAccountId',s.billing_account_id,'sourceCanonicalId',a.id,
 'targetPlanVersionId',m.plan_version_id,'mappingId',m.id,'cadence',m.cadence,'catalogueEvidenceId',m.catalogue_evidence_id,
 'subscriptionEventId',p_subscription_event,'transactionEventId',p_transaction_event,'subscriptionVerifiedEvidenceId',se,'transactionVerifiedEvidenceId',te,
 'providerUpdatedAt',stamp,'providerStatus',so->>'status','periodStart',start_at,'periodEnd',end_at,
 'subscriptionObservationSha256',(select observation_sha256 from public.billing_paddle_event_observations where event_id=p_subscription_event),
 'transactionObservationSha256',(select observation_sha256 from public.billing_paddle_event_observations where event_id=p_transaction_event));
end $$;

alter table public.billing_evidence_v2 drop constraint billing_evidence_version_pair;
alter table public.billing_evidence_v2 add constraint billing_evidence_version_pair check (
 (proof_schema='billing-foundation-v1' and validator_version='structure-only-v1') or
 (provider='paddle' and environment='test' and proof_kind in ('subscription','transaction') and source_kind='webhook' and
 ((proof_schema='paddle-initial-purchase-v1' and validator_version='paddle-reconciliation-v1') or
 (proof_schema='paddle-subscription-lifecycle-v1' and validator_version='paddle-lifecycle-v1') or
 (proof_schema='paddle-plan-change-v1' and validator_version='paddle-plan-v1'))));
create unique index paddle_plan_event_once on public.billing_evidence_v2(event_id,proof_kind) where proof_schema='paddle-plan-change-v1';

create function public.billing_paddle_plan_evidence_v1(p_operation uuid,p_subscription_event uuid,p_transaction_event uuid,p_kind text) returns uuid
language plpgsql set search_path=pg_catalog,public as $$
declare facts jsonb;ev public.billing_webhook_events_v2%rowtype;v public.billing_verified_evidence_v2%rowtype;p jsonb;result uuid;
begin
 facts:=public.billing_paddle_plan_facts_v1(p_operation,p_subscription_event,p_transaction_event);
 select id into result from public.billing_evidence_v2 where event_id=case when p_kind='subscription' then p_subscription_event else p_transaction_event end and proof_schema='paddle-plan-change-v1' and proof_kind=p_kind;
 if result is not null then return result;end if;
 select * into ev from public.billing_webhook_events_v2 where id=(facts->>(p_kind||'EventId'))::uuid;
 select * into v from public.billing_verified_evidence_v2 where id=(facts->>(p_kind||'VerifiedEvidenceId'))::uuid;
 if p_kind not in ('subscription','transaction') or v.id is null then raise exception 'PADDLE_PLAN_PROOF'; end if;
 p:=jsonb_build_object('schema','paddle-plan-change-v1','provider','paddle','environment','test','kind',p_kind,'identity',jsonb_build_object('subscriptionRef',ev.subscription_ref,'customerRef',ev.customer_ref,'eventRef',ev.provider_event_ref,'resourceRef',ev.resource_ref)
 ||case when p_kind='transaction' then jsonb_build_object('transactionRef',ev.resource_ref) else '{}'::jsonb end,'observation',facts);
 insert into public.billing_evidence_v2(provider,environment,source_kind,proof_kind,proof_schema,validator_version,replay_algorithm,replay_key,normalized_sha256,proof,verified_at,event_id,subscription_id,provider_notification_ref,raw_payload_sha256,provider_transaction_ref)
 values('paddle','test','webhook',p_kind,'paddle-plan-change-v1','paddle-plan-v1','delivery-evidence-v1',
 encode(extensions.digest(jsonb_build_array(ev.provider_event_ref,v.provider_notification_ref,v.raw_payload_sha256)::text,'sha256'),'hex'),
 encode(extensions.digest(p::text,'sha256'),'hex'),p,public.billing_paddle_plan_now_v1(),ev.id,(facts->>'subscriptionId')::uuid,v.provider_notification_ref,v.raw_payload_sha256,
 case when p_kind='transaction' then ev.resource_ref end) returning id into result;
 return result;
end $$;

create function public.billing_paddle_plan_proof_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare f jsonb; e public.billing_evidence_v2%rowtype;v public.billing_verified_evidence_v2%rowtype;
begin
 if tg_table_name='billing_evidence_v2' then e:=new;
 else select * into e from public.billing_evidence_v2 where id=new.evidence_id; end if;
 if e.proof_schema<>'paddle-plan-change-v1' then
  if tg_table_name='billing_payment_applications_v2' then
   if new.application_kind='plan_change' then raise exception 'PADDLE_PLAN_PROOF'; end if;
  end if;
  return new;
 end if;
 f:=public.billing_paddle_plan_facts_v1((e.proof#>>'{observation,operationId}')::uuid,(e.proof#>>'{observation,subscriptionEventId}')::uuid,(e.proof#>>'{observation,transactionEventId}')::uuid);
 select * into v from public.billing_verified_evidence_v2 where id=(f->>(e.proof_kind||'VerifiedEvidenceId'))::uuid;
 if e.proof->'observation' is distinct from f or e.subscription_id is distinct from (f->>'subscriptionId')::uuid
 or e.event_id is distinct from (f->>(e.proof_kind||'EventId'))::uuid
 or (e.provider_notification_ref,e.raw_payload_sha256) is distinct from (v.provider_notification_ref,v.raw_payload_sha256)
 then raise exception 'PADDLE_PLAN_PROOF'; end if;
 if tg_table_name='billing_payment_applications_v2' then
  if new.application_kind<>'plan_change' or e.proof_kind<>'transaction' or new.operation_id is distinct from (f->>'operationId')::uuid
  or new.subscription_id<>e.subscription_id or new.billing_account_id is distinct from (f->>'billingAccountId')::uuid then raise exception 'PADDLE_PLAN_PAYMENT'; end if;
 end if;
 return new;
end $$;
create trigger paddle_plan_proof_guard before insert on public.billing_evidence_v2 for each row execute function public.billing_paddle_plan_proof_guard_v1();
create trigger paddle_plan_payment_guard before insert on public.billing_payment_applications_v2 for each row execute function public.billing_paddle_plan_proof_guard_v1();

create function public.reconcile_paddle_plan_change_event_v1(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype;op public.billing_operations_v2%rowtype;o jsonb;so jsonb;se uuid;te uuid;matches integer;
 facts jsonb;v_evidence uuid;payment uuid;target uuid;stamp timestamptz;pf jsonb; result text;
begin
 perform public.billing_guard_actor();perform 1 from public.billing_runtime_policy where id=1 for share;
 if not (select paddle_reconciliation_enabled from public.billing_runtime_policy where id=1) then return jsonb_build_object('status','disabled'); end if;
 select observation into o from public.billing_paddle_event_observations where event_id=p_event;
 select * into s from public.billing_subscriptions_v2 where provider='paddle' and environment='test' and provider_subscription_ref=o->>'subscriptionRef';
 perform public.billing_guard_lock(s.billing_account_id,'test');
 select * into s from public.billing_subscriptions_v2 where id=s.id for update;
 select * into op from public.billing_operations_v2 where subscription_id=s.id and operation_kind='plan_change' and status not in ('completed','canceled','failed') for update;
 if exists(select 1 from public.billing_evidence_v2 where event_id=p_event and proof_schema='paddle-plan-change-v1')
 and not coalesce(op.status='scheduled' and public.billing_paddle_plan_now_v1()>=op.effective_at,false) then return jsonb_build_object('status','reused');end if;
 if op.id is null then return jsonb_build_object('status','not_applicable'); end if;
 -- Finalize the already verified schedule using its original paid period first.
 -- A new-period event must still pass the existing lifecycle payment proof.
 if op.status='scheduled' and public.billing_paddle_plan_now_v1()>=op.effective_at
 and (o->>'origin'='subscription_recurring' or (o#>>'{currentBillingPeriod,startsAt}')::timestamptz=op.effective_at) then
  perform public.reconcile_paddle_plan_change_event_v1((select event_id from public.billing_evidence_v2 where id=op.last_evidence_id));
  if (select status from public.billing_operations_v2 where id=op.id)='completed' then return jsonb_build_object('status','not_applicable');end if;
  return jsonb_build_object('status','manual_review');
 end if;
 if (o->>'occurredAt')::timestamptz<op.provider_requested_at or (o->>'updatedAt')::timestamptz<=s.provider_updated_at then return jsonb_build_object('status','reused'); end if;
 begin
  perform public.billing_paddle_reconciliation_event_v1(p_event);
  if o->>'kind'='transaction.completed' then
   if o->>'origin'='subscription_recurring' then return jsonb_build_object('status','not_applicable'); end if;
   te:=p_event;
   select po.event_id,po.observation into se,so from public.billing_paddle_event_observations po
   where po.observation->>'subscriptionRef'=s.provider_subscription_ref and po.observation->>'kind'='subscription.updated'
   and po.observation->>'planChangeOperationId'=op.operation_id::text
   order by (po.observation->>'updatedAt')::timestamptz desc,po.event_id limit 1;
   if se is null then return jsonb_build_object('status','pending'); end if;
  elsif o->>'kind'='subscription.updated' then se:=p_event;so:=o;
  else return jsonb_build_object('status','not_applicable'); end if;
  -- Cancellation wins; never turn a cancellation into plan authority.
  if so->>'status'='canceled' or so#>>'{scheduledChange,action}'='cancel' then
   update public.billing_operations_v2 set status='manual_review',error_code='BILLING_PLAN_CHANGE_MANUAL_REVIEW',updated_at=public.billing_paddle_plan_now_v1() where id=op.id;
   return jsonb_build_object('status','not_applicable');
  end if;
  if exists(select 1 from public.billing_paddle_event_observations po where po.event_id<>se and po.observation->>'subscriptionRef'=s.provider_subscription_ref
   and po.observation->>'kind'='subscription.updated' and (po.observation->>'updatedAt')::timestamptz>=(so->>'updatedAt')::timestamptz
   and (po.observation-array['eventRef','occurredAt'])<>(so-array['eventRef','occurredAt'])
   and not coalesce((op.status='scheduled' and public.billing_paddle_plan_now_v1()>=op.effective_at
    and po.observation->'planChangeOperationId'=so->'planChangeOperationId' and po.observation->'items'=so->'items'
    and po.observation->>'status'='active' and po.observation->'scheduledChange'='null'::jsonb
    and po.observation->'canceledAt'='null'::jsonb and po.observation->'pausedAt'='null'::jsonb
    and (po.observation#>>'{currentBillingPeriod,startsAt}')::timestamptz=op.effective_at),false)) then raise exception 'PADDLE_PLAN_STATE'; end if;
  if op.effective_timing='immediate' then
   select count(*),min(po.event_id::text)::uuid into matches,te from public.billing_paddle_event_observations po
   where po.observation->>'subscriptionRef'=s.provider_subscription_ref and po.observation->>'kind'='transaction.completed'
   and po.observation->>'planChangeOperationId'=op.operation_id::text and po.observation->>'origin'='subscription_update';
   if matches>1 then raise exception 'PADDLE_PLAN_PAYMENT'; end if;
  end if;
  facts:=public.billing_paddle_plan_facts_v1(op.id,se,te);
  if op.effective_timing='immediate' and (te is null or so->>'status'<>'active') then
   update public.billing_operations_v2 set status='awaiting_payment',error_code=case when so->>'status'='past_due' then 'BILLING_PLAN_CHANGE_PAYMENT_FAILED' end,updated_at=public.billing_paddle_plan_now_v1() where id=op.id;
   return jsonb_build_object('status','pending');
  end if;
  v_evidence:=public.billing_paddle_plan_evidence_v1(op.id,se,te,'subscription');
  if te is not null then
   payment:=public.billing_paddle_plan_evidence_v1(op.id,se,te,'transaction');
   insert into public.billing_payment_applications_v2(provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind,operation_id)
   select 'paddle','test',provider_transaction_ref,op.billing_account_id,s.id,id,'plan_change',op.id from public.billing_evidence_v2 where id=payment;
  end if;
  update public.billing_operations_v2 set status=case when effective_timing='period_end' then 'scheduled' else 'awaiting_payment' end,
  provider_applied_at=coalesce(provider_applied_at,public.billing_paddle_plan_now_v1()),last_evidence_id=v_evidence,updated_at=public.billing_paddle_plan_now_v1(),error_code=null where id=op.id;
  if op.effective_timing='immediate' or public.billing_paddle_plan_now_v1()>=op.effective_at then
   pf:=public.billing_plan_change_preflight(op.created_by_user_id,op.billing_account_id,(facts->>'targetPlanVersionId')::uuid);
   if op.effective_timing='period_end' and (pf->'blockers'<>'[]'::jsonb or pf#>'{snapshot,hasAnyDataQualityIssue}'='true'::jsonb) then raise exception 'PADDLE_PLAN_CAPACITY'; end if;
   target:=gen_random_uuid();stamp:=public.billing_paddle_plan_now_v1();
   update public.account_subscriptions set status='superseded',superseded_at=stamp,superseded_by_subscription_id=target,status_changed_at=stamp where id=op.source_account_subscription_id;
   insert into public.account_subscriptions(id,billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at)
   values(target,op.billing_account_id,(facts->>'targetPlanVersionId')::uuid,'paid',facts->>'providerStatus','billing_provider',(facts->>'periodStart')::timestamptz,(facts->>'periodEnd')::timestamptz);
   update public.billing_subscriptions_v2 set account_subscription_id=target,provider_status=facts->>'providerStatus',provider_updated_at=(facts->>'providerUpdatedAt')::timestamptz,
   current_period_started_at=(facts->>'periodStart')::timestamptz,current_period_ends_at=(facts->>'periodEnd')::timestamptz,
   latest_evidence_id=v_evidence,latest_snapshot_sha256=(select normalized_sha256 from public.billing_evidence_v2 where id=v_evidence),last_reconciled_at=stamp,updated_at=stamp where id=s.id;
   update public.billing_operations_v2 set status='completed',completed_at=stamp,payment_confirmed_at=case when payment is not null then stamp end,updated_at=stamp where id=op.id;
   insert into public.billing_operation_events_v2(operation_id,event_type) values(op.id,'billing.plan_change_completed') on conflict do nothing;
  else
   insert into public.billing_operation_events_v2(operation_id,event_type) values(op.id,'billing.plan_change_scheduled') on conflict do nothing;
  end if;
  update public.billing_webhook_events_v2 set processing_status='processed',processed_at=public.billing_paddle_plan_now_v1(),last_error_code=null where id in (se,te);
  result:='applied';
 exception when raise_exception then
  if sqlerrm like 'PADDLE_PLAN_%' or sqlerrm like 'PADDLE_LIFECYCLE_%' or sqlerrm='PADDLE_RECONCILIATION_VERIFIED_EVENT_REQUIRED' then
   update public.billing_operations_v2 set status='manual_review',error_code='BILLING_PLAN_CHANGE_MANUAL_REVIEW',updated_at=public.billing_paddle_plan_now_v1() where id=op.id;
   update public.billing_webhook_events_v2 set processing_status='manual_review',last_error_code='PADDLE_PLAN_REVIEW' where id=p_event;
   result:='manual_review';
  else raise; end if;
 end;
 return jsonb_build_object('status',result);
end $$;

-- Reuse the canonical reader: only its existing target-plan resolution gains a
-- verified v2 schedule. No browser/provider shadow becomes entitlement authority.
create function public.billing_paddle_scheduled_plan_v1(p_canonical uuid,p_at timestamptz) returns uuid
language sql stable set search_path=pg_catalog,public as $$
 select m.plan_version_id from public.billing_operations_v2 o
 join public.billing_price_mappings m on m.id=o.target_base_mapping_id
 join public.billing_evidence_v2 e on e.id=o.last_evidence_id and e.proof_schema='paddle-plan-change-v1'
 join public.billing_subscriptions_v2 s on s.id=o.subscription_id and s.account_subscription_id=p_canonical
 where o.source_account_subscription_id=p_canonical and o.status='scheduled' and o.effective_timing='period_end'
 and o.provider_applied_at is not null and o.effective_at<=p_at and s.scheduled_cancel_at is null
 and s.provider_status='active' and s.reconciliation_status='processed'
 and e.proof#>>'{observation,operationId}'=o.id::text
 order by o.created_at desc limit 1
$$;

-- A cancellation may name the intended target after Paddle updated its items.
-- Validate that exact known item, but retain the SOURCE canonical plan: this
-- exception grants only existing lifecycle degradation/cancellation authority.
create function public.billing_paddle_plan_cancel_item_v1(p_subscription uuid,p_observation jsonb,p_item jsonb) returns boolean
language sql stable set search_path=pg_catalog,public as $$
 select coalesce((p_observation->>'status'='canceled' or p_observation#>>'{scheduledChange,action}'='cancel') and exists(
 select 1 from public.billing_operations_v2 o join public.billing_price_mappings m on m.id=o.target_base_mapping_id
 where o.subscription_id=p_subscription and o.operation_kind='plan_change' and o.provider='paddle' and o.environment='test'
 and o.status not in ('completed','canceled','failed') and o.operation_id::text=p_observation->>'planChangeOperationId'
 and o.source_cadence=o.target_cadence and o.source_additional_seats=0 and o.target_additional_seats=0
 and o.source_base_mapping_id=public.billing_paddle_current_mapping_v1(p_subscription)
 and m.catalogue_evidence_id is not null and m.status in ('active','retired') and m.provider='paddle' and m.environment='test'
 and m.identity_kind='plan' and m.cadence=o.target_cadence and m.currency_code='USD'
 and p_item->>'priceRef'=m.provider_price_ref and p_item->>'productRef'=m.provider_product_ref
 and p_item->'quantity'='1'::jsonb and p_item#>>'{unitPrice,currency}'='USD' and (p_item#>>'{unitPrice,amount}')::numeric=m.unit_amount_minor
 and (p_item->>'status'='active' or p_observation->>'status'='canceled' and p_item->>'status'='inactive')),false)
$$;

-- Surgical extensions to reviewed existing functions, with shape assertions.
do $$
declare body text;needle text;replacement text;
begin
 body:=pg_get_functiondef('public.resolve_account_entitlements(uuid)'::regprocedure);
 needle:='s.plan_version_id);';
 if position(needle in body)=0 then raise exception 'PADDLE_PLAN_MIGRATION_SHAPE';end if;
 body:=replace(body,needle,'coalesce(public.billing_paddle_scheduled_plan_v1(s.id,now()),s.plan_version_id));');execute body;

 body:=pg_get_functiondef('public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)'::regprocedure);
 needle:='array[''provider'',''environment'',''eventRef'',''notificationRef'',''eventType'',''occurredAt'',''kind'',''customerRef'',''subscriptionRef'',''status'',''items'']';
 if position(needle in body)=0 then raise exception 'PADDLE_PLAN_MIGRATION_SHAPE';end if;
 body:=replace(body,needle,needle||' || array(select key from jsonb_object_keys(o) key where key=any(array[''planChangeOperationId'',''paymentTotals'']))');
 body:=replace(body,'array[''origin'',''billingPeriod'',''updatedAt''','array[''planChangeOperationId'',''paymentTotals'',''origin'',''billingPeriod'',''updatedAt''');
 needle:='perform public.billing_paddle_lifecycle_shape_v1(o);';
 body:=replace(body,needle,needle||$patch$
 if o ? 'planChangeOperationId' and (jsonb_typeof(o->'planChangeOperationId')<>'string' or (o->>'planChangeOperationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'PADDLE_INGRESS_INVALID';end if;
 if o ? 'paymentTotals' then
  if kind<>'transaction.completed' then raise exception 'PADDLE_INGRESS_INVALID';end if;
  perform public.billing_v2_proof_object(o->'paymentTotals',array['total','paid','balance']);
  perform public.billing_v2_proof_money(o#>'{paymentTotals,total}');perform public.billing_v2_proof_money(o#>'{paymentTotals,paid}');perform public.billing_v2_proof_money(o#>'{paymentTotals,balance}');
 end if;
 $patch$);execute body;

 body:=pg_get_functiondef('public.reconcile_paddle_initial_purchase_event_v1(uuid)'::regprocedure);
 needle:='return public.reconcile_paddle_lifecycle_event_v1(p_event);';
 if position(needle in body)=0 then raise exception 'PADDLE_PLAN_MIGRATION_SHAPE';end if;
 body:=replace(body,needle,$patch$result:=public.reconcile_paddle_plan_change_event_v1(p_event);
 if result->>'status'<>'not_applicable' then return result;end if;
 return public.reconcile_paddle_lifecycle_event_v1(p_event);$patch$);
 body:=replace(body,'le.proof_schema=''paddle-subscription-lifecycle-v1''','le.proof_schema in (''paddle-subscription-lifecycle-v1'',''paddle-plan-change-v1'')');execute body;

 body:=pg_get_functiondef('public.billing_paddle_initial_link_guard_v1()'::regprocedure);
 needle:='begin';
 replacement:=$patch$begin
 if new.account_subscription_id is not null and exists(select 1 from public.billing_evidence_v2 where id=new.latest_evidence_id and proof_schema='paddle-plan-change-v1') then
  select * into e from public.billing_evidence_v2 where id=new.latest_evidence_id;facts:=e.proof->'observation';
  if tg_op<>'UPDATE' or e.proof_kind<>'subscription' or e.subscription_id<>new.id or new.environment<>'test' or new.shadow_status<>'current'
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
 $patch$;
 body:=regexp_replace(body,'begin',replacement,'i');
 body:=replace(body,'pe.proof#>>''{observation,planVersionId}''=facts->>''planVersionId''',
 '(facts->>''planVersionId'')::uuid=(select plan_version_id from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(new.id))');execute body;

 -- The original lifecycle logic now follows a completed plan operation rather
 -- than incorrectly restoring the immutable initial Growth mapping.
 body:=pg_get_functiondef('public.billing_paddle_lifecycle_facts_v1(uuid,uuid)'::regprocedure);body:=replace(body,chr(13),'');
 body:=replace(body,'a.plan_version_id is distinct from (initial->>''planVersionId'')::uuid',
 'a.plan_version_id is distinct from (select plan_version_id from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(s.id))');
 body:=replace(body,'where id=(initial->>''mappingId'')::uuid for share','where id=public.billing_paddle_current_mapping_v1(s.id) for share');
 body:=replace(body,'m.canonical_key<>''growth'' or m.cadence<>''monthly''','m.canonical_key not in (''launch'',''growth'',''scale'') or m.cadence not in (''monthly'',''annual'')');
 body:=replace(body,'m.catalogue_evidence_id is distinct from (initial->>''catalogueEvidenceId'')::uuid','m.catalogue_evidence_id is null');
 body:=replace(body,'m.unit_amount_minor is distinct from (initial->>''amountMinor'')::bigint','m.unit_amount_minor<=0');
 body:=replace(body,'subscription_id=s.id and mapping_id=m.id','subscription_id=s.id and mapping_id=(initial->>''mappingId'')::uuid');
 body:=replace(body,'and cadence=''monthly'' and quantity=1','and quantity=1');
 body:=replace(body,'start_at at time zone ''UTC''+interval ''1 month''','start_at at time zone ''UTC''+case when m.cadence=''monthly'' then interval ''1 month'' else interval ''1 year'' end');
 body:=replace(body,'''cadence'',''monthly''','''cadence'',m.cadence');
 needle:='if row_item->>''priceRef'' is distinct from m.provider_price_ref::text';
 if position(needle in body)=0 then raise exception 'PADDLE_PLAN_MIGRATION_SHAPE';end if;
 body:=replace(body,needle,'if ('||substring(needle from 4));
 needle:='then raise exception ''PADDLE_LIFECYCLE_ITEMS''; end if;'||chr(10)||' end loop;';
 if position(needle in body)=0 then raise exception 'PADDLE_PLAN_MIGRATION_SHAPE';end if;
 body:=replace(body,needle,') and not (kind=''subscription'' and p_transaction_event is null and public.billing_paddle_plan_cancel_item_v1(s.id,o,row_item)) '||needle);execute body;
end $$;

alter function public.get_my_billing_plan_change_state() rename to get_my_legacy_billing_plan_change_state;
create function public.get_my_billing_plan_change_state() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype;a public.account_subscriptions%rowtype;o public.billing_operations_v2%rowtype;m public.billing_price_mappings%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null) then raise exception 'BILLING_PLAN_CHANGE_OWNER_REQUIRED' using errcode='42501';end if;
 select b.* into s from public.billing_subscriptions_v2 b join public.billing_accounts account on account.id=b.billing_account_id
 where account.owner_user_id=auth.uid() and b.shadow_status='current' and b.account_subscription_id is not null;
 if s.id is null then return public.get_my_legacy_billing_plan_change_state();end if;
 select * into a from public.account_subscriptions where id=s.account_subscription_id;
 select * into m from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(s.id);
 select * into o from public.billing_operations_v2 where subscription_id=s.id order by (status not in ('completed','canceled','failed')) desc,provider_requested_at desc,id desc limit 1;
 return jsonb_build_object('provider','paddle','linked',true,'cadence',m.cadence,'eligible',s.environment='test' and
 (select paddle_reconciliation_enabled and entitlement_environment='test' from public.billing_runtime_policy where id=1)
 and s.provider_status='active' and s.reconciliation_status='processed' and s.approved_additional_coach_seats=0 and a.status='active' and not a.cancel_at_period_end
 and s.scheduled_cancel_at is null and (o.id is null or o.status in ('completed','failed','canceled')),
 'operation',case when o.id is null then null else jsonb_build_object('operationId',o.operation_id,'status',o.status,'targetPlanKey',(select canonical_key from public.billing_price_mappings where id=o.target_base_mapping_id),
 'targetCadence',o.target_cadence,'effectiveAt',o.effective_at,'effectiveTiming',o.effective_timing,'errorCode',o.error_code) end);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
 (p.proname like '%paddle_plan_%' or p.proname in ('billing_paddle_current_mapping_v1','billing_paddle_scheduled_plan_v1','get_my_billing_plan_change_state','get_my_legacy_billing_plan_change_state')) loop
 execute format('alter function %s owner to postgres',f.signature);
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.paddle_plan_change_route_v1(uuid),public.paddle_plan_change_context_v1(uuid),
 public.preview_paddle_plan_change_v1(uuid,text,text,jsonb),public.begin_paddle_plan_change_v1(uuid,text,text,uuid,jsonb),
 public.fail_paddle_plan_change_v1(uuid,uuid,boolean),public.reconcile_paddle_plan_change_event_v1(uuid) to service_role;
grant execute on function public.get_my_billing_plan_change_state() to authenticated;
commit;
