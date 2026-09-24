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
select ok(not (select paddle_reconciliation_enabled or paddle_sales_enabled from billing_runtime_policy where id=1),'deployment stays dormant');
update billing_runtime_policy set paddle_reconciliation_enabled=true;
create temp table cases(label text,u uuid,request uuid default gen_random_uuid(),canonical uuid);
insert into cases(label,u) select x,pg_temp.plan_owner() from unnest(array['upgrade','ambiguous','failed','unpaid','drift','capacity','cancel','annual','atomic']) x;
update cases c set canonical=s.account_subscription_id from billing_subscriptions_v2 s where s.provider_subscription_ref='synthetic/sub/'||c.u;
select ok((pg_temp.plan_begin(u,'scale',request)->>'dispatch')::boolean,'Growth to Scale dispatch claimed once') from cases where label='upgrade';
select is(begin_paddle_plan_change_v1(u,'scale','monthly',request,null)->>'dispatch','false','exact retry never dispatches') from cases where label='upgrade';
select throws_ok($$select begin_paddle_plan_change_v1(u,'launch','monthly',request,null) from cases where label='upgrade'$$,'P0001','BILLING_PLAN_CHANGE_OPERATION_CONFLICT','retry intent immutable');
select throws_ok($$select pg_temp.plan_begin(u,'launch') from cases where label='upgrade'$$,'P0001','BILLING_PLAN_CHANGE_ALREADY_PENDING','one open operation');
create temp table events(label text,kind text,event jsonb);
insert into events select label,'subscription',pg_temp.plan_observation(u,'upgrade') from cases where label='upgrade';
select is(pg_temp.lifecycle_dispatch(event),'pending','target alone cannot grant Scale') from events where label='upgrade';
select is(pg_temp.plan_status(u)->>'plan','growth','unpaid target preserves Growth') from cases where label='upgrade';
insert into events select label,'transaction',pg_temp.plan_observation(u,'paid','transaction.completed') from cases where label='upgrade';
select is(pg_temp.lifecycle_dispatch(event),'applied','verified upgrade payment completes') from events where label='upgrade' and kind='transaction';
select is(pg_temp.plan_status(u)->>'plan','scale','canonical Scale approved') from cases where label='upgrade';
select is(pg_temp.plan_status(u)->>'payments','1','one upgrade payment') from cases where label='upgrade';
select is(pg_temp.plan_status(u)#>>'{entitlements,limits,countedClients}','100','Scale canonical capacity reader') from cases where label='upgrade';
select is((select status from account_subscriptions where id=canonical),'superseded','source superseded') from cases where label='upgrade';
select is((select superseded_by_subscription_id::text from account_subscriptions where id=canonical),pg_temp.plan_status(u)->>'canonical','source points to successor') from cases where label='upgrade';
select is(pg_temp.lifecycle_dispatch(event),'reused','duplicate webhook reused') from events where label='upgrade';
select is(begin_paddle_plan_change_v1(u,'scale','monthly',request,null)->>'dispatch','false','completed retry never dispatches') from cases where label='upgrade';

select pg_temp.plan_begin(u) from cases where label in ('ambiguous','failed','unpaid','drift','cancel','atomic');
select fail_paddle_plan_change_v1(u,(select id from billing_operations_v2 where created_by_user_id=u),true) from cases where label='ambiguous';
select is(pg_temp.plan_status(u)->>'operation','ambiguous','uncertain PATCH stays open') from cases where label='ambiguous';
select is(begin_paddle_plan_change_v1(u,'scale','monthly',(select operation_id from billing_operations_v2 where created_by_user_id=u),null)->>'dispatch','false','ambiguous request cannot resend') from cases where label='ambiguous';
select fail_paddle_plan_change_v1(u,(select id from billing_operations_v2 where created_by_user_id=u),false) from cases where label='failed';
select is(pg_temp.plan_status(u)->>'operation','failed','definite failure terminal') from cases where label='failed';
select is(pg_temp.plan_status(u)->>'plan','growth','payment failure preserves source') from cases where label='failed';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'unpaid','subscription.updated','past_due')),'pending','past due cannot grant upgrade') from cases where label='unpaid';
select is(pg_temp.plan_status(u)->>'plan','growth','unpaid webhook preserves plan') from cases where label='unpaid';
select is(pg_temp.lifecycle_dispatch(jsonb_set(pg_temp.plan_observation(u,'drift'),'{items,0,quantity}','2')),'manual_review','unexpected quantity enters review') from cases where label='drift';
select is(pg_temp.plan_status(u)->>'operation','manual_review','drift pins operation') from cases where label='drift';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'cancel')||jsonb_build_object('scheduledChange',jsonb_build_object('action','cancel','effectiveAt','2026-10-20T00:00:00Z'))),'applied','cancellation conflict retains lifecycle cancellation') from cases where label='cancel';
select is(pg_temp.plan_status(u)->>'operation','manual_review','cancellation blocks operation') from cases where label='cancel';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'terminal-cancel','subscription.updated','canceled')),'applied','terminal cancellation still applies with intended target item') from cases where label='cancel';
select is(pg_temp.plan_status(u)->>'status','expired','cancellation expires source without upgrade') from cases where label='cancel';
select is(pg_temp.plan_status(u)->>'plan','growth','cancellation never grants target') from cases where label='cancel';
select throws_ok($$select preview_paddle_plan_change_v1(u,'scale','annual',pg_temp.plan_snapshot(u)) from cases where label='annual'$$,'P0001','BILLING_PLAN_CHANGE_MIXED_DIRECTION_UNSUPPORTED','cadence switch denied');

-- Capacity admission uses the existing reservations, including pending work.
select reserve_account_capacity(a.id,'counted_clients',26,'plan-capacity','operation','operation:'||gen_random_uuid(),null,'pgtap',now()+interval '1 minute')
from cases c join billing_accounts a on a.owner_user_id=c.u where c.label='capacity';
select throws_ok($$select pg_temp.plan_begin(u,'launch') from cases where label='capacity'$$,'P0001','BILLING_PLAN_CHANGE_CAPACITY_BLOCKED','reserved clients block Launch downgrade');
select is((select count(*) from billing_operations_v2 where created_by_user_id=u),0::bigint,'blocked capacity creates no operation') from cases where label='capacity';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'ambiguous-state')),'pending','ambiguous mutation recovers only through verified evidence') from cases where label='ambiguous';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'ambiguous-paid','transaction.completed')),'applied','verified paid ambiguity converges') from cases where label='ambiguous';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'bad-payment-state')),'pending','payment test awaits settlement') from cases where label='atomic';
select is(pg_temp.lifecycle_dispatch(jsonb_set(pg_temp.plan_observation(u,'bad-payment','transaction.completed'),'{paymentTotals,paid}','0')),'manual_review','uncaptured payment cannot approve upgrade') from cases where label='atomic';
select is(pg_temp.plan_status(u)->>'plan','growth','payment drift rolls back canonical transition') from cases where label='atomic';
select is(pg_temp.plan_status(u)->>'payments','0','payment drift creates no payment authority') from cases where label='atomic';

insert into cases(label,u) values('annual-paid',pg_temp.plan_annual_owner());
select ok((begin_paddle_plan_change_v1(u,'scale','annual',request,pg_temp.plan_snapshot(u))->>'dispatch')::boolean,'annual to annual upgrade admitted') from cases where label='annual-paid';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'annual-target')),'pending','annual upgrade awaits payment') from cases where label='annual-paid';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'annual-paid','transaction.completed')),'applied','annual verified payment applies Scale') from cases where label='annual-paid';
select is(pg_temp.plan_status(u)->>'plan','scale','annual Scale canonical') from cases where label='annual-paid';
select ok((begin_paddle_plan_change_v1(u,'growth','annual',gen_random_uuid(),pg_temp.plan_snapshot(u))->>'dispatch')::boolean,'annual downgrade admitted') from cases where label='annual-paid';
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'annual-downgrade')),'applied','annual downgrade scheduled') from cases where label='annual-paid';
select is(pg_temp.plan_status(u)->>'plan','scale','annual downgrade keeps Scale until yearly boundary') from cases where label='annual-paid';
select is((select effective_at::date::text from billing_operations_v2 where created_by_user_id=u and status='scheduled'),'2027-09-20','annual boundary is yearly') from cases where label='annual-paid';

insert into cases(label,u) values('seat-conflict',pg_temp.plan_owner());
insert into billing_operations_v2(operation_id,billing_account_id,subscription_id,provider,environment,source_account_subscription_id,operation_kind,source_base_mapping_id,target_base_mapping_id,source_cadence,target_cadence,source_additional_seats,target_additional_seats,target_seat_mapping_id,target_seat_mapping_kind,effective_timing,status,preflight_snapshot,created_by_user_id)
select gen_random_uuid(),b.billing_account_id,b.id,'paddle','test',b.account_subscription_id,'seat_quantity',billing_paddle_current_mapping_v1(b.id),billing_paddle_current_mapping_v1(b.id),'monthly','monthly',0,1,(select id from billing_price_mappings where canonical_key='coach-seat' and cadence='monthly' and status='active'),'addon','immediate','requested','{"schemaVersion":1,"dimensions":[],"hasAnyDataQualityIssue":false}',c.u
from cases c join billing_accounts a on a.owner_user_id=c.u join billing_subscriptions_v2 b on b.billing_account_id=a.id where c.label='seat-conflict';
select throws_ok($$select pg_temp.plan_begin(u) from cases where label='seat-conflict'$$,'P0001','BILLING_PLAN_CHANGE_ALREADY_PENDING','open seat operation excludes plan change');
select throws_ok($$select paddle_plan_change_context_v1(gen_random_uuid())$$,'P0001','BILLING_PLAN_CHANGE_OWNER_REQUIRED','unprovisioned actor cannot select account');
select throws_ok($$select preview_paddle_plan_change_v1(u,'scale','monthly',jsonb_set(pg_temp.plan_snapshot(u),'{priceRef}','"synthetic/wrong"')) from cases where label='capacity'$$,'P0001','BILLING_PLAN_CHANGE_UNAPPROVED_PROVIDER_STATE','source mapping drift rejected before dispatch');

-- Local clock seam: change only the private clock, inside this rolled-back test.
select pg_temp.plan_begin(u,'growth') from cases where label='upgrade';
insert into events select 'downgrade','subscription',pg_temp.plan_observation(u,'downgrade') from cases where label='upgrade';
select is(pg_temp.lifecycle_dispatch(event),'applied','Scale to Growth scheduled from verified state') from events where label='downgrade';
select is(pg_temp.plan_status(u)->>'operation','scheduled','downgrade durable') from cases where label='upgrade';
select is(pg_temp.plan_status(u)#>>'{entitlements,subscription,planKey}','scale','before boundary retains Scale') from cases where label='upgrade';
select is(pg_temp.plan_status(u)#>>'{entitlements,limits,countedClients}','100','before boundary retains Scale capacity') from cases where label='upgrade';
select is(billing_paddle_scheduled_plan_v1((pg_temp.plan_status(u)->>'canonical')::uuid,'2026-10-20T00:00:00Z'),(select id from commercial_plan_versions where plan_key='growth' and status='active'),'boundary reader selects Growth') from cases where label='upgrade';
create or replace function public.billing_paddle_plan_now_v1() returns timestamptz language sql volatile set search_path=pg_catalog as $$ select '2026-10-20T01:00:00Z'::timestamptz $$;
insert into events select 'boundary','subscription',pg_temp.plan_observation(u,'boundary')||jsonb_build_object('currentBillingPeriod',jsonb_build_object('startsAt','2026-10-20T00:00:00Z','endsAt','2026-11-20T00:00:00Z'),'nextBilledAt','2026-11-20T00:00:00Z') from cases where label='upgrade';
select is(pg_temp.lifecycle_dispatch(event),'pending','boundary persists Growth but renewal still needs payment') from events where label='boundary';
select is((select current_period_ends_at::date::text from account_subscriptions where id=(pg_temp.plan_status(u)->>'canonical')::uuid),'2026-10-20','downgrade alone never extends paid period') from cases where label='upgrade';
insert into events select 'renewal','transaction',pg_temp.plan_observation(u,'renewal','transaction.completed')||jsonb_build_object('origin','subscription_recurring','billingPeriod',jsonb_build_object('startsAt','2026-10-20T00:00:00Z','endsAt','2026-11-20T00:00:00Z')) from cases where label='upgrade';
select is(pg_temp.lifecycle_dispatch(event),'applied','existing renewal proof follows changed mapping') from events where label='renewal';
select is(pg_temp.plan_status(u)->>'plan','growth','target mapping now authoritative') from cases where label='upgrade';
select is(pg_temp.plan_status(u)->>'payments','1','downgrade adds no upgrade payment') from cases where label='upgrade';
select is(pg_temp.lifecycle_dispatch(event),'reused','boundary duplicate applied once') from events where label='boundary';
select is(pg_temp.lifecycle_dispatch(event),'reused','stale prior plan event cannot restore Scale') from events where label='upgrade';
select is(pg_temp.lifecycle_dispatch(event||jsonb_build_object('eventRef',event->>'eventRef'||'/late','notificationRef',event->>'notificationRef'||'/late')),'manual_review','new delivery of stale old plan cannot reapply') from events where label='upgrade' and kind='subscription';
select is(pg_temp.plan_status(u)->>'plan','growth','stale old plan leaves Growth authoritative') from cases where label='upgrade';
select is((select count(*) from account_subscriptions where billing_account_id=(select id from billing_accounts where owner_user_id=u) and status='active'),1::bigint,'exactly one active canonical') from cases where label='upgrade';
create or replace function public.billing_paddle_plan_now_v1() returns timestamptz language sql volatile set search_path=pg_catalog as $$ select clock_timestamp() $$;

select ok(not has_function_privilege('anon','begin_paddle_plan_change_v1(uuid,text,text,uuid,jsonb)','execute'),'anonymous mutation denied');
select ok(not has_function_privilege('authenticated','begin_paddle_plan_change_v1(uuid,text,text,uuid,jsonb)','execute'),'browser mutation denied');
select ok(has_function_privilege('service_role','begin_paddle_plan_change_v1(uuid,text,text,uuid,jsonb)','execute'),'service mutation allowed');
select ok(not has_function_privilege('service_role','billing_paddle_plan_facts_v1(uuid,uuid,uuid)','execute'),'proof helper private');
select ok(not has_table_privilege('authenticated','billing_operations_v2','insert'),'browser ledger private');
select ok(not has_table_privilege('service_role','billing_payment_applications_v2','insert'),'payment ledger private');
select * from finish();rollback;
