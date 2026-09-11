-- PR-PRICE-07. Private, durable operations; no provider configuration or domain writes.
begin;
alter table public.billing_provider_webhook_deliveries drop constraint billing_provider_webhook_deliveries_normalized_payload_check1;
alter table public.billing_provider_webhook_deliveries add constraint billing_provider_webhook_deliveries_normalized_payload_check1
  check(normalized_payload - array['store_id','subscription_id','customer_id','product_id','variant_id','price_id','status','test_mode','created_at','updated_at','billing_account_id','checkout_attempt_id','plan_version_id','billing_reason'] = '{}'::jsonb);

create table public.billing_plan_change_operations (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id),
  billing_provider_subscription_id uuid not null references public.billing_provider_subscriptions(id),
  source_account_subscription_id uuid not null,
  source_plan_version_id uuid not null references public.commercial_plan_versions(id),
  source_variant_mapping_id uuid not null references public.billing_provider_variant_mappings(id),
  source_cadence text not null check(source_cadence in ('monthly','annual')),
  target_plan_version_id uuid not null references public.commercial_plan_versions(id),
  target_variant_mapping_id uuid not null references public.billing_provider_variant_mappings(id),
  target_cadence text not null check(target_cadence in ('monthly','annual')),
  change_kind text not null check(change_kind in ('tier_upgrade','cadence_upgrade','combined_upgrade','tier_downgrade','cadence_downgrade','combined_downgrade')),
  effective_timing text not null check(effective_timing in ('immediate','period_end')),
  proration_mode text not null check(proration_mode in ('invoice_immediately','disable_prorations')),
  operation_id uuid not null,
  status text not null check(status in ('requested','provider_pending','awaiting_payment','scheduled','cancel_pending','completed','canceled','failed','ambiguous','manual_review')),
  provider_payment_processor text not null check(provider_payment_processor='card'),
  preflight_snapshot jsonb not null check(jsonb_typeof(preflight_snapshot)='object'),
  requested_at timestamptz not null default now(), provider_requested_at timestamptz,
  provider_applied_at timestamptz, payment_confirmed_at timestamptz, effective_at timestamptz,
  completed_at timestamptz, canceled_at timestamptz, failed_at timestamptz, ambiguous_at timestamptz,
  provider_updated_at timestamptz, provider_snapshot_sha256 text,
  error_code text, created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(billing_account_id,operation_id),
  foreign key(billing_account_id,source_account_subscription_id) references public.account_subscriptions(billing_account_id,id),
  check((source_plan_version_id,source_cadence)<>(target_plan_version_id,target_cadence)),
  check((status='completed')=(completed_at is not null)),
  check((status='canceled')=(canceled_at is not null)),
  check((status='failed')=(failed_at is not null)),
  check(status<>'completed' or (provider_applied_at is not null and (effective_timing<>'immediate' or payment_confirmed_at is not null))),
  check(effective_timing<>'period_end' or effective_at is not null),
  check((effective_timing='immediate')=(proration_mode='invoice_immediately')),
  check(provider_snapshot_sha256 is null or provider_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  check(error_code is null or error_code ~ '^BILLING_PLAN_CHANGE_[A-Z_]+$'),
  check(preflight_snapshot - array['dimensions','hasAnyDataQualityIssue'] = '{}'::jsonb)
);
create unique index billing_one_open_plan_change on public.billing_plan_change_operations(billing_provider_subscription_id)
  where status not in ('completed','canceled','failed');
create index billing_plan_change_account_history on public.billing_plan_change_operations(billing_account_id,created_at desc);
create table public.billing_plan_change_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.billing_plan_change_operations(id),
  event_type text not null, occurred_at timestamptz not null default now(),
  unique(operation_id,event_type)
);
alter table public.billing_plan_change_operations enable row level security;
alter table public.billing_plan_change_events enable row level security;
revoke all on public.billing_plan_change_operations,public.billing_plan_change_events from public,anon,authenticated,service_role;

create function public.classify_billing_plan_change(p_source text,p_source_cadence text,p_target text,p_target_cadence text)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare s integer:=array_position(array['launch','growth','scale'],p_source); t integer:=array_position(array['launch','growth','scale'],p_target); timing text; kind text;
begin
  if s is null or t is null or p_source_cadence is null or p_target_cadence is null or p_source_cadence not in ('monthly','annual') or p_target_cadence not in ('monthly','annual') then raise exception 'BILLING_INVALID_INPUT'; end if;
  if s=t and p_source_cadence=p_target_cadence then raise exception 'BILLING_PLAN_CHANGE_NOOP'; end if;
  if t>s and p_source_cadence='annual' and p_target_cadence='monthly' then raise exception 'BILLING_PLAN_CHANGE_MIXED_DIRECTION_UNSUPPORTED'; end if;
  timing:=case when t<s or (p_source_cadence='annual' and p_target_cadence='monthly') then 'period_end' else 'immediate' end;
  kind:=case when s=t then 'cadence' when p_source_cadence=p_target_cadence then 'tier' else 'combined' end||case when timing='immediate' then '_upgrade' else '_downgrade' end;
  return jsonb_build_object('changeKind',kind,'effectiveTiming',timing,'prorationMode',case when timing='immediate' then 'invoice_immediately' else 'disable_prorations' end);
end $$;

create function public.protect_billing_plan_change_history() returns trigger language plpgsql set search_path=pg_catalog,public as $$
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
create trigger billing_plan_change_history before insert or update or delete on public.billing_plan_change_operations for each row execute function public.protect_billing_plan_change_history();
create trigger billing_plan_change_event_history before update or delete on public.billing_plan_change_events for each row execute function public.protect_billing_plan_change_history();
create function public.audit_billing_plan_change() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare event text;
begin
  event:=case new.status when 'requested' then 'requested' when 'provider_pending' then 'requested' when 'awaiting_payment' then 'awaiting_payment' when 'scheduled' then 'scheduled' when 'cancel_pending' then 'cancel_requested' when 'completed' then 'completed' when 'canceled' then 'canceled' when 'failed' then 'failed' else 'manual_review' end;
  insert into public.billing_plan_change_events(operation_id,event_type) values(new.id,'billing.plan_change_'||event) on conflict do nothing;
  if new.provider_applied_at is not null then insert into public.billing_plan_change_events(operation_id,event_type) values(new.id,'billing.plan_change_provider_applied') on conflict do nothing; end if;
  return new;
end $$;
create trigger billing_plan_change_audit after insert or update on public.billing_plan_change_operations for each row execute function public.audit_billing_plan_change();

alter table public.account_subscriptions drop constraint account_subscriptions_status_check;
alter table public.account_subscriptions add constraint account_subscriptions_status_check check(status in ('trialing','trial_recovery','active','past_due','grace','restricted','canceled','expired','superseded'));
alter table public.account_subscriptions add column superseded_at timestamptz, add column superseded_by_subscription_id uuid;
alter table public.account_subscriptions add constraint subscription_supersession check((status='superseded')=(superseded_at is not null) and (superseded_by_subscription_id is null or status='superseded'));
alter table public.account_subscriptions add constraint subscription_supersession_target foreign key(billing_account_id,superseded_by_subscription_id) references public.account_subscriptions(billing_account_id,id) deferrable initially deferred;
alter table public.account_subscription_events drop constraint account_subscription_events_from_status_check, drop constraint account_subscription_events_to_status_check;
alter table public.account_subscription_events add constraint account_subscription_events_from_status_check check(from_status in ('trialing','trial_recovery','active','past_due','grace','restricted','canceled','expired','superseded')),
  add constraint account_subscription_events_to_status_check check(to_status in ('trialing','trial_recovery','active','past_due','grace','restricted','canceled','expired','superseded'));
-- The existing positive-status current index already excludes superseded.

create function public.billing_plan_change_context(p_owner uuid,p_environment text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; b public.billing_provider_subscriptions%rowtype; s public.account_subscriptions%rowtype; m public.billing_provider_variant_mappings%rowtype;
begin
  if p_owner is null or not exists(select 1 from public.pt_profiles where user_id=p_owner and workspace_id is null) then raise exception 'BILLING_PLAN_CHANGE_OWNER_REQUIRED' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=p_owner;
  select * into s from public.account_subscriptions where billing_account_id=a and status<>'superseded' order by (status in ('active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  select * into b from public.billing_provider_subscriptions where billing_account_id=a and account_subscription_id=s.id and environment=p_environment;
  if b.id is null or s.subscription_kind<>'paid' then raise exception 'BILLING_PLAN_CHANGE_NOT_ELIGIBLE'; end if;
  select * into strict m from public.billing_provider_variant_mappings where id=b.variant_mapping_id;
  return jsonb_build_object('subscription',to_jsonb(b),'local',to_jsonb(s),'mapping',to_jsonb(m));
end $$;

create function public.billing_plan_change_preflight(p_owner uuid,p_account uuid,p_target uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c jsonb:=public.resolve_account_capacity(p_owner,p_account); p public.commercial_plan_versions%rowtype; d jsonb; lim integer; blockers jsonb:='[]'; route text; remedy text;
begin
  select * into strict p from public.commercial_plan_versions where id=p_target;
  for d in select value from jsonb_array_elements(c->'dimensions') loop
    lim:=case d->>'key' when 'counted_clients' then p.max_counted_clients when 'coach_seats' then p.max_coach_seats when 'active_workspaces' then p.max_active_workspaces when 'published_packages' then p.max_published_packages end;
    route:=case d->>'key' when 'counted_clients' then '/pt-hub/clients' when 'coach_seats' then '/pt-hub/workspaces' when 'active_workspaces' then '/pt-hub/workspaces' else '/pt-hub/packages' end;
    remedy:=case d->>'key' when 'counted_clients' then 'Review counted clients and finish or end relationships you no longer deliver.' when 'coach_seats' then 'Review active staff and pending invitations.' when 'active_workspaces' then 'Review workspace ownership before changing plans.' else 'Review which packages need to remain published.' end;
    if (lim is not null and (d->>'committed')::integer>lim) or coalesce((d->>'dataQualityIssue')::boolean,false) then
      blockers:=blockers||jsonb_build_array(jsonb_build_object('dimension',d->>'key','committed',(d->>'committed')::integer,'targetLimit',lim,'overBy',greatest(0,(d->>'committed')::integer-lim),'managementRoute',route,'remediation',remedy));
    end if;
  end loop;
  return jsonb_build_object('blockers',blockers,'snapshot',jsonb_build_object('dimensions',c->'dimensions','hasAnyDataQualityIssue',c->'hasAnyDataQualityIssue'));
end $$;

create function public.preview_billing_plan_change(p_owner uuid,p_environment text,p_target_plan text,p_target_cadence text,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
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
    (p_snapshot->>'quantity')::integer is distinct from 1 or p_snapshot->>'trial_ends_at' is not null or (p_snapshot->>'updated_at')::timestamptz<b.provider_updated_at or
    (p_snapshot->>'updated_at') is null or (p_snapshot->>'created_at')::timestamptz is distinct from b.provider_created_at or
    m.plan_version_id<>s.plan_version_id or m.status not in ('active','retired') then raise exception 'BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE'; end if;
  if exists(select 1 from public.billing_plan_change_operations where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed')) then raise exception 'BILLING_PLAN_CHANGE_ALREADY_PENDING'; end if;
  select plan_key into source_key from public.commercial_plan_versions where id=m.plan_version_id;
  c:=public.classify_billing_plan_change(source_key,m.cadence,p_target_plan,p_target_cadence);
  select v.* into t from public.billing_provider_variant_mappings v join public.commercial_plan_versions p on p.id=v.plan_version_id where p.plan_key=p_target_plan and p.status='active' and v.status='active' and v.cadence=p_target_cadence and v.environment=p_environment and v.provider_store_id=b.provider_store_id for share of v;
  if t.id is null then raise exception 'BILLING_PLAN_CHANGE_TARGET_MAPPING_UNAVAILABLE'; end if;
  if c->>'effectiveTiming'='period_end' and (s.current_period_ends_at is null or s.current_period_ends_at<=clock_timestamp() or (p_snapshot->>'renews_at')::timestamptz is distinct from s.current_period_ends_at) then raise exception 'BILLING_PLAN_CHANGE_EFFECTIVE_DATE_INVALID'; end if;
  pf:=public.billing_plan_change_preflight(p_owner,b.billing_account_id,t.plan_version_id);
  return c||jsonb_build_object('sourcePlanKey',source_key,'sourceCadence',m.cadence,'targetPlanKey',p_target_plan,'targetCadence',p_target_cadence,'currentPriceMinor',m.unit_amount_minor,'targetPriceMinor',t.unit_amount_minor,'currency','USD',
    'effectiveAt',case when c->>'effectiveTiming'='period_end' then s.current_period_ends_at else null end,'blockers',case when c->>'effectiveTiming'='period_end' then pf->'blockers' else '[]'::jsonb end,'dataQualityIssue',pf#>'{snapshot,hasAnyDataQualityIssue}');
end $$;

create function public.begin_billing_plan_change(p_owner uuid,p_environment text,p_target_plan text,p_target_cadence text,p_operation uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; preview jsonb; b public.billing_provider_subscriptions%rowtype; s public.account_subscriptions%rowtype; m public.billing_provider_variant_mappings%rowtype; t public.billing_provider_variant_mappings%rowtype; o public.billing_plan_change_operations%rowtype;
begin
  ctx:=public.billing_plan_change_context(p_owner,p_environment); b:=jsonb_populate_record(null::public.billing_provider_subscriptions,ctx->'subscription');
  perform 1 from public.billing_accounts where id=b.billing_account_id for update;
  select * into o from public.billing_plan_change_operations where billing_account_id=b.billing_account_id and operation_id=p_operation;
  if o.id is not null then
    if o.target_cadence<>p_target_cadence or not exists(select 1 from public.commercial_plan_versions where id=o.target_plan_version_id and plan_key=p_target_plan) then raise exception 'BILLING_PLAN_CHANGE_OPERATION_CONFLICT'; end if;
    return jsonb_build_object('id',o.id,'status',o.status,'dispatch',false);
  end if;
  preview:=public.preview_billing_plan_change(p_owner,p_environment,p_target_plan,p_target_cadence,p_snapshot);
  if (preview->>'dataQualityIssue')::boolean then raise exception 'BILLING_PLAN_CHANGE_DATA_QUALITY_BLOCKED'; end if;
  if jsonb_array_length(preview->'blockers')>0 then raise exception 'BILLING_PLAN_CHANGE_CAPACITY_BLOCKED'; end if;
  s:=jsonb_populate_record(null::public.account_subscriptions,ctx->'local'); m:=jsonb_populate_record(null::public.billing_provider_variant_mappings,ctx->'mapping');
  select v.* into strict t from public.billing_provider_variant_mappings v join public.commercial_plan_versions p on p.id=v.plan_version_id where p.plan_key=p_target_plan and p.status='active' and v.status='active' and v.cadence=p_target_cadence and v.environment=p_environment;
  insert into public.billing_plan_change_operations(billing_account_id,billing_provider_subscription_id,source_account_subscription_id,source_plan_version_id,source_variant_mapping_id,source_cadence,target_plan_version_id,target_variant_mapping_id,target_cadence,change_kind,effective_timing,proration_mode,operation_id,status,provider_payment_processor,preflight_snapshot,provider_requested_at,effective_at,created_by_user_id)
    values(b.billing_account_id,b.id,s.id,s.plan_version_id,m.id,m.cadence,t.plan_version_id,t.id,t.cadence,preview->>'changeKind',preview->>'effectiveTiming',preview->>'prorationMode',p_operation,'provider_pending','card',public.billing_plan_change_preflight(p_owner,b.billing_account_id,t.plan_version_id)->'snapshot',clock_timestamp(),(preview->>'effectiveAt')::timestamptz,p_owner) returning * into o;
  return jsonb_build_object('id',o.id,'status',o.status,'dispatch',true,'variant',t.provider_variant_id,'product',t.provider_product_id,'price',t.provider_price_id,'timing',o.effective_timing);
end $$;

create function public.billing_plan_change_capacity_limit(p_account uuid,p_dimension text,p_current integer) returns integer language sql stable security definer set search_path=pg_catalog,public as $$
  select least(p_current,(select min(case p_dimension when 'counted_clients' then p.max_counted_clients when 'coach_seats' then p.max_coach_seats when 'active_workspaces' then p.max_active_workspaces when 'published_packages' then p.max_published_packages end)
    from public.billing_plan_change_operations o join public.commercial_plan_versions p on p.id=o.target_plan_version_id
    where o.billing_account_id=p_account and o.effective_timing='period_end' and o.status in ('provider_pending','scheduled','cancel_pending','ambiguous','manual_review')))
$$;

create function public.apply_verified_billing_plan_change(p_operation uuid,p_snapshot jsonb,p_event text,p_invoice jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_plan_change_operations%rowtype; b public.billing_provider_subscriptions%rowtype; m public.billing_provider_variant_mappings%rowtype; s public.account_subscriptions%rowtype; target_id uuid; paid boolean; due boolean; local_status text; stamp timestamptz:=(p_snapshot->>'updated_at')::timestamptz;
begin
  select * into strict o from public.billing_plan_change_operations where id=p_operation for update;
  if o.status in ('completed','canceled','failed') then return; end if;
  select * into strict b from public.billing_provider_subscriptions where id=o.billing_provider_subscription_id;
  select * into strict s from public.account_subscriptions where id=o.source_account_subscription_id;
  if stamp<o.provider_requested_at or stamp<b.provider_updated_at then return; end if;
  if o.status='cancel_pending' then
    select * into strict m from public.billing_provider_variant_mappings where id=o.source_variant_mapping_id;
    if (p_snapshot->>'product_id',p_snapshot->>'variant_id',p_snapshot->>'price_id')=(m.provider_product_id,m.provider_variant_id,m.provider_price_id) then
      update public.billing_provider_subscriptions set variant_mapping_id=m.id,provider_product_id=m.provider_product_id,provider_variant_id=m.provider_variant_id,provider_price_id=m.provider_price_id where id=b.id;
      update public.billing_plan_change_operations set status='canceled',canceled_at=now(),updated_at=now(),error_code=null where id=o.id;
      return;
    end if;
  end if;
  select * into strict m from public.billing_provider_variant_mappings where id=o.target_variant_mapping_id;
  if (p_snapshot->>'product_id',p_snapshot->>'variant_id',p_snapshot->>'price_id') is distinct from (m.provider_product_id,m.provider_variant_id,m.provider_price_id) then return; end if;
  if o.effective_timing='period_end' and now()<o.effective_at and p_snapshot->>'status' in ('active','past_due','unpaid')
    and (p_snapshot->>'renews_at')::timestamptz is distinct from o.effective_at then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
  paid:=o.effective_timing='immediate' and p_event in ('subscription_payment_success','subscription_payment_recovered')
    and p_invoice->>'billing_reason'='updated' and p_invoice->>'status'='paid'
    and p_invoice->>'subscription_id'=b.provider_subscription_id and p_invoice->>'customer_id'=b.provider_customer_id and p_invoice->>'store_id'=b.provider_store_id
    and (p_invoice->>'test_mode')::boolean=(b.environment='test')
    and (p_invoice->>'created_at')::timestamptz>=o.provider_requested_at and (p_invoice->>'updated_at')::timestamptz>=o.provider_requested_at;
  due:=o.effective_timing='period_end' and now()>=o.effective_at and o.status<>'cancel_pending' and not s.cancel_at_period_end and not (p_snapshot->>'cancelled')::boolean;
  update public.billing_plan_change_operations set status=case when status='cancel_pending' then status when effective_timing='immediate' then 'awaiting_payment' else 'scheduled' end,
    provider_applied_at=coalesce(provider_applied_at,now()),provider_updated_at=stamp,provider_snapshot_sha256=encode(extensions.digest(p_snapshot::text,'sha256'),'hex'),
    error_code=case when p_event='subscription_payment_failed' then 'BILLING_PLAN_CHANGE_PAYMENT_FAILED' else null end,updated_at=now() where id=o.id;
  if coalesce(paid,false) or coalesce(due,false) then
    local_status:=case p_snapshot->>'status' when 'past_due' then 'past_due' when 'unpaid' then 'grace' when 'expired' then 'expired' else 'active' end;
    if o.source_plan_version_id<>o.target_plan_version_id then
      target_id:=gen_random_uuid();
      update public.account_subscriptions set status='superseded',superseded_at=now(),superseded_by_subscription_id=target_id,status_changed_at=now() where id=s.id;
      insert into public.account_subscriptions(id,billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at,expired_at)
        values(target_id,o.billing_account_id,o.target_plan_version_id,'paid',local_status,'billing_provider',
          case when local_status='expired' or (p_snapshot->>'renews_at')::timestamptz<=now() then null else case when due then o.effective_at else now() end end,
          case when local_status='expired' then (p_snapshot->>'ends_at')::timestamptz else (p_snapshot->>'renews_at')::timestamptz end,
          case when local_status='expired' then now() else null end);
      insert into public.account_subscription_events(billing_account_id,subscription_id,event_type,from_status,to_status,source,metadata)
        values(o.billing_account_id,s.id,'subscription.plan_superseded',s.status,'superseded','billing_provider',jsonb_build_object('operationId',o.id));
    else target_id:=s.id; end if;
    update public.billing_provider_subscriptions set account_subscription_id=target_id,variant_mapping_id=m.id,provider_product_id=m.provider_product_id,provider_variant_id=m.provider_variant_id,provider_price_id=m.provider_price_id where id=b.id;
    update public.billing_plan_change_operations set status='completed',completed_at=now(),payment_confirmed_at=case when paid then now() else null end,updated_at=now() where id=o.id;
  else
    update public.billing_provider_subscriptions set variant_mapping_id=m.id,provider_product_id=m.provider_product_id,provider_variant_id=m.provider_variant_id,provider_price_id=m.provider_price_id where id=b.id;
  end if;
end $$;

create function public.fail_billing_plan_change(p_owner uuid,p_operation uuid,p_ambiguous boolean) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform 1 from public.billing_accounts a join public.billing_plan_change_operations o on o.billing_account_id=a.id where o.id=p_operation and a.owner_user_id=p_owner for update of a;
  update public.billing_plan_change_operations set status=case when status='cancel_pending' then 'cancel_pending' when p_ambiguous then 'ambiguous' else 'failed' end,
    failed_at=case when not p_ambiguous and status<>'cancel_pending' then now() else null end,
    ambiguous_at=case when p_ambiguous or status='cancel_pending' then now() else null end,
    error_code=case when p_ambiguous or status='cancel_pending' then 'BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS' else 'BILLING_PLAN_CHANGE_PROVIDER_FAILED' end,updated_at=now()
    where id=p_operation and created_by_user_id=p_owner and status in ('provider_pending','cancel_pending');
end $$;

create function public.begin_cancel_billing_plan_change(p_owner uuid,p_environment text,p_operation uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; o public.billing_plan_change_operations%rowtype; m public.billing_provider_variant_mappings%rowtype;
begin
  ctx:=public.billing_plan_change_context(p_owner,p_environment);
  perform 1 from public.billing_accounts where id=(ctx#>>'{subscription,billing_account_id}')::uuid for update;
  select * into o from public.billing_plan_change_operations where operation_id=p_operation and created_by_user_id=p_owner and billing_provider_subscription_id=(ctx#>>'{subscription,id}')::uuid for update;
  if o.id is null or o.status<>'scheduled' or o.effective_at<=clock_timestamp() then raise exception 'BILLING_PLAN_CHANGE_CANNOT_CANCEL'; end if;
  update public.billing_plan_change_operations set status='cancel_pending',updated_at=now() where id=o.id;
  select * into strict m from public.billing_provider_variant_mappings where id=o.source_variant_mapping_id;
  return jsonb_build_object('id',o.id,'status','cancel_pending','dispatch',true,'variant',m.provider_variant_id,'product',m.provider_product_id,'price',m.provider_price_id,'timing','period_end');
end $$;

create function public.get_my_billing_plan_change_state() returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare a uuid; o public.billing_plan_change_operations%rowtype; s public.account_subscriptions%rowtype; b public.billing_provider_subscriptions%rowtype; m public.billing_provider_variant_mappings%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null) then raise exception 'BILLING_PLAN_CHANGE_OWNER_REQUIRED' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=auth.uid();
  select * into s from public.account_subscriptions where billing_account_id=a and status<>'superseded' order by (status in ('active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  select * into b from public.billing_provider_subscriptions where account_subscription_id=s.id;
  select * into m from public.billing_provider_variant_mappings where id=b.variant_mapping_id;
  select * into o from public.billing_plan_change_operations where billing_account_id=a order by (status not in ('completed','canceled','failed')) desc,created_at desc,id desc limit 1;
  return jsonb_build_object('linked',b.id is not null,'cadence',case when o.status not in ('completed','canceled','failed') then o.source_cadence else m.cadence end,
    'eligible',b.id is not null and s.status='active' and not s.cancel_at_period_end and b.provider_status='active' and b.reconciliation_status='processed' and (o.id is null or o.status in ('completed','canceled','failed')),
    'operation',case when o.id is not null then jsonb_build_object('operationId',o.operation_id,'status',o.status,'targetPlanKey',(select plan_key from public.commercial_plan_versions where id=o.target_plan_version_id),'targetCadence',o.target_cadence,'effectiveAt',o.effective_at,'effectiveTiming',o.effective_timing,'errorCode',o.error_code) else null end);
end $$;

create or replace function public.protect_account_commercial_history()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' or tg_table_name = 'account_subscription_events' then
    raise exception 'Commercial history is append-only; deletion is not permitted.';
  end if;
  if tg_table_name = 'billing_accounts' then
    if new.id <> old.id or new.owner_user_id <> old.owner_user_id then raise exception 'Billing account identity is immutable.'; end if;
  elsif tg_table_name = 'account_subscriptions' then
    if tg_op='UPDATE' and old.status='superseded' and
      (to_jsonb(new)-array['superseded_by_subscription_id','updated_at']) is distinct from (to_jsonb(old)-array['superseded_by_subscription_id','updated_at']) then raise exception 'Superseded history is immutable.'; end if;
    if tg_op='UPDATE' and old.superseded_by_subscription_id is not null and new.superseded_by_subscription_id is distinct from old.superseded_by_subscription_id then raise exception 'Superseded history is immutable.'; end if;
    if tg_op = 'UPDATE' and
      (to_jsonb(new) - array['status','status_changed_at','canceled_at','restricted_at','expired_at','current_period_started_at','current_period_ends_at','cancel_at_period_end','superseded_at','superseded_by_subscription_id','updated_at']) is distinct from
      (to_jsonb(old) - array['status','status_changed_at','canceled_at','restricted_at','expired_at','current_period_started_at','current_period_ends_at','cancel_at_period_end','superseded_at','superseded_by_subscription_id','updated_at']) then
      raise exception 'Subscription identity and trial clock are immutable.';
    end if;
    perform 1 from public.commercial_plan_versions where id = new.plan_version_id and status in ('active','retired') for share;
    if not found then raise exception 'Subscription requires an immutable plan version.'; end if;
    if new.subscription_kind = 'trial' then
      perform 1 from public.commercial_trial_policy_versions
      where id = new.trial_policy_version_id and status in ('active','retired') and feature_plan_version_id = new.plan_version_id
        and new.trial_ends_at = new.trial_started_at + make_interval(days => duration_days)
        and new.trial_recovery_ends_at = new.trial_ends_at + make_interval(days => recovery_days) for share;
      if not found then raise exception 'Trial must match its immutable policy and dates.'; end if;
    end if;
  end if;
  return new;
end;
$$;
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
    if tg_op='UPDATE' and (to_jsonb(new)-array['account_subscription_id','variant_mapping_id','provider_product_id','provider_variant_id','provider_price_id','provider_status','provider_cancelled','provider_renews_at','provider_ends_at','provider_trial_ends_at','provider_updated_at','latest_snapshot_sha256','last_reconciled_at','reconciliation_status','reconciliation_error_code','updated_at']) is distinct from
      (to_jsonb(old)-array['account_subscription_id','variant_mapping_id','provider_product_id','provider_variant_id','provider_price_id','provider_status','provider_cancelled','provider_renews_at','provider_ends_at','provider_trial_ends_at','provider_updated_at','latest_snapshot_sha256','last_reconciled_at','reconciliation_status','reconciliation_error_code','updated_at']) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
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
create or replace function public.resolve_account_entitlements(p_billing_account_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare s public.account_subscriptions%rowtype; p public.commercial_plan_versions%rowtype; t public.commercial_trial_policy_versions%rowtype;
  v_status text; v_mode text; v_label text; v_targets jsonb := '[]'; v_enabled jsonb := '[]';
begin
  select * into s from public.account_subscriptions where billing_account_id = p_billing_account_id and status<>'superseded'
    order by (status in ('trialing','trial_recovery','active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  select * into p from public.commercial_plan_versions where id = s.plan_version_id;
  -- Read-time target resolution avoids dependence on a punctual renewal webhook.
  if s.subscription_kind='paid' and not s.cancel_at_period_end and s.status not in ('canceled','superseded') then
    select cp.* into p from public.commercial_plan_versions cp where cp.id=coalesce((
      select o.target_plan_version_id from public.billing_plan_change_operations o join public.billing_provider_subscriptions b on b.id=o.billing_provider_subscription_id
      where o.source_account_subscription_id=s.id and o.status='scheduled' and o.effective_timing='period_end'
        and o.effective_at<=now() and o.provider_applied_at is not null and b.variant_mapping_id=o.target_variant_mapping_id
        and not b.provider_cancelled and b.reconciliation_status='processed'),s.plan_version_id);
  end if;
  select * into t from public.commercial_trial_policy_versions where id = s.trial_policy_version_id;
  v_status := public.effective_account_subscription_status(s.subscription_kind,s.status,s.trial_ends_at,s.trial_recovery_ends_at);
  if s.subscription_kind='paid' and s.cancel_at_period_end and s.current_period_ends_at<=now() then v_status:='expired'; end if;
  v_mode := public.account_subscription_access_mode(v_status);
  v_label := case v_status when 'no_subscription' then 'Trial not started' when 'trialing' then 'Growth trial'
    when 'trial_recovery' then 'Trial ended' when 'expired' then case when s.subscription_kind = 'trial' then 'Trial expired' else 'Subscription expired' end
    when 'restricted' then 'Restricted' when 'canceled' then 'Canceled' when 'grace' then 'Grace period'
    when 'past_due' then 'Past due' else case when s.subscription_kind = 'complimentary' then 'Complimentary beta access' else p.display_name end end;
  if s.id is not null then
    select coalesce(jsonb_agg(feature_key order by feature_key),'[]') into v_targets from public.commercial_plan_feature_entitlements where plan_version_id = p.id;
    select coalesce(jsonb_agg(f.feature_key order by f.feature_key),'[]') into v_enabled
    from public.commercial_features f
    where f.readiness_status = 'COMMERCIALLY_SALEABLE'
      and (exists(select 1 from public.commercial_plan_feature_entitlements e where e.plan_version_id = p.id and e.feature_key = f.feature_key)
        or exists(select 1 from public.account_feature_entitlement_overrides o where o.billing_account_id = p_billing_account_id and o.feature_key = f.feature_key
          and o.effect = 'enable' and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now()) and o.revoked_at is null))
      and not exists(select 1 from public.account_feature_entitlement_overrides o where o.billing_account_id = p_billing_account_id and o.feature_key = f.feature_key
        and o.effect = 'disable' and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now()) and o.revoked_at is null);
  end if;
  return jsonb_build_object('schemaVersion',1,
    'subscription',jsonb_build_object('id',s.id,'kind',s.subscription_kind,'storedStatus',coalesce(s.status,'no_subscription'),
      'effectiveStatus',v_status,'accessMode',v_mode,'accessLabel',v_label,'planKey',p.plan_key,'planVersion',p.version,'planDisplayName',p.display_name,
      'trialStartedAt',s.trial_started_at,'trialEndsAt',s.trial_ends_at,'trialRecoveryEndsAt',s.trial_recovery_ends_at,
      'currentPeriodStartedAt',s.current_period_started_at,'currentPeriodEndsAt',s.current_period_ends_at,'cancelAtPeriodEnd',coalesce(s.cancel_at_period_end,false)),
    'limits',jsonb_build_object(
      'countedClients',case when s.subscription_kind = 'trial' then t.max_counted_clients else p.max_counted_clients end,
      'includedCoachSeats',case when s.subscription_kind = 'trial' then t.included_coach_seats else p.included_coach_seats end,
      'maxCoachSeats',case when s.subscription_kind = 'trial' then t.max_coach_seats else p.max_coach_seats end,
      'activeWorkspaces',case when s.subscription_kind = 'trial' then t.max_active_workspaces else p.max_active_workspaces end,
      'publishedPackages',case when s.subscription_kind = 'trial' then t.max_published_packages else p.max_published_packages end),
    'targetFeatureKeys',v_targets,'enabledFeatureKeys',v_enabled,'computedAt',now());
end;
$$;
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
    public.billing_plan_change_capacity_limit(p_account,k.key,(e->'limits'->>k.limit_key)::integer),e#>>'{subscription,effectiveStatus}' <> 'no_subscription',
    coalesce((select bool_or(s.quality) from subjects s where s.dimension=k.key),false)
      or (k.key='counted_clients' and exists(select 1 from public.invites i join public.workspaces w on w.id=i.workspace_id
        where w.owner_user_id=p_owner and i.role::text='client' and i.max_uses=1 and i.uses=0 and i.used_at is null and (i.expires_at is null or i.expires_at>t))),
    least((e#>>'{limits,includedCoachSeats}')::integer,public.billing_plan_change_capacity_limit(p_account,'coach_seats',(e#>>'{limits,maxCoachSeats}')::integer))) order by k.ordinal) into dims from keys k;
  return jsonb_build_object('schemaVersion',1,'billingAccountId',p_account,'ownerUserId',p_owner,
    'subscription',e->'subscription','dimensions',dims,'hasAnyDataQualityIssue',exists(select 1 from jsonb_array_elements(dims) d where (d->>'dataQualityIssue')::boolean),'computedAt',t);
end;
$$;

create or replace function public.reconcile_billing_provider_subscription(p_delivery uuid,p_snapshot jsonb default null)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare processor text:=p_snapshot->>'payment_processor'; o public.billing_plan_change_operations%rowtype; d public.billing_provider_webhook_deliveries%rowtype; b public.billing_provider_subscriptions%rowtype;
  t public.billing_checkout_attempts%rowtype; m public.billing_provider_variant_mappings%rowtype;
  a uuid; local_id uuid; old_kind text; local_status text; h text; code text; sid text; stamp timestamptz; end_at timestamptz;
  tx_at constant timestamptz:=transaction_timestamp(); cancel_pending boolean; provider_created timestamptz;
begin
  p_snapshot:=p_snapshot-'payment_processor';
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
    if (p_snapshot->>'quantity')::integer is distinct from 1 then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
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
        update public.billing_provider_subscriptions set provider_status=p_snapshot->>'status',provider_cancelled=(p_snapshot->>'cancelled')::boolean,
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
    if code not in ('BILLING_UNAPPROVED_PLAN_CHANGE','BILLING_WEBHOOK_ENVIRONMENT_MISMATCH','BILLING_WEBHOOK_STORE_MISMATCH','BILLING_SUBSCRIPTION_IDENTITY_MISMATCH','BILLING_SUBSCRIPTION_VARIANT_MISMATCH','BILLING_SUBSCRIPTION_PRICE_MISMATCH','BILLING_SUBSCRIPTION_UNSUPPORTED_TRIAL','BILLING_RECONCILIATION_MANUAL_REVIEW') then
      update public.billing_provider_webhook_deliveries set processing_status='failed',last_error_code='BILLING_RECONCILIATION_FAILED' where id=d.id;
      return 'failed';
    end if;
    update public.billing_plan_change_operations set status='manual_review',error_code='BILLING_PLAN_CHANGE_MANUAL_REVIEW',updated_at=now()
      where billing_provider_subscription_id=b.id and status not in ('completed','canceled','failed');
    -- All activation writes above roll back together before review metadata is saved.
    update public.billing_provider_subscriptions set reconciliation_status='manual_review',reconciliation_error_code=code where id=b.id;
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code=code where id=d.id;
    return 'ignored';
  end;
end $$;

create function public.finish_billing_plan_change(p_owner uuid,p_environment text,p_snapshot jsonb,p_invoice jsonb default null) returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; h text; payload jsonb; event text; d uuid;
begin
  ctx:=public.billing_plan_change_context(p_owner,p_environment);
  if p_snapshot->>'subscription_id' is distinct from ctx#>>'{subscription,provider_subscription_id}' then raise exception 'BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE'; end if;
  event:=case when p_invoice is null then 'subscription_updated' else 'subscription_payment_success' end;
  payload:=coalesce(p_invoice,jsonb_build_object('store_id',p_snapshot->>'store_id','subscription_id',p_snapshot->>'subscription_id','customer_id',p_snapshot->>'customer_id','test_mode',p_environment='test','created_at',p_snapshot->>'created_at','updated_at',p_snapshot->>'updated_at'));
  -- API reconciliation uses the same durable inbox and validators. The hash
  -- namespaces this evidence separately from signed webhook deliveries.
  h:=encode(extensions.digest('api-reconciliation:'||p_snapshot::text||payload::text,'sha256'),'hex');
  d:=public.record_billing_webhook_delivery(p_environment,event,case when p_invoice is null then 'subscriptions' else 'subscription-invoices' end,p_snapshot->>'subscription_id',h,encode(extensions.digest(p_environment||chr(10)||event||chr(10)||h,'sha256'),'hex'),payload);
  return public.reconcile_billing_provider_subscription(d,p_snapshot);
end $$;

revoke all on function public.classify_billing_plan_change(text,text,text,text),public.protect_billing_plan_change_history(),public.audit_billing_plan_change(),public.billing_plan_change_context(uuid,text),public.billing_plan_change_preflight(uuid,uuid,uuid),public.preview_billing_plan_change(uuid,text,text,text,jsonb),public.begin_billing_plan_change(uuid,text,text,text,uuid,jsonb),public.billing_plan_change_capacity_limit(uuid,text,integer),public.apply_verified_billing_plan_change(uuid,jsonb,text,jsonb),public.fail_billing_plan_change(uuid,uuid,boolean),public.begin_cancel_billing_plan_change(uuid,text,uuid),public.get_my_billing_plan_change_state(),public.finish_billing_plan_change(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_my_billing_plan_change_state() to authenticated;
grant execute on function public.billing_plan_change_context(uuid,text),public.preview_billing_plan_change(uuid,text,text,text,jsonb),public.begin_billing_plan_change(uuid,text,text,text,uuid,jsonb),public.fail_billing_plan_change(uuid,uuid,boolean),public.begin_cancel_billing_plan_change(uuid,text,uuid),public.finish_billing_plan_change(uuid,text,jsonb,jsonb) to service_role;
create or replace function public.get_billing_portal_subscription(p_owner uuid,p_environment text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; s uuid; b public.billing_provider_subscriptions%rowtype; local_status text;
begin
  if p_owner is null or not exists(select 1 from public.pt_profiles where user_id=p_owner and workspace_id is null) then
    raise exception 'BILLING_PORTAL_OWNER_REQUIRED' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=p_owner;
  if a is null then raise exception 'BILLING_PORTAL_SUBSCRIPTION_NOT_FOUND'; end if;
  select id,status into s,local_status from public.account_subscriptions where billing_account_id=a and status<>'superseded'
    order by (status in ('trialing','trial_recovery','active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  select * into b from public.billing_provider_subscriptions where billing_account_id=a and account_subscription_id=s
    and provider='lemonsqueezy' and environment=p_environment;
  if b.id is null then raise exception 'BILLING_PORTAL_SUBSCRIPTION_NOT_FOUND'; end if;
  if b.provider_store_id is distinct from public.get_billing_provider_store(p_environment) then
    raise exception 'BILLING_PORTAL_IDENTITY_MISMATCH'; end if;
  if not exists(select 1 from public.account_subscriptions where id=s and subscription_kind='paid') or
    not exists(select 1 from public.billing_provider_customers where billing_account_id=a and provider=b.provider and environment=b.environment
      and provider_store_id=b.provider_store_id and provider_customer_id=b.provider_customer_id) then
    raise exception 'BILLING_PORTAL_IDENTITY_MISMATCH'; end if;
  return jsonb_build_object('provider',b.provider,'environment',b.environment,'store_id',b.provider_store_id,
    'customer_id',b.provider_customer_id,'subscription_id',b.provider_subscription_id,'local_subscription_id',s,'local_status',local_status);
end $$;

create or replace function public.get_my_billing_provider_summary() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; s public.account_subscriptions%rowtype; b public.billing_provider_subscriptions%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null) then
    raise exception 'BILLING_PORTAL_OWNER_REQUIRED' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=auth.uid();
  select * into s from public.account_subscriptions where billing_account_id=a and status<>'superseded'
    order by (status in ('trialing','trial_recovery','active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  select * into b from public.billing_provider_subscriptions where billing_account_id=a and account_subscription_id=s.id;
  return jsonb_build_object('linked',b.id is not null,'status',case when b.id is not null then s.status else null end,
    'cancelAtPeriodEnd',coalesce(s.cancel_at_period_end,false),'currentPeriodEndsAt',s.current_period_ends_at,
    'reconciliationStatus',b.reconciliation_status,'errorCode',case when b.reconciliation_status='manual_review' then
      case when b.reconciliation_error_code='BILLING_UNAPPROVED_PLAN_CHANGE' then 'BILLING_UNAPPROVED_PLAN_CHANGE' else 'BILLING_RECONCILIATION_MANUAL_REVIEW' end else null end,
    'revision',case when b.id is not null then b.latest_snapshot_sha256 else null end,
    'pending',exists(select 1 from public.billing_provider_webhook_deliveries d where d.provider=b.provider and d.environment=b.environment
      and d.provider_subscription_id=b.provider_subscription_id and d.processing_status in ('received','deferred','failed')));
end $$;


commit;
