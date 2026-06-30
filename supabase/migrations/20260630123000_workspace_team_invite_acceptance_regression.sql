create or replace function public.set_workspace_team_invite_notification_route(
  p_invite_id uuid,
  p_token text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_action_url text := '/team-invites/' || trim(coalesce(p_token, ''));
begin
  if p_invite_id is null or nullif(trim(coalesce(p_token, '')), '') is null then
    return;
  end if;

  update public.notification_events
  set
    title = 'You have a workspace invitation',
    body = 'Open this invitation to review it securely.',
    action_url = v_action_url,
    action_label = 'Open invitation',
    metadata = jsonb_build_object(
      'inviteId', p_invite_id,
      'action_url', v_action_url
    ),
    updated_at = now()
  where type = 'team_invite_received'
    and entity_type = 'workspace_member_invite'
    and entity_id = p_invite_id::text;
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
  on conflict (workspace_id, user_id) do update
  set role = excluded.role,
      status = 'active',
      client_access_mode = excluded.client_access_mode,
      source_invite_id = excluded.source_invite_id,
      invited_by_user_id = excluded.invited_by_user_id,
      joined_at = excluded.joined_at,
      updated_at = now()
  where workspace_members.status <> 'active'
  returning * into v_membership;

  if v_membership.id is null then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  delete from public.workspace_member_client_assignments wmca
  where wmca.workspace_id = v_invite.workspace_id
    and wmca.member_id = v_membership.id;

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

create or replace function public.accept_workspace_team_invite_by_id(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_email_confirmed_at timestamptz;
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

  select *
  into v_invite
  from public.workspace_member_invites wmi
  where wmi.id = p_invite_id
  for update;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if v_invite.status = 'revoked' then
    perform public.workspace_team_invite_error('INVITE_REVOKED');
  end if;

  if v_invite.status <> 'pending' then
    perform public.workspace_team_invite_error('INVITE_NOT_PENDING');
  end if;

  if v_invite.expires_at <= now() then
    update public.workspace_member_invites
    set status = 'expired'
    where id = v_invite.id;
    perform public.workspace_team_invite_error('INVITE_EXPIRED');
  end if;

  if lower(v_invite.email) <> v_user_email then
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
  on conflict (workspace_id, user_id) do update
  set role = excluded.role,
      status = 'active',
      client_access_mode = excluded.client_access_mode,
      source_invite_id = excluded.source_invite_id,
      invited_by_user_id = excluded.invited_by_user_id,
      joined_at = excluded.joined_at,
      updated_at = now()
  where workspace_members.status <> 'active'
  returning * into v_membership;

  if v_membership.id is null then
    perform public.workspace_team_invite_error('USER_ALREADY_WORKSPACE_MEMBER');
  end if;

  delete from public.workspace_member_client_assignments wmca
  where wmca.workspace_id = v_invite.workspace_id
    and wmca.member_id = v_membership.id;

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

  perform public.set_workspace_team_invite_notification_route(
    v_invite.id,
    v_token
  );

  perform public.queue_workspace_team_email(
    p_workspace_id,
    v_invite.id,
    v_invite.email,
    'team_invite_received',
    'workspace_team_invite',
    jsonb_build_object(
      'expiresAt', v_invite.expires_at,
      'mustUseEmail', v_invite.email
    ),
    'workspace-team-invite:' || v_invite.id::text || ':resent:' || extract(epoch from v_invite.updated_at)::text
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

  perform public.set_workspace_team_invite_notification_route(
    v_invite.id,
    v_token
  );

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

revoke all on function public.preview_workspace_team_invite(text) from public, anon;
grant execute on function public.preview_workspace_team_invite(text) to authenticated;
revoke all on function public.set_workspace_team_invite_notification_route(uuid, text) from public, anon, authenticated;
grant execute on function public.set_workspace_team_invite_notification_route(uuid, text) to service_role;
grant execute on function public.accept_workspace_team_invite(text) to authenticated;
grant execute on function public.accept_workspace_team_invite_by_id(uuid) to authenticated;
grant execute on function public.resend_workspace_team_invite(uuid, uuid, text) to authenticated;
grant execute on function public.create_workspace_team_invite(uuid, text, text, text, uuid[], text) to authenticated;
