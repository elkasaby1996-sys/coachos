begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
create temp table documented_feature_evidence(feature_key text primary key, document text not null);
insert into documented_feature_evidence values
('core.client_management','docs/commercial-readiness-audit.md#coreclient_management'),
('core.client_onboarding','docs/commercial-readiness-audit.md#coreclient_onboarding'),
('core.exercise_library','docs/commercial-readiness-audit.md#coreexercise_library'),
('core.nutrition_delivery','docs/commercial-readiness-audit.md#corenutrition_delivery'),
('core.messaging','docs/commercial-readiness-audit.md#coremessaging'),
('core.lifecycle_management','docs/commercial-readiness-audit.md#corelifecycle_management'),
('acquisition.public_profile','docs/commercial-readiness-audit.md#acquisitionpublic_profile'),
('acquisition.lead_pipeline','docs/commercial-readiness-audit.md#acquisitionlead_pipeline'),
('acquisition.lead_chat','docs/commercial-readiness-audit.md#acquisitionlead_chat'),
('acquisition.lead_source_reporting','docs/commercial-readiness-audit.md#acquisitionlead_source_reporting'),
('acquisition.conversion_reporting','docs/commercial-readiness-audit.md#acquisitionconversion_reporting'),
('acquisition.package_reporting','docs/commercial-readiness-audit.md#acquisitionpackage_reporting'),
('workspace.basic_identity','docs/commercial-readiness-audit.md#workspacebasic_identity'),
('workspace.multiple_workspaces','docs/commercial-readiness-audit.md#workspacemultiple_workspaces'),
('team.assigned_client_access','docs/commercial-readiness-audit.md#teamassigned_client_access'),
('team.standard_roles','docs/commercial-readiness-audit.md#teamstandard_roles'),
('analytics.basic_dashboard','docs/commercial-readiness-audit.md#analyticsbasic_dashboard');
select is((select count(*) from commercial_features),63::bigint,'exact 63 feature inventory');
select is((select count(distinct feature_key) from commercial_features),63::bigint,'unique keys');
select is((select count(*) from commercial_features f where readiness_status <> 'DRAFT' and not exists(select 1 from documented_feature_evidence e where e.feature_key=f.feature_key)),0::bigint,'every non-DRAFT state has an audit evidence contract');
select is((select count(*) from commercial_features where visibility='public' and (readiness_status<>'COMMERCIALLY_SALEABLE' or nullif(btrim(marketing_label),'') is null)),0::bigint,'public features are saleable and labelled');
select is(get_public_commercial_catalogue_v2()->'addons','[]'::jsonb,'unapproved add-ons hidden');
select is(get_public_commercial_catalogue_v2()->'trial','{"durationDays":14,"cardRequired":false,"experiencePlanKey":"growth","capacities":{"countedClients":10,"coachSeats":2,"activeWorkspaces":1,"publishedPackages":3}}'::jsonb,'exact canonical trial');
select is(jsonb_path_query_array(get_public_commercial_catalogue_v2(),'$.plans[*].planKey'),'["launch","growth","scale"]'::jsonb,'deterministic public order');
select is(jsonb_path_query_array(get_public_commercial_catalogue_v2(),'$.plans[0].features[*].featureKey'),'["core.client_management","core.lifecycle_management"]'::jsonb,'deterministic reviewed feature order');
select is(get_public_commercial_catalogue()->>'schemaVersion','1','v1 preserved');
select is((select jsonb_agg(p - 'features') from jsonb_array_elements(get_public_commercial_catalogue()->'plans') p),(select jsonb_agg(p - 'features') from jsonb_array_elements(get_public_commercial_catalogue_v2()->'plans') p),'v1/v2 plan contract parity');
select ok(not(get_public_commercial_catalogue_v2()::text ~ 'provider|billingAccount|description|readiness|evidence|custom'),'private metadata absent');
set local role anon;
select lives_ok($$select public.get_public_commercial_catalogue_v2()$$,'anonymous v2 execution');
select throws_ok($$select * from public.commercial_features$$,'42501',null,'no anonymous table access');
reset role;
set local role authenticated;
select lives_ok($$select public.get_public_commercial_catalogue_v2()$$,'authenticated v2 execution');
select throws_ok($$select * from public.commercial_trial_policy_versions$$,'42501',null,'no trial table access');
reset role;
update commercial_features set readiness_status='RETIRED' where feature_key='core.lifecycle_management';
select ok(not jsonb_path_exists(get_public_commercial_catalogue_v2(),'$.plans[*].features[*] ? (@.featureKey == "core.lifecycle_management")'),'retired feature excluded');
update commercial_features set marketing_label=' ' where feature_key='core.client_management';
select is(jsonb_path_query_array(get_public_commercial_catalogue_v2(),'$.plans[*].features[*]'),'[]'::jsonb,'blank label fails closed');
select * from finish();
rollback;
