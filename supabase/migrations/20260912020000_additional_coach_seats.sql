-- PR-PRICE-09. Local schema only; no provider objects or domain data are created.
begin;

create table public.commercial_addon_versions (
  id uuid primary key default gen_random_uuid(), addon_key text not null check(addon_key='coach_seat'),
  version integer not null check(version>0), currency_code text not null check(currency_code='USD'),
  monthly_unit_amount_minor integer not null check(monthly_unit_amount_minor>0),
  annual_unit_amount_minor integer not null check(annual_unit_amount_minor>0),
  status text not null check(status in ('draft','active','retired')),
  created_at timestamptz not null default now(), retired_at timestamptz,
  unique(addon_key,version), check((status='retired')=(retired_at is not null))
);
create unique index commercial_one_active_addon on public.commercial_addon_versions(addon_key) where status='active';
insert into public.commercial_addon_versions(addon_key,version,currency_code,monthly_unit_amount_minor,annual_unit_amount_minor,status)
  values('coach_seat',1,'USD',1200,12000,'active');

create table public.billing_quantity_price_contracts (
  id uuid primary key default gen_random_uuid(), variant_mapping_id uuid not null unique references public.billing_provider_variant_mappings(id),
  addon_version_id uuid not null references public.commercial_addon_versions(id),
  status text not null check(status in ('draft','active','retired')),
  pricing_scheme text not null check(pricing_scheme='graduated'), base_quantity integer not null check(base_quantity=1),
  normalized_price_contract jsonb not null, price_contract_sha256 text not null check(price_contract_sha256 ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz not null, created_at timestamptz not null default now(), retired_at timestamptz,
  check((status='retired')=(retired_at is not null))
);
create function public.protect_billing_seat_catalogue() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare m public.billing_provider_variant_mappings%rowtype; a public.commercial_addon_versions%rowtype; expected jsonb;
begin
  if tg_op='DELETE' then raise exception 'Billing seat catalogue is immutable.'; end if;
  if tg_op='UPDATE' and (old.status='retired' or (old.status='active' and
    (new.status not in ('active','retired') or (to_jsonb(new)-array['status','retired_at']) is distinct from (to_jsonb(old)-array['status','retired_at'])))) then
    raise exception 'Billing seat catalogue is immutable.';
  end if;
  if tg_table_name='billing_quantity_price_contracts' then
    select * into strict m from public.billing_provider_variant_mappings where id=new.variant_mapping_id for share;
    select * into strict a from public.commercial_addon_versions where id=new.addon_version_id for share;
    expected:=jsonb_build_object('price_id',m.provider_price_id,'variant_id',m.provider_variant_id,'category','subscription','scheme','graduated',
      'usage_aggregation',null,'setup_fee_enabled',false,'setup_fee',null,'package_size',1,
      'trial_interval_unit',null,'trial_interval_quantity',null,'renewal_interval_unit',m.renewal_interval_unit,'renewal_interval_quantity',1,
      'tiers',jsonb_build_array(jsonb_build_object('last_unit',1,'unit_price',m.unit_amount_minor,'fixed_fee',0,'unit_price_decimal',null),
        jsonb_build_object('last_unit','inf','unit_price',case m.cadence when 'monthly' then a.monthly_unit_amount_minor else a.annual_unit_amount_minor end,'fixed_fee',0,'unit_price_decimal',null)));
    if new.normalized_price_contract is distinct from expected or new.price_contract_sha256<>encode(extensions.digest(expected::text,'sha256'),'hex') or
      (new.status='active' and (m.status<>'active' or a.status<>'active') and (tg_op='INSERT' or old.status='draft')) then
      raise exception 'BILLING_SEAT_QUANTITY_PRICE_CONTRACT_MISMATCH'; end if;
  end if;
  return new;
end $$;
create trigger commercial_addon_history before update or delete on public.commercial_addon_versions for each row execute function public.protect_billing_seat_catalogue();
create trigger billing_quantity_price_history before insert or update or delete on public.billing_quantity_price_contracts for each row execute function public.protect_billing_seat_catalogue();

alter table public.billing_provider_subscriptions drop constraint billing_provider_subscriptions_quantity_check;
alter table public.billing_provider_subscriptions add constraint billing_provider_subscriptions_quantity_check check(quantity>=1),
  add column approved_additional_coach_seats integer not null default 0 check(approved_additional_coach_seats>=0);

create table public.billing_seat_quantity_operations (
  id uuid primary key default gen_random_uuid(), operation_id uuid not null,
  billing_account_id uuid not null references public.billing_accounts(id),
  billing_provider_subscription_id uuid not null references public.billing_provider_subscriptions(id),
  account_subscription_id uuid not null, variant_mapping_id uuid not null references public.billing_provider_variant_mappings(id),
  quantity_price_contract_id uuid not null references public.billing_quantity_price_contracts(id),
  direction text not null check(direction in ('increase','reduction')), effective_timing text not null check(effective_timing in ('immediate','period_end')),
  source_additional_seats integer not null check(source_additional_seats>=0), target_additional_seats integer not null check(target_additional_seats>=0),
  source_quantity integer not null, target_quantity integer not null, source_effective_limit integer not null, target_effective_limit integer not null,
  status text not null check(status in ('requested','provider_pending','awaiting_payment','scheduled','cancel_pending','completed','canceled','failed','ambiguous','manual_review')),
  proration_mode text not null check(proration_mode in ('invoice_immediately','disable_prorations')),
  preflight_snapshot jsonb not null check(jsonb_typeof(preflight_snapshot)='object' and preflight_snapshot-array['actual','pending','reserved','committed']='{}'::jsonb),
  requested_at timestamptz not null default now(), provider_requested_at timestamptz not null,
  provider_applied_at timestamptz, payment_confirmed_at timestamptz, effective_at timestamptz,
  cancel_requested_at timestamptz, completed_at timestamptz, canceled_at timestamptz,
  provider_updated_at timestamptz, provider_snapshot_sha256 text check(provider_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  error_code text check(error_code ~ '^BILLING_SEAT_QUANTITY_[A-Z_]+$'),
  created_by_user_id uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(billing_account_id,operation_id), foreign key(billing_account_id,account_subscription_id) references public.account_subscriptions(billing_account_id,id),
  check(source_additional_seats<>target_additional_seats), check(source_quantity=1+source_additional_seats and target_quantity=1+target_additional_seats),
  check((direction='increase')=(target_additional_seats>source_additional_seats)), check((direction='increase')=(effective_timing='immediate')),
  check((effective_timing='immediate')=(proration_mode='invoice_immediately')),
  check(effective_timing<>'period_end' or effective_at is not null),
  check((status='completed')=(completed_at is not null)), check((status='canceled')=(canceled_at is not null)),
  check(status<>'completed' or (provider_applied_at is not null and (direction='reduction' or payment_confirmed_at is not null)))
);
create unique index billing_one_open_seat_quantity on public.billing_seat_quantity_operations(billing_provider_subscription_id) where status not in ('completed','canceled','failed');
create index billing_seat_account_history on public.billing_seat_quantity_operations(billing_account_id,created_at desc);
-- Existing subscription events are lifecycle-only; retain distinct append-only operation events.
create table public.billing_seat_quantity_events (
  id uuid primary key default gen_random_uuid(), operation_id uuid not null references public.billing_seat_quantity_operations(id),
  event_type text not null, occurred_at timestamptz not null default now(), unique(operation_id,event_type)
);
create function public.protect_billing_seat_operation() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.billing_provider_subscriptions%rowtype; p public.commercial_plan_versions%rowtype; c public.billing_quantity_price_contracts%rowtype;
begin
  if tg_op='DELETE' or tg_table_name='billing_seat_quantity_events' then raise exception 'Billing seat history is append-only.'; end if;
  perform 1 from public.billing_accounts where id=new.billing_account_id for update;
  if tg_op='UPDATE' then
    if old.status in ('completed','canceled','failed') and new is distinct from old then raise exception 'BILLING_SEAT_QUANTITY_OPERATION_CONFLICT'; end if;
    if (to_jsonb(new)-array['status','provider_applied_at','payment_confirmed_at','cancel_requested_at','completed_at','canceled_at','provider_updated_at','provider_snapshot_sha256','error_code','updated_at']) is distinct from
      (to_jsonb(old)-array['status','provider_applied_at','payment_confirmed_at','cancel_requested_at','completed_at','canceled_at','provider_updated_at','provider_snapshot_sha256','error_code','updated_at']) then raise exception 'BILLING_SEAT_QUANTITY_OPERATION_CONFLICT'; end if;
  end if;
  if tg_op='INSERT' then
    select * into strict b from public.billing_provider_subscriptions where id=new.billing_provider_subscription_id;
    select * into strict p from public.commercial_plan_versions where id=(select plan_version_id from public.account_subscriptions where id=new.account_subscription_id);
    select * into strict c from public.billing_quantity_price_contracts where id=new.quantity_price_contract_id for share;
    if (b.billing_account_id,b.account_subscription_id,b.variant_mapping_id,b.approved_additional_coach_seats,b.quantity) is distinct from
      (new.billing_account_id,new.account_subscription_id,new.variant_mapping_id,new.source_additional_seats,new.source_quantity) or
      c.variant_mapping_id<>new.variant_mapping_id or c.status<>'active' or new.target_additional_seats>p.max_coach_seats-p.included_coach_seats or
      new.source_effective_limit<>least(p.max_coach_seats,p.included_coach_seats+new.source_additional_seats) or
      new.target_effective_limit<>least(p.max_coach_seats,p.included_coach_seats+new.target_additional_seats) then raise exception 'BILLING_SEAT_QUANTITY_TARGET_INVALID'; end if;
    if not exists(select 1 from public.billing_accounts where id=new.billing_account_id and owner_user_id=new.created_by_user_id) then raise exception 'BILLING_SEAT_QUANTITY_OWNER_REQUIRED'; end if;
    if exists(select 1 from public.billing_plan_change_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed')) then raise exception 'BILLING_SEAT_QUANTITY_OPERATION_CONFLICT'; end if;
  end if;
  return new;
end $$;
create trigger billing_seat_history before insert or update or delete on public.billing_seat_quantity_operations for each row execute function public.protect_billing_seat_operation();
create trigger billing_seat_event_history before update or delete on public.billing_seat_quantity_events for each row execute function public.protect_billing_seat_operation();
create function public.audit_billing_seat_operation() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.billing_seat_quantity_events(operation_id,event_type) values(new.id,'billing.seat_'||new.status) on conflict do nothing;
  if new.error_code is not null then insert into public.billing_seat_quantity_events(operation_id,event_type) values(new.id,new.error_code) on conflict do nothing; end if;
  return new;
end $$;
create trigger billing_seat_audit after insert or update on public.billing_seat_quantity_operations for each row execute function public.audit_billing_seat_operation();

create function public.billing_seat_effective_limit(p_account uuid,p_growth boolean default false) returns integer language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e jsonb:=public.resolve_account_entitlements(p_account); b public.billing_provider_subscriptions%rowtype; o public.billing_seat_quantity_operations%rowtype; n integer; lim integer;
begin
  lim:=(e#>>'{limits,maxCoachSeats}')::integer;
  if e#>>'{subscription,kind}' is distinct from 'paid' then return lim; end if;
  select * into b from public.billing_provider_subscriptions where billing_account_id=p_account and account_subscription_id=(e#>>'{subscription,id}')::uuid;
  n:=coalesce(b.approved_additional_coach_seats,0);
  select * into o from public.billing_seat_quantity_operations where billing_provider_subscription_id=b.id and direction='reduction' and status not in ('completed','canceled','failed');
  if o.id is not null and (p_growth or (o.status='scheduled' and o.effective_at<=now())) then n:=least(n,o.target_additional_seats); end if;
  return least(lim,(e#>>'{limits,includedCoachSeats}')::integer+n);
end $$;

create function public.billing_seat_quantity_context(p_owner uuid,p_environment text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb;
begin
  begin ctx:=public.billing_plan_change_context(p_owner,p_environment);
  exception when others then
    if sqlerrm='BILLING_PLAN_CHANGE_OWNER_REQUIRED' then raise exception 'BILLING_SEAT_QUANTITY_OWNER_REQUIRED' using errcode='42501'; end if;
    raise exception 'BILLING_SEAT_QUANTITY_NOT_ELIGIBLE';
  end;
  return ctx;
end $$;

create function public.preview_billing_seat_quantity(p_owner uuid,p_environment text,p_target integer,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; b public.billing_provider_subscriptions%rowtype; s public.account_subscriptions%rowtype; m public.billing_provider_variant_mappings%rowtype;
  p public.commercial_plan_versions%rowtype; a public.commercial_addon_versions%rowtype; c public.billing_quantity_price_contracts%rowtype;
  d jsonb; code text; lim integer; unit integer; direction text;
begin
  ctx:=public.billing_seat_quantity_context(p_owner,p_environment);
  perform 1 from public.billing_accounts where id=(ctx#>>'{subscription,billing_account_id}')::uuid for update;
  ctx:=public.billing_seat_quantity_context(p_owner,p_environment);
  b:=jsonb_populate_record(null::public.billing_provider_subscriptions,ctx->'subscription'); s:=jsonb_populate_record(null::public.account_subscriptions,ctx->'local'); m:=jsonb_populate_record(null::public.billing_provider_variant_mappings,ctx->'mapping');
  select * into strict p from public.commercial_plan_versions where id=s.plan_version_id;
  select * into c from public.billing_quantity_price_contracts where variant_mapping_id=m.id for share;
  select * into a from public.commercial_addon_versions where id=c.addon_version_id;
  if p_target is null or p_target<0 or p_target>p.max_coach_seats-p.included_coach_seats then raise exception 'BILLING_SEAT_QUANTITY_TARGET_INVALID'; end if;
  if s.status<>'active' or s.cancel_at_period_end or b.provider_status<>'active' or b.provider_cancelled or b.reconciliation_status<>'processed' or
    p_snapshot->>'status' is distinct from 'active' or (p_snapshot->>'cancelled')::boolean is distinct from false or p_snapshot->>'trial_ends_at' is not null then code:='BILLING_SEAT_QUANTITY_NOT_ELIGIBLE'; end if;
  if m.status<>'active' or c.id is null or c.status<>'active' or a.status<>'active' then code:='BILLING_SEAT_QUANTITY_MAPPING_UNAVAILABLE'; end if;
  if b.first_subscription_item_id is null then code:='BILLING_SEAT_QUANTITY_ITEM_MISSING'; end if;
  if p_snapshot->>'payment_processor' is distinct from 'card' then code:=case when p_snapshot->>'payment_processor'='paypal' then 'BILLING_SEAT_QUANTITY_PAYPAL_UNSUPPORTED' else 'BILLING_SEAT_QUANTITY_NOT_ELIGIBLE' end; end if;
  if (p_snapshot->>'provider',p_snapshot->>'environment',p_snapshot->>'store_id',p_snapshot->>'subscription_id',p_snapshot->>'customer_id',p_snapshot->>'order_id',p_snapshot->>'order_item_id',p_snapshot->>'product_id',p_snapshot->>'variant_id',p_snapshot->>'price_id',p_snapshot->>'first_subscription_item_id') is distinct from
    (b.provider,b.environment,b.provider_store_id,b.provider_subscription_id,b.provider_customer_id,b.provider_order_id,b.provider_order_item_id,m.provider_product_id,m.provider_variant_id,m.provider_price_id,b.first_subscription_item_id) or
    (p_snapshot->>'created_at')::timestamptz is distinct from b.provider_created_at or (p_snapshot->>'updated_at') is null or (p_snapshot->>'updated_at')::timestamptz<b.provider_updated_at or
    (p_snapshot->>'quantity')::integer is distinct from 1+b.approved_additional_coach_seats or b.quantity<>1+b.approved_additional_coach_seats then code:='BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT'; end if;
  if exists(select 1 from public.billing_plan_change_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed')) or
    exists(select 1 from public.billing_seat_quantity_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed')) then code:='BILLING_SEAT_QUANTITY_OPERATION_CONFLICT'; end if;
  select value into d from jsonb_array_elements(public.resolve_account_capacity(p_owner,b.billing_account_id)->'dimensions') where value->>'key'='coach_seats';
  lim:=least(p.max_coach_seats,p.included_coach_seats+p_target);
  direction:=case when p_target>b.approved_additional_coach_seats then 'increase' when p_target<b.approved_additional_coach_seats then 'reduction' else 'no-op' end;
  if direction='reduction' and ((d->>'committed')::integer>lim or (d->>'dataQualityIssue')::boolean) then code:='BILLING_SEAT_QUANTITY_CAPACITY_BLOCKED'; end if;
  if direction='reduction' and (s.current_period_ends_at is null or s.current_period_ends_at<=clock_timestamp() or (p_snapshot->>'renews_at')::timestamptz is distinct from s.current_period_ends_at) then code:='BILLING_SEAT_QUANTITY_NOT_ELIGIBLE'; end if;
  unit:=case m.cadence when 'monthly' then coalesce(a.monthly_unit_amount_minor,1200) else coalesce(a.annual_unit_amount_minor,12000) end;
  return jsonb_build_object('planKey',p.plan_key,'cadence',m.cadence,'includedSeats',p.included_coach_seats,'currentAdditionalSeats',b.approved_additional_coach_seats,
    'targetAdditionalSeats',p_target,'maximumSeats',p.max_coach_seats,'maximumAdditionalSeats',p.max_coach_seats-p.included_coach_seats,'currentProviderQuantity',b.quantity,'targetProviderQuantity',1+p_target,
    'currentEffectiveLimit',public.billing_seat_effective_limit(b.billing_account_id),'targetEffectiveLimit',lim,'actual',d->'actual','pending',d->'pending','reserved',d->'reserved','committed',d->'committed',
    'direction',direction,'timing',case when direction='reduction' then 'period_end' else 'immediate' end,'effectiveAt',case when direction='reduction' then s.current_period_ends_at else null end,
    'unitPriceMinor',unit,'currentTotalMinor',m.unit_amount_minor+unit*b.approved_additional_coach_seats,'targetTotalMinor',m.unit_amount_minor+unit*p_target,'currency','USD',
    'capacityBlocked',direction='reduction' and (d->>'committed')::integer>lim,'eligible',code is null,'errorCode',code,
    'disclosure','Recurring list prices exclude provider-calculated proration, taxes and credits. Increased capacity requires verified payment. Reductions take effect at renewal and limit new invitations immediately.');
end $$;

create function public.begin_billing_seat_quantity(p_owner uuid,p_environment text,p_target integer,p_operation uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; b public.billing_provider_subscriptions%rowtype; v jsonb; o public.billing_seat_quantity_operations%rowtype;
begin
  ctx:=public.billing_seat_quantity_context(p_owner,p_environment);
  perform 1 from public.billing_accounts where id=(ctx#>>'{subscription,billing_account_id}')::uuid for update;
  ctx:=public.billing_seat_quantity_context(p_owner,p_environment); b:=jsonb_populate_record(null::public.billing_provider_subscriptions,ctx->'subscription');
  select * into o from public.billing_seat_quantity_operations where billing_account_id=b.billing_account_id and operation_id=p_operation;
  if o.id is not null then
    if o.target_additional_seats is distinct from p_target then raise exception 'BILLING_SEAT_QUANTITY_OPERATION_CONFLICT'; end if;
    return jsonb_build_object('id',o.id,'dispatch',false);
  end if;
  v:=public.preview_billing_seat_quantity(p_owner,p_environment,p_target,p_snapshot);
  if v->>'errorCode' is not null then raise exception '%',v->>'errorCode'; end if;
  if v->>'direction'='no-op' then return jsonb_build_object('dispatch',false); end if;
  insert into public.billing_seat_quantity_operations(operation_id,billing_account_id,billing_provider_subscription_id,account_subscription_id,variant_mapping_id,quantity_price_contract_id,
    direction,effective_timing,source_additional_seats,target_additional_seats,source_quantity,target_quantity,source_effective_limit,target_effective_limit,status,proration_mode,preflight_snapshot,provider_requested_at,effective_at,created_by_user_id)
    values(p_operation,b.billing_account_id,b.id,b.account_subscription_id,b.variant_mapping_id,(select id from public.billing_quantity_price_contracts where variant_mapping_id=b.variant_mapping_id),
      v->>'direction',v->>'timing',b.approved_additional_coach_seats,p_target,b.quantity,1+p_target,(v->>'currentEffectiveLimit')::integer,(v->>'targetEffectiveLimit')::integer,'provider_pending',
      case when v->>'direction'='increase' then 'invoice_immediately' else 'disable_prorations' end,
      jsonb_build_object('actual',v->'actual','pending',v->'pending','reserved',v->'reserved','committed',v->'committed'),clock_timestamp(),(v->>'effectiveAt')::timestamptz,p_owner) returning * into o;
  return jsonb_build_object('id',o.id,'dispatch',true,'quantity',o.target_quantity,'timing',o.effective_timing);
end $$;

create function public.begin_cancel_billing_seat_quantity(p_owner uuid,p_environment text,p_operation uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; o public.billing_seat_quantity_operations%rowtype;
begin
  ctx:=public.billing_seat_quantity_context(p_owner,p_environment);
  perform 1 from public.billing_accounts where id=(ctx#>>'{subscription,billing_account_id}')::uuid for update;
  select * into o from public.billing_seat_quantity_operations where id=p_operation and billing_provider_subscription_id=(ctx#>>'{subscription,id}')::uuid for update;
  if o.status='canceled' then return jsonb_build_object('id',o.id,'dispatch',false); end if;
  if o.id is null or o.status<>'scheduled' or o.direction<>'reduction' or o.effective_at<=clock_timestamp() then raise exception 'BILLING_SEAT_QUANTITY_CANNOT_CANCEL'; end if;
  update public.billing_seat_quantity_operations set status='cancel_pending',cancel_requested_at=clock_timestamp(),updated_at=now() where id=o.id;
  return jsonb_build_object('id',o.id,'dispatch',true,'quantity',o.source_quantity,'timing','period_end');
end $$;

create function public.fail_billing_seat_quantity(p_owner uuid,p_operation uuid,p_ambiguous boolean) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform 1 from public.billing_accounts where owner_user_id=p_owner for update;
  update public.billing_seat_quantity_operations set status=case when status='cancel_pending' then status when p_ambiguous then 'ambiguous' else 'failed' end,
    error_code=case when p_ambiguous then 'BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS' else 'BILLING_SEAT_QUANTITY_PROVIDER_FAILED' end,updated_at=now()
    where id=p_operation and created_by_user_id=p_owner and status in ('provider_pending','cancel_pending');
end $$;

create function public.apply_verified_billing_seat_quantity(p_subscription uuid,p_snapshot jsonb,p_event text,p_invoice jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.billing_provider_subscriptions%rowtype; o public.billing_seat_quantity_operations%rowtype; paid boolean; due boolean; q integer:=(p_snapshot->>'quantity')::integer;
begin
  select * into strict b from public.billing_provider_subscriptions where id=p_subscription;
  select * into o from public.billing_seat_quantity_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed') for update;
  if o.id is null then return; end if;
  if (p_snapshot->>'updated_at')::timestamptz<o.provider_requested_at then return; end if;
  if not exists(select 1 from public.billing_quantity_price_contracts where id=o.quantity_price_contract_id and variant_mapping_id=b.variant_mapping_id and status in ('active','retired')) then raise exception 'BILLING_SEAT_QUANTITY_PRICE_CONTRACT_MISMATCH'; end if;
  if o.status='cancel_pending' and q=o.source_quantity and (p_snapshot->>'updated_at')::timestamptz>=o.cancel_requested_at then
    update public.billing_seat_quantity_operations set status='canceled',canceled_at=now(),error_code=null,updated_at=now() where id=o.id; return;
  end if;
  if q<>o.target_quantity then return; end if;
  if o.direction='reduction' and now()<o.effective_at and p_snapshot->>'status' in ('active','past_due','unpaid') and (p_snapshot->>'renews_at')::timestamptz is distinct from o.effective_at then raise exception 'BILLING_SEAT_QUANTITY_MANUAL_REVIEW'; end if;
  paid:=o.direction='increase' and p_event in ('subscription_payment_success','subscription_payment_recovered') and p_invoice->>'status'='paid' and p_invoice->>'billing_reason'='updated'
    and (p_invoice->>'subscription_id',p_invoice->>'customer_id',p_invoice->>'store_id')=(b.provider_subscription_id,b.provider_customer_id,b.provider_store_id)
    and (p_invoice->>'test_mode')::boolean=(b.environment='test') and (p_invoice->>'created_at')::timestamptz>o.provider_requested_at and (p_invoice->>'updated_at')::timestamptz>o.provider_requested_at;
  due:=o.direction='reduction' and now()>=o.effective_at and o.status<>'cancel_pending';
  update public.billing_seat_quantity_operations set status=case when status='cancel_pending' then status when direction='increase' then 'awaiting_payment' else 'scheduled' end,
    provider_applied_at=coalesce(provider_applied_at,now()),provider_updated_at=(p_snapshot->>'updated_at')::timestamptz,provider_snapshot_sha256=encode(extensions.digest(p_snapshot::text,'sha256'),'hex'),
    error_code=case when p_event='subscription_payment_failed' then 'BILLING_SEAT_QUANTITY_PAYMENT_FAILED' when error_code='BILLING_SEAT_QUANTITY_PAYMENT_FAILED' then error_code when direction='increase' then 'BILLING_SEAT_QUANTITY_AWAITING_PAYMENT' else null end,updated_at=now() where id=o.id;
  if (coalesce(paid,false) or coalesce(due,false)) and p_snapshot->>'status'='active' and (p_snapshot->>'cancelled')::boolean=false and
    exists(select 1 from public.account_subscriptions where id=b.account_subscription_id and subscription_kind='paid' and status in ('active','past_due','grace') and not cancel_at_period_end) then
    update public.billing_provider_subscriptions set approved_additional_coach_seats=o.target_additional_seats where id=b.id;
    update public.billing_seat_quantity_operations set status='completed',completed_at=now(),payment_confirmed_at=case when paid then now() else null end,error_code=null,updated_at=now() where id=o.id;
  end if;
end $$;

create function public.get_my_billing_seat_quantity_state() returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare a uuid; b public.billing_provider_subscriptions%rowtype; p public.commercial_plan_versions%rowtype; m public.billing_provider_variant_mappings%rowtype; o public.billing_seat_quantity_operations%rowtype; d jsonb; unit integer;
begin
  if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null) then raise exception 'BILLING_SEAT_QUANTITY_OWNER_REQUIRED' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=auth.uid();
  select bp.* into b from public.billing_provider_subscriptions bp join public.account_subscriptions s on s.id=bp.account_subscription_id where bp.billing_account_id=a and s.status<>'superseded' order by s.created_at desc limit 1;
  if b.id is null then return jsonb_build_object('available',false,'summary',null,'operation',null); end if;
  select * into m from public.billing_provider_variant_mappings where id=b.variant_mapping_id;
  select * into p from public.commercial_plan_versions where id=(select plan_version_id from public.account_subscriptions where id=b.account_subscription_id);
  select * into o from public.billing_seat_quantity_operations where billing_provider_subscription_id=b.id order by created_at desc,id desc limit 1;
  select value into d from jsonb_array_elements(public.resolve_account_capacity(auth.uid(),a)->'dimensions') where value->>'key'='coach_seats';
  select case m.cadence when 'monthly' then av.monthly_unit_amount_minor else av.annual_unit_amount_minor end into unit from public.billing_quantity_price_contracts c join public.commercial_addon_versions av on av.id=c.addon_version_id where c.variant_mapping_id=m.id;
  unit:=coalesce(unit,case m.cadence when 'monthly' then 1200 else 12000 end);
  return jsonb_build_object('available',true,'summary',jsonb_build_object('planKey',p.plan_key,'cadence',m.cadence,'includedSeats',p.included_coach_seats,'currentAdditionalSeats',b.approved_additional_coach_seats,
    'maximumSeats',p.max_coach_seats,'maximumAdditionalSeats',p.max_coach_seats-p.included_coach_seats,'currentEffectiveLimit',public.billing_seat_effective_limit(a),'growthLimit',public.billing_seat_effective_limit(a,true),
    'actual',d->'actual','pending',d->'pending','reserved',d->'reserved','committed',d->'committed','unitPriceMinor',unit,'currentTotalMinor',m.unit_amount_minor+unit*b.approved_additional_coach_seats,
    'manualReview',b.reconciliation_status='manual_review'),
    'operation',case when o.id is null then null else jsonb_build_object('id',o.id,'status',o.status,'direction',o.direction,'targetAdditionalSeats',o.target_additional_seats,'effectiveAt',o.effective_at,'errorCode',o.error_code) end);
end $$;

-- Forward replacements of existing resolvers and reconciler follow below.


create or replace function public.protect_billing_provider_history() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare m public.billing_provider_variant_mappings%rowtype;
begin
  if tg_op='DELETE' then raise exception 'Billing history cannot be deleted.'; end if;
  if tg_table_name='billing_provider_customers' and tg_op='UPDATE' and
    (to_jsonb(new)-array['last_seen_at','updated_at']) is distinct from (to_jsonb(old)-array['last_seen_at','updated_at']) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
  if tg_table_name='billing_checkout_attempts' then
    -- Sale admission records an approved mapping while it is active. Hold the
    -- mapping lock through insertion so retirement cannot race this proof.
    if tg_op='INSERT' then
      select * into strict m from public.billing_provider_variant_mappings where id=new.variant_mapping_id for share;
      if m.status<>'active' then raise exception 'BILLING_VARIANT_MAPPING_UNAVAILABLE'; end if;
    end if;
    if tg_op='UPDATE' and (to_jsonb(new)-array['status','provider_checkout_id','provider_checkout_url','provider_expires_at','completed_provider_subscription_id','error_code','updated_at','completed_at','failed_at','expired_at']) is distinct from
      (to_jsonb(old)-array['status','provider_checkout_id','provider_checkout_url','provider_expires_at','completed_provider_subscription_id','error_code','updated_at','completed_at','failed_at','expired_at']) then raise exception 'BILLING_CHECKOUT_OPERATION_CONFLICT'; end if;
    if not exists(select 1 from public.billing_accounts where id=new.billing_account_id and owner_user_id=new.created_by_user_id) then raise exception 'BILLING_FORBIDDEN'; end if;
  end if;
  if tg_table_name='billing_provider_subscriptions' then
    if tg_op='UPDATE' and new.approved_additional_coach_seats<>old.approved_additional_coach_seats and not exists(
      select 1 from public.billing_seat_quantity_operations o where o.billing_provider_subscription_id=new.id
        and o.source_additional_seats=old.approved_additional_coach_seats and o.target_additional_seats=new.approved_additional_coach_seats
        and o.status in ('awaiting_payment','scheduled')) then raise exception 'BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT'; end if;
    if tg_op='UPDATE' and (to_jsonb(new)-array['quantity','approved_additional_coach_seats','account_subscription_id','variant_mapping_id','provider_product_id','provider_variant_id','provider_price_id','provider_status','provider_cancelled','provider_renews_at','provider_ends_at','provider_trial_ends_at','provider_updated_at','latest_snapshot_sha256','last_reconciled_at','reconciliation_status','reconciliation_error_code','updated_at']) is distinct from
      (to_jsonb(old)-array['quantity','approved_additional_coach_seats','account_subscription_id','variant_mapping_id','provider_product_id','provider_variant_id','provider_price_id','provider_status','provider_cancelled','provider_renews_at','provider_ends_at','provider_trial_ends_at','provider_updated_at','latest_snapshot_sha256','last_reconciled_at','reconciliation_status','reconciliation_error_code','updated_at']) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    select * into strict m from public.billing_provider_variant_mappings where id=new.variant_mapping_id;
    if (new.provider,new.environment,new.provider_store_id,new.provider_product_id,new.provider_variant_id,new.provider_price_id) is distinct from
      (m.provider,m.environment,m.provider_store_id,m.provider_product_id,m.provider_variant_id,m.provider_price_id) then raise exception 'BILLING_VARIANT_MAPPING_MISMATCH'; end if;
    if new.account_subscription_id is not null and not exists(select 1 from public.account_subscriptions where id=new.account_subscription_id and billing_account_id=new.billing_account_id
      and subscription_kind='paid' and (plan_version_id=m.plan_version_id or exists(
      select 1 from public.billing_plan_change_operations o where o.billing_provider_subscription_id=new.id
        and o.source_account_subscription_id=new.account_subscription_id and o.target_variant_mapping_id=new.variant_mapping_id
        and o.status in ('provider_pending','awaiting_payment','scheduled','cancel_pending','ambiguous','manual_review')))) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if tg_op='UPDATE' and ((old.variant_mapping_id is distinct from new.variant_mapping_id) or (old.account_subscription_id is distinct from new.account_subscription_id)) and not exists(
      select 1 from public.billing_plan_change_operations o where o.billing_provider_subscription_id=new.id
      and o.status not in ('completed','canceled','failed') and (
        (new.variant_mapping_id=o.target_variant_mapping_id and old.variant_mapping_id in (o.source_variant_mapping_id,o.target_variant_mapping_id)
          and (new.account_subscription_id=o.source_account_subscription_id or exists(select 1 from public.account_subscriptions s where s.id=o.source_account_subscription_id and s.superseded_by_subscription_id=new.account_subscription_id)))
        or (o.status='cancel_pending' and new.variant_mapping_id=o.source_variant_mapping_id and new.account_subscription_id=o.source_account_subscription_id))) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
  end if;
  return new;
end $$;

create or replace function public.resolve_account_capacity(p_owner uuid,p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare e jsonb := public.resolve_account_entitlements(p_account); t timestamptz := transaction_timestamp(); dims jsonb;
begin
  with subjects as materialized (
    select dimension,subject_key,bool_and(pending) pending,bool_or(data_quality_issue) quality
    from public.account_capacity_subjects(p_owner,t) group by dimension,subject_key
  ), raw_reservations as materialized (
    select * from public.account_capacity_reservations where billing_account_id=p_account and status='active' and expires_at>t
  ), email_identities as materialized (
    select public.account_capacity_email_key(u.email) email_key,min(u.id::text) user_id from auth.users u
    where exists(select 1 from raw_reservations where left(subject_key,6)='email:')
    group by public.account_capacity_email_key(u.email)
  ), reservations as (
    select r.dimension,coalesce('user:' || e.user_id,'user:' || c.user_id,r.subject_key) subject_key,max(r.quantity) quantity
    from raw_reservations r
    left join email_identities e on e.email_key=r.subject_key and r.dimension in ('counted_clients','coach_seats')
    left join public.clients c on c.id=case when left(r.subject_key,7)='client:' and r.dimension='counted_clients' then substring(r.subject_key from 8)::uuid end
    group by r.dimension,coalesce('user:' || e.user_id,'user:' || c.user_id,r.subject_key)
  ), keys(key,limit_key,ordinal) as (values ('counted_clients','countedClients',1),('coach_seats','maxCoachSeats',2),('active_workspaces','activeWorkspaces',3),('published_packages','publishedPackages',4))
  select jsonb_agg(public.account_capacity_dimension(k.key,
    (select count(*) from subjects s where s.dimension=k.key and not s.pending),
    (select count(*) from subjects s where s.dimension=k.key and s.pending),
    coalesce((select sum(r.quantity) from reservations r where r.dimension=k.key and not exists(select 1 from subjects s where s.dimension=r.dimension and s.subject_key=r.subject_key)),0),
    public.billing_plan_change_capacity_limit(p_account,k.key,case when k.key='coach_seats' then public.billing_seat_effective_limit(p_account) else (e->'limits'->>k.limit_key)::integer end),e#>>'{subscription,effectiveStatus}' <> 'no_subscription',
    coalesce((select bool_or(s.quality) from subjects s where s.dimension=k.key),false)
      or (k.key='counted_clients' and exists(select 1 from public.invites i join public.workspaces w on w.id=i.workspace_id
        where w.owner_user_id=p_owner and i.role::text='client' and i.max_uses=1 and i.uses=0 and i.used_at is null and (i.expires_at is null or i.expires_at>t))),
    least((e#>>'{limits,includedCoachSeats}')::integer,public.billing_plan_change_capacity_limit(p_account,'coach_seats',(e#>>'{limits,maxCoachSeats}')::integer))) order by k.ordinal) into dims from keys k;
  return jsonb_build_object('schemaVersion',1,'billingAccountId',p_account,'ownerUserId',p_owner,
    'subscription',e->'subscription','dimensions',dims,'hasAnyDataQualityIssue',exists(select 1 from jsonb_array_elements(dims) d where (d->>'dataQualityIssue')::boolean),'computedAt',t);
end;
$$;

create or replace function public.reserve_account_capacity(p_billing_account_id uuid,p_dimension text,p_quantity integer,p_idempotency_key text,p_subject_type text,p_subject_key text,p_workspace_id uuid default null,p_source text default null,p_expires_at timestamptz default null,p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions
as $$
declare a public.billing_accounts%rowtype; r public.account_capacity_reservations%rowtype; d jsonb; s jsonb;
  t timestamptz := transaction_timestamp(); h text; canonical text; delta bigint; reason text;
begin
  perform public.validate_account_capacity_metadata(p_source,p_metadata);
  if p_dimension is null or p_dimension not in ('counted_clients','coach_seats','active_workspaces','published_packages') or p_quantity is null or p_quantity<=0
    or p_idempotency_key is null or btrim(p_idempotency_key)='' or length(p_idempotency_key)>200
    or p_subject_type is null or p_subject_type not in ('user','client','email','workspace','package','operation') or p_subject_key is null
    or not (p_subject_key ~ ('^' || p_subject_type || ':' || case when p_subject_type='email' then '[0-9a-f]{64}' else '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' end || '$'))
    or (p_subject_type <> 'operation' and p_quantity<>1)
    or (p_dimension='counted_clients' and p_subject_type not in ('user','client','email','operation'))
    or (p_dimension='coach_seats' and p_subject_type not in ('user','email','operation'))
    or (p_dimension='active_workspaces' and p_subject_type not in ('workspace','operation'))
    or (p_dimension='published_packages' and p_subject_type not in ('package','operation')) then raise exception 'Invalid reservation.' using errcode='22023'; end if;
  select * into a from public.billing_accounts where id=p_billing_account_id for update;
  if not found then raise exception 'Unknown billing account.' using errcode='22023'; end if;
  -- VOLATILE statements after the lock see prior writers under READ COMMITTED.
  select * into r from public.account_capacity_reservations where billing_account_id=a.id and dimension=p_dimension and idempotency_key=p_idempotency_key;
  if found then
    if (r.quantity,r.subject_type,r.subject_key,r.workspace_id) is distinct from (p_quantity,p_subject_type,p_subject_key,p_workspace_id) then raise exception 'Idempotency payload conflict.' using errcode='22023'; end if;
    return jsonb_build_object('granted',true,'reservationId',r.id,'status',r.status,'expiresAt',r.expires_at);
  end if;
  h := encode(extensions.digest(p_idempotency_key,'sha256'),'hex');
  select metadata->>'reasonCode' into reason from public.account_capacity_events where billing_account_id=a.id and dimension=p_dimension and event_type='capacity.reservation_denied' and metadata->>'idempotencyHash'=h;
  if found then return jsonb_build_object('granted',false,'reservationId',null,'reasonCode',reason); end if;
  if p_expires_at is null or p_expires_at<=t or p_expires_at>t+interval '5 minutes' then raise exception 'Reservation TTL must be positive and at most five minutes.' using errcode='22023'; end if;
  if p_workspace_id is not null and not exists(select 1 from public.workspaces where id=p_workspace_id and owner_user_id=a.owner_user_id) then raise exception 'Workspace is outside account.' using errcode='22023'; end if;
  canonical := public.account_capacity_subject_key(p_dimension,p_subject_key);
  s := public.resolve_account_capacity(a.owner_user_id,a.id);
  select value into d from jsonb_array_elements(s->'dimensions') where value->>'key'=p_dimension;
  -- Match aliases to the one requested identity, rather than re-hashing every
  -- auth user for every existing email reservation.
  delta := greatest(p_quantity-coalesce((select max(held.quantity) from public.account_capacity_reservations held
    where held.billing_account_id=a.id and held.dimension=p_dimension and held.status='active' and held.expires_at>t
      and (held.subject_key=canonical or (left(canonical,5)='user:' and (
        held.subject_key=(select public.account_capacity_email_key(u.email) from auth.users u
          where u.id=case when left(canonical,5)='user:' then substring(canonical from 6)::uuid end)
        or (p_dimension='counted_clients' and held.subject_type='client' and exists(
          select 1 from public.clients c where 'client:' || c.id=held.subject_key and 'user:' || c.user_id=canonical))
      )))),0),0);
  if exists(select 1 from public.account_capacity_subjects(a.owner_user_id,t) x where x.dimension=p_dimension and x.subject_key=canonical) then delta:=0; end if;
  if p_dimension='coach_seats' then d:=jsonb_set(d,'{limit}',to_jsonb(least((d->>'limit')::integer,public.billing_seat_effective_limit(a.id,true)))); end if;
  if d->>'state'='unavailable' or ((d->>'limit')::integer is not null and (d->>'committed')::bigint+delta>(d->>'limit')::integer) then
    reason := case when d->>'state'='unavailable' then 'capacity_unavailable' else 'capacity_would_exceed' end;
    insert into public.account_capacity_events(billing_account_id,dimension,event_type,quantity,source,metadata)
      values(a.id,p_dimension,'capacity.reservation_denied',p_quantity,p_source,p_metadata || jsonb_build_object('idempotencyHash',h,'reasonCode',reason));
    return jsonb_build_object('granted',false,'reservationId',null,'reasonCode',reason);
  end if;
  insert into public.account_capacity_reservations(billing_account_id,dimension,quantity,idempotency_key,subject_type,subject_key,workspace_id,source,expires_at,metadata,created_by_user_id,admission_transaction_id)
    values(a.id,p_dimension,p_quantity,p_idempotency_key,p_subject_type,p_subject_key,p_workspace_id,p_source,p_expires_at,p_metadata,auth.uid(),case when p_source='domain.admission' then pg_current_xact_id() end) returning * into r;
  insert into public.account_capacity_events(billing_account_id,reservation_id,dimension,event_type,quantity,source,metadata)
    values(a.id,r.id,p_dimension,'capacity.reservation_created',p_quantity,p_source,p_metadata);
  return jsonb_build_object('granted',true,'reservationId',r.id,'status',r.status,'expiresAt',r.expires_at);
end;
$$;

create or replace function public.evaluate_my_capacity_change(p_dimension text,p_quantity integer default 1)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare s jsonb; d jsonb; projected jsonb; allowed boolean; reason text;
begin
  if p_dimension is null or p_dimension not in ('counted_clients','coach_seats','active_workspaces','published_packages') or p_quantity is null or p_quantity<=0 then raise exception 'Invalid capacity change.' using errcode='22023'; end if;
  s := public.get_my_account_capacity_snapshot();
  select value into d from jsonb_array_elements(s->'dimensions') where value->>'key'=p_dimension;
  if p_dimension='coach_seats' then d:=jsonb_set(d,'{limit}',to_jsonb(least((d->>'limit')::integer,public.billing_seat_effective_limit((s->>'billingAccountId')::uuid,true)))); end if;
  projected := public.account_capacity_dimension(p_dimension,(d->>'committed')::bigint+p_quantity,0,0,(d->>'limit')::integer,d->>'state'<>'unavailable',false);
  allowed := case when d->>'state'='unavailable' then null else projected->>'state'<>'over_limit' end;
  reason := case when d->>'state'='unavailable' then 'capacity_unavailable' when d->>'state'='unlimited' then 'capacity_unlimited'
    when d->>'state'='over_limit' then 'capacity_already_over_limit' when not allowed then 'capacity_would_exceed' else 'capacity_available' end;
  return jsonb_build_object('dimension',p_dimension,'currentCommitted',d->'committed','proposedQuantity',p_quantity,
    'projectedCommitted',projected->'committed','limit',d->'limit','currentState',d->'state','projectedState',projected->'state',
    'allowedUnderCurrentContract',allowed,'reasonCode',reason,'computedAt',s->'computedAt');
end;
$$;

create or replace function public.preview_billing_plan_change(p_owner uuid,p_environment text,p_target_plan text,p_target_cadence text,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; b public.billing_provider_subscriptions%rowtype; s public.account_subscriptions%rowtype; m public.billing_provider_variant_mappings%rowtype; t public.billing_provider_variant_mappings%rowtype; c jsonb; pf jsonb; source_key text;
begin
  ctx:=public.billing_plan_change_context(p_owner,p_environment);
  b:=jsonb_populate_record(null::public.billing_provider_subscriptions,ctx->'subscription'); s:=jsonb_populate_record(null::public.account_subscriptions,ctx->'local'); m:=jsonb_populate_record(null::public.billing_provider_variant_mappings,ctx->'mapping');
  perform 1 from public.billing_accounts where id=b.billing_account_id for update;
  if p_snapshot->>'payment_processor'='paypal' then raise exception 'BILLING_PLAN_CHANGE_PAYPAL_UNSUPPORTED'; end if;
  if p_snapshot->>'payment_processor' is distinct from 'card' or p_snapshot->>'status' is distinct from 'active' or (p_snapshot->>'cancelled')::boolean is distinct from false or
    s.status<>'active' or s.cancel_at_period_end or b.provider_status<>'active' or b.reconciliation_status<>'processed' then raise exception 'BILLING_PLAN_CHANGE_NOT_ELIGIBLE'; end if;
  if (p_snapshot->>'provider',p_snapshot->>'environment',p_snapshot->>'store_id',p_snapshot->>'subscription_id',p_snapshot->>'customer_id',p_snapshot->>'product_id',p_snapshot->>'variant_id',p_snapshot->>'price_id',p_snapshot->>'order_id',p_snapshot->>'order_item_id',p_snapshot->>'first_subscription_item_id') is distinct from
    (b.provider,b.environment,b.provider_store_id,b.provider_subscription_id,b.provider_customer_id,m.provider_product_id,m.provider_variant_id,m.provider_price_id,b.provider_order_id,b.provider_order_item_id,b.first_subscription_item_id) or
    (p_snapshot->>'quantity')::integer is distinct from 1+b.approved_additional_coach_seats or p_snapshot->>'trial_ends_at' is not null or (p_snapshot->>'updated_at')::timestamptz<b.provider_updated_at or
    (p_snapshot->>'updated_at') is null or (p_snapshot->>'created_at')::timestamptz is distinct from b.provider_created_at or
    m.plan_version_id<>s.plan_version_id or m.status not in ('active','retired') then raise exception 'BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE'; end if;
  if exists(select 1 from public.billing_plan_change_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed')) then raise exception 'BILLING_PLAN_CHANGE_ALREADY_PENDING'; end if;
  if exists(select 1 from public.billing_seat_quantity_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed')) then raise exception 'BILLING_PLAN_CHANGE_OPERATION_CONFLICT'; end if;
  if b.approved_additional_coach_seats>0 and ((p_snapshot#>>'{verified_item,item_id}',p_snapshot#>>'{verified_item,subscription_id}',p_snapshot#>>'{verified_item,price_id}',p_snapshot#>>'{verified_item,quantity}') is distinct from
    (b.first_subscription_item_id,b.provider_subscription_id,m.provider_price_id,(1+b.approved_additional_coach_seats)::text) or (p_snapshot#>>'{verified_item,is_usage_based}')::boolean is distinct from false) then raise exception 'BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE'; end if;

  select plan_key into source_key from public.commercial_plan_versions where id=m.plan_version_id;
  c:=public.classify_billing_plan_change(source_key,m.cadence,p_target_plan,p_target_cadence);
  select v.* into t from public.billing_provider_variant_mappings v join public.commercial_plan_versions p on p.id=v.plan_version_id where p.plan_key=p_target_plan and p.status='active' and v.status='active' and v.cadence=p_target_cadence and v.environment=p_environment and v.provider_store_id=b.provider_store_id for share of v;
  if t.id is null then raise exception 'BILLING_PLAN_CHANGE_TARGET_MAPPING_UNAVAILABLE'; end if;
  if b.approved_additional_coach_seats>(select max_coach_seats-included_coach_seats from public.commercial_plan_versions where id=t.plan_version_id) then raise exception 'BILLING_PLAN_CHANGE_CAPACITY_BLOCKED'; end if;
  if b.approved_additional_coach_seats>0 and not exists(select 1 from public.billing_quantity_price_contracts where variant_mapping_id=t.id and status='active') then raise exception 'BILLING_PLAN_CHANGE_TARGET_MAPPING_UNAVAILABLE'; end if;
  if c->>'effectiveTiming'='period_end' and (s.current_period_ends_at is null or s.current_period_ends_at<=clock_timestamp() or (p_snapshot->>'renews_at')::timestamptz is distinct from s.current_period_ends_at) then raise exception 'BILLING_PLAN_CHANGE_EFFECTIVE_DATE_INVALID'; end if;
  pf:=public.billing_plan_change_preflight(p_owner,b.billing_account_id,t.plan_version_id);
  return c||jsonb_build_object('sourcePlanKey',source_key,'sourceCadence',m.cadence,'targetPlanKey',p_target_plan,'targetCadence',p_target_cadence,'currentPriceMinor',m.unit_amount_minor+b.approved_additional_coach_seats*case m.cadence when 'monthly' then 1200 else 12000 end,'targetPriceMinor',t.unit_amount_minor+b.approved_additional_coach_seats*case t.cadence when 'monthly' then 1200 else 12000 end,'currency','USD',
    'effectiveAt',case when c->>'effectiveTiming'='period_end' then s.current_period_ends_at else null end,'blockers',case when c->>'effectiveTiming'='period_end' then pf->'blockers' else '[]'::jsonb end,'dataQualityIssue',pf#>'{snapshot,hasAnyDataQualityIssue}');
end $$;

create or replace function public.billing_plan_change_preflight(p_owner uuid,p_account uuid,p_target uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c jsonb:=public.resolve_account_capacity(p_owner,p_account); p public.commercial_plan_versions%rowtype; d jsonb; lim integer; blockers jsonb:='[]'; route text; remedy text;
begin
  select * into strict p from public.commercial_plan_versions where id=p_target;
  for d in select value from jsonb_array_elements(c->'dimensions') loop
    lim:=case d->>'key' when 'counted_clients' then p.max_counted_clients when 'coach_seats' then least(p.max_coach_seats,p.included_coach_seats+coalesce((select approved_additional_coach_seats from public.billing_provider_subscriptions where billing_account_id=p_account and account_subscription_id=(c#>>'{subscription,id}')::uuid),0)) when 'active_workspaces' then p.max_active_workspaces when 'published_packages' then p.max_published_packages end;
    route:=case d->>'key' when 'counted_clients' then '/pt-hub/clients' when 'coach_seats' then '/pt-hub/workspaces' when 'active_workspaces' then '/pt-hub/workspaces' else '/pt-hub/packages' end;
    remedy:=case d->>'key' when 'counted_clients' then 'Review counted clients and finish or end relationships you no longer deliver.' when 'coach_seats' then 'Review active staff and pending invitations.' when 'active_workspaces' then 'Review workspace ownership before changing plans.' else 'Review which packages need to remain published.' end;
    if (lim is not null and (d->>'committed')::integer>lim) or coalesce((d->>'dataQualityIssue')::boolean,false) then
      blockers:=blockers||jsonb_build_array(jsonb_build_object('dimension',d->>'key','committed',(d->>'committed')::integer,'targetLimit',lim,'overBy',greatest(0,(d->>'committed')::integer-lim),'managementRoute',route,'remediation',remedy));
    end if;
  end loop;
  return jsonb_build_object('blockers',blockers,'snapshot',jsonb_build_object('dimensions',c->'dimensions','hasAnyDataQualityIssue',c->'hasAnyDataQualityIssue'));
end $$;

create or replace function public.billing_plan_change_capacity_limit(p_account uuid,p_dimension text,p_current integer) returns integer language sql stable security definer set search_path=pg_catalog,public as $$
  select least(p_current,(select min(case p_dimension when 'counted_clients' then p.max_counted_clients when 'coach_seats' then least(p.max_coach_seats,p.included_coach_seats+(select approved_additional_coach_seats from public.billing_provider_subscriptions where id=o.billing_provider_subscription_id)) when 'active_workspaces' then p.max_active_workspaces when 'published_packages' then p.max_published_packages end)
    from public.billing_plan_change_operations o join public.commercial_plan_versions p on p.id=o.target_plan_version_id
    where o.billing_account_id=p_account and o.effective_timing='period_end' and o.status in ('provider_pending','scheduled','cancel_pending','ambiguous','manual_review')))
$$;

create or replace function public.protect_billing_plan_change_history() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare s public.billing_provider_variant_mappings%rowtype; t public.billing_provider_variant_mappings%rowtype; c jsonb;
begin
  if tg_op='DELETE' or tg_table_name='billing_plan_change_events' then raise exception 'Plan change history is append-only.'; end if;
  if tg_op='UPDATE' then
    if old.status in ('completed','canceled','failed') and new is distinct from old then raise exception 'BILLING_PLAN_CHANGE_OPERATION_CONFLICT'; end if;
    if (to_jsonb(new)-array['status','provider_requested_at','provider_applied_at','payment_confirmed_at','completed_at','canceled_at','failed_at','ambiguous_at','provider_updated_at','provider_snapshot_sha256','error_code','updated_at']) is distinct from
      (to_jsonb(old)-array['status','provider_requested_at','provider_applied_at','payment_confirmed_at','completed_at','canceled_at','failed_at','ambiguous_at','provider_updated_at','provider_snapshot_sha256','error_code','updated_at']) then raise exception 'BILLING_PLAN_CHANGE_OPERATION_CONFLICT'; end if;
  end if;
  select * into strict s from public.billing_provider_variant_mappings where id=new.source_variant_mapping_id for share;
  select * into strict t from public.billing_provider_variant_mappings where id=new.target_variant_mapping_id for share;
  if tg_op='INSERT' then
    perform 1 from public.billing_accounts where id=new.billing_account_id for update;
    if exists(select 1 from public.billing_seat_quantity_operations where billing_provider_subscription_id=new.billing_provider_subscription_id and status not in ('completed','canceled','failed')) then raise exception 'BILLING_PLAN_CHANGE_OPERATION_CONFLICT'; end if;
  end if;
  if tg_op='INSERT' and t.status<>'active' then raise exception 'BILLING_PLAN_CHANGE_TARGET_MAPPING_UNAVAILABLE'; end if;
  if s.status not in ('active','retired') or t.status not in ('active','retired') or
    (s.plan_version_id,s.cadence,s.provider,s.environment,s.provider_store_id) is distinct from
    (new.source_plan_version_id,new.source_cadence,t.provider,t.environment,t.provider_store_id) or
    (t.plan_version_id,t.cadence) is distinct from (new.target_plan_version_id,new.target_cadence) then raise exception 'BILLING_PLAN_CHANGE_OPERATION_CONFLICT'; end if;
  if not exists(select 1 from public.billing_accounts where id=new.billing_account_id and owner_user_id=new.created_by_user_id) or
    not exists(select 1 from public.account_subscriptions where id=new.source_account_subscription_id and billing_account_id=new.billing_account_id and plan_version_id=new.source_plan_version_id and subscription_kind='paid') or
    not exists(select 1 from public.billing_provider_subscriptions where id=new.billing_provider_subscription_id and billing_account_id=new.billing_account_id and environment=s.environment and provider_store_id=s.provider_store_id) then raise exception 'BILLING_PLAN_CHANGE_OWNER_REQUIRED'; end if;
  c:=public.classify_billing_plan_change((select plan_key from public.commercial_plan_versions where id=s.plan_version_id),s.cadence,(select plan_key from public.commercial_plan_versions where id=t.plan_version_id),t.cadence);
  if (new.change_kind,new.effective_timing,new.proration_mode) is distinct from (c->>'changeKind',c->>'effectiveTiming',c->>'prorationMode') then raise exception 'BILLING_PLAN_CHANGE_OPERATION_CONFLICT'; end if;
  return new;
end $$;

create or replace function public.reconcile_billing_provider_subscription(p_delivery uuid,p_snapshot jsonb default null)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare item jsonb:=p_snapshot->'verified_item'; seat public.billing_seat_quantity_operations%rowtype; processor text:=p_snapshot->>'payment_processor'; o public.billing_plan_change_operations%rowtype; d public.billing_provider_webhook_deliveries%rowtype; b public.billing_provider_subscriptions%rowtype;
  t public.billing_checkout_attempts%rowtype; m public.billing_provider_variant_mappings%rowtype;
  a uuid; local_id uuid; old_kind text; local_status text; h text; code text; sid text; stamp timestamptz; end_at timestamptz;
  tx_at constant timestamptz:=transaction_timestamp(); cancel_pending boolean; provider_created timestamptz;
begin
  p_snapshot:=p_snapshot-array['payment_processor','verified_item'];
  select * into strict d from public.billing_provider_webhook_deliveries where id=p_delivery for update;
  if d.processing_status in ('processed','ignored') then return 'replayed'; end if;
  update public.billing_provider_webhook_deliveries set attempt_count=attempt_count+1,last_attempt_at=now(),last_error_code=null where id=d.id;
  if d.event_name not in ('subscription_plan_changed','subscription_created','subscription_updated','subscription_cancelled','subscription_resumed','subscription_expired','subscription_paused','subscription_unpaused','subscription_payment_success','subscription_payment_failed','subscription_payment_recovered') then
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
      if t.id is null then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
      a:=t.billing_account_id;
      perform 1 from public.billing_accounts where id=a for update;
      -- Re-read under lock: checkout completion/expiry may have raced retrieval.
      select * into t from public.billing_checkout_attempts where id=t.id for update;
      if t.id is null or t.billing_account_id is distinct from (d.normalized_payload->>'billing_account_id')::uuid
        or t.plan_version_id is distinct from (d.normalized_payload->>'plan_version_id')::uuid or t.environment<>d.environment
        or t.status not in ('creating','ready','ambiguous','expired')
        or (p_snapshot->>'created_at')::timestamptz not between t.created_at and t.expected_expires_at then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
      -- Delayed linkage uses the approved attempt, never a replacement sale mapping.
      select * into m from public.billing_provider_variant_mappings where id=t.variant_mapping_id for share;
      if m.id is null or m.status not in ('active','retired') or
        (m.status='retired' and (m.retired_at is null or t.created_at>m.retired_at)) then raise exception 'BILLING_SUBSCRIPTION_VARIANT_MISMATCH'; end if;
    else
      a:=b.billing_account_id;
      perform 1 from public.billing_accounts where id=a for update;
      -- Existing obligations retain their exact immutable historical mapping.
      select * into m from public.billing_provider_variant_mappings where id=b.variant_mapping_id for share;
      if m.id is null or m.status not in ('active','retired') then raise exception 'BILLING_SUBSCRIPTION_VARIANT_MISMATCH'; end if;
    end if;
    if p_snapshot->>'customer_id' is null or exists(select 1 from public.billing_provider_customers c where c.provider=d.provider and c.environment=d.environment and
      ((c.billing_account_id=a and c.provider_customer_id<>p_snapshot->>'customer_id') or (c.provider_customer_id=p_snapshot->>'customer_id' and c.billing_account_id<>a))) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if b.id is not null then
      select * into o from public.billing_plan_change_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed') for update;
      -- Stale snapshots cannot turn an approved operation into manual review.
      if (p_snapshot->>'updated_at')::timestamptz<b.provider_updated_at then
        update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code='BILLING_RECONCILIATION_STALE' where id=d.id;
        return 'ignored';
      end if;
      if o.id is not null and processor is distinct from 'card' then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
      if o.id is not null and (p_snapshot->>'updated_at')::timestamptz>=o.provider_requested_at then
        select v.* into m from public.billing_provider_variant_mappings v where
          v.id in (o.target_variant_mapping_id,case when o.status='cancel_pending' then o.source_variant_mapping_id else b.variant_mapping_id end)
          and (v.provider_product_id,v.provider_variant_id,v.provider_price_id)=(p_snapshot->>'product_id',p_snapshot->>'variant_id',p_snapshot->>'price_id');
        if m.id is null then raise exception 'BILLING_UNAPPROVED_PLAN_CHANGE'; end if;
      end if;
    end if;
    -- Exact approved Price identity also fixes cadence: provider prices are immutable.
    -- No local plan-change operation exists in PR-PRICE-06.
    if b.id is not null and (m.provider_product_id is distinct from p_snapshot->>'product_id' or
      m.provider_variant_id is distinct from p_snapshot->>'variant_id' or m.provider_price_id is distinct from p_snapshot->>'price_id') then
      raise exception 'BILLING_UNAPPROVED_PLAN_CHANGE'; end if;
    if m.environment<>d.environment or m.provider_store_id<>p_snapshot->>'store_id' or m.provider_product_id is distinct from p_snapshot->>'product_id' then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if m.provider_variant_id is distinct from p_snapshot->>'variant_id' then raise exception 'BILLING_SUBSCRIPTION_VARIANT_MISMATCH'; end if;
    if m.provider_price_id is distinct from p_snapshot->>'price_id' then raise exception 'BILLING_SUBSCRIPTION_PRICE_MISMATCH'; end if;
    if b.id is null then
      if (p_snapshot->>'quantity')::integer is distinct from 1 then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    else
      select * into seat from public.billing_seat_quantity_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed') for update;
      if (p_snapshot->>'quantity')::integer is distinct from 1+b.approved_additional_coach_seats and not
        (seat.id is not null and seat.variant_mapping_id=m.id and (p_snapshot->>'quantity')::integer=seat.target_quantity and (p_snapshot->>'updated_at')::timestamptz>=seat.provider_requested_at) then
        raise exception 'BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT'; end if;
      if seat.id is not null or b.approved_additional_coach_seats>0 or (p_snapshot->>'quantity')::integer>1 then
        if item is null or (item->>'item_id',item->>'subscription_id',item->>'price_id',item->>'quantity') is distinct from
          (b.first_subscription_item_id,b.provider_subscription_id,m.provider_price_id,p_snapshot->>'quantity') or
          (item->>'is_usage_based')::boolean is distinct from false or (item->>'created_at') is null or (item->>'updated_at') is null or
          (item->>'updated_at')::timestamptz<(item->>'created_at')::timestamptz then raise exception 'BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT'; end if;
        if not exists(select 1 from public.billing_quantity_price_contracts where variant_mapping_id=m.id and status in ('active','retired')) then raise exception 'BILLING_SEAT_QUANTITY_PRICE_CONTRACT_MISMATCH'; end if;
      end if;
    end if;
    if p_snapshot->>'status'='on_trial' or p_snapshot->>'trial_ends_at' is not null then raise exception 'BILLING_SUBSCRIPTION_UNSUPPORTED_TRIAL'; end if;
    if p_snapshot->>'status' is null or p_snapshot->>'status' not in ('active','paused','past_due','unpaid','cancelled','expired') then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    if jsonb_typeof(p_snapshot->'cancelled') is distinct from 'boolean' or
      (p_snapshot->>'status'='cancelled' and (p_snapshot->>'cancelled')::boolean is distinct from true) or
      (p_snapshot->>'status' in ('active','paused','past_due','unpaid') and (p_snapshot->>'cancelled')::boolean is distinct from false) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
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
    provider_created:=(p_snapshot->>'created_at')::timestamptz;
    if provider_created is null or (b.id is null and end_at is not null and end_at<=provider_created) or
      (p_snapshot->>'status' in ('active','past_due','cancelled','expired') and end_at is null) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    local_status:=case p_snapshot->>'status' when 'past_due' then 'past_due' when 'unpaid' then 'grace' when 'expired' then 'expired'
      when 'cancelled' then case when end_at>tx_at then 'active' else 'expired' end else 'active' end;
    cancel_pending:=p_snapshot->>'status'='cancelled' and end_at>tx_at;
    if seat.id is not null then
      if processor is distinct from 'card' then raise exception 'BILLING_SEAT_QUANTITY_MANUAL_REVIEW'; end if;
      perform public.apply_verified_billing_seat_quantity(b.id,p_snapshot,d.event_name,d.normalized_payload);
    end if;
    if o.id is not null then
      perform public.apply_verified_billing_plan_change(o.id,p_snapshot,d.event_name,d.normalized_payload);
      select * into b from public.billing_provider_subscriptions where id=b.id;
    end if;

    if b.id is null then
      if exists(select 1 from public.account_subscriptions where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted') and subscription_kind not in ('trial','complimentary')) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
      select subscription_kind into old_kind from public.account_subscriptions where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted');
      -- Cancellation terminalizes early trial access without rewriting immutable trial dates.
      update public.account_subscriptions set status='canceled',canceled_at=now(),status_changed_at=now() where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted');
      insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at,cancel_at_period_end,expired_at)
        values(a,m.plan_version_id,'paid',local_status,'billing_provider',provider_created,end_at,cancel_pending,
          case when local_status='expired' then tx_at else null end) returning id into local_id;
      insert into public.billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id)
        values(a,d.provider,d.environment,m.provider_store_id,p_snapshot->>'customer_id') on conflict(billing_account_id,provider,environment) do update set last_seen_at=now(),updated_at=now();
      insert into public.billing_provider_subscriptions(billing_account_id,account_subscription_id,variant_mapping_id,provider,environment,provider_store_id,provider_customer_id,provider_subscription_id,provider_order_id,provider_order_item_id,provider_product_id,provider_variant_id,provider_price_id,first_subscription_item_id,quantity,provider_status,provider_cancelled,provider_renews_at,provider_ends_at,provider_trial_ends_at,provider_created_at,provider_updated_at,latest_snapshot_sha256,last_reconciled_at,reconciliation_status)
        values(a,local_id,m.id,d.provider,d.environment,m.provider_store_id,p_snapshot->>'customer_id',sid,p_snapshot->>'order_id',p_snapshot->>'order_item_id',m.provider_product_id,m.provider_variant_id,m.provider_price_id,p_snapshot->>'first_subscription_item_id',1,p_snapshot->>'status',(p_snapshot->>'cancelled')::boolean,
          (p_snapshot->>'renews_at')::timestamptz,(p_snapshot->>'ends_at')::timestamptz,null,provider_created,stamp,h,tx_at,'processed');
      update public.billing_checkout_attempts set status='completed',completed_at=now(),expired_at=null,error_code=null,provider_checkout_url=null,completed_provider_subscription_id=sid,updated_at=now() where id=t.id;
      -- A delayed creation delivery may arrive after another Checkout was opened.
      update public.billing_checkout_attempts set status='expired',expired_at=now(),provider_checkout_url=null,error_code='BILLING_CHECKOUT_EXPIRED',updated_at=now()
        where billing_account_id=a and id<>t.id and status in ('creating','ready','ambiguous');
    else
      local_id:=b.account_subscription_id;
      if exists(select 1 from public.account_subscriptions where billing_account_id=a and id<>local_id and status in ('trialing','trial_recovery','active','past_due','grace','restricted')) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
      if b.latest_snapshot_sha256<>h or exists(select 1 from public.account_subscriptions where id=local_id and
        (status is distinct from local_status or current_period_ends_at is distinct from end_at or cancel_at_period_end is distinct from cancel_pending)) then
        update public.account_subscriptions set status=local_status,status_changed_at=now(),
          expired_at=case when local_status='expired' then now() else null end,
          current_period_ends_at=end_at,cancel_at_period_end=cancel_pending where id=local_id;
        update public.billing_provider_subscriptions set quantity=(p_snapshot->>'quantity')::integer,provider_status=p_snapshot->>'status',provider_cancelled=(p_snapshot->>'cancelled')::boolean,
          provider_renews_at=(p_snapshot->>'renews_at')::timestamptz,provider_ends_at=(p_snapshot->>'ends_at')::timestamptz,
          provider_updated_at=stamp,latest_snapshot_sha256=h,last_reconciled_at=now(),reconciliation_status='processed',reconciliation_error_code=null,updated_at=now() where id=b.id;
      end if;
      -- Health is independent of business changes. All validation and stale/equal
      -- timestamp guards have passed; do not write the local row or an event here.
      update public.billing_provider_subscriptions set reconciliation_status='processed',reconciliation_error_code=null,
        last_reconciled_at=tx_at,updated_at=tx_at where id=b.id;
    end if;
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code=null
      where provider=d.provider and environment=d.environment and provider_subscription_id=sid and processing_status='deferred' and id<>d.id;
    update public.billing_provider_webhook_deliveries set processing_status='processed',processed_at=now(),last_error_code=null where id=d.id;
    if b.id is null then
      insert into public.account_subscription_events(billing_account_id,subscription_id,event_type,to_status,source,metadata)
        values(a,local_id,'subscription.converted_to_paid',local_status,'billing_provider',jsonb_build_object('previousKind',old_kind,'checkoutAttemptId',t.id));
    end if;
    return 'processed';
  exception when others then
    code:=sqlerrm;
    if code not in ('BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT','BILLING_SEAT_QUANTITY_PRICE_CONTRACT_MISMATCH','BILLING_SEAT_QUANTITY_MANUAL_REVIEW','BILLING_UNAPPROVED_PLAN_CHANGE','BILLING_WEBHOOK_ENVIRONMENT_MISMATCH','BILLING_WEBHOOK_STORE_MISMATCH','BILLING_SUBSCRIPTION_IDENTITY_MISMATCH','BILLING_SUBSCRIPTION_VARIANT_MISMATCH','BILLING_SUBSCRIPTION_PRICE_MISMATCH','BILLING_SUBSCRIPTION_UNSUPPORTED_TRIAL','BILLING_RECONCILIATION_MANUAL_REVIEW') then
      update public.billing_provider_webhook_deliveries set processing_status='failed',last_error_code='BILLING_RECONCILIATION_FAILED' where id=d.id;
      return 'failed';
    end if;
    update public.billing_plan_change_operations set status='manual_review',error_code='BILLING_PLAN_CHANGE_MANUAL_REVIEW',updated_at=now()
      where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed');
    update public.billing_seat_quantity_operations set status=case when status='cancel_pending' then status else 'manual_review' end,error_code='BILLING_SEAT_QUANTITY_MANUAL_REVIEW',updated_at=now()
      where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed');
    -- All activation writes above roll back together before review metadata is saved.
    update public.billing_provider_subscriptions set reconciliation_status='manual_review',reconciliation_error_code=code,
      quantity=case when code='BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT' and (p_snapshot->>'quantity')::integer>=1 then (p_snapshot->>'quantity')::integer else quantity end where id=b.id;
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code=code where id=d.id;
    return 'ignored';
  end;
end $$;

create or replace function public.finish_billing_plan_change(p_owner uuid,p_environment text,p_snapshot jsonb,p_invoice jsonb default null) returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; h text; payload jsonb; event text; d uuid;
begin
  ctx:=public.billing_plan_change_context(p_owner,p_environment);
  if p_snapshot->>'subscription_id' is distinct from ctx#>>'{subscription,provider_subscription_id}' then raise exception 'BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE'; end if;
  event:=case when p_invoice is null then 'subscription_updated' else 'subscription_payment_success' end;
  payload:=coalesce(p_invoice,jsonb_build_object('store_id',p_snapshot->>'store_id','subscription_id',p_snapshot->>'subscription_id','customer_id',p_snapshot->>'customer_id','test_mode',p_environment='test','created_at',p_snapshot->>'created_at','updated_at',p_snapshot->>'updated_at'));
  -- API reconciliation uses the same durable inbox and validators. The hash
  -- namespaces this evidence separately from signed webhook deliveries.
  h:=encode(extensions.digest('api-reconciliation:'||p_snapshot::text||payload::text||case when exists(select 1 from public.billing_seat_quantity_operations where billing_provider_subscription_id=(ctx#>>'{subscription,id}')::uuid and status='scheduled' and effective_at<=now()) then ':seat-due' else '' end,'sha256'),'hex');
  d:=public.record_billing_webhook_delivery(p_environment,event,case when p_invoice is null then 'subscriptions' else 'subscription-invoices' end,p_snapshot->>'subscription_id',h,encode(extensions.digest(p_environment||chr(10)||event||chr(10)||h,'sha256'),'hex'),payload);
  return public.reconcile_billing_provider_subscription(d,p_snapshot);
end $$;

alter table public.commercial_addon_versions enable row level security;
alter table public.billing_quantity_price_contracts enable row level security;
alter table public.billing_seat_quantity_operations enable row level security;
alter table public.billing_seat_quantity_events enable row level security;
revoke all on public.commercial_addon_versions,public.billing_quantity_price_contracts,public.billing_seat_quantity_operations,public.billing_seat_quantity_events from public,anon,authenticated,service_role;

revoke all on function public.protect_billing_seat_catalogue() from public,anon,authenticated,service_role;
revoke all on function public.protect_billing_seat_operation() from public,anon,authenticated,service_role;
revoke all on function public.audit_billing_seat_operation() from public,anon,authenticated,service_role;
revoke all on function public.billing_seat_effective_limit(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.billing_seat_quantity_context(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_seat_quantity_context(uuid,text) to service_role;
revoke all on function public.preview_billing_seat_quantity(uuid,text,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_billing_seat_quantity(uuid,text,integer,jsonb) to service_role;
revoke all on function public.begin_billing_seat_quantity(uuid,text,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.begin_billing_seat_quantity(uuid,text,integer,uuid,jsonb) to service_role;
revoke all on function public.begin_cancel_billing_seat_quantity(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_cancel_billing_seat_quantity(uuid,text,uuid) to service_role;
revoke all on function public.fail_billing_seat_quantity(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.fail_billing_seat_quantity(uuid,uuid,boolean) to service_role;
revoke all on function public.apply_verified_billing_seat_quantity(uuid,jsonb,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.get_my_billing_seat_quantity_state() from public,anon,authenticated,service_role;
grant execute on function public.get_my_billing_seat_quantity_state() to authenticated;
commit;
