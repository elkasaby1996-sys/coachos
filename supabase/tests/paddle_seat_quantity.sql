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
\ir fixtures/paddle_seat_fixture.psql
create temp table seat_cases(label text,u uuid,op uuid default gen_random_uuid(),before jsonb);
insert into seat_cases(label,u) select x,pg_temp.plan_owner() from unnest(array['increase','reverse','reduce','remove','failed','ambiguous','conflict','annual','lifecycle','usage','reservation','permissions']) x where x<>'annual';
insert into seat_cases(label,u) values('annual',pg_temp.plan_annual_owner());
update seat_cases set before=pg_temp.paddle_seat_counts(u);
select is(pg_temp.paddle_seat_begin(u,1,op)->>'dispatch','true','durable increase dispatch') from seat_cases where label='increase';
select is(begin_paddle_seat_quantity_v1(u,1,op,null)->>'dispatch','false','exact retry cannot redispatch') from seat_cases where label='increase';
select throws_ok($$select begin_paddle_seat_quantity_v1(u,2,op,null) from seat_cases where label='increase'$$,'P0001','BILLING_SEAT_QUANTITY_OPERATION_CONFLICT','changed target conflicts');
select throws_ok($$select pg_temp.plan_begin(u) from seat_cases where label='increase'$$,'P0001','BILLING_PLAN_CHANGE_ALREADY_PENDING','seat excludes plan');
select is(pg_temp.paddle_seat_counts(u)->>'approved','0','dispatch grants no capacity') from seat_cases where label='increase';
create temp table seat_events(label text,o jsonb);
insert into seat_events select 'sub',pg_temp.paddle_seat_observation(u,'sub') from seat_cases where label='increase';
select is(pg_temp.lifecycle_dispatch(o),'pending','subscription alone awaits payment') from seat_events where label='sub';
select is(pg_temp.paddle_seat_counts(u)->>'approved','0','unpaid target grants no capacity') from seat_cases where label='increase';
insert into seat_events select 'pay',pg_temp.paddle_seat_observation(u,'pay','transaction.completed') from seat_cases where label='increase';
select is(pg_temp.lifecycle_dispatch(o),'applied','verified seat settlement applied') from seat_events where label='pay';
select is(pg_temp.lifecycle_dispatch(o),'reused','duplicate payment idempotent') from seat_events where label='pay';
select is(pg_temp.paddle_seat_counts(u)->>'approved','1','approved seat granted') from seat_cases where label='increase';
select is(pg_temp.paddle_seat_counts(u)->>'capacity','3','Growth capacity three') from seat_cases where label='increase';
select is(pg_temp.paddle_seat_counts(u)->>'payments','1','one seat payment') from seat_cases where label='increase';
select is(pg_temp.paddle_seat_counts(u)->'canonical',before->'canonical','canonical row retained') from seat_cases where label='increase';
select is(pg_temp.paddle_seat_counts(u)->'shadow',before->'shadow','provider shadow retained') from seat_cases where label='increase';
select is(pg_temp.paddle_seat_buy(u,3),'applied','one to maximum three') from seat_cases where label='increase';
select is(pg_temp.paddle_seat_counts(u)->>'capacity','5','Growth maximum total five') from seat_cases where label='increase';
select set_config('request.jwt.claim.sub',u::text,true) from seat_cases where label='increase';
set local role authenticated;
select is(get_my_billing_seat_quantity_state()#>>'{summary,currentAdditionalSeats}','3','owner reader exposes verified approval');
select is(get_my_billing_seat_quantity_state()#>>'{summary,currentEffectiveLimit}','5','owner reader uses effective capacity');
select is(get_my_billing_seat_quantity_state()->>'canCancel','false','Paddle cancellation unsupported');
select ok(not (get_my_billing_seat_quantity_state() ?| array['subscriptionRef','customerRef','accountId','baseMappingId','seatMappingId']),'owner reader does not expose private authority');
reset role;

select throws_ok($$select pg_temp.paddle_seat_begin(u,4) from seat_cases where label='increase'$$,'P0001','BILLING_SEAT_QUANTITY_TARGET_INVALID','over plan maximum');
select throws_ok($$select pg_temp.plan_begin(u) from seat_cases where label='increase'$$,'P0001','BILLING_PLAN_CHANGE_NOT_ELIGIBLE','plans with extras remain blocked');
select pg_temp.paddle_seat_begin(u,1) from seat_cases where label='reverse';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'payment-first','transaction.completed')),'pending','payment alone pends') from seat_cases where label='reverse';
select is(pg_temp.paddle_seat_counts(u)->>'approved','0','payment alone grants nothing') from seat_cases where label='reverse';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'subscription-second')),'applied','reverse arrival converges') from seat_cases where label='reverse';
select is(pg_temp.paddle_seat_buy(u,1),'applied','annual additional-seat settlement') from seat_cases where label='annual';
select pg_temp.paddle_seat_begin(u,1,op) from seat_cases where label in ('failed','ambiguous');
select fail_paddle_seat_quantity_v1(u,(select id from billing_operations_v2 where operation_id=op),label='ambiguous') from seat_cases where label in ('failed','ambiguous');
select is(begin_paddle_seat_quantity_v1(u,1,op,null)->>'dispatch','false','failed/ambiguous intent cannot redispatch') from seat_cases where label in ('failed','ambiguous');
select is(pg_temp.paddle_seat_counts(u)->>'approved','0','failure retains source capacity') from seat_cases where label in ('failed','ambiguous');
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'amb-sub')),'pending','ambiguous may converge from evidence') from seat_cases where label='ambiguous';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'amb-pay','transaction.completed')),'applied','ambiguous paid evidence completes') from seat_cases where label='ambiguous';
select pg_temp.plan_begin(u) from seat_cases where label='conflict';
select throws_ok($$select pg_temp.paddle_seat_begin(u,1) from seat_cases where label='conflict'$$,'P0001','BILLING_SEAT_QUANTITY_OPERATION_CONFLICT','plan excludes seats');
select is(pg_temp.paddle_seat_buy(u,2),'applied','seed reduction approval') from seat_cases where label in ('reduce','remove');
select pg_temp.paddle_seat_begin(u,case label when 'reduce' then 1 else 0 end) from seat_cases where label in ('reduce','remove');
select is(pg_temp.paddle_seat_counts(u)->>'capacity','4','reduction request retains current capacity') from seat_cases where label in ('reduce','remove');
select is(pg_temp.paddle_seat_counts(u)->>'growth',case label when 'reduce' then '3' else '2' end,'lower admission ceiling immediately') from seat_cases where label in ('reduce','remove');
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'scheduled')),'applied','authenticated reduction schedules') from seat_cases where label in ('reduce','remove');
select is(pg_temp.paddle_seat_counts(u)->>'operation','scheduled','reduction remains open') from seat_cases where label in ('reduce','remove');
select is(pg_temp.paddle_seat_counts(u)->>'approved','2','preboundary approved count retained') from seat_cases where label in ('reduce','remove');
select is(pg_temp.paddle_seat_counts(u)->>'payments','1','no reduction payment application') from seat_cases where label in ('reduce','remove');
select throws_ok($$update billing_subscriptions_v2 set approved_additional_coach_seats=1 where provider_subscription_ref=(select 'synthetic/sub/'||u from seat_cases where label='permissions')$$,'P0001',null,'direct seat mutation rejected');
select ok(not has_function_privilege('authenticated','begin_paddle_seat_quantity_v1(uuid,integer,uuid,jsonb)','execute'),'private command denied to browser');
select ok(not has_function_privilege('service_role','billing_paddle_seat_facts_v1(uuid,uuid,uuid)','execute'),'private evidence helper denied to service');
select ok(not has_table_privilege('authenticated','billing_operations_v2','insert'),'browser cannot insert operations');
select throws_ok($$select paddle_seat_quantity_context_v1(gen_random_uuid(),1)$$,'42501','BILLING_SEAT_QUANTITY_OWNER_REQUIRED','unknown owner rejected');
-- Independent hostile settlement cases retain source authority.
create temp table seat_bad(label text,u uuid,op uuid default gen_random_uuid());
insert into seat_bad(label,u) select x,pg_temp.plan_owner() from unnest(array['negative','magnitude','quantity','extra-item','missing-payment','zero-total','partial','balance','wrong-customer','wrong-subscription','wrong-operation','wrong-cadence','wrong-price','old-payment','wrong-origin','plan-correlation']) x;
select pg_temp.paddle_seat_begin(u,1,op) from seat_bad;
select pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'bad-sub')) from seat_bad;
create temp table bad_events as select label,u,pg_temp.paddle_seat_observation(u,'bad-tx','transaction.completed') o from seat_bad;
update bad_events set o=case label
 when 'negative' then jsonb_set(o,'{items,0,quantity}','-1')
 when 'magnitude' then jsonb_set(o,'{items,0,quantity}','2')
 when 'quantity' then jsonb_set(o,'{items,0,quantity}','0')
 when 'extra-item' then jsonb_set(o,'{items}',(o->'items')||(o->'items'))
 when 'missing-payment' then o-'paymentTotals'
 when 'zero-total' then jsonb_set(o,'{paymentTotals,total}','0')
 when 'partial' then jsonb_set(o,'{paymentTotals,paid}','1199')
 when 'balance' then jsonb_set(o,'{paymentTotals,balance}','1')
 when 'wrong-customer' then o||'{"customerRef":"synthetic/wrong-customer"}'
 when 'wrong-subscription' then o||'{"subscriptionRef":"synthetic/wrong-subscription"}'
 when 'wrong-operation' then o||jsonb_build_object('seatQuantityOperationId',gen_random_uuid())
 when 'wrong-cadence' then jsonb_set(o,'{items,0,priceRef}',to_jsonb((select provider_price_ref::text from billing_price_mappings where canonical_key='coach-seat' and cadence='annual' and status='active')))
 when 'wrong-price' then jsonb_set(o,'{items,0,priceRef}','"synthetic/unknown-price"')
 when 'old-payment' then o||'{"occurredAt":"2026-09-20T01:00:00Z"}'
 when 'wrong-origin' then o||'{"origin":"subscription_recurring"}'
 when 'plan-correlation' then (o-'seatQuantityOperationId')||jsonb_build_object('planChangeOperationId',(select op from seat_bad where seat_bad.u=bad_events.u)) end;
select isnt(pg_temp.paddle_seat_attempt(o),'applied','reject '||label) from bad_events;
select is(pg_temp.paddle_seat_counts(u)->>'approved','0','source retained for '||label) from seat_bad;
select is(pg_temp.paddle_seat_counts(u)->>'payments','0','no application for '||label) from seat_bad;
-- Nonzero-source proration must match both signed magnitudes independently.
create temp table signed_cases(label text,u uuid);
insert into signed_cases select x,pg_temp.plan_owner() from unnest(array['both-negative','wrong-credit','net-delta']) x;
select pg_temp.paddle_seat_buy(u,1) from signed_cases;
select pg_temp.paddle_seat_begin(u,2) from signed_cases;
select pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'signed-sub')) from signed_cases;
select isnt(pg_temp.paddle_seat_attempt(case label
 when 'both-negative' then jsonb_set(pg_temp.paddle_seat_observation(u,'signed-pay','transaction.completed'),'{items,0,quantity}','-2')
 when 'wrong-credit' then jsonb_set(pg_temp.paddle_seat_observation(u,'signed-pay','transaction.completed'),'{items,1,quantity}','-2')
 else jsonb_set(pg_temp.paddle_seat_observation(u,'signed-pay','transaction.completed'),'{items}',jsonb_build_array(jsonb_set(pg_temp.paddle_seat_observation(u,'signed-pay','transaction.completed')#>'{items,0}','{quantity}','1'))) end),'applied','reject nonzero source '||label) from signed_cases;
select is(pg_temp.paddle_seat_counts(u)->>'approved','1','paid source retained for '||label) from signed_cases;
select is(pg_temp.paddle_seat_counts(u)->>'payments','1','no second authority for '||label) from signed_cases;
-- Every non-admissible operation status is rejected by the authority function.
create temp table terminal_cases(label text,u uuid,op uuid default gen_random_uuid());
insert into terminal_cases(label,u) select x,pg_temp.plan_owner() from unnest(array['requested','cancel_pending','scheduled','failed','canceled','manual_review']) x;
select pg_temp.paddle_seat_begin(u,1,op) from terminal_cases;
create temp table terminal_events as select c.label,c.u,o.id,pg_temp.lifecycle_ingest(pg_temp.paddle_seat_observation(c.u,'terminal-sub')) ev from terminal_cases c join billing_operations_v2 o on o.operation_id=c.op;
update billing_operations_v2 o set status=c.label,failed_at=case when c.label='failed' then clock_timestamp() end,canceled_at=case when c.label='canceled' then clock_timestamp() end from terminal_cases c where o.operation_id=c.op;
select throws_ok(format('select billing_paddle_seat_facts_v1(%L,%L)',id,ev),'P0001','PADDLE_SEAT_IDENTITY','non-admissible '||label) from terminal_events;
select throws_ok(format('select billing_paddle_seat_facts_v1(%L,%L)',op.id,(select event_id from billing_evidence_v2 where id=op.last_evidence_id)),'P0001','PADDLE_SEAT_IDENTITY','completed operation cannot settle again') from billing_operations_v2 op join seat_cases c on c.u=op.created_by_user_id where c.label='increase' and op.status='completed';
-- A second transaction cannot consume a completed operation's payment authority.
select isnt(pg_temp.paddle_seat_attempt(pg_temp.paddle_seat_observation(u,'second-payment','transaction.completed')),'applied','new payment cannot reapply completed intent') from seat_cases where label='reverse';
select is(pg_temp.paddle_seat_counts(u)->>'payments','1','completed intent still exactly one payment') from seat_cases where label='reverse';
-- A new operation cannot reuse the previous seat purchase's provider transaction.
select pg_temp.paddle_seat_begin(u,2) from seat_cases where label='reverse';
select pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'duplicate-tx-sub')) from seat_cases where label='reverse';
select isnt(pg_temp.paddle_seat_attempt(pg_temp.paddle_seat_observation(u,'duplicate-tx-pay','transaction.completed')||jsonb_build_object('transactionRef',(select provider_transaction_ref from billing_payment_applications_v2 where application_kind='seat_increase' and subscription_id=(select id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/'||u)))),'applied','provider transaction cannot pay two operations') from seat_cases where label='reverse';
select is(pg_temp.paddle_seat_counts(u)->>'approved','1','reused transaction grants no additional approval') from seat_cases where label='reverse';
select is(pg_temp.paddle_seat_counts(u)->>'payments','1','unique provider transaction still one application') from seat_cases where label='reverse';
-- Canonical admissions count active identities, pending invitations and reservations.
insert into seat_cases(label,u) values('pending-usage',pg_temp.plan_owner());
select pg_temp.paddle_seat_buy(u,3) from seat_cases where label in ('usage','pending-usage','reservation');
insert into workspaces(id,owner_user_id,name) select gen_random_uuid(),u,'Synthetic seat workspace' from seat_cases where label in ('usage','pending-usage');
insert into auth.users(id,email) select gen_random_uuid(),'paddle-seat-member-'||i||'@example.test' from generate_series(1,2)i;
insert into workspace_members(workspace_id,user_id,role,status) select w.id,a.id,'coach','active' from workspaces w join seat_cases c on c.u=w.owner_user_id cross join auth.users a where c.label='usage' and a.email like 'paddle-seat-member-%';
insert into workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at)
 select w.id,'paddle-seat-pending-'||i||'@example.test','coach','paddle-seat-pending-'||i,'pending',c.u,now()+interval '1 day'
 from workspaces w join seat_cases c on c.u=w.owner_user_id cross join generate_series(1,2)i where c.label='pending-usage';
select reserve_account_capacity(a.id,'coach_seats',3,'paddle-seat-reserved','operation','operation:'||gen_random_uuid(),null,'pgtap',now()+interval '1 minute') from billing_accounts a join seat_cases c on c.u=a.owner_user_id where c.label='reservation';
select throws_ok(format('select pg_temp.paddle_seat_begin(%L,0)',u),'P0001','BILLING_SEAT_QUANTITY_CAPACITY_BLOCKED',label||' blocks decrease') from seat_cases where label in ('usage','pending-usage','reservation');
select is(pg_temp.paddle_seat_buy(u,1),'applied','lifecycle seed approved add-on') from seat_cases where label='lifecycle';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'normal-update')),'applied','normal update preserves add-on') from seat_cases where label='lifecycle';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'past-due','subscription.updated','past_due')),'applied','past due handles approved add-on') from seat_cases where label='lifecycle';
select is(pg_temp.paddle_seat_counts(u)->>'approved','1','degradation does not invent seat removal') from seat_cases where label='lifecycle';

-- Review blocks payment authority but must not suppress authenticated access degradation.
insert into seat_cases(label,u) values('review-degradation',pg_temp.plan_owner());
select pg_temp.paddle_seat_buy(u,1) from seat_cases where label='review-degradation';
select pg_temp.paddle_seat_begin(u,2) from seat_cases where label='review-degradation';
select pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'review-sub')) from seat_cases where label='review-degradation';
select is(pg_temp.paddle_seat_attempt(jsonb_set(pg_temp.paddle_seat_observation(u,'review-bad-payment','transaction.completed'),'{paymentTotals,balance}','1')),'manual_review','invalid settlement enters review') from seat_cases where label='review-degradation';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'review-past-due','subscription.updated','past_due')),'applied','review allows authenticated past due') from seat_cases where label='review-degradation';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'review-canceled','subscription.updated','canceled')),'applied','review allows authenticated expiration') from seat_cases where label='review-degradation';
select is(pg_temp.paddle_seat_counts(u)->>'approved','1','review degradation cannot grant dispatched extra') from seat_cases where label='review-degradation';
select is(pg_temp.paddle_seat_counts(u)->>'payments','1','review degradation cannot fabricate payment') from seat_cases where label='review-degradation';
select is(pg_temp.lifecycle_counts(u)->>'status','expired','review does not suppress canonical expiry') from seat_cases where label='review-degradation';

-- Deterministic local boundary simulation, not real-provider certification.
create or replace function public.billing_paddle_plan_now_v1() returns timestamptz language sql volatile set search_path=pg_catalog as $$select '2026-10-20T01:00:00Z'::timestamptz$$;
select is(pg_temp.paddle_seat_counts(u)->>'approved','2','wall clock alone does not complete reduction') from seat_cases where label in ('reduce','remove');
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'renew-sub','subscription.updated','active',true)),'pending','new period requires renewal payment') from seat_cases where label in ('reduce','remove');
create temp table boundary_pay as select u,pg_temp.paddle_seat_observation(u,'renew-pay','transaction.completed','active',true) o from seat_cases where label in ('reduce','remove');
select is(pg_temp.lifecycle_dispatch(o),'applied','authenticated renewal applies reduction') from boundary_pay;
select is(pg_temp.lifecycle_dispatch(o),'reused','duplicate boundary event applies once') from boundary_pay;
select is(pg_temp.paddle_seat_counts(u)->>'approved',case label when 'reduce' then '1' else '0' end,'boundary target approved once') from seat_cases where label in ('reduce','remove');
select is(pg_temp.paddle_seat_counts(u)->>'operation','completed','boundary closes operation') from seat_cases where label in ('reduce','remove');
select is(pg_temp.paddle_seat_counts(u)->>'payments','1','renewal is not a seat-increase application') from seat_cases where label in ('reduce','remove');
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'lifecycle-renew-sub','subscription.updated','active',true)),'pending','approved add-on renewal awaits payment') from seat_cases where label='lifecycle';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'lifecycle-renew-pay','transaction.completed','active',true)),'applied','approved add-on renewal reconciles') from seat_cases where label='lifecycle';
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'lifecycle-expire','subscription.updated','canceled',true)),'applied','cancellation and expiration support add-on') from seat_cases where label='lifecycle';
select is(pg_temp.lifecycle_counts(u)->>'status','expired','canonical expires without new subscription') from seat_cases where label='lifecycle';
select * from finish();rollback;
