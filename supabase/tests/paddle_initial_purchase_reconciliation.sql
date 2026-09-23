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
select pg_temp.webhook_ingest(pg_temp.webhook_observation());
select pg_temp.webhook_ingest(pg_temp.webhook_observation('subscription.created','synthetic/create','synthetic/create'));
set constraints all immediate;
create function pg_temp.reconcile() returns jsonb language sql as $$
select reconcile_paddle_initial_purchase_v1((select id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/subscription')) $$;
select throws_ok('select pg_temp.reconcile()','P0001','PADDLE_RECONCILIATION_DISABLED','flag false denies authority');
update billing_runtime_policy set paddle_reconciliation_enabled=true;
select throws_ok($$select reconcile_paddle_initial_purchase_v1((select id from billing_subscriptions_v2),'renewal')$$,'P0001','PADDLE_RECONCILIATION_OPERATION','closed operation');

-- Corrupt synthetic retained facts as a DB administrator to demonstrate that
-- reconciliation independently revalidates them. Every case rolls back its
-- fixture changes; application roles never receive these privileges.
create function pg_temp.reject_case(mutation text) returns boolean language plpgsql as $$
declare rejected boolean:=false; before_count bigint;
begin
 begin
 execute mutation;
 select count(*) into before_count from account_subscriptions;
 begin
 perform pg_temp.reconcile();
 exception when others then rejected:=true;
 end;
 if (select count(*) from account_subscriptions)<>before_count
 or exists(select 1 from billing_payment_applications_v2)
 or exists(select 1 from billing_subscriptions_v2 where account_subscription_id is not null)
 then rejected:=false; end if;
 raise exception 'fixture rollback' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 end;
 return rejected;
end $$;
select ok(pg_temp.reject_case($$update billing_runtime_policy set entitlement_environment='live'$$),'test cannot grant live authority');
select ok(pg_temp.reject_case($$alter table billing_subscriptions_v2 disable trigger user; insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref) select billing_account_id,customer_id,provider,environment,'synthetic/replacement' from billing_subscriptions_v2; update billing_subscriptions_v2 set shadow_status='superseded',superseded_at=now(),superseded_by_subscription_id=(select id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/replacement') where provider_subscription_ref='synthetic/subscription'$$),'superseded identity denied');
select ok(pg_temp.reject_case($$alter table billing_customers_v2 disable trigger user; update billing_customers_v2 set identity_source='certification_fixture'$$),'certification customer denied');
select ok(pg_temp.reject_case($$alter table billing_customers_v2 disable trigger user; update billing_customers_v2 set identity_source='unknown_legacy'$$),'unknown customer denied');
select ok(pg_temp.reject_case($$alter table billing_paddle_event_observations disable trigger user; update billing_paddle_event_observations set disposition='pending' where observation->>'kind'='transaction.completed'$$),'unresolved payment denied');
select ok(pg_temp.reject_case($$alter table billing_paddle_event_observations disable trigger user; update billing_paddle_event_observations set disposition='manual_review' where observation->>'kind'='subscription.created'$$),'manual review denied');
select ok(pg_temp.reject_case($$update billing_subscriptions_v2 set provider_status='trialing'$$),'trial status denied');
select ok(pg_temp.reject_case($$update billing_subscriptions_v2 set reconciliation_status='manual_review'$$),'manual review shadow denied');
select ok(pg_temp.reject_case($$alter table billing_paddle_event_deliveries disable trigger user; delete from billing_paddle_event_deliveries where event_id=(select event_id from billing_paddle_event_observations where observation->>'kind'='transaction.completed')$$),'missing verified transaction evidence denied');
select ok(pg_temp.reject_case($$alter table billing_paddle_event_deliveries disable trigger user; delete from billing_paddle_event_deliveries where event_id=(select event_id from billing_paddle_event_observations where observation->>'kind'='subscription.created')$$),'missing verified subscription evidence denied');

create function pg_temp.mutate_observation(kind text,path text[],value jsonb) returns text language sql as $$
select format('alter table billing_paddle_event_observations disable trigger user; update billing_paddle_event_observations set observation=jsonb_set(observation,%L::text[],%L::jsonb),observation_sha256=encode(extensions.digest(jsonb_set(observation,%L::text[],%L::jsonb)::text,''sha256''),''hex'') where observation->>''kind''=%L',path,value,path,value,kind) $$;
select ok(pg_temp.reject_case(pg_temp.mutate_observation('transaction.completed',path,value)),label)
from (values
 ('{status}'::text[],'"paid"'::jsonb,'non-completed payment denied'),
 ('{currency}','"EUR"','wrong currency denied'),
 ('{transactionRef}','"synthetic/wrong"','wrong transaction correlation denied'),
 ('{customerRef}','"synthetic/wrong"','cross-customer mismatch denied'),
 ('{subscriptionRef}','"synthetic/wrong"','cross-subscription mismatch denied'),
 ('{items,0,unitPrice,amount}','"1"','wrong amount denied'),
 ('{items,0,priceRef}','"synthetic/wrong"','wrong mapping denied'),
 ('{items,0,productRef}','"synthetic/wrong"','wrong product denied'),
 ('{items,0,quantity}','2','wrong quantity denied'),
 ('{items,0,unitPrice,currency}','"EUR"','wrong item currency denied'),
 ('{items,0,priceRef}','"synthetic/price/growth/annual"','annual cadence denied')
) cases(path,value,label);
select ok(pg_temp.reject_case(pg_temp.mutate_observation('subscription.created',path,value)),label)
from (values
 ('{items,0,quantity}'::text[],'2'::jsonb,'subscription quantity denied'),
 ('{items,0,status}','"inactive"','inactive base denied'),
 ('{items,0,priceRef}','"synthetic/price/coach-seat/monthly"','seat role denied'),
 ('{items,0,unitPrice,amount}','"1"','subscription amount denied'),
 ('{transactionCorrelationRef}','"synthetic/wrong"','checkout mismatch denied')
) cases(path,value,label);
select ok(pg_temp.reject_case(pg_temp.mutate_observation('transaction.completed','{items}',jsonb_build_array(pg_temp.webhook_observation()#>'{items,0}',pg_temp.webhook_observation()#>'{items,0}'))),'extra recurring item denied');
select ok(pg_temp.reject_case($$alter table billing_paddle_checkout_snapshots disable trigger user; update billing_paddle_checkout_snapshots set base_product_ref='synthetic/wrong'$$),'snapshot provenance mismatch denied');
select ok(pg_temp.reject_case($$insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source) select billing_account_id,plan_version_id,'paid','active','manual' from billing_checkouts_v2$$),'existing canonical obligation denied');
select ok(pg_temp.reject_case($$select start_account_trial_for_owner(u,'first_workspace') from attempt$$),'existing trial is not canceled or replaced');
select ok(pg_temp.reject_case($$insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source) select billing_account_id,plan_version_id,'paid','grace','manual' from billing_checkouts_v2$$),'existing grace obligation denied');
select ok(pg_temp.reject_case($$alter table billing_checkouts_v2 disable trigger user; update billing_checkouts_v2 set requested_additional_seats=1,seat_mapping_id=(select id from billing_price_mappings where canonical_key='coach-seat' and cadence='monthly'),seat_mapping_kind='addon'$$),'positive-seat checkout denied');
select ok(pg_temp.reject_case($$update billing_subscriptions_v2 set provider_updated_at=provider_updated_at+interval '1 second'$$),'current identity requires exact retained subscription revision');
select ok(pg_temp.reject_case($$insert into billing_paddle_checkout_certification_fixtures(run_id,checkout_id) select gen_random_uuid(),id from billing_checkouts_v2$$),'certification checkout cannot grant access');
select ok(pg_temp.reject_case($$alter table billing_paddle_event_observations disable trigger user; update billing_paddle_event_observations set checkout_id=null where observation->>'kind'='transaction.completed'$$),'payment requires same checkout');
select throws_ok($$select reconcile_paddle_initial_purchase_v1(pg_temp.guard_subscription(pg_temp.guard_owner(),'live'))$$,'P0001','PADDLE_RECONCILIATION_IDENTITY','live shadow cannot use Sandbox reconciler');
create temp table original_receipts as select jsonb_agg(to_jsonb(v) order by id) evidence from billing_verified_evidence_v2 v;

-- Retirement after checkout admission preserves immutable historical mapping
-- authority. It does not admit new sales against the retired mapping.
savepoint mapping_retirement;
select retire_paddle_catalogue_mapping_v1(base_mapping_id) from billing_checkouts_v2;
select lives_ok('select pg_temp.reconcile()','historically valid mapping reconciles');
rollback to mapping_retirement;

savepoint superseded_history;
insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref,identity_source,identity_status,superseded_at,superseded_by_customer_id)
select billing_account_id,provider,environment,'synthetic/historical-customer','certification_fixture','superseded',now(),id from billing_customers_v2;
insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref,shadow_status,superseded_at,superseded_by_subscription_id)
select c.billing_account_id,c.id,c.provider,c.environment,'synthetic/historical-subscription','superseded',now(),s.id
from billing_customers_v2 c join billing_subscriptions_v2 s on s.billing_account_id=c.billing_account_id where c.identity_status='superseded';
select lives_ok('select pg_temp.reconcile()','verified current identity reconciles alongside retained certification history');
select ok((select bool_and(account_subscription_id is null) from billing_subscriptions_v2 where shadow_status='superseded'),'historical superseded subscription remains unlinked');
rollback to superseded_history;

select ok(not has_function_privilege('anon','reconcile_paddle_initial_purchase_v1(uuid,text)','execute'),'anon denied');
select ok(not has_function_privilege('authenticated','reconcile_paddle_initial_purchase_v1(uuid,text)','execute'),'browser denied');
select ok(has_function_privilege('service_role','reconcile_paddle_initial_purchase_v1(uuid,text)','execute'),'service allowed');
select ok(not has_function_privilege('service_role','billing_paddle_initial_payment_v1(uuid,uuid)','execute'),'internal payment writer denied');
select ok(not has_function_privilege('service_role','billing_paddle_initial_evidence_v1(uuid,text)','execute'),'internal proof writer denied');
select ok(not has_table_privilege('service_role','billing_payment_applications_v2','insert'),'direct payment DML denied');
select ok(not has_table_privilege('service_role','billing_subscriptions_v2','update'),'direct linkage DML denied');
select ok(not has_table_privilege('service_role','billing_subscription_items_v2','insert'),'direct item DML denied');
select ok((select proconfig=array['search_path=pg_catalog, public'] and proowner='postgres'::regrole from pg_proc where proname='reconcile_paddle_initial_purchase_v1'),'trusted owner and fixed path');
set local role authenticated;
select throws_ok($$select public.reconcile_paddle_initial_purchase_v1(gen_random_uuid())$$,'42501',null,'actual browser execution denied');
reset role;
set local role anon;
select throws_ok($$select public.reconcile_paddle_initial_purchase_v1(gen_random_uuid())$$,'42501',null,'actual anon execution denied');
reset role;
set local role service_role;
select throws_ok('insert into billing_payment_applications_v2 default values','42501',null,'actual direct payment insert denied');
select throws_ok('insert into billing_subscription_items_v2 default values','42501',null,'actual direct item insert denied');
select throws_ok('update billing_subscriptions_v2 set account_subscription_id=gen_random_uuid()','42501',null,'actual direct link update denied');
reset role;

-- Force an error after every effect, then retry the same retained evidence.
savepoint before_activation;
create temp table service_target as select id from billing_subscriptions_v2;
grant select on service_target to service_role;
set local role service_role;
select is((select reconcile_paddle_initial_purchase_v1(id)->>'success' from service_target),'true','service activation succeeds before rollback');
reset role;
rollback to before_activation;
select lives_ok('select pg_temp.reconcile()','Growth Monthly activates');
set constraints all immediate;
select is((select count(*) from account_subscriptions where billing_account_id=(select billing_account_id from billing_subscriptions_v2)),1::bigint,'one canonical subscription');
select is((select count(*) from billing_payment_applications_v2),1::bigint,'one payment application');
select is((select application_kind from billing_payment_applications_v2),'initial_purchase','exact payment semantic');
select is((select count(*) from billing_subscription_items_v2),1::bigint,'one base item');
select is((select item_role from billing_subscription_items_v2),'base_plan','base role');
select is((select approved_additional_coach_seats from billing_subscriptions_v2),0,'approved extras remain zero');
select is((select reconciliation_status from billing_subscriptions_v2),'processed','processed atomically');
select is((select count(*) from billing_subscription_items_v2 where item_role='coach_seat'),0::bigint,'no seat observation');
select ok((select current_period_started_at is null and current_period_ends_at is null from account_subscriptions where id=(select account_subscription_id from billing_subscriptions_v2)),'missing provider dates not invented');
create temp table granted as select resolve_account_entitlements(billing_account_id) e,resolve_account_capacity(u,billing_account_id) c from billing_subscriptions_v2 cross join attempt;
select is((select e#>>'{subscription,planKey}' from granted),'growth','effective Growth');
select is((select e#>>'{subscription,kind}' from granted),'paid','effective paid');
select is((select e->'targetFeatureKeys' from granted),(select jsonb_agg(feature_key order by feature_key) from commercial_plan_feature_entitlements where plan_version_id=(select plan_version_id from billing_checkouts_v2)),'canonical Growth feature set');
select is((select e#>>'{limits,countedClients}' from granted),(select max_counted_clients::text from commercial_plan_versions where id=(select plan_version_id from billing_checkouts_v2)),'canonical client limit');
select is((select billing_seat_effective_limit(billing_account_id) from billing_subscriptions_v2),(select included_coach_seats from commercial_plan_versions where id=(select plan_version_id from billing_checkouts_v2)),'capacity includes zero extra paid seats');
select is((select e->'enabledFeatureKeys' from granted),(select jsonb_agg(f.feature_key order by f.feature_key) from commercial_plan_feature_entitlements e join commercial_features f using(feature_key) where e.plan_version_id=(select plan_version_id from billing_checkouts_v2) and f.readiness_status='COMMERCIALLY_SALEABLE'),'saleable Growth features enabled');
select is((select e#>>'{limits,maxCoachSeats}' from granted),(select max_coach_seats::text from commercial_plan_versions where id=(select plan_version_id from billing_checkouts_v2)),'canonical team maximum');
select is((select e#>>'{limits,activeWorkspaces}' from granted),(select max_active_workspaces::text from commercial_plan_versions where id=(select plan_version_id from billing_checkouts_v2)),'canonical workspace limit');
select is((select e#>>'{limits,publishedPackages}' from granted),(select max_published_packages::text from commercial_plan_versions where id=(select plan_version_id from billing_checkouts_v2)),'canonical package limit');
select is((select (d->>'limit')::integer from granted,jsonb_array_elements(c->'dimensions') d where d->>'key'='counted_clients'),(select max_counted_clients from commercial_plan_versions where id=(select plan_version_id from billing_checkouts_v2)),'effective client capacity');
select is((select jsonb_agg(to_jsonb(v) order by id) from billing_verified_evidence_v2 v),(select evidence from original_receipts),'original provider evidence unchanged');
select is((select billing_paddle_initial_payment_v1(subscription_id,evidence_id) from billing_payment_applications_v2),(select id from billing_payment_applications_v2),'internal payment exact retry preserves application');
select throws_ok($$insert into billing_payment_applications_v2(provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind,checkout_id) select provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind,checkout_id from billing_payment_applications_v2$$,'23505',null,'transaction and checkout cannot be consumed twice');
select is((select pg_temp.reconcile()->>'reused'),'true','exact retry reused');
select is((select count(*) from billing_payment_applications_v2),1::bigint,'retry no duplicate payment');
select is((select count(*) from billing_subscription_items_v2),1::bigint,'retry no duplicate item');
select is((select count(*) from billing_evidence_v2 where proof_schema='paddle-initial-purchase-v1'),2::bigint,'retry no duplicate proof');
select throws_ok($$update billing_runtime_policy set entitlement_environment='live'$$,'P0001','PADDLE_RECONCILIATION_ENVIRONMENT_PINNED','policy switching is not migration');
select throws_ok('delete from billing_payment_applications_v2','P0001','BILLING_V2_HISTORY_IMMUTABLE','payment history immutable');
select throws_ok('delete from billing_subscription_items_v2','P0001','BILLING_V2_HISTORY_IMMUTABLE','item history immutable');
select throws_ok('delete from billing_evidence_v2','P0001','BILLING_V2_HISTORY_IMMUTABLE','evidence immutable');
select throws_ok($$select billing_guard_claim_canonical(billing_account_id,account_subscription_id,'lemonsqueezy.v1') from billing_subscriptions_v2$$,'P0001','BILLING_GUARD_CANONICAL_ALREADY_OWNED','LS cannot claim Paddle canonical row');
select ok((select not paddle_sales_enabled from billing_runtime_policy),'sales stays false');
select * from finish();
rollback;
