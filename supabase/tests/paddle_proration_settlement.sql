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
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;

create temp table cases(label text primary key,u uuid,shadow uuid,canonical uuid,period_start timestamptz,period_end timestamptz,transaction jsonb,result text,expected text);
insert into cases(label,u) select label,pg_temp.plan_owner() from unnest(array['forward','reverse','transaction-first','different-captured-total']) label;
insert into cases(label,u,expected) select label,pg_temp.plan_owner(),'manual_review' from unnest(array[
 'only-target','only-source','wrong-source','wrong-target','swapped-signs','both-positive','both-negative','both-negative-reverse','magnitude-two','magnitude-two-reverse','duplicate-target','duplicate-source','third-item','addon',
 'unknown-item','wrong-product','null-product','wrong-amount','wrong-currency','wrong-operation','unpaid','partial','balance','zero-total','missing-totals','outside-period','before-request']) label;
insert into cases(label,u,expected) select label,pg_temp.plan_owner(),'PADDLE_INGRESS_INVALID' from unnest(array['zero-quantity','unsafe-quantity']) label;
insert into cases(label,u,expected) select label,pg_temp.plan_owner(),'BILLING_PROOF_INVALID' from unnest(array['missing-operation','wrong-origin']) label;
insert into cases(label,u,expected) select label,pg_temp.plan_owner(),'PADDLE_INGRESS_IDENTITY_CONFLICT' from unnest(array['wrong-customer','wrong-subscription']) label;
update cases c set shadow=s.id,canonical=s.account_subscription_id,period_start=s.current_period_started_at,period_end=s.current_period_ends_at from billing_subscriptions_v2 s where s.provider_subscription_ref='synthetic/sub/'||c.u;
select pg_temp.plan_begin(u) from cases;
update cases set transaction=pg_temp.plan_observation(u,'settlement','transaction.completed');

create function pg_temp.proration_item(k text,q integer) returns jsonb language sql as $$
 select jsonb_build_object('priceRef',provider_price_ref,'productRef',provider_product_ref,'quantity',q,'unitPrice',jsonb_build_object('amount',unit_amount_minor::text,'currency','USD'))
 from billing_price_mappings where provider='paddle' and environment='test' and canonical_key=k and cadence='monthly' and status='active'
$$;
update cases set transaction=jsonb_set(transaction,'{items}',jsonb_build_array(transaction#>'{items,1}',transaction#>'{items,0}')) where label='reverse';
update cases set transaction=jsonb_set(transaction,'{paymentTotals}','{"total":6123,"paid":6123,"balance":0}') where label='different-captured-total';
update cases set transaction=jsonb_set(transaction,'{items}',jsonb_build_array(transaction#>'{items,0}')) where label='only-target';
update cases set transaction=jsonb_set(transaction,'{items}',jsonb_build_array(transaction#>'{items,1}')) where label='only-source';
update cases set transaction=jsonb_set(transaction,'{items,1}',pg_temp.proration_item('launch',-1)) where label='wrong-source';
update cases set transaction=jsonb_set(transaction,'{items,0}',pg_temp.proration_item('launch',1)) where label='wrong-target';
update cases set transaction=jsonb_set(jsonb_set(transaction,'{items,0,quantity}','-1'),'{items,1,quantity}','1') where label='swapped-signs';
update cases set transaction=jsonb_set(transaction,'{items,1,quantity}','1') where label='both-positive';
update cases set transaction=jsonb_set(transaction,'{items,0,quantity}','-1') where label in ('both-negative','both-negative-reverse');
update cases set transaction=jsonb_set(jsonb_set(transaction,'{items,0,quantity}','2'),'{items,1,quantity}','-2') where label in ('magnitude-two','magnitude-two-reverse');
update cases set transaction=jsonb_set(transaction,'{items}',jsonb_build_array(transaction#>'{items,1}',transaction#>'{items,0}')) where label in ('both-negative-reverse','magnitude-two-reverse');
update cases set transaction=jsonb_set(transaction,'{items,1}',transaction#>'{items,0}') where label='duplicate-target';
update cases set transaction=jsonb_set(transaction,'{items,0}',transaction#>'{items,1}') where label='duplicate-source';
update cases set transaction=jsonb_set(transaction,'{items}',(transaction->'items')||jsonb_build_array(pg_temp.proration_item('launch',1))) where label='third-item';
update cases set transaction=jsonb_set(transaction,'{items}',(transaction->'items')||jsonb_build_array(pg_temp.proration_item('coach-seat',1))) where label='addon';
update cases set transaction=jsonb_set(transaction,'{items,1,priceRef}','"synthetic/unknown"') where label='unknown-item';
update cases set transaction=jsonb_set(transaction,'{items,1,productRef}','"synthetic/wrong-product"') where label='wrong-product';
update cases set transaction=jsonb_set(transaction,'{items,1,productRef}','null') where label='null-product';
update cases set transaction=jsonb_set(transaction,'{items,1,unitPrice,amount}','"1"') where label='wrong-amount';
update cases set transaction=jsonb_set(transaction,'{items,1,unitPrice,currency}','"EUR"') where label='wrong-currency';
update cases set transaction=jsonb_set(transaction,'{planChangeOperationId}',to_jsonb(gen_random_uuid())) where label='wrong-operation';
update cases set transaction=jsonb_set(transaction,'{customerRef}',(select transaction->'customerRef' from cases where label='forward')) where label='wrong-customer';
update cases set transaction=jsonb_set(transaction,'{subscriptionRef}',(select transaction->'subscriptionRef' from cases where label='forward')) where label='wrong-subscription';
update cases set transaction=transaction-'planChangeOperationId' where label='missing-operation';
update cases set transaction=jsonb_set(transaction,'{origin}','"web"') where label='wrong-origin';
update cases set transaction=jsonb_set(transaction,'{paymentTotals,paid}','0') where label='unpaid';
update cases set transaction=jsonb_set(transaction,'{paymentTotals,paid}','2999') where label='partial';
update cases set transaction=jsonb_set(transaction,'{paymentTotals,balance}','1') where label='balance';
update cases set transaction=jsonb_set(transaction,'{paymentTotals}','{"total":0,"paid":0,"balance":0}') where label='zero-total';
update cases set transaction=transaction-'paymentTotals' where label='missing-totals';
update cases set transaction=jsonb_set(transaction,'{billingPeriod,endsAt}','"2026-11-20T00:00:00Z"') where label='outside-period';
update cases set transaction=jsonb_set(transaction,'{occurredAt}','"2026-09-20T00:00:00Z"'),expected='reused' where label='before-request';
update cases set transaction=jsonb_set(transaction,'{items,1,quantity}','0') where label='zero-quantity';
update cases set transaction=jsonb_set(transaction,'{items,1,quantity}','-2147483648') where label='unsafe-quantity';

create function pg_temp.try_proration(o jsonb) returns text language plpgsql as $$
begin return pg_temp.lifecycle_dispatch(o);
exception when raise_exception then return sqlerrm;
end $$;
select is(pg_temp.lifecycle_dispatch(transaction),'pending','transaction-first cannot grant authority without subscription evidence') from cases where label='transaction-first';
select is(pg_temp.plan_status(u)->>'operation','provider_pending','transaction alone leaves provider_pending') from cases where label='transaction-first';
select is(pg_temp.plan_status(u)->>'plan','growth','transaction alone preserves Growth') from cases where label='transaction-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'target')),'applied','transaction-first converges on complementary subscription') from cases where label='transaction-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'target')),'pending','subscription alone waits for payment: '||label) from cases where label<>'transaction-first';
select is(pg_temp.plan_status(u)->>'operation','awaiting_payment','durable waiting state: '||label) from cases where label<>'transaction-first';
-- Ingestion must commit evidence without granting any payment/canonical authority.
select pg_temp.lifecycle_ingest(transaction) from cases where label='forward';
select is(pg_temp.plan_status(u)->>'payments','0','ingestion alone grants no payment') from cases where label='forward';
select is(pg_temp.plan_status(u)->>'plan','growth','ingestion alone grants no Scale') from cases where label='forward';
update cases set result=pg_temp.try_proration(transaction) where label<>'transaction-first';
select is(result,'applied','complete exact proration: '||label) from cases where expected is null and label<>'transaction-first';
select is(result,expected,'reject invalid settlement: '||label) from cases where expected is not null;
select is(pg_temp.plan_status(u)->>'plan','growth','no invalid grant: '||label) from cases where expected is not null;
select is(pg_temp.plan_status(u)->>'payments','0','no invalid payment: '||label) from cases where expected is not null;
select is((select status from account_subscriptions where id=canonical),'active','source remains active: '||label) from cases where expected is not null;
select ok(not exists(select 1 from account_subscriptions where id=canonical and (superseded_at is not null or superseded_by_subscription_id is not null)),'no invalid supersession: '||label) from cases where expected is not null;
select is((select count(*) from account_subscriptions a join billing_subscriptions_v2 s on s.billing_account_id=a.billing_account_id where s.id=shadow),1::bigint,'no target canonical created: '||label) from cases where expected is not null;
select is(pg_temp.plan_status(u)->>'operation','completed','completed: '||label) from cases where expected is null;
select is(pg_temp.plan_status(u)->>'payments','1','exactly one payment: '||label) from cases where expected is null;
select is(pg_temp.plan_status(u)->>'plan','scale','Scale canonical: '||label) from cases where expected is null;
select is(pg_temp.plan_status(u)#>>'{entitlements,limits,countedClients}','100','Scale entitlements: '||label) from cases where expected is null;
select is((select status from account_subscriptions where id=canonical),'superseded','Growth superseded: '||label) from cases where expected is null;
select ok(exists(select 1 from billing_subscriptions_v2 s where s.id=c.shadow and s.current_period_started_at=c.period_start and s.current_period_ends_at=c.period_end and s.approved_additional_coach_seats=0),'same shadow, period and zero seats: '||label) from cases c where expected is null;
select is(pg_temp.lifecycle_dispatch(transaction),'reused','duplicate settlement reused: '||label) from cases where expected is null;
select is(pg_temp.plan_status(u)->>'payments','1','duplicate cannot double apply: '||label) from cases where expected is null;

-- A different operation cannot spend an already-applied provider transaction.
insert into cases(label,u) values('spent-transaction',pg_temp.plan_owner());
select pg_temp.plan_begin(u) from cases where label='spent-transaction';
select pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'target')) from cases where label='spent-transaction';
update cases set transaction=jsonb_set(pg_temp.plan_observation(u,'spent','transaction.completed'),'{transactionRef}',(select transaction->'transactionRef' from cases where label='forward')) where label='spent-transaction';
select is(pg_temp.try_proration(transaction),'manual_review','already-applied transaction fails closed') from cases where label='spent-transaction';
select is(pg_temp.plan_status(u)->>'payments','0','no second payment application') from cases where label='spent-transaction';
select is(pg_temp.plan_status(u)->>'plan','growth','spent transaction preserves source') from cases where label='spent-transaction';

-- Cover the entire effective ledger status contract. Fixture-only status setup
-- models late signed deliveries; all tested ingress/dispatch guards remain on.
create temp table status_cases(state text primary key,admissible boolean,u uuid,canonical uuid,transaction jsonb,event_id uuid,result text);
insert into status_cases(state,admissible,u)
select state,state=any(array['provider_pending','awaiting_payment','ambiguous']),pg_temp.plan_owner()
from unnest(array['requested','provider_pending','awaiting_payment','scheduled','cancel_pending','completed','canceled','failed','ambiguous','manual_review']) state;
select pg_temp.plan_begin(u) from status_cases;
update status_cases c set canonical=s.account_subscription_id from billing_subscriptions_v2 s where s.provider_subscription_ref='synthetic/sub/'||c.u;
-- Retain complementary subscription evidence without first changing the tested
-- operation state: payment dispatch must handle each allowed starting status.
select pg_temp.lifecycle_ingest(pg_temp.plan_observation(u,'status-target')) from status_cases;
select fail_paddle_plan_change_v1(u,(select id from billing_operations_v2 where created_by_user_id=u),true) from status_cases where state='ambiguous';
update billing_operations_v2 op set status=c.state,
 completed_at=case when c.state='completed' then billing_paddle_plan_now_v1() end,
 provider_applied_at=case when c.state='completed' then billing_paddle_plan_now_v1() end,
 payment_confirmed_at=case when c.state='completed' then billing_paddle_plan_now_v1() end,
 canceled_at=case when c.state='canceled' then billing_paddle_plan_now_v1() end,
 failed_at=case when c.state='failed' then billing_paddle_plan_now_v1() end
from status_cases c where op.created_by_user_id=c.u and c.state<>'ambiguous';
update status_cases set transaction=pg_temp.plan_observation(u,'status-settlement','transaction.completed');
update status_cases set event_id=pg_temp.lifecycle_ingest(transaction);
select is((select disposition from billing_paddle_event_observations where event_id=c.event_id),
 case when admissible then 'correlated' else 'manual_review' end,'ingestion status allowlist: '||state) from status_cases c;
select is(pg_temp.plan_status(u)->>'payments','0','ingestion alone grants no payment: '||state) from status_cases;
-- The fixture's plan field uses the latest completed operation's mapping. These
-- deliberately synthetic terminal rows must instead be checked against the
-- canonical entitlement reader, which is the actual access authority.
select is(pg_temp.plan_status(u)#>>'{entitlements,subscription,planKey}','growth','ingestion alone preserves Growth: '||state) from status_cases;
update status_cases set result=reconcile_paddle_initial_purchase_event_v1(event_id)->>'status';
select is(result,'applied','unresolved status converges: '||state) from status_cases where admissible;
select is(pg_temp.plan_status(u)->>'operation','completed','unresolved status completes: '||state) from status_cases where admissible;
select is(pg_temp.plan_status(u)#>>'{entitlements,subscription,planKey}','scale','verified settlement grants Scale: '||state) from status_cases where admissible;
select is(pg_temp.plan_status(u)->>'payments','1','one payment after convergence: '||state) from status_cases where admissible;
select is(pg_temp.lifecycle_dispatch(transaction),'reused','converged settlement replay is reused: '||state) from status_cases where admissible;
select is(pg_temp.plan_status(u)->>'payments','1','replay cannot add payment: '||state) from status_cases where admissible;
select is(pg_temp.plan_status(u)#>>'{entitlements,subscription,planKey}','growth','rejected status retains Growth: '||state) from status_cases where not admissible;
select is(pg_temp.plan_status(u)#>>'{entitlements,limits,countedClients}','50','rejected status retains Growth capacity: '||state) from status_cases where not admissible;
select is(pg_temp.plan_status(u)->>'payments','0','rejected status has no payment: '||state) from status_cases where not admissible;
select is((select status from account_subscriptions where id=canonical),'active','rejected status keeps source active: '||state) from status_cases where not admissible;
select ok(not exists(select 1 from account_subscriptions where id=canonical and (superseded_at is not null or superseded_by_subscription_id is not null)),'rejected status cannot supersede: '||state) from status_cases where not admissible;
select is((select count(*) from account_subscriptions a join billing_accounts b on b.id=a.billing_account_id where b.owner_user_id=u),1::bigint,'rejected status creates no target: '||state) from status_cases where not admissible;

-- Existing caller privileges remain unchanged.
select ok(not has_function_privilege('authenticated','ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)','execute'),'browser cannot forge authenticated ingress');
select ok(not has_function_privilege('service_role','billing_paddle_plan_facts_v1(uuid,uuid,uuid)','execute'),'settlement helper remains private');
select * from finish();
rollback;
