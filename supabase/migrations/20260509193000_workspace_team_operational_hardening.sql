create table if not exists public.workspace_team_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invite_id uuid references public.workspace_member_invites(id) on delete cascade,
  recipient_email text not null,
  notification_type text not null,
  template_key text not null,
  template_model jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'suppressed', 'cancelled')),
  failure_reason text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists workspace_team_email_deliveries_workspace_created_idx
  on public.workspace_team_email_deliveries (workspace_id, created_at desc);

create index if not exists workspace_team_email_deliveries_invite_type_idx
  on public.workspace_team_email_deliveries (invite_id, notification_type, created_at desc);

alter table public.workspace_team_email_deliveries enable row level security;

drop policy if exists workspace_team_email_deliveries_team_manage_read
  on public.workspace_team_email_deliveries;
create policy workspace_team_email_deliveries_team_manage_read
  on public.workspace_team_email_deliveries
  for select
  to authenticated
  using (public.can_manage_workspace_team(workspace_id));

drop policy if exists workspace_team_email_deliveries_service_manage
  on public.workspace_team_email_deliveries;
create policy workspace_team_email_deliveries_service_manage
  on public.workspace_team_email_deliveries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.workspace_team_operational_error(p_code text)
returns void
language plpgsql
stable
set search_path = pg_catalog, public, extensions
as $$
begin
  raise exception '%', p_code
    using errcode = 'P0001',
          hint = p_code;
end;
$$;

create or replace function public.workspace_access_context(p_workspace_id uuid)
returns table (
  workspace_id uuid,
  relation text,
  role text,
  member_status text,
  client_access_mode text,
  permissions text[],
  member_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_inactive_member public.workspace_members%rowtype;
begin
  if p_workspace_id is null or v_user_id is null then
    return;
  end if;

  return query
  select
    w.id,
    'owned'::text,
    'owner'::text,
    'active'::text,
    'all_clients'::text,
    public.workspace_role_permissions('owner'),
    null::uuid
  from public.workspaces w
  where w.id = p_workspace_id
    and w.owner_user_id = v_user_id
  limit 1;

  if found then
    return;
  end if;

  select *
  into v_inactive_member
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_user_id
    and wm.status in ('suspended', 'removed')
  limit 1;

  if found then
    perform public.record_workspace_team_audit_event(
      p_workspace_id,
      v_user_id,
      case
        when v_inactive_member.status = 'suspended'
          then 'team.access_denied_suspended_member'
        else 'team.access_denied_removed_member'
      end,
      'workspace_member',
      v_inactive_member.id,
      null,
      jsonb_build_object('memberStatus', v_inactive_member.status)
    );
    return;
  end if;

  return query
  select
    wm.workspace_id,
    'shared'::text,
    public.normalize_workspace_role(wm.role::text),
    wm.status,
    wm.client_access_mode,
    public.workspace_role_permissions(wm.role::text),
    wm.id
  from public.workspace_members wm
  join public.workspaces w
    on w.id = wm.workspace_id
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_user_id
    and wm.status = 'active'
    and public.has_workspace_permission(
      wm.role::text,
      wm.status,
      'workspace.view'
    )
  limit 1;
end;
$$;

create or replace function public.update_workspace_team_member_role(
  p_workspace_id uuid,
  p_member_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_member public.workspace_members%rowtype;
  v_previous_role text;
  v_next_role text := trim(coalesce(p_role, ''));
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  if v_next_role not in ('admin', 'coach', 'assistant_coach', 'viewer') then
    perform public.workspace_team_invite_error('INVALID_INVITE_ROLE');
  end if;

  select *
  into v_member
  from public.workspace_members wm
  where wm.id = p_member_id
    and wm.workspace_id = p_workspace_id
  for update;

  if not found then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  v_previous_role := public.normalize_workspace_role(v_member.role::text);
  if v_previous_role = 'owner' then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  if v_previous_role = v_next_role then
    return jsonb_build_object(
      'memberId', p_member_id,
      'workspaceId', p_workspace_id,
      'role', v_next_role
    );
  end if;

  update public.workspace_members
  set role = v_next_role::public.workspace_role,
      updated_at = now()
  where id = p_member_id
  returning * into v_member;

  perform public.record_workspace_team_audit_event(
    p_workspace_id,
    v_actor_user_id,
    'team.role_changed',
    'workspace_member',
    p_member_id,
    null,
    jsonb_build_object('previousRole', v_previous_role, 'nextRole', v_next_role)
  );

  perform public.notify_workspace_team_user(
    p_workspace_id,
    v_member.user_id,
    'team_role_changed',
    'Workspace role updated',
    'Your workspace role is now ' || replace(v_next_role, '_', ' ') || '.',
    '/workspace/' || p_workspace_id::text,
    'workspace_member',
    p_member_id,
    jsonb_build_object('previousRole', v_previous_role, 'nextRole', v_next_role)
  );

  return jsonb_build_object(
    'memberId', p_member_id,
    'workspaceId', p_workspace_id,
    'role', v_next_role
  );
end;
$$;

create or replace function public.update_workspace_team_member_status(
  p_workspace_id uuid,
  p_member_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_member public.workspace_members%rowtype;
  v_previous_status text;
  v_next_status text := trim(coalesce(p_status, ''));
  v_event_type text;
  v_notification_type text;
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  if v_next_status not in ('active', 'suspended', 'removed') then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  select *
  into v_member
  from public.workspace_members wm
  where wm.id = p_member_id
    and wm.workspace_id = p_workspace_id
  for update;

  if not found then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  if public.normalize_workspace_role(v_member.role::text) = 'owner' then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  v_previous_status := coalesce(v_member.status, 'active');

  if v_previous_status = v_next_status then
    return jsonb_build_object(
      'memberId', p_member_id,
      'workspaceId', p_workspace_id,
      'status', v_next_status
    );
  end if;

  update public.workspace_members
  set status = v_next_status,
      updated_at = now()
  where id = p_member_id
  returning * into v_member;

  v_event_type := case
    when v_next_status = 'suspended' then 'team.member_suspended'
    when v_next_status = 'removed' then 'team.member_removed'
    else 'team.member_reactivated'
  end;
  v_notification_type := case
    when v_next_status = 'suspended' then 'team_member_suspended'
    when v_next_status = 'removed' then 'team_member_removed'
    else 'team_member_reactivated'
  end;

  perform public.record_workspace_team_audit_event(
    p_workspace_id,
    v_actor_user_id,
    v_event_type,
    'workspace_member',
    p_member_id,
    null,
    jsonb_build_object('previousStatus', v_previous_status, 'nextStatus', v_next_status)
  );

  perform public.notify_workspace_team_user(
    p_workspace_id,
    v_member.user_id,
    v_notification_type,
    'Workspace access updated',
    case
      when v_next_status = 'active' then 'Your workspace access is active again.'
      else 'Your access to this workspace is no longer active. Contact the workspace owner if this looks incorrect.'
    end,
    '/pt-hub/workspaces',
    'workspace_member',
    p_member_id,
    jsonb_build_object('previousStatus', v_previous_status, 'nextStatus', v_next_status)
  );

  return jsonb_build_object(
    'memberId', p_member_id,
    'workspaceId', p_workspace_id,
    'status', v_next_status
  );
end;
$$;

create or replace function public.update_workspace_team_member_clients(
  p_workspace_id uuid,
  p_member_id uuid,
  p_client_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_member public.workspace_members%rowtype;
  v_client_ids uuid[];
  v_valid_client_count int;
  v_added_client_ids uuid[];
  v_removed_client_ids uuid[];
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  select *
  into v_member
  from public.workspace_members wm
  where wm.id = p_member_id
    and wm.workspace_id = p_workspace_id
    and public.normalize_workspace_role(wm.role::text) <> 'owner'
  for update;

  if not found then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  select coalesce(array_agg(distinct client_id), '{}'::uuid[])
  into v_client_ids
  from unnest(coalesce(p_client_ids, '{}'::uuid[])) as client_id
  where client_id is not null;

  if cardinality(v_client_ids) > 0 then
    select count(*)
    into v_valid_client_count
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.id = any(v_client_ids);

    if v_valid_client_count is distinct from cardinality(v_client_ids) then
      perform public.workspace_team_invite_error('INVALID_CLIENT_ASSIGNMENT');
    end if;
  end if;

  select coalesce(array_agg(existing.client_id), '{}'::uuid[])
  into v_removed_client_ids
  from public.workspace_member_client_assignments existing
  where existing.workspace_id = p_workspace_id
    and existing.member_id = p_member_id
    and not (existing.client_id = any(v_client_ids));

  select coalesce(array_agg(new_client_id), '{}'::uuid[])
  into v_added_client_ids
  from unnest(v_client_ids) as new_client_id
  where not exists (
    select 1
    from public.workspace_member_client_assignments existing
    where existing.workspace_id = p_workspace_id
      and existing.member_id = p_member_id
      and existing.client_id = new_client_id
  );

  delete from public.workspace_member_client_assignments wmca
  where wmca.workspace_id = p_workspace_id
    and wmca.member_id = p_member_id
    and not (wmca.client_id = any(v_client_ids));

  insert into public.workspace_member_client_assignments (
    workspace_id,
    member_id,
    client_id,
    assigned_by_user_id
  )
  select
    p_workspace_id,
    p_member_id,
    client_id,
    v_actor_user_id
  from unnest(v_client_ids) as client_id
  on conflict (workspace_id, member_id, client_id) do nothing;

  if cardinality(v_added_client_ids) > 0 then
    perform public.record_workspace_team_audit_event(
      p_workspace_id,
      v_actor_user_id,
      'team.client_assigned',
      'workspace_member',
      p_member_id,
      null,
      jsonb_build_object(
        'clientIds', v_added_client_ids,
        'clientCount', cardinality(v_added_client_ids)
      )
    );

    perform public.notify_workspace_team_user(
      p_workspace_id,
      v_member.user_id,
      'team_clients_assigned',
      'Clients assigned',
      cardinality(v_added_client_ids)::text || ' client' ||
        case when cardinality(v_added_client_ids) = 1 then '' else 's' end ||
        ' assigned to you.',
      '/workspace/' || p_workspace_id::text,
      'workspace_member',
      p_member_id,
      jsonb_build_object('clientCount', cardinality(v_added_client_ids))
    );
  end if;

  if cardinality(v_removed_client_ids) > 0 then
    perform public.record_workspace_team_audit_event(
      p_workspace_id,
      v_actor_user_id,
      'team.client_unassigned',
      'workspace_member',
      p_member_id,
      null,
      jsonb_build_object(
        'clientIds', v_removed_client_ids,
        'clientCount', cardinality(v_removed_client_ids)
      )
    );
  end if;

  return jsonb_build_object(
    'memberId', p_member_id,
    'workspaceId', p_workspace_id,
    'assignedClientCount', cardinality(v_client_ids)
  );
end;
$$;

create or replace function public.accept_workspace_team_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_token_hash text;
  v_invite public.workspace_member_invites%rowtype;
  v_membership public.workspace_members%rowtype;
  v_owner_user_id uuid;
  v_workspace_name text;
  v_assigned_count integer;
  v_recipient uuid;
begin
  if v_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if nullif(trim(coalesce(p_token, '')), '') is null then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  select lower(email), email_confirmed_at
  into v_user_email, v_email_confirmed_at
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if v_email_confirmed_at is null then
    perform public.workspace_team_invite_error('AUTHENTICATED_EMAIL_NOT_VERIFIED');
  end if;

  v_token_hash := public.hash_workspace_team_invite_token(p_token);

  select *
  into v_invite
  from public.workspace_member_invites wmi
  where wmi.token_hash = v_token_hash
  for update;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if v_invite.status = 'revoked' then
    perform public.record_workspace_team_audit_event(
      v_invite.workspace_id,
      v_user_id,
      'team.invite_revoked_access_attempt',
      'workspace_member_invite',
      v_invite.id,
      v_invite.email,
      '{}'::jsonb
    );
    perform public.workspace_team_invite_error('INVITE_REVOKED');
  end if;

  if v_invite.status <> 'pending' then
    perform public.workspace_team_invite_error('INVITE_NOT_PENDING');
  end if;

  if v_invite.expires_at <= now() then
    update public.workspace_member_invites
    set status = 'expired'
    where id = v_invite.id;

    perform public.record_workspace_team_audit_event(
      v_invite.workspace_id,
      v_user_id,
      'team.invite_expired_access_attempt',
      'workspace_member_invite',
      v_invite.id,
      v_invite.email,
      jsonb_build_object('expiresAt', v_invite.expires_at)
    );
    perform public.workspace_team_invite_error('INVITE_EXPIRED');
  end if;

  if lower(v_invite.email) <> v_user_email then
    if (
      select count(*)
      from public.workspace_audit_events wae
      where wae.workspace_id = v_invite.workspace_id
        and wae.actor_user_id = v_user_id
        and wae.event_type = 'team.invite_email_mismatch_attempt'
        and wae.target_id = v_invite.id
        and wae.created_at > now() - interval '10 minutes'
    ) >= 5 then
      perform public.workspace_team_operational_error('RATE_LIMITED');
    end if;

    perform public.record_workspace_team_audit_event(
      v_invite.workspace_id,
      v_user_id,
      'team.invite_email_mismatch_attempt',
      'workspace_member_invite',
      v_invite.id,
      v_invite.email,
      jsonb_build_object('authenticatedEmail', v_user_email)
    );

    perform public.workspace_team_invite_error('INVITE_EMAIL_MISMATCH');
  end if;

  if exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_invite.workspace_id
      and wm.user_id = v_user_id
      and wm.status = 'active'
  ) then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    client_access_mode,
    source_invite_id,
    invited_by_user_id,
    joined_at
  )
  values (
    v_invite.workspace_id,
    v_user_id,
    v_invite.role::public.workspace_role,
    'active',
    v_invite.client_access_mode,
    v_invite.id,
    v_invite.invited_by_user_id,
    now()
  )
  on conflict (workspace_id, user_id) do nothing
  returning * into v_membership;

  if v_membership.id is null then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  insert into public.workspace_member_client_assignments (
    workspace_id,
    member_id,
    client_id,
    assigned_by_user_id
  )
  select
    wica.workspace_id,
    v_membership.id,
    wica.client_id,
    wica.assigned_by_user_id
  from public.workspace_invite_client_assignments wica
  join public.clients c
    on c.id = wica.client_id
   and c.workspace_id = wica.workspace_id
  where wica.invite_id = v_invite.id
  on conflict (workspace_id, member_id, client_id) do nothing;

  get diagnostics v_assigned_count = row_count;

  update public.workspace_member_invites
  set status = 'accepted',
      accepted_by_user_id = v_user_id,
      accepted_at = now()
  where id = v_invite.id;

  select w.owner_user_id, w.name
  into v_owner_user_id, v_workspace_name
  from public.workspaces w
  where w.id = v_invite.workspace_id;

  perform public.record_workspace_team_audit_event(
    v_invite.workspace_id,
    v_user_id,
    'team.invite_accepted',
    'workspace_member',
    v_membership.id,
    v_invite.email,
    jsonb_build_object(
      'inviteId', v_invite.id,
      'role', v_invite.role,
      'clientAccessMode', v_invite.client_access_mode,
      'assignedClientCount', coalesce(v_assigned_count, 0)
    )
  );

  for v_recipient in
    select distinct recipient_id
    from (
      values (v_owner_user_id), (v_invite.invited_by_user_id)
    ) as recipients(recipient_id)
    where recipient_id is not null
      and recipient_id is distinct from v_user_id
  loop
    perform public.notify_workspace_team_user(
      v_invite.workspace_id,
      v_recipient,
      'team_invite_accepted',
      'Workspace invite accepted',
      v_invite.email || ' accepted access to ' || coalesce(v_workspace_name, 'your workspace') || '.',
      '/workspace/' || v_invite.workspace_id::text || '/settings/team',
      'workspace_member',
      v_membership.id,
      jsonb_build_object('role', v_invite.role)
    );
  end loop;

  return jsonb_build_object(
    'workspaceId', v_invite.workspace_id,
    'membershipId', v_membership.id,
    'relation', 'shared',
    'role', v_invite.role,
    'redirectTo', '/pt-hub/workspaces?acceptedWorkspace=' || v_invite.workspace_id::text
  );
end;
$$;

create or replace function public.resend_workspace_team_invite(
  p_workspace_id uuid,
  p_invite_id uuid,
  p_base_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_invite public.workspace_member_invites%rowtype;
  v_token text;
  v_token_hash text;
  v_base_url text := nullif(regexp_replace(trim(coalesce(p_base_url, '')), '/+$', ''), '');
  v_accept_url text;
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  select *
  into v_invite
  from public.workspace_member_invites wmi
  where wmi.id = p_invite_id
    and wmi.workspace_id = p_workspace_id
  for update;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if v_invite.status not in ('pending', 'expired') then
    perform public.workspace_team_invite_error('INVITE_NOT_PENDING');
  end if;

  if exists (
    select 1
    from public.workspace_team_email_deliveries wted
    where wted.invite_id = v_invite.id
      and wted.notification_type = 'team_invite_received'
      and wted.created_at > now() - interval '1 minute'
  ) then
    perform public.workspace_team_operational_error('RATE_LIMITED');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := public.hash_workspace_team_invite_token(v_token);

  update public.workspace_member_invites
  set token_hash = v_token_hash,
      status = 'pending',
      expires_at = now() + interval '14 days'
  where id = v_invite.id
  returning * into v_invite;

  v_accept_url := coalesce(v_base_url, '') || '/team-invites/' || v_token;

  perform public.queue_workspace_team_email(
    p_workspace_id,
    v_invite.id,
    v_invite.email,
    'team_invite_received',
    'workspace_team_invite',
    jsonb_build_object(
      'role', v_invite.role,
      'expiresAt', v_invite.expires_at,
      'mustUseEmail', v_invite.email
    ),
    'workspace-team-invite:' || v_invite.id::text || ':resend:' || extract(epoch from date_trunc('minute', now()))::text
  );

  perform public.record_workspace_team_audit_event(
    p_workspace_id,
    v_actor_user_id,
    'team.invite_resent',
    'workspace_member_invite',
    v_invite.id,
    v_invite.email,
    jsonb_build_object('expiresAt', v_invite.expires_at, 'emailQueued', true)
  );

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'workspaceId', p_workspace_id,
    'email', v_invite.email,
    'status', v_invite.status,
    'expiresAt', v_invite.expires_at,
    'acceptUrl', v_accept_url
  );
end;
$$;

create or replace function public.revoke_workspace_team_invite(
  p_workspace_id uuid,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_invite public.workspace_member_invites%rowtype;
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  select *
  into v_invite
  from public.workspace_member_invites wmi
  where wmi.id = p_invite_id
    and wmi.workspace_id = p_workspace_id
  for update;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if v_invite.status = 'revoked' then
    return jsonb_build_object(
      'inviteId', v_invite.id,
      'workspaceId', p_workspace_id,
      'status', v_invite.status
    );
  end if;

  if v_invite.status <> 'pending' then
    perform public.workspace_team_invite_error('INVITE_NOT_PENDING');
  end if;

  update public.workspace_member_invites
  set status = 'revoked'
  where id = v_invite.id
  returning * into v_invite;

  update public.workspace_team_email_deliveries
  set status = 'cancelled',
      updated_at = now()
  where invite_id = v_invite.id
    and status in ('queued', 'sending');

  perform public.record_workspace_team_audit_event(
    p_workspace_id,
    v_actor_user_id,
    'team.invite_revoked',
    'workspace_member_invite',
    v_invite.id,
    v_invite.email,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'workspaceId', p_workspace_id,
    'status', v_invite.status
  );
end;
$$;

create or replace function public.safe_workspace_team_metadata(p_metadata jsonb)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select coalesce(p_metadata, '{}'::jsonb)
    - 'token'
    - 'rawToken'
    - 'acceptUrl'
    - 'inviteUrl'
    - 'token_hash'
    - 'authToken'
    - 'sessionToken'
    - 'privateMessageBody'
    - 'paymentData'
$$;

create or replace function public.record_workspace_team_audit_event(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_target_email text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_event_id uuid;
begin
  insert into public.workspace_audit_events (
    workspace_id,
    actor_user_id,
    event_type,
    target_type,
    target_id,
    target_email,
    metadata
  )
  values (
    p_workspace_id,
    p_actor_user_id,
    p_event_type,
    p_target_type,
    p_target_id,
    lower(nullif(trim(coalesce(p_target_email, '')), '')),
    public.safe_workspace_team_metadata(p_metadata)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.queue_workspace_team_email(
  p_workspace_id uuid,
  p_invite_id uuid,
  p_recipient_email text,
  p_notification_type text,
  p_template_key text,
  p_template_model jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_delivery_id uuid;
begin
  insert into public.workspace_team_email_deliveries (
    workspace_id,
    invite_id,
    recipient_email,
    notification_type,
    template_key,
    template_model,
    idempotency_key
  )
  values (
    p_workspace_id,
    p_invite_id,
    lower(trim(coalesce(p_recipient_email, ''))),
    p_notification_type,
    p_template_key,
    public.safe_workspace_team_metadata(coalesce(p_template_model, '{}'::jsonb)),
    p_idempotency_key
  )
  on conflict (idempotency_key) do update
    set updated_at = public.workspace_team_email_deliveries.updated_at
  returning id into v_delivery_id;

  return v_delivery_id;
exception
  when others then
    perform public.record_workspace_team_audit_event(
      p_workspace_id,
      (select auth.uid()),
      'team.notification_failure',
      'workspace_member_invite',
      p_invite_id,
      p_recipient_email,
      jsonb_build_object(
        'notificationType', p_notification_type,
        'failureCode', sqlstate,
        'failureReason', sqlerrm
      )
    );
    return null;
end;
$$;

create or replace function public.notify_workspace_team_user(
  p_workspace_id uuid,
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_action_url text default null,
  p_entity_type text default 'workspace',
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_notification_id uuid;
begin
  if p_recipient_user_id is null then
    return null;
  end if;

  begin
    v_notification_id := public.notify_user(
      p_recipient_user_id,
      p_type,
      p_title,
      p_body,
      p_action_url,
      p_entity_type,
      p_entity_id,
      public.safe_workspace_team_metadata(
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('workspaceId', p_workspace_id)
      ),
      'normal',
      'team'
    );
  exception
    when others then
      perform public.record_workspace_team_audit_event(
        p_workspace_id,
        (select auth.uid()),
        'team.notification_failure',
        p_entity_type,
        p_entity_id,
        null,
        jsonb_build_object(
          'notificationType', p_type,
          'recipientUserId', p_recipient_user_id,
          'failureCode', sqlstate,
          'failureReason', sqlerrm
        )
      );
      return null;
  end;

  return v_notification_id;
end;
$$;

create or replace function public.create_workspace_team_invite(
  p_workspace_id uuid,
  p_email text,
  p_role text default 'assistant_coach',
  p_client_access_mode text default 'assigned_clients_only',
  p_client_ids uuid[] default '{}'::uuid[],
  p_base_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := trim(coalesce(p_role, ''));
  v_client_access_mode text := trim(coalesce(p_client_access_mode, ''));
  v_client_ids uuid[] := coalesce(p_client_ids, '{}'::uuid[]);
  v_distinct_client_ids uuid[];
  v_valid_client_count int;
  v_token text;
  v_token_hash text;
  v_invite public.workspace_member_invites%rowtype;
  v_workspace_name text;
  v_owner_name text;
  v_base_url text := nullif(regexp_replace(trim(coalesce(p_base_url, '')), '/+$', ''), '');
  v_accept_url text;
begin
  if v_actor_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  if (
    select count(*)
    from public.workspace_member_invites wmi
    where wmi.workspace_id = p_workspace_id
      and wmi.invited_by_user_id = v_actor_user_id
      and wmi.created_at > now() - interval '15 minutes'
  ) >= 20 then
    perform public.workspace_team_operational_error('RATE_LIMITED');
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    perform public.workspace_team_invite_error('INVALID_INVITE_EMAIL');
  end if;

  if v_role not in ('admin', 'coach', 'assistant_coach', 'viewer') then
    perform public.workspace_team_invite_error('INVALID_INVITE_ROLE');
  end if;

  if v_client_access_mode not in ('all_clients', 'assigned_clients_only') then
    perform public.workspace_team_invite_error('INVALID_CLIENT_ACCESS_MODE');
  end if;

  if exists (
    select 1
    from public.workspace_member_invites wmi
    where wmi.workspace_id = p_workspace_id
      and lower(wmi.email) = v_email
      and wmi.status = 'pending'
  ) then
    perform public.record_workspace_team_audit_event(
      p_workspace_id,
      v_actor_user_id,
      'team.duplicate_pending_invite_attempt',
      'workspace_member_invite',
      null,
      v_email,
      jsonb_build_object('role', v_role)
    );
    perform public.workspace_team_invite_error('DUPLICATE_PENDING_INVITE');
  end if;

  if exists (
    select 1
    from auth.users u
    join public.workspace_members wm
      on wm.user_id = u.id
    where wm.workspace_id = p_workspace_id
      and wm.status = 'active'
      and lower(u.email) = v_email
  ) then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  select coalesce(array_agg(distinct client_id), '{}'::uuid[])
  into v_distinct_client_ids
  from unnest(v_client_ids) as client_id
  where client_id is not null;

  if cardinality(v_distinct_client_ids) > 0 then
    select count(*)
    into v_valid_client_count
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.id = any(v_distinct_client_ids);

    if v_valid_client_count is distinct from cardinality(v_distinct_client_ids) then
      perform public.workspace_team_invite_error('INVALID_CLIENT_ASSIGNMENT');
    end if;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := public.hash_workspace_team_invite_token(v_token);

  insert into public.workspace_member_invites (
    workspace_id,
    email,
    role,
    client_access_mode,
    token_hash,
    status,
    invited_by_user_id,
    expires_at
  )
  values (
    p_workspace_id,
    v_email,
    v_role,
    v_client_access_mode,
    v_token_hash,
    'pending',
    v_actor_user_id,
    now() + interval '14 days'
  )
  returning * into v_invite;

  insert into public.workspace_invite_client_assignments (
    invite_id,
    workspace_id,
    client_id,
    assigned_by_user_id
  )
  select
    v_invite.id,
    p_workspace_id,
    client_id,
    v_actor_user_id
  from unnest(v_distinct_client_ids) as client_id
  on conflict (invite_id, client_id) do nothing;

  select w.name
  into v_workspace_name
  from public.workspaces w
  where w.id = p_workspace_id;

  select coalesce(pp.display_name, pp.full_name, u.email)
  into v_owner_name
  from auth.users u
  left join public.pt_profiles pp
    on pp.user_id = u.id
  where u.id = v_actor_user_id
  order by pp.updated_at desc nulls last
  limit 1;

  v_accept_url := coalesce(v_base_url, '') || '/team-invites/' || v_token;

  perform public.queue_workspace_team_email(
    p_workspace_id,
    v_invite.id,
    v_email,
    'team_invite_received',
    'workspace_team_invite',
    jsonb_build_object(
      'workspaceName', v_workspace_name,
      'ownerName', v_owner_name,
      'role', v_role,
      'expiresAt', v_invite.expires_at,
      'mustUseEmail', v_email
    ),
    'workspace-team-invite:' || v_invite.id::text || ':created'
  );

  perform public.record_workspace_team_audit_event(
    p_workspace_id,
    v_actor_user_id,
    'team.invite_created',
    'workspace_member_invite',
    v_invite.id,
    v_email,
    jsonb_build_object(
      'role', v_role,
      'clientAccessMode', v_client_access_mode,
      'clientIds', v_distinct_client_ids,
      'clientCount', cardinality(v_distinct_client_ids),
      'expiresAt', v_invite.expires_at,
      'emailQueued', true
    )
  );

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'workspaceId', p_workspace_id,
    'workspaceName', v_workspace_name,
    'invitedEmail', v_email,
    'role', v_role,
    'clientAccessMode', v_client_access_mode,
    'status', v_invite.status,
    'expiresAt', v_invite.expires_at,
    'acceptUrl', v_accept_url,
    'email', jsonb_build_object(
      'to', v_email,
      'subject', coalesce(v_owner_name, 'A coach') || ' invited you to join ' || coalesce(v_workspace_name, 'a RepSync workspace'),
      'text', concat_ws(E'\n\n',
        coalesce(v_owner_name, 'A coach') || ' invited you to join ' || coalesce(v_workspace_name, 'a RepSync workspace') || ' on RepSync as ' || v_role || '.',
        'Accept invite: ' || v_accept_url,
        'This invite expires on ' || v_invite.expires_at::text || '.',
        'You must sign in or create a RepSync account with ' || v_email || ' to accept.'
      )
    )
  );
end;
$$;

grant select on public.workspace_team_email_deliveries to authenticated;
grant all on public.workspace_team_email_deliveries to service_role;
grant execute on function public.workspace_team_operational_error(text) to authenticated, anon;
grant execute on function public.safe_workspace_team_metadata(jsonb) to authenticated, service_role;
grant execute on function public.record_workspace_team_audit_event(uuid, uuid, text, text, uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.queue_workspace_team_email(uuid, uuid, text, text, text, jsonb, text) to authenticated, service_role;
grant execute on function public.notify_workspace_team_user(uuid, uuid, text, text, text, text, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_workspace_team_invite(uuid, text, text, text, uuid[], text) to authenticated;
grant execute on function public.accept_workspace_team_invite(text) to authenticated;
grant execute on function public.resend_workspace_team_invite(uuid, uuid, text) to authenticated;
grant execute on function public.revoke_workspace_team_invite(uuid, uuid) to authenticated;
grant execute on function public.update_workspace_team_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.update_workspace_team_member_status(uuid, uuid, text) to authenticated;
grant execute on function public.update_workspace_team_member_clients(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.workspace_access_context(uuid) to authenticated;
