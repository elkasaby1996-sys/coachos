-- Local-only. Entire fixture and every admission are rolled back.
begin;
-- Construct historical usage before measuring enforcement. DDL is transaction
-- scoped; run this independently from browser tests.
alter table workspaces disable trigger zz_capacity_admission;
alter table clients disable trigger zz_capacity_admission;
alter table workspace_members disable trigger zz_capacity_admission;
alter table workspace_member_invites disable trigger zz_capacity_admission;
alter table pt_packages disable trigger zz_capacity_admission;
insert into auth.users(id,email) select ('a0410000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'enforcement-plan-' || n || '@example.test' from generate_series(1,10001) n;
insert into pt_profiles(user_id,full_name) values('a0410000-0000-4000-8000-000000000001','Plan owner');
insert into commercial_plan_versions(id,plan_key,version,display_name,status,currency_code,monthly_price_minor,annual_price_minor,max_counted_clients,included_coach_seats,max_coach_seats,max_active_workspaces,max_published_packages,sort_order,retired_at)
values('d0410000-0000-4000-8000-000000000001','custom',4041,'Performance fixture','retired','USD',0,0,10000,1,10000,10000,null,4041,now());
select ensure_commercial_billing_account('a0410000-0000-4000-8000-000000000001','manual');
select ensure_commercial_billing_account('a0410000-0000-4000-8000-000000010001','manual');
insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
select id,'d0410000-0000-4000-8000-000000000001','custom','active','manual' from billing_accounts where owner_user_id in ('a0410000-0000-4000-8000-000000000001','a0410000-0000-4000-8000-000000010001');
insert into workspaces(id,name,owner_user_id) select ('b0410000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'Plan workspace ' || n,'a0410000-0000-4000-8000-000000000001' from generate_series(1,20) n;
insert into workspaces(id,name,owner_user_id) values('b0410000-0000-4000-8000-000000000021','Transfer target','a0410000-0000-4000-8000-000000010001');
insert into clients(user_id,workspace_id,lifecycle_state) select ('a0410000-0000-4000-8000-' || lpad((n+1)::text,12,'0'))::uuid,('b0410000-0000-4000-8000-' || lpad((1+n%20)::text,12,'0'))::uuid,'active' from generate_series(1,1000) n;
insert into workspace_members(workspace_id,user_id,role) select ('b0410000-0000-4000-8000-' || lpad(w::text,12,'0'))::uuid,('a0410000-0000-4000-8000-' || lpad((n+1001)::text,12,'0'))::uuid,'viewer' from generate_series(1,50) n cross join generate_series(1,20) w;
insert into workspace_members(workspace_id,user_id,role) values('b0410000-0000-4000-8000-000000000021','a0410000-0000-4000-8000-000000000001','admin');
insert into workspace_member_invites(workspace_id,email,role,token_hash,invited_by_user_id,expires_at) select ('b0410000-0000-4000-8000-' || lpad((1+n%20)::text,12,'0'))::uuid,'enforcement-plan-' || (n+2000) || '@example.test','coach','plan-' || n,'a0410000-0000-4000-8000-000000000001',now()+interval '1 day' from generate_series(1,200) n;
insert into pt_packages(pt_user_id,title,status,is_public) select 'a0410000-0000-4000-8000-000000000001','Plan package ' || n,'active',true from generate_series(1,1000) n;
insert into account_capacity_reservations(billing_account_id,dimension,quantity,idempotency_key,subject_type,subject_key,source,expires_at)
select a.id,'coach_seats',1,'email-plan-' || n,'email',account_capacity_email_key('unregistered-plan-' || n || '@example.test'),'query_plan',now()+interval '5 minutes' from billing_accounts a cross join generate_series(1,50) n where a.owner_user_id='a0410000-0000-4000-8000-000000000001';
alter table workspaces enable trigger zz_capacity_admission;
alter table clients enable trigger zz_capacity_admission;
alter table workspace_members enable trigger zz_capacity_admission;
alter table workspace_member_invites enable trigger zz_capacity_admission;
alter table pt_packages enable trigger zz_capacity_admission;
analyze clients; analyze workspaces; analyze workspace_members; analyze workspace_member_invites; analyze pt_packages; analyze account_capacity_reservations; analyze auth.users;
select set_config('request.jwt.claim.sub','a0410000-0000-4000-8000-000000000001',true);
\echo Workspace +1 admission including account lock and fresh contract
explain (analyze,buffers) select admit_account_capacity_subject('a0410000-0000-4000-8000-000000000001','active_workspaces','workspace:b0410000-0000-4000-8000-000000000022');
\echo Linked client +1 admission
explain (analyze,buffers) select admit_account_capacity_subject('a0410000-0000-4000-8000-000000000001','counted_clients','user:a0410000-0000-4000-8000-000000003001');
\echo Unlinked client fallback +1 admission
explain (analyze,buffers) select admit_account_capacity_subject('a0410000-0000-4000-8000-000000000001','counted_clients','client:c0410000-0000-4000-8000-000000000001');
\echo Pending team email +1 admission
explain (analyze,buffers) select admit_account_capacity_subject('a0410000-0000-4000-8000-000000000001','coach_seats',account_capacity_email_key('new-plan@example.test'));
\echo Pending to active zero-delta decision
explain (analyze,buffers) select admit_account_capacity_subject('a0410000-0000-4000-8000-000000000001','coach_seats','user:a0410000-0000-4000-8000-000000002001');
\echo Package +1 admission
explain (analyze,buffers) select admit_account_capacity_subject('a0410000-0000-4000-8000-000000000001','published_packages','package:f0410000-0000-4000-8000-000000000001');
\echo Email normalization lookup at 10001 users
explain (analyze,buffers) select id from auth.users where lower(btrim(email))='enforcement-plan-2001@example.test';
\echo Hash normalization lookup at 10001 users
explain (analyze,buffers) select id from auth.users where account_capacity_email_key(email)=account_capacity_email_key('unregistered-plan-1@example.test');
\echo Cross-owner transfer RPC including both locks and continuity
explain (analyze,buffers) select pt_transfer_client_relationship((select id from clients where user_id='a0410000-0000-4000-8000-000000000002'),'b0410000-0000-4000-8000-000000000021');
insert into pt_hub_leads(id,user_id,full_name,goal_summary,applicant_user_id) values('e0410000-0000-4000-8000-000000000001','a0410000-0000-4000-8000-000000000001','Plan lead','Fixture','a0410000-0000-4000-8000-000000003002');
\echo Two-dimension lead conversion RPC including reservations and consumption
explain (analyze,buffers) select pt_hub_approve_lead('e0410000-0000-4000-8000-000000000001',null,'Plan conversion',false);
rollback;
