-- BILLING-PROOF-01: retention only. No existing definitions, proofs, flags or grants are widened.
begin;

create function public.billing_v2_proof_object(j jsonb, keys text[]) returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
begin
  if j is null or jsonb_typeof(j)<>'object' or not j ?& keys or j-keys<>'{}'::jsonb then
    raise exception 'BILLING_PROOF_INVALID';
  end if;
end $$;
create function public.billing_v2_proof_ref(j jsonb, nullable boolean default false) returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
begin
  if nullable and j='null'::jsonb then return; end if;
  if j is null or jsonb_typeof(j)<>'string' or not (j#>>'{}') ~ '[^[:space:]]' or octet_length(j#>>'{}')>512 then
    raise exception 'BILLING_PROOF_INVALID';
  end if;
end $$;
create function public.billing_v2_proof_stamp(j jsonb, nullable boolean default false) returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
declare s text:=j#>>'{}'; stamp timestamptz;
begin
  if nullable and j='null'::jsonb then return; end if;
  if j is null or jsonb_typeof(j)<>'string' or s !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then raise exception 'BILLING_PROOF_INVALID'; end if;
  stamp:=s::timestamptz;
  if to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>s then raise exception 'BILLING_PROOF_INVALID'; end if;
exception when invalid_datetime_format or datetime_field_overflow then raise exception 'BILLING_PROOF_INVALID';
end $$;
create function public.billing_v2_proof_money(j jsonb) returns numeric
language plpgsql immutable set search_path=pg_catalog,public as $$
declare n numeric;
begin
  if j is null or jsonb_typeof(j)<>'number' then raise exception 'BILLING_PROOF_INVALID'; end if;
  n:=(j#>>'{}')::numeric;
  if n<0 or n>9007199254740991 or n<>trunc(n) then raise exception 'BILLING_PROOF_INVALID'; end if;
  return n;
end $$;
create function public.billing_v2_proof_items(j jsonb) returns numeric
language plpgsql immutable set search_path=pg_catalog,public as $$
declare item jsonb; total numeric:=0; qty numeric; refs text[]:='{}'; item_refs text[]:='{}';
begin
  if j is null or jsonb_typeof(j)<>'array' or jsonb_array_length(j) not between 1 and 32 then raise exception 'BILLING_PROOF_INVALID'; end if;
  for item in select value from jsonb_array_elements(j) loop
    perform public.billing_v2_proof_object(item,array['priceRef','itemRef','productRef','quantity','unitAmountMinor']);
    perform public.billing_v2_proof_ref(item->'priceRef');
    perform public.billing_v2_proof_ref(item->'itemRef',true);
    perform public.billing_v2_proof_ref(item->'productRef',true);
    qty:=public.billing_v2_proof_money(item->'quantity');
    if qty not between 1 and 2147483647 or (item->>'priceRef')=any(refs)
      or ((item->>'itemRef') is not null and (item->>'itemRef')=any(item_refs)) then raise exception 'BILLING_PROOF_INVALID'; end if;
    refs:=array_append(refs,item->>'priceRef'); item_refs:=array_append(item_refs,item->>'itemRef');
    total:=total+qty*public.billing_v2_proof_money(item->'unitAmountMinor');
  end loop;
  if total>9007199254740991 then raise exception 'BILLING_PROOF_INVALID'; end if;
  return total;
end $$;

-- Exact discriminated schema, deliberately separate from structure-only-v1.
-- completedAt must be supplied as an observed fact, never copied from creation/update.
create function public.billing_v2_proof_validate(p jsonb, expected_kind text) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare i jsonb; e jsonb; s jsonb; t jsonb; subtotal numeric; total numeric; k text; items jsonb;
begin
  if expected_kind not in ('event','subscription','transaction') or expected_kind is null then raise exception 'BILLING_PROOF_INVALID'; end if;
  perform public.billing_v2_proof_object(p,array['schema','validator','provider','environment','source','kind','evidenceClass','identity',expected_kind||'Evidence']);
  if not (p->>'schema'='billing-proof-v2' and p->>'validator'='paddle-contract-v1' and p->>'provider'='paddle'
    and p->>'environment' in ('test','live') and p->>'kind'=expected_kind) is true or octet_length(p::text)>65536 then raise exception 'BILLING_PROOF_INVALID'; end if;
  i:=p->'identity'; perform public.billing_v2_proof_object(i,array['customerRef','subscriptionRef','transactionRef']);
  perform public.billing_v2_proof_ref(i->'customerRef',expected_kind='event');
  perform public.billing_v2_proof_ref(i->'subscriptionRef',expected_kind='event');
  perform public.billing_v2_proof_ref(i->'transactionRef',expected_kind<>'transaction');
  if expected_kind='event' then
    if not (p->>'source'='webhook' and p->>'evidenceClass'='authenticated_provider') is true then raise exception 'BILLING_PROOF_INVALID'; end if;
    e:=p->'eventEvidence'; perform public.billing_v2_proof_object(e,array['eventRef','eventName','resourceType','resourceRef','occurredAt']);
    perform public.billing_v2_proof_ref(e->'eventRef'); perform public.billing_v2_proof_ref(e->'eventName'); perform public.billing_v2_proof_ref(e->'resourceRef');
    perform public.billing_v2_proof_stamp(e->'occurredAt');
    if not (e->>'resourceType' in ('subscription','transaction') and e->>'resourceRef'=case e->>'resourceType' when 'subscription' then i->>'subscriptionRef' else i->>'transactionRef' end) is true
      or (e->>'resourceType'='subscription' and i->'transactionRef'<>'null'::jsonb) then raise exception 'BILLING_PROOF_INVALID'; end if;
  else
    if p->>'source' is distinct from 'api_reconciliation' then raise exception 'BILLING_PROOF_INVALID'; end if;
    if expected_kind='subscription' then
      if p->>'evidenceClass' is distinct from 'authenticated_provider' or i->'transactionRef'<>'null'::jsonb then raise exception 'BILLING_PROOF_INVALID'; end if;
      s:=p->'subscriptionEvidence'; perform public.billing_v2_proof_object(s,array['providerStatus','providerCreatedAt','providerUpdatedAt','periodStartedAt','periodEndsAt','items']);
      perform public.billing_v2_proof_ref(s->'providerStatus'); perform public.billing_v2_proof_stamp(s->'providerCreatedAt',true); perform public.billing_v2_proof_stamp(s->'providerUpdatedAt');
      perform public.billing_v2_proof_stamp(s->'periodStartedAt',true); perform public.billing_v2_proof_stamp(s->'periodEndsAt',true);
      if ((s->>'periodStartedAt') is null)<>((s->>'periodEndsAt') is null) or s->>'periodStartedAt'>=s->>'periodEndsAt'
        or s->>'providerCreatedAt'>s->>'providerUpdatedAt' then raise exception 'BILLING_PROOF_INVALID'; end if;
      perform public.billing_v2_proof_items(s->'items'); items:=s->'items';
    else
      if p->>'evidenceClass' is distinct from 'verified_transaction' then raise exception 'BILLING_PROOF_INVALID'; end if;
      t:=p->'transactionEvidence'; perform public.billing_v2_proof_object(t,array['providerStatus','providerOrigin','providerCreatedAt','providerUpdatedAt','completedAt','currency','subtotalMinor','taxMinor','discountMinor','totalMinor','paidMinor','balanceMinor','adjustmentRefs','items']);
      perform public.billing_v2_proof_ref(t->'providerOrigin'); perform public.billing_v2_proof_stamp(t->'providerCreatedAt',true);
      perform public.billing_v2_proof_stamp(t->'providerUpdatedAt'); perform public.billing_v2_proof_stamp(t->'completedAt');
      if not (t->>'providerStatus'='completed' and jsonb_typeof(t->'currency')='string' and t->>'currency' ~ '^[A-Z]{3}$') is true
        or t->'adjustmentRefs'<>'[]'::jsonb or t->>'completedAt'>t->>'providerUpdatedAt'
        or t->>'providerCreatedAt'>t->>'completedAt' then raise exception 'BILLING_PROOF_INVALID'; end if;
      foreach k in array array['subtotalMinor','taxMinor','discountMinor','totalMinor','paidMinor','balanceMinor'] loop perform public.billing_v2_proof_money(t->k); end loop;
      subtotal:=public.billing_v2_proof_items(t->'items'); items:=t->'items';
      total:=(t->>'subtotalMinor')::numeric+(t->>'taxMinor')::numeric-(t->>'discountMinor')::numeric;
      if subtotal<>(t->>'subtotalMinor')::numeric or total<>(t->>'totalMinor')::numeric or total<=0
        or total<>(t->>'paidMinor')::numeric or (t->>'balanceMinor')::numeric<>0 then raise exception 'BILLING_PROOF_INVALID'; end if;
    end if;
    select jsonb_agg(value order by (value->>'priceRef') collate "C") into items from jsonb_array_elements(items);
    p:=jsonb_set(p,array[expected_kind||'Evidence','items'],items);
  end if;
  return p;
end $$;

create table public.billing_verified_evidence_v2 (
  id uuid primary key default gen_random_uuid(),
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  proof_kind text not null check(proof_kind in ('event','subscription','transaction')),
  proof_schema text not null default 'billing-proof-v2' check(proof_schema='billing-proof-v2'),
  validator_version text not null default 'paddle-contract-v1' check(validator_version='paddle-contract-v1'),
  evidence_class text not null check(evidence_class in ('authenticated_provider','verified_transaction')),
  source_kind text not null check(source_kind in ('webhook','api_reconciliation')),
  proof jsonb not null,
  normalized_sha256 public.billing_v2_sha256 not null,
  digest_algorithm text not null default 'pg-jsonb-sha256-v1' check(digest_algorithm='pg-jsonb-sha256-v1'),
  replay_algorithm text not null check(replay_algorithm in ('verified-delivery-v1','verified-api-v1')),
  replay_key public.billing_v2_sha256 not null,
  logical_key public.billing_v2_sha256 not null,
  provider_event_ref public.billing_v2_ref,
  provider_notification_ref public.billing_v2_ref,
  raw_payload_sha256 public.billing_v2_sha256,
  provider_resource_ref public.billing_v2_ref not null,
  provider_updated_at timestamptz,
  provider_transaction_ref public.billing_v2_ref,
  -- Reserved correlation identity, NOT an application/dedup claim on entitlement.
  commercial_effect_key public.billing_v2_sha256,
  subscription_id uuid,
  billing_account_id uuid,
  payment_authority boolean not null default false check(payment_authority=false),
  recorded_at timestamptz not null default now(),
  unique(provider,environment,source_kind,proof_kind,replay_algorithm,replay_key),
  foreign key(subscription_id,billing_account_id,provider,environment)
    references public.billing_subscriptions_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  check((subscription_id is null)=(billing_account_id is null)),
  check(proof_kind='event' or subscription_id is not null),
  check((proof_kind='transaction')=(evidence_class='verified_transaction')),
  check((proof_kind='transaction')=(provider_transaction_ref is not null) and (proof_kind='transaction')=(commercial_effect_key is not null)),
  check((proof_kind='event' and source_kind='webhook' and provider_event_ref is not null and raw_payload_sha256 is not null and replay_algorithm='verified-delivery-v1' and provider_updated_at is null)
    or (proof_kind in ('subscription','transaction') and source_kind='api_reconciliation' and provider_event_ref is null and provider_notification_ref is null and raw_payload_sha256 is null and replay_algorithm='verified-api-v1' and provider_updated_at is not null)),
  check((proof->>'provider'=provider and proof->>'environment'=environment and proof->>'kind'=proof_kind
    and proof->>'schema'=proof_schema and proof->>'validator'=validator_version and proof->>'source'=source_kind and proof->>'evidenceClass'=evidence_class) is true),
  check(public.billing_v2_proof_validate(proof,proof_kind)=proof),
  check(normalized_sha256=encode(extensions.digest(proof::text,'sha256'),'hex'))
);
create index billing_verified_evidence_v2_logical on public.billing_verified_evidence_v2(provider,environment,source_kind,proof_kind,logical_key);
create index billing_verified_evidence_v2_subscription on public.billing_verified_evidence_v2(subscription_id,billing_account_id,provider,environment);
alter table public.billing_verified_evidence_v2 enable row level security;
revoke all on public.billing_verified_evidence_v2 from public,anon,authenticated,service_role;
create trigger billing_verified_evidence_history before update or delete on public.billing_verified_evidence_v2 for each row execute function public.billing_v2_protect_history('');
create trigger billing_verified_evidence_no_truncate before truncate on public.billing_verified_evidence_v2 for each statement execute function public.billing_v2_protect_history();
comment on table public.billing_verified_evidence_v2 is 'Receipt/service-authenticated retention only. paddle-contract-v1 is not a real Paddle transport verifier. payment_authority is always false. No payment-application FK targets this ledger.';

create function public.billing_v2_proof_record(p_input jsonb,p_kind text,p_raw text default null,p_notification text default null) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare r text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
  p jsonb; env text; i jsonb; sid uuid; account uuid; customer text; subref text; resource text; revision timestamptz;
  normalized text; logical text; replay text; algorithm text; eid uuid; eventref text; effect text; existing public.billing_verified_evidence_v2%rowtype;
begin
  -- Check the original database role, not caller-editable JWT claims/current_user
  -- (current_user is the function owner inside the narrowly granted wrappers).
  if r not in ('service_role','postgres','supabase_admin') then raise exception 'BILLING_PROOF_FORBIDDEN' using errcode='42501'; end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'BILLING_PROOF_ISOLATION_UNSUPPORTED' using errcode='25001'; end if;
  p:=public.billing_v2_proof_validate(p_input,p_kind); env:=p->>'environment'; i:=p->'identity';
  normalized:=encode(extensions.digest(p::text,'sha256'),'hex');
  if p_kind='event' then
    if p_raw is null or p_raw !~ '^[0-9a-f]{64}$' then raise exception 'BILLING_PROOF_INVALID'; end if;
    if p_notification is not null then perform public.billing_v2_proof_ref(to_jsonb(p_notification)); end if;
    eventref:=p#>>'{eventEvidence,eventRef}'; resource:=p#>>'{eventEvidence,resourceRef}'; algorithm:='verified-delivery-v1';
    logical:=encode(extensions.digest(jsonb_build_array('verified-event-v1','paddle',env,eventref)::text,'sha256'),'hex');
    replay:=encode(extensions.digest(jsonb_build_array(algorithm,'paddle',env,'billing-proof-v2','paddle-contract-v1',eventref,p_notification,p_raw)::text,'sha256'),'hex');
  else
    if p_raw is not null or p_notification is not null then raise exception 'BILLING_PROOF_INVALID'; end if;
    resource:=case p_kind when 'subscription' then i->>'subscriptionRef' else i->>'transactionRef' end;
    revision:=(p#>>array[p_kind||'Evidence','providerUpdatedAt'])::timestamptz; algorithm:='verified-api-v1';
    logical:=encode(extensions.digest(jsonb_build_array(algorithm,'paddle',env,p_kind,resource,p#>>array[p_kind||'Evidence','providerUpdatedAt'])::text,'sha256'),'hex');
    replay:=encode(extensions.digest(jsonb_build_array(algorithm,'paddle',env,'billing-proof-v2','paddle-contract-v1',p_kind,resource,p#>>array[p_kind||'Evidence','providerUpdatedAt'],normalized)::text,'sha256'),'hex');
    if p_kind='transaction' then effect:=encode(extensions.digest(jsonb_build_array('reserved-transaction-effect-v1','paddle',env,resource)::text,'sha256'),'hex'); end if;
  end if;
  -- No caller account/subscription UUID is accepted. SQL independently re-reads
  -- immutable scope, account and customer linkage. Unknown events can be deferred.
  select s.id,s.billing_account_id,c.provider_customer_ref,s.provider_subscription_ref into sid,account,customer,subref
    from public.billing_subscriptions_v2 s join public.billing_customers_v2 c on c.id=s.customer_id and c.billing_account_id=s.billing_account_id and c.provider=s.provider and c.environment=s.environment
    where s.provider='paddle' and s.environment=env and s.provider_subscription_ref=i->>'subscriptionRef';
  if sid is null and p_kind<>'event' then raise exception 'BILLING_PROOF_SUBSCRIPTION_NOT_FOUND'; end if;
  if sid is not null then
    if customer is distinct from i->>'customerRef' or subref is distinct from i->>'subscriptionRef' then raise exception 'BILLING_PROOF_IDENTITY_MISMATCH'; end if;
    -- Retention is allowed across environments; no entitlement-environment check.
    perform public.billing_guard_lock(account);
    perform 1 from public.billing_subscriptions_v2 s join public.billing_customers_v2 c on c.id=s.customer_id
      where s.id=sid and s.billing_account_id=account and s.environment=env and s.provider='paddle'
        and s.provider_subscription_ref=i->>'subscriptionRef' and c.provider_customer_ref=i->>'customerRef' for share of s,c;
    if not found then raise exception 'BILLING_PROOF_IDENTITY_MISMATCH'; end if;
  end if;
  -- All writers use account (when linked) -> logical-evidence lock. Unlinked
  -- events never acquire an account after this lock. Hash collisions only serialize.
  perform pg_advisory_xact_lock(hashtextextended('billing-proof-v2:'||logical,0));
  if exists(select 1 from public.billing_verified_evidence_v2 where provider='paddle' and environment=env and source_kind=p->>'source'
    and proof_kind=p_kind and logical_key=logical and normalized_sha256<>normalized) then raise exception 'BILLING_PROOF_REPLAY_CONFLICT'; end if;
  select * into existing from public.billing_verified_evidence_v2 where provider='paddle' and environment=env and source_kind=p->>'source'
    and proof_kind=p_kind and replay_algorithm=algorithm and replay_key=replay;
  if found then
    if existing.normalized_sha256<>normalized then raise exception 'BILLING_PROOF_REPLAY_CONFLICT'; end if;
    return jsonb_build_object('id',existing.id,'reused',true,'normalizedSha256',normalized,'replayKey',replay,'paymentAuthority',false);
  end if;
  insert into public.billing_verified_evidence_v2(provider,environment,proof_kind,evidence_class,source_kind,proof,normalized_sha256,replay_algorithm,replay_key,logical_key,
    provider_event_ref,provider_notification_ref,raw_payload_sha256,provider_resource_ref,provider_updated_at,provider_transaction_ref,commercial_effect_key,subscription_id,billing_account_id)
  values('paddle',env,p_kind,p->>'evidenceClass',p->>'source',p,normalized,algorithm,replay,logical,eventref,p_notification,p_raw,resource,revision,
    case when p_kind='transaction' then resource end,effect,sid,account) returning id into eid;
  return jsonb_build_object('id',eid,'reused',false,'normalizedSha256',normalized,'replayKey',replay,'paymentAuthority',false);
end $$;

-- Three kind-specific service-only entry points. No generic exposed JSON writer.
-- SECURITY DEFINER is needed solely to insert into the private evidence ledger;
-- no direct service-role DML or EXECUTE on the internal implementation is granted.
create function public.record_verified_billing_event_v2(p_proof jsonb,p_raw_payload_sha256 text,p_notification_ref text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin return public.billing_v2_proof_record(p_proof,'event',p_raw_payload_sha256,p_notification_ref); end $$;
create function public.record_verified_billing_subscription_v2(p_proof jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin return public.billing_v2_proof_record(p_proof,'subscription'); end $$;
create function public.record_verified_billing_transaction_v2(p_proof jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin return public.billing_v2_proof_record(p_proof,'transaction'); end $$;

do $$ declare r record; begin
  for r in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and
    (proname like 'billing_v2_proof_%' or proname in ('record_verified_billing_event_v2','record_verified_billing_subscription_v2','record_verified_billing_transaction_v2')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
  end loop;
end $$;
grant execute on function public.record_verified_billing_event_v2(jsonb,text,text),public.record_verified_billing_subscription_v2(jsonb),public.record_verified_billing_transaction_v2(jsonb) to service_role;
commit;
