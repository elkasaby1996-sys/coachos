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
update billing_runtime_policy set paddle_reconciliation_enabled=true;

create function pg_temp.catalogue_checkout(plan text,cad text,trial text default null) returns uuid language plpgsql as $$
declare u uuid:=pg_temp.guard_owner(); j jsonb;
begin
 if trial is not null then perform pg_temp.auto_trial(u,trial); end if;
 update billing_runtime_policy set paddle_sales_enabled=true;
 j:=begin_paddle_checkout_v1(u,plan,cad,0,gen_random_uuid(),true,true,'2026-09-18','2026-09-18');
 perform mark_paddle_checkout_ready_v1(u,(j->>'attemptReference')::uuid,(j->>'operationReference')::uuid,
 'synthetic/txn/'||u,'ready','USD',jsonb_build_array(j->'base'));
 update billing_runtime_policy set paddle_sales_enabled=false;
 return u;
end $$;
create function pg_temp.catalogue_observation(u uuid,k text) returns jsonb language sql as $$
 select pg_temp.auto_observation(u,k)||jsonb_build_object('items',jsonb_build_array(
 jsonb_build_object('priceRef',m.provider_price_ref,'productRef',m.provider_product_ref,'quantity',1,
 'unitPrice',jsonb_build_object('amount',m.unit_amount_minor::text,'currency','USD'))||
 case when k='subscription.created' then jsonb_build_object('status','active') else '{}'::jsonb end))
 ||case when k='transaction.completed' then jsonb_build_object('origin','web','billingPeriod',jsonb_build_object(
 'startsAt','2026-09-20T00:00:00Z','endsAt',case m.cadence when 'annual' then '2027-09-20T00:00:00Z' else '2026-10-20T00:00:00Z' end)) else '{}'::jsonb end
 from billing_checkouts_v2 c join billing_price_mappings m on m.id=c.base_mapping_id where c.created_by_user_id=u
$$;
create temp table matrix(plan text,cad text,trial text,u uuid,result text);
insert into matrix select p,c,t,pg_temp.catalogue_checkout(p,c,t),null
 from unnest(array['launch','growth','scale']) p cross join unnest(array['monthly','annual']) c
 cross join unnest(array[null,'trialing','trial_recovery']::text[]) t;
-- Both delivery orders, with a deliberate gap before complementary proof arrives.
select pg_temp.webhook_ingest(pg_temp.catalogue_observation(u,case when trial is null then 'transaction.completed' else 'subscription.created' end)) from matrix;
select is(pg_temp.auto_dispatch(u,case when trial is null then 'transaction.completed' else 'subscription.created' end),'pending',plan||' '||cad||' incomplete/delayed proof waits') from matrix;
select pg_temp.webhook_ingest(pg_temp.catalogue_observation(u,case when trial is null then 'subscription.created' else 'transaction.completed' end)) from matrix;
update matrix set result=pg_temp.auto_dispatch(u,case when trial is null then 'subscription.created' else 'transaction.completed' end);
select is(result,'applied',plan||' '||cad||' activates '||coalesce(trial,'non-trial')) from matrix;
set constraints all immediate;
select is(e#>>'{subscription,planKey}',plan,plan||' '||cad||' normalized entitlement plan') from matrix cross join lateral (select resolve_account_entitlements((select id from billing_accounts where owner_user_id=u)) e) q;
select is(e#>>'{subscription,kind}','paid',plan||' '||cad||' paid authority') from matrix cross join lateral (select resolve_account_entitlements((select id from billing_accounts where owner_user_id=u)) e) q;
select is((select count(*)::int from billing_payment_applications_v2 where billing_account_id=(select id from billing_accounts where owner_user_id=u)),1,plan||' '||cad||' one exact payment') from matrix;
select is((select i.cadence from billing_subscription_items_v2 i join billing_accounts a on a.id=i.billing_account_id where a.owner_user_id=u),cad,plan||' '||cad||' real canonical cadence') from matrix;
select is((select i.quantity from billing_subscription_items_v2 i join billing_accounts a on a.id=i.billing_account_id where a.owner_user_id=u),1,plan||' '||cad||' base quantity one') from matrix;
select is((select a.current_period_ends_at from account_subscriptions a join billing_accounts b on b.id=a.billing_account_id where b.owner_user_id=u and a.subscription_kind='paid'),
 case cad when 'annual' then '2027-09-20T00:00:00Z'::timestamptz else '2026-10-20T00:00:00Z'::timestamptz end,plan||' '||cad||' authenticated actual period end') from matrix;
select is((select count(*)::int from account_subscriptions a join billing_accounts b on b.id=a.billing_account_id where b.owner_user_id=u and a.subscription_kind='trial' and a.status='canceled'),case when trial is null then 0 else 1 end,plan||' '||cad||' trial history retained/terminated') from matrix;
select is(billing_seat_effective_limit(b.id),p.included_coach_seats,plan||' '||cad||' normalized capacity') from matrix join billing_accounts b on b.owner_user_id=u join commercial_plan_versions p on p.plan_key=plan and p.status='active';
select is(pg_temp.auto_dispatch(u,'transaction.completed'),'reused',plan||' '||cad||' idempotent settled retry') from matrix;
select is(pg_temp.auto_dispatch(u,'subscription.created'),'reused',plan||' '||cad||' duplicate complementary delivery') from matrix;
select is((select count(*)::int from billing_payment_applications_v2 where billing_account_id=(select id from billing_accounts where owner_user_id=u)),1,plan||' '||cad||' retry no extra payment') from matrix;

-- The full retained-provenance chain remains authoritative. Invalid local
-- observations must never produce a canonical paid subscription/payment.
create function pg_temp.catalogue_reject(plan text,patch jsonb,subscription_patch jsonb default '{}') returns boolean language plpgsql as $$
declare u uuid; result boolean;
begin
 begin
 u:=pg_temp.catalogue_checkout(plan,'annual');
 begin
 perform pg_temp.webhook_ingest(pg_temp.catalogue_observation(u,'transaction.completed')||patch);
 perform pg_temp.webhook_ingest(pg_temp.catalogue_observation(u,'subscription.created')||subscription_patch);
 perform pg_temp.auto_dispatch(u,'subscription.created');
 exception when others then null; end;
 result:=not exists(select 1 from account_subscriptions a join billing_accounts b on b.id=a.billing_account_id where b.owner_user_id=u and a.subscription_kind='paid')
 and not exists(select 1 from billing_payment_applications_v2 p join billing_accounts b on b.id=p.billing_account_id where b.owner_user_id=u);
 raise exception 'test rollback' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null; end;
 return result;
end $$;
select ok(pg_temp.catalogue_reject(p,patch),p||' annual rejects '||label)
from unnest(array['launch','growth','scale']) p cross join (values
 ('wrong currency','{"currency":"EUR"}'::jsonb),
 ('wrong environment','{"environment":"live"}'::jsonb),
 ('wrong account','{"customerRef":"synthetic/other-account"}'::jsonb),
 ('wrong subscription','{"subscriptionRef":"synthetic/other-subscription"}'::jsonb),
 ('unsettled payment','{"status":"paid"}'::jsonb),
 ('missing annual period','{"billingPeriod":null}'::jsonb),
 ('monthly period','{"billingPeriod":{"startsAt":"2026-09-20T00:00:00Z","endsAt":"2026-10-20T00:00:00Z"}}'::jsonb)
) cases(label,patch);
create function pg_temp.catalogue_wrong_item(plan text,path text[],value jsonb) returns boolean language plpgsql as $$
declare u uuid; item jsonb; result boolean;
begin
 begin
 u:=pg_temp.catalogue_checkout(plan,'annual');
 if cardinality(path)=0 then
 item:=jsonb_build_array(pg_temp.catalogue_observation(u,'transaction.completed')#>'{items,0}',pg_temp.catalogue_observation(u,'transaction.completed')#>'{items,0}');
 else item:=jsonb_set(pg_temp.catalogue_observation(u,'transaction.completed')->'items',path,value); end if;
 begin
 perform pg_temp.webhook_ingest(pg_temp.catalogue_observation(u,'transaction.completed')||jsonb_build_object('items',item));
 perform pg_temp.webhook_ingest(pg_temp.catalogue_observation(u,'subscription.created'));
 perform pg_temp.auto_dispatch(u,'subscription.created');
 exception when others then null; end;
 result:=not exists(select 1 from account_subscriptions a join billing_accounts b on b.id=a.billing_account_id where b.owner_user_id=u and a.subscription_kind='paid')
 and not exists(select 1 from billing_payment_applications_v2 p join billing_accounts b on b.id=p.billing_account_id where b.owner_user_id=u);
 raise exception 'test rollback' using errcode='ZX001'; exception when sqlstate 'ZX001' then null; end;
 return result;
end $$;
select ok(pg_temp.catalogue_wrong_item(p,path,value),p||' annual rejects '||label)
from unnest(array['launch','growth','scale']) p cross join (values
 ('wrong quantity','{0,quantity}'::text[],'2'::jsonb),
 ('wrong price','{0,priceRef}','"synthetic/wrong-price"'),
 ('monthly price','{0,priceRef}','"synthetic/price/growth/monthly"'),
 ('wrong plan','{0,productRef}','"synthetic/product/other-plan"'),
 ('wrong item currency','{0,unitPrice,currency}','"EUR"'),
 ('wrong amount','{0,unitPrice,amount}','"1"')
) cases(label,path,value);
select ok(pg_temp.catalogue_reject(p,'{}','{"status":"trialing"}'),p||' provider trial denied') from unnest(array['launch','growth','scale']) p;
select ok(pg_temp.catalogue_wrong_item(p,'{}',null),p||' annual ambiguous duplicate recurring payment items denied') from unnest(array['launch','growth','scale']) p;
select ok(not has_function_privilege(r,'billing_paid_state_v1(uuid,timestamptz)','execute'),'normalized internal projection denied to '||r) from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_function_privilege(r,'billing_paddle_initial_period_matches_v1(uuid,jsonb,timestamptz)','execute'),'period helper denied to '||r) from unnest(array['anon','authenticated','service_role']) r;
select ok(has_function_privilege('service_role','billing_workflow_provider_v1(uuid)','execute'),'service workflow provider resolver');
select ok(not has_function_privilege('authenticated','billing_workflow_provider_v1(uuid)','execute'),'browser cannot resolve private workflow authority');
select ok(not has_function_privilege(r,f,'execute'),f||' private integration projection denied to '||r)
from unnest(array['anon','authenticated','service_role']) r cross join unnest(array[
 'billing_paddle_paid_state_v1(uuid,timestamptz)','billing_paddle_plan_state_v1()','billing_paddle_seat_state_v1()']) f;
-- Provider catalogue year intervals are checked in UTC, not 365-day or
-- twelve-month approximations. The stored endpoint remains provider evidence.
select ok(billing_paddle_initial_period_matches_v1(id,
 '{"startsAt":"2024-02-29T00:00:00Z","endsAt":"2025-02-28T00:00:00Z"}',
 '2024-02-29T00:00:01Z'),canonical_key||' trusted annual leap-day clamp')
 from billing_price_mappings where cadence='annual' and identity_kind='plan';
select ok(billing_paddle_initial_period_matches_v1(id,
 '{"startsAt":"2027-03-01T10:00:00+03:00","endsAt":"2028-03-01T07:00:00Z"}',
 '2027-03-01T07:00:01Z'),canonical_key||' annual leap-year and timezone evidence')
 from billing_price_mappings where cadence='annual' and identity_kind='plan';
select ok(not billing_paddle_initial_period_matches_v1(id,
 '{"startsAt":"2027-03-01T07:00:00Z","endsAt":"2028-02-29T07:00:00Z"}',
 '2027-03-01T07:00:01Z'),canonical_key||' rejects fixed 365-day annual approximation')
 from billing_price_mappings where cadence='annual' and identity_kind='plan';
select ok(not billing_paddle_initial_period_matches_v1(id,
 '{"startsAt":"2026-09-20T00:00:00Z","endsAt":"2027-09-20T00:00:00Z"}',
 '2027-09-20T00:00:00Z'),canonical_key||' settlement outside annual period rejected')
 from billing_price_mappings where cadence='annual' and identity_kind='plan';
select ok(position('billing_paddle_' in pg_get_functiondef('resolve_account_entitlements(uuid)'::regprocedure))=0,'entitlement core consumes only normalized paid state');
select ok(position('billing_subscriptions_v2' in pg_get_functiondef('billing_seat_effective_limit(uuid,boolean)'::regprocedure))=0,'seat capacity core has no integration storage dependency');
select * from finish();
rollback;
