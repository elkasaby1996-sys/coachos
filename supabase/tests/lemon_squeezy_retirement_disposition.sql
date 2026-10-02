begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(178);
select is(inspect_lemon_squeezy_retirement_disposition_v1(now())->>'safeToRetire','true','no LS history is safe');
select is(inspect_lemon_squeezy_retirement_disposition_v1(null)->>'safeToRetire','false','missing inspection time fails closed');
select is(inspect_lemon_squeezy_retirement_disposition_v1('infinity')->>'safeToRetire','false','infinite inspection time fails closed');
select ok(not has_function_privilege('anon','inspect_lemon_squeezy_retirement_disposition_v1(timestamptz)','execute'),'anon cannot inspect');
select ok(not has_function_privilege('authenticated','inspect_lemon_squeezy_retirement_disposition_v1(timestamptz)','execute'),'authenticated cannot inspect');
select ok(has_function_privilege('service_role','inspect_lemon_squeezy_retirement_disposition_v1(timestamptz)','execute'),'service can inspect');
select is((select provolatile::text from pg_proc where oid='inspect_lemon_squeezy_retirement_disposition_v1(timestamptz)'::regprocedure),'s','inspection is STABLE');
select is((select proconfig::text from pg_proc where oid='inspect_lemon_squeezy_retirement_disposition_v1(timestamptz)'::regprocedure),'{search_path=pg_catalog}','fixed trusted search path');
set local role authenticated;
select throws_ok($q$select public.inspect_lemon_squeezy_retirement_disposition_v1(now())$q$,'42501',null,'actual browser invocation denied');
reset role;
savepoint empty_history;
\ir fixtures/lemon_squeezy_retirement_history.psql
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal LS population is safe');
select is(pg_temp.retirement_report()->'outcomes','["SAFE_TO_RETIRE"]'::jsonb,'safe has one outcome');
select is((select sum(value::bigint)::text from jsonb_each_text(pg_temp.retirement_report()->'blockers')),'0','all ten history blocker counts zero');
select is((select count(*)::integer from billing_plan_change_operations where status='completed'),1,'completed plan retained');
select is((select count(*)::integer from billing_seat_quantity_operations where status='completed'),1,'completed seat retained');
select is((select count(*)::integer from billing_provider_subscriptions where provider_status='cancelled'),1,'cancelled history retained');
create temp table retirement_history_digest as select md5(jsonb_agg(to_jsonb(s) order by id)::text) digest from billing_provider_subscriptions s;
set local role service_role;
select is(public.inspect_lemon_squeezy_retirement_disposition_v1(now())->>'safeToRetire','true','service sees private history through gate');
reset role;
select is(pg_temp.retirement_report(),pg_temp.retirement_report(),'same state and time produce identical report');
select is((select md5(jsonb_agg(to_jsonb(s) order by id)::text) from billing_provider_subscriptions s),(select digest from retirement_history_digest),'inspection preserves identity and snapshot hashes');
select is((select count(*)::integer from jsonb_object_keys(pg_temp.retirement_report())),5,'only five allowlisted report keys');
select ok(pg_temp.retirement_report()::text !~ 'synthetic|example.test|https|customer|payload|subscription_id','no identifiers or payloads in report');
savepoint retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update billing_provider_subscriptions set provider_status='active',provider_cancelled=('active'='cancelled'),provider_ends_at=now()+interval '30 days' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','1','nonterminal provider/canonical combination: active');
select is(pg_temp.retirement_report()#>>'{blockers,canonicalConflicts}','1','LS remains canonical authority');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update billing_provider_subscriptions set provider_status='paused',provider_cancelled=('paused'='cancelled'),provider_ends_at=now()+interval '30 days' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','1','nonterminal provider/canonical combination: paused');
select is(pg_temp.retirement_report()#>>'{blockers,canonicalConflicts}','1','LS remains canonical authority');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update billing_provider_subscriptions set provider_status='past_due',provider_cancelled=('past_due'='cancelled'),provider_ends_at=now()+interval '30 days' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','1','nonterminal provider/canonical combination: past_due');
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','current debt independently blocks');
select is(pg_temp.retirement_report()#>>'{blockers,canonicalConflicts}','1','LS remains canonical authority');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update billing_provider_subscriptions set provider_status='unpaid',provider_cancelled=('unpaid'='cancelled'),provider_ends_at=now()+interval '30 days' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','1','nonterminal provider/canonical combination: unpaid');
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','current debt independently blocks');
select is(pg_temp.retirement_report()#>>'{blockers,canonicalConflicts}','1','LS remains canonical authority');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update billing_provider_subscriptions set provider_status='cancelled',provider_cancelled=('cancelled'='cancelled'),provider_ends_at=now()+interval '30 days' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','1','nonterminal provider/canonical combination: cancelled');
select is(pg_temp.retirement_report()#>>'{blockers,canonicalConflicts}','1','LS remains canonical authority');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update billing_provider_subscriptions set provider_status='expired',provider_cancelled=('expired'='cancelled'),provider_ends_at=now()+interval '30 days' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','1','nonterminal provider/canonical combination: expired');
select is(pg_temp.retirement_report()#>>'{blockers,canonicalConflicts}','1','LS remains canonical authority');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update account_subscriptions set status='past_due',restricted_at=case when 'past_due'='restricted' then now() end,status_changed_at=now() where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','canonical debt: past_due');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update account_subscriptions set status='grace',restricted_at=case when 'grace'='restricted' then now() end,status_changed_at=now() where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','canonical debt: grace');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
update account_subscriptions set status='restricted',restricted_at=case when 'restricted'='restricted' then now() end,status_changed_at=now() where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','canonical debt: restricted');
rollback to retirement_case;
update billing_provider_subscriptions set reconciliation_status='manual_review',reconciliation_error_code='BILLING_RECONCILIATION_MANUAL_REVIEW' where billing_account_id=(select b.id from billing_accounts b join actors a on a.id=b.owner_user_id where a.name='terminal-cancelled');
select is(pg_temp.retirement_report()#>>'{blockers,manualReview}','1','review cannot age away on terminal subscription');
rollback to retirement_case;
update billing_checkout_attempts set status='creating',provider_checkout_url=null,provider_checkout_id='synthetic-retired-checkout',error_code=null,
 completed_at=case when 'creating'='completed' then now() end,failed_at=case when 'creating'='failed' then now() end,
 expired_at=case when 'creating'='expired' then now() end,completed_provider_subscription_id=case when 'creating'='completed' then
 (select provider_subscription_id from billing_provider_subscriptions where billing_account_id=billing_checkout_attempts.billing_account_id) end;
select is(pg_temp.retirement_report()#>>'{blockers,checkouts}','1','checkout creating classification');
select is(pg_temp.retirement_report()#>>'{blockers,ambiguousDispatches}','1','expired lease/cleanup never resolves unknown dispatch');
rollback to retirement_case;
update billing_checkout_attempts set status='ready',provider_checkout_url='https://synthetic.lemonsqueezy.com/checkout/synthetic',provider_checkout_id='synthetic-retired-checkout',error_code=null,
 completed_at=case when 'ready'='completed' then now() end,failed_at=case when 'ready'='failed' then now() end,
 expired_at=case when 'ready'='expired' then now() end,completed_provider_subscription_id=case when 'ready'='completed' then
 (select provider_subscription_id from billing_provider_subscriptions where billing_account_id=billing_checkout_attempts.billing_account_id) end;
select is(pg_temp.retirement_report()#>>'{blockers,checkouts}','1','checkout ready classification');
rollback to retirement_case;
update billing_checkout_attempts set status='ambiguous',provider_checkout_url=null,provider_checkout_id='synthetic-retired-checkout',error_code=null,
 completed_at=case when 'ambiguous'='completed' then now() end,failed_at=case when 'ambiguous'='failed' then now() end,
 expired_at=case when 'ambiguous'='expired' then now() end,completed_provider_subscription_id=case when 'ambiguous'='completed' then
 (select provider_subscription_id from billing_provider_subscriptions where billing_account_id=billing_checkout_attempts.billing_account_id) end;
select is(pg_temp.retirement_report()#>>'{blockers,checkouts}','1','checkout ambiguous classification');
select is(pg_temp.retirement_report()#>>'{blockers,ambiguousDispatches}','1','expired lease/cleanup never resolves unknown dispatch');
rollback to retirement_case;
update billing_checkout_attempts set status='expired',provider_checkout_url=null,provider_checkout_id=null,error_code='BILLING_CHECKOUT_EXPIRED',
 completed_at=case when 'expired'='completed' then now() end,failed_at=case when 'expired'='failed' then now() end,
 expired_at=case when 'expired'='expired' then now() end,completed_provider_subscription_id=case when 'expired'='completed' then
 (select provider_subscription_id from billing_provider_subscriptions where billing_account_id=billing_checkout_attempts.billing_account_id) end;
select is(pg_temp.retirement_report()#>>'{blockers,checkouts}','1','checkout expired classification');
select is(pg_temp.retirement_report()#>>'{blockers,ambiguousDispatches}','1','expired lease/cleanup never resolves unknown dispatch');
rollback to retirement_case;
update billing_checkout_attempts set status='completed',provider_checkout_url=null,provider_checkout_id='synthetic-retired-checkout',error_code=null,
 completed_at=case when 'completed'='completed' then now() end,failed_at=case when 'completed'='failed' then now() end,
 expired_at=case when 'completed'='expired' then now() end,completed_provider_subscription_id=case when 'completed'='completed' then
 (select provider_subscription_id from billing_provider_subscriptions where billing_account_id=billing_checkout_attempts.billing_account_id) end;
select is(pg_temp.retirement_report()#>>'{blockers,checkouts}','0','checkout completed classification');
rollback to retirement_case;
update billing_checkout_attempts set status='failed',provider_checkout_url=null,provider_checkout_id=null,error_code='BILLING_CHECKOUT_CREATION_FAILED',
 completed_at=case when 'failed'='completed' then now() end,failed_at=case when 'failed'='failed' then now() end,
 expired_at=case when 'failed'='expired' then now() end,completed_provider_subscription_id=case when 'failed'='completed' then
 (select provider_subscription_id from billing_provider_subscriptions where billing_account_id=billing_checkout_attempts.billing_account_id) end;
select is(pg_temp.retirement_report()#>>'{blockers,checkouts}','0','checkout failed classification');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='requested',completed_at=case when 'requested'='completed' then now() end,canceled_at=case when 'requested'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'requested'='completed' then now() end,error_code=null,failed_at=case when 'requested'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','1','plan operation requested');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='provider_pending',completed_at=case when 'provider_pending'='completed' then now() end,canceled_at=case when 'provider_pending'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'provider_pending'='completed' then now() end,error_code=null,failed_at=case when 'provider_pending'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','1','plan operation provider_pending');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='awaiting_payment',completed_at=case when 'awaiting_payment'='completed' then now() end,canceled_at=case when 'awaiting_payment'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'awaiting_payment'='completed' then now() end,error_code=null,failed_at=case when 'awaiting_payment'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','1','plan operation awaiting_payment');
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','awaiting payment is independently debt');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='scheduled',completed_at=case when 'scheduled'='completed' then now() end,canceled_at=case when 'scheduled'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'scheduled'='completed' then now() end,error_code=null,failed_at=case when 'scheduled'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','1','plan operation scheduled');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='cancel_pending',completed_at=case when 'cancel_pending'='completed' then now() end,canceled_at=case when 'cancel_pending'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'cancel_pending'='completed' then now() end,error_code=null,failed_at=case when 'cancel_pending'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','1','plan operation cancel_pending');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='completed',completed_at=case when 'completed'='completed' then now() end,canceled_at=case when 'completed'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'completed'='completed' then now() end,error_code=null,failed_at=case when 'completed'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','0','plan operation completed');
select pg_temp.retirement_close(u) from current_actor;
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal operation plus ended subscription is history');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='canceled',completed_at=case when 'canceled'='completed' then now() end,canceled_at=case when 'canceled'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'canceled'='completed' then now() end,error_code=null,failed_at=case when 'canceled'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','0','plan operation canceled');
select pg_temp.retirement_close(u) from current_actor;
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal operation plus ended subscription is history');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='failed',completed_at=case when 'failed'='completed' then now() end,canceled_at=case when 'failed'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'failed'='completed' then now() end,error_code=null,failed_at=case when 'failed'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','0','plan operation failed');
select pg_temp.retirement_close(u) from current_actor;
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal operation plus ended subscription is history');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='ambiguous',completed_at=case when 'ambiguous'='completed' then now() end,canceled_at=case when 'ambiguous'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'ambiguous'='completed' then now() end,error_code=null,failed_at=case when 'ambiguous'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','1','plan operation ambiguous');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='manual_review',completed_at=case when 'manual_review'='completed' then now() end,canceled_at=case when 'manual_review'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'manual_review'='completed' then now() end,error_code=null,failed_at=case when 'manual_review'='failed' then now() end where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','1','plan operation manual_review');
select is(pg_temp.retirement_report()#>>'{blockers,manualReview}','1','operation review independently blocks');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='requested',completed_at=case when 'requested'='completed' then now() end,canceled_at=case when 'requested'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'requested'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','1','seat operation requested');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='provider_pending',completed_at=case when 'provider_pending'='completed' then now() end,canceled_at=case when 'provider_pending'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'provider_pending'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','1','seat operation provider_pending');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='awaiting_payment',completed_at=case when 'awaiting_payment'='completed' then now() end,canceled_at=case when 'awaiting_payment'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'awaiting_payment'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','1','seat operation awaiting_payment');
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','awaiting payment is independently debt');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='scheduled',completed_at=case when 'scheduled'='completed' then now() end,canceled_at=case when 'scheduled'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'scheduled'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','1','seat operation scheduled');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='cancel_pending',completed_at=case when 'cancel_pending'='completed' then now() end,canceled_at=case when 'cancel_pending'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'cancel_pending'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','1','seat operation cancel_pending');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='completed',completed_at=case when 'completed'='completed' then now() end,canceled_at=case when 'completed'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'completed'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','0','seat operation completed');
select pg_temp.retirement_close(u) from current_actor;
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal operation plus ended subscription is history');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='canceled',completed_at=case when 'canceled'='completed' then now() end,canceled_at=case when 'canceled'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'canceled'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','0','seat operation canceled');
select pg_temp.retirement_close(u) from current_actor;
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal operation plus ended subscription is history');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='failed',completed_at=case when 'failed'='completed' then now() end,canceled_at=case when 'failed'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'failed'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','0','seat operation failed');
select pg_temp.retirement_close(u) from current_actor;
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal operation plus ended subscription is history');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='ambiguous',completed_at=case when 'ambiguous'='completed' then now() end,canceled_at=case when 'ambiguous'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'ambiguous'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','1','seat operation ambiguous');
rollback to retirement_case;
select pg_temp.coach('growth') as u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
update billing_seat_quantity_operations set status='manual_review',completed_at=case when 'manual_review'='completed' then now() end,canceled_at=case when 'manual_review'='canceled' then now() end,provider_applied_at=now(),payment_confirmed_at=case when 'manual_review'='completed' then now() end,error_code=null where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','1','seat operation manual_review');
select is(pg_temp.retirement_report()#>>'{blockers,manualReview}','1','operation review independently blocks');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='received',processed_at=case when 'received' in ('processed','ignored') then now() end,last_error_code=null where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,webhookWork}','1','webhook received drain rule');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='deferred',processed_at=case when 'deferred' in ('processed','ignored') then now() end,last_error_code=null where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,webhookWork}','1','webhook deferred drain rule');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='failed',processed_at=case when 'failed' in ('processed','ignored') then now() end,last_error_code=null where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,webhookWork}','1','webhook failed drain rule');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='processed',processed_at=case when 'processed' in ('processed','ignored') then now() end,last_error_code=null where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,webhookWork}','0','webhook processed drain rule');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='ignored',processed_at=case when 'ignored' in ('processed','ignored') then now() end,last_error_code=null where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,webhookWork}','0','webhook ignored drain rule');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='ignored',last_error_code='BILLING_WEBHOOK_UNSUPPORTED_EVENT' where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()->>'safeToRetire','true','ignored error disposition: BILLING_WEBHOOK_UNSUPPORTED_EVENT');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='ignored',last_error_code='BILLING_RECONCILIATION_STALE' where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()->>'safeToRetire','true','ignored error disposition: BILLING_RECONCILIATION_STALE');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='ignored',last_error_code='BILLING_RECONCILIATION_MANUAL_REVIEW' where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()->>'safeToRetire','false','ignored error disposition: BILLING_RECONCILIATION_MANUAL_REVIEW');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='ignored',last_error_code='FUTURE_UNKNOWN_CODE' where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()->>'safeToRetire','false','ignored error disposition: FUTURE_UNKNOWN_CODE');
rollback to retirement_case;
select is(pg_temp.retirement_invoice(id,'subscription_payment_failed','990001','pending'),'processed','signed-shaped failed invoice admitted by real writer') from actors where name='terminal-checkout';
select is(pg_temp.retirement_report()#>>'{blockers,webhookWork}','0','processed failed invoice drains queue');
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','queue drainage does not extinguish invoice debt');
select is(pg_temp.retirement_invoice(id,'subscription_payment_success','990001','paid',10),'processed','same actual invoice paid through signed-ingress-shaped writer') from actors where name='terminal-checkout';
select is(pg_temp.retirement_report()->>'safeToRetire','true','exact same invoice durable paid evidence resolves failed invoice');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processed_at=null where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()->>'safeToRetire','false','terminal queue label without durable milestone blocks');
rollback to retirement_case;
-- Schema-drift injection is transactional; production checks are restored by rollback.
alter table billing_provider_subscriptions drop constraint billing_provider_subscriptions_provider_status_check;
update billing_provider_subscriptions set provider_status='future_state';
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','4','unknown provider statuses fail closed');
rollback to retirement_case;
alter table billing_checkout_attempts drop constraint billing_checkout_attempts_status_check;
update billing_checkout_attempts set status='future_state',expired_at=null,completed_at=null,completed_provider_subscription_id=null;
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','unknown checkout fails closed');
rollback to retirement_case;
alter table billing_provider_webhook_deliveries drop constraint billing_provider_webhook_deliveries_processing_status_check;
update billing_provider_webhook_deliveries set processing_status='future_state' where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','unknown webhook fails closed');
rollback to retirement_case;
select pg_temp.coach('growth') u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
alter table billing_plan_change_operations drop constraint billing_plan_change_operations_status_check;
update billing_plan_change_operations set status='future_state' where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','unknown operation fails closed');
rollback to retirement_case;
select pg_temp.coach('growth') u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_provider_subscriptions set reconciliation_status='manual_review' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor));
update billing_provider_webhook_deliveries set processing_status='received',processed_at=null where delivery_fingerprint=repeat('b',64);
select ok(pg_temp.retirement_report()->'outcomes' @> '["BLOCKED_BY_ACTIVE_SUBSCRIPTION","BLOCKED_BY_PLAN_OPERATION","BLOCKED_BY_WEBHOOK_RECONCILIATION","BLOCKED_BY_AMBIGUOUS_PROVIDER_DISPATCH","BLOCKED_BY_MANUAL_REVIEW","BLOCKED_BY_CANONICAL_CONFLICT"]'::jsonb,'all simultaneous blocker outcomes are retained');
rollback to retirement_case;
-- A newer payment for another invoice is not disposition of this invoice.
update billing_provider_webhook_deliveries set event_name='subscription_payment_failed',object_type='subscription-invoices',normalized_payload='{"status":"pending"}' where delivery_fingerprint=repeat('b',64);
insert into billing_provider_webhook_deliveries(provider,environment,event_name,object_type,object_id,provider_subscription_id,provider_customer_id,payload_sha256,delivery_fingerprint,processing_status,normalized_payload,processed_at)
select provider,environment,'subscription_payment_recovered',object_type,'other-invoice',provider_subscription_id,provider_customer_id,repeat('c',64),repeat('d',64),'processed','{"status":"paid"}',now()+interval '1 hour' from billing_provider_webhook_deliveries where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','newest unrelated paid invoice does not settle retained debt');
rollback to retirement_case;
update billing_provider_webhook_deliveries set object_type='subscription-invoices',normalized_payload='{"status":"future_state"}' where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','unknown invoice state blocks');
rollback to retirement_case;
select pg_temp.coach('growth') u into temp table current_actor;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from current_actor;
alter table billing_seat_quantity_operations drop constraint billing_seat_quantity_operations_status_check;
update billing_seat_quantity_operations set status='future_state' where created_by_user_id=(select u from current_actor);
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','unknown seat operation fails closed');
rollback to retirement_case;
alter table billing_provider_subscriptions drop constraint billing_provider_subscriptions_reconciliation_status_check;
update billing_provider_subscriptions set reconciliation_status='future_state';
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','4','unknown reconciliation status fails closed');
rollback to retirement_case;
select throws_ok($q$update billing_provider_subscriptions set account_subscription_id=null where billing_account_id=(select b.id from billing_accounts b join actors a on a.id=b.owner_user_id where a.name='terminal-checkout')$q$,'P0001',null,'canonical identity cannot be unlinked');
rollback to retirement_case;
select pg_temp.coach('growth') u into temp table current_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from current_actor;
update billing_plan_change_operations set status='failed',failed_at=now(),error_code='BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS' where created_by_user_id=(select u from current_actor);
select pg_temp.retirement_close(u) from current_actor;
select is(pg_temp.retirement_report()#>>'{blockers,ambiguousDispatches}','1','terminal label cannot erase retained ambiguity');
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','1','retained ambiguity blocks plan retirement');
rollback to retirement_case;
update billing_checkout_attempts set error_code='BILLING_CHECKOUT_CREATION_AMBIGUOUS';
select is(pg_temp.retirement_report()#>>'{blockers,ambiguousDispatches}','1','expired cleanup with explicit ambiguity is blocked');
rollback to retirement_case;
update billing_provider_subscriptions set provider_ends_at=now()+interval '30 days' where provider_status='cancelled';
select is(pg_temp.retirement_report()->>'safeToRetire','false','future cancellation blocks even terminal canonical label');
rollback to retirement_case;
-- Origins retain LS ownership even if no current provider row can be resolved.
select pg_temp.coach('growth') u into temp table current_actor;
select throws_ok($q$update account_subscriptions set source='manual' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from current_actor))$q$,'P0001','Subscription identity and trial clock are immutable.','current LS source cannot be hidden');
select is(pg_temp.retirement_report()#>>'{blockers,canonicalConflicts}','1','LS origin remains current authority despite source spelling');
rollback to retirement_case;
update billing_provider_webhook_deliveries set processing_status='processed',last_error_code='FUTURE_UNKNOWN_CODE' where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','processed label with unexpected error is not drained');
rollback to retirement_case;
select is((select count(*)::integer from jsonb_object_keys(pg_temp.retirement_report()->'blockers')),10,'exact ten allowlisted count categories');
-- F1: real historical API writer stores subscription identity in object_id.
select is(pg_temp.retirement_invoice(a.id,'subscription_payment_failed',b.provider_subscription_id,'pending'),'processed','colliding signed invoice accepted')
from actors a join billing_provider_subscriptions b on b.billing_account_id=(select id from billing_accounts where owner_user_id=a.id) where a.name='terminal-checkout';
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','colliding pending renewal blocks before API adjustment');
select is(public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,null,'monthly','expired',10)
 ||jsonb_build_object('ends_at',now()-interval '1 second'),pg_temp.invoice(id,'updated','paid')),'processed','unrelated API adjustment reconciles') from actors where name='terminal-checkout';
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','API subscription ID cannot settle colliding invoice ID');
select is(pg_temp.retirement_report()->>'safeToRetire','false','collision stays blocked');
select is(pg_temp.retirement_invoice(a.id,'subscription_payment_success',b.provider_subscription_id,'paid',15),'processed','success in overlapping admission shape remains insufficient')
from actors a join billing_provider_subscriptions b on b.billing_account_id=(select id from billing_accounts where owner_user_id=a.id) where a.name='terminal-checkout';
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','signed-looking success with colliding ID also fails closed');
select is(pg_temp.retirement_invoice(a.id,'subscription_payment_recovered',b.provider_subscription_id,'paid',20),'processed','exclusive signed recovery admission retains actual colliding invoice identity')
from actors a join billing_provider_subscriptions b on b.billing_account_id=(select id from billing_accounts where owner_user_id=a.id) where a.name='terminal-checkout';
select is(pg_temp.retirement_report()->>'safeToRetire','true','proven signed recovery settles actual invoice despite numeric collision');
rollback to retirement_case;
-- A signed-looking record without the retained scope/fingerprint is insufficient.
update billing_provider_webhook_deliveries set event_name='subscription_payment_failed',object_type='subscription-invoices',object_id='990001',normalized_payload='{"status":"pending"}' where delivery_fingerprint=repeat('b',64);
insert into billing_provider_webhook_deliveries(provider,environment,event_name,object_type,object_id,provider_subscription_id,provider_customer_id,payload_sha256,delivery_fingerprint,processing_status,normalized_payload,processed_at)
select provider,environment,'subscription_payment_recovered',object_type,object_id,provider_subscription_id,provider_customer_id,repeat('c',64),repeat('d',64),'processed','{"status":"paid"}',now() from billing_provider_webhook_deliveries where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','object ID equality alone is not invoice provenance');
rollback to retirement_case;
-- F3: each nullable/unsupported shape is its own rollback-only regression.
select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,null,'monthly','expired',10)||jsonb_build_object('ends_at',now()-interval '1 second'),pg_temp.invoice(id)-'status') from actors where name='terminal-checkout';
select is(pg_temp.retirement_report()->>'safeToRetire','false','missing normalized invoice status blocks');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','missing key counted unknown');
rollback to retirement_case;
select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,null,'monthly','expired',10)||jsonb_build_object('ends_at',now()-interval '1 second'),pg_temp.invoice(id)||'{"status":null}'::jsonb) from actors where name='terminal-checkout';
select is(pg_temp.retirement_report()->>'safeToRetire','false','JSON null invoice status blocks');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','JSON null counted unknown');
rollback to retirement_case;
select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,null,'monthly','expired',10)||jsonb_build_object('ends_at',now()-interval '1 second'),pg_temp.invoice(id)||jsonb_build_object('status',null::text)) from actors where name='terminal-checkout';
select ok(exists(select 1 from billing_provider_webhook_deliveries where object_type='subscription-invoices' and normalized_payload->'status'='null'::jsonb and normalized_payload->>'status' is null),'SQL NULL extraction is present');
select is(pg_temp.retirement_report()->>'safeToRetire','false','SQL NULL invoice status cannot disappear');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','SQL NULL counted unknown');
rollback to retirement_case;
select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,null,'monthly','expired',10)||jsonb_build_object('ends_at',now()-interval '1 second'),pg_temp.invoice(id,'updated','unsupported_future_status')) from actors where name='terminal-checkout';
select is(pg_temp.retirement_report()->>'safeToRetire','false','unsupported invoice status blocks');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','unsupported invoice counted unknown');
rollback to retirement_case;
-- F4: terminal labels require the real retained end and canonical period evidence.
update billing_provider_subscriptions set provider_ends_at=null where provider_status='expired';
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','3','expired without end cannot close');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','3','missing end evidence counted unknown');
select is(pg_temp.retirement_report()->>'safeToRetire','false','missing end false-safe regression');
rollback to retirement_case;
update billing_provider_subscriptions set provider_ends_at=now()+interval '1 day' where billing_account_id=(select b.id from billing_accounts b join actors a on a.id=b.owner_user_id where a.name='terminal-checkout');
select is(pg_temp.retirement_report()->>'safeToRetire','false','future provider end blocks terminal expired label');
rollback to retirement_case;
select is(pg_temp.retirement_report()->>'safeToRetire','true','passed end with matching canonical terminal facts is safe');
update account_subscriptions set current_period_ends_at=now()+interval '1 day' where id=(select account_subscription_id from billing_provider_subscriptions where billing_account_id=(select b.id from billing_accounts b join actors a on a.id=b.owner_user_id where a.name='terminal-checkout'));
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','contradictory canonical end blocks');
rollback to retirement_case;
-- F2/F6: expiry is unresolved even with fully verified whole-second creation.
update billing_checkout_attempts set status='expired',completed_at=null,completed_provider_subscription_id=null,expired_at=now(),error_code='BILLING_CHECKOUT_EXPIRED',provider_expires_at=date_trunc('second',expected_expires_at);
select is(pg_temp.retirement_report()#>>'{blockers,checkouts}','1','known expired checkout still needs disposition');
select is(pg_temp.retirement_report()#>>'{blockers,ambiguousDispatches}','0','same expiry second does not invent ambiguous dispatch');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','0','normalized fractions are equivalent evidence');
select is(pg_temp.retirement_report()->>'safeToRetire','false','gate already blocks before delayed purchase');
create temp table delayed_purchase as
select a.id u,c.id checkout_id,c.billing_account_id,c.plan_version_id,
 pg_temp.snapshot(a.id)||jsonb_build_object('subscription_id','989999','order_id','989998','order_item_id','989997','first_subscription_item_id','989996','created_at',now()-interval '2 hours','updated_at',now()-interval '90 minutes') snapshot
from actors a join billing_checkout_attempts c on c.created_by_user_id=a.id where a.name='terminal-checkout';
create temp table delayed_delivery as select public.record_billing_webhook_delivery('test','subscription_created','subscriptions','989999',repeat('e',64),
 encode(extensions.digest('test'||chr(10)||'subscription_created'||chr(10)||repeat('e',64),'sha256'),'hex'),
 jsonb_build_object('store_id',snapshot->>'store_id','subscription_id','989999','customer_id',snapshot->>'customer_id','test_mode',true,
 'created_at',snapshot->>'created_at','updated_at',snapshot->>'updated_at','billing_account_id',billing_account_id,'checkout_attempt_id',checkout_id,'plan_version_id',plan_version_id)) d from delayed_purchase;
select is(public.reconcile_billing_provider_subscription(d,snapshot),'processed','existing reconciler admits delayed purchase inside expired window') from delayed_delivery cross join delayed_purchase;
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','1','delayed purchase creates servicing obligation');
select is(pg_temp.retirement_report()#>>'{blockers,checkouts}','0','actual completed purchase disposes checkout only');
select is(pg_temp.retirement_report()->>'safeToRetire','false','completed purchase remains gated by active subscription');
rollback to retirement_case;
update billing_checkout_attempts set status='expired',completed_at=null,completed_provider_subscription_id=null,expired_at=now(),error_code='BILLING_CHECKOUT_EXPIRED',provider_expires_at=date_trunc('second',expected_expires_at)-interval '1 second';
select is(pg_temp.retirement_report()#>>'{blockers,ambiguousDispatches}','1','previous second is not equivalent expiry evidence');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','previous second counted unknown');
rollback to retirement_case;
update billing_checkout_attempts set status='expired',completed_at=null,completed_provider_subscription_id=null,expired_at=now(),error_code='BILLING_CHECKOUT_EXPIRED',provider_expires_at=date_trunc('second',expected_expires_at)+interval '1 second';
select is(pg_temp.retirement_report()#>>'{blockers,ambiguousDispatches}','1','next second is not equivalent expiry evidence');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','next second counted unknown');
rollback to retirement_case;
-- Both environments exist at once, with no remote access.
select pg_temp.retirement_live_mappings();
update billing_runtime_policy set entitlement_environment='live';
select pg_temp.coach('growth','monthly','live') u into temp table live_actor;
select pg_temp.retirement_close(u) from live_actor;
select is((select count(distinct environment)::integer from billing_provider_subscriptions),2,'actual LS test and live fixtures coexist');
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal live and test history is safe');
savepoint live_terminal;
insert into billing_provider_webhook_deliveries(provider,environment,event_name,object_type,object_id,provider_subscription_id,provider_customer_id,payload_sha256,delivery_fingerprint,processing_status,normalized_payload,processed_at)
select provider,environment,'subscription_payment_failed','subscription-invoices','990002',provider_subscription_id,provider_customer_id,repeat('f',64),repeat('f',64),'processed','{"status":"pending"}',now() from billing_provider_subscriptions where environment='live';
select is(pg_temp.retirement_report()#>>'{blockers,paymentObligations}','1','unresolved live invoice blocks');
select is(pg_temp.retirement_report()->>'safeToRetire','false','unresolved live evidence cannot be hidden');
rollback to live_terminal;
select pg_temp.coach('growth','monthly','live');
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','1','active live subscription blocks');
update billing_runtime_policy set entitlement_environment='test';
select pg_temp.coach('growth');
select is(pg_temp.retirement_report()#>>'{blockers,subscriptions}','2','both active environments counted simultaneously');
select is(pg_temp.retirement_report()#>>'{blockers,canonicalConflicts}','2','both canonical conflicts emitted simultaneously');
select is(pg_temp.retirement_report()->>'safeToRetire','false','combined active environments block');
rollback to retirement_case;
-- Nullable text domains use positive classification even under transactional drift.
alter table billing_provider_webhook_deliveries alter column processing_status drop not null;
update billing_provider_webhook_deliveries set processing_status=null where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','NULL webhook state counted unknown');
rollback to retirement_case;
alter table billing_provider_webhook_deliveries alter column event_name drop not null;
update billing_provider_webhook_deliveries set event_name=null where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','NULL event domain counted unknown');
rollback to retirement_case;
select pg_temp.coach('growth') u into temp table unknown_error_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from unknown_error_actor;
update billing_plan_change_operations set status='failed',failed_at=now(),error_code='BILLING_PLAN_CHANGE_FUTURE_UNKNOWN' where created_by_user_id=(select u from unknown_error_actor);
select pg_temp.retirement_close(u) from unknown_error_actor;
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','1','unrecognized terminal operation error cannot disappear');
select is(pg_temp.retirement_report()->>'safeToRetire','false','unclassified terminal operation blocks');
rollback to retirement_case;
-- All ten outcomes coexist; no precedence rule can suppress a category.
select pg_temp.coach('growth') u into temp table overlap_actor;
select public.begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from overlap_actor;
update billing_plan_change_operations set status='awaiting_payment' where created_by_user_id=(select u from overlap_actor);
update billing_provider_subscriptions set reconciliation_status='manual_review' where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from overlap_actor));
select pg_temp.coach('growth') u into temp table overlap_seat;
select public.begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from overlap_seat;
update billing_checkout_attempts set status='expired',completed_at=null,completed_provider_subscription_id=null,expired_at=now(),provider_checkout_id=null,error_code='BILLING_CHECKOUT_EXPIRED';
update billing_provider_webhook_deliveries set processing_status='failed',processed_at=null,object_type='subscription-invoices',normalized_payload='{}' where delivery_fingerprint=repeat('b',64);
select is(pg_temp.retirement_report()->'outcomes','["BLOCKED_BY_ACTIVE_SUBSCRIPTION","BLOCKED_BY_PAYMENT_OBLIGATION","BLOCKED_BY_CHECKOUT","BLOCKED_BY_PLAN_OPERATION","BLOCKED_BY_SEAT_OPERATION","BLOCKED_BY_WEBHOOK_RECONCILIATION","BLOCKED_BY_AMBIGUOUS_PROVIDER_DISPATCH","BLOCKED_BY_MANUAL_REVIEW","BLOCKED_BY_CANONICAL_CONFLICT","BLOCKED_BY_UNKNOWN_STATE"]'::jsonb,'all ten simultaneous outcomes are deterministically ordered');
select ok((select bool_and(value::bigint>0) from jsonb_each_text(pg_temp.retirement_report()->'blockers')),'every blocker category emitted simultaneously');
select is(pg_temp.retirement_report()->>'safeToRetire','false','positive blocker counts imply unsafe');
rollback to retirement_case;
-- F5: genuinely Paddle-only population and production plan-change supersession.
rollback to empty_history;
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_cross_ledger_helpers.psql
\ir fixtures/paddle_webhook_fixture.psql
\ir fixtures/paddle_auto_reconciliation_fixture.psql
\ir fixtures/paddle_lifecycle_fixture.psql
\ir fixtures/paddle_plan_change_fixture.psql
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
create function pg_temp.retirement_report() returns jsonb language sql as $$select public.inspect_lemon_squeezy_retirement_disposition_v1(clock_timestamp())$$;
select pg_temp.plan_owner() u into temp table paddle_actor;
select is(pg_temp.retirement_report()->>'safeToRetire','true','current legitimate Paddle authority safe');
select pg_temp.plan_begin(u) from paddle_actor;
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'upgrade')),'pending','real Paddle supersession awaits payment') from paddle_actor;
select is(pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'paid','transaction.completed')),'applied','real paid Paddle plan-change applied') from paddle_actor;
select is((select count(*)::integer from billing_provider_subscriptions),0,'Paddle supersession regression has zero LS subscriptions');
select is((select count(*)::integer from account_subscriptions a join billing_canonical_origins o on o.account_subscription_id=a.id where o.storage_contract='billing.v2' and a.status='superseded'),1,'historical billing.v2 origin retained');
select is(pg_temp.retirement_report()->>'safeToRetire','true','valid append-only Paddle supersession does not block LS retirement');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','0','old Paddle canonical resolves through successor');
-- Impossible persistent targets are rejected by the existing deferred scope FK.
create function pg_temp.retirement_bad_chain(kind text) returns void language plpgsql as $$
declare a uuid; p uuid; x uuid:=gen_random_uuid(); y uuid:=gen_random_uuid(); other uuid;
begin
 select s.billing_account_id,s.plan_version_id into a,p from account_subscriptions s where s.id=(select account_subscription_id from billing_subscriptions_v2 where shadow_status='current');
 if kind='cross' then
  other:=pg_temp.guard_owner();
  select id into other from billing_accounts where owner_user_id=other;
  insert into account_subscriptions(id,billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at,expired_at)
   values(y,other,p,'paid','expired','billing_provider',now()-interval '1 day',now()-interval '1 second',now());
 end if;
 insert into account_subscriptions(id,billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at,superseded_at,superseded_by_subscription_id)
  values(x,a,p,'paid','superseded','billing_provider',now()-interval '1 day',now()+interval '1 day',now(),y);
 perform billing_guard_claim_canonical(a,x,'billing.v2');
 if kind='cycle' then
  insert into account_subscriptions(id,billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at,superseded_at,superseded_by_subscription_id)
   values(y,a,p,'paid','superseded','billing_provider',now()-interval '1 day',now()+interval '1 day',now(),x);
  perform billing_guard_claim_canonical(a,y,'billing.v2');
 end if;
end $$;
savepoint paddle_terminal;
select pg_temp.retirement_bad_chain('missing');
select is(pg_temp.retirement_report()->>'safeToRetire','false','broken successor blocks even before deferred FK fires');
select throws_ok('set constraints subscription_supersession_target immediate','23503',null,'existing FK rejects missing successor');
rollback to paddle_terminal;
select pg_temp.retirement_bad_chain('cross');
select is(pg_temp.retirement_report()->>'safeToRetire','false','cross-account successor cannot establish authority');
select throws_ok('set constraints subscription_supersession_target immediate','23503',null,'existing scoped FK rejects cross-account successor');
rollback to paddle_terminal;
select pg_temp.retirement_bad_chain('cycle');
select is(pg_temp.retirement_report()->>'safeToRetire','false','constructible canonical cycle blocks without recursion looping');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','2','both cycle nodes counted unknown');
rollback to paddle_terminal;
update account_subscriptions set status='past_due',status_changed_at=now() where id=(select account_subscription_id from billing_subscriptions_v2 where shadow_status='current');
select is(pg_temp.retirement_report()->>'safeToRetire','false','unresolved current Paddle authority prevents chain proof');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','2','current and superseded canonical both lack resolved authority');
rollback to paddle_terminal;
select is(pg_temp.retirement_report()->>'safeToRetire','true','adversarial rollback preserves valid supersession history');
select * from finish();
rollback;
