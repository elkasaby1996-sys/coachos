-- Local-only, rolled-back account-shaped performance fixture. No production indexes or data writes.
begin;
insert into auth.users(id,email) select ('a0310000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'capacity-plan-' || n || '@example.test' from generate_series(1,2001) n;
insert into workspaces(id,name,owner_user_id) select ('b0310000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'Plan workspace ' || n,'a0310000-0000-4000-8000-000000000001' from generate_series(1,20) n;
insert into clients(user_id,workspace_id,lifecycle_state) select ('a0310000-0000-4000-8000-' || lpad((n+1)::text,12,'0'))::uuid,('b0310000-0000-4000-8000-' || lpad((1+n%20)::text,12,'0'))::uuid,'active' from generate_series(1,1000) n;
insert into workspace_members(workspace_id,user_id,role) select ('b0310000-0000-4000-8000-' || lpad(w::text,12,'0'))::uuid,('a0310000-0000-4000-8000-' || lpad((n+1001)::text,12,'0'))::uuid,'viewer' from generate_series(1,50) n cross join generate_series(1,20) w;
insert into workspace_member_invites(workspace_id,email,role,token_hash,invited_by_user_id,expires_at) select ('b0310000-0000-4000-8000-' || lpad((1+n%20)::text,12,'0'))::uuid,'prospect-' || n || '@example.test','coach','plan-' || n,'a0310000-0000-4000-8000-000000000001',now()+interval '1 day' from generate_series(1,100) n;
insert into pt_packages(pt_user_id,title,status,is_public) select 'a0310000-0000-4000-8000-000000000001','Plan package ' || n,'active',true from generate_series(1,1000) n;
insert into account_capacity_reservations(billing_account_id,dimension,quantity,idempotency_key,subject_type,subject_key,source,expires_at) select a.id,'counted_clients',1,'plan-' || n,'operation','operation:' || extensions.uuid_generate_v5(a.id,n::text),'query_plan',now()+interval '2 minutes' from billing_accounts a cross join generate_series(1,1000) n where a.owner_user_id='a0310000-0000-4000-8000-000000000001';
analyze clients; analyze workspaces; analyze workspace_members; analyze workspace_member_invites; analyze pt_packages; analyze account_capacity_reservations; analyze auth.users;
\echo client aggregation and distinct linked identity
explain (analyze,buffers) select count(distinct coalesce('user:' || c.user_id,'client:' || c.id)) from clients c join workspaces w on w.id=c.workspace_id where w.owner_user_id='a0310000-0000-4000-8000-000000000001' and coalesce(c.relationship_status,'active')='active' and (c.lifecycle_state is null or c.lifecycle_state not in ('completed','churned'));
\echo active human team aggregation
explain (analyze,buffers) select count(distinct m.user_id) from workspace_members m join workspaces w on w.id=m.workspace_id where w.owner_user_id='a0310000-0000-4000-8000-000000000001' and m.status='active' and m.role::text in ('owner','admin','coach','assistant_coach','viewer','pt_owner','pt_coach','pt');
\echo pending team invitations
explain (analyze,buffers) select count(distinct lower(btrim(i.email))) from workspace_member_invites i join workspaces w on w.id=i.workspace_id where w.owner_user_id='a0310000-0000-4000-8000-000000000001' and i.status='pending' and i.expires_at>transaction_timestamp();
\echo workspace ownership count
explain (analyze,buffers) select count(*) from workspaces where owner_user_id='a0310000-0000-4000-8000-000000000001';
\echo published package count
explain (analyze,buffers) select count(*) from pt_packages where pt_user_id='a0310000-0000-4000-8000-000000000001' and status='active' and is_public=true;
\echo active reservations
explain (analyze,buffers) select count(*) from account_capacity_reservations where billing_account_id=(select id from billing_accounts where owner_user_id='a0310000-0000-4000-8000-000000000001') and status='active' and expires_at>transaction_timestamp();
\echo complete snapshot including identity normalization and exclusions
explain (analyze,buffers) select resolve_account_capacity('a0310000-0000-4000-8000-000000000001',(select id from billing_accounts where owner_user_id='a0310000-0000-4000-8000-000000000001'));
rollback;
