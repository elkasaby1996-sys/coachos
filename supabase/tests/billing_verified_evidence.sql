begin;
select no_plan();
set local client_min_messages=warning;
\ir fixtures/billing_verified_proof_fixture.psql
\ir fixtures/billing_cross_ledger_helpers.psql

grant select on proof_vectors to anon,authenticated,service_role;
create temp table proof_owner as select pg_temp.guard_owner() u;
insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref)
select a.id,'paddle',e,'synthetic/customer' from billing_accounts a join proof_owner o on a.owner_user_id=o.u cross join unnest(array['test','live']) e;
insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref,provider_status)
select billing_account_id,id,provider,environment,'synthetic/subscription','active' from billing_customers_v2;
create temp table proof_before as select
 (select jsonb_agg(to_jsonb(s) order by id) from billing_subscriptions_v2 s) subscriptions,
 (select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from account_subscriptions s) canonical,
 (select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts) entitlements,
 (select to_jsonb(p) from billing_runtime_policy p) policy;
create temp table proof_results(kind text,env text,result jsonb);
grant insert,select on proof_results to service_role;

set local role service_role;
insert into proof_results values('event','test',record_verified_billing_event_v2(pg_temp.proof('event'),repeat('1',64),'synthetic/notification'));
insert into proof_results values('subscription','test',record_verified_billing_subscription_v2(pg_temp.proof('subscription')));
insert into proof_results values('transaction','test',record_verified_billing_transaction_v2(pg_temp.proof('transaction')));
insert into proof_results values('event','live',record_verified_billing_event_v2(pg_temp.proof('event','live'),repeat('1',64),'synthetic/notification'));
insert into proof_results values('subscription','live',record_verified_billing_subscription_v2(pg_temp.proof('subscription','live')));
insert into proof_results values('transaction','live',record_verified_billing_transaction_v2(pg_temp.proof('transaction','live')));
reset role;
select is((select count(*) from billing_verified_evidence_v2),6::bigint,'service writers persist all three proof kinds in both environments');
select is((select count(*) from billing_verified_evidence_v2 where payment_authority),0::bigint,'no retained evidence has payment authority');
select is((select count(*) from billing_verified_evidence_v2 where subscription_id is not null and billing_account_id=(select id from billing_accounts)),6::bigint,'SQL binds stored scope/account/subscription');
select is(record_verified_billing_event_v2(pg_temp.proof('event'),repeat('1',64),'synthetic/notification')->>'id',(select result->>'id' from proof_results where kind='event' and env='test'),'event retry returns same row');
select is(record_verified_billing_subscription_v2(pg_temp.proof('subscription'))->>'reused','true','API subscription evidence deduplicates');
select is(record_verified_billing_transaction_v2(pg_temp.proof('transaction'))->>'reused','true','transaction evidence deduplicates');
select lives_ok($$select record_verified_billing_event_v2(pg_temp.proof('event'),repeat('2',64),'synthetic/notification-2')$$,'same logical event new delivery digest retained');
select is((select count(distinct logical_key) from billing_verified_evidence_v2 where proof_kind='event' and environment='test'),1::bigint,'delivery changes do not change logical event identity');
select is((select count(distinct replay_key) from billing_verified_evidence_v2 where proof_kind='event' and environment='test'),2::bigint,'delivery replay identities stay separate');
select throws_ok($$select record_verified_billing_event_v2(jsonb_set(pg_temp.proof('event'),'{eventEvidence,eventName}','"other.event"'),repeat('1',64),'synthetic/notification')$$,
 'P0001','BILLING_PROOF_REPLAY_CONFLICT','same logical event conflicting semantics fails closed');
select throws_ok($$select record_verified_billing_event_v2(jsonb_set(pg_temp.proof('event'),'{eventEvidence,eventName}','"other.event"'),repeat('3',64),'new-notification')$$,
 'P0001','BILLING_PROOF_REPLAY_CONFLICT','changed raw digest cannot evade semantic event conflict');
select throws_ok($$select record_verified_billing_subscription_v2(jsonb_set(pg_temp.proof('subscription'),'{subscriptionEvidence,providerStatus}','"paused"'))$$,
 'P0001','BILLING_PROOF_REPLAY_CONFLICT','equal API revision differing observation conflicts');
select throws_ok($$select record_verified_billing_transaction_v2(jsonb_set(pg_temp.proof('transaction'),'{transactionEvidence,providerOrigin}','"different-origin"'))$$,
 'P0001','BILLING_PROOF_REPLAY_CONFLICT','equal transaction revision differing facts conflicts');
select lives_ok($$select record_verified_billing_subscription_v2(jsonb_set(pg_temp.proof('subscription'),'{subscriptionEvidence,providerUpdatedAt}','"2026-09-01T10:02:00.000Z"'))$$,'new actual API revision may be retained');
select is((select count(distinct replay_algorithm) from billing_verified_evidence_v2),2::bigint,'webhook and API replay namespaces distinct');
select ok((select bool_and(raw_payload_sha256 is null and provider_notification_ref is null) from billing_verified_evidence_v2 where source_kind='api_reconciliation'),'API evidence has no fabricated raw hash/notification');
select is((select count(distinct commercial_effect_key) from billing_verified_evidence_v2 where proof_kind='transaction'),2::bigint,'commercial effect correlation remains environment scoped');
select ok((select bool_and(commercial_effect_key is null) from billing_verified_evidence_v2 where proof_kind<>'transaction'),'event names/subscription observations never establish payment effect identity');
select ok((select bool_and(normalized_sha256=encode(extensions.digest(proof::text,'sha256'),'hex')) from billing_verified_evidence_v2),'normalized digest computed by SQL from retained closed proof');
select is(record_verified_billing_subscription_v2(jsonb_set(pg_temp.proof('subscription'),'{subscriptionEvidence,items}',jsonb_build_array(pg_temp.proof('subscription')#>'{subscriptionEvidence,items,1}',pg_temp.proof('subscription')#>'{subscriptionEvidence,items,0}'))) ->>'reused','true','item set order is not replay identity');

select throws_ok($$select record_verified_billing_subscription_v2(pg_temp.proof('subscription')||'{"verified":true}')$$,'P0001','BILLING_PROOF_INVALID','unknown top-level field rejected');
select throws_ok($$select record_verified_billing_subscription_v2(pg_temp.proof('subscription')-'identity')$$,'P0001','BILLING_PROOF_INVALID','missing identity rejected');
select throws_ok($$select record_verified_billing_subscription_v2(jsonb_set(pg_temp.proof('subscription'),'{identity,customerRef}','null'))$$,'P0001','BILLING_PROOF_INVALID','null customer identity rejected');
select throws_ok($$select record_verified_billing_subscription_v2(jsonb_set(pg_temp.proof('subscription'),'{identity,customerRef}','"wrong-customer"'))$$,'P0001','BILLING_PROOF_IDENTITY_MISMATCH','stored customer re-read, caller identity cannot reassign');
select throws_ok($$select record_verified_billing_transaction_v2(jsonb_set(pg_temp.proof('transaction'),'{identity,subscriptionRef}','"unknown-subscription"'))$$,'P0001','BILLING_PROOF_SUBSCRIPTION_NOT_FOUND','API transaction requires stored subscription');
select throws_ok($$select record_verified_billing_subscription_v2(pg_temp.proof('subscription')||'{"provider":"lemonsqueezy"}')$$,'P0001','BILLING_PROOF_INVALID','wrong provider rejected');
select throws_ok($$select record_verified_billing_subscription_v2(pg_temp.proof('subscription')||'{"environment":"sandbox"}')$$,'P0001','BILLING_PROOF_INVALID','environment vocabulary exact');
select throws_ok($$select record_verified_billing_subscription_v2(pg_temp.proof('subscription')||'{"schema":"billing-foundation-v1","validator":"structure-only-v1"}')$$,'P0001','BILLING_PROOF_INVALID','foundation version cannot become verified evidence');
select throws_ok($$select record_verified_billing_transaction_v2(pg_temp.proof('subscription'))$$,'P0001','BILLING_PROOF_INVALID','active subscription observation cannot become transaction proof');
select throws_ok($$select record_verified_billing_transaction_v2(pg_temp.proof('event'))$$,'P0001','BILLING_PROOF_INVALID','transaction-paid event cannot become payment proof');
select throws_ok($$select record_verified_billing_transaction_v2(jsonb_set(pg_temp.proof('transaction'),'{transactionEvidence,completedAt}','null'))$$,'P0001','BILLING_PROOF_INVALID','created/updated times do not substitute for actual completion time');
select throws_ok($$select record_verified_billing_transaction_v2(jsonb_set(pg_temp.proof('transaction'),'{transactionEvidence,paidMinor}','1'))$$,'P0001','BILLING_PROOF_INVALID','incomplete payment facts rejected');
select throws_ok($$select record_verified_billing_transaction_v2(jsonb_set(pg_temp.proof('transaction'),'{transactionEvidence,adjustmentRefs}','["synthetic/refund"]'))$$,'P0001','BILLING_PROOF_INVALID','unreviewed adjustment cases rejected');
select throws_ok($$select record_verified_billing_transaction_v2(jsonb_set(pg_temp.proof('transaction'),'{transactionEvidence,items,0,extra}','true'))$$,'P0001','BILLING_PROOF_INVALID','nested unsupported item field rejected');
select throws_ok($$select record_verified_billing_event_v2(pg_temp.proof('event'),null,null)$$,'P0001','BILLING_PROOF_INVALID','webhook raw digest required');
select throws_ok($$select record_verified_billing_event_v2(pg_temp.proof('event'),repeat('A',64),null)$$,'P0001','BILLING_PROOF_INVALID','raw hash format exact');
select throws_ok($$select billing_v2_proof_record(pg_temp.proof('subscription'),'subscription',repeat('1',64),null)$$,'P0001','BILLING_PROOF_INVALID','API must not fabricate raw payload digest');

select throws_ok($$update billing_verified_evidence_v2 set proof=jsonb_set(proof,'{identity,customerRef}','"tampered"')$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','evidence immutable');
select throws_ok($$update billing_verified_evidence_v2 set payment_authority=true$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','authority cannot be promoted');
select throws_ok($$delete from billing_verified_evidence_v2$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','evidence cannot be deleted');
select throws_ok($$truncate billing_verified_evidence_v2 cascade$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','evidence cannot be truncated');
select ok((select relrowsecurity from pg_class where oid='billing_verified_evidence_v2'::regclass),'verified ledger uses RLS');
select ok(not has_table_privilege(r,'billing_verified_evidence_v2','SELECT,INSERT,UPDATE,DELETE'),r||' no direct evidence privileges') from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_function_privilege(r,p.oid,'EXECUTE'),r||' no private helper execute: '||p.proname) from pg_proc p cross join unnest(array['anon','authenticated','service_role']) r
where p.pronamespace='public'::regnamespace and p.proname like 'billing_v2_proof_%';
select ok(p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public'] and has_function_privilege('service_role',p.oid,'EXECUTE')
 and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE'),'fixed search path and explicit service-only RPC: '||p.proname)
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('record_verified_billing_event_v2','record_verified_billing_subscription_v2','record_verified_billing_transaction_v2');
set local role anon;
select throws_ok($$select record_verified_billing_event_v2(pg_temp.proof('event'),repeat('1',64),null)$$,'42501',null,'anon cannot submit caller JSON');
select throws_ok($$insert into billing_verified_evidence_v2(provider) values('paddle')$$,'42501',null,'anon direct DML denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select record_verified_billing_transaction_v2(pg_temp.proof('transaction'))$$,'42501',null,'forged service JWT claim cannot call service RPC');
select throws_ok($$insert into billing_verified_evidence_v2(provider) values('paddle')$$,'42501',null,'authenticated direct DML denied');
reset role;
-- Test independent original-role validation even if an ACL is accidentally widened.
grant execute on function record_verified_billing_subscription_v2(jsonb) to authenticated;
set local role authenticated;
select throws_ok($$select record_verified_billing_subscription_v2(pg_temp.proof('subscription'))$$,'42501','BILLING_PROOF_FORBIDDEN','original database role checked independently of ACL/JWT');
reset role;
revoke execute on function record_verified_billing_subscription_v2(jsonb) from authenticated;
set local role service_role;
select throws_ok($$insert into billing_verified_evidence_v2(provider) values('paddle')$$,'42501',null,'service direct DML still denied');
select throws_ok($$select billing_v2_proof_record(pg_temp.proof('subscription'),'subscription')$$,'42501',null,'service cannot invoke internal generic helper');
select throws_ok($$insert into billing_payment_applications_v2(provider) values('paddle')$$,'42501',null,'no service payment-application path');
reset role;

-- Unknown scoped event may be retained without trusting owner metadata.
select lives_ok($$select record_verified_billing_event_v2(jsonb_set(jsonb_set(pg_temp.proof('event'),'{eventEvidence,eventRef}','"unknown/event"'),'{identity,subscriptionRef}','"unknown/subscription"'),repeat('4',64),null)$$,'unknown event retained unlinked');
select is((select count(*) from billing_verified_evidence_v2 where subscription_id is null),1::bigint,'unknown event cannot bind an arbitrary canonical account');
select is((select jsonb_agg(to_jsonb(s) order by id) from billing_subscriptions_v2 s),(select subscriptions from proof_before),'evidence writers never mutate provider subscription state');
select is((select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from account_subscriptions s),(select canonical from proof_before),'canonical state unchanged');
select is((select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts),(select entitlements from proof_before),'entitlements unchanged');
select is((select to_jsonb(p) from billing_runtime_policy p),(select policy from proof_before),'runtime policy and both disabled flags unchanged');
select is((select count(*) from billing_payment_applications_v2),0::bigint,'no payment applications created');
select is((select count(*) from billing_subscriptions_v2 where account_subscription_id is not null or approved_additional_coach_seats<>0),0::bigint,'canonical linkage and seats remain impossible');
select throws_ok($$update billing_subscriptions_v2 set approved_additional_coach_seats=1 where environment='test'$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','verified transaction does not remove seat hard stop');
select ok(exists(select 1 from pg_constraint where conrelid='billing_subscriptions_v2'::regclass and conname='billing_v2_canonical_link_disabled'),'canonical NULL CHECK retained');
select ok(exists(select 1 from pg_constraint where conrelid='billing_subscriptions_v2'::regclass and conname='billing_v2_seat_approval_disabled'),'approved-seat zero CHECK retained');
select is((select count(*) from pg_constraint where conrelid='billing_payment_applications_v2'::regclass and confrelid='billing_verified_evidence_v2'::regclass),0::bigint,'new verified ledger has no payment-application FK path');
select * from finish();
rollback;
