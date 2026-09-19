-- BILLING-DB-02: database guards only; no transport, proof replacement or grants.
begin;

-- Immutable origin tombstones retain ownership after a legacy plan supersession.
-- These are canonical references, not copied provider subscriptions or receipts.
create table public.billing_canonical_origins (
  account_subscription_id uuid primary key,
  billing_account_id uuid not null,
  storage_contract text not null check(storage_contract in ('lemonsqueezy.v1','billing.v2')),
  recorded_at timestamptz not null default now(),
  foreign key(billing_account_id,account_subscription_id)
    references public.account_subscriptions(billing_account_id,id) on update restrict on delete restrict
);
create index billing_canonical_origins_account on public.billing_canonical_origins(billing_account_id,account_subscription_id);
insert into public.billing_canonical_origins(account_subscription_id,billing_account_id,storage_contract)
select id,billing_account_id,'lemonsqueezy.v1' from public.account_subscriptions where source='billing_provider';
alter table public.billing_canonical_origins enable row level security;
revoke all on public.billing_canonical_origins from public,anon,authenticated,service_role;
create trigger billing_origin_history before update or delete on public.billing_canonical_origins
for each row execute function public.billing_v2_protect_history('');
create trigger billing_origin_no_truncate before truncate on public.billing_canonical_origins
for each statement execute function public.billing_v2_protect_history();

-- No new SECURITY DEFINER code. Existing definer entry points invoke these
-- private invoker checks; application roles get no direct helper or DML grant.
create function public.billing_guard_actor(p_account uuid default null,p_owner_allowed boolean default false)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare r text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
  if r in ('postgres','supabase_admin','service_role') then return; end if;
  if p_owner_allowed and r='authenticated' and auth.uid() is not null and exists(
    select 1 from public.billing_accounts where id=p_account and owner_user_id=auth.uid()) then return; end if;
  raise exception 'BILLING_GUARD_FORBIDDEN' using errcode='42501';
end $$;

-- Supported mutation transactions use READ COMMITTED: fresh reads after an
-- account-lock wait must see the winning ledger insert. Higher isolation fails
-- closed instead of relying on a snapshot taken before that wait.
create function public.billing_guard_lock(p_account uuid,p_environment text default null,p_nowait boolean default false)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare env text;
begin
  perform public.billing_guard_actor(p_account,true);
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'BILLING_GUARD_ISOLATION_UNSUPPORTED' using errcode='25001';
  end if;
  if p_nowait then
    select entitlement_environment into strict env from public.billing_runtime_policy where id=1 for share nowait;
  else
    select entitlement_environment into strict env from public.billing_runtime_policy where id=1 for share;
  end if;
  if p_environment is not null and p_environment is distinct from env then
    raise exception 'BILLING_GUARD_ENVIRONMENT_MISMATCH';
  end if;
  if p_account is not null then
    if p_nowait then perform 1 from public.billing_accounts where id=p_account for update nowait;
    else perform 1 from public.billing_accounts where id=p_account for update; end if;
    if not found then raise exception 'BILLING_GUARD_ACCOUNT_MISMATCH'; end if;
  end if;
end $$;

create function public.billing_guard_expire_checkouts(p_account uuid)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
  if p_account is null then return; end if;
  perform public.billing_guard_lock(p_account);
  -- Account first. NOWAIT also protects against unsupported row-first writers.
  perform 1 from public.billing_checkout_attempts where billing_account_id=p_account
    and status in ('creating','ready','ambiguous') order by id for update nowait;
  perform 1 from public.billing_checkouts_v2 where billing_account_id=p_account
    and status in ('creating','ready','ambiguous') order by id for update nowait;
  update public.billing_checkout_attempts set status='expired',expired_at=now(),provider_checkout_url=null,error_code='BILLING_CHECKOUT_EXPIRED',updated_at=now()
    where billing_account_id=p_account and status in ('creating','ready','ambiguous') and expected_expires_at<=now();
  update public.billing_checkout_attempts set status='ambiguous',error_code='BILLING_CHECKOUT_CREATION_AMBIGUOUS',updated_at=now()
    where billing_account_id=p_account and status='creating' and creation_lease_expires_at<=now();
  update public.billing_checkouts_v2 set status='expired',expired_at=now(),error_code='BILLING_CHECKOUT_EXPIRED',updated_at=now()
    where billing_account_id=p_account and status in ('creating','ready','ambiguous') and expected_expires_at<=now();
  update public.billing_checkouts_v2 set status='ambiguous',error_code='BILLING_CHECKOUT_CREATION_AMBIGUOUS',updated_at=now()
    where billing_account_id=p_account and status='creating' and creation_lease_expires_at<=now();
end $$;

create function public.billing_guard_checkout_conflict(p_account uuid,p_operation uuid,p_contract text)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
  -- Only cross-contract checks here: the original same-ledger retry response and
  -- original conflicts remain authoritative for v1.
  if p_contract='lemonsqueezy.v1' then
    if exists(select 1 from public.billing_checkouts_v2 where billing_account_id=p_account and operation_id=p_operation) then
      raise exception 'BILLING_GUARD_OPERATION_CONFLICT'; end if;
    if exists(select 1 from public.billing_checkouts_v2 where billing_account_id=p_account and status in ('creating','ready','ambiguous')) then
      raise exception 'BILLING_GUARD_CHECKOUT_ALREADY_OPEN'; end if;
  elsif p_contract='billing.v2' then
    if exists(select 1 from public.billing_checkout_attempts where billing_account_id=p_account and operation_id=p_operation) then
      raise exception 'BILLING_GUARD_OPERATION_CONFLICT'; end if;
    if exists(select 1 from public.billing_checkout_attempts where billing_account_id=p_account and status in ('creating','ready','ambiguous')) then
      raise exception 'BILLING_GUARD_CHECKOUT_ALREADY_OPEN'; end if;
  else raise exception 'BILLING_GUARD_CONTRACT_INVALID'; end if;
end $$;

create function public.billing_guard_operation_conflict(p_account uuid,p_operation uuid,p_ledger text)
returns void language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from (
    select billing_account_id,operation_id,'legacy_plan' ledger from public.billing_plan_change_operations
    union all select billing_account_id,operation_id,'legacy_seat' from public.billing_seat_quantity_operations
    union all select billing_account_id,operation_id,'v2' from public.billing_operations_v2
  ) o where o.billing_account_id=p_account and o.operation_id=p_operation and o.ledger<>p_ledger) then
    raise exception 'BILLING_GUARD_OPERATION_CONFLICT';
  end if;
  if p_ledger='v2' and exists(select 1 from public.billing_operations_v2 where billing_account_id=p_account
    and operation_id<>p_operation and status not in ('completed','canceled','failed')) then
    raise exception 'BILLING_GUARD_OPERATION_ALREADY_OPEN';
  end if;
  -- Existing legacy plan/seat mutual exclusion and error vocabulary stay in v1.
  if (p_ledger in ('legacy_plan','legacy_seat') and exists(select 1 from public.billing_operations_v2 where billing_account_id=p_account and status not in ('completed','canceled','failed')))
    or (p_ledger='v2' and (exists(select 1 from public.billing_plan_change_operations where billing_account_id=p_account and status not in ('completed','canceled','failed'))
      or exists(select 1 from public.billing_seat_quantity_operations where billing_account_id=p_account and status not in ('completed','canceled','failed')))) then
    raise exception 'BILLING_GUARD_OPERATION_ALREADY_OPEN';
  end if;
end $$;

create function public.billing_guard_claim_canonical(p_account uuid,p_canonical uuid,p_contract text)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare origin text;
begin
  perform public.billing_guard_lock(p_account);
  if not exists(select 1 from public.account_subscriptions where id=p_canonical and billing_account_id=p_account and subscription_kind='paid') then
    raise exception 'BILLING_GUARD_CANONICAL_MISMATCH'; end if;
  if p_contract not in ('lemonsqueezy.v1','billing.v2') or p_contract is null then raise exception 'BILLING_GUARD_CONTRACT_INVALID'; end if;
  if (p_contract='billing.v2' and exists(select 1 from public.billing_provider_subscriptions where account_subscription_id=p_canonical))
    or (p_contract='lemonsqueezy.v1' and exists(select 1 from public.billing_subscriptions_v2 where account_subscription_id=p_canonical)) then
    raise exception 'BILLING_GUARD_CANONICAL_ALREADY_OWNED'; end if;
  select storage_contract into origin from public.billing_canonical_origins where account_subscription_id=p_canonical;
  if found and origin<>p_contract then raise exception 'BILLING_GUARD_CANONICAL_ALREADY_OWNED'; end if;
  insert into public.billing_canonical_origins(account_subscription_id,billing_account_id,storage_contract)
    values(p_canonical,p_account,p_contract) on conflict(account_subscription_id) do nothing;
end $$;

create function public.billing_guard_checkout_row() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare contract text:=case tg_table_name when 'billing_checkouts_v2' then 'billing.v2' else 'lemonsqueezy.v1' end;
  ids uuid[];
begin
  -- UPDATE already owns its tuple: never wait in the reverse row->account order.
  perform public.billing_guard_lock(new.billing_account_id,
    case when tg_op='INSERT' or new.status in ('creating','ready','completed') then new.environment else null end,tg_op='UPDATE');
  if tg_op='INSERT' then
    perform public.billing_guard_expire_checkouts(new.billing_account_id);
    perform public.billing_guard_checkout_conflict(new.billing_account_id,new.operation_id,contract);
    if contract='billing.v2' then
      ids:=array[(to_jsonb(new)->>'base_mapping_id')::uuid,(to_jsonb(new)->>'seat_mapping_id')::uuid];
      perform 1 from public.billing_price_mappings where id=any(ids) order by id for share;
      if exists(select 1 from public.billing_price_mappings where id=any(ids) and status<>'active') then raise exception 'BILLING_V2_MAPPING_UNAVAILABLE'; end if;
    else
      perform 1 from public.billing_provider_variant_mappings where id=(to_jsonb(new)->>'variant_mapping_id')::uuid for share;
    end if;
  end if;
  return new;
end $$;
create trigger a00_billing_checkout_guard before insert or update on public.billing_checkout_attempts for each row execute function public.billing_guard_checkout_row();
create trigger a00_billing_checkout_guard before insert or update on public.billing_checkouts_v2 for each row execute function public.billing_guard_checkout_row();

create function public.billing_guard_operation_row() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare env text; account uuid; ids uuid[]; ledger text; j jsonb:=to_jsonb(new);
begin
  ledger:=case tg_table_name when 'billing_plan_change_operations' then 'legacy_plan' when 'billing_seat_quantity_operations' then 'legacy_seat' else 'v2' end;
  if ledger='v2' then env:=j->>'environment'; account:=(j->>'billing_account_id')::uuid;
  else select environment,billing_account_id into strict env,account from public.billing_provider_subscriptions where id=(j->>'billing_provider_subscription_id')::uuid;
    if account<>new.billing_account_id then raise exception 'BILLING_GUARD_ACCOUNT_MISMATCH'; end if;
  end if;
  perform public.billing_guard_lock(account,env,tg_op='UPDATE');
  if tg_op='INSERT' then
    perform public.billing_guard_operation_conflict(account,new.operation_id,ledger);
    if ledger='v2' then
      ids:=array[(j->>'source_base_mapping_id')::uuid,(j->>'target_base_mapping_id')::uuid,(j->>'source_seat_mapping_id')::uuid,(j->>'target_seat_mapping_id')::uuid];
      perform 1 from public.billing_price_mappings where id=any(ids) order by id for share;
    else
      ids:=array[(j->>'source_variant_mapping_id')::uuid,(j->>'target_variant_mapping_id')::uuid,(j->>'variant_mapping_id')::uuid];
      perform 1 from public.billing_provider_variant_mappings where id=any(ids) order by id for share;
    end if;
  end if;
  return new;
end $$;
create trigger a00_billing_operation_guard before insert or update on public.billing_plan_change_operations for each row execute function public.billing_guard_operation_row();
create trigger a00_billing_operation_guard before insert or update on public.billing_seat_quantity_operations for each row execute function public.billing_guard_operation_row();
create trigger a00_billing_operation_guard before insert or update on public.billing_operations_v2 for each row execute function public.billing_guard_operation_row();

create function public.billing_guard_subscription_row() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare contract text:=case tg_table_name when 'billing_subscriptions_v2' then 'billing.v2' else 'lemonsqueezy.v1' end;
  effect boolean;
begin
  effect:=case when tg_op='INSERT' then new.account_subscription_id is not null or new.approved_additional_coach_seats<>0
    else new.account_subscription_id is distinct from old.account_subscription_id or new.approved_additional_coach_seats<>old.approved_additional_coach_seats end;
  perform public.billing_guard_lock(new.billing_account_id,case when effect then new.environment else null end,tg_op='UPDATE');
  if new.account_subscription_id is not null then
    perform public.billing_guard_claim_canonical(new.billing_account_id,new.account_subscription_id,contract);
  end if;
  return new;
end $$;
create trigger a00_billing_subscription_guard before insert or update on public.billing_provider_subscriptions for each row execute function public.billing_guard_subscription_row();
create trigger a00_billing_subscription_guard before insert or update on public.billing_subscriptions_v2 for each row execute function public.billing_guard_subscription_row();

create function public.billing_guard_payment_row() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.billing_subscriptions_v2 where id=new.subscription_id and billing_account_id=new.billing_account_id
    and provider=new.provider and environment=new.environment) then raise exception 'BILLING_GUARD_ACCOUNT_MISMATCH'; end if;
  perform public.billing_guard_lock(new.billing_account_id,new.environment);
  return new;
end $$;
create trigger a00_billing_payment_guard before insert on public.billing_payment_applications_v2 for each row execute function public.billing_guard_payment_row();

-- Typed, private persistence helper: no EXECUTE grant, checkout URL, external
-- call, payment proof or entitlement effect. Compatible retries retain their ID.
create function public.billing_v2_admit_checkout(p_owner uuid,p_environment text,p_plan_key text,p_cadence text,p_seats integer,p_operation uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare a uuid; t public.billing_checkouts_v2%rowtype; base public.billing_price_mappings%rowtype; seat uuid;
begin
  select id into strict a from public.billing_accounts where owner_user_id=p_owner;
  perform public.billing_guard_lock(a,p_environment);
  if p_operation is null or p_plan_key not in ('launch','growth','scale') or p_plan_key is null
    or p_cadence not in ('monthly','annual') or p_cadence is null or p_seats is null or p_seats<0 then raise exception 'BILLING_INVALID_INPUT'; end if;
  perform public.billing_guard_expire_checkouts(a);
  perform public.billing_guard_checkout_conflict(a,p_operation,'billing.v2');
  select * into t from public.billing_checkouts_v2 where billing_account_id=a and operation_id=p_operation;
  if found then
    if t.environment<>p_environment or t.cadence<>p_cadence or t.requested_additional_seats<>p_seats
      or not exists(select 1 from public.commercial_plan_versions where id=t.plan_version_id and plan_key=p_plan_key) then raise exception 'BILLING_GUARD_OPERATION_CONFLICT'; end if;
    return jsonb_build_object('id',t.id,'status',t.status,'reused',true);
  end if;
  if exists(select 1 from public.billing_checkouts_v2 where billing_account_id=a and status in ('creating','ready','ambiguous')) then raise exception 'BILLING_GUARD_CHECKOUT_ALREADY_OPEN'; end if;
  if exists(select 1 from public.account_subscriptions where billing_account_id=a and subscription_kind not in ('trial','complimentary') and status in ('active','past_due','grace','restricted')) then raise exception 'BILLING_ALREADY_SUBSCRIBED'; end if;
  select * into strict base from public.billing_price_mappings where provider='paddle' and environment=p_environment and canonical_key=p_plan_key and cadence=p_cadence and status='active';
  if p_seats>0 then select id into strict seat from public.billing_price_mappings where provider='paddle' and environment=p_environment and canonical_key='coach-seat' and cadence=p_cadence and status='active'; end if;
  insert into public.billing_checkouts_v2(billing_account_id,created_by_user_id,operation_id,provider,environment,plan_version_id,cadence,base_mapping_id,seat_mapping_id,seat_mapping_kind,requested_additional_seats,status,expected_expires_at,creation_lease_expires_at)
    values(a,p_owner,p_operation,'paddle',p_environment,base.plan_version_id,p_cadence,base.id,seat,case when seat is not null then 'addon' end,p_seats,'creating',date_trunc('milliseconds',now())+interval '30 minutes',now()+interval '2 minutes') returning * into t;
  return jsonb_build_object('id',t.id,'status',t.status,'reused',false);
end $$;

-- Guard preambles derive account/environment from trusted stored linkage.
create function public.billing_guard_legacy_entry(p_kind text,p_id uuid,p_environment text default null,p_operation uuid default null)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare a uuid; env text; owner uuid;
begin
  if p_kind='checkout_owner' then
    owner:=auth.uid();
    if owner is null then return; end if; -- preserve original forbidden response
    select id into a from public.billing_accounts where owner_user_id=owner;
    -- First checkout can create the account. Original auth.uid/coach checks still
    -- run before creation; acquire policy before that account is created.
    if a is null then
      if coalesce(nullif(current_setting('role',true),'none'),session_user)='authenticated' then
        if p_environment in ('test','live') and not exists(select 1 from public.billing_runtime_policy where id=1 and entitlement_environment=p_environment) then
          raise exception 'BILLING_GUARD_ENVIRONMENT_MISMATCH'; end if;
        return;
      end if;
    end if;
    env:=p_environment;
  elsif p_kind in ('legacy_plan','legacy_seat','owner_effect') then
    perform public.billing_guard_actor();
    select id into a from public.billing_accounts where owner_user_id=p_id;
    env:=p_environment;
  elsif p_kind in ('checkout_effect','checkout_cleanup') then
    perform public.billing_guard_actor();
    select billing_account_id,environment into a,env from public.billing_checkout_attempts where id=p_id;
  elsif p_kind='reconcile' then
    perform public.billing_guard_actor();
    select environment into env from public.billing_provider_webhook_deliveries where id=p_id;
  elsif p_kind='apply_plan' then
    perform public.billing_guard_actor();
    select b.billing_account_id,b.environment into a,env from public.billing_plan_change_operations o join public.billing_provider_subscriptions b on b.id=o.billing_provider_subscription_id where o.id=p_id;
  elsif p_kind='apply_seat' then
    perform public.billing_guard_actor();
    select billing_account_id,environment into a,env from public.billing_provider_subscriptions where id=p_id;
  else raise exception 'BILLING_GUARD_CONTRACT_INVALID'; end if;
  if env is not null and env not in ('test','live') then return; end if; -- original input validation
  perform public.billing_guard_lock(a,case when p_kind='checkout_cleanup' then null else env end);
  if a is not null and p_kind='checkout_owner' then
    perform public.billing_guard_expire_checkouts(a);
    perform public.billing_guard_checkout_conflict(a,p_operation,'lemonsqueezy.v1');
  elsif a is not null and p_kind in ('legacy_plan','legacy_seat') then
    perform public.billing_guard_operation_conflict(a,p_operation,p_kind);
  end if;
end $$;

-- Insert only a marked entry preamble. The rest of each legacy definition,
-- including every proof predicate, timestamp comparison and hash, is retained
-- byte-for-byte. Fail rather than guess if the expected body shape has changed.
do $$
declare r record; definition text; pos integer; guard text; anchor text;
begin
  for r in select * from (values
    ('begin_my_billing_checkout_attempt(text,text,uuid,text)', 'perform public.billing_guard_legacy_entry(''checkout_owner'',null,p_environment,p_operation_id);'),
    ('expire_stale_billing_checkout_attempts(uuid)', 'perform public.billing_guard_expire_checkouts(p_account);'),
    ('complete_billing_checkout_attempt(uuid,text,timestamp with time zone,text,text,timestamp with time zone)', 'perform public.billing_guard_legacy_entry(''checkout_effect'',p_attempt);'),
    ('fail_billing_checkout_attempt(uuid,text,timestamp with time zone,boolean,text)', 'perform public.billing_guard_legacy_entry(''checkout_cleanup'',p_attempt);'),
    ('begin_billing_plan_change(uuid,text,text,text,uuid,jsonb)', 'perform public.billing_guard_legacy_entry(''legacy_plan'',p_owner,p_environment,p_operation);'),
    ('begin_billing_seat_quantity(uuid,text,integer,uuid,jsonb)', 'perform public.billing_guard_legacy_entry(''legacy_seat'',p_owner,p_environment,p_operation);'),
    ('begin_cancel_billing_plan_change(uuid,text,uuid)', 'perform public.billing_guard_legacy_entry(''owner_effect'',p_owner,p_environment);'),
    ('begin_cancel_billing_seat_quantity(uuid,text,uuid)', 'perform public.billing_guard_legacy_entry(''owner_effect'',p_owner,p_environment);'),
    ('reconcile_billing_provider_subscription(uuid,jsonb)', 'perform public.billing_guard_legacy_entry(''reconcile'',p_delivery);'),
    ('apply_verified_billing_plan_change(uuid,jsonb,text,jsonb)', 'perform public.billing_guard_legacy_entry(''apply_plan'',p_operation);'),
    ('apply_verified_billing_seat_quantity(uuid,jsonb,text,jsonb)', 'perform public.billing_guard_legacy_entry(''apply_seat'',p_subscription);')
  ) x(signature,statement) loop
    definition:=pg_get_functiondef(('public.'||r.signature)::regprocedure);
    anchor:=(regexp_match(definition,E'\nbegin\r?\n'))[1];
    pos:=strpos(definition,anchor);
    if pos is null or pos=0 or strpos(definition,'-- BILLING-DB-02 BEGIN')>0 then raise exception 'Unexpected legacy definition: %',r.signature; end if;
    guard:=E'  -- BILLING-DB-02 BEGIN\n  '||r.statement||E'\n  -- BILLING-DB-02 END\n';
    execute overlay(definition placing guard from pos+length(anchor) for 0);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace
    and (p.proname like 'billing_guard_%' or p.proname='billing_v2_admit_checkout') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
  end loop;
end $$;
commit;
