begin;
select plan(173);
insert into auth.users(id,email) values ('a0500000-0000-4000-8000-000000000001','billing-owner@example.test'),('a0500000-0000-4000-8000-000000000002','billing-beta@example.test'),('a0500000-0000-4000-8000-000000000003','billing-client@example.test');
insert into public.pt_profiles(user_id,workspace_id,full_name) values ('a0500000-0000-4000-8000-000000000001',null,'Billing test'),('a0500000-0000-4000-8000-000000000002',null,'Billing beta');
select public.start_account_trial_for_owner('a0500000-0000-4000-8000-000000000001','first_workspace');
select public.ensure_commercial_billing_account('a0500000-0000-4000-8000-000000000002','manual');
insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
select a.id,p.id,'complimentary','active','manual' from public.billing_accounts a cross join public.commercial_plan_versions p where a.owner_user_id='a0500000-0000-4000-8000-000000000002' and p.plan_key='scale' and p.status='active';

-- Synthetic identifiers; transaction rollback removes every mapping and purchase.
insert into public.billing_provider_variant_mappings(plan_version_id,cadence,environment,provider_store_id,provider_product_id,provider_variant_id,provider_price_id,currency_code,unit_amount_minor,renewal_interval_unit,renewal_interval_quantity,status,verified_at)
select id,'monthly','test','95001','95002','95003','95004','USD',monthly_price_minor,'month',1,'active',now() from public.commercial_plan_versions where plan_key='launch' and status='active';
select throws_ok($$update public.billing_provider_variant_mappings set unit_amount_minor=2000 where provider_variant_id='95003'$$,'P0001','BILLING_VARIANT_MAPPING_MISMATCH','active mapping immutable');
select throws_ok($$insert into public.billing_provider_variant_mappings(plan_version_id,cadence,environment,provider_store_id,provider_product_id,provider_variant_id,provider_price_id,currency_code,unit_amount_minor,renewal_interval_unit,renewal_interval_quantity,status)
select id,'annual','test','95001','95002','95013','95014','USD',1,'year',1,'draft' from public.commercial_plan_versions where plan_key='launch' and status='active'$$,'P0001','BILLING_VARIANT_MAPPING_MISMATCH','canonical amount enforced');
select throws_ok($$update public.billing_provider_variant_mappings set currency_code='EUR' where provider_variant_id='95003'$$,'P0001','BILLING_VARIANT_MAPPING_MISMATCH','currency cannot change');
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000001','test')$$,'owner creates attempt');
select is(public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000001','test')->>'shouldCreate','false','same operation replays');
select throws_ok($$select public.begin_my_billing_checkout_attempt('growth','monthly','b0500000-0000-4000-8000-000000000001','test')$$,'P0001','BILLING_CHECKOUT_OPERATION_CONFLICT','operation contract cannot change');
select throws_ok($$select public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000009','test')$$,'P0001','BILLING_CHECKOUT_ALREADY_OPEN','two tabs cannot open concurrent attempts');
select throws_ok($$select * from public.billing_provider_variant_mappings$$,'42501',null,'runtime mapping read denied');
select throws_ok($$select * from public.billing_checkout_attempts$$,'42501',null,'runtime URL read denied');
select throws_ok($$select * from public.billing_provider_customers$$,'42501',null,'runtime customer read denied');
select throws_ok($$select * from public.billing_provider_subscriptions$$,'42501',null,'runtime subscription read denied');
select throws_ok($$select * from public.billing_provider_webhook_deliveries$$,'42501',null,'runtime delivery read denied');
select throws_ok($$select public.reconcile_billing_provider_subscription(gen_random_uuid(),null)$$,'42501',null,'owner cannot reconcile');
reset role;
select public.fail_billing_checkout_attempt(id,environment,creation_lease_expires_at,true,'BILLING_CHECKOUT_CREATION_AMBIGUOUS') from public.billing_checkout_attempts where operation_id='b0500000-0000-4000-8000-000000000001';
select is(public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000001','test')->>'status','ambiguous','ambiguous attempt is never recreated');
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000002','live')$$,'P0001','BILLING_VARIANT_MAPPING_UNAVAILABLE','test mapping cannot resolve in live');
select lives_ok($$select public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000002','test')$$,'beta owner can checkout');
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.begin_my_billing_checkout_attempt('launch','monthly',gen_random_uuid(),'test')$$,'42501','BILLING_FORBIDDEN','client cannot initiate');

create function pg_temp.snapshot(p_sid text,p_customer text,p_status text default 'active',p_seconds integer default 0) returns jsonb language sql as $$
  select jsonb_build_object('provider','lemonsqueezy','environment','test','store_id','95001','subscription_id',p_sid,'customer_id',p_customer,'order_id','95007','order_item_id','95008','product_id','95002','variant_id','95003','price_id','95004','first_subscription_item_id','95009','quantity',1,'status',p_status,'cancelled',p_status='cancelled','renews_at',now()+interval '1 month','ends_at',case when p_status='cancelled' then now()+interval '1 month' when p_status='expired' then now()-interval '1 second' else null end,'trial_ends_at',null,'created_at',now(),'updated_at',now()+make_interval(secs=>p_seconds))
$$;
create function pg_temp.delivery(p_event text,p_sid text,p_operation uuid,p_salt text) returns uuid language plpgsql as $$
declare t public.billing_checkout_attempts%rowtype; h text; payload jsonb;
begin
  select * into t from public.billing_checkout_attempts where operation_id=p_operation;
  h:=encode(extensions.digest(p_salt,'sha256'),'hex');
  payload:=jsonb_build_object('store_id','95001','subscription_id',p_sid,'checkout_attempt_id',t.id,'billing_account_id',t.billing_account_id,'plan_version_id',t.plan_version_id);
  return public.record_billing_webhook_delivery('test',p_event,'subscriptions',p_sid,h,encode(extensions.digest('test'||chr(10)||p_event||chr(10)||h,'sha256'),'hex'),payload);
end $$;

select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_payment_success','95005',null,'invoice'),pg_temp.snapshot('95005','95006')),'deferred','invoice before creation defers');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_created','95005','b0500000-0000-4000-8000-000000000001','wrong-price'),pg_temp.snapshot('95005','95006')||'{"price_id":"99999"}'),'ignored','wrong price grants no access');
select is((select count(*)::integer from public.billing_provider_subscriptions),0,'failed conversion rolls back provider mapping');
select is((select status from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0500000-0000-4000-8000-000000000001'),'trialing','failed conversion preserves trial');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_created','95005','b0500000-0000-4000-8000-000000000001','creation'),pg_temp.snapshot('95005','95006')),'processed','trial converts atomically');
select is((select count(*)::integer from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0500000-0000-4000-8000-000000000001' and s.subscription_kind='paid' and s.status='active'),1,'one paid subscription');
select is((select status from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0500000-0000-4000-8000-000000000001' and s.subscription_kind='trial'),'canceled','trial clock preserved with terminal cancellation');
select is((select processing_status from public.billing_provider_webhook_deliveries where event_name='subscription_payment_success'),'ignored','deferred invoice resolved after creation');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_created','95005','b0500000-0000-4000-8000-000000000001','creation'),pg_temp.snapshot('95005','95006')),'replayed','delivery fingerprint deduplicates');
select is((select count(*)::integer from public.billing_provider_webhook_deliveries where event_name='subscription_created'),2,'replay did not insert delivery');
-- Fault injection after customer/subscription/attempt writes proves atomic rollback.
create function pg_temp.reject_conversion() returns trigger language plpgsql as $$ begin
  if new.event_type='subscription.converted_to_paid' then raise exception 'injected failure'; end if; return new;
end $$;
create trigger billing_test_conversion_failure before insert on public.account_subscription_events for each row execute function pg_temp.reject_conversion();
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_created','95015','b0500000-0000-4000-8000-000000000002','beta'),pg_temp.snapshot('95015','95016')),'failed','failed delivery persists for retry');
select is((select count(*)::integer from public.billing_provider_customers where provider_customer_id='95016'),0,'failure rolls back newly inserted customer');
select is((select status from public.billing_checkout_attempts where operation_id='b0500000-0000-4000-8000-000000000002'),'creating','failure rolls back attempt completion');
select is((select status from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0500000-0000-4000-8000-000000000002'),'active','failure rolls back complimentary terminalization');
drop trigger billing_test_conversion_failure on public.account_subscription_events;
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_created','95015','b0500000-0000-4000-8000-000000000002','beta'),pg_temp.snapshot('95015','95016')),'processed','complimentary converts atomically');
select is((select count(*)::integer from public.account_subscription_events where event_type='subscription.converted_to_paid'),2,'explicit conversion audit events');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95005',null,'past_due'),pg_temp.snapshot('95005','95006','past_due',1)),'processed','past due reconciles');
select is((select s.status from public.account_subscriptions s join public.billing_provider_subscriptions b on b.account_subscription_id=s.id where b.provider_subscription_id='95005'),'past_due','local past_due full access warning');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95005',null,'unpaid'),pg_temp.snapshot('95005','95006','unpaid',2)),'processed','unpaid reconciles');
select is((select s.status from public.account_subscriptions s join public.billing_provider_subscriptions b on b.account_subscription_id=s.id where b.provider_subscription_id='95005'),'grace','local grace delivery only');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_cancelled','95005',null,'cancelled'),pg_temp.snapshot('95005','95006','cancelled',3)),'processed','cancelled future reconciles');
select ok((select s.cancel_at_period_end and s.status='active' from public.account_subscriptions s join public.billing_provider_subscriptions b on b.account_subscription_id=s.id where b.provider_subscription_id='95005'),'cancelled retains access to period end');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95005',null,'stale'),pg_temp.snapshot('95005','95006','active',0)),'ignored','stale snapshot ignored');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95005',null,'variant'),pg_temp.snapshot('95005','95006','active',4)||'{"variant_id":"99999"}'),'ignored','variant change preserves prior access');
select is((select reconciliation_status from public.billing_provider_subscriptions where provider_subscription_id='95005'),'manual_review','variant mismatch flags operations review');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95005',null,'trial'),pg_temp.snapshot('95005','95006','on_trial',5)),'ignored','provider trial rejected');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95005',null,'customer'),pg_temp.snapshot('95005','95016','active',6)),'ignored','foreign customer rejected');
-- Model an elapsed local billing period before provider expiration.
update public.account_subscriptions set current_period_started_at=now()-interval '1 month' where subscription_kind='paid';
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_expired','95005',null,'expired'),pg_temp.snapshot('95005','95006','expired',7)),'processed','expiration reconciles');
select is((select s.status from public.account_subscriptions s join public.billing_provider_subscriptions b on b.account_subscription_id=s.id where b.provider_subscription_id='95005'),'expired','paid access expires');
select throws_ok($$update public.billing_provider_customers set provider_customer_id='99999'$$,'P0001','BILLING_SUBSCRIPTION_IDENTITY_MISMATCH','customer identity immutable');
select throws_ok($$insert into public.billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id) select billing_account_id,provider,environment,provider_store_id,provider_customer_id from public.billing_provider_customers limit 1$$,'23505',null,'customer uniqueness enforced');
select is((select attempt_count from public.billing_provider_webhook_deliveries where provider_subscription_id='95015'),2,'failed delivery successfully retried once');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95015',null,'pause'),pg_temp.snapshot('95015','95016','paused',1)),'processed','paused remains active');
select is((select s.status from public.account_subscriptions s join public.billing_provider_subscriptions b on b.account_subscription_id=s.id where b.provider_subscription_id='95015'),'active','paused has full local access');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95015',null,'store-mismatch'),pg_temp.snapshot('95015','95016','active',2)||'{"store_id":"99999"}'),'ignored','store mismatch grants no change');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95015',null,'env-mismatch'),pg_temp.snapshot('95015','95016','active',2)||'{"environment":"live"}'),'ignored','environment mismatch grants no change');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_updated','95015',null,'quantity'),pg_temp.snapshot('95015','95016','active',2)||'{"quantity":2}'),'ignored','quantity billing rejected');
select throws_ok($$insert into public.billing_provider_subscriptions select gen_random_uuid(),billing_account_id,account_subscription_id,variant_mapping_id,provider,environment,provider_store_id,provider_customer_id,provider_subscription_id,provider_order_id,provider_order_item_id,provider_product_id,provider_variant_id,provider_price_id,first_subscription_item_id,quantity,provider_status,provider_cancelled,provider_renews_at,provider_ends_at,provider_trial_ends_at,provider_created_at,provider_updated_at,latest_snapshot_sha256,last_reconciled_at,reconciliation_status,reconciliation_error_code,created_at,updated_at from public.billing_provider_subscriptions limit 1$$,'23505',null,'provider/local subscription linkage unique');
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.begin_my_billing_checkout_attempt('launch','monthly',gen_random_uuid(),'test')$$,'P0001','BILLING_ALREADY_SUBSCRIBED','paid account cannot open another subscription');
select ok((select bool_and(provider_checkout_url is null) from public.billing_checkout_attempts where status='completed'),'completion removes private URLs');
select is(public.resolve_account_entitlements((select id from public.billing_accounts where owner_user_id='a0500000-0000-4000-8000-000000000002'))#>>'{limits,countedClients}','10','capacity changes from complimentary Scale to paid Launch');
insert into public.billing_provider_variant_mappings(plan_version_id,cadence,environment,provider_store_id,provider_product_id,provider_variant_id,provider_price_id,currency_code,unit_amount_minor,renewal_interval_unit,renewal_interval_quantity,status,verified_at)
select id,'annual','test','95001','95002','95013','95014','USD',annual_price_minor,'year',1,'draft',now() from public.commercial_plan_versions where plan_key='launch' and status='active';
select throws_ok($$update public.billing_provider_variant_mappings set renewal_interval_unit='month' where provider_variant_id='95013'$$,'23514',null,'cadence interval parity');
select lives_ok($$update public.billing_provider_variant_mappings set status='active' where provider_variant_id='95013'$$,'verified annual mapping activates');
select lives_ok($$update public.billing_provider_variant_mappings set status='retired',retired_at=now() where provider_variant_id='95013'$$,'active mapping retires');
select throws_ok($$update public.billing_provider_variant_mappings set status='active',retired_at=null where provider_variant_id='95013'$$,'P0001','BILLING_VARIANT_MAPPING_MISMATCH','retired mapping cannot reactivate');
set local role service_role;
select throws_ok($$select * from public.billing_checkout_attempts$$,'42501',null,'service role also uses narrow RPCs');
reset role;
-- Lease/expiry interoperability and stale URLs use separate transaction-scoped owners.
insert into auth.users(id,email) values ('a0500000-0000-4000-8000-000000000004','billing-ready@example.test'),('a0500000-0000-4000-8000-000000000005','billing-expiry@example.test');
insert into public.pt_profiles(user_id,workspace_id,full_name) values ('a0500000-0000-4000-8000-000000000004',null,'Ready owner'),('a0500000-0000-4000-8000-000000000005',null,'Expiry owner');
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000004',true);
select public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000004','test');
select throws_ok($$select public.complete_billing_checkout_attempt(id,'live',creation_lease_expires_at,'fake-ready','https://fake-store.lemonsqueezy.com/checkout/custom/test',expected_expires_at) from public.billing_checkout_attempts where operation_id='b0500000-0000-4000-8000-000000000004'$$,'P0001','BILLING_CHECKOUT_CREATION_AMBIGUOUS','completion rejects another environment');
select throws_ok($$select public.complete_billing_checkout_attempt(id,environment,creation_lease_expires_at-interval '1 second','fake-ready','https://fake-store.lemonsqueezy.com/checkout/custom/test',expected_expires_at) from public.billing_checkout_attempts where operation_id='b0500000-0000-4000-8000-000000000004'$$,'P0001','BILLING_CHECKOUT_CREATION_AMBIGUOUS','completion rejects wrong lease');
select lives_ok($$select public.complete_billing_checkout_attempt(id,environment,creation_lease_expires_at,'fake-ready','https://fake-store.lemonsqueezy.com/checkout/custom/test',date_trunc('milliseconds',expected_expires_at)) from public.billing_checkout_attempts where operation_id='b0500000-0000-4000-8000-000000000004'$$,'successful completion accepts JSON millisecond timestamp');
select is(public.get_my_billing_checkout_state()->>'status','ready','owner sees ready state');
select ok(not public.get_my_billing_checkout_state() ? 'provider_checkout_url','owner state excludes capability URL');
select is(public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000004','test')->>'shouldCreate','false','ready replay does not recreate');
select is((select count(*)::integer from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0500000-0000-4000-8000-000000000004'),0,'checkout creation alone grants no paid access');
select public.ensure_commercial_billing_account('a0500000-0000-4000-8000-000000000005','manual');
insert into public.billing_checkout_attempts(billing_account_id,plan_version_id,variant_mapping_id,environment,cadence,operation_id,status,expected_expires_at,provider_expires_at,creation_lease_expires_at,created_by_user_id,created_at,provider_checkout_id,provider_checkout_url)
select a.id,m.plan_version_id,m.id,'test','monthly','b0500000-0000-4000-8000-000000000005','ready',now()-interval '1 minute',now()-interval '1 minute',now()-interval '29 minutes',a.owner_user_id,now()-interval '31 minutes','fake-expired','https://fake-store.lemonsqueezy.com/checkout/custom/expired'
from public.billing_accounts a cross join public.billing_provider_variant_mappings m where a.owner_user_id='a0500000-0000-4000-8000-000000000005' and m.provider_variant_id='95003';
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000005',true);
select is(public.get_my_billing_checkout_state()->>'status','expired','stale ready expires on canonical read');
select ok((select provider_checkout_url is null from public.billing_checkout_attempts where operation_id='b0500000-0000-4000-8000-000000000005'),'expiration clears private URL');
select lives_ok($$select public.begin_my_billing_checkout_attempt('launch','monthly','b0500000-0000-4000-8000-000000000006','test')$$,'fresh operation permitted after expected expiry');
select throws_ok($$select public.begin_my_billing_checkout_attempt('launch','annual','b0500000-0000-4000-8000-000000000006','test')$$,'P0001','BILLING_CHECKOUT_OPERATION_CONFLICT','same operation cannot switch cadence');
-- Review regressions: independent owners and exact historical Checkout mappings.
create function pg_temp.review_attempt(p_n integer, p_trial boolean default false) returns uuid language plpgsql as $$
declare u uuid:=('a0510000-0000-4000-8000-'||lpad(p_n::text,12,'0'))::uuid; a uuid; t uuid;
  started timestamptz:=case when p_n=10 then now() else now()-interval '2 months' end;
begin
  insert into auth.users(id,email) values(u,'review-'||p_n||'@example.test');
  insert into public.pt_profiles(user_id,workspace_id,full_name) values(u,null,'Review owner');
  a:=public.ensure_commercial_billing_account(u,'manual');
  if p_trial then perform public.start_account_trial_for_owner(u,'first_workspace'); end if;
  insert into public.billing_checkout_attempts(billing_account_id,plan_version_id,variant_mapping_id,environment,cadence,operation_id,status,
    created_at,expected_expires_at,creation_lease_expires_at,created_by_user_id,provider_checkout_id,provider_checkout_url,provider_expires_at)
  select a,m.plan_version_id,m.id,'test','monthly',u,'ready',started,started+interval '30 minutes',
    started+interval '2 minutes',u,'review-'||p_n,'https://fake-store.lemonsqueezy.com/checkout/custom/review-'||p_n,
    started+interval '30 minutes' from public.billing_provider_variant_mappings m where provider_variant_id='95003' returning id into t;
  return t;
end $$;
create function pg_temp.review_snapshot(p_n integer,p_status text default 'active',p_seconds integer default 1) returns jsonb language sql as $$
  select pg_temp.snapshot((95100+p_n)::text,(95200+p_n)::text,p_status,p_seconds)
    ||jsonb_build_object('created_at',now()-interval '2 months'+interval '1 minute',
      'ends_at',case when p_status='cancelled' then now()+interval '1 month' when p_status='expired' then now()-interval '1 day' else null end)
$$;
create function pg_temp.review_delivery(p_n integer,p_event text,p_salt text) returns uuid language sql as $$
  select pg_temp.delivery(p_event,(95100+p_n)::text,('a0510000-0000-4000-8000-'||lpad(p_n::text,12,'0'))::uuid,'review-'||p_n||'-'||p_salt)
$$;
create function pg_temp.review_local(p_n integer) returns jsonb language sql as $$
  select to_jsonb(s) from public.account_subscriptions s join public.billing_provider_subscriptions b on b.account_subscription_id=s.id
    where b.provider_subscription_id=(95100+p_n)::text
$$;
select pg_temp.review_attempt(n,n=2) from generate_series(1,10) n;

-- E: the accepted snapshot and business row must be unchanged when review recovers.
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(1,'subscription_created','created'),pg_temp.review_snapshot(1)),'processed','review: establish accepted snapshot');
create temp table review_before as select pg_temp.review_local(1) local_row, (select count(*) from public.account_subscription_events) events;
update public.billing_provider_subscriptions set last_reconciled_at=now()-interval '1 hour' where provider_subscription_id='95101';
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(1,'subscription_updated','invalid'),pg_temp.review_snapshot(1)||'{"customer_id":"99999"}'),'ignored','review: invalid current identity rejected');
select is((select reconciliation_status from public.billing_provider_subscriptions where provider_subscription_id='95101'),'manual_review','review: invalid snapshot sets review');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(1,'subscription_updated','still-invalid'),pg_temp.review_snapshot(1)||'{"customer_id":"99999"}'),'ignored','review: still-invalid snapshot rejected');
select is((select reconciliation_status from public.billing_provider_subscriptions where provider_subscription_id='95101'),'manual_review','review: still-invalid snapshot cannot clear review');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(1,'subscription_updated','stale'),pg_temp.review_snapshot(1,'active',0)),'ignored','review: stale retrieved snapshot cannot clear review');
select is((select reconciliation_status from public.billing_provider_subscriptions where provider_subscription_id='95101'),'manual_review','review: stale snapshot preserves review');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(1,'subscription_updated','restored'),pg_temp.review_snapshot(1)),'processed','review: identical valid snapshot processed');
select is((select reconciliation_status from public.billing_provider_subscriptions where provider_subscription_id='95101'),'processed','review: identical snapshot clears review');
select is((select reconciliation_error_code from public.billing_provider_subscriptions where provider_subscription_id='95101'),null,'review: error cleared');
select is((select last_reconciled_at from public.billing_provider_subscriptions where provider_subscription_id='95101'),now(),'review: reconciliation timestamp advances');
select is(pg_temp.review_local(1),(select local_row from review_before),'review: health-only recovery preserves entire local row');
select is((select count(*) from public.account_subscription_events),(select events from review_before),'review: health-only recovery creates no lifecycle event');

-- C: cancellation arrives first; linkage uses current cancellation, never old active state.
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(2,'subscription_cancelled','early'),pg_temp.review_snapshot(2,'cancelled')),'deferred','delayed: cancellation before creation defers');
create temp table review_trial_before as select to_jsonb(s) row from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0510000-0000-4000-8000-000000000002';
-- Inject failure after linkage, Checkout, prior access and deferred-delivery writes.
create trigger billing_review_conversion_failure before insert on public.account_subscription_events for each row execute function pg_temp.reject_conversion();
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(2,'subscription_created','created'),pg_temp.review_snapshot(2,'cancelled')),'failed','delayed: late failure rolls back cancelled conversion');
select is(pg_temp.review_local(2),null,'delayed: failure rolls back paid/provider linkage');
select is((select count(*) from public.billing_provider_customers where provider_customer_id='95202'),0::bigint,'delayed: failure rolls back customer');
select is((select status from public.billing_checkout_attempts where operation_id='a0510000-0000-4000-8000-000000000002'),'ready','delayed: failure rolls back Checkout completion');
select is((select to_jsonb(s) from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0510000-0000-4000-8000-000000000002'),(select row from review_trial_before),'delayed: failure preserves entire trial row');
select is((select processing_status from public.billing_provider_webhook_deliveries where id=pg_temp.review_delivery(2,'subscription_cancelled','early')),'deferred','delayed: failure preserves deferred delivery');
drop trigger billing_review_conversion_failure on public.account_subscription_events;
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(2,'subscription_created','created'),pg_temp.review_snapshot(2,'cancelled')),'processed','delayed: cancelled creation links successfully');
select is(pg_temp.review_local(2)->>'status','active','delayed: future cancellation retains paid access');
select is(pg_temp.review_local(2)->>'cancel_at_period_end','true','delayed: cancellation scheduled');
select is((pg_temp.review_local(2)->>'current_period_ends_at')::timestamptz,now()+interval '1 month','delayed: uses provider ends_at');
select is((select count(*) from public.billing_provider_customers where provider_customer_id='95202'),1::bigint,'delayed: one customer linkage');
select is((select status from public.account_subscriptions where id=((select row from review_trial_before)->>'id')::uuid),'canceled','delayed: trial terminalized');
select is((select status from public.billing_checkout_attempts where operation_id='a0510000-0000-4000-8000-000000000002'),'completed','delayed: Checkout completed');
select is((select processing_status from public.billing_provider_webhook_deliveries where id=pg_temp.review_delivery(2,'subscription_cancelled','early')),'ignored','delayed: earlier cancellation superseded');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(2,'subscription_created','created'),pg_temp.review_snapshot(2,'cancelled')),'replayed','delayed: creation fingerprint replay');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(2,'subscription_created','duplicate'),pg_temp.review_snapshot(2,'cancelled')),'processed','delayed: distinct duplicate creation idempotent');
select is((select count(*) from public.account_subscription_events where subscription_id=(pg_temp.review_local(2)->>'id')::uuid and event_type='subscription.converted_to_paid'),1::bigint,'delayed: exactly one conversion event');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(2,'subscription_expired','expired'),pg_temp.review_snapshot(2,'expired',2)),'processed','delayed: subsequent expiration reconciles');
select is(pg_temp.review_local(2)->>'status','expired','delayed: subsequent expiration revokes paid access');
select is((select count(*) from public.account_subscriptions where billing_account_id=(pg_temp.review_local(2)->>'billing_account_id')::uuid and subscription_kind='paid'),1::bigint,'delayed: exactly one paid row');

-- D: all supported current states establish history, including terminal states.
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(3,'subscription_created','terminal'),pg_temp.review_snapshot(3,'expired')),'processed','terminal: expired creation establishes history');
select is(pg_temp.review_local(3)->>'status','expired','terminal: expired creation grants no active access');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(3,'subscription_expired','later'),pg_temp.review_snapshot(3,'expired',2)),'processed','terminal: later events resolve');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(4,'subscription_created','terminal'),pg_temp.review_snapshot(4,'cancelled')||jsonb_build_object('ends_at',now()-interval '1 day')),'processed','terminal: elapsed cancellation establishes history');
select is(pg_temp.review_local(4)->>'status','expired','terminal: elapsed cancellation grants no active access');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(5,'subscription_created','paused'),pg_temp.review_snapshot(5,'paused')),'processed','initial: paused creation links');
select is(pg_temp.review_local(5)->>'status','active','initial: paused maps to active');
select is((select provider_status from public.billing_provider_subscriptions where provider_subscription_id='95105'),'paused','initial: preserves provider paused state');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(6,'subscription_created','past-due'),pg_temp.review_snapshot(6,'past_due')),'processed','initial: past_due creation links');
select is(pg_temp.review_local(6)->>'status','past_due','initial: past_due retained');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(7,'subscription_created','unpaid'),pg_temp.review_snapshot(7,'unpaid')),'processed','initial: unpaid creation links');
select is(pg_temp.review_local(7)->>'status','grace','initial: unpaid maps to grace');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(8,'subscription_created','unknown'),pg_temp.review_snapshot(8,'unknown')),'ignored','initial: unknown status fails closed');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(8,'subscription_created','trial'),pg_temp.review_snapshot(8,'on_trial')),'ignored','initial: trial fails closed');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(8,'subscription_created','malformed'),pg_temp.review_snapshot(8,'cancelled')||'{"cancelled":false}'),'ignored','initial: malformed cancellation fails closed');
select is(pg_temp.review_local(8),null,'initial: unsupported states grant no paid linkage');

-- A/B: mapping retirement affects sales, not approved historical obligations.
-- Backdated fixture retirement separates valid old attempts from post-retirement attempts.
update public.billing_provider_variant_mappings set status='retired',retired_at=now()-interval '1 day' where provider_variant_id='95003';
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(1,'subscription_cancelled','retired-cancel'),pg_temp.review_snapshot(1,'cancelled',2)),'processed','retired: linked cancellation processed');
select is(pg_temp.review_local(1)->>'status','active','retired: future cancellation retains access');
select is(pg_temp.review_local(1)->>'cancel_at_period_end','true','retired: future cancellation scheduled');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(1,'subscription_expired','retired-expire'),pg_temp.review_snapshot(1,'expired',3)),'processed','retired: linked expiration processed');
select is(pg_temp.review_local(1)->>'status','expired','retired: expiration revokes access');
select is((select count(*) from public.account_subscriptions where billing_account_id=(pg_temp.review_local(1)->>'billing_account_id')::uuid and subscription_kind='paid'),1::bigint,'retired: no second paid row');
select set_config('request.jwt.claim.sub','a0510000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.begin_my_billing_checkout_attempt('launch','monthly',gen_random_uuid(),'test')$$,'P0001','BILLING_VARIANT_MAPPING_UNAVAILABLE','retired: new Checkout cannot use historical mapping');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_created','retired-created'),pg_temp.review_snapshot(9)),'processed','retired: pre-retirement ready Checkout can link');
select is((select b.variant_mapping_id from public.billing_provider_subscriptions b where provider_subscription_id='95109'),(select variant_mapping_id from public.billing_checkout_attempts where operation_id='a0510000-0000-4000-8000-000000000009'),'retired: preserves exact attempt mapping');
select is(public.reconcile_billing_provider_subscription(pg_temp.delivery('subscription_created','95999',null,'review-no-attempt'),pg_temp.review_snapshot(9)||'{"subscription_id":"95999"}'),'ignored','retired: arbitrary creation without prior attempt denied');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(10,'subscription_created','post-retirement'),pg_temp.review_snapshot(10)||jsonb_build_object('created_at',now())),'ignored','retired: attempt after retirement cannot link');
select is(pg_temp.review_local(10),null,'retired: invalid attempt grants no paid linkage');
select throws_ok($$select pg_temp.review_attempt(11)$$,'P0001','BILLING_VARIANT_MAPPING_UNAVAILABLE','retired: even direct attempt insertion requires active sale mapping');
-- PR-PRICE-06: portal is owner-only and reads canonical linkage, never caller IDs.
select is(public.get_billing_portal_subscription('a0510000-0000-4000-8000-000000000009','test')->>'subscription_id','95109','portal: owner resolves current historical mapping');
select throws_ok($$select public.get_billing_portal_subscription('a0500000-0000-4000-8000-000000000003','test')$$,'42501','BILLING_PORTAL_OWNER_REQUIRED','portal: client denied');
select throws_ok($$select public.get_billing_portal_subscription('a0510000-0000-4000-8000-000000000009','live')$$,'P0001','BILLING_PORTAL_SUBSCRIPTION_NOT_FOUND','portal: environment isolated');
select throws_ok($$select public.get_billing_portal_subscription(null,'test')$$,'42501','BILLING_PORTAL_OWNER_REQUIRED','portal: anonymous denied');
select set_config('request.jwt.claim.sub','a0510000-0000-4000-8000-000000000009',true);
set local role authenticated;
select is(public.get_my_billing_provider_summary()->>'linked','true','portal: owner safe summary');
select ok(not(public.get_my_billing_provider_summary() ?| array['customer_id','subscription_id','store_id','portalUrl']),'portal: summary excludes provider IDs and capabilities');
select throws_ok($$select public.get_billing_portal_subscription('a0510000-0000-4000-8000-000000000009','test')$$,'42501',null,'portal: browser cannot invoke service resolution with forged owner');
select throws_ok($$select * from public.billing_provider_subscriptions$$,'42501',null,'portal: direct provider reads denied');
select throws_ok($$update public.billing_provider_subscriptions set reconciliation_status='processed'$$,'42501',null,'portal: direct provider writes denied');
reset role;
select set_config('request.jwt.claim.sub','a0510000-0000-4000-8000-000000000008',true);
select is(public.get_my_billing_provider_summary()->>'linked','false','portal: other coach cannot see owner linkage');
select set_config('request.jwt.claim.sub','a0500000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.get_my_billing_provider_summary()$$,'42501','BILLING_PORTAL_OWNER_REQUIRED','portal: client cannot read summary');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_cancelled','portal-cancel'),pg_temp.review_snapshot(9,'cancelled',2)),'processed','portal: cancellation processed');
select is(pg_temp.review_local(9)->>'status','active','portal: cancellation retains full paid state');
select is(pg_temp.review_local(9)->>'cancel_at_period_end','true','portal: cancellation scheduled');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_cancelled','portal-cancel'),pg_temp.review_snapshot(9,'cancelled',2)),'replayed','portal: cancellation replay idempotent');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_resumed','portal-resume'),pg_temp.review_snapshot(9,'active',3)),'processed','portal: resumption processed');
select is(pg_temp.review_local(9)->>'cancel_at_period_end','false','portal: resumption clears cancellation');
select is((select provider_ends_at from public.billing_provider_subscriptions where provider_subscription_id='95109'),null,'portal: obsolete provider ends_at cleared');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_resumed','portal-resume'),pg_temp.review_snapshot(9,'active',3)),'replayed','portal: resumption replay idempotent');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_updated','portal-unpaid'),pg_temp.review_snapshot(9,'unpaid',4)),'processed','portal: unpaid enters grace');
select is(pg_temp.review_local(9)->>'status','grace','portal: grace state retained');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_payment_recovered','portal-recovered'),pg_temp.review_snapshot(9,'active',5)),'processed','portal: payment recovery processed');
select is(pg_temp.review_local(9)->>'status','active','portal: recovery restores active');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_cancelled','portal-stale'),pg_temp.review_snapshot(9,'cancelled',2)),'ignored','portal: stale cancellation cannot regress recovery');
create temp table portal_before as select pg_temp.review_local(9) local_row, public.resolve_account_entitlements((pg_temp.review_local(9)->>'billing_account_id')::uuid)->'limits' limits;
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_plan_changed','portal-variant'),pg_temp.review_snapshot(9,'active',6)||'{"variant_id":"95999"}'),'ignored','portal: unapproved Variant change durably ignored');
select is((select reconciliation_error_code from public.billing_provider_subscriptions where provider_subscription_id='95109'),'BILLING_UNAPPROVED_PLAN_CHANGE','portal: stable plan-change error');
select is((select reconciliation_status from public.billing_provider_subscriptions where provider_subscription_id='95109'),'manual_review','portal: plan-change review status');
select is(pg_temp.review_local(9),(select local_row from portal_before),'portal: unapproved change preserves entire local subscription');
select is(public.resolve_account_entitlements((pg_temp.review_local(9)->>'billing_account_id')::uuid)->'limits',(select limits from portal_before),'portal: unapproved change preserves capacity');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_plan_changed','portal-product'),pg_temp.review_snapshot(9,'active',7)||'{"product_id":"95999"}'),'ignored','portal: unapproved Product change rejected');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_plan_changed','portal-price'),pg_temp.review_snapshot(9,'active',8)||'{"price_id":"95999"}'),'ignored','portal: different Price/cadence rejected');
select set_config('request.jwt.claim.sub','a0510000-0000-4000-8000-000000000009',true);
select is(public.get_my_billing_provider_summary()->>'errorCode','BILLING_UNAPPROVED_PLAN_CHANGE','portal: safe manual-review summary');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_updated','portal-restored'),pg_temp.review_snapshot(9,'active',5)),'processed','portal: valid current state restores review');
select is(public.reconcile_billing_provider_subscription(pg_temp.review_delivery(9,'subscription_expired','portal-expired'),pg_temp.review_snapshot(9,'expired',9)),'processed','portal: expiration processed');
select is(pg_temp.review_local(9)->>'status','expired','portal: expired access');
select is((select count(*) from public.account_subscriptions where billing_account_id=(pg_temp.review_local(9)->>'billing_account_id')::uuid and subscription_kind='paid'),1::bigint,'portal: all lifecycle updates preserve one paid row');
select * from finish();
rollback;
