begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql
\ir fixtures/paddle_webhook_fixture.psql

select pg_temp.catalogue_publish(pg_temp.catalogue(k,c))
from unnest(array['launch','growth','scale','coach-seat']) k
cross join unnest(array['monthly','annual']) c;

create temp table identity_actor as
select pg_temp.guard_owner() owner,gen_random_uuid() cert_run,gen_random_uuid() real_run;
update billing_runtime_policy set paddle_sales_enabled=true;
create temp table cert_attempt as
select owner,cert_run,begin_paddle_checkout_v1(owner,'growth','monthly',0,cert_run,true,true,'2026-09-18','2026-09-18') result
from identity_actor;
select mark_paddle_checkout_ready_v1(
 owner,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/certification-transaction',
 'ready','USD',jsonb_build_array(result->'base')
) from cert_attempt;
insert into billing_paddle_checkout_certification_fixtures(run_id,checkout_id)
select cert_run,(result->>'attemptReference')::uuid from cert_attempt;
update billing_paddle_checkout_certification_fixtures set closed_at=clock_timestamp();
update billing_checkouts_v2
set status='expired',expired_at=clock_timestamp(),error_code='PADDLE_CERTIFICATION_CLOSED',updated_at=clock_timestamp()
where id=(select (result->>'attemptReference')::uuid from cert_attempt);
create temp table real_attempt as
select owner,real_run,begin_paddle_checkout_v1(owner,'growth','monthly',0,real_run,true,true,'2026-09-18','2026-09-18') result
from identity_actor;
select mark_paddle_checkout_ready_v1(
 owner,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/real-transaction',
 'ready','USD',jsonb_build_array(result->'base')
) from real_attempt;
update billing_runtime_policy set paddle_sales_enabled=false;

create temp table old_identity as
with customer as (
 insert into billing_customers_v2(
  billing_account_id,provider,environment,provider_customer_ref,identity_source
 )
 select a.id,'paddle','test','synthetic/certification-customer','certification_fixture'
 from identity_actor x join billing_accounts a on a.owner_user_id=x.owner
 returning id,billing_account_id
), subscription as (
 insert into billing_subscriptions_v2(
  billing_account_id,customer_id,provider,environment,provider_subscription_ref,
  provider_status,provider_updated_at
 )
 select billing_account_id,id,'paddle','test','synthetic/certification-subscription',
  'active','2026-09-20T09:00:00Z'::timestamptz
 from customer returning id,customer_id,billing_account_id
)
select * from subscription;

select lives_ok($$
 select pg_temp.webhook_ingest(
  pg_temp.webhook_observation(
   'subscription.created','synthetic/certification-created','synthetic/certification-delivery',
   '2026-09-20T09:00:00.000Z'
  ) || jsonb_build_object(
   'transactionCorrelationRef','synthetic/certification-transaction',
   'customerRef','synthetic/certification-customer',
   'subscriptionRef','synthetic/certification-subscription'
  )
 )
$$,'certification lineage evidence retained');
select ok((select billing_paddle_certification_shadow_v1(customer_id,id) from old_identity),'exact fixture lineage recognized');

create temp table commercial_before as
select
 (select count(*) from account_subscriptions) canonical,
 (select count(*) from billing_payment_applications_v2) payments,
 (select count(*) from account_feature_entitlement_overrides) overrides,
 (select count(*) from account_capacity_reservations) reservations,
 (select encode(digest(to_jsonb(t)::text,'sha256'),'hex') from billing_paddle_event_observations t where observation->>'eventRef'='synthetic/certification-created') observation_digest,
 (select encode(digest(to_jsonb(t)::text,'sha256'),'hex') from billing_paddle_event_deliveries t where notification_ref='synthetic/certification-delivery') delivery_digest;

select lives_ok($$
 select pg_temp.webhook_ingest(
  pg_temp.webhook_observation(
   'subscription.created','synthetic/real-created','synthetic/real-delivery',
   '2026-09-21T10:00:00.000Z'
  ) || jsonb_build_object(
   'transactionCorrelationRef','synthetic/real-transaction',
   'customerRef','synthetic/real-customer',
   'subscriptionRef','synthetic/real-subscription'
  )
 )
$$,'verified Sandbox identity supersedes certification identity');

select is((select count(*) from billing_customers_v2 where identity_status='current'),1::bigint,'one current customer');
select is((select count(*) from billing_customers_v2 where identity_status='superseded'),1::bigint,'old customer retained');
select is((select identity_source from billing_customers_v2 where identity_status='current'),'verified_provider_event','new identity source');
select ok((select superseded_by_customer_id is not null from billing_customers_v2 where identity_status='superseded'),'old customer linked forward');
select is((select count(*) from billing_subscriptions_v2 where shadow_status='current'),1::bigint,'one current subscription');
select is((select count(*) from billing_subscriptions_v2 where shadow_status='superseded'),1::bigint,'old subscription retained');
select ok((select superseded_by_subscription_id is not null from billing_subscriptions_v2 where shadow_status='superseded'),'old subscription linked forward');
select is((select count(*) from billing_provider_identity_transitions_v2),1::bigint,'one transition ledger row');
select ok((select bool_and(environment='test' and transition_reason='certification_identity_superseded_by_verified_provider_identity') from billing_provider_identity_transitions_v2),'closed Sandbox reason');
select is((select count(*) from billing_customers_v2 where identity_status='current' and provider_customer_ref='synthetic/real-customer'),1::bigint,'new customer current');
select is((select count(*) from billing_subscriptions_v2 where shadow_status='current' and provider_subscription_ref='synthetic/real-subscription'),1::bigint,'new subscription current');

select lives_ok($$
 select pg_temp.webhook_ingest(
  pg_temp.webhook_observation(
   'subscription.created','synthetic/real-created','synthetic/real-delivery',
   '2026-09-21T10:00:00.000Z'
  ) || jsonb_build_object(
   'transactionCorrelationRef','synthetic/real-transaction',
   'customerRef','synthetic/real-customer',
   'subscriptionRef','synthetic/real-subscription'
  )
 )
$$,'exact replay is idempotent');
select is((select count(*) from billing_provider_identity_transitions_v2),1::bigint,'replay does not duplicate transition');
select is((select count(*) from billing_customers_v2),2::bigint,'replay does not duplicate customer');
select is((select count(*) from billing_subscriptions_v2),2::bigint,'replay does not duplicate subscription');

select lives_ok($$
 select pg_temp.webhook_ingest(
  pg_temp.webhook_observation(
   'subscription.updated','synthetic/stale-old','synthetic/stale-old',
   '2026-09-22T10:00:00.000Z'
  ) || jsonb_build_object(
   'customerRef','synthetic/certification-customer',
   'subscriptionRef','synthetic/certification-subscription',
   'transactionCorrelationRef',null,
   'status','paused'
  )
 )
$$,'late superseded update retained');
select is((select disposition from billing_paddle_event_observations where observation->>'eventRef'='synthetic/stale-old'),'stale','old update marked stale');
select is((select provider_status from billing_subscriptions_v2 where shadow_status='superseded'),'active','old state not rewritten');
select is((select provider_status from billing_subscriptions_v2 where shadow_status='current'),'active','new state unaffected');

select throws_ok($$
 select pg_temp.webhook_ingest(
  pg_temp.webhook_observation(
   'subscription.created','synthetic/other-real','synthetic/other-real',
   '2026-09-22T11:00:00.000Z'
  ) || jsonb_build_object(
   'transactionCorrelationRef','synthetic/real-transaction',
   'customerRef','synthetic/different-real-customer',
   'subscriptionRef','synthetic/different-real-subscription'
  )
 )
$$,'P0001','PADDLE_INGRESS_IDENTITY_CONFLICT','real to different real remains blocked');

select is((select count(*) from account_subscriptions),(select canonical from commercial_before),'canonical authority unchanged');
select is((select count(*) from billing_payment_applications_v2),(select payments from commercial_before),'payment applications unchanged');
select is((select count(*) from account_feature_entitlement_overrides),(select overrides from commercial_before),'entitlement overrides unchanged');
select is((select count(*) from account_capacity_reservations),(select reservations from commercial_before),'capacity reservations unchanged');
select is((select count(*) from billing_subscriptions_v2 where account_subscription_id is not null),0::bigint,'canonical links remain null');
select is((select coalesce(sum(approved_additional_coach_seats),0) from billing_subscriptions_v2),0::bigint,'approved seats remain zero');
select ok((select not paddle_reconciliation_enabled and not paddle_sales_enabled from billing_runtime_policy),'commercial flags remain disabled');
select is((select encode(digest(to_jsonb(t)::text,'sha256'),'hex') from billing_paddle_event_observations t where observation->>'eventRef'='synthetic/certification-created'),(select observation_digest from commercial_before),'historical observation unchanged');
select is((select encode(digest(to_jsonb(t)::text,'sha256'),'hex') from billing_paddle_event_deliveries t where notification_ref='synthetic/certification-delivery'),(select delivery_digest from commercial_before),'historical delivery unchanged');

-- Conservative classification: a structurally similar row without exact
-- retained fixture evidence remains unknown legacy.
create temp table ambiguous_customer as
with inserted as (
 insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref)
 select a.id,'paddle','live','synthetic/ambiguous-customer'
 from billing_accounts a limit 1 returning id
)
select id from inserted;
select is((select identity_source from billing_customers_v2 where id=(select id from ambiguous_customer)),'unknown_legacy','ambiguous lineage stays unknown');
select ok(not billing_paddle_certification_shadow_v1((select id from ambiguous_customer),null),'ambiguous lineage not classifiable');

-- Unknown and cross-account identities remain fail closed.
create temp table unknown_actor as
select pg_temp.guard_owner() owner,gen_random_uuid() operation;
update billing_runtime_policy set paddle_sales_enabled=true;
create temp table unknown_attempt as
select owner,operation,begin_paddle_checkout_v1(owner,'growth','monthly',0,operation,true,true,'2026-09-18','2026-09-18') result
from unknown_actor;
select mark_paddle_checkout_ready_v1(owner,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/unknown-real-transaction','ready','USD',jsonb_build_array(result->'base')) from unknown_attempt;
update billing_runtime_policy set paddle_sales_enabled=false;
with customer as (
 insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref)
 select a.id,'paddle','test','synthetic/unknown-current-customer'
 from unknown_actor u join billing_accounts a on a.owner_user_id=u.owner returning id,billing_account_id
)
insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref)
select billing_account_id,id,'paddle','test','synthetic/unknown-current-subscription' from customer;
select throws_ok($$
 select pg_temp.webhook_ingest(
  pg_temp.webhook_observation('subscription.created','synthetic/unknown-replacement','synthetic/unknown-replacement') ||
  jsonb_build_object('transactionCorrelationRef','synthetic/unknown-real-transaction','customerRef','synthetic/unknown-replacement-customer','subscriptionRef','synthetic/unknown-replacement-subscription')
 )
$$,'P0001','PADDLE_INGRESS_IDENTITY_CONFLICT','unknown legacy to different identity remains blocked');

create temp table cross_actor as
select pg_temp.guard_owner() owner,gen_random_uuid() operation;
update billing_runtime_policy set paddle_sales_enabled=true;
create temp table cross_attempt as
select owner,operation,begin_paddle_checkout_v1(owner,'growth','monthly',0,operation,true,true,'2026-09-18','2026-09-18') result
from cross_actor;
select mark_paddle_checkout_ready_v1(owner,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/cross-transaction','ready','USD',jsonb_build_array(result->'base')) from cross_attempt;
update billing_runtime_policy set paddle_sales_enabled=false;
select throws_ok($$
 select pg_temp.webhook_ingest(
  pg_temp.webhook_observation('subscription.created','synthetic/cross-created','synthetic/cross-created') ||
  jsonb_build_object('transactionCorrelationRef','synthetic/cross-transaction','customerRef','synthetic/real-customer','subscriptionRef','synthetic/cross-subscription')
 )
$$,'P0001','PADDLE_INGRESS_IDENTITY_CONFLICT','same provider customer on another account rejected');

-- Lifecycle constraints and immutability.
select throws_ok($$
 insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref)
 select billing_account_id,'paddle','test','synthetic/second-current'
 from billing_customers_v2 where identity_status='current' and environment='test' limit 1
$$,'23505',null,'at most one current customer per account scope');
select throws_ok($$update billing_customers_v2 set identity_source='unknown_legacy' where identity_status='current'$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','identity source immutable');
select throws_ok($$update billing_customers_v2 set provider_customer_ref='synthetic/mutated' where identity_status='current'$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','provider customer identity immutable');
select throws_ok($$update billing_customers_v2 set identity_status='current',superseded_at=null,superseded_by_customer_id=null where identity_status='superseded'$$,'P0001','BILLING_V2_LIFECYCLE_IMMUTABLE','customer cannot reactivate');
select throws_ok($$update billing_subscriptions_v2 set shadow_status='current',superseded_at=null,superseded_by_subscription_id=null where shadow_status='superseded'$$,'P0001','BILLING_V2_LIFECYCLE_IMMUTABLE','subscription cannot reactivate');
select throws_ok($$
 insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref)
 select a.id,'paddle','test','synthetic/real-customer' from billing_accounts a where a.id<>(select billing_account_id from billing_customers_v2 where provider_customer_ref='synthetic/real-customer') limit 1
$$,'23505',null,'global provider customer uniqueness retained');
create function pg_temp.invalid_customer_target() returns void language plpgsql as $$
begin
 update billing_customers_v2
 set identity_status='superseded',superseded_at=clock_timestamp(),superseded_by_customer_id=gen_random_uuid()
 where id=(select id from ambiguous_customer);
 set constraints all immediate;
end $$;
select throws_ok($$select pg_temp.invalid_customer_target()$$,'23503',null,'missing supersession target rejected');
create function pg_temp.cross_scope_customer_target() returns void language plpgsql as $$
begin
 update billing_customers_v2
 set identity_status='superseded',superseded_at=clock_timestamp(),
  superseded_by_customer_id=(select id from billing_customers_v2 where provider_customer_ref='synthetic/real-customer')
 where id=(select id from ambiguous_customer);
 set constraints all immediate;
end $$;
select throws_ok($$select pg_temp.cross_scope_customer_target()$$,'23503',null,'cross-scope supersession target rejected');
insert into billing_customers_v2(
 billing_account_id,provider,environment,provider_customer_ref,identity_status,identity_source,superseded_at,superseded_by_customer_id
)
select billing_account_id,provider,environment,'synthetic/historical-one','superseded','unknown_legacy',clock_timestamp(),id
from billing_customers_v2 where provider_customer_ref='synthetic/real-customer';
insert into billing_customers_v2(
 billing_account_id,provider,environment,provider_customer_ref,identity_status,identity_source,superseded_at,superseded_by_customer_id
)
select billing_account_id,provider,environment,'synthetic/historical-two','superseded','unknown_legacy',clock_timestamp(),id
from billing_customers_v2 where provider_customer_ref='synthetic/real-customer';
set constraints all immediate;
select is((select count(*) from billing_customers_v2 where provider_customer_ref in ('synthetic/historical-one','synthetic/historical-two')),2::bigint,'multiple superseded customers allowed');
select throws_ok($$delete from billing_customers_v2$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','customer deletion prohibited');
set constraints all immediate;
select throws_ok($$truncate billing_subscriptions_v2$$,'0A000',null,'subscription truncate prohibited by retained references');
select ok(exists(select 1 from pg_trigger where tgrelid='billing_subscriptions_v2'::regclass and tgname='billing_v2_subscription_no_truncate'),'subscription truncate history trigger retained');
select throws_ok($$delete from billing_provider_identity_transitions_v2$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','transition deletion prohibited');
select throws_ok($$truncate billing_provider_identity_transitions_v2$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','transition truncate prohibited');
select ok((select relrowsecurity from pg_class where oid='billing_provider_identity_transitions_v2'::regclass),'transition ledger RLS');

set local role service_role;
select throws_ok($$insert into billing_provider_identity_transitions_v2 default values$$,'42501','permission denied for table billing_provider_identity_transitions_v2','service direct transition DML denied');
reset role;
set local role authenticated;
select throws_ok($$select * from billing_provider_identity_transitions_v2$$,'42501','permission denied for table billing_provider_identity_transitions_v2','authenticated transition read denied');
select throws_ok($$insert into billing_customers_v2 default values$$,'42501','permission denied for table billing_customers_v2','authenticated customer DML denied');
reset role;
set local role anon;
select throws_ok($$select * from billing_provider_identity_transitions_v2$$,'42501','permission denied for table billing_provider_identity_transitions_v2','anon transition read denied');
reset role;

select throws_ok($$select pg_temp.webhook_ingest(pg_temp.webhook_observation()||'{"environment":"live"}')$$,'P0001','PADDLE_INGRESS_SCOPE','live automatic path rejected');
select * from finish();
rollback;
