begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select results_eq(
  $$select plan_key, version, currency_code, monthly_price_minor, annual_price_minor,
    max_counted_clients, included_coach_seats, max_coach_seats, max_active_workspaces,
    max_published_packages, is_most_popular, sort_order
    from public.commercial_plan_versions where status = 'active' and is_public order by sort_order$$,
  $$values
    ('launch'::text, 1, 'USD'::text, 1900, 19000, 10, 1, 2, 1, 3, false, 10),
    ('growth'::text, 1, 'USD'::text, 5900, 59000, 50, 2, 5, 3, null::integer, true, 20),
    ('scale'::text, 1, 'USD'::text, 11900, 119000, 100, 5, 10, 5, null::integer, false, 30)$$,
  'exact v1 active public plans, prices, capacities, order and sole popular Growth'
);
select is((select count(*) from commercial_plan_versions where plan_key = 'studio'), 0::bigint, 'no Studio row');
select is((select count(*) from commercial_features), 63::bigint, 'all 63 canonical features seeded');
select results_eq(
  $$select p.plan_key, count(e.feature_key) from commercial_plan_versions p join commercial_plan_feature_entitlements e on e.plan_version_id = p.id group by p.plan_key order by p.plan_key$$,
  $$values ('growth'::text, 47::bigint), ('launch'::text, 29::bigint), ('scale'::text, 63::bigint)$$,
  'exact entitlement mapping counts'
);
select is((select count(*) from commercial_features where readiness_status = 'COMMERCIALLY_SALEABLE'), 0::bigint, 'no unsupported commercial-release claims');

-- Clone contract values into test-only versions without disabling any trigger.
create function pg_temp.catalogue_plan(p_key text, p_version integer, p_status text default 'draft', p_public boolean default false, p_popular boolean default false, p_order integer default 90)
returns void language sql as $$
  insert into public.commercial_plan_versions (
    plan_key, version, display_name, status, currency_code, monthly_price_minor, annual_price_minor,
    max_counted_clients, included_coach_seats, max_coach_seats, max_active_workspaces,
    max_published_packages, is_public, is_most_popular, sort_order
  ) values (p_key, p_version, 'Test plan', p_status, 'USD', 1900, 19000, 10, 1, 2, 1, 3, p_public, p_popular, p_order);
$$;
select throws_ok($$select pg_temp.catalogue_plan('launch', 2, 'active')$$, '23505', null, 'duplicate active version rejected');
select throws_ok($$select pg_temp.catalogue_plan('growth', 1)$$, '23505', null, 'duplicate plan/version rejected');
select throws_ok($$select pg_temp.catalogue_plan('studio', 1)$$, '23514', null, 'Studio key rejected');
select throws_ok($$select pg_temp.catalogue_plan('custom', 1, 'active', true)$$, '23514', null, 'custom cannot be public');
select throws_ok($$select pg_temp.catalogue_plan('custom', 1, 'draft', true)$$, '23514', null, 'draft cannot be public');
select throws_ok($$select pg_temp.catalogue_plan('custom', 1, 'draft', false, true)$$, '23514', null, 'popular must be public');

select throws_ok($$update commercial_plan_versions set monthly_price_minor = 2000 where plan_key = 'launch'$$, 'P0001', 'Active commercial plan contracts are immutable.', 'active price update rejected');
select throws_ok($$update commercial_plan_versions set max_counted_clients = 11 where plan_key = 'launch'$$, 'P0001', 'Active commercial plan contracts are immutable.', 'active capacity update rejected');
select throws_ok($$update commercial_plan_versions set status = 'draft' where plan_key = 'launch'$$, 'P0001', null, 'active cannot revert to draft');
select throws_ok($$update commercial_plan_versions set is_public = false where plan_key = 'launch'$$, 'P0001', null, 'active visibility cannot change without retirement');
select throws_ok($$update commercial_plan_versions set status = 'retired' where plan_key = 'launch'$$, 'P0001', null, 'retirement requires complete metadata');
select throws_ok($$insert into commercial_plan_feature_entitlements (plan_version_id, feature_key) select id, 'support.priority' from commercial_plan_versions where plan_key = 'launch'$$, 'P0001', null, 'active entitlement insert rejected');
select throws_ok($$update commercial_plan_feature_entitlements set configuration = '{"test":true}' where feature_key = 'core.messaging'$$, 'P0001', null, 'active entitlement update rejected');
select throws_ok($$delete from commercial_plan_feature_entitlements where feature_key = 'core.messaging'$$, 'P0001', null, 'active entitlement delete rejected');
select throws_ok($$update commercial_features set feature_key = 'core.new_key' where feature_key = 'core.messaging'$$, 'P0001', 'Commercial feature keys are immutable.', 'feature-key update rejected');
select throws_ok($$delete from commercial_features where feature_key = 'core.messaging'$$, 'P0001', 'Commercial features cannot be deleted.', 'feature delete rejected');
select throws_ok($$delete from commercial_plan_versions where plan_key = 'launch'$$, 'P0001', 'Commercial plan versions cannot be deleted.', 'plan delete rejected');
select throws_ok($$insert into commercial_features (feature_key, domain, display_name) values ('core.bad', 'team', 'Bad')$$, '23514', null, 'feature domain must match prefix');
select throws_ok($$insert into commercial_features (feature_key, domain, display_name) values ('core.Bad', 'core', 'Bad')$$, '23514', null, 'feature syntax is lowercase');

select pg_temp.catalogue_plan('custom', 1);
select lives_ok($$update commercial_plan_versions set monthly_price_minor = 0, annual_price_minor = 0, max_counted_clients = 20 where plan_key = 'custom'$$, 'draft contract can be edited and private prices may be zero');
select throws_ok($$update commercial_plan_versions set currency_code = 'usd' where plan_key = 'custom'$$, '23514', null, 'invalid currency rejected');
select throws_ok($$update commercial_plan_versions set monthly_price_minor = -1 where plan_key = 'custom'$$, '23514', null, 'negative price rejected');
select throws_ok($$update commercial_plan_versions set included_coach_seats = 3 where plan_key = 'custom'$$, '23514', null, 'included seats cannot exceed max');
select throws_ok($$update commercial_plan_versions set max_published_packages = 0 where plan_key = 'custom'$$, '23514', null, 'package capacity must be null or positive');
select throws_ok($$update commercial_plan_versions set retired_at = now() where plan_key = 'custom'$$, '23514', null, 'non-retired versions cannot have retirement timestamp');
select lives_ok($$insert into commercial_plan_feature_entitlements (plan_version_id, feature_key) select id, 'core.messaging' from commercial_plan_versions where plan_key = 'custom'$$, 'draft mapping insertion works');
select throws_ok($$update commercial_plan_feature_entitlements set configuration = '[]' where plan_version_id = (select id from commercial_plan_versions where plan_key = 'custom')$$, '23514', null, 'configuration must be an object');
select lives_ok($$update commercial_plan_feature_entitlements set configuration = '{"test":true}' where plan_version_id = (select id from commercial_plan_versions where plan_key = 'custom')$$, 'draft mapping update works');
select throws_ok($$update commercial_plan_feature_entitlements set plan_version_id = (select id from commercial_plan_versions where plan_key = 'custom') where plan_version_id = (select id from commercial_plan_versions where plan_key = 'launch') and feature_key = 'core.client_management'$$, 'P0001', null, 'moving from active to draft is rejected');
select throws_ok($$update commercial_plan_feature_entitlements set plan_version_id = (select id from commercial_plan_versions where plan_key = 'launch') where plan_version_id = (select id from commercial_plan_versions where plan_key = 'custom')$$, 'P0001', null, 'moving from draft to active is rejected');
select lives_ok($$delete from commercial_plan_feature_entitlements where plan_version_id = (select id from commercial_plan_versions where plan_key = 'custom')$$, 'draft mapping deletion works');

-- Public RPC tests exercise real database roles, not only ACL introspection.
set local role anon;
select throws_ok($$select * from public.commercial_features$$, '42501', null, 'anon cannot read features');
select throws_ok($$select * from public.commercial_plan_versions$$, '42501', null, 'anon cannot read plans');
select throws_ok($$select * from public.commercial_plan_feature_entitlements$$, '42501', null, 'anon cannot read mappings');
select lives_ok($$select public.get_public_commercial_catalogue()$$, 'anon can execute public catalogue RPC');
select is(public.get_public_commercial_catalogue()->>'schemaVersion', '1', 'public schema version is 1');
select is(jsonb_path_query_array(public.get_public_commercial_catalogue(), '$.plans[*].planKey'), '["launch","growth","scale"]'::jsonb, 'public plan order is deterministic and draft custom is hidden');
select is(public.get_public_commercial_catalogue()#>'{plans,1,capacities,publishedPackages}', 'null'::jsonb, 'unlimited Growth package capacity remains JSON null');
select is(jsonb_path_query_array(public.get_public_commercial_catalogue(), '$.plans[*].features[*]'), '[]'::jsonb, 'initial features are hidden');
reset role;
set local role authenticated;
select throws_ok($$select * from public.commercial_features$$, '42501', null, 'authenticated cannot read features');
select throws_ok($$select * from public.commercial_plan_versions$$, '42501', null, 'authenticated cannot read plans');
select throws_ok($$select * from public.commercial_plan_feature_entitlements$$, '42501', null, 'authenticated cannot read mappings');
select throws_ok($$update public.commercial_features set visibility = 'public'$$, '42501', null, 'authenticated cannot write catalogue');
select lives_ok($$select public.get_public_commercial_catalogue()$$, 'authenticated can execute public catalogue RPC');
reset role;

-- Exercise both public filters independently, including an unmapped public feature.
update commercial_features set readiness_status = 'DRAFT', visibility = 'public' where feature_key = 'core.client_management';
update commercial_features set readiness_status = 'IMPLEMENTED', visibility = 'public' where feature_key = 'core.client_onboarding';
update commercial_features set readiness_status = 'COMMERCIALLY_SALEABLE', visibility = 'internal' where feature_key = 'core.program_delivery';
update commercial_features set readiness_status = 'COMMERCIALLY_SALEABLE', visibility = 'beta' where feature_key = 'core.workout_delivery';
update commercial_features set readiness_status = 'COMMERCIALLY_SALEABLE', visibility = 'public', marketing_label = 'Messages', description = 'INTERNAL NOTE', sort_order = 5 where feature_key = 'core.messaging';
update commercial_features set readiness_status = 'COMMERCIALLY_SALEABLE', visibility = 'public', sort_order = 1 where feature_key = 'core.exercise_library';
update commercial_features set readiness_status = 'COMMERCIALLY_SALEABLE', visibility = 'public' where feature_key = 'support.priority';
insert into commercial_features (feature_key, domain, display_name, readiness_status, visibility) values ('core.test_unmapped', 'core', 'Unmapped', 'COMMERCIALLY_SALEABLE', 'public');
set local role anon;
select is(jsonb_path_query_array(public.get_public_commercial_catalogue(), '$.plans[0].features[*].featureKey'), '["core.exercise_library","core.messaging"]'::jsonb, 'only saleable public mapped features appear in deterministic feature order');
select is(public.get_public_commercial_catalogue()#>>'{plans,0,features,1,marketingLabel}', 'Messages', 'public marketing label is returned');
select ok(not (public.get_public_commercial_catalogue()::text ~ 'INTERNAL NOTE|readiness_status|visibility|description|test_unmapped'), 'internal metadata and unmapped features are not exposed');
select ok(jsonb_path_exists(public.get_public_commercial_catalogue(), '$.plans[1].features[*] ? (@.featureKey == "support.priority")'), 'Growth includes mapped priority feature');
reset role;

-- Retire Launch to exercise uniqueness independently of its active-version index.
select lives_ok($$update commercial_plan_versions set status = 'retired', is_public = false, is_most_popular = false, retired_at = now() where plan_key = 'launch'$$, 'active plans can retire with required metadata');
select throws_ok($$select pg_temp.catalogue_plan('launch', 2, 'active', true, true, 10)$$, '23505', null, 'second active public popular plan rejected');
select throws_ok($$select pg_temp.catalogue_plan('launch', 2, 'active', true, false, 20)$$, '23505', null, 'duplicate public active sort order rejected');
select throws_ok($$update commercial_plan_versions set status = 'active', retired_at = null where plan_key = 'launch'$$, 'P0001', 'Retired commercial plan versions are immutable.', 'retired plan cannot reactivate');
select throws_ok($$delete from commercial_plan_feature_entitlements where plan_version_id = (select id from commercial_plan_versions where plan_key = 'launch')$$, 'P0001', null, 'retired mappings remain immutable');
select is(jsonb_path_query_array(public.get_public_commercial_catalogue(), '$.plans[*].planKey'), '["growth","scale"]'::jsonb, 'retired plans are hidden');
select lives_ok($$update commercial_plan_versions set status = 'active' where plan_key = 'custom'$$, 'draft can activate through protection trigger');
select is(jsonb_path_query_array(public.get_public_commercial_catalogue(), '$.plans[*].planKey'), '["growth","scale"]'::jsonb, 'active non-public custom stays hidden');

select * from finish();
rollback;
