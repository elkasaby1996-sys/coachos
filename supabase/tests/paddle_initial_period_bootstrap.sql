begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql
\ir fixtures/paddle_webhook_fixture.psql
\ir fixtures/paddle_auto_reconciliation_fixture.psql
\ir fixtures/paddle_lifecycle_fixture.psql
\ir fixtures/paddle_plan_change_fixture.psql
\ir fixtures/paddle_seat_fixture.psql
\ir fixtures/paddle_initial_period_fixture.psql
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
create temp table cases(label text primary key,u uuid,before_state jsonb);
insert into cases values ('automatic',pg_temp.period_owner(),null),('trial',pg_temp.period_owner('trialing'),null),
 ('recovery',pg_temp.period_owner('trial_recovery'),null),('historical',pg_temp.period_owner(null,true),null),
 ('missing',pg_temp.period_owner(null,false,null),null);
update cases set before_state=pg_temp.period_snapshot(u);
select is((select count(*) from billing_paddle_initial_period_bootstraps),3::bigint,'automatic and both trial states bootstrap');
select ok((select bool_and(s.current_period_started_at=a.current_period_started_at and s.current_period_ends_at=a.current_period_ends_at
 and s.current_period_started_at='2026-09-20T00:00:00Z' and s.current_period_ends_at='2026-10-20T00:00:00Z')
 from cases c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u)
 join account_subscriptions a on a.id=s.account_subscription_id where c.label in ('automatic','trial','recovery')),'same explicit period on both rows');
select is((select count(*) from account_subscriptions where subscription_kind='trial' and status='canceled'),2::bigint,'trial history retained');
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status','applied','historical paid NULL period bootstraps') from cases where label='historical';
select is(pg_temp.period_snapshot(u)->'payment',before_state->'payment','initial payment unchanged') from cases;
select is(pg_temp.period_snapshot(u)->'evidence',before_state->'evidence','initial evidence unchanged') from cases;
select is(pg_temp.period_snapshot(u)->'checkout',before_state->'checkout','checkout unchanged') from cases;
select is(pg_temp.period_snapshot(u)->'operations',before_state->'operations','no operation') from cases;
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status','not_available','missing period stays unavailable') from cases where label='missing';
select is(pg_temp.period_snapshot(u),before_state,'missing provider dates not invented') from cases where label='missing';
update cases set before_state=pg_temp.period_snapshot(u);
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status','reused','exact retry') from cases where label<>'missing';
select is(pg_temp.period_snapshot(u),before_state,'retry rewrites no row or timestamp') from cases;
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'reused','initial proof equality remains compatible') from cases;
set local time zone 'America/New_York';
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status','reused','retry independent of session time zone') from cases where label='historical';
set local time zone 'UTC';
select is(pg_temp.period_snapshot(u),before_state,'timezone retry leaves all rows unchanged') from cases where label='historical';
select is(paddle_seat_quantity_context_v1(u,1)->>'additionalSeats','0','seat context eligible after bootstrap') from cases where label='historical';
select lives_ok(format('select paddle_plan_change_context_v1(%L)',u),'plan context eligible after bootstrap') from cases where label='historical';
savepoint open_plan;
select pg_temp.plan_begin(u,'launch') from cases where label='historical';
select throws_ok(format('select bootstrap_paddle_initial_period_v1(%L)',pg_temp.period_subscription(u)),
 'P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','open plan operation blocks bootstrap') from cases where label='historical';
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'reused','initial replay with open plan keeps historical semantics') from cases where label='historical';
rollback to open_plan;
savepoint open_seat;
select pg_temp.paddle_seat_begin(u,1) from cases where label='historical';
select throws_ok(format('select bootstrap_paddle_initial_period_v1(%L)',pg_temp.period_subscription(u)),
 'P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','open seat operation blocks bootstrap') from cases where label='historical';
rollback to open_seat;
create temp table before_invalid as select count(*) n from billing_payment_applications_v2;
select throws_ok($q$select pg_temp.period_owner(null,false,'{"startsAt":"2026-09-21T00:00:00Z","endsAt":"2026-10-21T00:00:00Z"}')$q$,
 'P0001','PADDLE_INITIAL_PERIOD_BOUNDS','invalid explicit period rolls back new activation');
select is((select count(*) from billing_payment_applications_v2),(select n from before_invalid),'invalid activation has no payment authority');
select ok(not has_table_privilege('service_role','billing_paddle_initial_period_bootstraps','insert'),'no service proof DML');
select ok(not has_function_privilege('service_role','billing_paddle_initial_period_facts_v1(uuid)','execute'),'facts helper private');
select ok(has_function_privilege('service_role','bootstrap_paddle_initial_period_v1(uuid)','execute'),'service UUID boundary');
set local role authenticated;
select throws_ok('select bootstrap_paddle_initial_period_v1(gen_random_uuid())','42501',null,'browser RPC denied');
reset role;
set local role anon;
select throws_ok('select bootstrap_paddle_initial_period_v1(gen_random_uuid())','42501',null,'anon RPC denied');
reset role;
set local role service_role;
select throws_ok('update billing_subscriptions_v2 set current_period_started_at=now()','42501',null,'direct shadow DML denied');
select throws_ok('update account_subscriptions set current_period_started_at=now()','42501',null,'direct canonical DML denied');
reset role;
select throws_ok('delete from billing_paddle_initial_period_bootstraps','P0001','BILLING_V2_HISTORY_IMMUTABLE','bootstrap proof immutable');
set constraints all immediate;
select throws_ok('truncate billing_paddle_initial_period_bootstraps','P0001','BILLING_V2_HISTORY_IMMUTABLE','bootstrap proof cannot truncate');
set constraints all deferred;

-- Fault injection is limited to synthetic local rows and restored per savepoint.
insert into cases values('negative',pg_temp.period_owner(null,true),null);
create function pg_temp.period_attempt() returns void language plpgsql as $$ begin
 perform bootstrap_paddle_initial_period_v1(pg_temp.period_subscription((select u from cases where label='negative')));
end $$;
create function pg_temp.period_tamper(statement text) returns void language plpgsql as $$ begin
 set local session_replication_role=replica;
 execute statement;
 set local session_replication_role=origin;
end $$;

savepoint fault;
select pg_temp.period_tamper($fault$update account_subscriptions set current_period_started_at='2026-09-20' where id=(select account_subscription_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='negative'))$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_EXISTING_BOUNDS','canonical mixed NULL rejected');
select is(pg_temp.period_snapshot(u),before_state,'canonical mixed NULL no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_subscriptions_v2 set current_period_ends_at='2026-10-20' where id=(select pg_temp.period_subscription(u) from cases where label='negative')$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_EXISTING_BOUNDS','shadow mixed NULL rejected');
select is(pg_temp.period_snapshot(u),before_state,'shadow mixed NULL no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update account_subscriptions set current_period_started_at='2026-09-20',current_period_ends_at='2026-10-20' where id=(select account_subscription_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='negative')); update billing_subscriptions_v2 set current_period_started_at='2026-09-20',current_period_ends_at='2026-10-20' where id=(select pg_temp.period_subscription(u) from cases where label='negative')$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_EXISTING_BOUNDS','unproven matching pair rejected');
select is(pg_temp.period_snapshot(u),before_state,'unproven matching pair no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_payment_applications_v2 set application_kind='initial' where subscription_id=(select pg_temp.period_subscription(u) from cases where label='negative')$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_PAYMENT','wrong payment rejected');
select is(pg_temp.period_snapshot(u),before_state,'wrong payment no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_payment_applications_v2 set checkout_id=gen_random_uuid() where subscription_id=(select pg_temp.period_subscription(u) from cases where label='negative')$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_PAYMENT','wrong checkout rejected');
select is(pg_temp.period_snapshot(u),before_state,'wrong checkout no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_payment_applications_v2 set billing_account_id=gen_random_uuid() where subscription_id=(select pg_temp.period_subscription(u) from cases where label='negative')$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_PAYMENT','wrong payment account rejected');
select is(pg_temp.period_snapshot(u),before_state,'wrong payment account no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$delete from billing_paddle_event_deliveries where event_id=(select event_id from billing_evidence_v2 where subscription_id=(select pg_temp.period_subscription(u) from cases where label='negative') and proof_kind='transaction')$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_RECONCILIATION_VERIFIED_EVENT_REQUIRED','missing delivery rejected');
select is(pg_temp.period_snapshot(u),before_state,'missing delivery no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$delete from billing_verified_evidence_v2 where id in (select verified_evidence_id from billing_paddle_event_deliveries where event_id=(select event_id from billing_evidence_v2 where subscription_id=(select pg_temp.period_subscription(u) from cases where label='negative') and proof_kind='transaction'))$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_RECONCILIATION_VERIFIED_EVENT_REQUIRED','missing verification rejected');
select is(pg_temp.period_snapshot(u),before_state,'missing verification no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_subscriptions_v2 set provider_subscription_ref='synthetic/wrong-subscription' where id=(select pg_temp.period_subscription(u) from cases where label='negative')$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001',null,'wrong provider subscription rejected');
select is(pg_temp.period_snapshot(u),before_state,'wrong provider subscription no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_customers_v2 set provider_customer_ref='synthetic/wrong-customer' where id=(select customer_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='negative'))$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001',null,'wrong provider customer rejected');
select is(pg_temp.period_snapshot(u),before_state,'wrong provider customer no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update account_subscriptions set subscription_kind='custom' where id=(select account_subscription_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='negative'))$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','custom authority rejected');
select is(pg_temp.period_snapshot(u),before_state,'custom authority no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update account_subscriptions set subscription_kind='complimentary' where id=(select account_subscription_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='negative'))$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','complimentary authority rejected');
select is(pg_temp.period_snapshot(u),before_state,'complimentary authority no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update account_subscriptions set source='manual' where id=(select account_subscription_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='negative'))$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','unrelated paid source rejected');
select is(pg_temp.period_snapshot(u),before_state,'unrelated paid source no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_canonical_origins set storage_contract='lemonsqueezy.v1' where account_subscription_id=(select account_subscription_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='negative'))$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','wrong canonical origin rejected');
select is(pg_temp.period_snapshot(u),before_state,'wrong canonical origin no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_evidence_v2 set proof_schema='paddle-subscription-lifecycle-v1',validator_version='paddle-lifecycle-v1',proof=jsonb_set(proof,'{schema}','"paddle-subscription-lifecycle-v1"'),normalized_sha256=encode(extensions.digest((jsonb_set(proof,'{schema}','"paddle-subscription-lifecycle-v1"'))::text,'sha256'),'hex') where subscription_id=(select pg_temp.period_subscription(u) from cases where label='negative') and proof_kind='transaction'$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','later lifecycle proof rejected');
select is(pg_temp.period_snapshot(u),before_state,'later lifecycle proof no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_evidence_v2 set proof_schema='paddle-plan-change-v1',validator_version='paddle-plan-v1',proof=jsonb_set(proof,'{schema}','"paddle-plan-change-v1"'),normalized_sha256=encode(extensions.digest((jsonb_set(proof,'{schema}','"paddle-plan-change-v1"'))::text,'sha256'),'hex') where subscription_id=(select pg_temp.period_subscription(u) from cases where label='negative') and proof_kind='transaction'$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','later plan proof rejected');
select is(pg_temp.period_snapshot(u),before_state,'later plan proof no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_evidence_v2 set proof_schema='paddle-seat-quantity-v1',validator_version='paddle-seat-v1',proof=jsonb_set(proof,'{schema}','"paddle-seat-quantity-v1"'),normalized_sha256=encode(extensions.digest((jsonb_set(proof,'{schema}','"paddle-seat-quantity-v1"'))::text,'sha256'),'hex') where subscription_id=(select pg_temp.period_subscription(u) from cases where label='negative') and proof_kind='transaction'$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','later seat proof rejected');
select is(pg_temp.period_snapshot(u),before_state,'later seat proof no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_runtime_policy set paddle_reconciliation_enabled=false$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_RECONCILIATION_DISABLED','policy disabled rejected');
select is(pg_temp.period_snapshot(u),before_state,'policy disabled no writes') from cases where label='negative';
rollback to fault;
savepoint fault;
select pg_temp.period_tamper($fault$update billing_subscriptions_v2 set environment='live' where id=(select pg_temp.period_subscription(u) from cases where label='negative')$fault$);
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','live environment rejected');
select is(pg_temp.period_snapshot(u),before_state,'live environment no writes') from cases where label='negative';
rollback to fault;
savepoint wrong_retry;
select pg_temp.period_tamper($fault$update account_subscriptions set current_period_ends_at=current_period_ends_at+interval '1 day' where id=(select account_subscription_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='historical'))$fault$);
select throws_ok($q$select bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u)) from cases where label='historical'$q$,'P0001','PADDLE_INITIAL_PERIOD_RETRY_MISMATCH','mismatching bootstrapped retry rejected');
rollback to wrong_retry;

savepoint newer_observation;
select pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'pending-newer','subscription.updated','active','2026-09-21T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')) from cases where label='negative';
select throws_ok('select pg_temp.period_attempt()','P0001','PADDLE_INITIAL_PERIOD_SUPERSEDED','retained pending lifecycle observation blocks bootstrap');
rollback to newer_observation;

insert into cases values
('late-start',pg_temp.period_owner(null,true,'{"startsAt":"2026-09-21T00:00:00Z","endsAt":"2026-10-21T00:00:00Z"}'),null),
('early-end',pg_temp.period_owner(null,true,'{"startsAt":"2026-08-20T00:00:00Z","endsAt":"2026-09-20T00:00:00Z"}'),null),
('duration',pg_temp.period_owner(null,true,'{"startsAt":"2026-09-20T00:00:00Z","endsAt":"2026-10-21T00:00:00Z"}'),null);
update cases set before_state=pg_temp.period_snapshot(u) where label in ('late-start','early-end','duration');
select throws_ok(format('select bootstrap_paddle_initial_period_v1(%L)',pg_temp.period_subscription(u)),'P0001','PADDLE_INITIAL_PERIOD_BOUNDS',label||' rejected') from cases where label in ('late-start','early-end','duration');
select is(pg_temp.period_snapshot(u),before_state,label||' no writes') from cases where label in ('late-start','early-end','duration');

-- Deferred pair guard blocks unproven admin DML too, not just role ACLs.
create function pg_temp.unproven_period() returns void language plpgsql as $$ begin
 update account_subscriptions set current_period_started_at='2026-09-20',current_period_ends_at='2026-10-20'
 where id=(select account_subscription_id from billing_subscriptions_v2 where id=(select pg_temp.period_subscription(u) from cases where label='negative'));
 update billing_subscriptions_v2 set current_period_started_at='2026-09-20',current_period_ends_at='2026-10-20' where id=(select pg_temp.period_subscription(u) from cases where label='negative');
 set constraints paddle_initial_period_canonical_pair,paddle_initial_period_shadow_pair immediate;
end $$;
select throws_ok('select pg_temp.unproven_period()','P0001','PADDLE_INITIAL_PERIOD_PROOF','matching direct period DML without proof rejected');

-- Errors at each write boundary roll back proof, both periods and audit rows.
create function pg_temp.period_failure() returns trigger language plpgsql as $$ begin raise exception 'SYNTHETIC_PERIOD_FAILURE'; end $$;
savepoint atomic;
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
create trigger zz_period_failure after insert on billing_paddle_initial_period_bootstraps for each row execute function pg_temp.period_failure();
select throws_ok('select pg_temp.period_attempt()','P0001','SYNTHETIC_PERIOD_FAILURE','billing_paddle_initial_period_bootstraps failure rolls back');
select is(pg_temp.period_snapshot(u),before_state,'billing_paddle_initial_period_bootstraps atomic snapshot') from cases where label='negative';
rollback to atomic;
savepoint atomic;
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
create trigger zz_period_failure after update on account_subscriptions for each row execute function pg_temp.period_failure();
select throws_ok('select pg_temp.period_attempt()','P0001','SYNTHETIC_PERIOD_FAILURE','account_subscriptions failure rolls back');
select is(pg_temp.period_snapshot(u),before_state,'account_subscriptions atomic snapshot') from cases where label='negative';
rollback to atomic;
savepoint atomic;
update cases set before_state=pg_temp.period_snapshot(u) where label='negative';
create trigger zz_period_failure after update on billing_subscriptions_v2 for each row execute function pg_temp.period_failure();
select throws_ok('select pg_temp.period_attempt()','P0001','SYNTHETIC_PERIOD_FAILURE','billing_subscriptions_v2 failure rolls back');
select is(pg_temp.period_snapshot(u),before_state,'billing_subscriptions_v2 atomic snapshot') from cases where label='negative';
rollback to atomic;

create temp table service_target as select pg_temp.period_subscription(u) id from cases where label='negative';
grant select on service_target to service_role;
set local role service_role;
select is((select bootstrap_paddle_initial_period_v1(id)->>'status' from service_target),'applied','service bootstraps through trusted boundary');
set constraints all immediate;
select is((select bootstrap_paddle_initial_period_v1(id)->>'status' from service_target),'reused','service retry with immediate constraints');
reset role;
select ok((select not paddle_sales_enabled from billing_runtime_policy),'sales stays disabled');

-- CODEX-44: retained audit history must not become either a veto or authority.
set constraints all deferred;
create temp table stale_cases(label text primary key,u uuid,event_id uuid,before_state jsonb,retained jsonb);
insert into stale_cases(label,u) values
 ('historical',pg_temp.period_pending_owner()),('missing',pg_temp.period_pending_owner(null)),
 ('automatic',pg_temp.period_pending_owner()),('linked-old',pg_temp.period_owner(null,true));
update stale_cases c set event_id=pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(c.u,'old-canceled','subscription.updated','canceled',
 '2026-09-20T09:59:59Z','2026-08-20T00:00:00Z','2026-09-20T00:00:00Z'));
update stale_cases c set retained=to_jsonb(o) from billing_paddle_event_observations o where o.event_id=c.event_id;
select is(retained->>'disposition',case when label='linked-old' then 'correlated' else 'stale' end,label||' trusted ingress classification') from stale_cases;
select ok((retained#>>'{observation,updatedAt}')::timestamptz<s.provider_updated_at,c.label||' observed revision strictly older')
 from stale_cases c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u);
select is(pg_temp.period_historical_activate(u),'applied','historical fixture preserves pre-bootstrap activation') from stale_cases where label='historical';
update stale_cases set before_state=pg_temp.period_snapshot(u) where label in ('historical','linked-old');
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status','applied',label||' old update permits historical bootstrap')
 from stale_cases where label in ('historical','linked-old');
select is(pg_temp.auto_dispatch(u,'subscription.created'),'applied',label||' stale update permits initial activation') from stale_cases where label in ('missing','automatic');
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status','not_available','absent optional period remains not_available') from stale_cases where label='missing';
select ok(s.current_period_started_at is null and s.current_period_ends_at is null and a.current_period_started_at is null and a.current_period_ends_at is null,
 'stale lifecycle dates cannot fill missing initial dates') from stale_cases c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u)
 join account_subscriptions a on a.id=s.account_subscription_id where c.label='missing';
select ok(s.current_period_started_at='2026-09-20T00:00:00Z' and s.current_period_ends_at='2026-10-20T00:00:00Z'
 and a.current_period_started_at=s.current_period_started_at and a.current_period_ends_at=s.current_period_ends_at,
 c.label||' dates come only from initial transaction') from stale_cases c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u)
 join account_subscriptions a on a.id=s.account_subscription_id where c.label<>'missing';
select ok(s.provider_updated_at='2026-09-20T10:00:00Z' and s.provider_status='active' and a.status='active' and a.canceled_at is null,
 c.label||' stale cancellation cannot change status or provider clock') from stale_cases c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u)
 join account_subscriptions a on a.id=s.account_subscription_id;
select is(pg_temp.period_snapshot(u)->'payment',before_state->'payment',label||' bootstrap adds no payment authority') from stale_cases where before_state is not null;
select is(pg_temp.period_snapshot(u)->'evidence',before_state->'evidence',label||' bootstrap adds no lifecycle evidence') from stale_cases where before_state is not null;
select ok((select count(*)=1 and bool_and(application_kind='initial_purchase') from billing_payment_applications_v2 where subscription_id=pg_temp.period_subscription(c.u))
 and (select count(*)=2 and bool_and(proof_schema='paddle-initial-purchase-v1') from billing_evidence_v2 where subscription_id=pg_temp.period_subscription(c.u)),
 c.label||' only initial payment and evidence exist') from stale_cases c;
select is(to_jsonb(o),c.retained,c.label||' old observation retained unchanged') from stale_cases c join billing_paddle_event_observations o on o.event_id=c.event_id;

-- Each non-stale row is considered independently of the stale rows in the set.
create temp table blocked_cases(label text primary key,u uuid,event_id uuid,before_state jsonb);
insert into blocked_cases(label,u) values ('newer',pg_temp.period_owner(null,true)),('manual',pg_temp.period_owner(null,true)),
 ('pending',pg_temp.period_owner(null,true)),('equal',pg_temp.period_owner(null,true)),
 ('new-event-old-update',pg_temp.period_owner(null,true)),('old-event-new-update',pg_temp.period_owner(null,true)),
 ('mixed',(select u from stale_cases where label='historical'));
update blocked_cases c set event_id=pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(c.u,'blocker','subscription.updated','active',
 case when label in ('manual','pending','old-event-new-update') then '2026-09-20T09:59:59Z'
 when label='equal' then '2026-09-20T10:00:00Z' else '2026-09-21T10:00:00Z' end)
 ||case when label='manual' then '{"items":[{"priceRef":"synthetic/unknown","productRef":"synthetic/unknown","quantity":1,"unitPrice":{"amount":"5900","currency":"USD"},"status":"active"}]}'::jsonb
 when label='new-event-old-update' then '{"updatedAt":"2026-09-20T09:59:59Z"}'::jsonb
 when label='old-event-new-update' then '{"updatedAt":"2026-09-21T10:00:00Z"}'::jsonb else '{}'::jsonb end);
-- A pending observation can predate identity linkage; model that retained state
-- on a paid historical fixture without changing ingestion or any proof authority.
select pg_temp.period_tamper($q$update billing_paddle_event_observations set disposition='pending' where event_id=(select event_id from blocked_cases where label='pending')$q$);
update blocked_cases set before_state=pg_temp.period_snapshot(u);
select is(o.disposition,case c.label when 'manual' then 'manual_review' when 'pending' then 'pending' else 'correlated' end,c.label||' blocker disposition')
 from blocked_cases c join billing_paddle_event_observations o on o.event_id=c.event_id;
select throws_ok(format('select bootstrap_paddle_initial_period_v1(%L)',pg_temp.period_subscription(u)),'P0001',
 case when label in ('pending','manual') then 'PADDLE_RECONCILIATION_MANUAL_REVIEW' else 'PADDLE_INITIAL_PERIOD_SUPERSEDED' end,
 label||' relevant state still blocks') from blocked_cases;
select is(pg_temp.period_snapshot(u),before_state,label||' blocker makes no writes') from blocked_cases;
select is((select count(*) from billing_paddle_event_observations o where o.observation->>'subscriptionRef'='synthetic/sub/'||c.u and o.disposition='stale'),1::bigint,
 'mixed set includes retained stale row') from blocked_cases c where label='mixed';

-- Real ingress equal-time contradiction before linkage remains manual review.
create temp table equal_case as select pg_temp.period_pending_owner() u;
create temp table equal_event as select pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'equal-contradiction','subscription.updated','canceled',
 '2026-09-20T10:00:00Z')) event_id from equal_case;
select is(o.disposition,'manual_review','equal-time contradictory ingress stays manual_review') from equal_event e join billing_paddle_event_observations o using(event_id);
select throws_ok(format('select bootstrap_paddle_initial_period_v1(%L)',pg_temp.period_subscription(u)),'P0001','PADDLE_INITIAL_PERIOD_INELIGIBLE','unlinked ambiguous state cannot bootstrap') from equal_case;
select throws_ok(format('select billing_paddle_initial_proof_v1(%L)',pg_temp.period_subscription(u)),'P0001','PADDLE_RECONCILIATION_MANUAL_REVIEW','equal-time ambiguity cannot gain initial authority') from equal_case;
select is((select count(*) from billing_payment_applications_v2 where subscription_id=pg_temp.period_subscription(u)),0::bigint,'equal-time ambiguity grants no payment') from equal_case;

-- CODEX-47: timestamp completeness belongs to the harmless-row exception.
-- All observations below use authenticated fixture ingress, including stale.
create temp table clock_cases(label text primary key,u uuid,event_id uuid,before_state jsonb);
insert into clock_cases(label,u) values
 ('missing-updated-canceled',pg_temp.period_owner(null,true)),
 ('missing-updated-active',pg_temp.period_owner(null,true)),
 ('missing-updated-old',pg_temp.period_owner(null,true)),
 ('old-update-equal-event',pg_temp.period_owner(null,true)),
 ('old-event-equal-update',pg_temp.period_owner(null,true)),
 ('offset-equal',pg_temp.period_owner(null,true)),
 ('precision-equal',pg_temp.period_owner(null,true)),
 ('mixed-stale-incomplete',pg_temp.period_pending_owner());
select pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'incomplete-stale','subscription.updated','canceled',
 '2026-09-20T09:59:59Z')-array['updatedAt','currentBillingPeriod','nextBilledAt','canceledAt','pausedAt','scheduledChange'])
 from clock_cases where label='mixed-stale-incomplete';
select is((select disposition from billing_paddle_event_observations where observation->>'subscriptionRef'='synthetic/sub/'||c.u
 and observation->>'kind'='subscription.updated'),'stale','incomplete old lifecycle observation legitimately classified stale')
 from clock_cases c where label='mixed-stale-incomplete';
select is(pg_temp.period_historical_activate(u),'applied','mixed fixture preserves historical initial purchase') from clock_cases where label='mixed-stale-incomplete';
update clock_cases c set event_id=pg_temp.lifecycle_ingest(
 (pg_temp.lifecycle_observation(c.u,'incomplete-or-equal','subscription.updated',
 case when label='missing-updated-canceled' then 'canceled' else 'active' end,'2026-09-21T10:00:00Z')
 ||case
 when label='missing-updated-old' then '{"occurredAt":"2026-09-20T09:59:59Z"}'::jsonb
 when label='old-update-equal-event' then '{"occurredAt":"2026-09-20T10:00:00Z","updatedAt":"2026-09-20T09:59:59Z"}'::jsonb
 when label='old-event-equal-update' then '{"occurredAt":"2026-09-20T09:59:59Z","updatedAt":"2026-09-20T10:00:00Z"}'::jsonb
 when label='offset-equal' then '{"occurredAt":"2026-09-20T13:00:00+03:00","updatedAt":"2026-09-20T06:00:00-04:00"}'::jsonb
 when label='precision-equal' then '{"occurredAt":"2026-09-20T10:00:00.000000Z","updatedAt":"2026-09-20T10:00:00.000000000Z"}'::jsonb
 else '{}'::jsonb end)
 -case when label like 'missing-updated-%' or label='mixed-stale-incomplete' then array['updatedAt'] else array[]::text[] end);
select is(o.disposition,'correlated',c.label||' authenticated non-stale classification') from clock_cases c join billing_paddle_event_observations o using(event_id);
-- Independently validate the retained delivery/projection digest before testing veto.
select lives_ok(format('select billing_paddle_reconciliation_event_v1(%L)',event_id),label||' retained provenance valid') from clock_cases;
update clock_cases set before_state=pg_temp.period_snapshot(u);
select throws_ok(format('select bootstrap_paddle_initial_period_v1(%L)',pg_temp.period_subscription(u)),
 'P0001','PADDLE_INITIAL_PERIOD_SUPERSEDED',label||' unsafe state vetoes recovery') from clock_cases;
select is(pg_temp.period_snapshot(u),before_state,label||' no period, payment, status, revision or audit writes') from clock_cases;

-- occurredAt is mandatory in the authenticated observation projection; omission
-- cannot reach retained history through trusted ingress. No fabricated stale row.
select throws_ok(format('select pg_temp.lifecycle_ingest(%L::jsonb)',
 pg_temp.lifecycle_observation(u,'missing-occurred')-'occurredAt'),'P0001','BILLING_PROOF_INVALID',
 'missing occurredAt rejected at authenticated ingress boundary') from clock_cases where label='missing-updated-active';
select is(pg_temp.period_snapshot(u),before_state,'missing occurredAt ingress rejection makes no billing writes') from clock_cases where label='missing-updated-active';
select is((select count(*) from billing_paddle_event_observations where observation->>'subscriptionRef'='synthetic/sub/'||c.u),
 3::bigint,'missing occurredAt observation not retained') from clock_cases c where label='missing-updated-active';

create temp table optional_stale(label text primary key,u uuid,event_id uuid,retained jsonb);
insert into optional_stale(label,u) values ('no-period',pg_temp.period_pending_owner(null)),('historical',pg_temp.period_pending_owner());
update optional_stale set event_id=pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'optional-stale','subscription.updated','canceled',
 '2026-09-20T09:59:59Z')-array['updatedAt','currentBillingPeriod','nextBilledAt','canceledAt','pausedAt','scheduledChange']);
update optional_stale c set retained=to_jsonb(o) from billing_paddle_event_observations o where o.event_id=c.event_id;
select is(retained->>'disposition','stale',label||' incomplete lifecycle facts classified stale by ingress') from optional_stale;
select is(pg_temp.period_historical_activate(u),'applied','optional stale historical activation') from optional_stale where label='historical';
-- Full-set positive: stale plus complete strictly old correlated is harmless.
select pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'old-correlated-with-stale','subscription.updated','canceled','2026-09-20T09:59:58Z'))
 from optional_stale where label='historical';
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status','applied','stale plus proven-old correlated permits historical recovery')
 from optional_stale where label='historical';
select is(pg_temp.auto_dispatch(u,'subscription.created'),'applied','new purchase with incomplete stale history activates') from optional_stale where label='no-period';
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status','not_available','stale optional facts grant no period authority') from optional_stale where label='no-period';
select ok(s.current_period_started_at is null and s.current_period_ends_at is null and a.current_period_started_at is null and a.current_period_ends_at is null,
 'missing initial billingPeriod leaves both period pairs NULL') from optional_stale c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u)
 join account_subscriptions a on a.id=s.account_subscription_id where c.label='no-period';
select ok(s.current_period_started_at='2026-09-20T00:00:00Z' and s.current_period_ends_at='2026-10-20T00:00:00Z'
 and a.current_period_started_at=s.current_period_started_at and a.current_period_ends_at=s.current_period_ends_at,
 'historical dates still come only from consumed initial transaction') from optional_stale c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u)
 join account_subscriptions a on a.id=s.account_subscription_id where c.label='historical';
select is(to_jsonb(o),c.retained,c.label||' incomplete stale observation remains immutable audit history') from optional_stale c join billing_paddle_event_observations o using(event_id);

create temp table incomplete_purchase(label text primary key,u uuid,event_id uuid,shadow_before jsonb,checkout_before jsonb,audit_before jsonb);
insert into incomplete_purchase(label,u) values ('explicit-period',pg_temp.period_pending_owner()),('no-period',pg_temp.period_pending_owner(null));
update incomplete_purchase set event_id=pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'new-incomplete','subscription.updated','active',
 '2026-09-20T10:00:00Z')-'updatedAt');
select is(o.disposition,'correlated',c.label||' new incomplete observation is correlated') from incomplete_purchase c join billing_paddle_event_observations o using(event_id);
update incomplete_purchase c set shadow_before=to_jsonb(s),checkout_before=(select to_jsonb(bc) from billing_checkouts_v2 bc where bc.billing_account_id=s.billing_account_id),
 audit_before=(select jsonb_agg(to_jsonb(ae) order by ae.id) from account_subscription_events ae where ae.billing_account_id=s.billing_account_id)
 from billing_subscriptions_v2 s where s.id=pg_temp.period_subscription(c.u);
select throws_ok(format('select pg_temp.auto_dispatch(%L,''subscription.created'')',u),'P0001','PADDLE_INITIAL_PERIOD_SUPERSEDED',
 label||' initial activation fails at bootstrap safety boundary') from incomplete_purchase;
select is(to_jsonb(s),c.shadow_before,c.label||' shadow state rolls back') from incomplete_purchase c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u);
select is(to_jsonb(bc),c.checkout_before,c.label||' checkout state rolls back') from incomplete_purchase c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u)
 join billing_checkouts_v2 bc on bc.billing_account_id=s.billing_account_id;
select ok(not exists(select 1 from billing_payment_applications_v2 where subscription_id=s.id)
 and not exists(select 1 from billing_evidence_v2 where subscription_id=s.id)
 and not exists(select 1 from billing_paddle_initial_period_bootstraps where subscription_id=s.id)
 and not exists(select 1 from account_subscriptions where billing_account_id=s.billing_account_id)
 and (select jsonb_agg(to_jsonb(ae) order by ae.id) from account_subscription_events ae where ae.billing_account_id=s.billing_account_id) is not distinct from c.audit_before,
 c.label||' no partial canonical, payment, evidence, bootstrap or audit writes') from incomplete_purchase c join billing_subscriptions_v2 s on s.id=pg_temp.period_subscription(c.u);

select * from finish();
rollback;
