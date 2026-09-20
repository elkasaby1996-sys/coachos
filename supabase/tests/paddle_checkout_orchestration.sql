begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql
create function pg_temp.start(u uuid,k text default 'growth',cad text default 'monthly',seats integer default 0,op uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.begin_paddle_checkout_v1(u,k,cad,seats,op,true,true,'2026-09-18','2026-09-18') $$;
create temp table protected_before as select (select jsonb_agg(to_jsonb(t) order by id) from account_subscriptions t) subscriptions, (select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts) entitlements, (select array_agg(id) from billing_accounts) accounts;
create temp table checkout_actors as select pg_temp.guard_owner() u;
select throws_ok($$select pg_temp.start((select u from checkout_actors))$$,'P0001','PADDLE_CHECKOUT_DISABLED','sales false blocks before intent');
select is((select count(*) from billing_checkouts_v2),0::bigint,'no checkout while disabled');
update billing_runtime_policy set paddle_sales_enabled=true where id=1;
select throws_ok($$select pg_temp.start((select u from checkout_actors))$$,'P0001','BILLING_CATALOGUE_INCOMPLETE','incomplete catalogue fails closed');
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
select throws_ok($$select begin_paddle_checkout_v1((select u from checkout_actors),'growth','monthly',0,gen_random_uuid(),false,true,'2026-09-18','2026-09-18')$$,'P0001','PADDLE_CHECKOUT_LEGAL_REQUIRED','terms required');
select throws_ok($$select begin_paddle_checkout_v1((select u from checkout_actors),'growth','monthly',0,gen_random_uuid(),true,false,'2026-09-18','2026-09-18')$$,'P0001','PADDLE_CHECKOUT_LEGAL_REQUIRED','refund required');
select throws_ok($$select pg_temp.start(gen_random_uuid())$$,'P0001','PADDLE_CHECKOUT_FORBIDDEN','unowned account rejected');
select throws_ok($$select pg_temp.start((select u from checkout_actors),'launch','monthly',2)$$,'P0001','PADDLE_CHECKOUT_SEAT_POLICY','launch extra seats rejected');
select throws_ok($$select pg_temp.start((select u from checkout_actors),'growth','monthly',4)$$,'P0001','PADDLE_CHECKOUT_SEAT_POLICY','seat ceiling enforced');
create function pg_temp.retired_mapping() returns void language plpgsql as $$
begin
 perform public.retire_paddle_catalogue_mapping_v1(id) from public.billing_price_mappings where provider='paddle' and canonical_key='growth' and cadence='monthly';
 perform pg_temp.start((select u from checkout_actors));
end $$;
select throws_ok($$select pg_temp.retired_mapping()$$,'P0001','BILLING_CATALOGUE_INCOMPLETE','retired mapping blocks dispatch');
create function pg_temp.wrong_environment() returns void language plpgsql as $$
begin
 update public.billing_runtime_policy set entitlement_environment='live' where id=1;
 perform pg_temp.start((select u from checkout_actors));
end $$;
select throws_ok($$select pg_temp.wrong_environment()$$,'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','production environment blocked');
select throws_ok($$update billing_price_mappings set catalogue_evidence_id=null,verification_sha256=null where provider='paddle' and canonical_key='launch'$$,'P0001','BILLING_V2_MAPPING_IMMUTABLE','active mapping cannot lose verified provenance');
select throws_ok($$update billing_price_mappings set plan_version_id=gen_random_uuid() where provider='paddle' and canonical_key='launch'$$,'P0001','BILLING_V2_MAPPING_IMMUTABLE','wrong canonical version cannot replace publication');
create temp table cases as select k,c,u,pg_temp.start(u,k,c,0) result from
 (select k,c,pg_temp.guard_owner() u from unnest(array['launch','growth','scale']) k cross join unnest(array['monthly','annual']) c) x;
select is((select count(*) from cases where result->>'dispatch'='true'),6::bigint,'all plans and cadences admitted');
select ok((select bool_and(result#>'{base,quantity}'='1'::jsonb and result->'seats'='null'::jsonb) from cases),'base quantity exactly one');
select is((select count(*) from billing_paddle_checkout_snapshots),6::bigint,'legal snapshot for every new attempt');
select ok((select bool_and(terms_version='2026-09-18' and refund_version='2026-09-18' and acknowledged_at is not null) from billing_paddle_checkout_snapshots),'auditable legal acknowledgement');
select ok((select bool_and((pg_temp.start(u,k,c,0,(result->>'operationReference')::uuid)->>'dispatch')::boolean=false) from cases),'same operation no dispatch');
select ok((select bool_and((pg_temp.start(u,k,c,0)->>'dispatch')::boolean=false) from cases),'new operation same open selection no dispatch');
select throws_ok($$select pg_temp.start(u,'scale',c,0) from cases where k='growth' and c='monthly'$$,'P0001','PADDLE_CHECKOUT_CONFLICT','different selection conflicts');
create temp table seat_case as select u,pg_temp.start(u,'scale','annual',2) result from (select pg_temp.guard_owner() u) x;
select is((select result#>>'{seats,quantity}' from seat_case),'2','only purchased extra seats');
select ok((select m.cadence='annual' from seat_case s join billing_checkouts_v2 t on t.id=(s.result->>'attemptReference')::uuid join billing_price_mappings m on m.id=t.seat_mapping_id),'seat cadence matches');
select throws_ok($$select mark_paddle_checkout_ready_v1(u,(result->>'attemptReference')::uuid,gen_random_uuid(),'synthetic/transaction','ready','USD','[]') from seat_case$$,'P0001','PADDLE_CHECKOUT_CONFLICT','wrong correlation rejected');
select throws_ok($$select mark_paddle_checkout_ready_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/transaction','paid','USD',jsonb_build_array(result->'base',result->'seats')) from seat_case$$,'P0001','PADDLE_CHECKOUT_RESPONSE_MISMATCH','paid is not checkout readiness');
select throws_ok($$select mark_paddle_checkout_ready_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/transaction','ready','USD','[]') from seat_case$$,'P0001','PADDLE_CHECKOUT_RESPONSE_MISMATCH','item drift rejected');
select lives_ok($$select mark_paddle_checkout_ready_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/transaction','ready','USD',jsonb_build_array(result->'base',result->'seats')) from seat_case$$,'valid facts mark ready');
select is((select status from billing_checkouts_v2 where id=(select (result->>'attemptReference')::uuid from seat_case)),'ready','ready persists');
select lives_ok($$select mark_paddle_checkout_ambiguous_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid) from cases where k='growth' and c='monthly'$$,'ambiguous transition');
select throws_ok($$select pg_temp.start(u,k,c,0) from cases where k='growth' and c='monthly'$$,'P0001','PADDLE_CHECKOUT_AMBIGUOUS','ambiguous blocks retry');
select throws_ok($$select mark_paddle_checkout_failed_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid) from cases where k='growth' and c='monthly'$$,'P0001','PADDLE_CHECKOUT_CONFLICT','ambiguous cannot become failed');
select throws_ok($$update billing_checkouts_v2 set status='expired',expired_at=now() where id=(select (result->>'attemptReference')::uuid from cases where k='growth' and c='monthly')$$,'P0001','PADDLE_CHECKOUT_AMBIGUOUS','expiry cannot reopen ambiguous attempt');
select lives_ok($$select mark_paddle_checkout_failed_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid) from cases where k='launch' and c='monthly'$$,'known failure transition');
select ok((select bool_and(not has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute')) from pg_proc p where proname in ('begin_paddle_checkout_v1','mark_paddle_checkout_ready_v1','mark_paddle_checkout_ambiguous_v1','mark_paddle_checkout_failed_v1','paddle_checkout_outcome_v1')),'clients cannot call writes');
select ok((select relrowsecurity from pg_class where oid='billing_paddle_checkout_snapshots'::regclass),'snapshot RLS');
select is((select count(*) from billing_subscriptions_v2),0::bigint,'no canonical links or seat approvals');
select is((select count(*) from billing_payment_applications_v2),0::bigint,'no payment authority');
select is((select jsonb_agg(to_jsonb(t) order by id) from account_subscriptions t),(select subscriptions from protected_before),'canonical subscriptions unchanged');
select is((select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts where id=any((select accounts from protected_before)::uuid[])),(select entitlements from protected_before),'existing entitlement outputs unchanged');
select ok((select bool_and(proconfig=array['search_path=pg_catalog, public']) from pg_proc where proname in ('begin_paddle_checkout_v1','mark_paddle_checkout_ready_v1','mark_paddle_checkout_ambiguous_v1','mark_paddle_checkout_failed_v1')),'fixed search paths');
select ok(not has_table_privilege('authenticated','billing_paddle_checkout_snapshots','insert') and not has_table_privilege('service_role','billing_paddle_checkout_snapshots','insert'),'no direct snapshot writer');
select * from finish();
rollback;
