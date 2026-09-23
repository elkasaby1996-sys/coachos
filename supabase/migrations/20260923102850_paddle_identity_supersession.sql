-- Provider identity lifecycle. Sandbox certification shadows may be retained
-- and superseded by stronger verified provider identity without granting any
-- canonical subscription, payment, entitlement, or capacity authority.
begin;

alter table public.billing_customers_v2
  add column identity_status text not null default 'current'
    check (identity_status in ('current','superseded')),
  add column identity_source text not null default 'unknown_legacy'
    check (identity_source in ('certification_fixture','verified_provider_event','unknown_legacy')),
  add column superseded_at timestamptz,
  add column superseded_by_customer_id uuid,
  add constraint billing_v2_customer_lifecycle_complete check (
    (identity_status='current' and superseded_at is null and superseded_by_customer_id is null)
    or (identity_status='superseded' and superseded_at is not null and superseded_by_customer_id is not null)
  ),
  add constraint billing_v2_customer_supersession_not_self check (superseded_by_customer_id is distinct from id),
  add constraint billing_v2_customer_supersession_scope_fk
    foreign key(superseded_by_customer_id,billing_account_id,provider,environment)
    references public.billing_customers_v2(id,billing_account_id,provider,environment)
    on update restrict on delete restrict deferrable initially deferred;

alter table public.billing_customers_v2
  drop constraint billing_customers_v2_billing_account_id_provider_environmen_key;
create unique index billing_v2_one_current_customer
  on public.billing_customers_v2(billing_account_id,provider,environment)
  where identity_status='current';
create index billing_v2_customer_supersession_target
  on public.billing_customers_v2(superseded_by_customer_id,billing_account_id,provider,environment);
create index billing_v2_customer_scope_history
  on public.billing_customers_v2(billing_account_id,provider,environment);

alter table public.billing_subscriptions_v2
  add column shadow_status text not null default 'current'
    check (shadow_status in ('current','superseded')),
  add column superseded_at timestamptz,
  add column superseded_by_subscription_id uuid,
  add constraint billing_v2_subscription_lifecycle_complete check (
    (shadow_status='current' and superseded_at is null and superseded_by_subscription_id is null)
    or (shadow_status='superseded' and superseded_at is not null and superseded_by_subscription_id is not null)
  ),
  add constraint billing_v2_subscription_supersession_not_self check (superseded_by_subscription_id is distinct from id),
  add constraint billing_v2_subscription_supersession_scope_fk
    foreign key(superseded_by_subscription_id,billing_account_id,provider,environment)
    references public.billing_subscriptions_v2(id,billing_account_id,provider,environment)
    on update restrict on delete restrict deferrable initially deferred;
create index billing_v2_subscription_supersession_target
  on public.billing_subscriptions_v2(superseded_by_subscription_id,billing_account_id,provider,environment);
create index billing_v2_current_subscription_resolution
  on public.billing_subscriptions_v2(billing_account_id,provider,environment,provider_subscription_ref)
  where shadow_status='current';

-- Exact retained lineage predicate. Provider reference spelling is never used
-- to classify certification data.
create function public.billing_paddle_certification_shadow_v1(p_customer uuid,p_subscription uuid default null)
returns boolean language sql stable set search_path=pg_catalog,public as $$
select exists (
  select 1
  from public.billing_customers_v2 c
  join public.billing_subscriptions_v2 s
    on s.customer_id=c.id and s.billing_account_id=c.billing_account_id
   and s.provider=c.provider and s.environment=c.environment
  where c.id=p_customer
    and (p_subscription is null or s.id=p_subscription)
    and c.provider='paddle' and c.environment='test'
    and c.identity_status='current' and s.shadow_status='current'
    and s.account_subscription_id is null
    and s.approved_additional_coach_seats=0
    and s.reconciliation_status='pending'
    and not exists(select 1 from public.billing_subscription_items_v2 i where i.subscription_id=s.id)
    and exists (
      select 1
      from public.billing_paddle_event_observations o
      join public.billing_webhook_events_v2 e on e.id=o.event_id
      join public.billing_paddle_event_deliveries d on d.event_id=e.id
      join public.billing_verified_evidence_v2 v on v.id=d.verified_evidence_id
      join public.billing_paddle_checkout_certification_fixtures f on f.checkout_id=o.checkout_id
      where o.disposition='correlated'
        and e.provider='paddle' and e.environment='test'
        and e.provider_event_name='subscription.created'
        and o.observation->>'customerRef'=c.provider_customer_ref
        and o.observation->>'subscriptionRef'=s.provider_subscription_ref
        and v.provider='paddle' and v.environment='test'
        and v.proof_kind='event' and v.source_kind='webhook'
        and v.evidence_class='authenticated_provider' and not v.payment_authority
    )
    and not exists (
      select 1
      from public.billing_paddle_event_observations o
      where o.disposition='correlated'
        and o.observation->>'customerRef'=c.provider_customer_ref
        and o.observation->>'subscriptionRef'=s.provider_subscription_ref
        and o.checkout_id is not null
        and not exists (
          select 1 from public.billing_paddle_checkout_certification_fixtures f
          where f.checkout_id=o.checkout_id
        )
    )
    and not exists(select 1 from public.billing_payment_applications_v2 p where p.subscription_id=s.id)
    and not exists(select 1 from public.account_feature_entitlement_overrides x where x.billing_account_id=c.billing_account_id)
    and not exists(select 1 from public.account_capacity_reservations r where r.billing_account_id=c.billing_account_id)
)
and (
  select count(*) from public.billing_subscriptions_v2 s
  where s.customer_id=p_customer and s.shadow_status='current'
)=1
$$;
revoke all on function public.billing_paddle_certification_shadow_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- The prior history trigger intentionally blocks source changes. Remove it only
-- around this evidence-based backfill, then install stricter lifecycle guards.
drop trigger billing_v2_customer_history on public.billing_customers_v2;
update public.billing_customers_v2 c
set identity_source='certification_fixture'
where c.identity_source='unknown_legacy'
  and public.billing_paddle_certification_shadow_v1(c.id,null);

create function public.billing_v2_protect_customer_lifecycle() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op in ('DELETE','TRUNCATE') then raise exception 'BILLING_V2_HISTORY_IMMUTABLE'; end if;
  if new.identity_source is distinct from old.identity_source
    or (to_jsonb(new)-array['identity_status','superseded_at','superseded_by_customer_id','last_seen_at','updated_at'])
       is distinct from
       (to_jsonb(old)-array['identity_status','superseded_at','superseded_by_customer_id','last_seen_at','updated_at'])
  then raise exception 'BILLING_V2_IDENTITY_IMMUTABLE'; end if;
  if new.identity_status=old.identity_status
    and new.superseded_at is not distinct from old.superseded_at
    and new.superseded_by_customer_id is not distinct from old.superseded_by_customer_id
  then return new; end if;
  if old.identity_status='superseded' or new.identity_status<>'superseded'
    or new.superseded_at is null or new.superseded_by_customer_id is null
  then raise exception 'BILLING_V2_LIFECYCLE_IMMUTABLE'; end if;
  return new;
end $$;
revoke all on function public.billing_v2_protect_customer_lifecycle() from public,anon,authenticated,service_role;
create trigger billing_v2_customer_history before update or delete on public.billing_customers_v2
 for each row execute function public.billing_v2_protect_customer_lifecycle();
create trigger billing_v2_customer_no_truncate before truncate on public.billing_customers_v2
 for each statement execute function public.billing_v2_protect_customer_lifecycle();

drop trigger billing_v2_subscription_history on public.billing_subscriptions_v2;
create function public.billing_v2_protect_subscription_lifecycle() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op in ('DELETE','TRUNCATE') then raise exception 'BILLING_V2_HISTORY_IMMUTABLE'; end if;
  if old.shadow_status='superseded' then raise exception 'BILLING_V2_LIFECYCLE_IMMUTABLE'; end if;
  if new.shadow_status='superseded' then
    if new.superseded_at is null or new.superseded_by_subscription_id is null
      or (to_jsonb(new)-array['shadow_status','superseded_at','superseded_by_subscription_id','updated_at'])
         is distinct from
         (to_jsonb(old)-array['shadow_status','superseded_at','superseded_by_subscription_id','updated_at'])
    then raise exception 'BILLING_V2_LIFECYCLE_IMMUTABLE'; end if;
  elsif (to_jsonb(new)-array['reconciliation_status','provider_status','provider_updated_at','current_period_started_at','current_period_ends_at','scheduled_cancel_at','latest_evidence_id','latest_snapshot_sha256','last_reconciled_at','reconciliation_error_code','updated_at'])
       is distinct from
       (to_jsonb(old)-array['reconciliation_status','provider_status','provider_updated_at','current_period_started_at','current_period_ends_at','scheduled_cancel_at','latest_evidence_id','latest_snapshot_sha256','last_reconciled_at','reconciliation_error_code','updated_at'])
  then raise exception 'BILLING_V2_IDENTITY_IMMUTABLE'; end if;
  return new;
end $$;
revoke all on function public.billing_v2_protect_subscription_lifecycle() from public,anon,authenticated,service_role;
create trigger billing_v2_subscription_history before update or delete on public.billing_subscriptions_v2
 for each row execute function public.billing_v2_protect_subscription_lifecycle();
create trigger billing_v2_subscription_no_truncate before truncate on public.billing_subscriptions_v2
 for each statement execute function public.billing_v2_protect_subscription_lifecycle();

create function public.billing_v2_validate_supersession_target() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_table_name='billing_customers_v2' then
    if new.identity_status='superseded' and not exists (
      select 1 from public.billing_customers_v2 target
      where target.id=new.superseded_by_customer_id
        and target.billing_account_id=new.billing_account_id
        and target.provider=new.provider and target.environment=new.environment
        and target.identity_status='current'
    ) then raise exception 'BILLING_V2_SUPERSESSION_TARGET_INVALID'; end if;
  elsif new.shadow_status='superseded' and not exists (
    select 1 from public.billing_subscriptions_v2 target
    where target.id=new.superseded_by_subscription_id
      and target.billing_account_id=new.billing_account_id
      and target.provider=new.provider and target.environment=new.environment
      and target.shadow_status='current'
  ) then raise exception 'BILLING_V2_SUPERSESSION_TARGET_INVALID'; end if;
  return new;
end $$;
revoke all on function public.billing_v2_validate_supersession_target() from public,anon,authenticated,service_role;
create constraint trigger billing_v2_customer_supersession_target
 after insert or update on public.billing_customers_v2 deferrable initially deferred
 for each row execute function public.billing_v2_validate_supersession_target();
create constraint trigger billing_v2_subscription_supersession_target
 after insert or update on public.billing_subscriptions_v2 deferrable initially deferred
 for each row execute function public.billing_v2_validate_supersession_target();

create table public.billing_provider_identity_transitions_v2 (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on update restrict on delete restrict,
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  old_customer_id uuid not null,
  new_customer_id uuid not null,
  old_subscription_id uuid,
  new_subscription_id uuid,
  triggering_event_id uuid not null references public.billing_webhook_events_v2(id) on update restrict on delete restrict,
  triggering_verified_evidence_id uuid not null references public.billing_verified_evidence_v2(id) on update restrict on delete restrict,
  correlated_checkout_id uuid not null,
  transition_reason text not null check(transition_reason='certification_identity_superseded_by_verified_provider_identity'),
  created_at timestamptz not null default now(),
  unique(triggering_event_id),
  unique(old_customer_id),
  foreign key(old_customer_id,billing_account_id,provider,environment)
    references public.billing_customers_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(new_customer_id,billing_account_id,provider,environment)
    references public.billing_customers_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(old_subscription_id,billing_account_id,provider,environment)
    references public.billing_subscriptions_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(new_subscription_id,billing_account_id,provider,environment)
    references public.billing_subscriptions_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(correlated_checkout_id,billing_account_id,provider,environment)
    references public.billing_checkouts_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  check(old_customer_id<>new_customer_id),
  check((old_subscription_id is null)=(new_subscription_id is null))
);
create index billing_identity_transition_account on public.billing_provider_identity_transitions_v2(billing_account_id,provider,environment);
create index billing_identity_transition_new_customer on public.billing_provider_identity_transitions_v2(new_customer_id,billing_account_id,provider,environment);
create index billing_identity_transition_old_subscription on public.billing_provider_identity_transitions_v2(old_subscription_id,billing_account_id,provider,environment) where old_subscription_id is not null;
create index billing_identity_transition_new_subscription on public.billing_provider_identity_transitions_v2(new_subscription_id,billing_account_id,provider,environment) where new_subscription_id is not null;
create index billing_identity_transition_checkout on public.billing_provider_identity_transitions_v2(correlated_checkout_id,billing_account_id,provider,environment);
create index billing_identity_transition_evidence on public.billing_provider_identity_transitions_v2(triggering_verified_evidence_id);
alter table public.billing_provider_identity_transitions_v2 enable row level security;
revoke all on public.billing_provider_identity_transitions_v2 from public,anon,authenticated,service_role;
create trigger billing_identity_transition_history before update or delete on public.billing_provider_identity_transitions_v2
 for each row execute function public.billing_v2_protect_history('');
create trigger billing_identity_transition_no_truncate before truncate on public.billing_provider_identity_transitions_v2
 for each statement execute function public.billing_v2_protect_history();


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
 return jsonb_build_object('accepted',true,'reused',false);
end $$;

commit;
