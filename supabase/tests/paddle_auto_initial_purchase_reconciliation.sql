begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql
\ir fixtures/paddle_webhook_fixture.psql
\ir fixtures/paddle_auto_reconciliation_fixture.psql
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
select ok(has_function_privilege('service_role','reconcile_paddle_initial_purchase_event_v1(uuid)','execute'),'service execution');
select ok(not has_function_privilege('anon','reconcile_paddle_initial_purchase_event_v1(uuid)','execute'),'anon denied');
select ok(not has_function_privilege('authenticated','reconcile_paddle_initial_purchase_event_v1(uuid)','execute'),'browser denied');
select ok(not exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a where p.oid='reconcile_paddle_initial_purchase_event_v1(uuid)'::regprocedure and a.grantee=0),'PUBLIC denied');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='reconcile_paddle_initial_purchase_event_v1(uuid)'::regprocedure),'postgres','trusted owner');
select is((select proconfig[1] from pg_proc where oid='reconcile_paddle_initial_purchase_event_v1(uuid)'::regprocedure),'search_path=pg_catalog, public','fixed path');
create temp table cases(label text primary key,u uuid,result jsonb);
insert into cases values('disabled',pg_temp.auto_checkout(),null);
update cases set result=pg_temp.auto_ingest(u,'transaction.completed');
select is(result->>'accepted','true','closed ingestion accepted') from cases;
select is(result->>'eventType','transaction.completed','normalized event type') from cases;
select is((select count(*)::int from jsonb_object_keys(result)),4,'only four ingress result fields') from cases;
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'disabled','disabled ingest dispatcher') from cases;
select is(pg_temp.auto_counts(u),'{"payments":0,"canonical":0,"links":0,"items":0,"seats":0,"checkout":"ready"}'::jsonb,'disabled no authority') from cases;
select is(pg_temp.auto_ingest(u,'transaction.completed')->>'eventId',result->>'eventId','exact replay same event') from cases;
select is(pg_temp.webhook_ingest(pg_temp.auto_observation(u,'transaction.completed')||'{"notificationRef":"synthetic/new-notification"}'::jsonb)->>'eventId',result->>'eventId','new delivery same event') from cases;
select is((select count(*)::int from billing_paddle_event_deliveries where event_id=(result->>'eventId')::uuid),2,'both deliveries retained') from cases;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
savepoint wrong_environment;
update billing_runtime_policy set entitlement_environment='live';
select throws_ok($$select pg_temp.auto_dispatch(u,'transaction.completed') from cases$$,'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','test event cannot activate live authority');
rollback to wrong_environment;
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'pending','transaction first waits') from cases;
select pg_temp.auto_ingest(u,'subscription.created') from cases;
select is(pg_temp.auto_dispatch(u,'subscription.created'),'applied','transaction first activates on complementary event') from cases;
select is(pg_temp.auto_counts(u),'{"payments":1,"canonical":1,"links":1,"items":1,"seats":0,"checkout":"completed"}'::jsonb,'single complete atomic effect') from cases;
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'reused','transaction duplicate reused') from cases;
select is(pg_temp.auto_dispatch(u,'subscription.created'),'reused','subscription duplicate reused') from cases;
select is(pg_temp.auto_ingest(u,'subscription.created')->>'reused','true','subscription exact replay') from cases;
select is(pg_temp.auto_dispatch(u,'subscription.created'),'reused','ingestion replay dispatcher reused') from cases;
select ok(c.completed_at is not null and c.completed_subscription_id=s.id,'completion links real shadow and application timestamp') from cases x join billing_checkouts_v2 c on c.provider_transaction_ref='synthetic/txn/'||x.u join billing_subscriptions_v2 s on s.provider_subscription_ref='synthetic/sub/'||x.u;
select pg_temp.auto_ingest(u,'subscription.updated') from cases;
select is(pg_temp.auto_dispatch(u,'subscription.updated'),'not_applicable','updated has no initial automation') from cases;
insert into cases values('subscription-first',pg_temp.auto_checkout(),null);
select pg_temp.auto_ingest(u,'subscription.created') from cases where label='subscription-first';
select is(pg_temp.auto_dispatch(u,'subscription.created'),'pending','subscription first waits') from cases where label='subscription-first';
select is((select reconciliation_status from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/'||u),'pending','ordering does not force manual review') from cases where label='subscription-first';
select pg_temp.auto_ingest(u,'transaction.completed') from cases where label='subscription-first';
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'applied','subscription first complementary activation') from cases where label='subscription-first';
select is(pg_temp.auto_counts(u),'{"payments":1,"canonical":1,"links":1,"items":1,"seats":0,"checkout":"completed"}'::jsonb,'subscription first single effect') from cases where label='subscription-first';
-- Simulate the prior reviewed processed/ready state as fixture administrator.
-- Application roles cannot bypass the immutable terminal checkout guard.
savepoint compatibility;
alter table billing_checkouts_v2 disable trigger billing_v2_checkout_history;
update billing_checkouts_v2 set status='ready',completed_at=null,completed_subscription_id=null where provider_transaction_ref=(select 'synthetic/txn/'||u from cases where label='subscription-first');
alter table billing_checkouts_v2 enable trigger billing_v2_checkout_history;
update billing_runtime_policy set paddle_reconciliation_enabled=false;
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'disabled','disabled does not repair processed ready') from cases where label='subscription-first';
select is(pg_temp.auto_counts(u)->>'checkout','ready','checkout remains ready while disabled') from cases where label='subscription-first';
update billing_runtime_policy set paddle_reconciliation_enabled=true;
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'reused','full proven reuse repairs prior checkout') from cases where label='subscription-first';
select is(pg_temp.auto_counts(u),'{"payments":1,"canonical":1,"links":1,"items":1,"seats":0,"checkout":"completed"}'::jsonb,'repair no new authority') from cases where label='subscription-first';
rollback to compatibility;
insert into cases values('conflict',pg_temp.auto_checkout(),null);
select pg_temp.auto_ingest(u,'transaction.completed'),pg_temp.auto_ingest(u,'subscription.created') from cases where label='conflict';
insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
select c.billing_account_id,p.id,'paid','active','billing_provider' from cases x join billing_checkouts_v2 c on c.provider_transaction_ref='synthetic/txn/'||x.u cross join commercial_plan_versions p where x.label='conflict' and p.plan_key='growth' and p.status='active';
select throws_ok($$select pg_temp.auto_dispatch(u,'transaction.completed') from cases where label='conflict'$$,'P0001','PADDLE_RECONCILIATION_CANONICAL_CONFLICT','existing counterpart hard conflict not pending');
select is(pg_temp.auto_counts(u),'{"payments":0,"canonical":1,"links":0,"items":0,"seats":0,"checkout":"ready"}'::jsonb,'hard failure preserves committed evidence without partial grant') from cases where label='conflict';

-- Execution checks, not just ACL inspection.
set local role authenticated;
select throws_ok('select reconcile_paddle_initial_purchase_event_v1(gen_random_uuid())','42501',null,'actual browser dispatcher denied');
reset role;
set local role anon;
select throws_ok('select reconcile_paddle_initial_purchase_event_v1(gen_random_uuid())','42501',null,'actual anon dispatcher denied');
reset role;
set local role service_role;
select throws_ok($$update billing_checkouts_v2 set status='completed'$$,'42501',null,'direct service checkout writes denied');
reset role;
-- Reject invalid observed payment even though its complement is present.
insert into cases values('bad-payment',pg_temp.auto_checkout(),null);
select pg_temp.auto_ingest(u,'subscription.created') from cases where label='bad-payment';
select pg_temp.webhook_ingest(jsonb_set(pg_temp.auto_observation(u,'transaction.completed'),'{items,0,unitPrice,amount}','"1"')) from cases where label='bad-payment';
select throws_ok($$select pg_temp.auto_dispatch(u,'transaction.completed') from cases where label='bad-payment'$$,'P0001','PADDLE_RECONCILIATION_MANUAL_REVIEW','invalid payment is hard manual review, never pending');
select is(pg_temp.auto_counts(u),'{"payments":0,"canonical":0,"links":0,"items":0,"seats":0,"checkout":"ready"}'::jsonb,'bad payment no partial authority') from cases where label='bad-payment';
insert into cases values('rollback',pg_temp.auto_checkout(),null);
select pg_temp.auto_ingest(u,'subscription.created'),pg_temp.auto_ingest(u,'transaction.completed') from cases where label='rollback';
create function pg_temp.fail_completion() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_COMPLETION_FAILURE'; end $$;
create trigger synthetic_completion_failure before update on billing_checkouts_v2 for each row when (new.status='completed') execute function pg_temp.fail_completion();
select throws_ok($$select pg_temp.auto_dispatch(u,'transaction.completed') from cases where label='rollback'$$,'P0001','SYNTHETIC_COMPLETION_FAILURE','completion failure observable');
select is(pg_temp.auto_counts(u),'{"payments":0,"canonical":0,"links":0,"items":0,"seats":0,"checkout":"ready"}'::jsonb,'completion failure rolls back every authority effect') from cases where label='rollback';
select is((select count(*)::int from billing_paddle_event_observations where observation->>'subscriptionRef'='synthetic/sub/'||u),2,'separately committed ingestion survives failed dispatcher') from cases where label='rollback';
drop trigger synthetic_completion_failure on billing_checkouts_v2;
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'applied','retry after rollback applies once') from cases where label='rollback';
select is(pg_temp.auto_counts(u),'{"payments":1,"canonical":1,"links":1,"items":1,"seats":0,"checkout":"completed"}'::jsonb,'retry completion exactly once') from cases where label='rollback';
select throws_ok($$update billing_checkouts_v2 set completed_at=clock_timestamp() where status='completed'$$,'P0001','BILLING_V2_TERMINAL_IMMUTABLE','completed checkout history immutable');
select throws_ok('delete from billing_paddle_event_observations','P0001','BILLING_V2_HISTORY_IMMUTABLE','observations immutable');
select is(resolve_account_entitlements(c.billing_account_id)#>>'{subscription,planKey}','growth','automated canonical Growth reader') from cases x join billing_checkouts_v2 c on c.provider_transaction_ref='synthetic/txn/'||x.u where x.label='rollback';
select is(billing_seat_effective_limit(c.billing_account_id),2,'automated canonical seats two') from cases x join billing_checkouts_v2 c on c.provider_transaction_ref='synthetic/txn/'||x.u where x.label='rollback';
select is((resolve_account_entitlements(c.billing_account_id)#>>'{limits,countedClients}')::int,50,'automated Growth clients fifty') from cases x join billing_checkouts_v2 c on c.provider_transaction_ref='synthetic/txn/'||x.u where x.label='rollback';
-- A mismatched completed target cannot be repaired, even as an exact retry.
create function pg_temp.mismatch_case() returns text language plpgsql as $f$
begin
 begin
alter table billing_checkouts_v2 disable trigger user;
insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref)
select billing_account_id,customer_id,provider,environment,'synthetic/mismatched-completion' from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/'||(select u from cases where label='rollback');
update billing_checkouts_v2 set completed_subscription_id=(select id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/mismatched-completion') where provider_transaction_ref='synthetic/txn/'||(select u from cases where label='rollback');
 perform pg_temp.auto_dispatch(u,'transaction.completed') from cases where label='rollback';
 raise exception 'UNEXPECTED_SUCCESS';
 exception when others then return sqlerrm;
 end;
end $f$;
select is(pg_temp.mismatch_case(),'PADDLE_RECONCILIATION_CHECKOUT','mismatched completion fails full proof');


-- Trial conversion uses the existing synthetic authentic-proof dispatcher.
insert into cases values('trialing',pg_temp.auto_checkout('trialing'),null),
 ('trial_recovery',pg_temp.auto_checkout('trial_recovery'),null);
create temp table trial_before as select a.* from account_subscriptions a join billing_accounts b
 on b.id=a.billing_account_id join cases c on c.u=b.owner_user_id where c.label in ('trialing','trial_recovery');
select is((resolve_account_entitlements(a.billing_account_id)#>>'{limits,countedClients}')::int,10,
 'trial capacity before conversion') from trial_before a;
select pg_temp.auto_ingest(u,'transaction.completed'),pg_temp.auto_ingest(u,'subscription.created')
 from cases where label in ('trialing','trial_recovery');
select is(pg_temp.auto_dispatch(u,'subscription.created'),'applied',label||' converts') from cases where label in ('trialing','trial_recovery');
select is(pg_temp.auto_counts(u),'{"payments":1,"canonical":2,"links":1,"items":1,"seats":0,"checkout":"completed"}'::jsonb,
 label||' one paid canonical plus retained trial') from cases where label in ('trialing','trial_recovery');
select is(a.status,'canceled','trial terminalized') from account_subscriptions a join trial_before t using(id);
select ok(a.trial_started_at=t.trial_started_at and a.trial_ends_at=t.trial_ends_at
 and a.trial_recovery_ends_at=t.trial_recovery_ends_at,'immutable trial clocks preserved') from account_subscriptions a join trial_before t using(id);
select ok(a.canceled_at=transaction_timestamp() and a.status_changed_at=a.canceled_at,'one transaction timestamp')
 from account_subscriptions a join trial_before t using(id);
select is((select count(*)::int from account_subscriptions where billing_account_id=t.billing_account_id
 and subscription_kind='paid' and status='active'),1,'one active paid canonical') from trial_before t;
select is((select count(*)::int from billing_canonical_origins where billing_account_id=t.billing_account_id
 and storage_contract='billing.v2'),1,'one guarded billing.v2 origin') from trial_before t;
select is((select count(*)::int from account_subscription_events e where e.billing_account_id=t.billing_account_id
 and event_type='subscription.converted_to_paid' and metadata->>'previousKind'='trial'
 and metadata->>'previousSubscriptionId'=t.id::text),1,'one linked conversion event') from trial_before t;
select is((select count(*)::int from account_subscription_events e where e.subscription_id=t.id
 and event_type='subscription.status_changed' and from_status=t.status and to_status='canceled'),1,'one trial transition audit') from trial_before t;
select is((resolve_account_entitlements(t.billing_account_id)#>>'{limits,countedClients}')::int,50,'paid Growth capacity replaces trial policy') from trial_before t;
select is(resolve_account_entitlements(t.billing_account_id)#>>'{subscription,effectiveStatus}','active','paid entitlement status') from trial_before t;
select is(billing_seat_effective_limit(t.billing_account_id),2,'paid seats remain base only') from trial_before t;

create function pg_temp.authority_snapshot() returns jsonb language plpgsql as $$
declare n text; value jsonb; result jsonb:='{}';
begin
 foreach n in array array['account_subscriptions','account_subscription_events','billing_canonical_origins',
 'billing_evidence_v2','billing_payment_applications_v2','billing_subscription_items_v2','billing_subscriptions_v2',
 'billing_checkouts_v2','billing_paddle_event_observations','billing_paddle_event_deliveries'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',n) into value;
 result:=result||jsonb_build_object(n,value);
 end loop;
 return result;
end $$;
create temp table exact_retry as select pg_temp.authority_snapshot() snapshot;
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'reused',label||' retry reused') from cases where label in ('trialing','trial_recovery');
select is(pg_temp.auto_dispatch(u,'subscription.created'),'reused',label||' alternate retry reused') from cases where label in ('trialing','trial_recovery');
select is(pg_temp.authority_snapshot(),(select snapshot from exact_retry),'exact retries change no history or authority row');

insert into cases values('trial-rollback',pg_temp.auto_checkout('trialing'),null);
select pg_temp.auto_ingest(u,'transaction.completed'),pg_temp.auto_ingest(u,'subscription.created') from cases where label='trial-rollback';
create function pg_temp.fail_trial_write() returns trigger language plpgsql as $$
begin raise exception 'SYNTHETIC_TRIAL_WRITE_FAILURE'; end $$;
create function pg_temp.rollback_checkpoint(table_name text,operation text,condition text) returns boolean language plpgsql as $$
declare before_state jsonb:=pg_temp.authority_snapshot(); caught boolean:=false;
begin
 execute format('create trigger zz_trial_failure after %s on public.%I for each row %s execute function pg_temp.fail_trial_write()',operation,table_name,condition);
 begin
 perform pg_temp.auto_dispatch(u,'transaction.completed') from cases where label='trial-rollback';
 set constraints all immediate;
 exception when raise_exception then
 if sqlerrm<>'SYNTHETIC_TRIAL_WRITE_FAILURE' then raise; end if;
 caught:=true;
 end;
 execute format('drop trigger zz_trial_failure on public.%I',table_name);
 return caught and pg_temp.authority_snapshot()=before_state;
end $$;
select ok(pg_temp.rollback_checkpoint('account_subscriptions','update', $$when (new.subscription_kind='trial' and new.status='canceled')$$),'rollback after trial terminalization');
select ok(pg_temp.rollback_checkpoint('billing_payment_applications_v2','insert',''),'rollback after payment');
select ok(pg_temp.rollback_checkpoint('account_subscriptions','insert', $$when (new.subscription_kind='paid')$$),'rollback after paid canonical');
select ok(pg_temp.rollback_checkpoint('billing_canonical_origins','insert',''),'rollback after origin claim');
select ok(pg_temp.rollback_checkpoint('billing_subscription_items_v2','insert',''),'rollback after item');
select ok(pg_temp.rollback_checkpoint('billing_subscriptions_v2','update', $$when (new.account_subscription_id is not null)$$),'rollback after shadow link');
select ok(pg_temp.rollback_checkpoint('billing_checkouts_v2','update', $$when (new.status='completed')$$),'rollback after checkout completion');
select ok(pg_temp.rollback_checkpoint('account_subscription_events','insert', $$when (new.event_type='subscription.converted_to_paid')$$),'rollback after conversion audit');
select is(pg_temp.auto_counts(u),'{"payments":0,"canonical":1,"links":0,"items":0,"seats":0,"checkout":"ready"}'::jsonb,
 'failures leave original trial and ready checkout only') from cases where label='trial-rollback';
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'applied','clean retry after all injected failures') from cases where label='trial-rollback';

insert into cases values('ineligible-trial',pg_temp.auto_checkout('trialing'),null);
select pg_temp.auto_ingest(u,'transaction.completed'),pg_temp.auto_ingest(u,'subscription.created') from cases where label='ineligible-trial';
create function pg_temp.reject_trial_mutation(p_sql text) returns text language plpgsql as $$
begin
 begin
 execute p_sql;
 perform pg_temp.auto_dispatch(u,'transaction.completed') from cases where label='ineligible-trial';
 raise exception 'UNEXPECTED_SUCCESS';
 exception when others then return sqlerrm;
 end;
end $$;
-- Corrupt fixtures are isolated inside rollback-only subtransactions.
set constraints all immediate;
select is(pg_temp.reject_trial_mutation(format($f$alter table account_subscriptions disable trigger account_subscription_history;
 update account_subscriptions set %s where billing_account_id=(select b.id from billing_accounts b join cases c on c.u=b.owner_user_id where c.label='ineligible-trial')$f$,mutation)),
 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT',label) from (values
 ('status=''active''','trial in noneligible active state'),
 ('status=''trial_recovery''','premature recovery malformed'),
 ('source=''manual''','nonstandard trial provenance rejected'),
 ('canceled_at=now()','current trial terminal timestamp rejected'),
 ('current_period_started_at=now(),current_period_ends_at=now()+interval ''1 month''','trial carrying paid period rejected'),
 ('trial_started_at=trial_started_at-interval ''30 days'',trial_ends_at=trial_ends_at-interval ''30 days'',trial_recovery_ends_at=trial_recovery_ends_at-interval ''30 days''','effective expired trial rejected'),
 ('trial_ends_at=trial_ends_at-interval ''1 day''','malformed immutable dates rejected'),
 ('subscription_kind=''complimentary'',status=''active'',trial_policy_version_id=null,trial_started_at=null,trial_ends_at=null,trial_recovery_ends_at=null','complimentary not enabled'),
 ('subscription_kind=''custom'',status=''active'',trial_policy_version_id=null,trial_started_at=null,trial_ends_at=null,trial_recovery_ends_at=null','custom authority rejected')
 ) v(mutation,label);
select is(pg_temp.reject_trial_mutation($f$drop index account_one_current_subscription;
 insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
 select a.billing_account_id,a.plan_version_id,'paid','active','manual' from account_subscriptions a
 join billing_accounts b on b.id=a.billing_account_id join cases c on c.u=b.owner_user_id where c.label='ineligible-trial'$f$),
 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT','multiple obligations rejected even without unique index');
select is(pg_temp.auto_counts(u),'{"payments":0,"canonical":1,"links":0,"items":0,"seats":0,"checkout":"ready"}'::jsonb,
 'rejections preserve original trial and evidence') from cases where label='ineligible-trial';

select is(pg_temp.reject_trial_mutation($f$
insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,canceled_at)
select c.billing_account_id,c.plan_version_id,'paid','canceled','billing_provider',now()
from billing_checkouts_v2 c join cases x on c.created_by_user_id=x.u where x.label='ineligible-trial';
insert into billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id)
select c.billing_account_id,'lemonsqueezy','test','96001','synthetic/trial-conflict'
from billing_checkouts_v2 c join cases x on c.created_by_user_id=x.u where x.label='ineligible-trial';
select pg_temp.put('billing_provider_subscriptions',to_jsonb(b)||jsonb_build_object('id',gen_random_uuid(),
'billing_account_id',c.billing_account_id,'account_subscription_id',(select id from account_subscriptions
where billing_account_id=c.billing_account_id and subscription_kind='paid'),
'provider_customer_id','synthetic/trial-conflict','provider_subscription_id','synthetic/trial-conflict',
'provider_order_id','synthetic/trial-conflict','provider_order_item_id','synthetic/trial-conflict',
'first_subscription_item_id','synthetic/trial-conflict','quantity',1,'approved_additional_coach_seats',0))
from billing_provider_subscriptions b join billing_provider_variant_mappings m on m.id=b.variant_mapping_id
join commercial_plan_versions p on p.id=m.plan_version_id cross join billing_checkouts_v2 c
join cases x on x.u=c.created_by_user_id where p.plan_key='growth' and m.cadence='monthly'
and x.label='ineligible-trial' limit 1;$f$),'PADDLE_RECONCILIATION_CANONICAL_CONFLICT',
'active cross-provider obligation blocks conversion even when its canonical is historical');

set constraints all immediate;
select * from finish();
rollback;
