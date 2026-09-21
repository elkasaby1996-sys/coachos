begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql
\ir fixtures/paddle_webhook_fixture.psql
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_sales_enabled=true;
create temp table attempt as select u,begin_paddle_checkout_v1(u,'growth','monthly',0,gen_random_uuid(),true,true,'2026-09-18','2026-09-18') result from (select pg_temp.guard_owner() u) x;
select mark_paddle_checkout_ready_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/transaction','ready','USD',jsonb_build_array(result->'base')) from attempt;
update billing_runtime_policy set paddle_sales_enabled=false;
create temp table protected as select (select jsonb_agg(to_jsonb(t) order by id) from account_subscriptions t) canonical,(select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts) entitlements,(select jsonb_agg(resolve_account_capacity(owner_user_id,id)-'computedAt' order by id) from billing_accounts) capacity;

-- This invoker helper deliberately forces deferred work after the definer RPC
-- returns, while SET ROLE service_role is still effective. The pgTAP savepoint
-- makes a pre-fix failure an assertion failure rather than aborting the suite.
create function pg_temp.service_boundary(o jsonb) returns void language plpgsql as $$
begin
 perform pg_temp.webhook_ingest(o);
 set constraints all immediate;
 set constraints all deferred;
end $$;
set local role service_role;
select lives_ok($$select pg_temp.service_boundary(pg_temp.webhook_observation('subscription.created','synthetic/service-create','synthetic/service-create'))$$,'service create completes deferred constraints after RPC returns');
reset role;
select is((select count(*) from billing_customers_v2),1::bigint,'one customer shadow');
select is((select count(*) from billing_subscriptions_v2),1::bigint,'one subscription shadow');
select ok((select bool_and(account_subscription_id is null and approved_additional_coach_seats=0 and reconciliation_status='pending') from billing_subscriptions_v2),'shadow has no commercial authority');
set local role service_role;
select lives_ok($$select pg_temp.service_boundary(pg_temp.webhook_observation('subscription.updated','synthetic/service-new','synthetic/service-new','2026-09-20T12:00:00.000Z')||'{"status":"paused"}')$$,'service newer update completes deferred constraints');
reset role;
select is((select provider_status from billing_subscriptions_v2),'paused','newer state applied');
set local role service_role;
select lives_ok($$select pg_temp.service_boundary(pg_temp.webhook_observation('subscription.updated','synthetic/service-old','synthetic/service-old','2026-09-20T11:00:00.000Z'))$$,'service older update retained');
select lives_ok($$select pg_temp.service_boundary(pg_temp.webhook_observation('subscription.updated','synthetic/service-equal','synthetic/service-equal','2026-09-20T12:00:00.000Z'))$$,'service equal-time contradiction retained');
select throws_ok($$select pg_temp.service_boundary(pg_temp.webhook_observation('subscription.updated','synthetic/service-drift','synthetic/service-drift')||'{"customerRef":"synthetic/other"}')$$,'P0001','PADDLE_INGRESS_IDENTITY_CONFLICT','service identity drift rejected');
reset role;
select is((select disposition from billing_paddle_event_observations where observation->>'eventRef'='synthetic/service-old'),'stale','older update is stale');
select is((select disposition from billing_paddle_event_observations where observation->>'eventRef'='synthetic/service-equal'),'manual_review','equal-time contradiction requires review');
select is((select provider_status from billing_subscriptions_v2),'paused','stale and equal-time events preserve newer state');
select is((select count(*) from billing_payment_applications_v2),0::bigint,'no payment applications');
select is((select count(*) from billing_subscriptions_v2 where account_subscription_id is not null),0::bigint,'no canonical links');
select is((select coalesce(sum(approved_additional_coach_seats),0) from billing_subscriptions_v2),0::bigint,'no approved seats');
select ok((select not paddle_sales_enabled and not paddle_reconciliation_enabled from billing_runtime_policy),'both flags remain false');
select is((select jsonb_agg(to_jsonb(t) order by id) from account_subscriptions t),(select canonical from protected),'canonical subscriptions unchanged');
select is((select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts),(select entitlements from protected),'entitlements unchanged');
select is((select jsonb_agg(resolve_account_capacity(owner_user_id,id)-'computedAt' order by id) from billing_accounts),(select capacity from protected),'capacity unchanged');
select ok((select prosecdef from pg_proc where oid='billing_v2_validate_item_set()'::regprocedure),'validator is security definer');
select ok((select r.rolname in ('postgres','supabase_admin') and p.proowner=(select proowner from pg_proc where oid='ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)'::regprocedure) from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='billing_v2_validate_item_set()'::regprocedure),'validator owner is trusted migration owner');
select ok((select proconfig=array['search_path=pg_catalog, public'] from pg_proc where oid='billing_v2_validate_item_set()'::regprocedure),'fixed search path preserved');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='billing_v2_validate_item_set()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC cannot execute validator');
select ok(not has_function_privilege(r,'billing_v2_validate_item_set()','EXECUTE'),r||' cannot execute validator') from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_table_privilege(r,t,priv),r||' denied '||priv||' on '||t) from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['billing_subscriptions_v2','billing_subscription_items_v2','billing_customers_v2','billing_evidence_v2','billing_price_mappings']) t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv;
select ok(relrowsecurity,relname||' RLS retained') from pg_class where oid in ('billing_customers_v2'::regclass,'billing_subscriptions_v2'::regclass,'billing_subscription_items_v2'::regclass,'billing_evidence_v2'::regclass,'billing_verified_evidence_v2'::regclass,'billing_webhook_events_v2'::regclass,'billing_paddle_event_observations'::regclass,'billing_paddle_event_deliveries'::regclass);
select is((select count(*) from pg_trigger where tgfoid='billing_v2_validate_item_set()'::regprocedure and tgdeferrable and tginitdeferred and ((tgname='billing_v2_subscription_items_check' and tgrelid='billing_subscriptions_v2'::regclass) or (tgname='billing_v2_item_set_check' and tgrelid='billing_subscription_items_v2'::regclass))),2::bigint,'both constraint trigger attachments and deferred timing preserved');
set local role service_role;
select throws_ok($$select * from billing_subscriptions_v2$$,'42501','permission denied for table billing_subscriptions_v2','service_role direct select denied');
select throws_ok($$insert into billing_subscriptions_v2 default values$$,'42501','permission denied for table billing_subscriptions_v2','service_role direct insert denied');
select throws_ok($$update billing_subscriptions_v2 set provider_status='active'$$,'42501','permission denied for table billing_subscriptions_v2','service_role direct update denied');
select throws_ok($$delete from billing_subscriptions_v2$$,'42501','permission denied for table billing_subscriptions_v2','service_role direct delete denied');
reset role;
set local role authenticated;
select throws_ok($$select * from billing_subscriptions_v2$$,'42501','permission denied for table billing_subscriptions_v2','authenticated direct select denied');
select throws_ok($$insert into billing_subscriptions_v2 default values$$,'42501','permission denied for table billing_subscriptions_v2','authenticated direct insert denied');
select throws_ok($$update billing_subscriptions_v2 set provider_status='active'$$,'42501','permission denied for table billing_subscriptions_v2','authenticated direct update denied');
select throws_ok($$delete from billing_subscriptions_v2$$,'42501','permission denied for table billing_subscriptions_v2','authenticated direct delete denied');
reset role;
set local role anon;
select throws_ok($$select * from billing_subscriptions_v2$$,'42501','permission denied for table billing_subscriptions_v2','anon direct select denied');
select throws_ok($$insert into billing_subscriptions_v2 default values$$,'42501','permission denied for table billing_subscriptions_v2','anon direct insert denied');
select throws_ok($$update billing_subscriptions_v2 set provider_status='active'$$,'42501','permission denied for table billing_subscriptions_v2','anon direct update denied');
select throws_ok($$delete from billing_subscriptions_v2$$,'42501','permission denied for table billing_subscriptions_v2','anon direct delete denied');
reset role;
select * from finish();
rollback;
