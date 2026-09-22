begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(to_regprocedure('public.create_paddle_checkout_certification_fixture_v1(uuid,text,text,integer,uuid)') is null,'create authority retired');
select ok(to_regprocedure('public.close_paddle_checkout_certification_fixture_v1(uuid)') is null,'close authority retired');
select ok(to_regprocedure('public.billing_paddle_certification_gate_v1(uuid)') is null,'fixture-only gate retired');
select ok(to_regclass('public.billing_paddle_checkout_certification_fixtures') is not null,'permanent fixture evidence retained');
select ok((select relrowsecurity from pg_class where oid='public.billing_paddle_checkout_certification_fixtures'::regclass),'history RLS retained');
select is((select count(*) from pg_trigger where tgrelid='public.billing_paddle_checkout_certification_fixtures'::regclass and tgname in ('paddle_certification_fixture_history','paddle_certification_fixture_no_truncate') and tgenabled='O'),2::bigint,'both enabled history triggers retained');
select ok(not exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.billing_paddle_checkout_certification_fixtures'::regclass and a.grantee=0),'PUBLIC has no direct access');
select ok(not has_table_privilege(r,'public.billing_paddle_checkout_certification_fixtures',p),r||' denied '||p) from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
-- Inspect every surviving public routine, not just the three retired names.
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.prosrc ~* 'billing_paddle_checkout_certification_fixtures|repsync_paddle_certification|paddle_certification_gate|paddle_checkout_certification_fixture')),0::bigint,'no surviving direct or indirect certification routine');
select is((select count(*) from pg_views where schemaname='public' and definition ilike '%billing_paddle_checkout_certification_fixtures%'),0::bigint,'no history access view');

select * from finish();
rollback;
