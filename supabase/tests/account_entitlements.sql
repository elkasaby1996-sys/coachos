begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select count(*)::integer from commercial_trial_policy_versions where status = 'active'),1,'one active trial policy');
select results_eq($$select t.version,t.duration_days,t.recovery_days,t.requires_card,t.default_requested_plan_key,t.max_counted_clients,t.included_coach_seats,t.max_coach_seats,t.max_active_workspaces,t.max_published_packages,p.plan_key,p.version from commercial_trial_policy_versions t join commercial_plan_versions p on p.id=t.feature_plan_version_id where t.status='active'$$,
  $$values (1,14,7,false,'growth'::text,10,2,2,1,3,'growth'::text,1)$$,'exact immutable trial v1');
select throws_ok($$update commercial_trial_policy_versions set duration_days=15 where version=1$$,'P0001',null,'active policy contract immutable');
select throws_ok($$update commercial_trial_policy_versions set status='draft' where version=1$$,'P0001',null,'active cannot draft');
select throws_ok($$delete from commercial_trial_policy_versions where version=1$$,'P0001',null,'active policy cannot delete');

-- Distinct deterministic transaction-only identities; no existing identity edits.
insert into auth.users(id,email,raw_user_meta_data) values
 ('a0200000-0000-4000-8000-000000000001','price02-legacy@example.test','{"requested_plan":"launch"}'),
 ('a0200000-0000-4000-8000-000000000002','price02-new@example.test','{"requested_plan":"scale"}'),
 ('a0200000-0000-4000-8000-000000000003','price02-empty@example.test','{}'),
 ('a0200000-0000-4000-8000-000000000004','price02-transfer@example.test','{"requested_plan":"studio"}'),
 ('a0200000-0000-4000-8000-000000000005','price02-team@example.test','{}'),
 ('a0200000-0000-4000-8000-000000000006','price02-client@example.test','{}'),
 ('a0200000-0000-4000-8000-000000000007','price02-recovery@example.test','{}'),
 ('a0200000-0000-4000-8000-000000000008','price02-expired@example.test','{}');
insert into pt_profiles(user_id,workspace_id,full_name)
select id,null,'Commercial test coach' from auth.users where id::text like 'a0200000-%' and id::text not like '%000006';

-- Reproduce the pre-migration state, then exercise the actual migration helper.
alter table workspaces disable trigger workspace_account_trial;
insert into workspaces(id,name,owner_user_id) values
 ('b0200000-0000-4000-8000-000000000001','Legacy A','a0200000-0000-4000-8000-000000000001'),
 ('b0200000-0000-4000-8000-000000000002','Legacy B','a0200000-0000-4000-8000-000000000001');
select backfill_legacy_billing_accounts();
select backfill_legacy_billing_accounts();
alter table workspaces enable trigger workspace_account_trial;
select is((select count(*)::integer from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000001'),1,'multiple legacy workspaces get one account');
select results_eq($$select s.subscription_kind,s.status,p.plan_key,p.version,s.source,s.current_period_ends_at from account_subscriptions s join billing_accounts a on a.id=s.billing_account_id join commercial_plan_versions p on p.id=s.plan_version_id where a.owner_user_id='a0200000-0000-4000-8000-000000000001'$$,
 $$values ('complimentary'::text,'active'::text,'scale'::text,1,'legacy_beta_backfill'::text,null::timestamptz)$$,'legacy gets one Scale complimentary contract without renewal');
select is((select count(*)::integer from account_subscriptions s join billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0200000-0000-4000-8000-000000000001' and subscription_kind='trial'),0,'legacy owner does not get trial');
select is((select requested_plan_key from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000001'),'launch','legacy metadata intent preserved');
select is((select count(*)::integer from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000003'),0,'PT without workspace not backfilled');

select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(get_my_effective_account_entitlements()#>>'{subscription,effectiveStatus}','no_subscription','no subscription before first workspace');
select is(get_my_effective_account_entitlements()#>>'{subscription,accessMode}','onboarding','empty owner onboarding mode');
select is(get_my_effective_account_entitlements()#>'{limits,countedClients}','null'::jsonb,'no fabricated Growth limits');
select is(get_my_effective_account_entitlements()->'enabledFeatureKeys','[]'::jsonb,'empty owner no features');
select is(get_my_effective_account_entitlements()#>'{billingAccount,id}','null'::jsonb,'read does not create billing account');
select throws_ok($$select set_my_requested_paid_plan('studio')$$,'22023',null,'RPC rejects Studio');
select throws_ok($$select set_my_requested_paid_plan(null)$$,'22023',null,'RPC rejects null');
select lives_ok($$select set_my_requested_paid_plan('scale')$$,'owner persists intended Scale');
select lives_ok($$select set_my_requested_paid_plan('scale')$$,'repeat intended plan idempotent');
select is(get_my_effective_account_entitlements()#>>'{billingAccount,requestedPaidPlanKey}','scale','canonical intent response');
reset role;
select is((select count(*)::integer from account_subscription_events e join billing_accounts a on a.id=e.billing_account_id where a.owner_user_id='a0200000-0000-4000-8000-000000000003' and event_type='requested_plan.changed'),1,'one event per changed plan');

-- Real create_workspace contract: its insert starts the trial atomically.
select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok($$select create_workspace('Trial workspace')$$,'existing create_workspace RPC starts commercial access');
select is(get_my_effective_account_entitlements()#>>'{subscription,planKey}','growth','trial features Growth despite Scale intent');
select is(get_my_effective_account_entitlements()#>>'{billingAccount,requestedPaidPlanKey}','scale','requested paid plan separate');
select is(get_my_effective_account_entitlements()#>>'{subscription,effectiveStatus}','trialing','new trial response');
select is(get_my_effective_account_entitlements()#>>'{limits,countedClients}','10','trial capacity overrides Growth');
select is(get_my_effective_account_entitlements()#>>'{limits,maxCoachSeats}','2','trial maximum two seats');
select is(jsonb_array_length(get_my_effective_account_entitlements()->'targetFeatureKeys'),47,'all exact Growth mappings returned');
select is(get_my_effective_account_entitlements()->'enabledFeatureKeys','[]'::jsonb,'non-saleable features excluded');
reset role;
select ok((select trial_started_at=transaction_timestamp() and trial_ends_at=trial_started_at+interval '14 days' and trial_recovery_ends_at=trial_ends_at+interval '7 days' from account_subscriptions s join billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0200000-0000-4000-8000-000000000002'),'database transaction time with 14+7 day clock');
insert into workspaces(id,name,owner_user_id) values ('b0200000-0000-4000-8000-000000000003','Second trial workspace','a0200000-0000-4000-8000-000000000002');
select start_account_trial_for_owner('a0200000-0000-4000-8000-000000000002','first_workspace');
select start_account_trial_for_owner('a0200000-0000-4000-8000-000000000002','first_workspace');
select is((select count(*)::integer from account_subscriptions s join billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0200000-0000-4000-8000-000000000002'),1,'second workspace and repeated locked helper do not reset trial');
update workspaces set owner_user_id='a0200000-0000-4000-8000-000000000004' where id='b0200000-0000-4000-8000-000000000003';
select is((select requested_plan_key from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000004'),'growth','invalid trigger intent defaults Growth');
select is((select source from account_subscriptions s join billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0200000-0000-4000-8000-000000000004'),'workspace_transfer','ownership received starts trial');
update workspaces set owner_user_id='a0200000-0000-4000-8000-000000000002' where id='b0200000-0000-4000-8000-000000000003';
select is((select count(*)::integer from account_subscriptions s join billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0200000-0000-4000-8000-000000000002'),1,'ownership round trip preserves one trial');
select throws_ok($$update account_subscriptions set trial_started_at=trial_started_at+interval '1 day' where subscription_kind='trial'$$,'P0001',null,'trial clock cannot reset');
select throws_ok($$insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source) select billing_account_id,plan_version_id,'paid','active','manual' from account_subscriptions where subscription_kind='trial' limit 1$$,'23505',null,'one current subscription constraint');
select throws_ok($$insert into account_subscriptions(billing_account_id,plan_version_id,trial_policy_version_id,subscription_kind,status,source,trial_started_at,trial_ends_at,trial_recovery_ends_at,canceled_at) select billing_account_id,plan_version_id,trial_policy_version_id,'trial','canceled','manual',trial_started_at,trial_ends_at,trial_recovery_ends_at,now() from account_subscriptions where subscription_kind='trial' limit 1$$,'23505',null,'one lifetime trial even when terminal');
select throws_ok($$delete from account_subscriptions$$,'P0001',null,'subscription history cannot delete');
select throws_ok($$update account_subscriptions set status='canceled',canceled_at=trial_started_at-interval '1 day' where subscription_kind='trial'$$,'23514',null,'cancellation cannot predate trial start');
select results_eq($$select account_subscription_access_mode(s) from unnest(array['no_subscription','trialing','active','past_due','trial_recovery','grace','restricted','canceled','expired']) s$$,
 $$values ('onboarding'::text),('full'),('full'),('full'),('existing_delivery_only'),('existing_delivery_only'),('read_only'),('read_only'),('none')$$,'every effective status maps to the locked access mode');
select is(effective_account_subscription_status('trial','canceled',now()+interval '1 day',now()+interval '8 days'),'canceled','clock cannot resurrect canceled trial');

-- Past clocks are inserted as new immutable fixtures, never reset on real trials.
select ensure_commercial_billing_account('a0200000-0000-4000-8000-000000000007','manual');
select ensure_commercial_billing_account('a0200000-0000-4000-8000-000000000008','manual');
insert into account_subscriptions(billing_account_id,plan_version_id,trial_policy_version_id,subscription_kind,status,source,trial_started_at,trial_ends_at,trial_recovery_ends_at)
select a.id,t.feature_plan_version_id,t.id,'trial','trialing','manual',
 now()-make_interval(days=>case when a.owner_user_id='a0200000-0000-4000-8000-000000000007' then 14 else 21 end),
 now()-make_interval(days=>case when a.owner_user_id='a0200000-0000-4000-8000-000000000007' then 0 else 7 end),
 now()+make_interval(days=>case when a.owner_user_id='a0200000-0000-4000-8000-000000000007' then 7 else 0 end)
from billing_accounts a cross join commercial_trial_policy_versions t where t.version=1 and a.owner_user_id in ('a0200000-0000-4000-8000-000000000007','a0200000-0000-4000-8000-000000000008');
select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000007',true);
set local role authenticated;
select is(get_my_effective_account_entitlements()#>>'{subscription,storedStatus}','trialing','unreconciled storage');
select is(get_my_effective_account_entitlements()#>>'{subscription,effectiveStatus}','trial_recovery','exact trial end derives recovery before reconcile');
select is(get_my_effective_account_entitlements()#>>'{subscription,accessMode}','existing_delivery_only','recovery access mode');
reset role;
select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000008',true);
set local role authenticated;
select is(get_my_effective_account_entitlements()#>>'{subscription,effectiveStatus}','expired','exact recovery end derives expiry before reconcile');
select is(get_my_effective_account_entitlements()#>>'{subscription,accessMode}','none','expiry access mode');
select throws_ok($$select reconcile_account_subscription_state(null)$$,'42501',null,'authenticated cannot reconcile');
reset role;
select set_config('test.price02_expired_account',(select id::text from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000008'),true);
set local role service_role;
select is(reconcile_account_subscription_state(current_setting('test.price02_expired_account')::uuid)->>'transitions','2','service reconciles both due transitions');
select is(reconcile_account_subscription_state(current_setting('test.price02_expired_account')::uuid)->>'transitions','0','reconciliation idempotent');
reset role;
select is((select count(*)::integer from account_subscription_events where billing_account_id=current_setting('test.price02_expired_account')::uuid and event_type='subscription.status_changed'),2,'one event per actual transition');
select ok((select expired_at is not null and status_changed_at=now() from account_subscriptions where billing_account_id=current_setting('test.price02_expired_account')::uuid),'reconcile records status timestamps');

-- Feature overrides cannot promote readiness. Conflicting enable/disable is fail closed.
select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000002',true);
insert into account_feature_entitlement_overrides(billing_account_id,feature_key,effect,reason,source)
select a.id,f.feature_key,'enable','Commercial fixture','manual' from billing_accounts a cross join commercial_features f where a.owner_user_id='a0200000-0000-4000-8000-000000000002' and f.feature_key in ('core.workout_delivery','core.client_management');
select is(get_my_effective_account_entitlements()->'enabledFeatureKeys','[]'::jsonb,'enable cannot bypass DRAFT or IMPLEMENTED');
update commercial_features set readiness_status='COMMERCIALLY_SALEABLE' where feature_key in ('core.messaging','core.workout_delivery','support.migration_assistance');
select ok(get_my_effective_account_entitlements()->'enabledFeatureKeys' ? 'core.messaging','saleable mapping enabled');
insert into account_feature_entitlement_overrides(billing_account_id,feature_key,effect,reason,source)
select id,'core.workout_delivery','disable','Commercial fixture','manual' from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000002';
select ok(not(get_my_effective_account_entitlements()->'enabledFeatureKeys' ? 'core.workout_delivery'),'disable wins over mapping and enable');
insert into account_feature_entitlement_overrides(billing_account_id,feature_key,effect,reason,source,starts_at,expires_at)
select id,'core.messaging','disable','Expired fixture','manual',now()-interval '2 days',now() from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000002';
insert into account_feature_entitlement_overrides(billing_account_id,feature_key,effect,reason,source,starts_at)
select id,'core.messaging','disable','Future fixture','manual',now()+interval '1 day' from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000002';
select ok(get_my_effective_account_entitlements()->'enabledFeatureKeys' ? 'core.messaging','expired and future overrides ignored');
update account_feature_entitlement_overrides set revoked_at=now() where feature_key='core.workout_delivery' and effect='disable';
select ok(get_my_effective_account_entitlements()->'enabledFeatureKeys' ? 'core.workout_delivery','revoked disable ignored');
insert into account_feature_entitlement_overrides(billing_account_id,feature_key,effect,reason,source)
select id,'support.migration_assistance','enable','Commercial fixture','manual' from billing_accounts where owner_user_id='a0200000-0000-4000-8000-000000000002';
select ok(get_my_effective_account_entitlements()->'enabledFeatureKeys' ? 'support.migration_assistance','saleable unmapped enable applied');
select ok(not(get_my_effective_account_entitlements()->'targetFeatureKeys' ? 'support.migration_assistance'),'override does not rewrite plan mappings');

insert into workspace_members(workspace_id,user_id,role,status) values
 ('b0200000-0000-4000-8000-000000000003','a0200000-0000-4000-8000-000000000005','pt_coach','active');
insert into clients(workspace_id,user_id,full_name,status) values
 ('b0200000-0000-4000-8000-000000000003','a0200000-0000-4000-8000-000000000006','Commercial fixture client','active');
set local role authenticated;
select is(get_workspace_effective_entitlements('b0200000-0000-4000-8000-000000000003')->>'canManageBilling','true','workspace owner manages billing');
reset role;
select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is(get_workspace_effective_entitlements('b0200000-0000-4000-8000-000000000003')->>'canManageBilling','false','active coach safe workspace access');
select is(get_workspace_effective_entitlements('b0200000-0000-4000-8000-000000000003')->>'planKey','growth','member sees owner effective plan');
select ok(not(get_workspace_effective_entitlements('b0200000-0000-4000-8000-000000000003') ?| array['billingAccount','requestedPaidPlanKey','subscription','targetFeatureKeys','events','overrides']),'workspace payload omits private billing data');
select is(get_my_effective_account_entitlements()#>>'{billingAccount,ownerUserId}','a0200000-0000-4000-8000-000000000005','owner RPC only caller identity');
select is(get_my_effective_account_entitlements()#>>'{subscription,effectiveStatus}','no_subscription','member does not inherit owner billing account');
reset role;
update workspace_members set status='suspended' where user_id='a0200000-0000-4000-8000-000000000005';
set local role authenticated;
select throws_ok($$select get_workspace_effective_entitlements('b0200000-0000-4000-8000-000000000003')$$,'42501',null,'suspended member denied');
reset role;
update workspace_members set status='removed' where user_id='a0200000-0000-4000-8000-000000000005';
set local role authenticated;
select throws_ok($$select get_workspace_effective_entitlements('b0200000-0000-4000-8000-000000000003')$$,'42501',null,'removed member denied');
reset role;
select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000006',true);
set local role authenticated;
select throws_ok($$select get_workspace_effective_entitlements('b0200000-0000-4000-8000-000000000003')$$,'42501',null,'client member denied');
select throws_ok($$select get_my_effective_account_entitlements()$$,'42501',null,'client cannot read owner API');
select throws_ok($$select set_my_requested_paid_plan('growth')$$,'42501',null,'client cannot persist PT intent');
reset role;
select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select get_workspace_effective_entitlements('b0200000-0000-4000-8000-000000000003')$$,'42501',null,'unrelated PT denied');
reset role;
select set_config('request.jwt.claim.sub','a0200000-0000-4000-8000-000000000001',true);
select is(get_my_effective_account_entitlements()#>>'{subscription,accessLabel}','Complimentary beta access','legacy complimentary response');

-- Real role denials for every table and private entry point.
set local role anon;
select throws_ok($$select * from billing_accounts$$,'42501',null,'anon billing accounts denied');
select throws_ok($$select * from commercial_trial_policy_versions$$,'42501',null,'anon policy denied');
select throws_ok($$select * from account_subscriptions$$,'42501',null,'anon subscriptions denied');
select throws_ok($$select * from account_feature_entitlement_overrides$$,'42501',null,'anon overrides denied');
select throws_ok($$select * from account_subscription_events$$,'42501',null,'anon events denied');
select throws_ok($$select get_my_effective_account_entitlements()$$,'42501',null,'anon owner RPC denied');
select throws_ok($$select set_my_requested_paid_plan('growth')$$,'42501',null,'anon plan RPC denied');
select throws_ok($$select get_workspace_effective_entitlements(null)$$,'42501',null,'anon workspace RPC denied');
select throws_ok($$select reconcile_account_subscription_state(null)$$,'42501',null,'anon reconcile denied');
reset role;
set local role authenticated;
select throws_ok($$select * from billing_accounts$$,'42501',null,'authenticated accounts denied');
select throws_ok($$select * from commercial_trial_policy_versions$$,'42501',null,'authenticated policy denied');
select throws_ok($$select * from account_subscriptions$$,'42501',null,'authenticated subscriptions denied');
select throws_ok($$select * from account_feature_entitlement_overrides$$,'42501',null,'authenticated overrides denied');
select throws_ok($$select * from account_subscription_events$$,'42501',null,'authenticated events denied');
select throws_ok($$select resolve_account_entitlements(null)$$,'42501',null,'internal resolver denied');
select throws_ok($$select start_account_trial_for_owner(null,'first_workspace')$$,'42501',null,'trial creation helper denied');
select throws_ok($$select backfill_legacy_billing_accounts()$$,'42501',null,'backfill helper denied');
reset role;
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('billing_accounts'::regclass,'commercial_trial_policy_versions'::regclass,'account_subscriptions'::regclass,'account_feature_entitlement_overrides'::regclass,'account_subscription_events'::regclass)),'all commercial tables have RLS');
select ok((select count(*)=0 from pg_policies where tablename in ('billing_accounts','commercial_trial_policy_versions','account_subscriptions','account_feature_entitlement_overrides','account_subscription_events')),'no runtime table policies');
select throws_ok($$update account_subscription_events set metadata='{}'$$,'P0001',null,'events cannot update');
select throws_ok($$delete from account_subscription_events$$,'P0001',null,'events cannot delete');
select ok((select count(*)>0 from account_subscription_events where event_type='billing_account.created'),'account creation audited');
select ok((select count(*)>0 from account_subscription_events where event_type='subscription.trial_started' and metadata ? 'trialPolicyVersionId'),'trial commercial metadata audited');
select ok((select count(*)>0 from account_subscription_events where event_type='subscription.complimentary_access_created'),'complimentary creation audited');
select ok((select count(*)>0 from account_subscription_events where event_type='entitlement_override.created'),'override creation audited');
select ok((select count(*)>0 from account_subscription_events where event_type='entitlement_override.revoked'),'override revocation audited');
select ok(not exists(select 1 from account_subscription_events where metadata ?| array['reason','password','token','cookie','health','workout','nutrition','client']),'no sensitive fixture content in events');
select throws_ok($$update commercial_trial_policy_versions set status='retired',retired_at=null where version=1$$,'23514',null,'retirement timestamp required');
select lives_ok($$update commercial_trial_policy_versions set status='retired',retired_at=now() where version=1$$,'active can retire');
select throws_ok($$update commercial_trial_policy_versions set status='active',retired_at=null where version=1$$,'P0001',null,'retired cannot reactivate');
select throws_ok($$delete from commercial_trial_policy_versions where version=1$$,'P0001',null,'retired cannot delete');
select * from finish();
rollback;
