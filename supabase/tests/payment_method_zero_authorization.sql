begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/paddle_recovery_fixture.psql

-- Every case uses real ingress/receipt/immutability guards on synthetic local
-- records. No evidence is edited after ingestion.
create function pg_temp.zero_method(u uuid,tx text,label text,attempts jsonb) returns jsonb language sql as $$
 select jsonb_set(pg_temp.recovery_observation(u,label,'transaction.completed'),'{transactionRef}',to_jsonb(tx))
 ||jsonb_build_object('origin','subscription_payment_method_change',
   'financial',jsonb_build_object('resourceUpdatedAt','2026-10-20T12:00:00.123456789Z','collectionMode','automatic','captured','0',
    'totals',jsonb_build_object('subtotal','0','tax','0','discount','0','total','0','credit','0','creditToBalance','0','grandTotal','0','balance','0'),
    'payments',attempts),'paymentTotals',jsonb_build_object('total',0,'paid',0,'balance',0))
$$;
create temp table zero_cases(label text,u uuid,p uuid,tx text,event_id uuid,o jsonb,before jsonb);
insert into zero_cases(label,u,tx) select label,pg_temp.plan_owner(),'txn_'||lpad(n::text,26,'0')
 from unnest(array['empty','authorized-zero','early','ambiguous','positive','captured','failed','missing-reference',
 'multiple','wrong-customer','wrong-subscription','nonzero-total','nonzero-captured','wrong-origin','wrong-items']) with ordinality t(label,n);
update zero_cases set before=pg_temp.recovery_counts(u),p=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,p,repeat('a',64))->>'dispatch','true','single claim: '||label) from zero_cases;
select is(record_billing_payment_method_preparation_result_v1(u,p,repeat('a',64),tx,
 'paddle-payment-method-transaction-v1',repeat('b',64))->>'status','ready','exact result: '||label) from zero_cases where label not in ('early','ambiguous');
update zero_cases set o=pg_temp.zero_method(u,tx,label,
 case label when 'empty' then '[]'::jsonb
 when 'positive' then '[{"attemptReference":"local/verify","amount":"1","status":"authorized"}]'::jsonb
 when 'captured' then '[{"attemptReference":"local/verify","amount":"0","status":"captured"}]'::jsonb
 when 'failed' then '[{"attemptReference":"local/verify","amount":"0","status":"error"}]'::jsonb
 when 'missing-reference' then '[{"amount":"0","status":"authorized"}]'::jsonb
 when 'multiple' then '[{"attemptReference":"local/verify","amount":"0","status":"authorized"},{"attemptReference":"local/second","amount":"0","status":"authorized"}]'::jsonb
 else '[{"attemptReference":"local/verify","amount":"0","status":"authorized"}]'::jsonb end);
update zero_cases set o=jsonb_set(o,'{customerRef}','"synthetic/other-customer"') where label='wrong-customer';
update zero_cases set o=jsonb_set(o,'{subscriptionRef}','"synthetic/other-subscription"') where label='wrong-subscription';
update zero_cases set o=jsonb_set(jsonb_set(jsonb_set(jsonb_set(o,'{financial,totals,subtotal}','"1"'),'{financial,totals,total}','"1"'),'{financial,totals,grandTotal}','"1"'),'{financial,totals,balance}','"1"')||'{"paymentTotals":{"total":1,"paid":0,"balance":1}}'::jsonb where label='nonzero-total';
update zero_cases set o=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(o,'{financial,totals,subtotal}','"1"'),'{financial,totals,total}','"1"'),'{financial,totals,grandTotal}','"1"'),'{financial,captured}','"1"'),'{financial,payments}','[{"attemptReference":"local/capture","amount":"1","status":"captured"}]')||'{"paymentTotals":{"total":1,"paid":1,"balance":0}}'::jsonb where label='nonzero-captured';
update zero_cases set o=jsonb_set(o,'{origin}','"subscription_recurring"') where label='wrong-origin';
update zero_cases set o=jsonb_set(o,'{items}','[]') where label='wrong-items';
select is(fail_billing_payment_method_preparation_v1(p,repeat('a',64),'provider_ambiguous')->>'status','ambiguous',
 'claimed uncertain response stays ambiguous until original validated attachment') from zero_cases where label='ambiguous';
select throws_ok(format('select pg_temp.recovery_ingest(%L::jsonb)',o),
 'P0001','BILLING_PROOF_INVALID','ingress rejects a missing attempt reference before any completion authority') from zero_cases where label='missing-reference';
select throws_ok(format('select pg_temp.recovery_ingest(%L::jsonb)',o),
 'P0001','BILLING_PROOF_IDENTITY_MISMATCH','ingress rejects contradictory provider identity: '||label) from zero_cases where label='wrong-customer';
update zero_cases set event_id=pg_temp.recovery_ingest(o) where label not in ('missing-reference','wrong-customer');
select throws_ok(format('select reconcile_billing_payment_method_preparation_v1(%L)',event_id),
 'P0001','BILLING_PAYMENT_METHOD_EVENT_CONFLICT','reject signed conflicting event: '||label)
 from zero_cases where label not in ('empty','authorized-zero','early','ambiguous','missing-reference','wrong-customer');
select is((select status from billing_payment_method_preparations_v2 where id=p),'ready',
 'conflict keeps reservation unresolved: '||label) from zero_cases where label not in ('empty','authorized-zero','early','ambiguous','missing-reference','wrong-customer');
select ok((select processing_status<>'processed' from billing_webhook_events_v2 where id=event_id),
 'conflict cannot mark event processed: '||label) from zero_cases where label not in ('empty','authorized-zero','early','ambiguous','missing-reference','wrong-customer');
select is(reconcile_billing_payment_method_preparation_v1(event_id)->>'status','not_applicable',
 'signed completion arriving before attachment cannot select a preparation') from zero_cases where label in ('early','ambiguous');
select is(record_billing_payment_method_preparation_result_v1(u,p,repeat('a',64),tx,
 'paddle-payment-method-transaction-v1',repeat('b',64))->>'status','completed',
 'late original response reconciles retained authorized-zero completion') from zero_cases where label in ('early','ambiguous');
select is(reconcile_billing_payment_method_preparation_v1(event_id)->>'status','completed',
 'valid nonfinancial completion: '||label) from zero_cases where label in ('empty','authorized-zero');
select is(reconcile_billing_payment_method_preparation_v1(event_id)->>'status','reused',
 'exact retry is idempotent: '||label) from zero_cases where label in ('empty','authorized-zero','early','ambiguous');
select ok((select status='completed' and terminal_event_id=event_id and completion_application_id is null
 from billing_payment_method_preparations_v2 where id=p),'exact completion with no financial application: '||label)
 from zero_cases where label in ('empty','authorized-zero','early','ambiguous');
select ok((select processing_status='processed' and processed_at is not null and last_error_code is null
 from billing_webhook_events_v2 where id=event_id),'same signed event processed: '||label)
 from zero_cases where label in ('empty','authorized-zero','early','ambiguous');
select is(pg_temp.recovery_counts(u),before,'no paid period, capacity, status or financial effect: '||label) from zero_cases;
select is((select count(*)::text from billing_payment_applications_v2 where provider_transaction_ref=tx),'0',
 'zero method transaction never becomes payment authority: '||label) from zero_cases;
select throws_ok(format('select authorize_billing_payment_method_continuation_v1(%L,%L)',u,p),
 'P0001','BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED','completed checkout cannot be relaunched: '||label)
 from zero_cases where label in ('empty','authorized-zero','early','ambiguous');
select ok(not has_function_privilege('authenticated','reconcile_billing_payment_method_preparation_v1(uuid)','execute'),
 'browser still cannot reconcile provider proof');
select ok(has_function_privilege('service_role','reconcile_billing_payment_method_preparation_v1(uuid)','execute'),
 'existing service entrypoint retains its grant');
select * from finish();
rollback;
