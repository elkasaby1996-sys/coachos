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
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
select ok(not (select paddle_reconciliation_enabled or paddle_sales_enabled from billing_runtime_policy where id=1),'migration does not enable policy');
select is(reconcile_paddle_lifecycle_event_v1(gen_random_uuid())->>'status','disabled','disabled closed result');
update billing_runtime_policy set paddle_reconciliation_enabled=true;
create temp table cases(label text primary key,u uuid,canonical uuid);
insert into cases(label,u) select label,pg_temp.lifecycle_owner() from unnest(array['sub-first','tx-first','status','cancel','drift','period','mismatch']) label;
update cases c set canonical=s.account_subscription_id from billing_subscriptions_v2 s where s.provider_subscription_ref='synthetic/sub/'||c.u;
select is((select count(*)::int from cases where canonical is not null),7,'existing paid links preserved');
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'renew')),'pending','subscription first waits for payment') from cases where label='sub-first';
select is(pg_temp.lifecycle_counts(u)->>'renewals','0','pending cannot advance payment') from cases where label='sub-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'paid','transaction.completed')),'applied','subscription first paired renewal') from cases where label='sub-first';
select is(pg_temp.lifecycle_counts(u),'{"canonical":1,"renewals":1,"seats":0,"status":"active","cancel":false,"access":"full","end":"2026-11-20"}'::jsonb,'renewal advances one existing canonical') from cases where label='sub-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'paid','transaction.completed')),'reused','exact transaction replay') from cases where label='sub-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'renew')),'reused','exact subscription replay') from cases where label='sub-first';
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'reused','initial replay after renewal preserves lifecycle') from cases where label='sub-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'paid','transaction.completed')),'pending','transaction first waits') from cases where label='tx-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'renew')),'applied','transaction first paired renewal') from cases where label='tx-first';
select is(pg_temp.lifecycle_counts(u)->>'renewals','1','exactly one transaction-first renewal') from cases where label='tx-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'past-due','subscription.updated','past_due','2026-09-21T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')),'applied','status-only past due bootstraps verified initial period') from cases where label='status';
select is(pg_temp.lifecycle_counts(u)->>'status','past_due','canonical past due') from cases where label='status';
select is(pg_temp.lifecycle_counts(u)->>'access','full','past due existing full access') from cases where label='status';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'recovery','subscription.updated','active','2026-09-22T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')),'applied','newer active recovers same row') from cases where label='status';
select is(pg_temp.lifecycle_counts(u)->>'status','active','recovery canonical active') from cases where label='status';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'old','subscription.updated','past_due','2026-09-21T12:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')),'manual_review','stale update cannot roll back') from cases where label='status';
select is(pg_temp.lifecycle_counts(u)->>'status','active','stale evidence leaves active') from cases where label='status';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'cancel-scheduled','subscription.updated','active','2026-09-23T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')||'{"nextBilledAt":null,"scheduledChange":{"action":"cancel","effectiveAt":"2026-10-20T00:00:00Z"}}'::jsonb),'applied','scheduled cancel retains paid period') from cases where label='status';
select is(pg_temp.lifecycle_counts(u)->>'cancel','true','scheduled canonical flag') from cases where label='status';
select is(pg_temp.lifecycle_counts(u)->>'access','full','scheduled cancellation keeps full access') from cases where label='status';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'effective','subscription.updated','canceled','2026-10-20T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')||'{"currentBillingPeriod":null}'::jsonb),'applied','effective cancellation uses terminal semantics') from cases where label='status';
select is(pg_temp.lifecycle_counts(u)->>'status','expired','terminal canonical expired') from cases where label='status';
select is(pg_temp.lifecycle_counts(u)->>'access','none','terminal no access') from cases where label='status';
select is(pg_temp.auto_dispatch(u,'subscription.created'),'reused','initial replay cannot resurrect canceled paid row') from cases where label='status';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'reactivate','subscription.updated','active','2026-10-21T00:00:00Z')),'manual_review','terminal row cannot be reactivated') from cases where label='status';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'bad-cancel','subscription.updated','active','2026-09-23T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')||'{"nextBilledAt":null,"scheduledChange":{"action":"cancel","effectiveAt":"2026-10-19T00:00:00Z"}}'::jsonb),'manual_review','contradictory scheduled cancellation') from cases where label='cancel';
select is(pg_temp.lifecycle_dispatch(jsonb_set(pg_temp.lifecycle_observation(u,'drift'),'{items,0,quantity}','2')),'manual_review','quantity drift rejected') from cases where label='drift';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'wrong-origin','transaction.completed')||'{"origin":"subscription_update"}'::jsonb),'manual_review','nonrenewal origin rejected before pairing') from cases where label='mismatch';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'bad-period','subscription.updated','active','2026-10-20T10:00:00Z','2026-10-20T00:00:00Z','2027-10-20T00:00:00Z')),'manual_review','monthly mapping cannot authorize yearly period') from cases where label='period';
select is((select count(*)::int from cases c join billing_subscriptions_v2 s on s.provider_subscription_ref='synthetic/sub/'||c.u where c.canonical=s.account_subscription_id),7,'all canonical IDs unchanged');
select is((select count(*)::int from billing_payment_applications_v2 where application_kind='renewal'),2,'only two certified renewal effects');
select ok(not has_function_privilege('anon','reconcile_paddle_lifecycle_event_v1(uuid)','execute'),'anon denied');
select ok(not has_function_privilege('authenticated','reconcile_paddle_lifecycle_event_v1(uuid)','execute'),'browser denied');
select ok(has_function_privilege('service_role','reconcile_paddle_lifecycle_event_v1(uuid)','execute'),'service UUID entrypoint');
select ok(not has_function_privilege('service_role','billing_paddle_lifecycle_facts_v1(uuid,uuid)','execute'),'proof helper private');

-- Independent drift cases: immutable initial mapping remains authoritative.
create temp table negative_cases(label text,u uuid,delta jsonb);
insert into negative_cases values
 ('unknown-price',pg_temp.lifecycle_owner(),'{"items":[{"priceRef":"synthetic/unknown","productRef":"synthetic/product/growth","quantity":1,"unitPrice":{"amount":"5900","currency":"USD"},"status":"active"}]}'),
 ('amount',pg_temp.lifecycle_owner(),'{}'),('currency',pg_temp.lifecycle_owner(),'{}'),
 ('plan',pg_temp.lifecycle_owner(),'{}'),('cadence',pg_temp.lifecycle_owner(),'{}'),('seat',pg_temp.lifecycle_owner(),'{}'),
 ('missing-facts',pg_temp.lifecycle_owner(),'{}'),('paused',pg_temp.lifecycle_owner(),'{}'),
 ('regression',pg_temp.lifecycle_owner(),'{}'),('unpaid-period',pg_temp.lifecycle_owner(),'{}'),
 ('two-payments',pg_temp.lifecycle_owner(),'{}'),('atomic',pg_temp.lifecycle_owner(),'{}');
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,label)||delta),'manual_review','unknown price manual review') from negative_cases where label='unknown-price';
select is(pg_temp.lifecycle_dispatch(jsonb_set(pg_temp.lifecycle_observation(u,label),'{items,0,unitPrice,amount}','"5901"')),'manual_review','amount mismatch') from negative_cases where label='amount';
select is(pg_temp.lifecycle_dispatch(jsonb_set(pg_temp.lifecycle_observation(u,label),'{items,0,unitPrice,currency}','"EUR"')),'manual_review','currency mismatch') from negative_cases where label='currency';
select is(pg_temp.lifecycle_dispatch(jsonb_set(jsonb_set(pg_temp.lifecycle_observation(u,label),'{items,0,priceRef}',to_jsonb(m.provider_price_ref::text)),'{items,0,productRef}',to_jsonb(m.provider_product_ref::text))),'manual_review','different plan rejected') from negative_cases cross join billing_price_mappings m where label='plan' and m.canonical_key='scale' and m.cadence='monthly' and m.status='active';
select is(pg_temp.lifecycle_dispatch(jsonb_set(jsonb_set(pg_temp.lifecycle_observation(u,label),'{items,0,priceRef}',to_jsonb(m.provider_price_ref::text)),'{items,0,productRef}',to_jsonb(m.provider_product_ref::text))),'manual_review','annual cadence rejected') from negative_cases cross join billing_price_mappings m where label='cadence' and m.canonical_key='growth' and m.cadence='annual' and m.status='active';
select is(pg_temp.lifecycle_dispatch(jsonb_set(pg_temp.lifecycle_observation(u,label),'{items}',(pg_temp.lifecycle_observation(u,label)->'items')||jsonb_build_array(jsonb_build_object('priceRef',m.provider_price_ref,'productRef',m.provider_product_ref,'quantity',1,'status','active','unitPrice',jsonb_build_object('amount',m.unit_amount_minor::text,'currency','USD'))))),'manual_review','additional seat rejected') from negative_cases cross join billing_price_mappings m where label='seat' and m.canonical_key='coach-seat' and m.cadence='monthly' and m.status='active';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,label)-'pausedAt'),'manual_review','missing lifecycle fact cannot grant authority') from negative_cases where label='missing-facts';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,label)||'{"status":"paused","pausedAt":"2026-10-20T00:00:00Z"}'::jsonb),'manual_review','pause unsupported') from negative_cases where label='paused';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'baseline','subscription.updated','active','2026-09-21T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')),'applied','baseline from initial settlement') from negative_cases where label='regression';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'regressed','subscription.updated','active','2026-09-22T00:00:00Z','2026-09-19T00:00:00Z','2026-10-19T00:00:00Z')),'manual_review','new timestamp cannot regress paid period') from negative_cases where label='regression';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'overdue','subscription.updated','past_due')),'applied','new unpaid period may degrade status') from negative_cases where label='unpaid-period';
select ok((pg_temp.lifecycle_counts(u)->>'end') is null,'status-only degradation cannot advance paid period') from negative_cases where label='unpaid-period';
select pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'first','transaction.completed')) from negative_cases where label='two-payments';
select pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'second','transaction.completed')) from negative_cases where label='two-payments';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'ambiguous')),'manual_review','two payments cannot be arbitrarily selected') from negative_cases where label='two-payments';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'paid','transaction.completed')),'pending','atomic fixture retained transaction') from negative_cases where label='atomic';
select pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'renew')) from negative_cases where label='atomic';
create function pg_temp.reject_lifecycle_write() returns trigger language plpgsql as $$ begin raise exception 'SYNTHETIC_ATOMIC_FAILURE'; end $$;
create trigger synthetic_atomic_failure before update on billing_subscriptions_v2 for each row execute function pg_temp.reject_lifecycle_write();
select throws_ok($$select pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'renew')) from negative_cases where label='atomic'$$,'P0001','SYNTHETIC_ATOMIC_FAILURE','late failure propagates and rolls back');
drop trigger synthetic_atomic_failure on billing_subscriptions_v2;
select is(pg_temp.lifecycle_counts(u)->>'renewals','0','late failure rolls back ledger') from negative_cases where label='atomic';
select ok((pg_temp.lifecycle_counts(u)->>'end') is null,'late failure rolls back canonical period') from negative_cases where label='atomic';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'renew')),'applied','retained evidence retries after atomic failure') from negative_cases where label='atomic';
select throws_ok($$select billing_paddle_timestamp_v1('"2026-02-30T00:00:00Z"')$$,'P0001','PADDLE_LIFECYCLE_TIMESTAMP','SQL rejects invalid calendar date');
select throws_ok($$select billing_paddle_timestamp_v1('"2026-09-20T24:00:00Z"')$$,'P0001','PADDLE_LIFECYCLE_TIMESTAMP','SQL rejects hour rollover');
select throws_ok($$select billing_paddle_timestamp_v1('"2026-09-20T00:00:60Z"')$$,'P0001','PADDLE_LIFECYCLE_TIMESTAMP','SQL rejects leap second rollover');
select ok(not exists(select 1 from pg_proc p,lateral aclexplode(p.proacl) acl where p.oid='reconcile_paddle_lifecycle_event_v1(uuid)'::regprocedure and acl.grantee=0),'PUBLIC execution denied');

-- Historical raw payloads already contained these fields; the old projection
-- did not. Added fields cannot rewrite old evidence on exact/redelivered replay.
select is(pg_temp.webhook_ingest(pg_temp.auto_observation(u,'transaction.completed')||'{"origin":"web","billingPeriod":null}'::jsonb,
 encode(extensions.digest(pg_temp.auto_observation(u,'transaction.completed')::text,'sha256'),'hex'))->>'reused','true','legacy raw delivery replay accepts new projection') from cases where label='sub-first';
select is(pg_temp.webhook_ingest(pg_temp.auto_observation(u,'transaction.completed')||'{"origin":"web","billingPeriod":null,"notificationRef":"synthetic/legacy-redelivery"}'::jsonb)->>'reused','true','legacy new delivery preserves old projection') from cases where label='sub-first';
select ok(not (observation ? 'origin'),'legacy observation stays immutable') from billing_paddle_event_observations po join cases c on po.observation->>'transactionRef'='synthetic/txn/'||c.u where c.label='sub-first';
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'post-renewal-active','subscription.updated','active','2026-10-21T00:00:00Z')),'applied','same paid period refresh needs no second payment') from cases where label='sub-first';
select is(pg_temp.lifecycle_counts(u)->>'renewals','1','status refresh never reconsumes renewal transaction') from cases where label='sub-first';
create temp table replay_audit as select count(*) n from account_subscription_events;
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'post-renewal-active','subscription.updated','active','2026-10-21T00:00:00Z')),'reused','status replay reused') from cases where label='sub-first';
select is((select count(*) from account_subscription_events),(select n from replay_audit),'status replay appends no canonical event');

select throws_ok($$select pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'wrong-customer','transaction.completed')||'{"customerRef":"synthetic/other-customer"}'::jsonb) from cases where label='mismatch'$$,'P0001','PADDLE_INGRESS_IDENTITY_CONFLICT','different renewal customer fails closed');
select throws_ok($$insert into billing_payment_applications_v2(provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind)
 select p.provider,p.environment,p.provider_transaction_ref,p.billing_account_id,p.subscription_id,p.evidence_id,'renewal'
 from billing_payment_applications_v2 p join billing_subscriptions_v2 s on s.id=p.subscription_id join cases c on s.provider_subscription_ref='synthetic/sub/'||c.u
 where c.label='mismatch' and p.application_kind='initial_purchase'$$,'P0001','PADDLE_LIFECYCLE_FACTS_REQUIRED','initial proof cannot be relabeled as renewal payment');
update account_subscriptions set status='grace',status_changed_at=clock_timestamp() where id=(select canonical from cases where label='cancel');
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'canonical-conflict')),'manual_review','unexpected canonical state fails closed') from cases where label='cancel';

create temp table initial_with_fields as select pg_temp.auto_checkout() u;
select pg_temp.webhook_ingest(pg_temp.auto_observation(u,'transaction.completed')||'{"origin":"web","billingPeriod":{"startsAt":"2026-09-20T00:00:00Z","endsAt":"2026-10-20T00:00:00Z"}}'::jsonb) from initial_with_fields;
select pg_temp.auto_ingest(u,'subscription.created') from initial_with_fields;
select is(pg_temp.auto_dispatch(u,'subscription.created'),'applied','new observation fields preserve initial purchase authority') from initial_with_fields;
select is(pg_temp.lifecycle_counts(u)->>'renewals','0','initial origin does not create renewal application') from initial_with_fields;

create temp table offset_case as select pg_temp.lifecycle_owner() u;
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'offset-paid','transaction.completed')||'{"billingPeriod":{"startsAt":"2026-10-20T03:00:00+03:00","endsAt":"2026-11-20T00:00:00.000Z"}}'::jsonb),'pending','offset transaction waits for subscription') from offset_case;
select is(pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'offset-sub')),'applied','equivalent period instants pair across offset and precision spelling') from offset_case;
select is(pg_temp.lifecycle_counts(u)->>'renewals','1','equivalent period yields one renewal') from offset_case;
select * from finish();
rollback;
