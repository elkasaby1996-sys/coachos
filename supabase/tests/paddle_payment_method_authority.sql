begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/paddle_recovery_fixture.psql

create temp table method_active(u uuid, preparation uuid, transaction_ref text, event_id uuid);
insert into method_active(u,transaction_ref) values(pg_temp.plan_owner(),'txn_'||repeat('1',26));
update method_active set preparation=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,preparation,repeat('a',64))->>'dispatch','true',
 'active claim is durable before provider IO') from method_active;
select is(record_billing_payment_method_preparation_result_v1(u,preparation,repeat('a',64),transaction_ref,
 'paddle-payment-method-transaction-v1',repeat('b',64))->>'status','ready',
 'validated active zero-value transaction attaches durably') from method_active;
select is(authorize_billing_payment_method_continuation_v1(u,preparation)->>'transactionRef',transaction_ref,
 'ready continuation requires fresh local authority') from method_active;
select is((begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid,preparation,
 'ready reuse never creates another preparation') from method_active;
select throws_ok($q$select record_billing_payment_method_preparation_result_v1(u,preparation,repeat('a',64),'txn_'||repeat('2',26),
 'paddle-payment-method-transaction-v1',repeat('b',64)) from method_active$q$,
 'P0001','BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED','provider result reference is write-once');

create temp table method_event as select u,preparation,transaction_ref,
 (jsonb_set(pg_temp.recovery_observation(u,'zero-method','transaction.completed'),'{transactionRef}',to_jsonb(transaction_ref))
  ||jsonb_build_object('origin','subscription_payment_method_change',
   'financial',jsonb_build_object('resourceUpdatedAt','2026-10-20T12:00:00Z','collectionMode','automatic','captured','0',
      'totals',jsonb_build_object('subtotal','0','tax','0','discount','0','total','0','credit','0','creditToBalance','0','grandTotal','0','balance','0'),
      'payments','[]'::jsonb),
   'paymentTotals',jsonb_build_object('total',0,'paid',0,'balance',0))) observation
 from method_active;
update method_active a set event_id=pg_temp.recovery_ingest(m.observation) from method_event m where a.u=m.u;
select is(reconcile_paddle_payment_recovery_event_v1(event_id)->>'status','not_applicable',
 'payment method event creates no financial recovery') from method_active;
select is(reconcile_billing_payment_method_preparation_v1(event_id)->>'status','completed',
 'strict authenticated zero-financial event completes exact active preparation') from method_active;
select is(reconcile_billing_payment_method_preparation_v1(event_id)->>'status','reused',
 'duplicate authenticated event is reused') from method_active;
select is((select count(*)::text from billing_payment_applications_v2 where provider_transaction_ref=transaction_ref),'0',
 'active payment method update creates no payment application') from method_active;
select throws_ok($q$select authorize_billing_payment_method_continuation_v1(u,preparation) from method_active$q$,
 'P0001','BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED','completed preparation releases no continuation');

create temp table method_due(u uuid,preparation uuid,transaction_ref text);
insert into method_due(u,transaction_ref) values(pg_temp.recovery_owner(),'txn_'||repeat('3',26));
select pg_temp.recovery_dispatch(jsonb_set(pg_temp.recovery_observation(u,'due-method'),'{transactionRef}',to_jsonb(transaction_ref))) from method_due;
select is(resolve_owned_billing_payment_method_context_v1(u)->>'mode','settle_existing_balance',
 'one R2A1 obligation selects past-due mode') from method_due;
update method_due set preparation=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is((select expected_obligation_transaction_ref::text from billing_payment_method_preparations_v2 where id=preparation),transaction_ref,
 'past-due preparation binds exact existing obligation') from method_due;
select is(claim_billing_payment_method_dispatch_v1(u,preparation,repeat('c',64))->>'dispatch','true',
 'past-due claim dispatches once') from method_due;
select throws_ok($q$select record_billing_payment_method_preparation_result_v1(u,preparation,repeat('c',64),
 'txn_'||repeat('4',26),'paddle-payment-method-transaction-v1',repeat('d',64)) from method_due$q$,
 'P0001','BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED','different provider transaction cannot replace debt');
select is(record_billing_payment_method_preparation_result_v1(u,preparation,repeat('c',64),transaction_ref,
 'paddle-payment-method-transaction-v1',repeat('d',64))->>'status','ready',
 'exact existing obligation may attach') from method_due;
select is((select count(*)::text from billing_payment_applications_v2 where provider_transaction_ref=transaction_ref),'0',
 'ready past-due preparation does not claim payment') from method_due;

-- Signed completion may arrive before the original claimed worker attaches
-- its response. Retained evidence, not browser/provider status, completes it.
create temp table early_active as select pg_temp.plan_owner() u,'txn_'||repeat('5',26) transaction_ref;
alter table early_active add column preparation uuid;
update early_active set preparation=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,preparation,repeat('e',64))->>'dispatch','true',
 'early-event fixture has a committed claim') from early_active;
create temp table early_active_event as select u,preparation,transaction_ref,
 (jsonb_set(pg_temp.recovery_observation(u,'early-zero-method','transaction.completed'),'{transactionRef}',to_jsonb(transaction_ref))
  ||jsonb_build_object('origin','subscription_payment_method_change',
   'financial',jsonb_build_object('resourceUpdatedAt','2026-10-20T12:00:00Z','collectionMode','automatic','captured','0',
      'totals',jsonb_build_object('subtotal','0','tax','0','discount','0','total','0','credit','0','creditToBalance','0','grandTotal','0','balance','0'),
      'payments','[]'::jsonb),
   'paymentTotals',jsonb_build_object('total',0,'paid',0,'balance',0))) observation from early_active;
select is(reconcile_billing_payment_method_preparation_v1(pg_temp.recovery_ingest(observation))->>'status','not_applicable',
 'early signed active completion waits for exact attached result') from early_active_event;
select is(record_billing_payment_method_preparation_result_v1(u,preparation,repeat('e',64),transaction_ref,
 'paddle-payment-method-transaction-v1',repeat('f',64))->>'status','completed',
 'original claimed result finds already retained signed completion') from early_active;
select is((select count(*)::text from billing_payment_applications_v2 where provider_transaction_ref=transaction_ref),'0',
 'early nonfinancial completion still creates no payment application') from early_active;

create temp table early_due as select pg_temp.recovery_owner() u,'txn_'||repeat('6',26) transaction_ref;
alter table early_due add column preparation uuid;
select pg_temp.recovery_dispatch(jsonb_set(pg_temp.recovery_observation(u,'early-due'),'{transactionRef}',to_jsonb(transaction_ref))) from early_due;
update early_due set preparation=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,preparation,repeat('1',64))->>'dispatch','true',
 'early recovery has committed claim') from early_due;
select is(pg_temp.recovery_dispatch(jsonb_set(pg_temp.recovery_observation(u,'early-paid','transaction.completed','2026-10-21T12:00:00Z'),'{transactionRef}',to_jsonb(transaction_ref))),
 'pending','financial completion waits for active subscription evidence') from early_due;
select is(pg_temp.recovery_dispatch(pg_temp.recovery_observation(u,'early-active','subscription.updated','2026-10-21T13:00:00Z')),
 'applied','exact signed renewal settlement applies once before attachment') from early_due;
select is(record_billing_payment_method_preparation_result_v1(u,preparation,repeat('1',64),transaction_ref,
 'paddle-payment-method-transaction-v1',repeat('2',64))->>'status','completed',
 'late original claimed response attaches to exact already-settled renewal') from early_due;
select is(pg_temp.recovery_counts(u)->>'renewal','1','early recovery retains one renewal application') from early_due;

-- A later active subscription event only wakes existing signed transaction
-- proof after commercial recovery has created the unique renewal application.
create temp table completion_first as select pg_temp.recovery_owner() u,'txn_'||repeat('7',26) transaction_ref;
alter table completion_first add column preparation uuid;
alter table completion_first add column completed_event uuid;
alter table completion_first add column active_event uuid;
select pg_temp.recovery_dispatch(jsonb_set(pg_temp.recovery_observation(u,'completion-first-debt'),
 '{transactionRef}',to_jsonb(transaction_ref))) from completion_first;
update completion_first set preparation=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,preparation,repeat('7',64))->>'dispatch','true',
 'completion-first preparation has committed claim') from completion_first;
select is(record_billing_payment_method_preparation_result_v1(u,preparation,repeat('7',64),transaction_ref,
 'paddle-payment-method-transaction-v1',repeat('8',64))->>'status','ready',
 'completion-first result attached') from completion_first;
update completion_first set completed_event=pg_temp.recovery_ingest(jsonb_set(
 pg_temp.recovery_observation(u,'completion-first-paid','transaction.completed','2026-10-21T12:00:00Z'),
 '{transactionRef}',to_jsonb(transaction_ref)));
select is(reconcile_paddle_payment_recovery_event_v1(completed_event)->>'status','pending',
 'financial completion waits for active subscription proof') from completion_first;
select is(reconcile_billing_payment_method_preparation_v1(completed_event)->>'status','pending',
 'preparation remains ready before R2A1 recovery') from completion_first;
select is((select status from billing_payment_method_preparations_v2 where id=preparation),'ready',
 'transaction alone does not terminalize preparation') from completion_first;
update completion_first set active_event=pg_temp.lifecycle_ingest(
 pg_temp.recovery_observation(u,'completion-first-active','subscription.updated','2026-10-21T13:00:00Z'));
select is(reconcile_paddle_initial_purchase_event_v1(active_event)->>'status','applied',
 'later active subscription evidence applies existing renewal recovery') from completion_first;
select is(reconcile_billing_payment_method_preparation_v1(active_event)->>'status','completed',
 'later active event wakes exact signed transaction completion') from completion_first;
select is((select terminal_event_id::text from billing_payment_method_preparations_v2 where id=preparation),
 completed_event::text,'terminal event remains the authenticated payment event') from completion_first;
select is(pg_temp.recovery_counts(u)->>'renewal','1',
 'completion-first creates exactly one renewal application') from completion_first;
select is(reconcile_billing_payment_method_preparation_v1(completed_event)->>'status','reused',
 'duplicate completed event does not terminalize twice') from completion_first;
select is(reconcile_billing_payment_method_preparation_v1(active_event)->>'status','not_applicable',
 'duplicate active event is idempotent after completion') from completion_first;
select is(pg_temp.recovery_counts(u)->>'renewal','1',
 'duplicate delivery does not create another application') from completion_first;
select is(resolve_owned_billing_payment_method_context_v1(u)->>'mode','update_only',
 'settled completion-first owner has clean active authority') from completion_first;
select is((begin_billing_payment_method_preparation_v1(u)->>'status'),'creating',
 'a later explicit activation is not blocked by completed preparation') from completion_first;

create temp table active_first as select pg_temp.recovery_owner() u,'txn_'||repeat('9',26) transaction_ref;
alter table active_first add column preparation uuid;
alter table active_first add column completed_event uuid;
alter table active_first add column active_event uuid;
select pg_temp.recovery_dispatch(jsonb_set(pg_temp.recovery_observation(u,'active-first-debt'),
 '{transactionRef}',to_jsonb(transaction_ref))) from active_first;
update active_first set preparation=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,preparation,repeat('9',64))->>'dispatch','true',
 'active-first preparation has committed claim') from active_first;
select is(record_billing_payment_method_preparation_result_v1(u,preparation,repeat('9',64),transaction_ref,
 'paddle-payment-method-transaction-v1',repeat('a',64))->>'status','ready',
 'active-first result attached') from active_first;
update active_first set active_event=pg_temp.lifecycle_ingest(
 pg_temp.recovery_observation(u,'active-first-active','subscription.updated','2026-10-21T13:00:00Z'));
select is(reconcile_paddle_initial_purchase_event_v1(active_event)->>'status','pending',
 'active subscription alone cannot apply financial recovery') from active_first;
select is(reconcile_billing_payment_method_preparation_v1(active_event)->>'status','not_applicable',
 'active event alone cannot complete preparation') from active_first;
update active_first set completed_event=pg_temp.recovery_ingest(jsonb_set(
 pg_temp.recovery_observation(u,'active-first-paid','transaction.completed','2026-10-21T12:00:00Z'),
 '{transactionRef}',to_jsonb(transaction_ref)));
select is(reconcile_paddle_payment_recovery_event_v1(completed_event)->>'status','applied',
 'later completed payment applies exact recovery') from active_first;
select is(reconcile_billing_payment_method_preparation_v1(completed_event)->>'status','completed',
 'later completed payment terminalizes preparation') from active_first;
select is(pg_temp.recovery_counts(u)->>'renewal','1',
 'active-first creates one renewal application') from active_first;

create temp table unrelated_owner as select pg_temp.plan_owner() u;
select is(reconcile_billing_payment_method_preparation_v1(pg_temp.lifecycle_ingest(
 pg_temp.lifecycle_observation(u,'unrelated-active','subscription.updated','active')))->>'status','not_applicable',
 'unrelated active subscription cannot complete another preparation') from unrelated_owner;
select is((select status from billing_payment_method_preparations_v2 where id=preparation),'completed',
 'unrelated event leaves exact preparation terminal state unchanged') from completion_first;

create temp table paid_only as select pg_temp.recovery_owner() u,'txn_'||repeat('b',26) transaction_ref;
alter table paid_only add column preparation uuid;
select pg_temp.recovery_dispatch(jsonb_set(pg_temp.recovery_observation(u,'paid-only-debt'),
 '{transactionRef}',to_jsonb(transaction_ref))) from paid_only;
update paid_only set preparation=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,preparation,repeat('b',64))->>'dispatch','true',
 'paid-only fixture has committed claim') from paid_only;
select is(record_billing_payment_method_preparation_result_v1(u,preparation,repeat('b',64),transaction_ref,
 'paddle-payment-method-transaction-v1',repeat('c',64))->>'status','ready',
 'paid-only result attached') from paid_only;
select is(reconcile_billing_payment_method_preparation_v1(pg_temp.recovery_ingest(jsonb_set(
 pg_temp.recovery_observation(u,'paid-only','transaction.paid','2026-10-21T12:00:00Z'),
 '{transactionRef}',to_jsonb(transaction_ref))))->>'status','not_applicable',
 'transaction.paid alone has no preparation-completion authority') from paid_only;
select is((select status from billing_payment_method_preparations_v2 where id=preparation),'ready',
 'paid-only preparation remains nonterminal') from paid_only;

select * from finish();
rollback;
