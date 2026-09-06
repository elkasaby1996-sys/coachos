begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

select set_config('request.jwt.claim.role', 'authenticated', true);

with ids as (
  select
    '00000000-0000-4000-8000-000000000401'::uuid as coach_id,
    '00000000-0000-4000-8000-000000000402'::uuid as archived_user_id,
    '00000000-0000-4000-8000-000000000403'::uuid as accepting_user_id,
    '00000000-0000-4000-8000-000000000404'::uuid as workspace_id,
    '00000000-0000-4000-8000-000000000405'::uuid as archived_client_id
)
insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
select
  coach_id,
  'authenticated',
  'authenticated',
  'coach-pr053e@example.test',
  'x',
  now(),
  now(),
  now()
from ids
union all
select
  archived_user_id,
  'authenticated',
  'authenticated',
  'archived-user-pr053e@example.test',
  'x',
  now(),
  now(),
  now()
from ids
union all
select
  accepting_user_id,
  'authenticated',
  'authenticated',
  'client-pr053e@example.test',
  'x',
  now(),
  now(),
  now()
from ids;

with ids as (
  select
    '00000000-0000-4000-8000-000000000401'::uuid as coach_id,
    '00000000-0000-4000-8000-000000000404'::uuid as workspace_id
)
insert into public.workspaces (id, name, owner_user_id, slug)
select workspace_id, 'PR-05.3E Workspace', coach_id, 'pr-053e-workspace'
from ids;

with ids as (
  select
    '00000000-0000-4000-8000-000000000401'::uuid as coach_id,
    '00000000-0000-4000-8000-000000000402'::uuid as archived_user_id,
    '00000000-0000-4000-8000-000000000404'::uuid as workspace_id,
    '00000000-0000-4000-8000-000000000405'::uuid as archived_client_id
)
insert into public.clients (
  id,
  workspace_id,
  user_id,
  status,
  relationship_status,
  removed_at,
  removed_by_user_id,
  email,
  display_name
)
select
  archived_client_id,
  workspace_id,
  archived_user_id,
  'active',
  'removed',
  now(),
  coach_id,
  'client-pr053e@example.test',
  'Archived Same Email Client'
from ids;

with ids as (
  select
    '00000000-0000-4000-8000-000000000401'::uuid as coach_id,
    '00000000-0000-4000-8000-000000000404'::uuid as workspace_id
)
insert into public.invites (
  workspace_id,
  role,
  code,
  expires_at,
  max_uses,
  uses,
  created_by_user_id
)
select
  workspace_id,
  'client',
  'PR053E01',
  now() + interval '1 day',
  1,
  0,
  coach_id
from ids;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000403', true);
select set_config('request.jwt.claim.email', 'client-pr053e@example.test', true);

create temporary table accepted_invite_result as
select * from public.accept_invite(p_token => 'PR053E01');

select is(
  (select client_id from accepted_invite_result),
  '00000000-0000-4000-8000-000000000405'::uuid,
  'generic invite returns the archived client row matched by accepting email'
);

select is(
  (select relationship_status from public.clients where id = '00000000-0000-4000-8000-000000000405'::uuid),
  'active',
  'archived same-email row is reactivated'
);

select ok(
  (select removed_at is null from public.clients where id = '00000000-0000-4000-8000-000000000405'::uuid),
  'reactivation clears removed_at'
);

select ok(
  (select removed_by_user_id is null from public.clients where id = '00000000-0000-4000-8000-000000000405'::uuid),
  'reactivation clears removed_by_user_id'
);

select is(
  (select user_id from public.clients where id = '00000000-0000-4000-8000-000000000405'::uuid),
  '00000000-0000-4000-8000-000000000403'::uuid,
  'reactivation claims the archived row for the accepting user'
);

select is(
  (
    select count(*)::integer
    from public.clients
    where workspace_id = '00000000-0000-4000-8000-000000000404'::uuid
      and lower(email) = 'client-pr053e@example.test'
  ),
  1,
  'same-workspace same-email reactivation does not create a duplicate client row'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);

select is(
  (
    select count(*)::integer
    from public.pt_hub_clients_page(
      10,
      0,
      '00000000-0000-4000-8000-000000000404'::uuid,
      null::text,
      null::text,
      null::text,
      'active'
    )
    where id = '00000000-0000-4000-8000-000000000405'::uuid
  ),
  1,
  'Active list includes the reactivated row'
);

select is(
  (
    select count(*)::integer
    from public.pt_hub_clients_page(
      10,
      0,
      '00000000-0000-4000-8000-000000000404'::uuid,
      null::text,
      null::text,
      null::text,
      'archived'
    )
    where id = '00000000-0000-4000-8000-000000000405'::uuid
  ),
  0,
  'Archived list excludes the reactivated row'
);

with ids as (
  select
    '00000000-0000-4000-8000-000000000411'::uuid as new_user_id,
    '00000000-0000-4000-8000-000000000412'::uuid as workspace_id
)
insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
select
  new_user_id,
  'authenticated',
  'authenticated',
  'new-client-pr053e@example.test',
  'x',
  now(),
  now(),
  now()
from ids;

insert into public.workspaces (id, name, owner_user_id, slug)
values (
  '00000000-0000-4000-8000-000000000412'::uuid,
  'PR-05.3E New Client Workspace',
  '00000000-0000-4000-8000-000000000401'::uuid,
  'pr-053e-new-client-workspace'
);

insert into public.invites (
  workspace_id,
  role,
  code,
  expires_at,
  max_uses,
  uses,
  created_by_user_id
)
values (
  '00000000-0000-4000-8000-000000000412'::uuid,
  'client',
  'PR053E02',
  now() + interval '1 day',
  1,
  0,
  '00000000-0000-4000-8000-000000000401'::uuid
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000411', true);
select set_config('request.jwt.claim.email', 'new-client-pr053e@example.test', true);

create temporary table new_client_invite_result as
select * from public.accept_invite(p_token => 'PR053E02');

select is(
  (
    select count(*)::integer
    from public.clients
    where workspace_id = '00000000-0000-4000-8000-000000000412'::uuid
      and user_id = '00000000-0000-4000-8000-000000000411'::uuid
  ),
  1,
  'new-client invite creates one workspace client row'
);

select is(
  (
    select relationship_status
    from public.clients
    where id = (select client_id from new_client_invite_result)
  ),
  'active',
  'new-client invite creates an active relationship'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000421'::uuid,
  'authenticated',
  'authenticated',
  'active-client-pr053e@example.test',
  'x',
  now(),
  now(),
  now()
);

insert into public.workspaces (id, name, owner_user_id, slug)
values (
  '00000000-0000-4000-8000-000000000422'::uuid,
  'PR-05.3E Active Client Workspace',
  '00000000-0000-4000-8000-000000000401'::uuid,
  'pr-053e-active-client-workspace'
);

insert into public.clients (
  id,
  workspace_id,
  user_id,
  status,
  relationship_status,
  email,
  display_name
)
values (
  '00000000-0000-4000-8000-000000000423'::uuid,
  '00000000-0000-4000-8000-000000000422'::uuid,
  '00000000-0000-4000-8000-000000000421'::uuid,
  'active',
  'active',
  'active-client-pr053e@example.test',
  'Active Client'
);

insert into public.invites (
  workspace_id,
  role,
  code,
  expires_at,
  max_uses,
  uses,
  created_by_user_id
)
values (
  '00000000-0000-4000-8000-000000000422'::uuid,
  'client',
  'PR053E03',
  now() + interval '1 day',
  1,
  0,
  '00000000-0000-4000-8000-000000000401'::uuid
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000421', true);
select set_config('request.jwt.claim.email', 'active-client-pr053e@example.test', true);

create temporary table active_client_invite_result as
select * from public.accept_invite(p_token => 'PR053E03');

select is(
  (select client_id from active_client_invite_result),
  '00000000-0000-4000-8000-000000000423'::uuid,
  'existing active client invite remains idempotent'
);

select is(
  (
    select count(*)::integer
    from public.clients
    where workspace_id = '00000000-0000-4000-8000-000000000422'::uuid
      and user_id = '00000000-0000-4000-8000-000000000421'::uuid
  ),
  1,
  'existing active client invite does not create a duplicate row'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000431'::uuid,
  'authenticated',
  'authenticated',
  'transferred-client-pr053e@example.test',
  'x',
  now(),
  now(),
  now()
);

insert into public.workspaces (id, name, owner_user_id, slug)
values (
  '00000000-0000-4000-8000-000000000432'::uuid,
  'PR-05.3E Transferred Client Workspace',
  '00000000-0000-4000-8000-000000000401'::uuid,
  'pr-053e-transferred-client-workspace'
);

insert into public.clients (
  id,
  workspace_id,
  user_id,
  status,
  relationship_status,
  email,
  display_name
)
values (
  '00000000-0000-4000-8000-000000000433'::uuid,
  '00000000-0000-4000-8000-000000000432'::uuid,
  '00000000-0000-4000-8000-000000000431'::uuid,
  'active',
  'transferred_out',
  'transferred-client-pr053e@example.test',
  'Transferred Client'
);

insert into public.invites (
  workspace_id,
  role,
  code,
  expires_at,
  max_uses,
  uses,
  created_by_user_id
)
values (
  '00000000-0000-4000-8000-000000000432'::uuid,
  'client',
  'PR053E04',
  now() + interval '1 day',
  1,
  0,
  '00000000-0000-4000-8000-000000000401'::uuid
);

create temporary table transferred_guard_result (
  blocked boolean not null,
  detail text
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000431', true);
select set_config('request.jwt.claim.email', 'transferred-client-pr053e@example.test', true);

do $$
declare
  v_detail text;
begin
  perform *
  from public.accept_invite(p_token => 'PR053E04');

  insert into transferred_guard_result (blocked, detail)
  values (false, null);
exception
  when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into transferred_guard_result (blocked, detail)
    values (true, v_detail);
end;
$$;

select ok(
  (select blocked from transferred_guard_result),
  'transferred_out generic invite remains blocked'
);

select is(
  (select detail from transferred_guard_result),
  'CLIENT_RELATIONSHIP_TRANSFERRED_OUT',
  'transferred_out guard keeps the transfer-only error detail'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000441'::uuid,
    'authenticated',
    'authenticated',
    'old-transferred-client-pr053e@example.test',
    'x',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000442'::uuid,
    'authenticated',
    'authenticated',
    'transferred-email-claim-pr053e@example.test',
    'x',
    now(),
    now(),
    now()
  );

insert into public.workspaces (id, name, owner_user_id, slug)
values (
  '00000000-0000-4000-8000-000000000443'::uuid,
  'PR-05.3E Transferred Email Workspace',
  '00000000-0000-4000-8000-000000000401'::uuid,
  'pr-053e-transferred-email-workspace'
);

insert into public.clients (
  id,
  workspace_id,
  user_id,
  status,
  relationship_status,
  email,
  display_name
)
values (
  '00000000-0000-4000-8000-000000000444'::uuid,
  '00000000-0000-4000-8000-000000000443'::uuid,
  '00000000-0000-4000-8000-000000000441'::uuid,
  'active',
  'transferred_out',
  'transferred-email-claim-pr053e@example.test',
  'Transferred Email Client'
);

insert into public.invites (
  workspace_id,
  role,
  code,
  expires_at,
  max_uses,
  uses,
  created_by_user_id
)
values (
  '00000000-0000-4000-8000-000000000443'::uuid,
  'client',
  'PR053E05',
  now() + interval '1 day',
  1,
  0,
  '00000000-0000-4000-8000-000000000401'::uuid
);

create temporary table transferred_email_guard_result (
  blocked boolean not null,
  detail text
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000442', true);
select set_config('request.jwt.claim.email', 'transferred-email-claim-pr053e@example.test', true);

do $$
declare
  v_detail text;
begin
  perform *
  from public.accept_invite(p_token => 'PR053E05');

  insert into transferred_email_guard_result (blocked, detail)
  values (false, null);
exception
  when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    insert into transferred_email_guard_result (blocked, detail)
    values (true, v_detail);
end;
$$;

select ok(
  (select blocked from transferred_email_guard_result),
  'same-email transferred_out generic invite remains blocked'
);

select is(
  (select detail from transferred_email_guard_result),
  'CLIENT_RELATIONSHIP_TRANSFERRED_OUT',
  'same-email transferred_out guard keeps the transfer-only error detail'
);

select * from finish();

rollback;
