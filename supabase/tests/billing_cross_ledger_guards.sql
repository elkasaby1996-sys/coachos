begin;
select no_plan();
set local client_min_messages=warning;
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql

select pg_temp.mapping(k,c,e,'synthetic-db02/'||k||'/'||c) from unnest(array['launch','growth','scale','coach-seat']) k
cross join unnest(array['monthly','annual']) c cross join unnest(array['test','live']) e;
create temp table guard_actors(name text primary key,u uuid,op uuid default gen_random_uuid(),intent uuid);
insert into guard_actors(name,u) values('ls-first',pg_temp.guard_owner()),('v2-first',pg_temp.guard_owner()),
 ('stale',pg_temp.guard_owner()),('lease',pg_temp.guard_owner()),('op-ls-first',pg_temp.coach('growth')),
 ('op-v2-first',pg_temp.coach('growth')),('environment',pg_temp.coach('growth')),('unlinked',pg_temp.guard_owner());

update guard_actors set intent=pg_temp.guard_checkout(u,'ls',op) where name='ls-first';
select throws_ok(format('select pg_temp.guard_checkout(%L,''v2'')',u),'P0001','BILLING_GUARD_CHECKOUT_ALREADY_OPEN','LS checkout excludes v2') from guard_actors where name='ls-first';
select throws_ok(format('select pg_temp.guard_checkout(%L,''v2'',%L)',u,op),'P0001','BILLING_GUARD_OPERATION_CONFLICT','same operation cannot switch checkout provider') from guard_actors where name='ls-first';
select is(pg_temp.guard_checkout(u,'ls',op),intent,'LS compatible retry retains original ID') from guard_actors where name='ls-first';
update guard_actors set intent=pg_temp.guard_checkout(u,'v2',op) where name='v2-first';
select throws_ok(format('select pg_temp.guard_checkout(%L,''ls'')',u),'P0001','BILLING_GUARD_CHECKOUT_ALREADY_OPEN','v2 checkout excludes LS') from guard_actors where name='v2-first';
select is(pg_temp.guard_checkout(u,'v2',op),intent,'v2 compatible retry retains original ID') from guard_actors where name='v2-first';
select throws_ok(format('select billing_v2_admit_checkout(%L,''test'',''scale'',''monthly'',0,%L)',u,op),'P0001','BILLING_GUARD_OPERATION_CONFLICT','v2 changed intent fails closed') from guard_actors where name='v2-first';
update billing_checkouts_v2 set status='failed',failed_at=now() where id=(select intent from guard_actors where name='v2-first');
select throws_ok(format('select pg_temp.guard_checkout(%L,''ls'',%L)',u,op),'P0001','BILLING_GUARD_OPERATION_CONFLICT','terminal operation IDs cannot cross ledgers') from guard_actors where name='v2-first';

insert into billing_checkouts_v2(billing_account_id,created_by_user_id,operation_id,provider,environment,plan_version_id,cadence,base_mapping_id,status,created_at,expected_expires_at,creation_lease_expires_at)
select a.id,g.u,g.op,'paddle','test',m.plan_version_id,'monthly',m.id,'creating',now()-interval '1 hour',
 case g.name when 'stale' then now()-interval '1 minute' else now()+interval '10 minutes' end,now()-interval '30 minutes'
from guard_actors g join billing_accounts a on a.owner_user_id=g.u cross join billing_price_mappings m
where g.name in ('stale','lease') and m.environment='test' and m.canonical_key='growth' and m.cadence='monthly';
select lives_ok(format('select pg_temp.guard_checkout(%L,''ls'')',u),'LS admission expires stale v2 intent') from guard_actors where name='stale';
select is((select v.status from billing_checkouts_v2 v join guard_actors g on g.op=v.operation_id where g.name='stale'),'expired','stale attempt terminalized');
select throws_ok(format('select pg_temp.guard_checkout(%L,''ls'')',u),'P0001','BILLING_GUARD_CHECKOUT_ALREADY_OPEN','expired creation lease alone does not permit a second sale') from guard_actors where name='lease';
select public.billing_guard_expire_checkouts(a.id) from billing_accounts a join guard_actors g on g.u=a.owner_user_id where g.name='lease';
select is((select v.status from billing_checkouts_v2 v join guard_actors g on g.op=v.operation_id where g.name='lease'),'ambiguous','lease cleanup retains unresolved intent');

select pg_temp.guard_operation(u,'ls','plan',op) from guard_actors where name='op-ls-first';
select throws_ok(format('select pg_temp.guard_operation(%L,''v2'',''seat'')',u),'P0001','BILLING_GUARD_OPERATION_ALREADY_OPEN','LS plan excludes v2 seat') from guard_actors where name='op-ls-first';
select pg_temp.guard_operation(u,'v2','seat',op) from guard_actors where name='op-v2-first';
select throws_ok(format('select pg_temp.guard_operation(%L,''ls'',''plan'')',u),'P0001','BILLING_GUARD_OPERATION_ALREADY_OPEN','v2 seat excludes LS plan') from guard_actors where name='op-v2-first';
update billing_operations_v2 set status='failed',failed_at=now() where operation_id=(select op from guard_actors where name='op-v2-first');
select throws_ok(format('select pg_temp.guard_operation(%L,''ls'',''seat'',%L)',u,op),'P0001','BILLING_GUARD_OPERATION_CONFLICT','terminal operation ID reserved across plan/seat contracts') from guard_actors where name='op-v2-first';
select lives_ok(format('select pg_temp.guard_operation(%L,''ls'',''seat'')',u),'new operation admitted after terminal v2 operation') from guard_actors where name='op-v2-first';

-- Capture canonical state before any opposite-environment attempts.
create temp table guard_before as select a.id,to_jsonb(s) subscription,resolve_account_entitlements(a.id) entitlements,
 resolve_account_capacity(a.owner_user_id,a.id) capacity
from billing_accounts a join guard_actors g on g.u=a.owner_user_id join account_subscriptions s on s.billing_account_id=a.id
where g.name='environment';
select pg_temp.guard_subscription(u,'live') from guard_actors where name='environment';
select lives_ok(format('select pg_temp.evidence(''live'',''subscription'',%L,''{}'',%L)',
 jsonb_build_object('customerRef','synthetic-customer/'||u,'subscriptionRef','synthetic-subscription/'||u),s.id),'opposite-environment evidence retained')
from guard_actors g join billing_accounts a on a.owner_user_id=g.u join billing_subscriptions_v2 s on s.billing_account_id=a.id and s.environment='live' where g.name='environment';
select throws_ok(format('select billing_v2_admit_checkout(%L,''live'',''growth'',''monthly'',0,gen_random_uuid())',u),'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','v2 admission fenced') from guard_actors where name='environment';
select set_config('request.jwt.claim.sub',u::text,true) from guard_actors where name='environment';
select throws_ok($$select begin_my_billing_checkout_attempt('growth','monthly',gen_random_uuid(),'live')$$,'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','legacy admission fenced');
select throws_ok($$update billing_subscriptions_v2 set approved_additional_coach_seats=1 where environment='live'$$,'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','opposite-environment seat approval fenced');
select throws_ok($$update billing_subscriptions_v2 v set account_subscription_id=s.id from account_subscriptions s where s.billing_account_id=v.billing_account_id and v.environment='live'$$,
 'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','opposite-environment canonical linkage fenced');
select throws_ok($$insert into billing_payment_applications_v2(provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind,checkout_id)
 select 'paddle','live','synthetic-transaction',billing_account_id,id,gen_random_uuid(),'initial',gen_random_uuid() from billing_subscriptions_v2 where environment='live'$$,
 'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','opposite-environment payment application fenced before FK validation');
update billing_runtime_policy set entitlement_environment='live';
select throws_ok(format('select finish_billing_plan_change(%L,''test'',pg_temp.snapshot(%L))',u,u),'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','legacy reconciliation cannot mutate wrong-environment canonical state') from guard_actors where name='environment';
update billing_runtime_policy set entitlement_environment='test';
select is(to_jsonb(s),b.subscription,'canonical rows unchanged after rejected effects') from guard_before b join account_subscriptions s on s.id=(b.subscription->>'id')::uuid;
select is(resolve_account_entitlements(id),entitlements,'entitlements unchanged after rejected effects') from guard_before;
select is(resolve_account_capacity(a.owner_user_id,b.id),b.capacity,'capacity unchanged after rejected effects') from guard_before b join billing_accounts a on a.id=b.id;

select throws_ok(format('select billing_guard_claim_canonical(%L,%L,''billing.v2'')',b.billing_account_id,b.account_subscription_id),
 'P0001','BILLING_GUARD_CANONICAL_ALREADY_OWNED','linked LS canonical row cannot switch provider') from billing_provider_subscriptions b limit 1;
select throws_ok(format('select billing_guard_claim_canonical(%L,%L,''billing.v2'')',s.billing_account_id,s.id),
 'P0001','BILLING_GUARD_CANONICAL_ALREADY_OWNED','superseded LS canonical origin retained') from account_subscriptions s where s.status='superseded' limit 1;
select pg_temp.guard_subscription(u) from guard_actors where name='environment';
select throws_ok($$update billing_subscriptions_v2 v set account_subscription_id=b.account_subscription_id
 from billing_provider_subscriptions b where b.billing_account_id=v.billing_account_id and v.environment='test'$$,
 'P0001','BILLING_GUARD_CANONICAL_ALREADY_OWNED','actual v2 link trigger rejects an LS-owned canonical row');

-- A retained intent from a previously configured environment cannot complete.
update billing_runtime_policy set entitlement_environment='live';
select billing_v2_admit_checkout(u,'live','growth','monthly',0,op) from guard_actors where name='unlinked';
select pg_temp.guard_subscription(u,'live') from guard_actors where name='unlinked';
update billing_runtime_policy set entitlement_environment='test';
select throws_ok($$update billing_checkouts_v2 c set status='completed',completed_at=now(),completed_subscription_id=s.id
 from billing_subscriptions_v2 s where c.billing_account_id=s.billing_account_id and c.environment='live' and s.environment='live'$$,
 'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','retained opposite-environment checkout cannot complete');
select throws_ok(format('select begin_billing_plan_change(%L,''live'',''scale'',''monthly'',gen_random_uuid(),pg_temp.snapshot(%L))',u,u),
 'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','legacy plan admission rejects wrong runtime environment') from guard_actors where name='environment';
select throws_ok(format('select begin_billing_seat_quantity(%L,''live'',1,gen_random_uuid(),pg_temp.seat_snapshot(%L,1))',u,u),
 'P0001','BILLING_GUARD_ENVIRONMENT_MISMATCH','legacy seat admission rejects wrong runtime environment') from guard_actors where name='environment';
select throws_ok($$delete from billing_canonical_origins$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','canonical ownership cannot be forgotten');
select throws_ok($$update billing_canonical_origins set storage_contract='billing.v2'$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','canonical ownership cannot switch');
select ok(not has_table_privilege(r,'billing_canonical_origins','SELECT,INSERT,UPDATE,DELETE'),r||' cannot access origins') from unnest(array['anon','authenticated','service_role']) r;
select ok(not p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public'] and not has_function_privilege(r,p.oid,'EXECUTE'),r||' cannot call '||p.proname)
from pg_proc p cross join unnest(array['anon','authenticated','service_role']) r where p.pronamespace='public'::regnamespace and (p.proname like 'billing_guard_%' or p.proname='billing_v2_admit_checkout');
select ok((select relrowsecurity from pg_class where oid='billing_canonical_origins'::regclass),'origin registry has RLS');
select is((select count(*) from billing_runtime_policy where paddle_sales_enabled or paddle_reconciliation_enabled),0::bigint,'Paddle flags remain disabled');
select is((select count(*) from billing_subscriptions_v2 where account_subscription_id is not null or approved_additional_coach_seats<>0),0::bigint,'foundation canonical/seat hard stops retained');
set constraints all immediate;
select * from finish();
rollback;
