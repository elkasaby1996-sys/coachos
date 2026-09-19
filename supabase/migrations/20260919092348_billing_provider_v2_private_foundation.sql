-- BILLING-DB-01: dormant private persistence only. No v1 changes or provider calls.
begin;

-- Domains validate without normalizing external bytes. NULL is allowed by the
-- domain; required columns declare NOT NULL separately.
create domain public.billing_v2_ref as text collate "C"
  check (value ~ '[^[:space:]]' and octet_length(value) <= 512);
create domain public.billing_v2_sha256 as text collate "C"
  check (value ~ '^[0-9a-f]{64}$');

create table public.billing_runtime_policy (
  id smallint primary key check (id = 1),
  entitlement_environment text not null check (entitlement_environment in ('test','live')),
  paddle_sales_enabled boolean not null default false,
  paddle_reconciliation_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.billing_runtime_policy(id,entitlement_environment) values (1,'test');

create table public.billing_price_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider='paddle'),
  environment text not null check (environment in ('test','live')),
  identity_kind text not null check (identity_kind in ('plan','addon')),
  canonical_key text not null,
  cadence text not null check (cadence in ('monthly','annual')),
  plan_version_id uuid references public.commercial_plan_versions(id) on update restrict on delete restrict,
  addon_version_id uuid references public.commercial_addon_versions(id) on update restrict on delete restrict,
  provider_product_ref public.billing_v2_ref,
  provider_price_ref public.billing_v2_ref not null,
  currency_code text not null check (currency_code='USD'),
  unit_amount_minor bigint not null check (unit_amount_minor>0),
  recurrence_unit text not null check (recurrence_unit in ('month','year')),
  recurrence_count integer not null check (recurrence_count=1),
  quantity_model text not null default 'separate_recurring_item' check (quantity_model='separate_recurring_item'),
  status text not null check (status in ('draft','active','retired')),
  verified_at timestamptz,
  verification_sha256 public.billing_v2_sha256,
  verification_evidence_id uuid,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,environment,provider_price_ref),
  unique(id,provider,environment,cadence,identity_kind),
  check ((identity_kind='plan' and canonical_key in ('launch','growth','scale') and plan_version_id is not null and addon_version_id is null)
    or (identity_kind='addon' and canonical_key='coach-seat' and addon_version_id is not null and plan_version_id is null)),
  check ((cadence='monthly' and recurrence_unit='month') or (cadence='annual' and recurrence_unit='year')),
  check ((status='retired')=(retired_at is not null)),
  check (status<>'active' or (verified_at is not null and verification_sha256 is not null and verification_evidence_id is not null))
);
create unique index billing_v2_active_price on public.billing_price_mappings(provider,environment,canonical_key,cadence) where status='active';

create table public.billing_customers_v2 (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on update restrict on delete restrict,
  provider text not null check (provider='paddle'),
  environment text not null check (environment in ('test','live')),
  provider_customer_ref public.billing_v2_ref not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,environment,provider_customer_ref),
  unique(billing_account_id,provider,environment),
  unique(id,billing_account_id,provider,environment),
  check(last_seen_at>=first_seen_at)
);

create table public.billing_subscriptions_v2 (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on update restrict on delete restrict,
  customer_id uuid not null,
  provider text not null check (provider='paddle'),
  environment text not null check (environment in ('test','live')),
  provider_subscription_ref public.billing_v2_ref not null,
  account_subscription_id uuid unique,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending','processed','manual_review')),
  approved_additional_coach_seats integer not null default 0 check(approved_additional_coach_seats>=0),
  provider_status text,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  scheduled_cancel_at timestamptz,
  latest_evidence_id uuid,
  latest_snapshot_sha256 public.billing_v2_sha256,
  last_reconciled_at timestamptz,
  reconciliation_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,environment,provider_subscription_ref),
  unique(id,provider,environment),
  unique(id,billing_account_id,provider,environment),
  foreign key(customer_id,billing_account_id,provider,environment)
    references public.billing_customers_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(billing_account_id,account_subscription_id)
    references public.account_subscriptions(billing_account_id,id) on update restrict on delete restrict,
  check(current_period_ends_at>current_period_started_at),
  check(provider_updated_at>=provider_created_at),
  -- Until DB-02 guards and a verified writer exist, no canonical linkage or
  -- approved capacity may be recorded, even by accidentally granted DML.
  constraint billing_v2_canonical_link_disabled check(account_subscription_id is null),
  constraint billing_v2_seat_approval_disabled check(approved_additional_coach_seats=0)
);

create table public.billing_webhook_events_v2 (
  id uuid primary key default gen_random_uuid(),
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  provider_event_ref public.billing_v2_ref not null,
  provider_event_name public.billing_v2_ref not null,
  resource_type public.billing_v2_ref not null,
  resource_ref public.billing_v2_ref not null,
  occurred_at timestamptz not null,
  first_payload_sha256 public.billing_v2_sha256 not null,
  subscription_ref public.billing_v2_ref,
  customer_ref public.billing_v2_ref,
  processing_status text not null default 'received' check(processing_status in ('received','processed','ignored','deferred','failed','manual_review')),
  attempt_count integer not null default 0 check(attempt_count>=0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_attempt_at timestamptz,
  last_error_code text,
  unique(provider,environment,provider_event_ref),
  unique(id,provider,environment)
);

create table public.billing_evidence_v2 (
  id uuid primary key default gen_random_uuid(),
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  source_kind text not null check(source_kind in ('webhook','api_reconciliation','catalogue_verification')),
  proof_kind text not null check(proof_kind in ('event','subscription','transaction','catalogue')),
  -- This version establishes structure ONLY. It is not paddle.v1 proof.
  proof_schema text not null check(proof_schema='billing-foundation-v1'),
  validator_version text not null check(validator_version='structure-only-v1'),
  replay_algorithm text not null check(replay_algorithm in ('delivery-evidence-v1','api-evidence-v1','catalogue-evidence-v1')),
  replay_key public.billing_v2_sha256 not null,
  normalized_sha256 public.billing_v2_sha256 not null,
  proof jsonb not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  event_id uuid,
  subscription_id uuid,
  provider_notification_ref public.billing_v2_ref,
  raw_payload_sha256 public.billing_v2_sha256,
  provider_transaction_ref public.billing_v2_ref,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  unique(id,provider,environment),
  unique(id,subscription_id,provider,environment),
  unique(id,subscription_id,provider,environment,provider_transaction_ref),
  unique(provider,environment,source_kind,proof_kind,replay_algorithm,replay_key),
  foreign key(event_id,provider,environment) references public.billing_webhook_events_v2(id,provider,environment) on update restrict on delete restrict,
  foreign key(subscription_id,provider,environment) references public.billing_subscriptions_v2(id,provider,environment) on update restrict on delete restrict,
  check (jsonb_typeof(proof)='object' and octet_length(proof::text)<=65536),
  check ((proof ?& array['schema','provider','environment','kind','identity'])
    and proof-array['schema','provider','environment','kind','identity','catalogue','observation']='{}'::jsonb),
  check ((proof->>'schema' = proof_schema and proof->>'provider'=provider and proof->>'environment'=environment
    and proof->>'kind'=proof_kind and jsonb_typeof(proof->'identity')='object') is true),
  check (case when proof_kind='catalogue' then jsonb_typeof(proof->'catalogue')='object' and not proof ? 'observation'
    else jsonb_typeof(proof->'observation')='object' and not proof ? 'catalogue' end is true),
  check ((source_kind='webhook' and event_id is not null and raw_payload_sha256 is not null and replay_algorithm='delivery-evidence-v1' and proof_kind<>'catalogue')
    or (source_kind='api_reconciliation' and event_id is null and raw_payload_sha256 is null and provider_notification_ref is null and replay_algorithm='api-evidence-v1' and proof_kind in ('subscription','transaction'))
    or (source_kind='catalogue_verification' and proof_kind='catalogue' and event_id is null and subscription_id is null
      and raw_payload_sha256 is null and provider_notification_ref is null and provider_transaction_ref is null and replay_algorithm='catalogue-evidence-v1')),
  check ((proof_kind='transaction')=(provider_transaction_ref is not null)),
  check (proof_kind not in ('subscription','transaction') or subscription_id is not null),
  check (provider_updated_at>=provider_created_at)
);
comment on table public.billing_evidence_v2 is 'Append-only structural evidence. structure-only-v1 is not provider verification or payment authority. No API writer is granted.';

alter table public.billing_price_mappings add constraint billing_v2_mapping_evidence_fk
  foreign key(verification_evidence_id,provider,environment) references public.billing_evidence_v2(id,provider,environment) on update restrict on delete restrict;
alter table public.billing_subscriptions_v2 add constraint billing_v2_subscription_evidence_fk
  foreign key(latest_evidence_id,id,provider,environment) references public.billing_evidence_v2(id,subscription_id,provider,environment)
  on update restrict on delete restrict deferrable initially deferred;

create table public.billing_subscription_items_v2 (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  billing_account_id uuid not null,
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  item_role text not null check(item_role in ('base_plan','coach_seat')),
  mapping_id uuid not null,
  cadence text not null check(cadence in ('monthly','annual')),
  mapping_kind text not null,
  quantity integer not null check(quantity>0),
  evidence_id uuid not null,
  provider_item_ref public.billing_v2_ref,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_id,item_role),
  unique(subscription_id,provider_item_ref),
  foreign key(subscription_id,billing_account_id,provider,environment) references public.billing_subscriptions_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(mapping_id,provider,environment,cadence,mapping_kind) references public.billing_price_mappings(id,provider,environment,cadence,identity_kind) on update restrict on delete restrict,
  foreign key(evidence_id,subscription_id,provider,environment) references public.billing_evidence_v2(id,subscription_id,provider,environment) on update restrict on delete restrict,
  check((item_role='base_plan' and mapping_kind='plan' and quantity=1) or (item_role='coach_seat' and mapping_kind='addon')),
  check(provider_updated_at>=provider_created_at)
);

create table public.billing_checkouts_v2 (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on update restrict on delete restrict,
  created_by_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  operation_id uuid not null,
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  plan_version_id uuid not null references public.commercial_plan_versions(id) on update restrict on delete restrict,
  cadence text not null check(cadence in ('monthly','annual')),
  base_mapping_id uuid not null,
  base_mapping_kind text not null default 'plan' check(base_mapping_kind='plan'),
  seat_mapping_id uuid,
  seat_mapping_kind text check(seat_mapping_kind='addon'),
  requested_additional_seats integer not null default 0 check(requested_additional_seats>=0),
  status text not null check(status in ('creating','ready','completed','failed','ambiguous','expired')),
  expected_expires_at timestamptz not null,
  creation_lease_expires_at timestamptz not null,
  provider_checkout_ref public.billing_v2_ref,
  provider_transaction_ref public.billing_v2_ref,
  provider_expires_at timestamptz,
  completed_subscription_id uuid,
  error_code text,
  completed_at timestamptz,
  failed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(billing_account_id,operation_id),
  unique(provider,environment,provider_checkout_ref),
  unique(provider,environment,provider_transaction_ref),
  unique(id,billing_account_id,provider,environment),
  foreign key(base_mapping_id,provider,environment,cadence,base_mapping_kind) references public.billing_price_mappings(id,provider,environment,cadence,identity_kind) on update restrict on delete restrict,
  foreign key(seat_mapping_id,provider,environment,cadence,seat_mapping_kind) references public.billing_price_mappings(id,provider,environment,cadence,identity_kind) on update restrict on delete restrict,
  foreign key(completed_subscription_id,billing_account_id,provider,environment) references public.billing_subscriptions_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  check((requested_additional_seats=0 and seat_mapping_id is null and seat_mapping_kind is null)
    or (requested_additional_seats>0 and seat_mapping_id is not null and seat_mapping_kind is not null)),
  check(expected_expires_at>created_at and creation_lease_expires_at>created_at and creation_lease_expires_at<=expected_expires_at),
  check((status='completed')=(completed_at is not null) and (status='completed')=(completed_subscription_id is not null)),
  check((status='failed')=(failed_at is not null) and (status='expired')=(expired_at is not null)),
  check(status<>'ready' or provider_checkout_ref is not null or provider_transaction_ref is not null)
);
create unique index billing_v2_one_open_checkout on public.billing_checkouts_v2(billing_account_id) where status in ('creating','ready','ambiguous');

create table public.billing_operations_v2 (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  billing_account_id uuid not null references public.billing_accounts(id) on update restrict on delete restrict,
  subscription_id uuid not null,
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  source_account_subscription_id uuid not null,
  operation_kind text not null check(operation_kind in ('plan_change','seat_quantity')),
  source_base_mapping_id uuid not null,
  target_base_mapping_id uuid not null,
  source_base_mapping_kind text not null default 'plan' check(source_base_mapping_kind='plan'),
  target_base_mapping_kind text not null default 'plan' check(target_base_mapping_kind='plan'),
  source_seat_mapping_id uuid,
  target_seat_mapping_id uuid,
  source_seat_mapping_kind text check(source_seat_mapping_kind='addon'),
  target_seat_mapping_kind text check(target_seat_mapping_kind='addon'),
  source_cadence text not null check(source_cadence in ('monthly','annual')),
  target_cadence text not null check(target_cadence in ('monthly','annual')),
  source_additional_seats integer not null check(source_additional_seats>=0),
  target_additional_seats integer not null check(target_additional_seats>=0),
  effective_timing text not null check(effective_timing in ('immediate','period_end')),
  status text not null check(status in ('requested','provider_pending','awaiting_payment','scheduled','cancel_pending','completed','canceled','failed','ambiguous','manual_review')),
  preflight_snapshot jsonb not null,
  change_kind text,
  requested_at timestamptz not null default now(),
  provider_requested_at timestamptz,
  provider_applied_at timestamptz,
  payment_confirmed_at timestamptz,
  effective_at timestamptz,
  cancel_requested_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  failed_at timestamptz,
  ambiguous_at timestamptz,
  last_evidence_id uuid,
  error_code text,
  created_by_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(billing_account_id,operation_id),
  unique(id,billing_account_id,provider,environment),
  foreign key(subscription_id,billing_account_id,provider,environment) references public.billing_subscriptions_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(billing_account_id,source_account_subscription_id) references public.account_subscriptions(billing_account_id,id) on update restrict on delete restrict,
  foreign key(source_base_mapping_id,provider,environment,source_cadence,source_base_mapping_kind) references public.billing_price_mappings(id,provider,environment,cadence,identity_kind) on update restrict on delete restrict,
  foreign key(target_base_mapping_id,provider,environment,target_cadence,target_base_mapping_kind) references public.billing_price_mappings(id,provider,environment,cadence,identity_kind) on update restrict on delete restrict,
  foreign key(source_seat_mapping_id,provider,environment,source_cadence,source_seat_mapping_kind) references public.billing_price_mappings(id,provider,environment,cadence,identity_kind) on update restrict on delete restrict,
  foreign key(target_seat_mapping_id,provider,environment,target_cadence,target_seat_mapping_kind) references public.billing_price_mappings(id,provider,environment,cadence,identity_kind) on update restrict on delete restrict,
  foreign key(last_evidence_id,subscription_id,provider,environment) references public.billing_evidence_v2(id,subscription_id,provider,environment) on update restrict on delete restrict,
  check((source_additional_seats=0 and source_seat_mapping_id is null and source_seat_mapping_kind is null)
    or (source_additional_seats>0 and source_seat_mapping_id is not null and source_seat_mapping_kind is not null)),
  check((target_additional_seats=0 and target_seat_mapping_id is null and target_seat_mapping_kind is null)
    or (target_additional_seats>0 and target_seat_mapping_id is not null and target_seat_mapping_kind is not null)),
  check((operation_kind='plan_change' and source_additional_seats=target_additional_seats and source_base_mapping_id<>target_base_mapping_id
      and change_kind is not null and change_kind in ('tier_upgrade','cadence_upgrade','combined_upgrade','tier_downgrade','cadence_downgrade','combined_downgrade'))
    or (operation_kind='seat_quantity' and source_base_mapping_id=target_base_mapping_id and source_cadence=target_cadence
      and source_additional_seats<>target_additional_seats and change_kind is null
      and (target_additional_seats>source_additional_seats)=(effective_timing='immediate'))),
  check(jsonb_typeof(preflight_snapshot)='object' and
    preflight_snapshot-array['schemaVersion','dimensions','hasAnyDataQualityIssue']='{}'::jsonb and
    (preflight_snapshot->'schemaVersion'='1'::jsonb and jsonb_typeof(preflight_snapshot->'dimensions')='array'
      and jsonb_typeof(preflight_snapshot->'hasAnyDataQualityIssue')='boolean') is true),
  check((status='completed')=(completed_at is not null) and (status='canceled')=(canceled_at is not null) and (status='failed')=(failed_at is not null)),
  check(effective_timing<>'period_end' or effective_at is not null),
  check(status<>'completed' or (provider_applied_at is not null and (effective_timing<>'immediate' or payment_confirmed_at is not null)))
);
create unique index billing_v2_one_open_operation on public.billing_operations_v2(subscription_id) where status not in ('completed','canceled','failed');
create table public.billing_operation_events_v2 (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.billing_operations_v2(id) on update restrict on delete restrict,
  event_type text not null check(event_type ~ '[^[:space:]]'),
  occurred_at timestamptz not null default now(),
  unique(operation_id,event_type)
);

create table public.billing_payment_applications_v2 (
  id uuid primary key default gen_random_uuid(),
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  provider_transaction_ref public.billing_v2_ref not null,
  billing_account_id uuid not null references public.billing_accounts(id) on update restrict on delete restrict,
  subscription_id uuid not null,
  evidence_id uuid not null,
  application_kind text not null check(application_kind in ('initial','plan_change','seat_increase')),
  checkout_id uuid,
  operation_id uuid,
  applied_at timestamptz not null default now(),
  unique(provider,environment,provider_transaction_ref),
  unique(checkout_id), unique(operation_id),
  foreign key(subscription_id,billing_account_id,provider,environment) references public.billing_subscriptions_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(evidence_id,subscription_id,provider,environment,provider_transaction_ref) references public.billing_evidence_v2(id,subscription_id,provider,environment,provider_transaction_ref) on update restrict on delete restrict,
  foreign key(checkout_id,billing_account_id,provider,environment) references public.billing_checkouts_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(operation_id,billing_account_id,provider,environment) references public.billing_operations_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  check((application_kind='initial' and checkout_id is not null and operation_id is null)
    or (application_kind in ('plan_change','seat_increase') and operation_id is not null and checkout_id is null))
);

-- No SECURITY DEFINER functions or RPCs: these invoker triggers only reject or
-- validate new storage writes; none write canonical tables or invoke v1 RPCs.
create function public.billing_v2_protect_history() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op in ('DELETE','TRUNCATE') then raise exception 'BILLING_V2_HISTORY_IMMUTABLE'; end if;
  if tg_nargs>1 and (to_jsonb(old)->>'status')=any(string_to_array(tg_argv[1],',')) and new is distinct from old then
    raise exception 'BILLING_V2_TERMINAL_IMMUTABLE';
  end if;
  if (to_jsonb(new)-string_to_array(tg_argv[0],',')) is distinct from (to_jsonb(old)-string_to_array(tg_argv[0],',')) then
    raise exception 'BILLING_V2_IDENTITY_IMMUTABLE';
  end if;
  return new;
end $$;

create function public.billing_v2_validate_evidence() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype; c public.billing_customers_v2%rowtype; e public.billing_webhook_events_v2%rowtype;
begin
  if new.normalized_sha256 is distinct from encode(extensions.digest(new.proof::text,'sha256'),'hex') then
    raise exception 'BILLING_V2_EVIDENCE_DIGEST_MISMATCH';
  end if;
  if jsonb_typeof(new.proof->'identity') is distinct from 'object' or
    (new.proof->'identity')-array['subscriptionRef','customerRef','transactionRef','eventRef','resourceRef','priceRef']<>'{}'::jsonb then
    raise exception 'BILLING_V2_EVIDENCE_IDENTITY_MISMATCH';
  end if;
  if exists(select 1 from jsonb_each(new.proof->'identity') p where jsonb_typeof(p.value)<>'string'
    or not (p.value#>>'{}' ~ '[^[:space:]]') or octet_length(p.value#>>'{}')>512) then
    raise exception 'BILLING_V2_EVIDENCE_IDENTITY_MISMATCH';
  end if;
  if new.subscription_id is not null then
    select * into strict s from public.billing_subscriptions_v2 where id=new.subscription_id;
    select * into strict c from public.billing_customers_v2 where id=s.customer_id;
    if (new.provider,new.environment,new.proof#>>'{identity,subscriptionRef}',new.proof#>>'{identity,customerRef}') is distinct from
      (s.provider,s.environment,s.provider_subscription_ref::text,c.provider_customer_ref::text) then raise exception 'BILLING_V2_EVIDENCE_IDENTITY_MISMATCH'; end if;
  end if;
  if new.proof_kind='transaction' and new.proof#>>'{identity,transactionRef}' is distinct from new.provider_transaction_ref::text then
    raise exception 'BILLING_V2_EVIDENCE_IDENTITY_MISMATCH';
  end if;
  if new.event_id is not null then
    select * into strict e from public.billing_webhook_events_v2 where id=new.event_id;
    if (new.provider,new.environment,new.proof#>>'{identity,eventRef}',new.proof#>>'{identity,resourceRef}') is distinct from
      (e.provider,e.environment,e.provider_event_ref::text,e.resource_ref::text) then raise exception 'BILLING_V2_EVIDENCE_IDENTITY_MISMATCH'; end if;
    if new.subscription_id is not null and (e.subscription_ref is distinct from s.provider_subscription_ref or e.customer_ref is distinct from c.provider_customer_ref) then
      raise exception 'BILLING_V2_EVIDENCE_IDENTITY_MISMATCH';
    end if;
    if new.replay_key is distinct from encode(extensions.digest(jsonb_build_array(e.provider_event_ref,new.provider_notification_ref,new.raw_payload_sha256)::text,'sha256'),'hex') then
      raise exception 'BILLING_V2_EVIDENCE_REPLAY_MISMATCH';
    end if;
  end if;
  return new;
end $$;
create trigger billing_v2_evidence_structure before insert on public.billing_evidence_v2 for each row execute function public.billing_v2_validate_evidence();

create function public.billing_v2_protect_mapping() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare p public.commercial_plan_versions%rowtype; a public.commercial_addon_versions%rowtype;
  e public.billing_evidence_v2%rowtype; expected jsonb; canonical_status text;
begin
  if tg_op='DELETE' then raise exception 'BILLING_V2_HISTORY_IMMUTABLE'; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.created_at<>old.created_at or old.status='retired'
    or (old.status='active' and (new.status not in ('active','retired') or
      (to_jsonb(new)-array['status','retired_at','updated_at']) is distinct from (to_jsonb(old)-array['status','retired_at','updated_at'])))) then
    raise exception 'BILLING_V2_MAPPING_IMMUTABLE';
  end if;
  if new.identity_kind='plan' then
    select * into strict p from public.commercial_plan_versions where id=new.plan_version_id for share;
    if (new.canonical_key,new.currency_code,new.unit_amount_minor) is distinct from
      (p.plan_key,p.currency_code,(case new.cadence when 'monthly' then p.monthly_price_minor else p.annual_price_minor end)::bigint) then raise exception 'BILLING_V2_MAPPING_MISMATCH'; end if;
    canonical_status:=p.status;
  else
    select * into strict a from public.commercial_addon_versions where id=new.addon_version_id for share;
    if a.addon_key<>'coach_seat' or (new.canonical_key,new.currency_code,new.unit_amount_minor) is distinct from
      ('coach-seat'::text,a.currency_code,(case new.cadence when 'monthly' then a.monthly_unit_amount_minor else a.annual_unit_amount_minor end)::bigint) then raise exception 'BILLING_V2_MAPPING_MISMATCH'; end if;
    canonical_status:=a.status;
  end if;
  if new.status='active' and (tg_op='INSERT' or old.status='draft') and canonical_status<>'active' then raise exception 'BILLING_V2_MAPPING_MISMATCH'; end if;
  if new.status in ('active','retired') then
    select * into strict e from public.billing_evidence_v2 where id=new.verification_evidence_id;
    expected:=jsonb_build_object('canonicalKey',new.canonical_key,'identityKind',new.identity_kind,
      'planVersionId',new.plan_version_id,'addonVersionId',new.addon_version_id,'cadence',new.cadence,
      'productRef',new.provider_product_ref,'priceRef',new.provider_price_ref,'currency',new.currency_code,
      'unitAmountMinor',new.unit_amount_minor,'recurrenceUnit',new.recurrence_unit,'recurrenceCount',new.recurrence_count,
      'quantityModel',new.quantity_model,'trial',false);
    if e.proof_kind<>'catalogue' or (e.provider,e.environment) is distinct from (new.provider,new.environment)
      or e.proof->'catalogue' is distinct from expected or e.proof#>>'{identity,priceRef}' is distinct from new.provider_price_ref::text
      or new.verification_sha256 is distinct from e.normalized_sha256 or new.verified_at is distinct from e.verified_at then
      raise exception 'BILLING_V2_MAPPING_EVIDENCE_MISMATCH';
    end if;
  end if;
  return new;
end $$;
create trigger billing_v2_mapping_history before insert or update or delete on public.billing_price_mappings for each row execute function public.billing_v2_protect_mapping();

create function public.billing_v2_validate_item_set() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare sid uuid; s public.billing_subscriptions_v2%rowtype; n integer;
begin
  sid:=(case when tg_table_name='billing_subscriptions_v2' then to_jsonb(new)->>'id'
    when tg_op='DELETE' then to_jsonb(old)->>'subscription_id' else to_jsonb(new)->>'subscription_id' end)::uuid;
  select * into s from public.billing_subscriptions_v2 where id=sid for update;
  select count(*) into n from public.billing_subscription_items_v2 where subscription_id=sid and item_role='base_plan';
  if s.reconciliation_status='processed' and (n<>1 or s.latest_evidence_id is null or s.latest_snapshot_sha256 is null or s.last_reconciled_at is null) then
    raise exception 'BILLING_V2_RECONCILED_ITEMS_REQUIRED';
  end if;
  if s.latest_evidence_id is not null and not exists(select 1 from public.billing_evidence_v2 e
    where e.id=s.latest_evidence_id and e.subscription_id=s.id and e.proof_kind='subscription'
      and e.normalized_sha256=s.latest_snapshot_sha256) then
    raise exception 'BILLING_V2_SUBSCRIPTION_EVIDENCE_MISMATCH';
  end if;
  if (select count(distinct cadence) from public.billing_subscription_items_v2 where subscription_id=sid)>1 then
    raise exception 'BILLING_V2_ITEM_CADENCE_MISMATCH';
  end if;
  if exists(select 1 from public.billing_subscription_items_v2 i join public.billing_evidence_v2 e on e.id=i.evidence_id
    join public.billing_price_mappings m on m.id=i.mapping_id where i.subscription_id=sid and (e.proof_kind<>'subscription' or m.status not in ('active','retired'))) then
    raise exception 'BILLING_V2_ITEM_EVIDENCE_MISMATCH';
  end if;
  return null;
end $$;
create constraint trigger billing_v2_subscription_items_check after insert or update on public.billing_subscriptions_v2
  deferrable initially deferred for each row execute function public.billing_v2_validate_item_set();
create constraint trigger billing_v2_item_set_check after insert or update or delete on public.billing_subscription_items_v2
  deferrable initially deferred for each row execute function public.billing_v2_validate_item_set();

create function public.billing_v2_validate_intent() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare m public.billing_price_mappings%rowtype; target public.billing_price_mappings%rowtype;
  p public.commercial_plan_versions%rowtype; source_plan public.commercial_plan_versions%rowtype; c jsonb;
begin
  if not exists(select 1 from public.billing_accounts where id=new.billing_account_id and owner_user_id=new.created_by_user_id) then
    raise exception 'BILLING_V2_OWNER_MISMATCH';
  end if;
  if tg_table_name='billing_checkouts_v2' then
    select * into strict m from public.billing_price_mappings where id=new.base_mapping_id for share;
    select * into strict p from public.commercial_plan_versions where id=new.plan_version_id;
    if m.plan_version_id is distinct from p.id or new.requested_additional_seats>p.max_coach_seats-p.included_coach_seats then raise exception 'BILLING_V2_INTENT_MISMATCH'; end if;
    if tg_op='INSERT' and (m.status<>'active' or (new.seat_mapping_id is not null and not exists(
      select 1 from public.billing_price_mappings where id=new.seat_mapping_id and status='active'))) then raise exception 'BILLING_V2_MAPPING_UNAVAILABLE'; end if;
  else
    select * into strict m from public.billing_price_mappings where id=new.source_base_mapping_id for share;
    select * into strict target from public.billing_price_mappings where id=new.target_base_mapping_id for share;
    select * into strict p from public.commercial_plan_versions where id=target.plan_version_id;
    select * into strict source_plan from public.commercial_plan_versions where id=m.plan_version_id;
    if new.target_additional_seats>p.max_coach_seats-p.included_coach_seats or new.source_additional_seats>source_plan.max_coach_seats-source_plan.included_coach_seats
      or not exists(select 1 from public.account_subscriptions where id=new.source_account_subscription_id and billing_account_id=new.billing_account_id and subscription_kind='paid' and plan_version_id=m.plan_version_id) then raise exception 'BILLING_V2_INTENT_MISMATCH'; end if;
    if tg_op='INSERT' and (m.status not in ('active','retired') or target.status<>'active'
      or (new.source_seat_mapping_id is not null and not exists(select 1 from public.billing_price_mappings where id=new.source_seat_mapping_id and status in ('active','retired')))
      or (new.target_seat_mapping_id is not null and not exists(select 1 from public.billing_price_mappings where id=new.target_seat_mapping_id and status='active'))) then raise exception 'BILLING_V2_MAPPING_UNAVAILABLE'; end if;
    if new.operation_kind='plan_change' then
      -- Pure canonical classification only; this invokes no legacy writer.
      c:=public.classify_billing_plan_change(source_plan.plan_key,new.source_cadence,p.plan_key,new.target_cadence);
      if (new.change_kind,new.effective_timing) is distinct from (c->>'changeKind',c->>'effectiveTiming') then raise exception 'BILLING_V2_INTENT_MISMATCH'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger billing_v2_checkout_structure before insert or update on public.billing_checkouts_v2 for each row execute function public.billing_v2_validate_intent();
create trigger billing_v2_operation_structure before insert or update on public.billing_operations_v2 for each row execute function public.billing_v2_validate_intent();

create function public.billing_v2_validate_payment_application() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_evidence_v2%rowtype; o public.billing_operations_v2%rowtype;
begin
  select * into strict e from public.billing_evidence_v2 where id=new.evidence_id;
  if e.proof_kind<>'transaction' then raise exception 'BILLING_V2_PAYMENT_STRUCTURE_MISMATCH'; end if;
  if new.operation_id is not null then
    select * into strict o from public.billing_operations_v2 where id=new.operation_id;
    if o.subscription_id<>new.subscription_id or (new.application_kind='plan_change' and o.operation_kind<>'plan_change')
      or (new.application_kind='seat_increase' and (o.operation_kind<>'seat_quantity' or o.target_additional_seats<=o.source_additional_seats)) then
      raise exception 'BILLING_V2_PAYMENT_STRUCTURE_MISMATCH';
    end if;
  elsif exists(select 1 from public.billing_checkouts_v2 where id=new.checkout_id and completed_subscription_id is not null and completed_subscription_id<>new.subscription_id) then
    raise exception 'BILLING_V2_PAYMENT_STRUCTURE_MISMATCH';
  end if;
  -- Structural ledger only: this function never certifies settlement or grants
  -- access. No caller receives INSERT privilege or an RPC to reach this table.
  return new;
end $$;
create trigger billing_v2_payment_structure before insert on public.billing_payment_applications_v2 for each row execute function public.billing_v2_validate_payment_application();

create trigger billing_v2_policy_history before update or delete on public.billing_runtime_policy for each row execute function public.billing_v2_protect_history('entitlement_environment,paddle_sales_enabled,paddle_reconciliation_enabled,updated_at');
create trigger billing_v2_customer_history before update or delete on public.billing_customers_v2 for each row execute function public.billing_v2_protect_history('last_seen_at,updated_at');
create trigger billing_v2_subscription_history before update or delete on public.billing_subscriptions_v2 for each row execute function public.billing_v2_protect_history('reconciliation_status,provider_status,provider_updated_at,current_period_started_at,current_period_ends_at,scheduled_cancel_at,latest_evidence_id,latest_snapshot_sha256,last_reconciled_at,reconciliation_error_code,updated_at');
-- No reconciler exists yet to authorize current-item replacement/deletion.
create trigger billing_v2_item_history before update or delete on public.billing_subscription_items_v2 for each row execute function public.billing_v2_protect_history('');
create trigger billing_v2_checkout_history before update or delete on public.billing_checkouts_v2 for each row execute function public.billing_v2_protect_history('status,provider_checkout_ref,provider_transaction_ref,provider_expires_at,completed_subscription_id,error_code,completed_at,failed_at,expired_at,updated_at','completed,failed,expired');
create trigger billing_v2_operation_history before update or delete on public.billing_operations_v2 for each row execute function public.billing_v2_protect_history('status,provider_requested_at,provider_applied_at,payment_confirmed_at,cancel_requested_at,completed_at,canceled_at,failed_at,ambiguous_at,last_evidence_id,error_code,updated_at','completed,canceled,failed');
create trigger billing_v2_operation_event_history before update or delete on public.billing_operation_events_v2 for each row execute function public.billing_v2_protect_history('');
create trigger billing_v2_webhook_history before update or delete on public.billing_webhook_events_v2 for each row execute function public.billing_v2_protect_history('processing_status,attempt_count,processed_at,last_attempt_at,last_error_code');
create trigger billing_v2_evidence_history before update or delete on public.billing_evidence_v2 for each row execute function public.billing_v2_protect_history('');
create trigger billing_v2_payment_history before update or delete on public.billing_payment_applications_v2 for each row execute function public.billing_v2_protect_history('');

-- Explicit, read-only storage-contract projections; no synthetic legacy seats.
create view public.billing_mapping_catalogue_v2 with(security_invoker=true) as
select 'lemonsqueezy.v1'::text as storage_contract,m.id,m.provider,m.environment,'plan'::text as identity_kind,
  p.plan_key as canonical_key,m.plan_version_id,null::uuid as addon_version_id,m.cadence,
  m.provider_product_id collate "C" as provider_product_ref,m.provider_price_id collate "C" as provider_price_ref,
  'legacy_graduated'::text as quantity_model,m.currency_code,m.unit_amount_minor::bigint,m.status,m.verified_at,m.retired_at,
  null::uuid as quantity_price_contract_id
from public.billing_provider_variant_mappings m join public.commercial_plan_versions p on p.id=m.plan_version_id
union all
select 'lemonsqueezy.quantity-contract.v1',q.id,m.provider,m.environment,'addon','coach-seat',null::uuid,q.addon_version_id,m.cadence,
  null::text,null::text,'legacy_graduated',a.currency_code,
  (case m.cadence when 'monthly' then a.monthly_unit_amount_minor else a.annual_unit_amount_minor end)::bigint,
  q.status,q.verified_at,q.retired_at,q.id
from public.billing_quantity_price_contracts q join public.billing_provider_variant_mappings m on m.id=q.variant_mapping_id
join public.commercial_addon_versions a on a.id=q.addon_version_id
union all
select 'billing.v2',id,provider,environment,identity_kind,canonical_key,plan_version_id,addon_version_id,cadence,
  provider_product_ref::text,provider_price_ref::text,quantity_model,currency_code,unit_amount_minor,status,verified_at,retired_at,null::uuid
from public.billing_price_mappings;

create view public.billing_subscription_catalogue_v2 with(security_invoker=true) as
select 'lemonsqueezy.v1'::text as storage_contract,id,billing_account_id,provider,environment,
  provider_subscription_id collate "C" as provider_subscription_ref,account_subscription_id,approved_additional_coach_seats,reconciliation_status,provider_status
from public.billing_provider_subscriptions
union all
select 'billing.v2',id,billing_account_id,provider,environment,provider_subscription_ref::text,account_subscription_id,
  approved_additional_coach_seats,reconciliation_status,provider_status from public.billing_subscriptions_v2;

create view public.billing_open_operations_v2 with(security_invoker=true) as
select 'lemonsqueezy.v1'::text as storage_contract,'plan_change'::text as operation_kind,o.id,o.operation_id,o.billing_account_id,
  o.billing_provider_subscription_id as subscription_id,b.provider,b.environment,o.source_account_subscription_id,
  o.source_variant_mapping_id as source_base_mapping_id,o.target_variant_mapping_id as target_base_mapping_id,
  o.source_cadence,o.target_cadence,null::integer as source_additional_seats,null::integer as target_additional_seats,
  o.status,o.effective_timing,o.effective_at,o.provider_applied_at
from public.billing_plan_change_operations o join public.billing_provider_subscriptions b on b.id=o.billing_provider_subscription_id
where o.status not in ('completed','canceled','failed')
union all
select 'lemonsqueezy.v1','seat_quantity',o.id,o.operation_id,o.billing_account_id,o.billing_provider_subscription_id,
  b.provider,b.environment,o.account_subscription_id,o.variant_mapping_id,o.variant_mapping_id,m.cadence,m.cadence,
  o.source_additional_seats,o.target_additional_seats,o.status,o.effective_timing,o.effective_at,o.provider_applied_at
from public.billing_seat_quantity_operations o join public.billing_provider_subscriptions b on b.id=o.billing_provider_subscription_id
join public.billing_provider_variant_mappings m on m.id=o.variant_mapping_id where o.status not in ('completed','canceled','failed')
union all
select 'billing.v2',operation_kind,id,operation_id,billing_account_id,subscription_id,provider,environment,source_account_subscription_id,
  source_base_mapping_id,target_base_mapping_id,source_cadence,target_cadence,source_additional_seats,target_additional_seats,
  status,effective_timing,effective_at,provider_applied_at from public.billing_operations_v2 where status not in ('completed','canceled','failed');

-- Cover every new FK with a leading-column index (unless its unique/PK index
-- already covers it). Only new relations are considered; no legacy DDL.
do $$
declare r record; cols text;
begin
  for r in select c.* from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and c.contype='f' and t.relname=any(array['billing_price_mappings','billing_customers_v2','billing_subscriptions_v2','billing_subscription_items_v2','billing_checkouts_v2','billing_operations_v2','billing_operation_events_v2','billing_webhook_events_v2','billing_evidence_v2','billing_payment_applications_v2'])
    and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indpred is null and i.indisvalid
      and (i.indkey::smallint[])[0:array_length(c.conkey,1)-1]=c.conkey) loop
    select string_agg(quote_ident(a.attname),',' order by k.ord) into cols
      from unnest(r.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=r.conrelid and a.attnum=k.attnum;
    execute format('create index %I on %s (%s)','bv2_fk_'||substr(md5(r.conrelid::regclass::text||':'||cols),1,20),r.conrelid::regclass,cols);
  end loop;
end $$;

do $$
declare n text; f record;
begin
  foreach n in array array['billing_runtime_policy','billing_price_mappings','billing_customers_v2','billing_subscriptions_v2',
    'billing_subscription_items_v2','billing_checkouts_v2','billing_operations_v2','billing_operation_events_v2',
    'billing_webhook_events_v2','billing_evidence_v2','billing_payment_applications_v2'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
    execute format('create trigger billing_v2_no_truncate before truncate on public.%I for each statement execute function public.billing_v2_protect_history()',n);
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('billing_v2_protect_history','billing_v2_validate_evidence','billing_v2_protect_mapping',
      'billing_v2_validate_item_set','billing_v2_validate_intent','billing_v2_validate_payment_application') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
revoke all on public.billing_mapping_catalogue_v2,public.billing_subscription_catalogue_v2,public.billing_open_operations_v2 from public,anon,authenticated,service_role;
revoke all on domain public.billing_v2_ref,public.billing_v2_sha256 from public,anon,authenticated,service_role;
commit;
