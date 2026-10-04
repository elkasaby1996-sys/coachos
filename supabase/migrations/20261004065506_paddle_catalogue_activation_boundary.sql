-- PAY-04: catalogue-driven initial activation and a bounded normalized paid-state seam.
-- No data backfill, policy enablement, new provider, LS retirement or table changes.
begin;

-- Validate retained settlement dates using the trusted catalogue interval. Dates
-- come from authenticated provider evidence; this helper never invents a period.
create function public.billing_paddle_initial_period_matches_v1(p_mapping uuid,p_period jsonb,p_settled timestamptz)
returns boolean language plpgsql stable set search_path=pg_catalog,public as $$
declare m public.billing_price_mappings%rowtype; c jsonb; start_at timestamptz; end_at timestamptz; interval_unit text;
begin
 select * into m from public.billing_price_mappings where id=p_mapping;
 if m.id is null then return false; end if;
 perform public.billing_catalogue_assert_mapping_v1(m);
 select proof->'catalogue' into c from public.billing_catalogue_evidence_v1 where id=m.catalogue_evidence_id;
 interval_unit:=c->>'recurrenceUnit';
 if c->>'recurrenceCount' is distinct from '1' or c->'trial' is distinct from 'null'::jsonb
 or (m.cadence,interval_unit) not in (('monthly','month'),('annual','year'))
 or jsonb_typeof(p_period) is distinct from 'object' then return false; end if;
 perform public.billing_paddle_lifecycle_shape_v1(jsonb_build_object('billingPeriod',p_period));
 start_at:=public.billing_paddle_timestamp_v1(p_period->'startsAt');
 end_at:=public.billing_paddle_timestamp_v1(p_period->'endsAt');
 return coalesce(p_settled is not null and start_at<=p_settled and end_at>p_settled
 and end_at=(start_at at time zone 'UTC'+case interval_unit when 'month' then interval '1 month' when 'year' then interval '1 year' end) at time zone 'UTC',false);
end $$;

-- Preserve every other authenticated-provenance, ownership, payment, replay and
-- cross-ledger check, as well as byte-equal Growth Monthly retained proof facts.
do $$ declare body text; needle text; replacement text; begin
 body:=pg_get_functiondef('public.billing_paddle_initial_proof_v1(uuid)'::regprocedure);
 needle:='(s.billing_account_id,''paddle''::text,''test''::text,''monthly''::text,0)';
 if position(needle in body)=0 then raise exception 'PAY04_INITIAL_PROOF_SHAPE'; end if;
 body:=replace(body,needle,'(s.billing_account_id,''paddle''::text,''test''::text,co.cadence,0)');
 needle:='(''paddle''::text,''test''::text,''plan''::text,''growth''::text,''monthly''::text,''USD''::text,co.plan_version_id)';
 if position(needle in body)=0 then raise exception 'PAY04_INITIAL_MAPPING_SHAPE'; end if;
 body:=replace(body,needle,'(''paddle''::text,''test''::text,''plan''::text,(select plan_key from public.commercial_plan_versions where id=co.plan_version_id),co.cadence,''USD''::text,co.plan_version_id)');
 needle:='perform public.billing_catalogue_assert_mapping_v1(m);';
 if position(needle in body)=0 then raise exception 'PAY04_INITIAL_CATALOGUE_SHAPE'; end if;
 replacement:=needle||$patch$
 if co.cadence not in ('monthly','annual') or m.canonical_key not in ('launch','growth','scale') then
 raise exception 'PADDLE_RECONCILIATION_MAPPING'; end if;
 if co.cadence='annual' and not public.billing_paddle_initial_period_matches_v1(m.id,txn.observation->'billingPeriod',
 (select occurred_at from public.billing_webhook_events_v2 where id=txn.event_id)) then
 raise exception 'PADDLE_INITIAL_PERIOD_BOUNDS'; end if;
$patch$;
 body:=replace(body,needle,replacement); execute body;

 body:=pg_get_functiondef('public.billing_paddle_initial_item_guard_v1()'::regprocedure);
 needle:='new.cadence<>''monthly''';
 if position(needle in body)=0 then raise exception 'PAY04_INITIAL_ITEM_SHAPE'; end if;
 body:=replace(body,needle,'new.cadence is distinct from e.proof#>>''{observation,cadence}'''); execute body;

 body:=pg_get_functiondef('public.reconcile_paddle_initial_purchase_v1(uuid,text)'::regprocedure);
 needle:='cadence=''monthly''';
 if position(needle in body)=0 then raise exception 'PAY04_INITIAL_RETRY_SHAPE'; end if;
 body:=replace(body,needle,'cadence=facts->>''cadence''');
 needle:='(facts->>''mappingId'')::uuid,''monthly'',''plan'',1,se';
 if position(needle in body)=0 then raise exception 'PAY04_INITIAL_INSERT_SHAPE'; end if;
 body:=replace(body,needle,'(facts->>''mappingId'')::uuid,facts->>''cadence'',''plan'',1,se'); execute body;

 body:=pg_get_functiondef('public.billing_paddle_initial_period_facts_v1(uuid)'::regprocedure);
 needle:='cadence=''monthly''';
 if position(needle in body)=0 then raise exception 'PAY04_INITIAL_PERIOD_ITEM_SHAPE'; end if;
 body:=replace(body,needle,'cadence=facts->>''cadence''');
 needle:='end_at<>(start_at at time zone ''UTC''+interval ''1 month'') at time zone ''UTC''';
 if position(needle in body)=0 then raise exception 'PAY04_INITIAL_PERIOD_INTERVAL_SHAPE'; end if;
 body:=replace(body,needle,'not public.billing_paddle_initial_period_matches_v1((facts->>''mappingId'')::uuid,o->''billingPeriod'',settled_at)'); execute body;
end $$;

-- Provider-specific normalization stays at this integration boundary. Core
-- entitlement/capacity code consumes RepSync plan/seat concepts, not Paddle evidence.
create function public.billing_paddle_paid_state_v1(p_canonical uuid,p_at timestamptz)
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype; a public.account_subscriptions%rowtype; seats integer; mapping uuid;
begin
 select * into a from public.account_subscriptions where id=p_canonical;
 select * into s from public.billing_subscriptions_v2 where account_subscription_id=p_canonical and provider='paddle' and shadow_status='current';
 if a.id is null or a.subscription_kind<>'paid' or s.id is null or s.billing_account_id is distinct from a.billing_account_id
 or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=a.id and billing_account_id=a.billing_account_id and storage_contract='billing.v2')
 or exists(select 1 from public.billing_provider_subscriptions where account_subscription_id=a.id)
 then return jsonb_build_object('available',false); end if;
 seats:=s.approved_additional_coach_seats;
 select least(seats,target_additional_seats) into seats from public.billing_operations_v2 where subscription_id=s.id
 and operation_kind='seat_quantity' and effective_timing='period_end' and status not in ('completed','canceled','failed');
 mapping:=public.billing_paddle_current_mapping_v1(s.id);
 return jsonb_build_object('available',true,'provider','paddle',
 'planVersionId',coalesce(public.billing_paddle_scheduled_plan_v1(a.id,p_at),a.plan_version_id),
 'additionalSeats',s.approved_additional_coach_seats,'growthAdditionalSeats',coalesce(seats,s.approved_additional_coach_seats),
 'cadence',(select cadence from public.billing_price_mappings where id=mapping));
end $$;

-- Single current adapter dispatch; an unknown/missing provider never becomes paid authority.
create function public.billing_paid_state_v1(p_canonical uuid,p_at timestamptz default now())
returns jsonb language plpgsql stable set search_path=pg_catalog,public as $$
declare provider_key text;
begin
 select provider into provider_key from public.billing_subscriptions_v2 where account_subscription_id=p_canonical and shadow_status='current';
 if provider_key='paddle' then return public.billing_paddle_paid_state_v1(p_canonical,p_at); end if;
 return jsonb_build_object('available',false);
end $$;

create function public.billing_workflow_provider_v1(p_owner uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 perform public.billing_guard_actor();
 if public.paddle_plan_change_route_v1(p_owner) then return 'paddle'; end if;
 return null;
end $$;

do $$ declare body text; needle text; begin
 body:=pg_get_functiondef('public.resolve_account_entitlements(uuid)'::regprocedure);
 needle:=$old$v_paid_unavailable := not exists (
      select 1 from public.billing_subscriptions_v2 b
      join public.billing_canonical_origins o on o.account_subscription_id=b.account_subscription_id
        and o.billing_account_id=b.billing_account_id and o.storage_contract='billing.v2'
      where b.billing_account_id=p_billing_account_id and b.account_subscription_id=s.id
        and b.provider='paddle' and b.shadow_status='current'
    ) or exists (select 1 from public.billing_provider_subscriptions b where b.account_subscription_id=s.id);$old$;
 if position(needle in body)=0 then raise exception 'PAY04_ENTITLEMENT_AUTHORITY_SHAPE'; end if;
 body:=replace(body,needle,'v_paid_unavailable := not coalesce((public.billing_paid_state_v1(s.id)->>''available'')::boolean,false);');
 needle:='coalesce(public.billing_paddle_scheduled_plan_v1(s.id,now()),s.plan_version_id)';
 if position(needle in body)=0 then raise exception 'PAY04_ENTITLEMENT_PLAN_SHAPE'; end if;
 body:=replace(body,needle,'coalesce((public.billing_paid_state_v1(s.id)->>''planVersionId'')::uuid,s.plan_version_id)'); execute body;

 body:=pg_get_functiondef('public.billing_plan_change_preflight(uuid,uuid,uuid)'::regprocedure);
 needle:='coalesce((select approved_additional_coach_seats from public.billing_subscriptions_v2 where billing_account_id=p_account and provider=''paddle'' and shadow_status=''current'' and account_subscription_id=(c#>>''{subscription,id}'')::uuid),0)';
 if position(needle in body)=0 then raise exception 'PAY04_PREFLIGHT_SEAT_SHAPE'; end if;
 body:=replace(body,needle,'coalesce((public.billing_paid_state_v1((c#>>''{subscription,id}'')::uuid)->>''additionalSeats'')::integer,0)'); execute body;
end $$;

create or replace function public.billing_seat_effective_limit(p_account uuid,p_growth boolean default false)
returns integer language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e jsonb:=public.resolve_account_entitlements(p_account); paid jsonb; n integer;
begin
 if e#>>'{subscription,kind}'<>'paid' then return (e#>>'{limits,maxCoachSeats}')::integer; end if;
 paid:=public.billing_paid_state_v1((e#>>'{subscription,id}')::uuid);
 if not coalesce((paid->>'available')::boolean,false) then return (e#>>'{limits,maxCoachSeats}')::integer; end if;
 n:=(paid->>case when p_growth then 'growthAdditionalSeats' else 'additionalSeats' end)::integer;
 return least((e#>>'{limits,maxCoachSeats}')::integer,(e#>>'{limits,includedCoachSeats}')::integer+n);
end $$;

-- Existing public UI projections retain their wire contracts, but their provider
-- implementation is named and isolated here, not embedded in the generic reader.
do $$ declare body text; begin
 body:=pg_get_functiondef('public.get_my_billing_plan_change_state()'::regprocedure);
 execute replace(body,'public.get_my_billing_plan_change_state()','public.billing_paddle_plan_state_v1()');
 body:=pg_get_functiondef('public.get_my_billing_seat_quantity_state()'::regprocedure);
 execute replace(body,'public.get_my_billing_seat_quantity_state()','public.billing_paddle_seat_state_v1()');
end $$;
create or replace function public.get_my_billing_plan_change_state() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$ select public.billing_paddle_plan_state_v1() $$;
create or replace function public.get_my_billing_seat_quantity_state() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$ select public.billing_paddle_seat_state_v1() $$;

revoke all on function public.billing_paddle_initial_period_matches_v1(uuid,jsonb,timestamptz),
 public.billing_paddle_paid_state_v1(uuid,timestamptz),public.billing_paid_state_v1(uuid,timestamptz),
 public.billing_paddle_plan_state_v1(),public.billing_paddle_seat_state_v1(),public.billing_workflow_provider_v1(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.billing_workflow_provider_v1(uuid) to service_role;
commit;
