-- Dormant service-only checkout authority. No policy updates or provider calls.
begin;
create table public.billing_paddle_checkout_snapshots (
  checkout_id uuid primary key references public.billing_checkouts_v2(id),
  base_price_ref public.billing_v2_ref not null,
  base_product_ref public.billing_v2_ref not null,
  seat_price_ref public.billing_v2_ref,
  seat_product_ref public.billing_v2_ref,
  base_evidence_id uuid not null references public.billing_catalogue_evidence_v1(id),
  seat_evidence_id uuid references public.billing_catalogue_evidence_v1(id),
  terms_version text not null check(terms_version='2026-09-18'),
  refund_version text not null check(refund_version='2026-09-18'),
  legal_effective_date date not null default '2026-09-18' check(legal_effective_date='2026-09-18'),
  acknowledged_at timestamptz not null default clock_timestamp(),
  check((seat_price_ref is null)=(seat_product_ref is null) and (seat_price_ref is null)=(seat_evidence_id is null))
);
alter table public.billing_paddle_checkout_snapshots enable row level security;
revoke all on public.billing_paddle_checkout_snapshots from public,anon,authenticated,service_role;
create trigger paddle_checkout_snapshot_history before update or delete on public.billing_paddle_checkout_snapshots
for each row execute function public.billing_v2_protect_history('');
create trigger paddle_checkout_snapshot_no_truncate before truncate on public.billing_paddle_checkout_snapshots
for each statement execute function public.billing_v2_protect_history();

create function public.begin_paddle_checkout_v1(p_actor uuid,p_plan text,p_cadence text,p_seats integer,p_operation uuid,
 p_terms boolean,p_refund boolean,p_terms_version text,p_refund_version text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; t public.billing_checkouts_v2%rowtype; b public.billing_price_mappings%rowtype;
 s public.billing_price_mappings%rowtype; plan public.commercial_plan_versions%rowtype;
 old public.billing_paddle_checkout_snapshots%rowtype; admitted jsonb;
begin
 perform public.billing_guard_actor();
 if p_actor is null or p_operation is null or p_plan is null or p_plan not in ('launch','growth','scale')
 or p_cadence is null or p_cadence not in ('monthly','annual') or p_seats is null or p_seats<0 then raise exception 'PADDLE_CHECKOUT_INVALID'; end if;
 if p_terms is distinct from true or p_refund is distinct from true or p_terms_version is distinct from '2026-09-18'
 or p_refund_version is distinct from '2026-09-18' then raise exception 'PADDLE_CHECKOUT_LEGAL_REQUIRED'; end if;
 if not exists(select 1 from public.pt_profiles where user_id=p_actor and workspace_id is null)
 and not exists(select 1 from public.workspaces where owner_user_id=p_actor) then raise exception 'PADDLE_CHECKOUT_FORBIDDEN'; end if;
 perform public.billing_guard_lock(null,'test');
 if not (select paddle_sales_enabled from public.billing_runtime_policy where id=1) then raise exception 'PADDLE_CHECKOUT_DISABLED'; end if;
 a:=public.ensure_commercial_billing_account(p_actor,'manual');
 perform public.billing_guard_lock(a,'test');
 perform public.billing_guard_checkout_conflict(a,p_operation,'billing.v2');
 perform public.billing_guard_operation_conflict(a,p_operation,'v2');
 -- Ambiguous remains blocked even after nominal expiry. No guessed recovery.
 select * into t from public.billing_checkouts_v2 where billing_account_id=a
 and (operation_id=p_operation or status in ('creating','ready','ambiguous')) order by (operation_id=p_operation) desc limit 1 for update;
 if found then
   select * into old from public.billing_paddle_checkout_snapshots where checkout_id=t.id;
   if t.status='ambiguous' or (t.status='creating' and t.creation_lease_expires_at<=now()) then raise exception 'PADDLE_CHECKOUT_AMBIGUOUS'; end if;
   if old.checkout_id is null or t.environment<>'test' or t.cadence<>p_cadence or t.requested_additional_seats<>p_seats
   or not exists(select 1 from public.commercial_plan_versions where id=t.plan_version_id and plan_key=p_plan)
   or old.terms_version<>p_terms_version or old.refund_version<>p_refund_version then raise exception 'PADDLE_CHECKOUT_CONFLICT'; end if;
   return jsonb_build_object('dispatch',false,'status',t.status);
 end if;
 select * into strict plan from public.commercial_plan_versions where plan_key=p_plan and status='active' for share;
 if p_seats>plan.max_coach_seats-plan.included_coach_seats or p_seats>5 then raise exception 'PADDLE_CHECKOUT_SEAT_POLICY'; end if;
 -- Closed verified catalogue completeness, including active canonical versions.
 perform public.validate_paddle_catalogue_v1('test');
 select * into strict b from public.billing_price_mappings where provider='paddle' and environment='test'
 and canonical_key=p_plan and cadence=p_cadence and status='active' for share;
 perform public.billing_catalogue_assert_mapping_v1(b);
 if b.plan_version_id<>plan.id or b.currency_code<>'USD' then raise exception 'PADDLE_CHECKOUT_MAPPING'; end if;
 if p_seats>0 then
   select * into strict s from public.billing_price_mappings where provider='paddle' and environment='test'
   and canonical_key='coach-seat' and cadence=p_cadence and status='active' for share;
   perform public.billing_catalogue_assert_mapping_v1(s);
 end if;
 admitted:=public.billing_v2_admit_checkout(p_actor,'test',p_plan,p_cadence,p_seats,p_operation);
 if (admitted->>'reused')::boolean then raise exception 'PADDLE_CHECKOUT_CONFLICT'; end if;
 select * into strict t from public.billing_checkouts_v2 where id=(admitted->>'id')::uuid;
 insert into public.billing_paddle_checkout_snapshots(checkout_id,base_price_ref,base_product_ref,seat_price_ref,seat_product_ref,
 base_evidence_id,seat_evidence_id,terms_version,refund_version)
 values(t.id,b.provider_price_ref,b.provider_product_ref,s.provider_price_ref,s.provider_product_ref,b.catalogue_evidence_id,s.catalogue_evidence_id,p_terms_version,p_refund_version);
 return jsonb_build_object('dispatch',true,'status','creating','attemptReference',t.id,'operationReference',t.operation_id,
 'base',jsonb_build_object('priceReference',b.provider_price_ref,'productReference',b.provider_product_ref,'quantity',1),
 'seats',case when p_seats>0 then jsonb_build_object('priceReference',s.provider_price_ref,'productReference',s.provider_product_ref,'quantity',p_seats) else 'null'::jsonb end);
exception when no_data_found or too_many_rows then raise exception 'PADDLE_CHECKOUT_MAPPING';
end $$;

create function public.mark_paddle_checkout_ready_v1(p_actor uuid,p_attempt uuid,p_operation uuid,p_transaction text,p_status text,p_currency text,p_items jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; t public.billing_checkouts_v2%rowtype; s public.billing_paddle_checkout_snapshots%rowtype; expected jsonb;
begin
 perform public.billing_guard_actor();
 select billing_account_id into a from public.billing_checkouts_v2 where id=p_attempt and created_by_user_id=p_actor;
 if a is null then raise exception 'PADDLE_CHECKOUT_FORBIDDEN'; end if;
 perform public.billing_guard_lock(a,'test');
 select * into strict t from public.billing_checkouts_v2 where id=p_attempt for update;
 if t.environment<>'test' or t.status<>'creating' or t.operation_id is distinct from p_operation then raise exception 'PADDLE_CHECKOUT_CONFLICT'; end if;
 select * into strict s from public.billing_paddle_checkout_snapshots where checkout_id=t.id;
 expected:=jsonb_build_array(jsonb_build_object('priceReference',s.base_price_ref,'productReference',s.base_product_ref,'quantity',1));
 if t.requested_additional_seats>0 then expected:=expected||jsonb_build_array(jsonb_build_object('priceReference',s.seat_price_ref,'productReference',s.seat_product_ref,'quantity',t.requested_additional_seats)); end if;
 if p_transaction is null or octet_length(p_transaction) not between 1 and 256 or p_transaction ~ '[[:space:][:cntrl:]]' or p_status is null or p_status not in ('draft','ready')
 or p_currency is distinct from 'USD' or p_items is distinct from expected then raise exception 'PADDLE_CHECKOUT_RESPONSE_MISMATCH'; end if;
 update public.billing_checkouts_v2 set status='ready',provider_transaction_ref=p_transaction,updated_at=clock_timestamp() where id=t.id;
end $$;

create function public.paddle_checkout_outcome_v1(p_actor uuid,p_attempt uuid,p_operation uuid,p_ambiguous boolean) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare a uuid; t public.billing_checkouts_v2%rowtype;
begin
 perform public.billing_guard_actor();
 select billing_account_id into a from public.billing_checkouts_v2 where id=p_attempt and created_by_user_id=p_actor;
 if a is null then raise exception 'PADDLE_CHECKOUT_FORBIDDEN'; end if;
 perform public.billing_guard_lock(a,'test');
 select * into strict t from public.billing_checkouts_v2 where id=p_attempt for update;
 if t.environment<>'test' or t.operation_id is distinct from p_operation or t.status<>'creating' or p_ambiguous is null then raise exception 'PADDLE_CHECKOUT_CONFLICT'; end if;
 update public.billing_checkouts_v2 set status=case when p_ambiguous then 'ambiguous' else 'failed' end,
 error_code=case when p_ambiguous then 'PADDLE_CHECKOUT_AMBIGUOUS' else 'PADDLE_CHECKOUT_NOT_DISPATCHED' end,
 failed_at=case when not p_ambiguous then clock_timestamp() end,updated_at=clock_timestamp() where id=t.id;
end $$;
create function public.mark_paddle_checkout_ambiguous_v1(p_actor uuid,p_attempt uuid,p_operation uuid) returns void
language sql security definer set search_path=pg_catalog,public as $$ select public.paddle_checkout_outcome_v1(p_actor,p_attempt,p_operation,true) $$;
create function public.mark_paddle_checkout_failed_v1(p_actor uuid,p_attempt uuid,p_operation uuid) returns void
language sql security definer set search_path=pg_catalog,public as $$ select public.paddle_checkout_outcome_v1(p_actor,p_attempt,p_operation,false) $$;
revoke all on function public.begin_paddle_checkout_v1(uuid,text,text,integer,uuid,boolean,boolean,text,text),
 public.mark_paddle_checkout_ready_v1(uuid,uuid,uuid,text,text,text,jsonb),public.paddle_checkout_outcome_v1(uuid,uuid,uuid,boolean),
 public.mark_paddle_checkout_ambiguous_v1(uuid,uuid,uuid),public.mark_paddle_checkout_failed_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.begin_paddle_checkout_v1(uuid,text,text,integer,uuid,boolean,boolean,text,text),
 public.mark_paddle_checkout_ready_v1(uuid,uuid,uuid,text,text,text,jsonb),public.mark_paddle_checkout_ambiguous_v1(uuid,uuid,uuid),
 public.mark_paddle_checkout_failed_v1(uuid,uuid,uuid) to service_role;
-- Uncertain dispatched attempts cannot be expired by legacy housekeeping to
-- open a retry window. Recovery is a separate, deliberately absent authority.
create function public.protect_paddle_checkout_uncertainty_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if old.status in ('creating','ambiguous') and new.status='expired' and exists(
 select 1 from public.billing_paddle_checkout_snapshots where checkout_id=old.id) then
 raise exception 'PADDLE_CHECKOUT_AMBIGUOUS'; end if;
 return new;
end $$;
revoke all on function public.protect_paddle_checkout_uncertainty_v1() from public,anon,authenticated,service_role;
create trigger paddle_checkout_uncertainty before update on public.billing_checkouts_v2
for each row execute function public.protect_paddle_checkout_uncertainty_v1();
commit;
