-- Temporary staging QA authority. Retire via PADDLE-CERT-FIXTURE-02 before sales.
-- No provider calls, policy changes, account creation or canonical authority.
begin;
create table public.billing_paddle_checkout_certification_fixtures (
 run_id uuid primary key,
 checkout_id uuid not null unique references public.billing_checkouts_v2(id),
 created_at timestamptz not null default clock_timestamp(),
 closed_at timestamptz,
 check(closed_at is null or closed_at>=created_at)
);
alter table public.billing_paddle_checkout_certification_fixtures enable row level security;
revoke all on public.billing_paddle_checkout_certification_fixtures from public,anon,authenticated,service_role;
create trigger paddle_certification_fixture_history before update or delete on public.billing_paddle_checkout_certification_fixtures
 for each row execute function public.billing_v2_protect_history('closed_at');
create trigger paddle_certification_fixture_no_truncate before truncate on public.billing_paddle_checkout_certification_fixtures
 for each statement execute function public.billing_v2_protect_history();

create function public.billing_paddle_certification_gate_v1(p_account uuid) returns void
language plpgsql set search_path=pg_catalog,public as $$
begin
 perform public.billing_guard_actor();
 perform public.billing_guard_lock(p_account,'test');
 if (select paddle_sales_enabled or paddle_reconciliation_enabled from public.billing_runtime_policy where id=1) then
  raise exception 'PADDLE_CERTIFICATION_DISABLED';
 end if;
end $$;

create function public.create_paddle_checkout_certification_fixture_v1(p_owner uuid,p_plan text,p_cadence text,p_seats integer,p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; marker public.billing_paddle_checkout_certification_fixtures%rowtype;
 t public.billing_checkouts_v2%rowtype; snap public.billing_paddle_checkout_snapshots%rowtype;
 b public.billing_price_mappings%rowtype; s public.billing_price_mappings%rowtype;
 plan public.commercial_plan_versions%rowtype; admitted jsonb; items jsonb; tx text;
begin
 perform public.billing_guard_actor();
 if p_owner is null or p_run is null or p_plan is null or p_plan not in ('launch','growth','scale')
  or p_cadence is null or p_cadence not in ('monthly','annual') or p_seats is null or p_seats<0 then
  raise exception 'PADDLE_CERTIFICATION_INVALID';
 end if;
 select id into a from public.billing_accounts where owner_user_id=p_owner;
 if a is null then raise exception 'CERTIFICATION_ACTOR_MISSING'; end if;
 perform public.billing_paddle_certification_gate_v1(a);
 -- Only administrator-controlled app metadata can designate a dedicated QA
 -- identity. Never infer this from email, names or editable user metadata.
 if not exists(select 1 from auth.users where id=p_owner and raw_app_meta_data @>
  '{"repsync_paddle_certification":{"environment":"staging","enabled":true}}'::jsonb)
  or (not exists(select 1 from public.pt_profiles where user_id=p_owner and workspace_id is null)
   and not exists(select 1 from public.workspaces where owner_user_id=p_owner)) then
  raise exception 'CERTIFICATION_ACTOR_MISSING';
 end if;
 perform public.billing_guard_checkout_conflict(a,p_run,'billing.v2');
 perform public.billing_guard_operation_conflict(a,p_run,'v2');
 -- Reject an existing same-operation commercial operation too: certification
 -- must not turn an operation replay into an independent checkout intent.
 if exists(select 1 from public.billing_operations_v2 where billing_account_id=a and operation_id=p_run) then
  raise exception 'PADDLE_CERTIFICATION_CONFLICT';
 end if;
 perform public.validate_paddle_catalogue_v1('test');
 if (select count(*) from public.billing_price_mappings where provider='paddle' and environment='test' and status='active')<>8 then
  raise exception 'BILLING_CATALOGUE_INCOMPLETE';
 end if;
 select * into strict plan from public.commercial_plan_versions where plan_key=p_plan and status='active' for share;
 if p_seats>plan.max_coach_seats-plan.included_coach_seats or p_seats>5 then raise exception 'PADDLE_CHECKOUT_SEAT_POLICY'; end if;
 select * into strict b from public.billing_price_mappings where provider='paddle' and environment='test'
  and canonical_key=p_plan and cadence=p_cadence and status='active' for share;
 perform public.billing_catalogue_assert_mapping_v1(b);
 if b.plan_version_id<>plan.id or b.currency_code<>'USD' then raise exception 'PADDLE_CHECKOUT_MAPPING'; end if;
 if p_seats>0 then
  select * into strict s from public.billing_price_mappings where provider='paddle' and environment='test'
   and canonical_key='coach-seat' and cadence=p_cadence and status='active' for share;
  perform public.billing_catalogue_assert_mapping_v1(s);
 end if;
 -- Account before run, matching checkout/correlation lock order. The global
 -- run lock also serializes conflicting reuse across different QA accounts.
 perform pg_advisory_xact_lock(hashtextextended('paddle-certification:'||p_run::text,0));
 tx:='repsync-cert-'||p_run::text;
 select * into marker from public.billing_paddle_checkout_certification_fixtures where run_id=p_run;
 if found then
  select * into strict t from public.billing_checkouts_v2 where id=marker.checkout_id;
  select * into strict snap from public.billing_paddle_checkout_snapshots where checkout_id=t.id;
  if marker.closed_at is not null then raise exception 'PADDLE_CERTIFICATION_CLOSED'; end if;
  if t.billing_account_id<>a or t.created_by_user_id<>p_owner or t.operation_id<>p_run or t.provider<>'paddle' or t.environment<>'test'
   or t.status<>'ready' or t.provider_transaction_ref is distinct from tx or t.provider_checkout_ref is not null
   or t.plan_version_id<>plan.id or t.cadence<>p_cadence or t.requested_additional_seats<>p_seats
   or t.base_mapping_id<>b.id or t.seat_mapping_id is distinct from s.id
   or (snap.base_price_ref,snap.base_product_ref,snap.base_evidence_id,snap.seat_price_ref,snap.seat_product_ref,snap.seat_evidence_id)
    is distinct from (b.provider_price_ref,b.provider_product_ref,b.catalogue_evidence_id,s.provider_price_ref,s.provider_product_ref,s.catalogue_evidence_id)
   or snap.terms_version<>'2026-09-18' or snap.refund_version<>'2026-09-18' or snap.legal_effective_date<>'2026-09-18'::date then
   raise exception 'PADDLE_CERTIFICATION_CONFLICT';
  end if;
 else
  -- Reuse all normal admission guards (including subscription and same-ledger
  -- checkout checks). Reused unmarked operations must never acquire a marker.
  admitted:=public.billing_v2_admit_checkout(p_owner,'test',p_plan,p_cadence,p_seats,p_run);
  if (admitted->>'reused')::boolean then raise exception 'PADDLE_CERTIFICATION_CONFLICT'; end if;
  select * into strict t from public.billing_checkouts_v2 where id=(admitted->>'id')::uuid;
  insert into public.billing_paddle_checkout_snapshots(checkout_id,base_price_ref,base_product_ref,seat_price_ref,seat_product_ref,
   base_evidence_id,seat_evidence_id,terms_version,refund_version,legal_effective_date)
  values(t.id,b.provider_price_ref,b.provider_product_ref,s.provider_price_ref,s.provider_product_ref,b.catalogue_evidence_id,s.catalogue_evidence_id,
   '2026-09-18','2026-09-18','2026-09-18');
  items:=jsonb_build_array(jsonb_build_object('priceReference',b.provider_price_ref,'productReference',b.provider_product_ref,'quantity',1));
  if p_seats>0 then items:=items||jsonb_build_array(jsonb_build_object('priceReference',s.provider_price_ref,'productReference',s.provider_product_ref,'quantity',p_seats)); end if;
  perform public.mark_paddle_checkout_ready_v1(p_owner,t.id,p_run,tx,'ready','USD',items);
  insert into public.billing_paddle_checkout_certification_fixtures(run_id,checkout_id) values(p_run,t.id);
 end if;
 return jsonb_build_object('runId',p_run,'checkoutId',t.id,'transactionReference',tx,'plan',p_plan,'cadence',p_cadence,'additionalCoachSeats',p_seats);
exception when no_data_found or too_many_rows then raise exception 'PADDLE_CERTIFICATION_CONFLICT';
end $$;

create function public.close_paddle_checkout_certification_fixture_v1(p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; marker public.billing_paddle_checkout_certification_fixtures%rowtype; t public.billing_checkouts_v2%rowtype;
begin
 perform public.billing_guard_actor();
 select c.billing_account_id into a from public.billing_paddle_checkout_certification_fixtures f join public.billing_checkouts_v2 c on c.id=f.checkout_id where f.run_id=p_run;
 if a is null then raise exception 'PADDLE_CERTIFICATION_NOT_FOUND'; end if;
 perform public.billing_paddle_certification_gate_v1(a);
 perform pg_advisory_xact_lock(hashtextextended('paddle-certification:'||p_run::text,0));
 select * into strict marker from public.billing_paddle_checkout_certification_fixtures where run_id=p_run for update;
 select * into strict t from public.billing_checkouts_v2 where id=marker.checkout_id for update;
 if t.provider<>'paddle' or t.environment<>'test' or t.billing_account_id<>a or t.operation_id<>p_run
  or t.provider_transaction_ref is distinct from 'repsync-cert-'||p_run::text or t.provider_checkout_ref is not null
  or not exists(select 1 from public.billing_paddle_checkout_snapshots where checkout_id=t.id) then
  raise exception 'PADDLE_CERTIFICATION_CONFLICT';
 end if;
 if marker.closed_at is not null then
  if t.status<>'expired' then raise exception 'PADDLE_CERTIFICATION_CONFLICT'; end if;
  return jsonb_build_object('runId',p_run,'closed',true);
 end if;
 if t.status<>'ready' then raise exception 'PADDLE_CERTIFICATION_CONFLICT'; end if;
 update public.billing_checkouts_v2 set status='expired',expired_at=clock_timestamp(),error_code='PADDLE_CERTIFICATION_CLOSED',updated_at=clock_timestamp() where id=t.id;
 update public.billing_paddle_checkout_certification_fixtures set closed_at=clock_timestamp() where run_id=p_run;
 return jsonb_build_object('runId',p_run,'closed',true);
end $$;
revoke all on function public.billing_paddle_certification_gate_v1(uuid),
 public.create_paddle_checkout_certification_fixture_v1(uuid,text,text,integer,uuid),
 public.close_paddle_checkout_certification_fixture_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_paddle_checkout_certification_fixture_v1(uuid,text,text,integer,uuid),
 public.close_paddle_checkout_certification_fixture_v1(uuid) to service_role;
commit;
