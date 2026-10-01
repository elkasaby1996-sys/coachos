begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/paddle_recovery_fixture.psql

create temp table payment_method_cases(label text,u uuid,preparation uuid,authority text);
insert into payment_method_cases(label,u) values('active',pg_temp.plan_owner()),('past_due',pg_temp.recovery_owner());
select is(resolve_billing_outstanding_obligation_v1((select account_subscription_id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/'||u))->>'reason',
 'incomplete_evidence','past due status without debt evidence is unavailable') from payment_method_cases where label='past_due';
select pg_temp.recovery_dispatch(pg_temp.recovery_observation(u,'payment-method-debt')) from payment_method_cases where label='past_due';
select is(resolve_owned_billing_payment_method_context_v1(u)->>'mode',
 case label when 'active' then 'update_only' else 'settle_existing_balance' end,
 'trusted mode is derived from canonical and obligation evidence: '||label) from payment_method_cases;
update payment_method_cases set authority=resolve_owned_billing_payment_method_context_v1(u)->>'authorityRevision';
select is(length(authority),64,'authority revision is a SHA-256 binding: '||label) from payment_method_cases;
update payment_method_cases set preparation=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is((select status from billing_payment_method_preparations_v2 where id=preparation),'creating','begin creates one reservation: '||label) from payment_method_cases;
select is((begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid,preparation,'repeated activation reuses creating reservation: '||label) from payment_method_cases;
select is((select count(*)::text from billing_payment_method_preparations_v2 where canonical_subscription_id=(select account_subscription_id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/'||u)),'1','one open preparation: '||label) from payment_method_cases;
select is(claim_billing_payment_method_dispatch_v1(u,preparation,repeat('a',64))->>'dispatch','true','first claim grants dispatch: '||label) from payment_method_cases;
select throws_ok($q$select claim_billing_payment_method_dispatch_v1(u,preparation,repeat('b',64)) from payment_method_cases where label='active'$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','a second claim cannot dispatch');
select is(begin_billing_payment_method_preparation_v1(u)->>'claimed','true','claimed creating reservation cannot be redispatched: '||label) from payment_method_cases;
select is((select count(*)::text from billing_payment_applications_v2 p join billing_payment_method_preparations_v2 m on m.subscription_id=p.subscription_id where m.id=preparation and p.application_kind='renewal'),
 '0','preparation does not create a renewal application: '||label) from payment_method_cases;

select is(fail_billing_payment_method_preparation_v1(preparation,repeat('a',64),'provider_ambiguous')->>'status','ambiguous',
 'claimed failure remains ambiguous') from payment_method_cases where label='active';
select throws_ok($q$select begin_billing_payment_method_preparation_v1(u) from payment_method_cases where label='active'$q$,
 'P0001','BILLING_PAYMENT_METHOD_AMBIGUOUS','ambiguous preparation blocks redispatch');
select is((select count(*)::text from billing_payment_method_preparations_v2 where created_by_user_id=u),'1',
 'ambiguous claim is retained exactly once') from payment_method_cases where label='active';

select ok(not has_table_privilege('authenticated','billing_payment_method_preparations_v2','select'),
 'authenticated cannot select private preparation rows');
select ok(not has_table_privilege('service_role','billing_payment_method_preparations_v2','insert'),
 'service uses narrow RPCs, not direct table writes');
select ok(not has_function_privilege('authenticated','resolve_owned_billing_payment_method_context_v1(uuid)','execute'),
 'private resolver is not browser-callable');
select ok(has_function_privilege('service_role','resolve_owned_billing_payment_method_context_v1(uuid)','execute'),
 'service can resolve trusted identity');
select ok(has_function_privilege('authenticated','get_my_billing_payment_method_state_v1()','execute'),
 'owner may call reference-free projection');
select set_config('request.jwt.claim.sub',(select u::text from payment_method_cases where label='past_due'),true);
set local role authenticated;
select is(get_my_billing_payment_method_state_v1()->>'available','false',
 'authenticated safe state does not advertise a claimed provider dispatch');
select ok(position('synthetic' in get_my_billing_payment_method_state_v1()::text)=0,
 'owner projection contains no provider references');
reset role;
select is((select count(*)::text from billing_payment_applications_v2 p where p.provider_transaction_ref in
 (select provider_transaction_ref from billing_payment_method_preparations_v2 where provider_transaction_ref is not null)),
 '0','preparation has no consumed financial transaction');
select throws_ok($q$select authorize_billing_payment_method_continuation_v1(
 (select u from payment_method_cases where label='past_due'),
 (select preparation from payment_method_cases where label='active'))$q$,
 'P0001','BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED','another owner cannot authorize the preparation');
select throws_ok($q$select claim_billing_payment_method_dispatch_v1(
 (select u from payment_method_cases where label='past_due'),
 (select preparation from payment_method_cases where label='active'),repeat('c',64))$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','another owner cannot claim a dispatch');
select throws_ok($q$update billing_payment_method_preparations_v2 set provider_customer_ref='synthetic/forged'
 where id=(select preparation from payment_method_cases where label='past_due')$q$,
 'P0001','BILLING_PAYMENT_METHOD_IMMUTABLE','trusted provider identity is immutable');
select throws_ok($q$update billing_payment_method_preparations_v2 set dispatch_token_sha256=repeat('c',64)
 where id=(select preparation from payment_method_cases where label='past_due')$q$,
 'P0001','BILLING_PAYMENT_METHOD_IMMUTABLE','a committed dispatch claim cannot be replaced');
update billing_runtime_policy set paddle_reconciliation_enabled=false where id=1;
select throws_ok($q$select resolve_owned_billing_payment_method_context_v1(u) from payment_method_cases where label='past_due'$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','disabled reconciliation denies trusted context');
select throws_ok($q$select begin_billing_payment_method_preparation_v1(u) from payment_method_cases where label='past_due'$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','disabled reconciliation denies reservation and dispatch');
select is((select count(*)::text from billing_payment_method_preparations_v2 where created_by_user_id=(select u from payment_method_cases where label='past_due')),
 '1','policy denial creates no second preparation');
update billing_runtime_policy set paddle_reconciliation_enabled=true where id=1;

-- Active authority must validate retained subscription history at every
-- resolver-backed boundary. These fixtures use authenticated production ingress.
create temp table history_before_begin as select pg_temp.plan_owner() u;
select is(resolve_owned_billing_payment_method_context_v1(u)->>'mode','update_only',
 'clean active owner remains eligible') from history_before_begin;
select ok(pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'deferred-before-begin','subscription.updated','past_due',
 '2026-10-21T10:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')) is not null,
 'authenticated unresolved subscription evidence is retained') from history_before_begin;
select throws_ok($q$select resolve_owned_billing_payment_method_context_v1(u) from history_before_begin$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','deferred subscription evidence denies active context');
select throws_ok($q$select begin_billing_payment_method_preparation_v1(u) from history_before_begin$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','unresolved history denies begin');

create temp table same_revision_conflict as select pg_temp.plan_owner() u;
select ok(pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'same-revision-active','subscription.updated','active',
 '2026-10-21T10:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')) is not null,
 'first authenticated equal-revision observation retained') from same_revision_conflict;
select ok(pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'same-revision-past-due','subscription.updated','past_due',
 '2026-10-21T10:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')) is not null,
 'contradictory authenticated equal-revision observation retained') from same_revision_conflict;
select throws_ok($q$select resolve_owned_billing_payment_method_context_v1(u) from same_revision_conflict$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','equal resource revision contradiction denies active authority');

create temp table history_before_claim as select pg_temp.plan_owner() u;
alter table history_before_claim add column p uuid;
update history_before_claim set p=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select ok(pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'deferred-before-claim','subscription.updated','past_due',
 '2026-10-21T10:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')) is not null,
 'unresolved evidence arrived between begin and claim') from history_before_claim;
select throws_ok($q$select claim_billing_payment_method_dispatch_v1(u,p,repeat('1',64)) from history_before_claim$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','unresolved history denies dispatch claim');
select is((select count(*)::text from billing_payment_method_preparations_v2 where id=p and dispatch_token_sha256 is null),'1',
 'denied claim did not dispatch') from history_before_claim;

create temp table history_before_result as select pg_temp.plan_owner() u;
alter table history_before_result add column p uuid;
update history_before_result set p=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,p,repeat('2',64))->>'dispatch','true',
 'clean active authority permits one committed claim') from history_before_result;
select ok(pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'deferred-before-result','subscription.updated','past_due',
 '2026-10-21T10:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')) is not null,
 'unresolved evidence arrived between claim and result') from history_before_result;
select throws_ok($q$select record_billing_payment_method_preparation_result_v1(u,p,repeat('2',64),
 'txn_'||repeat('2',26),'paddle-payment-method-transaction-v1',repeat('3',64)) from history_before_result$q$,
 'P0001','BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED','unresolved history denies result attachment');

create temp table history_before_release as select pg_temp.plan_owner() u;
alter table history_before_release add column p uuid;
update history_before_release set p=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
select is(claim_billing_payment_method_dispatch_v1(u,p,repeat('4',64))->>'dispatch','true',
 'release fixture has one committed claim') from history_before_release;
select is(record_billing_payment_method_preparation_result_v1(u,p,repeat('4',64),
 'txn_'||repeat('4',26),'paddle-payment-method-transaction-v1',repeat('5',64))->>'status','ready',
 'release fixture attached a validated result') from history_before_release;
select ok(pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'deferred-before-release','subscription.updated','past_due',
 '2026-10-21T10:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')) is not null,
 'unresolved evidence arrived after attachment') from history_before_release;
select throws_ok($q$select authorize_billing_payment_method_continuation_v1(u,p) from history_before_release$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','unresolved history withholds continuation');

create temp table superseded_history as select pg_temp.plan_owner() u;
select ok(pg_temp.lifecycle_ingest(pg_temp.lifecycle_observation(u,'older-audit','subscription.updated','active',
 '2026-09-20T09:59:59Z','2026-08-20T00:00:00Z','2026-09-20T00:00:00Z')) is not null,
 'signed older audit history remains retained') from superseded_history;
select is(resolve_owned_billing_payment_method_context_v1(u)->>'mode','update_only',
 'provably superseded history does not permanently block active authority') from superseded_history;

-- Reproduce the review's physical-order change with the same production
-- evidence writer used by migration 181's equivalent applied-history cases.
-- All provenance/facts/INSERT guards run; no retained evidence is rewritten.
create temp table revision_hash_cases(
 label text,u uuid,p uuid,stamp timestamptz,a jsonb,b jsonb,before_ctx jsonb,after_ctx jsonb,
 before_history text,after_history text,before_spelling text,after_spelling text,ready_before boolean);
do $$declare label text;u uuid;p uuid;a jsonb;b jsonb;ev uuid;stamp timestamptz;
 whole text;positive text;negative text;first_spelling text;second_spelling text;idx integer:=0;
begin
 foreach label in array array['positive-offset','negative-offset','fraction-padding','nanosecond'] loop
  u:=pg_temp.plan_owner();stamp:=date_trunc('second',clock_timestamp()+interval '1 minute');
  whole:=to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS');
  positive:=to_char((stamp+interval '3 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS');
  negative:=to_char((stamp-interval '5 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS');
  first_spelling:=case label when 'fraction-padding' then whole||'.1Z'
   when 'nanosecond' then positive||'.123456799+03:00' else positive||'.100000000+03:00' end;
  second_spelling:=case label when 'negative-offset' then negative||'.100000000-05:00'
   when 'fraction-padding' then whole||'.100000000Z'
   when 'nanosecond' then whole||'.123456799Z' else whole||'.1Z' end;
  b:=pg_temp.lifecycle_observation(u,'hash-first-'||label,'subscription.updated','active',
   to_char((stamp+interval '1 second') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
   '2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')||jsonb_build_object('updatedAt',first_spelling);
  a:=b||jsonb_build_object('eventRef','synthetic/hash-second/'||label||'/'||u,
   'notificationRef','synthetic/hash-second/'||label||'/'||u,'updatedAt',second_spelling);
  ev:=pg_temp.lifecycle_ingest(b);perform billing_paddle_lifecycle_evidence_v1(ev,null,'subscription');
  ev:=pg_temp.lifecycle_ingest(a);perform billing_paddle_lifecycle_evidence_v1(ev,null,'subscription');
  p:=(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid;
  if claim_billing_payment_method_dispatch_v1(u,p,repeat('8',64))->>'dispatch'<>'true'
   or record_billing_payment_method_preparation_result_v1(u,p,repeat('8',64),'txn_'||repeat(chr(104+idx),26),
    'paddle-payment-method-transaction-v1',repeat('9',64))->>'status'<>'ready'
  then raise exception 'HASH_FIXTURE_PREPARATION';end if;
  insert into revision_hash_cases(label,u,p,stamp,a,b,before_ctx,before_history,before_spelling,ready_before)
  values(label,u,p,stamp,a,b,resolve_owned_billing_payment_method_context_v1(u),
   (select encode(extensions.digest(jsonb_agg(to_jsonb(o) order by event_id)::text,'sha256'),'hex')
    from billing_paddle_event_observations o where observation->>'subscriptionRef'=a->>'subscriptionRef'),
   billing_paddle_seat_resource_updated_at_v1((select id from billing_subscriptions_v2 where provider_subscription_ref=a->>'subscriptionRef')),
   authorize_billing_payment_method_continuation_v1(u,p)->>'status'='ready');
  idx:=idx+1;
 end loop;
end$$;
select ok(billing_paddle_seat_resource_state_v1(a)=billing_paddle_seat_resource_state_v1(b),
 label||' has equivalent authenticated resource state') from revision_hash_cases;
select is(before_ctx->>'resourceRevisionKey',billing_paddle_seat_timestamp_key_v1(a->'updatedAt'),
 label||' snapshot binds the existing exact UTC revision key') from revision_hash_cases;
select ok(not (before_ctx ? 'resourceUpdatedAt'),
 label||' raw revision spelling is not a hash authority field') from revision_hash_cases;
select ok(ready_before,label||' continuation is authorized before physical reorder') from revision_hash_cases;

create index payment_method_hash_physical_order on public.billing_paddle_event_observations
 (((observation->>'updatedAt') collate "C"));
cluster public.billing_paddle_event_observations using payment_method_hash_physical_order;
update revision_hash_cases set after_ctx=resolve_owned_billing_payment_method_context_v1(u),
 after_history=(select encode(extensions.digest(jsonb_agg(to_jsonb(o) order by event_id)::text,'sha256'),'hex')
  from billing_paddle_event_observations o where observation->>'subscriptionRef'=a->>'subscriptionRef'),
 after_spelling=billing_paddle_seat_resource_updated_at_v1(
  (select id from billing_subscriptions_v2 where provider_subscription_ref=a->>'subscriptionRef'));
select ok(before_spelling is distinct from after_spelling,
 label||' physical reorder changes the raw winning spelling') from revision_hash_cases;
select is(after_history,before_history,label||' retained evidence bytes are unchanged') from revision_hash_cases;
select is(billing_paddle_seat_timestamp_key_v1(to_jsonb(after_spelling)),
 billing_paddle_seat_timestamp_key_v1(to_jsonb(before_spelling)),
 label||' selected spellings retain the same exact instant') from revision_hash_cases;
select is(after_ctx->>'authorityRevision',before_ctx->>'authorityRevision',
 label||' authority hash is independent of spelling and heap order') from revision_hash_cases;
select is(after_ctx,before_ctx,label||' complete private authority snapshot remains identical') from revision_hash_cases;
select is(authorize_billing_payment_method_continuation_v1(u,p)->>'status','ready',
 label||' equivalent ordering does not withhold continuation') from revision_hash_cases;

-- Distinct instants still change authority. An unresolved older observation
-- remains subject to the original history guard, rather than being equated.
create temp table exact_revision_change as select *,null::jsonb newer_ctx,null::jsonb newer_observation
 from revision_hash_cases where label='nanosecond';
do $$declare r record;o jsonb;ev uuid;begin
 for r in select * from exact_revision_change loop
  o:=r.a||jsonb_build_object('eventRef','synthetic/hash-newer/'||r.u,'notificationRef','synthetic/hash-newer/'||r.u,
   'occurredAt',to_char((r.stamp+interval '2 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
   'updatedAt',to_char(r.stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'.123456800Z');
  ev:=pg_temp.lifecycle_ingest(o);perform billing_paddle_lifecycle_evidence_v1(ev,null,'subscription');
  update exact_revision_change set newer_ctx=resolve_owned_billing_payment_method_context_v1(r.u),newer_observation=o where u=r.u;
 end loop;
end$$;
select is((newer_ctx->>'resourceRevisionKey')::numeric-(before_ctx->>'resourceRevisionKey')::numeric,
 1::numeric,'1 ns newer revision is distinct in the authority snapshot') from exact_revision_change;
select ok(newer_ctx->>'authorityRevision'<>before_ctx->>'authorityRevision',
 '1 ns newer applied resource revision changes the authority hash') from exact_revision_change;
select throws_ok($q$select authorize_billing_payment_method_continuation_v1(u,p) from exact_revision_change$q$,
 'P0001','BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED','a genuine exact revision change withholds the old continuation');
select ok(pg_temp.lifecycle_ingest(a||jsonb_build_object('eventRef','synthetic/hash-older-unresolved/'||u,
 'notificationRef','synthetic/hash-older-unresolved/'||u,
 'occurredAt',to_char((stamp+interval '3 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))) is not null,
 '1 ns older unresolved resource evidence is retained') from exact_revision_change;
select throws_ok($q$select resolve_owned_billing_payment_method_context_v1(u) from exact_revision_change$q$,
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','1 ns older unresolved evidence follows the existing history rules');

select * from finish();
rollback;
