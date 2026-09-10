begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
-- PR-PRICE-03 historical usage fixtures, transaction-local DDL, rolled back below.
alter table workspaces disable trigger zz_capacity_admission;
alter table clients disable trigger zz_capacity_admission;
alter table workspace_members disable trigger zz_capacity_admission;
alter table workspace_member_invites disable trigger zz_capacity_admission;
alter table pt_packages disable trigger zz_capacity_admission;

insert into auth.users(id,email) select ('a0300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'capacity-' || n || '@example.test' from generate_series(1,20) n;
insert into pt_profiles(user_id,workspace_id,full_name) select id,null,'Capacity coach' from auth.users where id in ('a0300000-0000-4000-8000-000000000001','a0300000-0000-4000-8000-000000000002','a0300000-0000-4000-8000-000000000003');
insert into workspaces(id,name,owner_user_id) values
 ('b0300000-0000-4000-8000-000000000001','Capacity A','a0300000-0000-4000-8000-000000000001'),
 ('b0300000-0000-4000-8000-000000000002','Capacity B','a0300000-0000-4000-8000-000000000001'),
 ('b0300000-0000-4000-8000-000000000003','Capacity Other','a0300000-0000-4000-8000-000000000002');
create function pg_temp.capacity(d text) returns jsonb language sql stable as $$ select x from jsonb_array_elements(public.resolve_account_capacity('a0300000-0000-4000-8000-000000000001',(select id from public.billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000001'))->'dimensions') x where x->>'key'=d $$;
create function pg_temp.reserve(k text,dimension text default 'counted_clients',quantity integer default 1) returns jsonb language sql volatile as $$ select public.reserve_account_capacity((select id from public.billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000001'),dimension,quantity,k,'operation','operation:' || extensions.uuid_generate_v5('a0300000-0000-4000-8000-000000000001',k),null,'pgtap',transaction_timestamp()+interval '2 minutes') $$;
select is(pg_temp.capacity('coach_seats')->>'actual','1','owner counts once including owner memberships');
select is(pg_temp.capacity('active_workspaces')->>'actual','2','all current owned rows count, other owner excluded');
select is(pg_temp.capacity('counted_clients')->>'limit','10','trial uses policy client capacity');
select is(pg_temp.capacity('coach_seats')->>'included','2','trial included seats');
select is(pg_temp.capacity('coach_seats')->>'limit','2','trial maximum seats');
insert into clients(id,user_id,workspace_id,lifecycle_state,paused_reason,churn_reason) values ('c0300000-0000-4000-8000-000000000004','a0300000-0000-4000-8000-000000000004','b0300000-0000-4000-8000-000000000001','invited','test pause','test churn');
select is(pg_temp.capacity('counted_clients')->>'actual','1','invited inclusion predicate');
insert into clients(id,user_id,workspace_id,lifecycle_state,paused_reason,churn_reason) values ('c0300000-0000-4000-8000-000000000005','a0300000-0000-4000-8000-000000000005','b0300000-0000-4000-8000-000000000001','onboarding','test pause','test churn');
select is(pg_temp.capacity('counted_clients')->>'actual','2','onboarding inclusion predicate');
insert into clients(id,user_id,workspace_id,lifecycle_state,paused_reason,churn_reason) values ('c0300000-0000-4000-8000-000000000006','a0300000-0000-4000-8000-000000000006','b0300000-0000-4000-8000-000000000001','active','test pause','test churn');
select is(pg_temp.capacity('counted_clients')->>'actual','3','active inclusion predicate');
insert into clients(id,user_id,workspace_id,lifecycle_state,paused_reason,churn_reason) values ('c0300000-0000-4000-8000-000000000007','a0300000-0000-4000-8000-000000000007','b0300000-0000-4000-8000-000000000001','paused','test pause','test churn');
select is(pg_temp.capacity('counted_clients')->>'actual','4','paused inclusion predicate');
insert into clients(id,user_id,workspace_id,lifecycle_state,paused_reason,churn_reason) values ('c0300000-0000-4000-8000-000000000008','a0300000-0000-4000-8000-000000000008','b0300000-0000-4000-8000-000000000001','completed','test pause','test churn');
select is(pg_temp.capacity('counted_clients')->>'actual','4','completed inclusion predicate');
insert into clients(id,user_id,workspace_id,lifecycle_state,paused_reason,churn_reason) values ('c0300000-0000-4000-8000-000000000009','a0300000-0000-4000-8000-000000000009','b0300000-0000-4000-8000-000000000001','churned','test pause','test churn');
select is(pg_temp.capacity('counted_clients')->>'actual','4','churned inclusion predicate');

update clients set manual_risk_flag=true where id='c0300000-0000-4000-8000-000000000006';
select is(pg_temp.capacity('counted_clients')->>'actual','4','risk flags have no capacity effect');
insert into clients(user_id,workspace_id,lifecycle_state,paused_reason,churn_reason) values ('a0300000-0000-4000-8000-000000000006','b0300000-0000-4000-8000-000000000002','active','test pause','test churn');
select is(pg_temp.capacity('counted_clients')->>'actual','4','same linked user across owned workspaces deduplicated');
insert into clients(user_id,workspace_id,lifecycle_state,relationship_status) values
 ('a0300000-0000-4000-8000-000000000010','b0300000-0000-4000-8000-000000000001','active','removed'),
 ('a0300000-0000-4000-8000-000000000011','b0300000-0000-4000-8000-000000000001','active','transferred_out'),
 ('a0300000-0000-4000-8000-000000000012','b0300000-0000-4000-8000-000000000003','active','active');
select is(pg_temp.capacity('counted_clients')->>'actual','4','removed transferred-out and other owner excluded');
-- Corruption/future-compatibility fixtures only: production constraints remain unchanged.
alter table clients alter column user_id drop not null;
alter table clients alter column lifecycle_state drop not null;
alter table clients drop constraint clients_lifecycle_state_check;
alter table clients disable trigger clients_normalize_lifecycle_transition_trigger;
insert into clients(workspace_id,email,display_name,lifecycle_state) values
 ('b0300000-0000-4000-8000-000000000001','same@example.test','Same','active'),
 ('b0300000-0000-4000-8000-000000000002','same@example.test','Same','active'),
 ('b0300000-0000-4000-8000-000000000001',null,'Unknown','future_state'),
 ('b0300000-0000-4000-8000-000000000001',null,'Null',null);
select is(pg_temp.capacity('counted_clients')->>'actual','8','unlinked rows stay distinct and unknown/null lifecycle counts');
select is(pg_temp.capacity('counted_clients')->>'dataQualityIssue','true','unknown/null lifecycle is diagnosed');
insert into invites(workspace_id,code,max_uses,uses,created_by_user_id,expires_at) values
 ('b0300000-0000-4000-8000-000000000001','CAP03001',1,0,'a0300000-0000-4000-8000-000000000001',now()+interval '1 day'),
 ('b0300000-0000-4000-8000-000000000001','CAP03002',100,0,'a0300000-0000-4000-8000-000000000001',now()+interval '1 day');
select is(pg_temp.capacity('counted_clients')->>'pending','0','unidentifiable single-use and reusable links excluded');
insert into workspace_members(workspace_id,user_id,role,status) values
 ('b0300000-0000-4000-8000-000000000001','a0300000-0000-4000-8000-000000000013','viewer','active'),
 ('b0300000-0000-4000-8000-000000000002','a0300000-0000-4000-8000-000000000013','admin','active'),
 ('b0300000-0000-4000-8000-000000000001','a0300000-0000-4000-8000-000000000014','coach','suspended'),
 ('b0300000-0000-4000-8000-000000000001','a0300000-0000-4000-8000-000000000015','assistant_coach','removed');
select is(pg_temp.capacity('coach_seats')->>'actual','2','active human roles deduplicate; suspended/removed excluded');
insert into workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at) values
 ('b0300000-0000-4000-8000-000000000001','pending@example.test','coach','cap-pending1','pending','a0300000-0000-4000-8000-000000000001',now()+interval '1 day'),
 ('b0300000-0000-4000-8000-000000000002','pending@example.test','viewer','cap-pending2','pending','a0300000-0000-4000-8000-000000000001',now()+interval '1 day'),
 ('b0300000-0000-4000-8000-000000000001','capacity-13@example.test','coach','cap-active','pending','a0300000-0000-4000-8000-000000000001',now()+interval '1 day'),
 ('b0300000-0000-4000-8000-000000000001','expired@example.test','coach','cap-expired','pending','a0300000-0000-4000-8000-000000000001',now()),
 ('b0300000-0000-4000-8000-000000000001','revoked@example.test','coach','cap-revoked','revoked','a0300000-0000-4000-8000-000000000001',now()+interval '1 day');
select is(pg_temp.capacity('coach_seats')->>'pending','1','pending emails deduplicate; active, expired and revoked excluded');
select is(pg_temp.capacity('coach_seats')->>'aboveIncludedBy','1','included metadata independent of ceiling');
update workspace_member_invites set status='accepted',accepted_at=now(),accepted_by_user_id='a0300000-0000-4000-8000-000000000016' where token_hash in ('cap-pending1','cap-pending2');
select is(pg_temp.capacity('coach_seats')->>'pending','0','accepted invitations excluded');
insert into pt_packages(pt_user_id,title,status,is_public) values
 ('a0300000-0000-4000-8000-000000000001','Public','active',true),
 ('a0300000-0000-4000-8000-000000000001','Private','active',false),
 ('a0300000-0000-4000-8000-000000000001','Draft','draft',true),
 ('a0300000-0000-4000-8000-000000000001','Archived','archived',false),
 ('a0300000-0000-4000-8000-000000000002','Other','active',true);
select is(pg_temp.capacity('published_packages')->>'actual','1','only owner active/public canonical packages count');
select is(pg_temp.capacity('published_packages')->>'limit','3','trial policy package ceiling');
insert into pt_packages(pt_user_id,title,status,is_public) select 'a0300000-0000-4000-8000-000000000001','Finite overage ' || n,'active',true from generate_series(1,3) n;
select is(pg_temp.capacity('published_packages')->>'state','over_limit','finite package overage does not unpublish');
select is(pg_temp.capacity('published_packages')->>'actual','4','all published package records retained');
select is(pg_temp.reserve('slot-one')->>'granted','true','active reservation granted');
select is(pg_temp.capacity('counted_clients')->>'reserved','1','active reservation contributes');
select is(pg_temp.reserve('slot-one')->>'reservationId',pg_temp.reserve('slot-one')->>'reservationId','lifetime reserve idempotency');
select is((select count(*)::integer from account_capacity_events where event_type='capacity.reservation_created'),1,'one created event for repeated reserve');
select is(pg_temp.reserve('slot-two')->>'granted','true','final slot granted');
select is(pg_temp.reserve('denied')->>'granted','false','capacity primitive denies overage');
select is(pg_temp.reserve('denied')->>'granted','false','denied attempt idempotent');
select is((select count(*)::integer from account_capacity_events where event_type='capacity.reservation_denied'),1,'one denied event');
select is((select count(*)::integer from account_capacity_reservations where idempotency_key='denied'),0,'denial inserts no active reservation');
select is(consume_account_capacity_reservation((pg_temp.reserve('slot-one')->>'reservationId')::uuid,'pgtap')->>'transitioned','true','consume active reservation');
select is(consume_account_capacity_reservation((pg_temp.reserve('slot-one')->>'reservationId')::uuid,'pgtap')->>'transitioned','false','consume idempotent');
select throws_ok($$select release_account_capacity_reservation((pg_temp.reserve('slot-one')->>'reservationId')::uuid,'pgtap')$$,'22023',null,'terminal conflict rejected');
select is(release_account_capacity_reservation((pg_temp.reserve('slot-two')->>'reservationId')::uuid,'pgtap')->>'transitioned','true','release active reservation');
select is(release_account_capacity_reservation((pg_temp.reserve('slot-two')->>'reservationId')::uuid,'pgtap')->>'transitioned','false','release idempotent');
select throws_ok($$update account_capacity_reservations set status='active',consumed_at=null where status='consumed'$$,'P0001',null,'terminal cannot reactivate');
select throws_ok($$delete from account_capacity_reservations$$,'P0001',null,'no normal deletion');
select throws_ok($$update account_capacity_events set quantity=2$$,'P0001',null,'events append-only');
insert into account_capacity_reservations(billing_account_id,dimension,quantity,idempotency_key,subject_type,subject_key,source,created_at,expires_at)
 select id,'counted_clients',1,'past','operation','operation:a0300000-0000-4000-8000-000000000020','pgtap',now()-interval '2 minutes',now() from billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000001';
select is(pg_temp.capacity('counted_clients')->>'reserved','0','expired-by-time active rows excluded before reconciliation');
select throws_ok($$select consume_account_capacity_reservation((select id from account_capacity_reservations where idempotency_key='past'),'pgtap')$$,'22023',null,'expired-by-time hold cannot be consumed');
select is(reconcile_account_capacity_reservations()->>'transitions','1','reconcile expires active stored row');
select is(reconcile_account_capacity_reservations()->>'transitions','0','reconcile idempotent');
select is((select count(*)::integer from account_capacity_events where event_type='capacity.reservation_expired'),1,'one expiry event');
select is((select count(*)::integer from account_capacity_events where event_type='capacity.reservation_consumed'),1,'one consume event');
select is((select count(*)::integer from account_capacity_events where event_type='capacity.reservation_released'),1,'one release event');
-- Subject supersession: one identity represented in domain data cannot reserve another unit.
select reserve_account_capacity((select id from billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000001'),'counted_clients',1,'linked','user','user:a0300000-0000-4000-8000-000000000006',null,'pgtap',now()+interval '1 minute');
select is(pg_temp.capacity('counted_clients')->>'reserved','0','actual identity supersedes reservation');
insert into account_capacity_reservations(billing_account_id,dimension,quantity,idempotency_key,subject_type,subject_key,source,expires_at)
 select id,'coach_seats',1,'pending-seat','email',account_capacity_email_key('incoming@example.test'),'pgtap',now()+interval '1 minute' from billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000001';
insert into workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at) values ('b0300000-0000-4000-8000-000000000001','incoming@example.test','coach','cap-incoming','pending','a0300000-0000-4000-8000-000000000001',now()+interval '1 day');
select is(pg_temp.capacity('coach_seats')->>'pending','1','durable invitation contributes');
select is(pg_temp.capacity('coach_seats')->>'reserved','0','durable invitation supersedes same reserved subject');
select is(pg_temp.capacity('coach_seats')->>'committed','3','pending and reserved not double counted');
select is(pg_temp.capacity('coach_seats')->>'state','over_limit','over maximum state accurate without remediation');
select throws_ok($$select validate_account_capacity_metadata('pgtap','{"email":"private@example.test"}')$$,'22023',null,'event metadata rejects private fields');
select throws_ok($$select reserve_account_capacity((select id from billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000001'),'counted_clients',1,'long','operation','operation:a0300000-0000-4000-8000-000000000017',null,'pgtap',now()+interval '1 day')$$,'22023',null,'short maximum TTL enforced');
-- Ownership transfer moves derived clients/workspaces without commercial counters.
update workspaces set owner_user_id='a0300000-0000-4000-8000-000000000002' where id='b0300000-0000-4000-8000-000000000002';
select is(pg_temp.capacity('active_workspaces')->>'actual','1','workspace transfer removes source usage');
select is(pg_temp.capacity('counted_clients')->>'actual','7','client in transferred workspace removed from source');
select is((select x->>'actual' from jsonb_array_elements(resolve_account_capacity('a0300000-0000-4000-8000-000000000002',(select id from billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000002'))->'dimensions') x where x->>'key'='counted_clients'),'3','transferred workspace clients appear at target');
select is(account_capacity_dimension('counted_clients',79,0,0,100,true,false)->>'state','available','threshold 79%');
select is(account_capacity_dimension('counted_clients',80,0,0,100,true,false)->>'state','approaching','threshold 80%');
select is(account_capacity_dimension('counted_clients',99,0,0,100,true,false)->>'state','approaching','threshold 99%');
select is(account_capacity_dimension('counted_clients',100,0,0,100,true,false)->>'state','at_limit','threshold 100%');
select is(account_capacity_dimension('counted_clients',101,0,0,100,true,false)->>'state','over_limit','threshold 101%');

select is(account_capacity_dimension('counted_clients',12,1,1,10,true,false)->>'remaining','0','finite remaining clamped');
select is(account_capacity_dimension('counted_clients',12,1,1,10,true,false)->>'overBy','4','finite overBy');
select is(account_capacity_dimension('counted_clients',1,0,0,3,true,false)->>'utilizationPercent','33.33','deterministic numeric rounding');
select is(account_capacity_dimension('published_packages',20,0,0,null,true,false)->>'state','unlimited','null package ceiling unlimited');
select is(account_capacity_dimension('published_packages',20,0,0,null,true,false)->'remaining','null'::jsonb,'unlimited remaining null');
select is(account_capacity_dimension('published_packages',20,0,0,null,true,false)->'utilizationPercent','null'::jsonb,'unlimited percentage null');
select is(account_capacity_dimension('published_packages',20,0,0,null,true,false)->>'wouldExceedNext','false','unlimited next false');
select is(resolve_account_capacity('a0300000-0000-4000-8000-000000000001',(select id from billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000001'))->>'computedAt',to_jsonb(transaction_timestamp())#>>'{}','one stable snapshot timestamp');
select set_config('request.jwt.claim.sub','a0300000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(get_my_account_capacity_snapshot()#>>'{subscription,effectiveStatus}','no_subscription','no subscription context');
select is(get_my_account_capacity_snapshot()#>>'{dimensions,0,state}','unavailable','no subscription unavailable');
select is(get_my_account_capacity_snapshot()#>'{dimensions,0,limit}','null'::jsonb,'no fabricated ceiling');
select is(evaluate_my_capacity_change('counted_clients')->>'reasonCode','capacity_unavailable','informational unavailable evaluation');
select throws_ok($$select evaluate_my_capacity_change('clients')$$,'22023',null,'invalid dimension rejected');
select throws_ok($$select evaluate_my_capacity_change('coach_seats',0)$$,'22023',null,'nonpositive quantity rejected');
select throws_ok($$select * from account_capacity_reservations$$,'42501',null,'authenticated table access denied');
select throws_ok($$select * from account_capacity_events$$,'42501',null,'authenticated event access denied');
select throws_ok($$select reconcile_account_capacity_reservations()$$,'42501',null,'authenticated reconciliation denied');
reset role;
select set_config('request.jwt.claim.sub','a0300000-0000-4000-8000-000000000013',true);
set local role authenticated;
select throws_ok($$select get_my_account_capacity_snapshot()$$,'42501',null,'viewer/assistant without owner PT identity denied');
reset role;
select set_config('request.jwt.claim.sub','a0300000-0000-4000-8000-000000000006',true);
set local role authenticated;
select throws_ok($$select get_my_account_capacity_snapshot()$$,'42501',null,'client denied');
reset role;
set local role anon;
select throws_ok($$select get_my_account_capacity_snapshot()$$,'42501',null,'anonymous snapshot denied');
select throws_ok($$select * from account_capacity_events$$,'42501',null,'anonymous tables denied');
reset role;
select ok(not has_function_privilege('authenticated','public.reserve_account_capacity(uuid,text,integer,text,text,text,uuid,text,timestamptz,jsonb)','execute'),'reservation denied to authenticated');
select ok(has_function_privilege('service_role','public.reserve_account_capacity(uuid,text,integer,text,text,text,uuid,text,timestamptz,jsonb)','execute'),'service explicitly granted reserve');
select ok(not has_function_privilege('service_role','public.resolve_account_capacity(uuid,uuid)','execute'),'service cannot invoke arbitrary private aggregation');
select ok(not has_function_privilege('authenticated','public.resolve_account_capacity(uuid,uuid)','execute'),'owner cannot target arbitrary account');
-- Complimentary contract and retained overage fixtures, without rewriting immutable plans.
select ensure_commercial_billing_account('a0300000-0000-4000-8000-000000000003','manual');
insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
select a.id,p.id,'complimentary','active','manual' from billing_accounts a cross join commercial_plan_versions p where a.owner_user_id='a0300000-0000-4000-8000-000000000003' and p.plan_key='scale' and p.version=1;
insert into workspaces(owner_user_id,name) select 'a0300000-0000-4000-8000-000000000003','Beta ' || n from generate_series(1,6) n;
insert into clients(workspace_id,lifecycle_state) select (select id from workspaces where owner_user_id='a0300000-0000-4000-8000-000000000003' order by id limit 1),'active' from generate_series(1,151);
insert into workspace_members(workspace_id,user_id,role) select (select id from workspaces where owner_user_id='a0300000-0000-4000-8000-000000000003' order by id limit 1),('a0300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'viewer' from generate_series(4,14) n;
select set_config('request.jwt.claim.sub','a0300000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(get_my_account_capacity_snapshot()#>>'{dimensions,0,state}','over_limit','complimentary client overage retained');
select is(get_my_account_capacity_snapshot()#>>'{dimensions,1,actual}','12','complimentary active human seats retained');
select is(get_my_account_capacity_snapshot()#>>'{dimensions,1,included}','5','Scale included seats separate');
select is(get_my_account_capacity_snapshot()#>>'{dimensions,1,limit}','10','Scale maximum seats separate');
select is(get_my_account_capacity_snapshot()#>>'{dimensions,1,state}','over_limit','complimentary seat maximum overage retained');
select is(get_my_account_capacity_snapshot()#>>'{dimensions,0,actual}','151','all complimentary client rows retained');
select is(get_my_account_capacity_snapshot()#>>'{dimensions,2,state}','over_limit','complimentary workspace overage retained');
select is(get_my_account_capacity_snapshot()#>>'{dimensions,3,state}','unlimited','Scale package limit unlimited');
select is(evaluate_my_capacity_change('counted_clients')->>'reasonCode','capacity_already_over_limit','evaluation explains existing overage');
reset role;
alter table workspaces enable trigger zz_capacity_admission;
alter table clients enable trigger zz_capacity_admission;
alter table workspace_members enable trigger zz_capacity_admission;
alter table workspace_member_invites enable trigger zz_capacity_admission;
alter table pt_packages enable trigger zz_capacity_admission;
set local role authenticated;
select throws_ok($$select create_workspace('Additional workspace')$$,'P0001','Account capacity admission failed.','PR-PRICE-04 prevents increasing an over-limit dimension');
reset role;
select is(reserve_account_capacity((select id from billing_accounts where owner_user_id='a0300000-0000-4000-8000-000000000003'),'published_packages',100,'unlimited','operation','operation:a0300000-0000-4000-8000-000000000018',null,'pgtap',now()+interval '1 minute')->>'granted','true','unlimited reservation granted');
select * from finish();
rollback;

