begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql

-- Owner-only synthetic closed history for protection tests; never a deployed helper.
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
create temp table historical_actor as select pg_temp.guard_owner() owner,gen_random_uuid() run;
select throws_ok($$select begin_paddle_checkout_v1(owner,'growth','monthly',0,run,true,true,'2026-09-18','2026-09-18') from historical_actor$$,'P0001','PADDLE_CHECKOUT_DISABLED','normal checkout still obeys disabled sales gate');
insert into billing_paddle_checkout_certification_fixtures(run_id,checkout_id,created_at,closed_at)
select run,(billing_v2_admit_checkout(owner,'test','growth','monthly',0,run)->>'id')::uuid,'2026-09-20T10:00:00Z','2026-09-20T11:00:00Z' from historical_actor;
create temp table history_before as select * from billing_paddle_checkout_certification_fixtures;
select throws_ok($$update billing_paddle_checkout_certification_fixtures set run_id=gen_random_uuid()$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','owner cannot rewrite identity');
select throws_ok($$update billing_paddle_checkout_certification_fixtures set created_at=clock_timestamp()$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','owner cannot rewrite creation timestamp');
select throws_ok($$delete from billing_paddle_checkout_certification_fixtures$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','DELETE protection retained');
select throws_ok($$truncate billing_paddle_checkout_certification_fixtures$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','TRUNCATE protection retained');
set local role service_role;
select throws_ok($$select * from billing_paddle_checkout_certification_fixtures$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','service history remains private');
select throws_ok($$update billing_paddle_checkout_certification_fixtures set closed_at=null$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','service cannot reopen history');
select throws_ok($$insert into billing_paddle_checkout_certification_fixtures(run_id) values(gen_random_uuid())$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','service cannot create marker');
select throws_ok($$delete from billing_paddle_checkout_certification_fixtures$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','service cannot delete');
select throws_ok($$truncate billing_paddle_checkout_certification_fixtures$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','service cannot truncate');
reset role;
set local role authenticated;
select throws_ok($$select * from billing_paddle_checkout_certification_fixtures$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','authenticated cannot read');
select throws_ok($$update billing_paddle_checkout_certification_fixtures set closed_at=null$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','authenticated cannot update');
reset role;
set local role anon;
select throws_ok($$select * from billing_paddle_checkout_certification_fixtures$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','anon cannot read');
select throws_ok($$update billing_paddle_checkout_certification_fixtures set closed_at=null$$,'42501','permission denied for table billing_paddle_checkout_certification_fixtures','anon cannot update');
reset role;
select results_eq('select * from billing_paddle_checkout_certification_fixtures order by run_id','select * from history_before order by run_id','run IDs checkout references and both timestamps retained');
select ok(not exists(select 1 from billing_paddle_checkout_certification_fixtures where closed_at is null),'all historical fixtures closed');
select is((select count(*) from billing_payment_applications_v2),0::bigint,'no payment applications');
select is((select count(*) from billing_subscriptions_v2 where account_subscription_id is not null),0::bigint,'no canonical Paddle links');
select is((select coalesce(sum(approved_additional_coach_seats),0) from billing_subscriptions_v2),0::bigint,'no approved Paddle seats');
select ok((select not paddle_sales_enabled and not paddle_reconciliation_enabled from billing_runtime_policy where id=1),'both Paddle flags remain disabled');
select * from finish();
rollback;
