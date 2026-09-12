begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at)
select ('a0400000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'price04-' || n || '@example.test',now() from generate_series(1,30) n;
insert into pt_profiles(user_id,full_name) values
 ('a0400000-0000-4000-8000-000000000001','Capacity owner'),
 ('a0400000-0000-4000-8000-000000000002','Other owner');
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select create_workspace('First workspace')$$,'first workspace bootstraps trial and capacity atomically');
reset role;
create function pg_temp.owner_id() returns uuid language sql as $$select 'a0400000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.workspace_id() returns uuid language sql as $$select id from public.workspaces where owner_user_id=pg_temp.owner_id()$$;
create function pg_temp.capacity(key text) returns jsonb language sql as $$select d from public.billing_accounts a cross join lateral jsonb_array_elements(public.resolve_account_capacity(a.owner_user_id,a.id)->'dimensions') d where a.owner_user_id=pg_temp.owner_id() and d->>'key'=key$$;
select is((select count(*)::int from account_subscriptions s join billing_accounts a on a.id=s.billing_account_id where a.owner_user_id=pg_temp.owner_id()),1,'one lifetime trial');
select is((select count(*)::int from account_capacity_reservations where status='active' and billing_account_id in(select id from billing_accounts where owner_user_id::text like 'a0400000-%')),0,'first workspace consumed its hold');
select is((select count(*)::int from account_capacity_reservations where status='consumed' and billing_account_id in(select id from billing_accounts where owner_user_id::text like 'a0400000-%')),1,'one workspace admission recorded');
select throws_ok($$insert into workspaces(name,owner_user_id) values('Second',pg_temp.owner_id())$$,'P0001','Account capacity admission failed.','second workspace denied at trial ceiling');
select is(pg_temp.capacity('active_workspaces')->>'actual','1','denied workspace did not persist');
select lives_ok($$update workspaces set owner_user_id=owner_user_id where id=pg_temp.workspace_id()$$,'same-owner workspace update is neutral');

insert into clients(user_id,workspace_id,lifecycle_state)
select ('a0400000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,pg_temp.workspace_id(),'active' from generate_series(3,12) n;
select is(pg_temp.capacity('counted_clients')->>'committed','10','ten committed clients, no residual holds');
select throws_ok($$insert into clients(user_id,workspace_id) values('a0400000-0000-4000-8000-000000000013',pg_temp.workspace_id())$$,'P0001','Account capacity admission failed.','eleventh counted identity denied');
select lives_ok($$update clients set lifecycle_state='paused',paused_reason='Fixture pause' where user_id='a0400000-0000-4000-8000-000000000003'$$,'active to paused neutral');
select lives_ok($$update clients set lifecycle_state='active' where user_id='a0400000-0000-4000-8000-000000000003'$$,'paused to active neutral');
select lives_ok($$update clients set manual_risk_flag=true where user_id='a0400000-0000-4000-8000-000000000003'$$,'manual risk neutral');
select lives_ok($$update clients set lifecycle_state='completed' where user_id='a0400000-0000-4000-8000-000000000003'$$,'completion reduces capacity');
insert into clients(user_id,workspace_id) values('a0400000-0000-4000-8000-000000000013',pg_temp.workspace_id());
select throws_ok($$update clients set lifecycle_state='active' where user_id='a0400000-0000-4000-8000-000000000003'$$,'P0001','Account capacity admission failed.','completed to active positive denied');

insert into invites(workspace_id,code,token,max_uses,uses,created_by_user_id,expires_at)
values(pg_temp.workspace_id(),'PRICE04','price04-token',100,0,pg_temp.owner_id(),now()+interval '1 day');
select is(pg_temp.capacity('counted_clients')->>'committed','10','generic link reserves zero clients');
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000014',true);
set local role authenticated;
select throws_ok($$select accept_invite(p_token=>'price04-token')$$,'P0001','Account capacity admission failed.','new invite acceptance denied at capacity');
select throws_ok($$insert into clients(workspace_id,user_id) values(pg_temp.workspace_id(),auth.uid())$$,'42501',null,'direct client insert closed');
reset role;
select is((select uses from invites where code='PRICE04'),0,'denial leaves invite unused');
select is((select count(*)::int from clients where user_id='a0400000-0000-4000-8000-000000000014'),0,'denial leaves no client');
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000004',true);
set local role authenticated;
select lives_ok($$select accept_invite(p_code=>'PRICE04',p_display_name=>'Existing')$$,'existing counted identity accepts at exact limit');
reset role;

select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select create_my_pt_package('{"title":"One","status":"active","is_public":true}')$$,'first publication admitted');
select lives_ok($$select create_my_pt_package('{"title":"Two","status":"active","is_public":true}')$$,'second publication admitted');
select lives_ok($$select create_my_pt_package('{"title":"Three","status":"active","is_public":true}')$$,'final publication admitted');
select lives_ok($$select create_my_pt_package('{"title":"Draft","status":"draft","is_public":false}')$$,'draft creation at publication limit');
select throws_ok($$select create_my_pt_package('{"title":"Four","status":"active","is_public":true}')$$,'P0001','Account capacity admission failed.','publication denied at limit');
select lives_ok($$select update_my_pt_package((select id from pt_packages where title='One'),'{"subtitle":"Edit"}')$$,'published edit neutral');
select lives_ok($$select update_my_pt_package((select id from pt_packages where title='One'),'{"is_public":false}')$$,'unpublish reduces');
select lives_ok($$select update_my_pt_package((select id from pt_packages where title='Draft'),'{"status":"active","is_public":true}')$$,'released publication slot reusable');
select throws_ok($$select update_my_pt_package((select id from pt_packages where title='One'),'{"is_public":true}')$$,'P0001','Account capacity admission failed.','republish requires admission');
select throws_ok($$insert into pt_packages(pt_user_id,title) values(auth.uid(),'Bypass')$$,'42501',null,'direct package insert denied');
select throws_ok($$update pt_packages set is_public=true where title='One'$$,'42501',null,'direct package update denied');
reset role;

insert into workspace_member_invites(workspace_id,email,role,token_hash,invited_by_user_id,expires_at)
values(pg_temp.workspace_id(),'price04-15@example.test','viewer',hash_workspace_team_invite_token('price04-team'),pg_temp.owner_id(),now()+interval '1 day');
select is(pg_temp.capacity('coach_seats')->>'committed','2','pending invite uses final seat');
select throws_ok($$insert into workspace_member_invites(workspace_id,email,role,token_hash,invited_by_user_id,expires_at) values(pg_temp.workspace_id(),'price04-16@example.test','viewer','other-hash',pg_temp.owner_id(),now()+interval '1 day')$$,'P0001','Account capacity admission failed.','new pending identity denied');
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000015',true);
set local role authenticated;
select lives_ok($$select accept_workspace_team_invite('price04-team')$$,'pending to active acceptance at exact limit');
reset role;
select is(pg_temp.capacity('coach_seats')->>'committed','2','acceptance has no extra seat');
select is(pg_temp.capacity('coach_seats')->>'pending','0','pending commitment removed after acceptance');

-- Every unsuccessful attempt rolled back its hold and events; all successes consumed.
select is((select count(*)::int from account_capacity_reservations where status='active' and billing_account_id in(select id from billing_accounts where owner_user_id::text like 'a0400000-%')),0,'no successful synchronous operation leaves active reservations');
select is((select count(*)::int from account_capacity_events where event_type='capacity.reservation_denied' and billing_account_id in(select id from billing_accounts where owner_user_id::text like 'a0400000-%')),0,'exception denials are not durable database events');
-- A separate immutable test contract makes both lead dimensions independently
-- tight, without changing any shipped plan or trial policy.
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000001',true);
update clients set relationship_status='removed' where user_id='a0400000-0000-4000-8000-000000000006';
set local role authenticated;
select lives_ok($$select reactivate_removed_client_relationship((select id from clients where user_id='a0400000-0000-4000-8000-000000000006'))$$,'authorized removed-client reactivation admits the released slot');
select throws_ok($$select pt_update_client_lifecycle((select id from clients where user_id='a0400000-0000-4000-8000-000000000003'),'active')$$,'P0001','Account capacity admission failed.','lifecycle RPC enforces completed reactivation');
select throws_ok($$set local session_replication_role=replica$$,'42501',null,'runtime user cannot bypass guards with replication setting');
reset role;
select is(pg_temp.capacity('counted_clients')->>'committed','10','reactivation restores exactly one counted identity');

-- Failed first workspace must not leave trial, account, events, or workspace.
insert into pt_profiles(user_id,full_name) values('a0400000-0000-4000-8000-000000000022','Rollback owner');
create function pg_temp.reject_workspace_fixture() returns trigger language plpgsql as $$begin
 if new.name='Injected workspace failure' then raise exception 'Injected workspace failure'; end if; return new; end;$$;
create trigger zzz_workspace_fixture_failure after insert on workspaces for each row execute function pg_temp.reject_workspace_fixture();
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000022',true);
set local role authenticated;
select throws_ok($$select create_workspace('Injected workspace failure')$$,'P0001','Injected workspace failure','first-workspace failure rolls back trial and admission');
select lives_ok($$select set_my_requested_paid_plan('growth')$$,'onboarding owner may persist intent');
select throws_ok($$select create_my_pt_package('{"title":"Onboarding publication","status":"active","is_public":true}')$$,'42501','ACCOUNT_ACCESS_ONBOARDING_ONLY','onboarding cannot publish before first workspace');
select throws_ok($$select create_my_pt_package('{"title":"Onboarding draft"}')$$,'42501','ACCOUNT_ACCESS_ONBOARDING_ONLY','onboarding denies business drafts under PR-PRICE-08');
reset role;
select is((select count(*)::int from workspaces where owner_user_id='a0400000-0000-4000-8000-000000000022'),0,'failed bootstrap left no workspace');
select is((select count(*)::int from account_subscriptions s join billing_accounts a on a.id=s.billing_account_id where a.owner_user_id='a0400000-0000-4000-8000-000000000022'),0,'failed bootstrap left no trial');
select is((select count(*)::int from account_capacity_reservations r join billing_accounts a on a.id=r.billing_account_id where a.owner_user_id='a0400000-0000-4000-8000-000000000022'),0,'failed bootstrap left no reservation');
drop trigger zzz_workspace_fixture_failure on workspaces;

insert into commercial_plan_versions(id,plan_key,version,display_name,status,currency_code,monthly_price_minor,annual_price_minor,max_counted_clients,included_coach_seats,max_coach_seats,max_active_workspaces,max_published_packages,sort_order,retired_at)
values('d0400000-0000-4000-8000-000000000001','custom',404,'Admission fixture','retired','USD',0,0,1,1,5,2,null,404,now());
select ensure_commercial_billing_account('a0400000-0000-4000-8000-000000000002','manual');
insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
select id,'d0400000-0000-4000-8000-000000000001','custom','active','manual' from billing_accounts where owner_user_id='a0400000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000002',true);
insert into pt_hub_leads(id,user_id,full_name,goal_summary,applicant_user_id) values
 ('e0400000-0000-4000-8000-000000000001','a0400000-0000-4000-8000-000000000002','First','Fixture','a0400000-0000-4000-8000-000000000020'),
 ('e0400000-0000-4000-8000-000000000002','a0400000-0000-4000-8000-000000000002','Second','Fixture','a0400000-0000-4000-8000-000000000021');
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok($$select pt_hub_approve_lead('e0400000-0000-4000-8000-000000000001',null,'First conversion',false)$$,'lead conversion reserves workspace and client');
select throws_ok($$select pt_hub_approve_lead('e0400000-0000-4000-8000-000000000002',null,'Must roll back',false)$$,'P0001','Account capacity admission failed.','second requirement denial rolls back first reservation');
reset role;
select is((select count(*)::int from workspaces where owner_user_id='a0400000-0000-4000-8000-000000000002'),1,'client denial created no partial workspace');
select is((select status from pt_hub_leads where id='e0400000-0000-4000-8000-000000000002'),'new','capacity denial preserves prior lead state');
select is((select count(*)::int from account_capacity_reservations r join billing_accounts a on a.id=r.billing_account_id where a.owner_user_id='a0400000-0000-4000-8000-000000000002'),2,'failed multi-dimension request persisted no reservations');
set local role authenticated;
select lives_ok($$select pt_hub_approve_lead('e0400000-0000-4000-8000-000000000001',null,'Same identity workspace',true)$$,'existing counted lead identity needs only workspace admission');
select lives_ok($$select pt_hub_approve_lead('e0400000-0000-4000-8000-000000000001')$$,'idempotent conversion retry preserves domain result');
reset role;
select is((select count(*)::int from account_capacity_reservations r join billing_accounts a on a.id=r.billing_account_id where a.owner_user_id='a0400000-0000-4000-8000-000000000002'),3,'neutral identity and retry created no extra hold');
select lives_ok($$select pt_transfer_client_relationship(
 (select converted_client_id from pt_hub_leads where id='e0400000-0000-4000-8000-000000000001'),
 (select id from workspaces where name='First conversion' and owner_user_id='a0400000-0000-4000-8000-000000000002'))$$,'same owner transfer at capacity is neutral');
insert into workspace_members(workspace_id,user_id,role,status)
select converted_workspace_id,pg_temp.owner_id(),'admin','active' from pt_hub_leads where id='e0400000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select pt_transfer_client_relationship(
 (select id from clients where user_id='a0400000-0000-4000-8000-000000000004' and workspace_id=pg_temp.workspace_id()),
 (select id from workspaces where name='Same identity workspace' and owner_user_id='a0400000-0000-4000-8000-000000000002'))$$,'P0001','Account capacity admission failed.','cross-owner transfer target admission denied');
reset role;
select is((select relationship_status from clients where user_id='a0400000-0000-4000-8000-000000000004' and workspace_id=pg_temp.workspace_id()),'active','denied transfer preserves source relationship');
select throws_ok($$update workspaces set owner_user_id=pg_temp.owner_id() where name='Same identity workspace' and owner_user_id='a0400000-0000-4000-8000-000000000002'$$,'P0001','Account capacity admission failed.','owner transfer denies target at limit');
select is((select owner_user_id::text from workspaces where name='Same identity workspace' and owner_user_id='a0400000-0000-4000-8000-000000000002'),'a0400000-0000-4000-8000-000000000002','failed owner transfer preserves ownership');

-- Domain failure after a hold is created must undo both the hold and its events.
select lives_ok($$update clients set lifecycle_state='completed' where user_id='a0400000-0000-4000-8000-000000000005'$$,'release one client slot for rollback probe');
select throws_ok($$insert into clients(user_id,workspace_id,lifecycle_state) values('a0400000-0000-4000-8000-000000000030',pg_temp.workspace_id(),'invalid-lifecycle')$$,'23514',null,'domain constraint failure rolls back admission');
select is((select count(*)::int from clients where user_id='a0400000-0000-4000-8000-000000000030'),0,'constraint failure left no domain row');
create or replace function public.consume_account_capacity_reservation(p_reservation_id uuid,p_source text,p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if exists(select 1 from account_capacity_reservations where id=p_reservation_id and subject_key='user:a0400000-0000-4000-8000-000000000030') then
    raise exception 'Injected consumption failure';
  end if;
  return public.transition_account_capacity_reservation(p_reservation_id,'consumed',p_source,p_metadata);
end; $$;
select throws_ok($$insert into clients(user_id,workspace_id) values('a0400000-0000-4000-8000-000000000030',pg_temp.workspace_id())$$,'P0001','Injected consumption failure','consume failure rolls back domain mutation');
select is((select count(*)::int from clients where user_id='a0400000-0000-4000-8000-000000000030'),0,'consume failure left no client');
select is((select count(*)::int from account_capacity_reservations where subject_key='user:a0400000-0000-4000-8000-000000000030'),0,'neither failure persisted a reservation');

-- All non-full modes deny growth while retaining zero/negative mutations.
update account_subscriptions set status='restricted',restricted_at=now(),status_changed_at=now()
where billing_account_id=(select id from billing_accounts where owner_user_id='a0400000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','a0400000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select create_my_pt_package('{"title":"Restricted publish","status":"active","is_public":true}')$$,'42501','ACCOUNT_ACCESS_READ_ONLY','read_only denies positive even unlimited publication');
select throws_ok($$select create_my_pt_package('{"title":"Restricted draft"}')$$,'42501','ACCOUNT_ACCESS_READ_ONLY','read_only denies business drafts under PR-PRICE-08');
reset role;
update account_subscriptions set status='grace',status_changed_at=now()
where billing_account_id=(select id from billing_accounts where owner_user_id='a0400000-0000-4000-8000-000000000002');
select throws_ok($$select create_my_pt_package('{"title":"Grace publish","status":"active","is_public":true}')$$,'P0001','Account capacity admission failed.','existing_delivery_only denies positive');
update account_subscriptions set status='expired',expired_at=now(),status_changed_at=now()
where billing_account_id=(select id from billing_accounts where owner_user_id='a0400000-0000-4000-8000-000000000002');
select throws_ok($$select create_my_pt_package('{"title":"Expired publish","status":"active","is_public":true}')$$,'P0001','Account capacity admission failed.','none denies positive');
select lives_ok($$update clients set relationship_status='removed' where user_id='a0400000-0000-4000-8000-000000000020'$$,'none permits reduction');
select is((select count(*)::int from account_capacity_reservations where status='active' and billing_account_id in(select id from billing_accounts where owner_user_id::text like 'a0400000-%')),0,'all paths leave no active synchronous reservation');
select * from finish();
rollback;
