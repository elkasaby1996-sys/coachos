-- Initial purchases only. No policy enablement or data repair during deployment.
begin;

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
  case when kind='transaction.completed' then array['transactionRef','currency'] else array['transactionCorrelationRef'] end);
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
  if old.event_id is null or old.observation_sha256<>digest then raise exception 'PADDLE_INGRESS_REPLAY_CONFLICT'; end if;
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
 elsif sub.id is not null and kind<>'transaction.completed' then
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

create or replace function public.reconcile_paddle_initial_purchase_v1(p_subscription uuid,p_operation text default 'initial_purchase') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare facts jsonb; s public.billing_subscriptions_v2%rowtype; canonical uuid; se uuid; te uuid; payment uuid; checkout public.billing_checkouts_v2%rowtype;
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
 -- Application lifecycle time, not a fabricated provider timestamp. The proof
 -- helper holds the account and checkout locks for this entire transaction.
 if checkout.status='ready' then
 update public.billing_checkouts_v2 set status='completed',completed_subscription_id=s.id,
 completed_at=clock_timestamp(),updated_at=clock_timestamp(),error_code=null where id=checkout.id;
 end if;
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
 -- Application lifecycle time, not a fabricated provider timestamp. The proof
 -- helper holds the account and checkout locks for this entire transaction.
 if checkout.status='ready' then
 update public.billing_checkouts_v2 set status='completed',completed_subscription_id=s.id,
 completed_at=clock_timestamp(),updated_at=clock_timestamp(),error_code=null where id=checkout.id;
 end if;
 return jsonb_build_object('success',true,'reused',false);
end $$;
-- Readiness is not proof. Once both kinds exist, only the independently
-- reviewed reconciler may decide authority; its errors are never made pending.
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
 result:=public.reconcile_paddle_initial_purchase_v1(s.id,'initial_purchase');
 if result->'success' is distinct from 'true'::jsonb or jsonb_typeof(result->'reused') is distinct from 'boolean' then
 raise exception 'PADDLE_AUTO_RECONCILIATION_RESULT'; end if;
 return jsonb_build_object('status',case when (result->>'reused')::boolean then 'reused' else 'applied' end);
end $$;

alter function public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb) owner to postgres;
alter function public.reconcile_paddle_initial_purchase_v1(uuid,text) owner to postgres;
alter function public.reconcile_paddle_initial_purchase_event_v1(uuid) owner to postgres;
revoke all on function public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_paddle_initial_purchase_v1(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_paddle_initial_purchase_event_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb) to service_role;
grant execute on function public.reconcile_paddle_initial_purchase_v1(uuid,text) to service_role;
grant execute on function public.reconcile_paddle_initial_purchase_event_v1(uuid) to service_role;
commit;
