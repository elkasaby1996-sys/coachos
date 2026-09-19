-- PADDLE-CATALOGUE-01. No seeds, transport, runtime policy changes or payment effects.
begin;

create function public.billing_catalogue_validate_v1(p jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare c jsonb; q jsonb; t jsonb; n numeric;
begin
  perform public.billing_v2_proof_object(p,array['schema','validator','kind','source','evidenceClass','provider','environment','verificationRef','observedAt','catalogue']);
  if not (p->>'schema'='billing-catalogue-v1' and p->>'validator'='paddle-catalogue-contract-v1'
    and p->>'kind'='catalogue' and p->>'source'='catalogue_api' and p->>'evidenceClass'='verified_catalogue'
    and p->>'provider'='paddle' and p->>'environment' in ('test','live')) is true or octet_length(p::text)>16384 then
    raise exception 'BILLING_CATALOGUE_INVALID';
  end if;
  perform public.billing_v2_proof_ref(p->'verificationRef');
  perform public.billing_v2_proof_stamp(p->'observedAt');
  c:=p->'catalogue';
  perform public.billing_v2_proof_object(c,array['productRef','priceRef','identityKind','canonicalKey','canonicalVersionId','cadence','currency','unitAmountMinor','recurrenceUnit','recurrenceCount','trial','productStatus','priceStatus','quantity']);
  perform public.billing_v2_proof_ref(c->'productRef');
  perform public.billing_v2_proof_ref(c->'priceRef');
  if not (c->>'canonicalVersionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and c->>'identityKind' in ('plan','addon') and c->>'canonicalKey' in ('launch','growth','scale','coach-seat')
    and c->>'cadence' in ('monthly','annual') and c->>'currency' ~ '^[A-Z]{3}$'
    and c->>'recurrenceUnit' in ('month','year') and c->>'productStatus' in ('active','archived') and c->>'priceStatus' in ('active','archived')) is true then
    raise exception 'BILLING_CATALOGUE_INVALID';
  end if;
  perform public.billing_v2_proof_money(c->'unitAmountMinor');
  n:=public.billing_v2_proof_money(c->'recurrenceCount');
  if n not between 1 and 2147483647 then raise exception 'BILLING_CATALOGUE_INVALID'; end if;
  t:=c->'trial';
  if t<>'null'::jsonb then
    perform public.billing_v2_proof_object(t,array['unit','count']);
    n:=public.billing_v2_proof_money(t->'count');
    if not (t->>'unit' in ('day','week','month','year') and n between 1 and 2147483647) is true then raise exception 'BILLING_CATALOGUE_INVALID'; end if;
  end if;
  q:=c->'quantity';
  if q<>'null'::jsonb then
    perform public.billing_v2_proof_object(q,array['minimum','maximum']);
    n:=public.billing_v2_proof_money(q->'minimum');
    if n not between 1 and 2147483647 then raise exception 'BILLING_CATALOGUE_INVALID'; end if;
    if q->'maximum'<>'null'::jsonb and public.billing_v2_proof_money(q->'maximum') not between n and 2147483647 then raise exception 'BILLING_CATALOGUE_INVALID'; end if;
  end if;
  return p;
end $$;

-- Catalogue has no customer/subscription/payment identity. Reuse PROOF-01's
-- closed-schema validators and receipt/service trust boundary without widening
-- its payment-shaped ledger or any payment application foreign key.
create table public.billing_catalogue_evidence_v1 (
  id uuid primary key default gen_random_uuid(),
  provider text not null check(provider='paddle'),
  environment text not null check(environment in ('test','live')),
  verification_ref public.billing_v2_ref not null,
  provider_price_ref public.billing_v2_ref not null,
  proof jsonb not null,
  normalized_sha256 public.billing_v2_sha256 not null,
  digest_algorithm text not null default 'pg-jsonb-sha256-v1' check(digest_algorithm='pg-jsonb-sha256-v1'),
  replay_algorithm text not null default 'catalogue-observation-v1' check(replay_algorithm='catalogue-observation-v1'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  payment_authority boolean not null default false check(not payment_authority),
  unique(id,provider,environment),
  unique(provider,environment,replay_algorithm,verification_ref,provider_price_ref),
  check(public.billing_catalogue_validate_v1(proof)=proof),
  check((proof->>'provider'=provider and proof->>'environment'=environment and proof->>'verificationRef'=verification_ref::text
    and proof#>>'{catalogue,priceRef}'=provider_price_ref::text and (proof->>'observedAt')::timestamptz=observed_at) is true),
  check(normalized_sha256=encode(extensions.digest(proof::text,'sha256'),'hex'))
);
alter table public.billing_catalogue_evidence_v1 enable row level security;
revoke all on public.billing_catalogue_evidence_v1 from public,anon,authenticated,service_role;
create trigger billing_catalogue_evidence_history before update or delete on public.billing_catalogue_evidence_v1
for each row execute function public.billing_v2_protect_history('');
create trigger billing_catalogue_evidence_no_truncate before truncate on public.billing_catalogue_evidence_v1
for each statement execute function public.billing_v2_protect_history();

alter table public.billing_price_mappings add column catalogue_evidence_id uuid;
alter table public.billing_price_mappings add constraint billing_catalogue_mapping_evidence_fk
  foreign key(catalogue_evidence_id,provider,environment) references public.billing_catalogue_evidence_v1(id,provider,environment) on update restrict on delete restrict;
alter table public.billing_price_mappings drop constraint billing_price_mappings_check3;
alter table public.billing_price_mappings add constraint billing_catalogue_mapping_provenance check (
  (catalogue_evidence_id is null or verification_evidence_id is null) and
  (status<>'active' or (verified_at is not null and verification_sha256 is not null and
    (verification_evidence_id is not null or catalogue_evidence_id is not null))));
create index billing_catalogue_mapping_evidence on public.billing_price_mappings(catalogue_evidence_id,provider,environment);

create function public.billing_catalogue_authorize_v1() returns void
language plpgsql set search_path=pg_catalog,public as $$
begin
  if coalesce(nullif(current_setting('role',true),'none'),session_user) not in ('service_role','postgres','supabase_admin') then
    raise exception 'BILLING_CATALOGUE_FORBIDDEN' using errcode='42501';
  end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'BILLING_CATALOGUE_ISOLATION_UNSUPPORTED' using errcode='25001'; end if;
end $$;

create function public.record_verified_paddle_catalogue_v1(p_proof jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p jsonb; sha text; e public.billing_catalogue_evidence_v1%rowtype;
begin
  perform public.billing_catalogue_authorize_v1();
  p:=public.billing_catalogue_validate_v1(p_proof);
  sha:=encode(extensions.digest(p::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array('catalogue-observation-v1',p->>'provider',p->>'environment',p->>'verificationRef',p#>>'{catalogue,priceRef}')::text,0));
  select * into e from public.billing_catalogue_evidence_v1 where provider=p->>'provider' and environment=p->>'environment'
    and verification_ref=p->>'verificationRef' and provider_price_ref=p#>>'{catalogue,priceRef}';
  if found then
    if e.normalized_sha256<>sha then raise exception 'BILLING_CATALOGUE_REPLAY_CONFLICT'; end if;
    return jsonb_build_object('id',e.id,'digest',e.normalized_sha256,'reused',true);
  end if;
  insert into public.billing_catalogue_evidence_v1(provider,environment,verification_ref,provider_price_ref,proof,normalized_sha256,observed_at)
    values(p->>'provider',p->>'environment',p->>'verificationRef',p#>>'{catalogue,priceRef}',p,sha,(p->>'observedAt')::timestamptz) returning * into e;
  return jsonb_build_object('id',e.id,'digest',e.normalized_sha256,'reused',false);
end $$;

-- Independent evidence-to-mapping equality and commercial whitelist. This also
-- runs as a row guard, so trusted SQL callers cannot skip activation validation.
create function public.billing_catalogue_assert_mapping_v1(m public.billing_price_mappings) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare e public.billing_catalogue_evidence_v1%rowtype; c jsonb; amount bigint; version_id uuid;
begin
  select * into e from public.billing_catalogue_evidence_v1 where id=m.catalogue_evidence_id;
  if not found then raise exception 'BILLING_CATALOGUE_EVIDENCE_REQUIRED'; end if;
  c:=public.billing_catalogue_validate_v1(e.proof)->'catalogue';
  amount:=case m.canonical_key when 'launch' then 1900 when 'growth' then 5900 when 'scale' then 11900 when 'coach-seat' then 1200 end;
  if m.cadence='annual' then amount:=amount*10; end if;
  version_id:=case m.identity_kind when 'plan' then m.plan_version_id when 'addon' then m.addon_version_id end;
  if not (m.provider='paddle' and m.environment='test' and e.provider=m.provider and e.environment=m.environment
    and m.verification_evidence_id is null and m.verification_sha256=e.normalized_sha256 and m.verified_at=e.observed_at
    and m.provider_price_ref::text=c->>'priceRef' and m.provider_product_ref::text=c->>'productRef'
    and m.identity_kind=c->>'identityKind' and m.canonical_key=c->>'canonicalKey' and version_id::text=c->>'canonicalVersionId'
    and ((m.identity_kind='plan' and m.canonical_key in ('launch','growth','scale') and m.addon_version_id is null)
      or (m.identity_kind='addon' and m.canonical_key='coach-seat' and m.plan_version_id is null))
    and m.cadence=c->>'cadence' and m.currency_code='USD' and c->>'currency'='USD'
    and m.unit_amount_minor=amount and m.unit_amount_minor=(c->>'unitAmountMinor')::bigint
    and m.recurrence_unit=(case m.cadence when 'monthly' then 'month' when 'annual' then 'year' end)
    and m.recurrence_unit=c->>'recurrenceUnit' and m.recurrence_count=1 and c->'recurrenceCount'='1'::jsonb
    and c->'trial'='null'::jsonb and c->>'priceStatus'='active' and c->>'productStatus'='active'
    and m.quantity_model='separate_recurring_item'
    and (c->'quantity'='null'::jsonb or c#>'{quantity,minimum}'='1'::jsonb)) is true then
    raise exception 'BILLING_CATALOGUE_MAPPING_MISMATCH';
  end if;
end $$;

create function public.draft_paddle_catalogue_mapping_v1(p_evidence_id uuid,p_digest text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.billing_catalogue_evidence_v1%rowtype; c jsonb; m public.billing_price_mappings%rowtype;
begin
  perform public.billing_catalogue_authorize_v1();
  select * into e from public.billing_catalogue_evidence_v1 where id=p_evidence_id;
  if not found or p_digest is distinct from e.normalized_sha256::text then raise exception 'BILLING_CATALOGUE_EVIDENCE_REQUIRED'; end if;
  if e.environment<>'test' then raise exception 'BILLING_CATALOGUE_ENVIRONMENT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('paddle-catalogue-publication-v1:test',0));
  c:=e.proof->'catalogue';
  select * into m from public.billing_price_mappings where provider=e.provider and environment=e.environment and provider_price_ref=e.provider_price_ref for update;
  if found then
    if m.status<>'draft' then raise exception 'BILLING_CATALOGUE_NOT_DRAFT'; end if;
    -- Never repurpose a price already claimed by a different canonical identity,
    -- even while draft. Refreshing evidence for the same draft is permitted.
    if (m.identity_kind,m.canonical_key,m.cadence,coalesce(m.plan_version_id,m.addon_version_id),m.provider_product_ref::text)
      is distinct from (c->>'identityKind',c->>'canonicalKey',c->>'cadence',(c->>'canonicalVersionId')::uuid,c->>'productRef') then raise exception 'BILLING_CATALOGUE_PRICE_CLAIMED'; end if;
    update public.billing_price_mappings set catalogue_evidence_id=e.id,verification_evidence_id=null,verification_sha256=e.normalized_sha256,verified_at=e.observed_at,updated_at=clock_timestamp() where id=m.id returning * into m;
  else
    insert into public.billing_price_mappings(provider,environment,identity_kind,canonical_key,plan_version_id,addon_version_id,cadence,
      provider_product_ref,provider_price_ref,currency_code,unit_amount_minor,recurrence_unit,recurrence_count,
      catalogue_evidence_id,verification_sha256,verified_at,status)
    values(e.provider,e.environment,c->>'identityKind',c->>'canonicalKey',case when c->>'identityKind'='plan' then (c->>'canonicalVersionId')::uuid end,
      case when c->>'identityKind'='addon' then (c->>'canonicalVersionId')::uuid end,c->>'cadence',c->>'productRef',c->>'priceRef',c->>'currency',
      (c->>'unitAmountMinor')::bigint,c->>'recurrenceUnit',(c->>'recurrenceCount')::integer,e.id,e.normalized_sha256,e.observed_at,'draft') returning * into m;
  end if;
  perform public.billing_catalogue_assert_mapping_v1(m);
  return m.id;
end $$;

create function public.activate_paddle_catalogue_mapping_v1(p_mapping_id uuid,p_evidence_id uuid,p_digest text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.billing_price_mappings%rowtype;
begin
  perform public.billing_catalogue_authorize_v1();
  perform pg_advisory_xact_lock(hashtextextended('paddle-catalogue-publication-v1:test',0));
  select * into m from public.billing_price_mappings where id=p_mapping_id for update;
  if not found or m.status='retired' then raise exception 'BILLING_CATALOGUE_NOT_DRAFT'; end if;
  if p_evidence_id is null or p_digest is null or m.catalogue_evidence_id is distinct from p_evidence_id or m.verification_sha256::text is distinct from p_digest then raise exception 'BILLING_CATALOGUE_EVIDENCE_REQUIRED'; end if;
  perform public.billing_catalogue_assert_mapping_v1(m);
  update public.billing_price_mappings set status='active',updated_at=clock_timestamp() where id=m.id;
  return m.id;
end $$;

create function public.retire_paddle_catalogue_mapping_v1(p_mapping_id uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.billing_price_mappings%rowtype;
begin
  perform public.billing_catalogue_authorize_v1();
  perform pg_advisory_xact_lock(hashtextextended('paddle-catalogue-publication-v1:test',0));
  select * into m from public.billing_price_mappings where id=p_mapping_id for update;
  if not found or m.catalogue_evidence_id is null or m.environment<>'test' then raise exception 'BILLING_CATALOGUE_EVIDENCE_REQUIRED'; end if;
  if m.status<>'retired' then update public.billing_price_mappings set status='retired',retired_at=clock_timestamp(),updated_at=clock_timestamp() where id=m.id; end if;
  return m.id;
end $$;

create function public.validate_paddle_catalogue_v1(p_environment text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.billing_price_mappings%rowtype; total integer:=0;
begin
  perform public.billing_catalogue_authorize_v1();
  if p_environment is distinct from 'test' then raise exception 'BILLING_CATALOGUE_ENVIRONMENT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('paddle-catalogue-publication-v1:test',0));
  for m in select * from public.billing_price_mappings where provider='paddle' and environment=p_environment and status='active' order by id for share loop
    perform public.billing_catalogue_assert_mapping_v1(m);
    if m.identity_kind='plan' then
      perform 1 from public.commercial_plan_versions where id=m.plan_version_id and status='active' for share;
    else
      perform 1 from public.commercial_addon_versions where id=m.addon_version_id and status='active' for share;
    end if;
    if not found then raise exception 'BILLING_CATALOGUE_INCOMPLETE'; end if;
    total:=total+1;
  end loop;
  -- Existing unique(provider,environment,key,cadence) for active rows plus the
  -- closed four-key/two-cadence whitelist proves each pair occurs exactly once.
  if total<>8 then raise exception 'BILLING_CATALOGUE_INCOMPLETE'; end if;
  return true;
end $$;

-- Mapping guard replacement below preserves the foundation branch verbatim.
create or replace function public.billing_v2_protect_mapping() returns trigger
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
  if tg_op='UPDATE' and old.catalogue_evidence_id is not null and
    (new.catalogue_evidence_id is null or (new.provider,new.environment,new.provider_price_ref,new.provider_product_ref,new.identity_kind,new.canonical_key,new.cadence,new.plan_version_id,new.addon_version_id)
      is distinct from (old.provider,old.environment,old.provider_price_ref,old.provider_product_ref,old.identity_kind,old.canonical_key,old.cadence,old.plan_version_id,old.addon_version_id)) then
    raise exception 'BILLING_CATALOGUE_PRICE_CLAIMED';
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
  if new.catalogue_evidence_id is not null then
    perform public.billing_catalogue_assert_mapping_v1(new);
  elsif new.status in ('active','retired') then
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

-- Exact function grants, never table grants or a generic mutation endpoint.
revoke all on function public.billing_catalogue_validate_v1(jsonb), public.billing_catalogue_authorize_v1(),
  public.billing_catalogue_assert_mapping_v1(public.billing_price_mappings), public.record_verified_paddle_catalogue_v1(jsonb),
  public.draft_paddle_catalogue_mapping_v1(uuid,text), public.activate_paddle_catalogue_mapping_v1(uuid,uuid,text),
  public.retire_paddle_catalogue_mapping_v1(uuid), public.validate_paddle_catalogue_v1(text) from public,anon,authenticated,service_role;
grant execute on function public.record_verified_paddle_catalogue_v1(jsonb), public.draft_paddle_catalogue_mapping_v1(uuid,text),
  public.activate_paddle_catalogue_mapping_v1(uuid,uuid,text), public.retire_paddle_catalogue_mapping_v1(uuid),
  public.validate_paddle_catalogue_v1(text) to service_role;
comment on table public.billing_catalogue_evidence_v1 is 'Immutable sanitized catalogue receipts. Service credentials are a trusted boundary, not cryptographic SQL authentication. No payment authority; no production verifier composed.';
comment on column public.billing_price_mappings.catalogue_evidence_id is 'Verified catalogue publication provenance. Foundation structural provenance remains separate and cannot satisfy the catalogue completeness contract.';
commit;
