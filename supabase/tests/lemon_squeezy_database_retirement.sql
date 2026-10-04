-- Authority retirement, not financial closure. All fixture rows are synthetic.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create temp table retired(signature text primary key);
insert into retired values
  ('apply_verified_billing_plan_change(uuid,jsonb,text,jsonb)'),
  ('apply_verified_billing_seat_quantity(uuid,jsonb,text,jsonb)'),
  ('begin_billing_plan_change(uuid,text,text,text,uuid,jsonb)'),
  ('begin_billing_seat_quantity(uuid,text,integer,uuid,jsonb)'),
  ('begin_cancel_billing_plan_change(uuid,text,uuid)'),
  ('begin_cancel_billing_seat_quantity(uuid,text,uuid)'),
  ('begin_my_billing_checkout_attempt(text,text,uuid,text)'),
  ('billing_plan_change_context(uuid,text)'),
  ('billing_seat_quantity_context(uuid,text)'),
  ('complete_billing_checkout_attempt(uuid,text,timestamp with time zone,text,text,timestamp with time zone)'),
  ('expire_stale_billing_checkout_attempts(uuid)'),
  ('fail_billing_checkout_attempt(uuid,text,timestamp with time zone,boolean,text)'),
  ('fail_billing_plan_change(uuid,uuid,boolean)'),
  ('fail_billing_seat_quantity(uuid,uuid,boolean)'),
  ('fail_billing_webhook_delivery(uuid)'),
  ('finish_billing_plan_change(uuid,text,jsonb,jsonb)'),
  ('get_billing_checkout_operation(uuid,uuid,text)'),
  ('get_billing_portal_subscription(uuid,text)'),
  ('get_billing_provider_store(text)'),
  ('get_billing_reconciliation_result(uuid)'),
  ('get_my_billing_checkout_state(uuid)'),
  ('get_my_billing_provider_summary()'),
  ('get_my_legacy_billing_plan_change_state()'),
  ('get_my_legacy_billing_seat_quantity_state()'),
  ('preview_billing_plan_change(uuid,text,text,text,jsonb)'),
  ('preview_billing_seat_quantity(uuid,text,integer,jsonb)'),
  ('reconcile_billing_provider_subscription(uuid,jsonb)'),
  ('record_billing_webhook_delivery(text,text,text,text,text,text,jsonb)');
grant select on retired to authenticated,service_role;
select is(count(*)::integer,28,'complete native entrypoint inventory exists')
from retired r join pg_proc p on p.oid=to_regprocedure('public.'||r.signature);
select ok(not has_function_privilege(role,p.oid,'execute'),role||' denied: '||r.signature)
from retired r join pg_proc p on p.oid=to_regprocedure('public.'||r.signature)
cross join unnest(array['anon','authenticated','service_role']) role;
select ok(not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where a.grantee=0 and a.privilege_type='EXECUTE'),'no PUBLIC grant: '||r.signature)
from retired r join pg_proc p on p.oid=to_regprocedure('public.'||r.signature);
select ok(p.proowner='postgres'::regrole and has_function_privilege('postgres',p.oid,'execute'),
 'historical owner-only definition retained: '||r.signature)
from retired r join pg_proc p on p.oid=to_regprocedure('public.'||r.signature);
-- Actual calls with typed NULLs prove ACL denial before argument processing.
set local role authenticated;
select throws_ok('select public.'||p.proname||'('||
 coalesce((select string_agg('null::'||t::regtype::text,',') from unnest(p.proargtypes::oid[]) t),'')||')',
 '42501',null,'authenticated direct call denied: '||r.signature)
from retired r join pg_proc p on p.oid=to_regprocedure('public.'||r.signature);
reset role;
set local role service_role;
select throws_ok('select public.'||p.proname||'('||
 coalesce((select string_agg('null::'||t::regtype::text,',') from unnest(p.proargtypes::oid[]) t),'')||')',
 '42501',null,'service direct call denied: '||r.signature)
from retired r join pg_proc p on p.oid=to_regprocedure('public.'||r.signature);
reset role;
-- Traverse every app-granted function, including definer/private intermediates.
with recursive functions as (
 select p.oid,p.proname,pg_get_functiondef(p.oid) body,
 has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')
 or has_function_privilege('service_role',p.oid,'execute') accessible
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
), edges as (
 select distinct f.oid source,t.oid target from functions f
 cross join lateral regexp_matches(f.body,'(?:public\.)?([a-z_][a-z0-9_]*)\s*\(','gi') name
 join functions t on t.proname=name[1] where f.oid<>t.oid
), reachable(oid) as (
 select oid from functions where accessible
 union select e.target from reachable r join edges e on e.source=r.oid
)
select is(count(*)::integer,0,'no direct or indirect app path to native LS authority')
from reachable p join retired r on p.oid=to_regprocedure('public.'||r.signature)
union all select ok((select count(*) from edges)>100,'source call graph is non-vacuous');
select is(to_regprocedure('public.inspect_lemon_squeezy_retirement_disposition_v1(timestamptz)'),null::regprocedure,'forensic classifier absent');
select ok(not has_table_privilege(role,table_name,'INSERT,UPDATE,DELETE'),role||' history DML denied: '||table_name)
from unnest(array['billing_provider_customers','billing_provider_subscriptions','billing_checkout_attempts',
 'billing_provider_webhook_deliveries','billing_plan_change_operations','billing_plan_change_events',
 'billing_seat_quantity_operations','billing_seat_quantity_events']) table_name
cross join unnest(array['anon','authenticated','service_role']) role;
select * from finish();
rollback;
