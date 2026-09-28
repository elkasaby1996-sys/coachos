-- Explicit retained initial-settlement periods; no backfill or policy change.
begin;

create table public.billing_paddle_initial_period_bootstraps (
 subscription_id uuid primary key references public.billing_subscriptions_v2(id) on delete restrict,
 account_subscription_id uuid not null unique references public.account_subscriptions(id) on delete restrict,
 payment_application_id uuid not null unique references public.billing_payment_applications_v2(id) on delete restrict,
 proof_schema text not null default 'paddle-initial-period-v1' check(proof_schema='paddle-initial-period-v1'),
 proof jsonb not null check(jsonb_typeof(proof)='object'),
 recorded_at timestamptz not null default transaction_timestamp()
);
alter table public.billing_paddle_initial_period_bootstraps enable row level security;
revoke all on public.billing_paddle_initial_period_bootstraps from public,anon,authenticated,service_role;
create trigger paddle_initial_period_history before update or delete on public.billing_paddle_initial_period_bootstraps
 for each row execute function public.billing_v2_protect_history('');
create trigger paddle_initial_period_no_truncate before truncate on public.billing_paddle_initial_period_bootstraps
 for each statement execute function public.billing_v2_protect_history();

-- Keep paddle-initial-purchase-v1 byte/semantic equality unchanged. The exact
-- consumed payment selects the period source, never a newest-event heuristic.
create function public.billing_paddle_initial_period_facts_v1(p_subscription uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype; a public.account_subscriptions%rowtype;
 p public.billing_payment_applications_v2%rowtype; e public.billing_evidence_v2%rowtype;
 facts jsonb; o jsonb; start_at timestamptz; end_at timestamptz; settled_at timestamptz;
begin
 perform public.billing_guard_actor();
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 perform public.billing_guard_lock(s.billing_account_id,'test');
 select * into s from public.billing_subscriptions_v2 where id=p_subscription for update;
 if s.id is null or (s.provider,s.environment,s.shadow_status,s.reconciliation_status,s.provider_status)
 is distinct from ('paddle'::text,'test'::text,'current'::text,'processed'::text,'active'::text)
 or s.account_subscription_id is null or s.approved_additional_coach_seats<>0 or s.scheduled_cancel_at is not null
 then raise exception 'PADDLE_INITIAL_PERIOD_INELIGIBLE'; end if;
 select * into a from public.account_subscriptions where id=s.account_subscription_id for update;
 if a.id is null or a.billing_account_id is distinct from s.billing_account_id
 or (a.subscription_kind,a.status,a.source) is distinct from ('paid'::text,'active'::text,'billing_provider'::text)
 or a.cancel_at_period_end or a.canceled_at is not null or a.expired_at is not null or a.restricted_at is not null
 or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=a.id
 and billing_account_id=s.billing_account_id and storage_contract='billing.v2')
 or exists(select 1 from public.account_subscriptions where billing_account_id=s.billing_account_id and id<>a.id
 and status in ('trialing','trial_recovery','active','past_due','grace','restricted'))
 or exists(select 1 from public.billing_provider_subscriptions where billing_account_id=s.billing_account_id and provider_status not in ('expired','cancelled'))
 or exists(select 1 from public.billing_operations_v2 where billing_account_id=s.billing_account_id and status not in ('completed','canceled','failed'))
 or exists(select 1 from public.billing_evidence_v2 where subscription_id=s.id and proof_schema<>'paddle-initial-purchase-v1')
 then raise exception 'PADDLE_INITIAL_PERIOD_INELIGIBLE'; end if;
 if (select count(*) from public.billing_payment_applications_v2 where subscription_id=s.id)<>1 then
 raise exception 'PADDLE_INITIAL_PERIOD_PAYMENT'; end if;
 select * into p from public.billing_payment_applications_v2 where subscription_id=s.id and application_kind='initial_purchase';
 select * into e from public.billing_evidence_v2 where id=p.evidence_id;
 facts:=public.billing_paddle_initial_proof_v1(s.id);
 if p.id is null or (p.provider,p.environment,p.billing_account_id,p.checkout_id,p.provider_transaction_ref)
 is distinct from ('paddle'::text,'test'::text,s.billing_account_id,(facts->>'checkoutId')::uuid,e.provider_transaction_ref)
 or e.proof_schema is distinct from 'paddle-initial-purchase-v1' or e.proof_kind is distinct from 'transaction'
 or e.subscription_id is distinct from s.id or e.event_id is distinct from (facts->>'transactionEventId')::uuid
 or e.proof->'observation' is distinct from facts or a.plan_version_id is distinct from (facts->>'planVersionId')::uuid
 or not exists(select 1 from public.billing_evidence_v2 se where se.id=s.latest_evidence_id and se.subscription_id=s.id
 and se.proof_schema='paddle-initial-purchase-v1' and se.proof_kind='subscription' and se.proof->'observation'=facts
 and se.normalized_sha256=s.latest_snapshot_sha256)
 or (select count(*) from public.billing_subscription_items_v2 where subscription_id=s.id)<>1
 or not exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id and item_role='base_plan'
 and quantity=1 and cadence='monthly' and mapping_id=(facts->>'mappingId')::uuid and evidence_id=s.latest_evidence_id)
 or not exists(select 1 from public.billing_checkouts_v2 where id=p.checkout_id and billing_account_id=s.billing_account_id
 and status='completed' and completed_subscription_id=s.id and provider_transaction_ref=p.provider_transaction_ref)
 then raise exception 'PADDLE_INITIAL_PERIOD_PAYMENT'; end if;
 -- Known stale observations remain audit history, not superseding authority.
 -- Linked ingress retains old updates as correlated: exclude those only when
 -- both authenticated clocks are strictly behind the stored provider revision.
 -- Pending/manual-review, equal-time, missing-clock and newer state still veto.
 if exists(select 1 from public.billing_paddle_event_observations po where po.observation->>'subscriptionRef'=s.provider_subscription_ref
 and po.observation->>'kind'='subscription.updated'
 and po.disposition<>'stale'
 and not case when po.disposition='correlated'
 and jsonb_typeof(po.observation->'updatedAt')='string'
 and jsonb_typeof(po.observation->'occurredAt')='string'
 then coalesce(public.billing_paddle_timestamp_v1(po.observation->'updatedAt')<s.provider_updated_at
 and public.billing_paddle_timestamp_v1(po.observation->'occurredAt')<s.provider_updated_at,false)
 else false end) then
 raise exception 'PADDLE_INITIAL_PERIOD_SUPERSEDED'; end if;
 select observation into o from public.billing_paddle_event_observations where event_id=e.event_id;
 -- Revalidate delivery/observation provenance, including the immutable digest.
 perform public.billing_paddle_reconciliation_event_v1(e.event_id);
 if o->'billingPeriod' is null or o->'billingPeriod'='null'::jsonb then return null; end if;
 perform public.billing_paddle_lifecycle_shape_v1(o);
 start_at:=public.billing_paddle_timestamp_v1(o#>'{billingPeriod,startsAt}');
 end_at:=public.billing_paddle_timestamp_v1(o#>'{billingPeriod,endsAt}');
 select occurred_at into settled_at from public.billing_webhook_events_v2 where id=e.event_id;
 if settled_at is null or start_at>settled_at or end_at<=settled_at
 or end_at<>(start_at at time zone 'UTC'+interval '1 month') at time zone 'UTC'
 then raise exception 'PADDLE_INITIAL_PERIOD_BOUNDS'; end if;
 return jsonb_build_object('schema','paddle-initial-period-v1','subscriptionId',s.id,'canonicalId',a.id,
 'paymentApplicationId',p.id,'initialEvidenceId',e.id,'initialFacts',facts,
 'periodStart',to_char(start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'periodEnd',to_char(end_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end $$;

create function public.billing_paddle_initial_period_record_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare facts jsonb;
begin
 facts:=public.billing_paddle_initial_period_facts_v1(new.subscription_id);
 if facts is null or new.proof is distinct from facts
 or new.account_subscription_id is distinct from (facts->>'canonicalId')::uuid
 or new.payment_application_id is distinct from (facts->>'paymentApplicationId')::uuid
 or not exists(select 1 from public.billing_subscriptions_v2 s join public.account_subscriptions a on a.id=s.account_subscription_id
 where s.id=new.subscription_id and s.current_period_started_at is null and s.current_period_ends_at is null
 and a.current_period_started_at is null and a.current_period_ends_at is null)
 then raise exception 'PADDLE_INITIAL_PERIOD_PROOF'; end if;
 return new;
end $$;
create trigger paddle_initial_period_record_guard before insert on public.billing_paddle_initial_period_bootstraps
 for each row execute function public.billing_paddle_initial_period_record_guard_v1();

-- Validate the final pair at transaction end: lifecycle/plan/seat writers keep
-- their existing proof guards; initial evidence alone never authorizes dates.
create function public.billing_paddle_initial_period_pair_guard_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype; a public.account_subscriptions%rowtype; proof jsonb;
begin
 if tg_table_name='account_subscriptions' then
 select * into s from public.billing_subscriptions_v2 where account_subscription_id=new.id;
 elsif tg_table_name='billing_paddle_initial_period_bootstraps' then
 select * into s from public.billing_subscriptions_v2 where id=new.subscription_id;
 else select * into s from public.billing_subscriptions_v2 where id=new.id; end if;
 if s.account_subscription_id is null or not exists(select 1 from public.billing_evidence_v2
 where id=s.latest_evidence_id and proof_schema='paddle-initial-purchase-v1') then return null; end if;
 select * into a from public.account_subscriptions where id=s.account_subscription_id;
 select b.proof into proof from public.billing_paddle_initial_period_bootstraps b where b.subscription_id=s.id;
 if proof is null and s.current_period_started_at is null and s.current_period_ends_at is null
 and a.current_period_started_at is null and a.current_period_ends_at is null then return null; end if;
 if proof is null or a.id is distinct from (proof->>'canonicalId')::uuid
 or s.current_period_started_at is distinct from (proof->>'periodStart')::timestamptz
 or s.current_period_ends_at is distinct from (proof->>'periodEnd')::timestamptz
 or a.current_period_started_at is distinct from s.current_period_started_at
 or a.current_period_ends_at is distinct from s.current_period_ends_at
 then raise exception 'PADDLE_INITIAL_PERIOD_PROOF'; end if;
 return null;
end $$;
create constraint trigger paddle_initial_period_canonical_pair after update on public.account_subscriptions
 deferrable initially deferred for each row execute function public.billing_paddle_initial_period_pair_guard_v1();
create constraint trigger paddle_initial_period_shadow_pair after insert or update on public.billing_subscriptions_v2
 deferrable initially deferred for each row execute function public.billing_paddle_initial_period_pair_guard_v1();
create constraint trigger paddle_initial_period_record_pair after insert on public.billing_paddle_initial_period_bootstraps
 deferrable initially deferred for each row execute function public.billing_paddle_initial_period_pair_guard_v1();

create function public.bootstrap_paddle_initial_period_v1(p_subscription uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare facts jsonb; previous jsonb; s public.billing_subscriptions_v2%rowtype; a public.account_subscriptions%rowtype;
begin
 facts:=public.billing_paddle_initial_period_facts_v1(p_subscription);
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 select * into a from public.account_subscriptions where id=s.account_subscription_id;
 select proof into previous from public.billing_paddle_initial_period_bootstraps where subscription_id=s.id;
 if previous is not null then
 if previous is distinct from facts or a.current_period_started_at is distinct from (facts->>'periodStart')::timestamptz
 or a.current_period_ends_at is distinct from (facts->>'periodEnd')::timestamptz
 or s.current_period_started_at is distinct from a.current_period_started_at
 or s.current_period_ends_at is distinct from a.current_period_ends_at then raise exception 'PADDLE_INITIAL_PERIOD_RETRY_MISMATCH'; end if;
 return jsonb_build_object('status','reused');
 end if;
 if a.current_period_started_at is not null or a.current_period_ends_at is not null
 or s.current_period_started_at is not null or s.current_period_ends_at is not null then raise exception 'PADDLE_INITIAL_PERIOD_EXISTING_BOUNDS'; end if;
 if facts is null then return jsonb_build_object('status','not_available'); end if;
 insert into public.billing_paddle_initial_period_bootstraps(subscription_id,account_subscription_id,payment_application_id,proof)
 values(s.id,a.id,(facts->>'paymentApplicationId')::uuid,facts);
 update public.account_subscriptions set current_period_started_at=(facts->>'periodStart')::timestamptz,
 current_period_ends_at=(facts->>'periodEnd')::timestamptz where id=a.id;
 update public.billing_subscriptions_v2 set current_period_started_at=(facts->>'periodStart')::timestamptz,
 current_period_ends_at=(facts->>'periodEnd')::timestamptz where id=s.id;
 return jsonb_build_object('status','applied');
end $$;

-- The existing service entrypoint owns admission/payment/trial conversion. Add
-- only a separate proof step after a new activation's completed checkout.
-- Historical processed retries keep their old semantics; recovery uses the
-- explicit bootstrap RPC and cannot be triggered by an unrelated replay.
do $$
declare body text; needle text;
begin
 body:=pg_get_functiondef('public.reconcile_paddle_initial_purchase_v1(uuid,text)'::regprocedure);
 needle:='return jsonb_build_object(''success'',true,''reused'',false);';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'PADDLE_INITIAL_PERIOD_MIGRATION_SHAPE'; end if;
 body:=replace(body,needle,'perform public.bootstrap_paddle_initial_period_v1(s.id);'||chr(10)||' '||needle);
 execute body;
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('billing_paddle_initial_period_facts_v1','billing_paddle_initial_period_record_guard_v1','billing_paddle_initial_period_pair_guard_v1','bootstrap_paddle_initial_period_v1') loop
 execute format('alter function %s owner to postgres',f.signature);
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.bootstrap_paddle_initial_period_v1(uuid) to service_role;
commit;
