-- PR-PRICE-05: private provider history, no real provider mappings or domain rewrites.
begin;

create table public.billing_provider_variant_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'lemonsqueezy' check(provider='lemonsqueezy'),
  environment text not null check(environment in ('test','live')),
  plan_version_id uuid not null references public.commercial_plan_versions(id),
  cadence text not null check(cadence in ('monthly','annual')),
  provider_store_id text not null check(provider_store_id ~ '^[1-9][0-9]*$'),
  provider_product_id text not null check(provider_product_id ~ '^[1-9][0-9]*$'),
  provider_variant_id text not null check(provider_variant_id ~ '^[1-9][0-9]*$'),
  provider_price_id text not null check(provider_price_id ~ '^[1-9][0-9]*$'),
  currency_code text not null check(currency_code='USD'),
  unit_amount_minor integer not null check(unit_amount_minor>0),
  renewal_interval_unit text not null,
  renewal_interval_quantity integer not null check(renewal_interval_quantity=1),
  status text not null check(status in ('draft','active','retired')),
  verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), retired_at timestamptz,
  unique(provider,environment,provider_variant_id), unique(provider,environment,provider_price_id),
  unique(id,plan_version_id,cadence,provider,environment),
  check((cadence='monthly' and renewal_interval_unit='month') or (cadence='annual' and renewal_interval_unit='year')),
  check((status='retired')=(retired_at is not null)), check(status<>'active' or verified_at is not null)
);
create unique index billing_active_mapping on public.billing_provider_variant_mappings(provider,environment,plan_version_id,cadence) where status='active';

create function public.protect_billing_variant_mapping() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare p public.commercial_plan_versions%rowtype;
begin
  if tg_op='DELETE' then raise exception 'Billing history cannot be deleted.'; end if;
  if tg_op='UPDATE' and (old.status='retired' or (old.status='active' and
    (new.status not in ('active','retired') or (to_jsonb(new)-array['status','retired_at','updated_at']) is distinct from
    (to_jsonb(old)-array['status','retired_at','updated_at'])))) then raise exception 'BILLING_VARIANT_MAPPING_MISMATCH'; end if;
  select * into strict p from public.commercial_plan_versions where id=new.plan_version_id for share;
  if new.unit_amount_minor is distinct from (case new.cadence when 'monthly' then p.monthly_price_minor else p.annual_price_minor end)
    or new.currency_code<>p.currency_code or (new.status='active' and p.status not in ('active','retired')) then
    raise exception 'BILLING_VARIANT_MAPPING_MISMATCH'; end if;
  -- Serialize publication to enforce one Store/Product per provider environment.
  perform pg_advisory_xact_lock(hashtextextended('billing-mapping:'||new.environment,0));
  if new.status='active' and exists(select 1 from public.billing_provider_variant_mappings m where m.id<>new.id and m.environment=new.environment
    and m.status in ('active','retired') and (m.provider_store_id<>new.provider_store_id or m.provider_product_id<>new.provider_product_id)) then
    raise exception 'BILLING_VARIANT_MAPPING_MISMATCH'; end if;
  return new;
end $$;
create trigger billing_mapping_protection before insert or update or delete on public.billing_provider_variant_mappings for each row execute function public.protect_billing_variant_mapping();

create table public.billing_checkout_attempts (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid not null references public.billing_accounts(id),
  plan_version_id uuid not null, variant_mapping_id uuid not null,
  provider text not null default 'lemonsqueezy' check(provider='lemonsqueezy'), environment text not null check(environment in ('test','live')),
  cadence text not null check(cadence in ('monthly','annual')), operation_id uuid not null,
  status text not null check(status in ('creating','ready','completed','failed','ambiguous','expired')),
  provider_checkout_id text, provider_checkout_url text,
  expected_expires_at timestamptz not null, provider_expires_at timestamptz,
  completed_provider_subscription_id text, creation_lease_expires_at timestamptz not null, error_code text,
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz, failed_at timestamptz, expired_at timestamptz,
  unique(billing_account_id,operation_id), unique(provider,environment,provider_checkout_id),
  foreign key(variant_mapping_id,plan_version_id,cadence,provider,environment) references public.billing_provider_variant_mappings(id,plan_version_id,cadence,provider,environment),
  check(expected_expires_at>created_at and creation_lease_expires_at>created_at and creation_lease_expires_at<=expected_expires_at),
  check((status='completed')=(completed_at is not null)), check((status='failed')=(failed_at is not null)), check((status='expired')=(expired_at is not null)),
  check((status='completed')=(completed_provider_subscription_id is not null)),
  check((status='ready')=(provider_checkout_url is not null)),
  check(status<>'ready' or (provider_checkout_id is not null and provider_expires_at=expected_expires_at)),
  check(provider_checkout_url is null or provider_checkout_url ~ '^https://[a-z0-9-]+\.lemonsqueezy\.com/checkout/'),
  check(error_code is null or error_code in ('BILLING_CHECKOUT_CREATION_FAILED','BILLING_CHECKOUT_CREATION_AMBIGUOUS','BILLING_CHECKOUT_EXPIRED','BILLING_VARIANT_MAPPING_MISMATCH'))
);
create unique index billing_one_open_checkout on public.billing_checkout_attempts(billing_account_id) where status in ('creating','ready','ambiguous');

create table public.billing_provider_customers (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid not null references public.billing_accounts(id),
  provider text not null check(provider='lemonsqueezy'), environment text not null check(environment in ('test','live')),
  provider_store_id text not null, provider_customer_id text not null,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(billing_account_id,provider,environment), unique(provider,environment,provider_customer_id),
  unique(billing_account_id,provider,environment,provider_store_id,provider_customer_id)
);
create table public.billing_provider_subscriptions (
  id uuid primary key default gen_random_uuid(), billing_account_id uuid not null references public.billing_accounts(id),
  account_subscription_id uuid unique,
  variant_mapping_id uuid not null references public.billing_provider_variant_mappings(id),
  provider text not null check(provider='lemonsqueezy'), environment text not null check(environment in ('test','live')),
  provider_store_id text not null, provider_customer_id text not null, provider_subscription_id text not null,
  provider_order_id text not null, provider_order_item_id text not null, provider_product_id text not null,
  provider_variant_id text not null, provider_price_id text not null, first_subscription_item_id text not null,
  quantity integer not null check(quantity=1), provider_status text not null check(provider_status in ('active','paused','past_due','unpaid','cancelled','expired')),
  provider_cancelled boolean not null, provider_renews_at timestamptz, provider_ends_at timestamptz, provider_trial_ends_at timestamptz,
  provider_created_at timestamptz not null, provider_updated_at timestamptz not null,
  latest_snapshot_sha256 text not null check(latest_snapshot_sha256 ~ '^[0-9a-f]{64}$'), last_reconciled_at timestamptz not null,
  reconciliation_status text not null check(reconciliation_status in ('processed','manual_review')),
  reconciliation_error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider,environment,provider_subscription_id),
  foreign key(billing_account_id,account_subscription_id) references public.account_subscriptions(billing_account_id,id),
  foreign key(billing_account_id,provider,environment,provider_store_id,provider_customer_id) references public.billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id)
);
create table public.billing_provider_webhook_deliveries (
  id uuid primary key default gen_random_uuid(), provider text not null check(provider='lemonsqueezy'), environment text not null check(environment in ('test','live')),
  event_name text not null, object_type text not null, object_id text not null,
  provider_subscription_id text, provider_customer_id text, provider_created_at timestamptz, provider_updated_at timestamptz,
  payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'), delivery_fingerprint text not null check(delivery_fingerprint ~ '^[0-9a-f]{64}$'),
  processing_status text not null check(processing_status in ('received','processed','ignored','deferred','failed')),
  attempt_count integer not null default 0 check(attempt_count>=0), last_error_code text,
  normalized_payload jsonb not null check(jsonb_typeof(normalized_payload)='object'),
  received_at timestamptz not null default now(), last_attempt_at timestamptz, processed_at timestamptz,
  unique(provider,environment,delivery_fingerprint),
  check(normalized_payload - array['store_id','subscription_id','customer_id','product_id','variant_id','price_id','status','test_mode','created_at','updated_at','billing_account_id','checkout_attempt_id','plan_version_id'] = '{}'::jsonb)
);

create function public.protect_billing_provider_history() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare m public.billing_provider_variant_mappings%rowtype;
begin
  if tg_op='DELETE' then raise exception 'Billing history cannot be deleted.'; end if;
  if tg_table_name='billing_provider_customers' and tg_op='UPDATE' and
    (to_jsonb(new)-array['last_seen_at','updated_at']) is distinct from (to_jsonb(old)-array['last_seen_at','updated_at']) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
  if tg_table_name='billing_checkout_attempts' then
    if tg_op='UPDATE' and (to_jsonb(new)-array['status','provider_checkout_id','provider_checkout_url','provider_expires_at','completed_provider_subscription_id','error_code','updated_at','completed_at','failed_at','expired_at']) is distinct from
      (to_jsonb(old)-array['status','provider_checkout_id','provider_checkout_url','provider_expires_at','completed_provider_subscription_id','error_code','updated_at','completed_at','failed_at','expired_at']) then raise exception 'BILLING_CHECKOUT_OPERATION_CONFLICT'; end if;
    if not exists(select 1 from public.billing_accounts where id=new.billing_account_id and owner_user_id=new.created_by_user_id) then raise exception 'BILLING_FORBIDDEN'; end if;
  end if;
  if tg_table_name='billing_provider_subscriptions' then
    if tg_op='UPDATE' and (to_jsonb(new)-array['account_subscription_id','provider_status','provider_cancelled','provider_renews_at','provider_ends_at','provider_trial_ends_at','provider_updated_at','latest_snapshot_sha256','last_reconciled_at','reconciliation_status','reconciliation_error_code','updated_at']) is distinct from
      (to_jsonb(old)-array['account_subscription_id','provider_status','provider_cancelled','provider_renews_at','provider_ends_at','provider_trial_ends_at','provider_updated_at','latest_snapshot_sha256','last_reconciled_at','reconciliation_status','reconciliation_error_code','updated_at']) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    select * into strict m from public.billing_provider_variant_mappings where id=new.variant_mapping_id;
    if (new.provider,new.environment,new.provider_store_id,new.provider_product_id,new.provider_variant_id,new.provider_price_id) is distinct from
      (m.provider,m.environment,m.provider_store_id,m.provider_product_id,m.provider_variant_id,m.provider_price_id) then raise exception 'BILLING_VARIANT_MAPPING_MISMATCH'; end if;
    if new.account_subscription_id is not null and not exists(select 1 from public.account_subscriptions where id=new.account_subscription_id and billing_account_id=new.billing_account_id
      and plan_version_id=m.plan_version_id and subscription_kind='paid') then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if tg_op='UPDATE' and old.account_subscription_id is not null and new.account_subscription_id is distinct from old.account_subscription_id then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
  end if;
  return new;
end $$;

create function public.expire_stale_billing_checkout_attempts(p_account uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform 1 from public.billing_accounts where id=p_account for update;
  update public.billing_checkout_attempts set status='expired',expired_at=now(),provider_checkout_url=null,error_code='BILLING_CHECKOUT_EXPIRED',updated_at=now()
    where billing_account_id=p_account and status in ('creating','ready','ambiguous') and expected_expires_at<=now();
  update public.billing_checkout_attempts set status='ambiguous',error_code='BILLING_CHECKOUT_CREATION_AMBIGUOUS',updated_at=now()
    where billing_account_id=p_account and status='creating' and creation_lease_expires_at<=now();
end $$;

create function public.begin_my_billing_checkout_attempt(p_plan_key text,p_cadence text,p_operation_id uuid,p_environment text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; t public.billing_checkout_attempts%rowtype; m public.billing_provider_variant_mappings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null)
    and not exists(select 1 from public.workspaces where owner_user_id=auth.uid()) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
  if p_plan_key is null or p_plan_key not in ('launch','growth','scale') or p_cadence is null or p_cadence not in ('monthly','annual')
    or p_operation_id is null or p_environment is null or p_environment not in ('test','live') then raise exception 'BILLING_INVALID_INPUT' using errcode='22023'; end if;
  a:=public.ensure_commercial_billing_account(auth.uid(),'manual');
  perform 1 from public.billing_accounts where id=a for update;
  perform public.expire_stale_billing_checkout_attempts(a);
  select * into t from public.billing_checkout_attempts where billing_account_id=a and operation_id=p_operation_id;
  if found then
    if t.cadence<>p_cadence or t.environment<>p_environment or not exists(select 1 from public.commercial_plan_versions where id=t.plan_version_id and plan_key=p_plan_key) then raise exception 'BILLING_CHECKOUT_OPERATION_CONFLICT'; end if;
    return jsonb_build_object('checkoutAttemptId',t.id,'status',t.status,'shouldCreate',false);
  end if;
  if exists(select 1 from public.account_subscriptions where billing_account_id=a and subscription_kind not in ('trial','complimentary') and status in ('active','past_due','grace','restricted')) then raise exception 'BILLING_ALREADY_SUBSCRIBED'; end if;
  if exists(select 1 from public.billing_checkout_attempts where billing_account_id=a and status in ('creating','ready','ambiguous')) then raise exception 'BILLING_CHECKOUT_ALREADY_OPEN'; end if;
  select m1.* into m from public.billing_provider_variant_mappings m1 join public.commercial_plan_versions p on p.id=m1.plan_version_id
    where p.plan_key=p_plan_key and p.status='active' and m1.status='active' and m1.environment=p_environment and m1.cadence=p_cadence;
  if not found then raise exception 'BILLING_VARIANT_MAPPING_UNAVAILABLE'; end if;
  insert into public.billing_checkout_attempts(billing_account_id,plan_version_id,variant_mapping_id,environment,cadence,operation_id,status,expected_expires_at,creation_lease_expires_at,created_by_user_id)
    values(a,m.plan_version_id,m.id,p_environment,p_cadence,p_operation_id,'creating',date_trunc('milliseconds',now())+interval '30 minutes',now()+interval '2 minutes',auth.uid()) returning * into t;
  return jsonb_build_object('checkoutAttemptId',t.id,'status',t.status,'shouldCreate',true);
end $$;

-- Server-only retrieval: owner-facing RPCs never expose mapping identifiers or hosted URLs.
create function public.get_billing_checkout_operation(p_attempt uuid,p_owner uuid,p_environment text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.billing_checkout_attempts%rowtype; m public.billing_provider_variant_mappings%rowtype;
begin
  select * into strict t from public.billing_checkout_attempts where id=p_attempt and created_by_user_id=p_owner and environment=p_environment;
  perform public.expire_stale_billing_checkout_attempts(t.billing_account_id);
  select * into strict t from public.billing_checkout_attempts where id=p_attempt;
  select * into strict m from public.billing_provider_variant_mappings where id=t.variant_mapping_id;
  return jsonb_build_object('attempt',to_jsonb(t),'mapping',to_jsonb(m));
end $$;
create function public.complete_billing_checkout_attempt(p_attempt uuid,p_environment text,p_lease timestamptz,p_checkout_id text,p_url text,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.billing_checkout_attempts set status='ready',provider_checkout_id=p_checkout_id,provider_checkout_url=p_url,provider_expires_at=p_expires_at,updated_at=now()
    where id=p_attempt and environment=p_environment and status='creating' and creation_lease_expires_at=p_lease and creation_lease_expires_at>now() and expected_expires_at=p_expires_at;
  if not found then raise exception 'BILLING_CHECKOUT_CREATION_AMBIGUOUS'; end if;
end $$;
create function public.fail_billing_checkout_attempt(p_attempt uuid,p_environment text,p_lease timestamptz,p_ambiguous boolean,p_code text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.billing_checkout_attempts set status=case when p_ambiguous then 'ambiguous' else 'failed' end,
    failed_at=case when p_ambiguous then null else now() end,error_code=p_code,provider_checkout_url=null,updated_at=now()
    where id=p_attempt and environment=p_environment and status='creating' and creation_lease_expires_at=p_lease;
end $$;
create function public.get_my_billing_checkout_state(p_attempt uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; t public.billing_checkout_attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=auth.uid();
  perform public.expire_stale_billing_checkout_attempts(a);
  select * into t from public.billing_checkout_attempts where billing_account_id=a and (p_attempt is null or id=p_attempt) order by created_at desc limit 1;
  return jsonb_build_object('checkoutAttemptId',t.id,'status',t.status,'expiresAt',t.expected_expires_at,'errorCode',t.error_code);
end $$;

create function public.get_billing_provider_store(p_environment text) returns text language sql stable security definer set search_path=pg_catalog,public as $$
  select provider_store_id from public.billing_provider_variant_mappings where environment=p_environment and status in ('active','retired') limit 1
$$;

create function public.record_billing_webhook_delivery(p_environment text,p_event_name text,p_object_type text,p_object_id text,p_payload_sha256 text,p_fingerprint text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare d uuid;
begin
  if p_fingerprint<>encode(extensions.digest(p_environment||chr(10)||p_event_name||chr(10)||p_payload_sha256,'sha256'),'hex') then raise exception 'BILLING_RECONCILIATION_FAILED'; end if;
  insert into public.billing_provider_webhook_deliveries(provider,environment,event_name,object_type,object_id,provider_subscription_id,provider_customer_id,provider_created_at,provider_updated_at,payload_sha256,delivery_fingerprint,processing_status,normalized_payload)
    values('lemonsqueezy',p_environment,p_event_name,p_object_type,p_object_id,p_payload->>'subscription_id',p_payload->>'customer_id',(p_payload->>'created_at')::timestamptz,(p_payload->>'updated_at')::timestamptz,p_payload_sha256,p_fingerprint,'received',p_payload)
    on conflict(provider,environment,delivery_fingerprint) do nothing returning id into d;
  if d is null then select id into d from public.billing_provider_webhook_deliveries where provider='lemonsqueezy' and environment=p_environment and delivery_fingerprint=p_fingerprint; end if;
  return d;
end $$;

create function public.fail_billing_webhook_delivery(p_delivery uuid) returns void language sql security definer set search_path=pg_catalog,public as $$
  update public.billing_provider_webhook_deliveries set processing_status='failed',attempt_count=attempt_count+1,last_attempt_at=now(),last_error_code='BILLING_RECONCILIATION_FAILED'
    where id=p_delivery and processing_status not in ('processed','ignored')
$$;

create function public.reconcile_billing_provider_subscription(p_delivery uuid,p_snapshot jsonb default null)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_provider_webhook_deliveries%rowtype; b public.billing_provider_subscriptions%rowtype;
  t public.billing_checkout_attempts%rowtype; m public.billing_provider_variant_mappings%rowtype;
  a uuid; local_id uuid; old_kind text; local_status text; h text; code text; sid text; stamp timestamptz; end_at timestamptz;
begin
  select * into strict d from public.billing_provider_webhook_deliveries where id=p_delivery for update;
  if d.processing_status in ('processed','ignored') then return 'replayed'; end if;
  update public.billing_provider_webhook_deliveries set attempt_count=attempt_count+1,last_attempt_at=now(),last_error_code=null where id=d.id;
  if d.event_name not in ('subscription_created','subscription_updated','subscription_cancelled','subscription_resumed','subscription_expired','subscription_paused','subscription_unpaused','subscription_payment_success','subscription_payment_failed','subscription_payment_recovered') then
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code='BILLING_WEBHOOK_UNSUPPORTED_EVENT' where id=d.id;
    return 'ignored';
  end if;
  -- Per-subscription lock followed by the same account lock used by capacity mutations.
  perform pg_advisory_xact_lock(hashtextextended('billing-subscription:'||d.environment||':'||d.provider_subscription_id,0));
  select * into b from public.billing_provider_subscriptions where provider=d.provider and environment=d.environment and provider_subscription_id=d.provider_subscription_id;
  if b.id is null and d.event_name<>'subscription_created' then
    update public.billing_provider_webhook_deliveries set processing_status='deferred',last_error_code='BILLING_RECONCILIATION_DEFERRED' where id=d.id;
    return 'deferred';
  end if;
  begin
    if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or p_snapshot - array['provider','environment','store_id','subscription_id','customer_id','order_id','order_item_id','product_id','variant_id','price_id','first_subscription_item_id','quantity','status','cancelled','renews_at','ends_at','trial_ends_at','created_at','updated_at'] <> '{}'::jsonb then raise exception 'BILLING_RECONCILIATION_FAILED'; end if;
    if p_snapshot->>'provider' is distinct from 'lemonsqueezy' or p_snapshot->>'environment' is distinct from d.environment then raise exception 'BILLING_WEBHOOK_ENVIRONMENT_MISMATCH'; end if;
    if p_snapshot->>'store_id' is distinct from public.get_billing_provider_store(d.environment) or p_snapshot->>'store_id' is distinct from d.normalized_payload->>'store_id' then raise exception 'BILLING_WEBHOOK_STORE_MISMATCH'; end if;
    sid:=p_snapshot->>'subscription_id';
    if sid is distinct from d.provider_subscription_id then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if b.id is null then
      select * into t from public.billing_checkout_attempts where id=(d.normalized_payload->>'checkout_attempt_id')::uuid;
      if t.id is null or t.billing_account_id is distinct from (d.normalized_payload->>'billing_account_id')::uuid
        or t.plan_version_id is distinct from (d.normalized_payload->>'plan_version_id')::uuid or t.environment<>d.environment
        or t.status not in ('creating','ready','ambiguous','expired')
        or (p_snapshot->>'created_at')::timestamptz not between t.created_at and t.expected_expires_at then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
      a:=t.billing_account_id;
      select * into strict m from public.billing_provider_variant_mappings where id=t.variant_mapping_id;
    else
      a:=b.billing_account_id;
      select * into strict m from public.billing_provider_variant_mappings where id=b.variant_mapping_id;
    end if;
    perform 1 from public.billing_accounts where id=a for update;
    if p_snapshot->>'customer_id' is null or exists(select 1 from public.billing_provider_customers c where c.provider=d.provider and c.environment=d.environment and
      ((c.billing_account_id=a and c.provider_customer_id<>p_snapshot->>'customer_id') or (c.provider_customer_id=p_snapshot->>'customer_id' and c.billing_account_id<>a))) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if m.environment<>d.environment or m.provider_store_id<>p_snapshot->>'store_id' or m.provider_product_id is distinct from p_snapshot->>'product_id' then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if m.status<>'active' or m.provider_variant_id is distinct from p_snapshot->>'variant_id' then raise exception 'BILLING_SUBSCRIPTION_VARIANT_MISMATCH'; end if;
    if m.provider_price_id is distinct from p_snapshot->>'price_id' then raise exception 'BILLING_SUBSCRIPTION_PRICE_MISMATCH'; end if;
    if (p_snapshot->>'quantity')::integer is distinct from 1 then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if p_snapshot->>'status'='on_trial' or p_snapshot->>'trial_ends_at' is not null then raise exception 'BILLING_SUBSCRIPTION_UNSUPPORTED_TRIAL'; end if;
    if p_snapshot->>'status' is null or p_snapshot->>'status' not in ('active','paused','past_due','unpaid','cancelled','expired') then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    stamp:=(p_snapshot->>'updated_at')::timestamptz;
    if stamp is null then raise exception 'BILLING_RECONCILIATION_FAILED'; end if;
    if b.id is not null then
      if (b.provider_customer_id,b.provider_order_id,b.provider_order_item_id,b.first_subscription_item_id,b.provider_created_at) is distinct from
        (p_snapshot->>'customer_id',p_snapshot->>'order_id',p_snapshot->>'order_item_id',p_snapshot->>'first_subscription_item_id',(p_snapshot->>'created_at')::timestamptz) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
      if stamp<b.provider_updated_at then
        update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code='BILLING_RECONCILIATION_STALE' where id=d.id;
        return 'ignored';
      end if;
    end if;
    h:=encode(extensions.digest(p_snapshot::text,'sha256'),'hex');
    if b.id is not null and stamp=b.provider_updated_at and h<>b.latest_snapshot_sha256 then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    end_at:=(case when p_snapshot->>'status' in ('cancelled','expired') then p_snapshot->>'ends_at' else p_snapshot->>'renews_at' end)::timestamptz;
    if p_snapshot->>'status' in ('active','past_due','cancelled') and end_at is null then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    local_status:=case p_snapshot->>'status' when 'past_due' then 'past_due' when 'unpaid' then 'grace' when 'expired' then 'expired'
      when 'cancelled' then case when end_at>now() then 'active' else 'expired' end else 'active' end;
    if b.id is null then
      if p_snapshot->>'status'<>'active' or (p_snapshot->>'cancelled')::boolean is distinct from false then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
      if exists(select 1 from public.account_subscriptions where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted') and subscription_kind not in ('trial','complimentary')) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
      insert into public.billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id)
        values(a,d.provider,d.environment,m.provider_store_id,p_snapshot->>'customer_id') on conflict(billing_account_id,provider,environment) do update set last_seen_at=now(),updated_at=now();
      select subscription_kind into old_kind from public.account_subscriptions where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted');
      -- Cancellation terminalizes early trial access without rewriting immutable trial dates.
      update public.account_subscriptions set status='canceled',canceled_at=now(),status_changed_at=now() where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted');
      insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at)
        values(a,m.plan_version_id,'paid','active','billing_provider',(p_snapshot->>'created_at')::timestamptz,end_at) returning id into local_id;
      insert into public.billing_provider_subscriptions(billing_account_id,account_subscription_id,variant_mapping_id,provider,environment,provider_store_id,provider_customer_id,provider_subscription_id,provider_order_id,provider_order_item_id,provider_product_id,provider_variant_id,provider_price_id,first_subscription_item_id,quantity,provider_status,provider_cancelled,provider_renews_at,provider_ends_at,provider_trial_ends_at,provider_created_at,provider_updated_at,latest_snapshot_sha256,last_reconciled_at,reconciliation_status)
        values(a,local_id,m.id,d.provider,d.environment,m.provider_store_id,p_snapshot->>'customer_id',sid,p_snapshot->>'order_id',p_snapshot->>'order_item_id',m.provider_product_id,m.provider_variant_id,m.provider_price_id,p_snapshot->>'first_subscription_item_id',1,'active',false,end_at,null,null,(p_snapshot->>'created_at')::timestamptz,stamp,h,now(),'processed');
      update public.billing_checkout_attempts set status='completed',completed_at=now(),expired_at=null,error_code=null,provider_checkout_url=null,completed_provider_subscription_id=sid,updated_at=now() where id=t.id;
      -- A delayed creation delivery may arrive after another Checkout was opened.
      update public.billing_checkout_attempts set status='expired',expired_at=now(),provider_checkout_url=null,error_code='BILLING_CHECKOUT_EXPIRED',updated_at=now()
        where billing_account_id=a and id<>t.id and status in ('creating','ready','ambiguous');
      insert into public.account_subscription_events(billing_account_id,subscription_id,event_type,to_status,source,metadata)
        values(a,local_id,'subscription.converted_to_paid','active','billing_provider',jsonb_build_object('previousKind',old_kind,'checkoutAttemptId',t.id));
    else
      local_id:=b.account_subscription_id;
      if exists(select 1 from public.account_subscriptions where billing_account_id=a and id<>local_id and status in ('trialing','trial_recovery','active','past_due','grace','restricted')) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
      if b.latest_snapshot_sha256<>h or exists(select 1 from public.account_subscriptions where id=local_id and status<>local_status) then
        update public.account_subscriptions set status=local_status,status_changed_at=now(),
          expired_at=case when local_status='expired' then now() else expired_at end,
          current_period_ends_at=end_at,cancel_at_period_end=(p_snapshot->>'status'='cancelled' and end_at>now()) where id=local_id;
        update public.billing_provider_subscriptions set provider_status=p_snapshot->>'status',provider_cancelled=(p_snapshot->>'cancelled')::boolean,
          provider_renews_at=(p_snapshot->>'renews_at')::timestamptz,provider_ends_at=(p_snapshot->>'ends_at')::timestamptz,
          provider_updated_at=stamp,latest_snapshot_sha256=h,last_reconciled_at=now(),reconciliation_status='processed',reconciliation_error_code=null,updated_at=now() where id=b.id;
      end if;
    end if;
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code=null
      where provider=d.provider and environment=d.environment and provider_subscription_id=sid and processing_status='deferred' and id<>d.id;
    update public.billing_provider_webhook_deliveries set processing_status='processed',processed_at=now(),last_error_code=null where id=d.id;
    return 'processed';
  exception when others then
    code:=sqlerrm;
    if code not in ('BILLING_WEBHOOK_ENVIRONMENT_MISMATCH','BILLING_WEBHOOK_STORE_MISMATCH','BILLING_SUBSCRIPTION_IDENTITY_MISMATCH','BILLING_SUBSCRIPTION_VARIANT_MISMATCH','BILLING_SUBSCRIPTION_PRICE_MISMATCH','BILLING_SUBSCRIPTION_UNSUPPORTED_TRIAL','BILLING_RECONCILIATION_MANUAL_REVIEW') then
      update public.billing_provider_webhook_deliveries set processing_status='failed',last_error_code='BILLING_RECONCILIATION_FAILED' where id=d.id;
      return 'failed';
    end if;
    -- All activation writes above roll back together before review metadata is saved.
    update public.billing_provider_subscriptions set reconciliation_status='manual_review',reconciliation_error_code=code where id=b.id;
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code=code where id=d.id;
    return 'ignored';
  end;
end $$;

do $$
declare n text; f record;
begin
  foreach n in array array['billing_provider_variant_mappings','billing_checkout_attempts','billing_provider_customers','billing_provider_subscriptions','billing_provider_webhook_deliveries'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
    if n in ('billing_checkout_attempts','billing_provider_customers','billing_provider_subscriptions') then
      execute format('create trigger billing_history_protection before insert or update or delete on public.%I for each row execute function public.protect_billing_provider_history()',n);
    end if;
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
    ('protect_billing_variant_mapping','protect_billing_provider_history','expire_stale_billing_checkout_attempts','begin_my_billing_checkout_attempt','get_billing_checkout_operation','complete_billing_checkout_attempt','fail_billing_checkout_attempt','get_my_billing_checkout_state','get_billing_provider_store','record_billing_webhook_delivery','fail_billing_webhook_delivery','reconcile_billing_provider_subscription') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function public.begin_my_billing_checkout_attempt(text,text,uuid,text),public.get_my_billing_checkout_state(uuid) to authenticated;
grant execute on function public.expire_stale_billing_checkout_attempts(uuid),public.get_billing_checkout_operation(uuid,uuid,text),public.complete_billing_checkout_attempt(uuid,text,timestamptz,text,text,timestamptz),public.fail_billing_checkout_attempt(uuid,text,timestamptz,boolean,text),public.get_billing_provider_store(text),public.record_billing_webhook_delivery(text,text,text,text,text,text,jsonb),public.fail_billing_webhook_delivery(uuid),public.reconcile_billing_provider_subscription(uuid,jsonb) to service_role;
commit;
