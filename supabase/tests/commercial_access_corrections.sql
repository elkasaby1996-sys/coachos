begin;
select no_plan();
create temp table correction_actors(name text, owner_id uuid, workspace_id uuid, user_id uuid, client_id uuid);
grant select on correction_actors to authenticated;
do $$ declare o uuid; u uuid; w uuid; a uuid; c uuid; n text; begin
  foreach n in array array['full','grace','restricted','expired'] loop
    o:=gen_random_uuid(); u:=gen_random_uuid();
    insert into auth.users(id,email) values(o,o||'@correction.test'),(u,u||'@correction.test');
    insert into public.pt_profiles(user_id,full_name) values(o,'Correction coach');
    a:=public.ensure_commercial_billing_account(o,'manual');
    insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
      select a,id,'complimentary','active','legacy_beta_backfill' from public.commercial_plan_versions where plan_key='scale' and status='active';
    insert into public.workspaces(owner_user_id,name) values(o,'Correction '||n) returning id into w;
    insert into public.clients(workspace_id,user_id,display_name) values(w,u,'Correction client') returning id into c;
    insert into correction_actors values(n,o,w,u,c);
  end loop;
end $$;
-- Invitation fixtures use the real acceptance check and normalized-email constraint.
insert into public.workspaces(owner_user_id,name) select owner_id,'Duplicate identity workspace' from correction_actors where name='full';
insert into public.workspace_members(workspace_id,user_id,role,status) select workspace_id,user_id,'coach','active' from correction_actors where name='full';
insert into public.workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at,accepted_at,accepted_by_user_id)
select x.workspace_id,v.label||'@correction.test','coach','correction-'||v.label,v.status,x.owner_id,
  transaction_timestamp()+v.offset_time,case when v.status='accepted' then now() end,case when v.status='accepted' then x.user_id end
from correction_actors x cross join (values
  ('future','pending',interval '1 day'),('expired','pending',interval '-1 second'),
  ('boundary','pending',interval '0'),('accepted','accepted',interval '1 day'),('revoked','revoked',interval '1 day')
) v(label,status,offset_time) where x.name='full';
insert into public.workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at)
select workspace_id,user_id||'@correction.test','coach','correction-staff','pending',owner_id,now()+interval '1 day' from correction_actors where name='full';
insert into public.workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at)
select w.id,'future@correction.test','viewer','correction-duplicate','pending',w.owner_user_id,now()+interval '1 day' from public.workspaces w where w.name='Duplicate identity workspace';
insert into public.workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at)
select workspace_id,'foreign@correction.test','coach','correction-foreign','pending',owner_id,now()+interval '1 day' from correction_actors where name='grace';
select set_config('request.jwt.claim.sub',(select owner_id::text from correction_actors where name='full'),true);
set local role authenticated;
select ok(exists(select 1 from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i where i->>'label'='future@correction.test'),'future pending seat appears');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i where i->>'label'='expired@correction.test'),0,'stored-pending expired invitation excluded');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i where i->>'label'='boundary@correction.test'),0,'invitation expiring at transaction timestamp excluded');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i where i->>'label'='accepted@correction.test'),0,'accepted invitation excluded');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i where i->>'label'='revoked@correction.test'),0,'revoked invitation excluded');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i where i->>'label'='foreign@correction.test'),0,'foreign owner invitation excluded');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i where i->>'label'=(select user_id||'@correction.test' from correction_actors where name='full')),0,'active staff supersedes stale invitation');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i where i->>'label'='future@correction.test'),1,'duplicate identity has one remediation representative');
reset role;
select is(jsonb_array_length(public.get_my_commercial_remediation()->'invites'),(select count(distinct subject_key)::integer from public.account_capacity_subjects(auth.uid(),transaction_timestamp()) where dimension='coach_seats' and pending),'remediation count agrees with capacity pending seats');
select results_eq($$select distinct public.account_capacity_subject_key('coach_seats',public.account_capacity_email_key(i->>'label')) from jsonb_array_elements(public.get_my_commercial_remediation()->'invites') i order by 1$$,$$select distinct subject_key from public.account_capacity_subjects(auth.uid(),transaction_timestamp()) where dimension='coach_seats' and pending order by 1$$,'remediation subjects agree with canonical capacity subjects');

-- Deliberate compatibility disagreement represents imported/stale data. All
-- disabled normalization and relaxed unknown-value constraints roll back.
create temp table lifecycle_cases(label text,lifecycle text,relationship text,compatibility public.client_status,interactive boolean,client_id uuid,user_id uuid);
insert into lifecycle_cases(label,lifecycle,relationship,compatibility,interactive) values
 ('invited','invited','active','completed',true),('onboarding','onboarding','active','completed',true),
 ('active','active','active','active',true),('paused','paused','active','completed',true),
 ('completed','completed','active','active',false),('churned','churned','active','active',false),
 ('removed','active','removed','active',false),('transferred','active','transferred_out','active',false),
 ('unknown','unmapped','active','active',false);
alter table public.clients disable trigger clients_normalize_lifecycle_transition_trigger;
alter table public.clients drop constraint clients_lifecycle_state_check;
do $$ declare x record; w uuid; u uuid; c uuid; begin
 select workspace_id into w from correction_actors where name='full';
 for x in select * from lifecycle_cases loop
  u:=gen_random_uuid();
  insert into auth.users(id,email) values(u,u||'@lifecycle-correction.test');
  insert into public.clients(workspace_id,user_id,display_name,status,lifecycle_state,relationship_status,paused_reason,churn_reason)
    values(w,u,x.label,x.compatibility,x.lifecycle,x.relationship,case when x.lifecycle='paused' then 'travel' end,case when x.lifecycle='churned' then 'ended' end) returning id into c;
  update lifecycle_cases set client_id=c,user_id=u where label=x.label;
 end loop;
end $$;
alter table public.clients enable trigger clients_normalize_lifecycle_transition_trigger;
grant select on lifecycle_cases to authenticated;
-- Each first call starts without a conversation; then historical rows are
-- provided for every state and must remain discoverable and RLS-readable.
create function pg_temp.check_lifecycle() returns setof text language plpgsql as $$
declare x record; access jsonb; n integer; begin
 for x in select * from lifecycle_cases loop
  perform set_config('request.jwt.claim.sub',x.user_id::text,true);
  access:=public.get_client_coaching_access(x.client_id);
  return next is((access->>'canMessageRelationship')::boolean,x.interactive,x.label||': canonical interaction');
  select count(*) into n from public.client_accessible_conversations_with_ensure();
  return next is(n,case when x.interactive then 1 else 0 end,x.label||': materialization ignores compatibility status');
  return next ok(not (access ?| array['accessMode','planKey','billingAccountId','reason']),x.label||': no billing disclosure');
 end loop;
end $$;
set local role authenticated;
select * from pg_temp.check_lifecycle();
reset role;
insert into public.conversations(workspace_id,client_id) select c.workspace_id,c.id from public.clients c join lifecycle_cases x on x.client_id=c.id on conflict on constraint conversations_workspace_client_key do nothing;
create function pg_temp.check_history() returns setof text language plpgsql as $$
declare x record; n integer; err text; begin
 for x in select * from lifecycle_cases loop
  perform set_config('request.jwt.claim.sub',x.user_id::text,true);
  select count(*) into n from public.client_accessible_conversations_with_ensure();
  return next is(n,1,x.label||': existing history discoverable');
  select count(*) into n from public.conversations where client_id=x.client_id;
  return next is(n,1,x.label||': conversation readable through RLS');
  perform public.client_accessible_conversations_with_ensure();
  select count(*) into n from public.conversations where client_id=x.client_id;
  return next is(n,1,x.label||': retry does not duplicate history');
  err:=null;
  begin
    perform public.send_conversation_message(id,x.user_id,'client','Client','Lifecycle message',false) from public.conversations where client_id=x.client_id;
  exception when insufficient_privilege then err:=sqlstate; end;
  return next is(err,case when x.interactive then null::text else '42501' end,x.label||': actual message write follows canonical interaction');
 end loop;
end $$;
set local role authenticated;
select * from pg_temp.check_history();
select throws_ok($$select public.get_client_coaching_access(client_id) from correction_actors where name='grace'$$,'42501','Client access denied.','foreign client privacy survives definer resolver');
reset role;

-- Independent lead conversations do not inherit the lifecycle of an unrelated
-- completed coaching relationship. Existing lead domain authorization still applies.
select set_config('request.jwt.claim.sub','',true);
insert into public.pt_hub_leads(user_id,applicant_user_id,full_name,goal_summary)
 select a.owner_id,x.user_id,'Independent prospect','Coaching' from correction_actors a cross join lifecycle_cases x where a.name='grace' and x.label='completed';
select set_config('request.jwt.claim.sub',(select user_id::text from lifecycle_cases where label='completed'),true);
set local role authenticated;
select is((select count(*)::integer from public.lead_conversations where lead_user_id=auth.uid()),1,'independent lead conversation remains readable');
select lives_ok($$select public.lead_chat_send_message(lead_id,'Independent lead reply') from public.lead_conversations where lead_user_id=auth.uid()$$,'independent lead reply survives completed coaching lifecycle');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- Actual storage RLS mutations, including DELETE (zero affected rows on denial).
insert into public.baseline_entries(client_id,workspace_id) select client_id,workspace_id from correction_actors;
insert into public.checkin_templates(workspace_id,name) select workspace_id,'Storage check-in' from correction_actors;
insert into public.checkins(client_id,template_id,week_ending_saturday) select x.client_id,t.id,public.normalize_checkin_due_date(current_date) from correction_actors x join public.checkin_templates t on t.workspace_id=x.workspace_id;
create temp table storage_cases as select x.*, 'baseline_photos'::text bucket, x.client_id||'/'||b.id||'/existing.png' path from correction_actors x join public.baseline_entries b on b.client_id=x.client_id
union all select x.*,'checkin-photos',x.client_id||'/'||c.id||'/existing.png' from correction_actors x join public.checkins c on c.client_id=x.client_id
union all select x.*,'workspace_branding',x.workspace_id||'/existing.png' from correction_actors x
union all select x.*,'medical_documents',x.client_id||'/existing.pdf' from correction_actors x;
grant select on storage_cases to authenticated;
insert into storage.objects(bucket_id,name) select bucket,path from storage_cases;
update public.account_subscriptions s set status=x.name,restricted_at=case when x.name='restricted' then now() end,expired_at=case when x.name='expired' then now() end
from public.billing_accounts a join correction_actors x on x.owner_id=a.owner_user_id where s.billing_account_id=a.id and x.name<>'full';
create function pg_temp.check_storage() returns setof text language plpgsql as $$
declare x record; n integer; allowed boolean; err text; begin
 for x in select * from storage_cases loop
  perform set_config('request.jwt.claim.sub',case when x.bucket='workspace_branding' then x.owner_id else x.user_id end::text,true);
  allowed:=x.bucket='medical_documents' or x.name='full' or (x.name='grace' and x.bucket<>'workspace_branding');
  err:=null;
  begin insert into storage.objects(bucket_id,name) values(x.bucket,replace(x.path,'existing','insert')); exception when insufficient_privilege then err:=sqlstate; end;
  return next is(err,case when allowed then null::text else '42501' end,x.name||' '||x.bucket||': INSERT authorization');
  update storage.objects set metadata='{"correction":true}' where bucket_id=x.bucket and name=x.path;
  get diagnostics n=row_count;
  -- Workspace branding deliberately has no permissive UPDATE policy.
  return next is(n,case when allowed and x.bucket<>'workspace_branding' then 1 else 0 end,x.name||' '||x.bucket||': UPDATE authorization');
  delete from storage.objects where bucket_id=x.bucket and name=x.path;
  get diagnostics n=row_count;
  return next is(n,case when allowed then 1 else 0 end,x.name||' '||x.bucket||': DELETE authorization');
 end loop;
end $$;
-- Supabase Storage's own deletion guard requires the same transaction setting
-- its API uses. This does not bypass RLS or commercial authorization.
select set_config('storage.allow_delete_query','true',true);
set local role authenticated;
select * from pg_temp.check_storage();
select set_config('request.jwt.claim.sub',(select owner_id::text from correction_actors where name='full'),true);
select throws_ok($$insert into storage.objects(bucket_id,name) select 'baseline_photos',path||'.foreign' from storage_cases where name='grace' and bucket='baseline_photos'$$,'42501',null,'full owner cannot upload another client private baseline');
reset role;
select * from finish();
rollback;
