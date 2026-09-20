-- Authenticated Sandbox observations only. No payment/canonical/seat authority.
begin;
create table public.billing_paddle_event_observations (
 event_id uuid primary key references public.billing_webhook_events_v2(id),
 observation jsonb not null check(jsonb_typeof(observation)='object' and octet_length(observation::text)<=65536),
 observation_sha256 public.billing_v2_sha256 not null,
 checkout_id uuid references public.billing_checkouts_v2(id),
 disposition text not null check(disposition in ('correlated','pending','manual_review','stale')),
 created_at timestamptz not null default now(),
 check(observation_sha256=encode(extensions.digest(observation::text,'sha256'),'hex'))
);
create table public.billing_paddle_event_deliveries (
 notification_ref public.billing_v2_ref primary key,
 event_id uuid not null references public.billing_paddle_event_observations(event_id),
 raw_payload_sha256 public.billing_v2_sha256 not null,
 verified_evidence_id uuid not null references public.billing_verified_evidence_v2(id),
 created_at timestamptz not null default now()
);
alter table public.billing_paddle_event_observations enable row level security;
alter table public.billing_paddle_event_deliveries enable row level security;
revoke all on public.billing_paddle_event_observations,public.billing_paddle_event_deliveries from public,anon,authenticated,service_role;
create trigger paddle_observation_history before update or delete on public.billing_paddle_event_observations for each row execute function public.billing_v2_protect_history('');
create trigger paddle_observation_truncate before truncate on public.billing_paddle_event_observations for each statement execute function public.billing_v2_protect_history();
create trigger paddle_delivery_history before update or delete on public.billing_paddle_event_deliveries for each row execute function public.billing_v2_protect_history('');
create trigger paddle_delivery_truncate before truncate on public.billing_paddle_event_deliveries for each statement execute function public.billing_v2_protect_history();

create function public.ingest_verified_paddle_event_v1(p_proof jsonb,p_raw_payload_sha256 text,p_notification_ref text,p_observation jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p jsonb; o jsonb:=p_observation; kind text; logical jsonb; digest text; ev uuid; verified jsonb;
 account uuid; initial_account uuid; sid uuid; cid uuid; tx text; checkout public.billing_checkouts_v2%rowtype;
 sub public.billing_subscriptions_v2%rowtype; snapshot public.billing_paddle_checkout_snapshots%rowtype;
 old public.billing_paddle_event_observations%rowtype; delivery public.billing_paddle_event_deliveries%rowtype;
 item jsonb; mapping public.billing_price_mappings%rowtype; roles text[]:='{}'; cadence text;
 valid_items boolean:=true; state text:='pending'; observed timestamptz; found_checkout boolean; count_items integer:=0;
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
  return jsonb_build_object('accepted',true,'reused',true);
 end if;
 if ev is not null then
  verified:=public.record_verified_billing_event_v2(p,p_raw_payload_sha256,p_notification_ref);
  insert into public.billing_paddle_event_deliveries values(p_notification_ref,ev,p_raw_payload_sha256,(verified->>'id')::uuid,now());
  return jsonb_build_object('accepted',true,'reused',true);
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
    if exists(select 1 from public.billing_customers_v2 c where provider='paddle' and environment='test' and
     ((provider_customer_ref=o->>'customerRef' and billing_account_id<>account) or (billing_account_id=account and provider_customer_ref<>o->>'customerRef'))) then raise exception 'PADDLE_INGRESS_IDENTITY_CONFLICT'; end if;
    insert into public.billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref) values(account,'paddle','test',o->>'customerRef') on conflict(provider,environment,provider_customer_ref) do nothing;
    select id into cid from public.billing_customers_v2 where provider='paddle' and environment='test' and provider_customer_ref=o->>'customerRef' and billing_account_id=account;
    insert into public.billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref,provider_status,provider_updated_at)
     values(account,cid,'paddle','test',o->>'subscriptionRef',o->>'status',observed) returning id into sid;
   end if;
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
 return jsonb_build_object('accepted',true,'reused',false);
end $$;
revoke all on function public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ingest_verified_paddle_event_v1(jsonb,text,text,jsonb) to service_role;
commit;
