alter table public.workspace_member_invites
  drop constraint if exists workspace_member_invites_status_check;

alter table public.workspace_member_invites
  add constraint workspace_member_invites_status_check
  check (status in ('pending', 'accepted', 'expired', 'revoked', 'declined'));

create or replace function public.queue_workspace_team_invite_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_recipient_user_id uuid;
  v_workspace_name text;
  v_inviter_name text;
  v_action_url text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.token_hash is not distinct from new.token_hash
    and old.expires_at is not distinct from new.expires_at then
    return new;
  end if;

  select u.id
    into v_recipient_user_id
    from auth.users u
   where lower(u.email) = lower(new.email)
   limit 1;

  if v_recipient_user_id is null then
    return new;
  end if;

  select w.name
    into v_workspace_name
    from public.workspaces w
   where w.id = new.workspace_id;

  select coalesce(pp.display_name, pp.full_name, u.email, 'A coach')
    into v_inviter_name
    from auth.users u
    left join public.pt_profiles pp
      on pp.user_id = u.id
   where u.id = new.invited_by_user_id
   order by pp.updated_at desc nulls last
   limit 1;

  v_action_url := '/pt-hub/notifications?teamInvite=' || new.id::text;

  insert into public.notification_events (
    recipient_user_id,
    actor_type,
    type,
    notification_class,
    category,
    priority,
    title,
    body,
    action_url,
    action_label,
    entity_type,
    entity_id,
    metadata,
    transactional,
    idempotency_key
  )
  values (
    v_recipient_user_id,
    'pt',
    'team_invite_received',
    'transactional',
    'team',
    'high',
    'Workspace team invite',
    coalesce(v_inviter_name, 'A coach') || ' invited you to join ' ||
      coalesce(v_workspace_name, 'a RepSync workspace') || '.',
    v_action_url,
    'Review invite',
    'workspace_member_invite',
    new.id::text,
    jsonb_build_object(
      'workspaceId', new.workspace_id,
      'workspaceName', v_workspace_name,
      'inviteId', new.id,
      'role', new.role,
      'expiresAt', new.expires_at,
      'recipient_name', split_part(new.email, '@', 1),
      'action_url', v_action_url
    ),
    true,
    'workspace_team_invite:' || new.id::text || ':' ||
      case when tg_op = 'UPDATE' then 'resent' else 'created' end
  )
  on conflict (idempotency_key) do update
    set updated_at = public.notification_events.updated_at;

  return new;
end;
$$;

drop trigger if exists queue_workspace_team_invite_notification_trigger
  on public.workspace_member_invites;

create trigger queue_workspace_team_invite_notification_trigger
after insert or update of token_hash, expires_at, status
on public.workspace_member_invites
for each row
execute function public.queue_workspace_team_invite_notification();

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

create or replace function public.decline_workspace_team_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_invite public.workspace_member_invites%rowtype;
begin
  if v_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  select lower(email)
    into v_user_email
    from auth.users
   where id = v_user_id;

  select *
    into v_invite
    from public.workspace_member_invites wmi
   where wmi.id = p_invite_id
   for update;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if lower(v_invite.email) <> v_user_email then
    perform public.workspace_team_invite_error('INVITE_EMAIL_MISMATCH');
  end if;

  if v_invite.status <> 'pending' then
    perform public.workspace_team_invite_error('INVITE_NOT_PENDING');
  end if;

  update public.workspace_member_invites
     set status = 'declined'
   where id = v_invite.id
   returning * into v_invite;

  update public.workspace_team_email_deliveries
     set status = 'cancelled',
         updated_at = now()
   where invite_id = v_invite.id
     and status in ('queued', 'sending');

  update public.notification_deliveries nd
     set read_at = coalesce(read_at, now()),
         archived_at = coalesce(archived_at, now()),
         updated_at = now()
    from public.notification_events ne
   where nd.event_id = ne.id
     and nd.recipient_user_id = v_user_id
     and ne.entity_type = 'workspace_member_invite'
     and ne.entity_id = v_invite.id::text
     and ne.type = 'team_invite_received'
     and nd.channel = 'in_app';

  perform public.record_workspace_team_audit_event(
    v_invite.workspace_id,
    v_user_id,
    'team.invite_declined',
    'workspace_member_invite',
    v_invite.id,
    v_invite.email,
    '{}'::jsonb
  );

  perform public.notify_workspace_team_user(
    v_invite.workspace_id,
    v_invite.invited_by_user_id,
    'team_invite_declined',
    'Workspace invite declined',
    v_invite.email || ' declined the workspace invite.',
    '/workspace/' || v_invite.workspace_id::text || '/settings/team',
    'workspace_member_invite',
    v_invite.id,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'workspaceId', v_invite.workspace_id,
    'status', v_invite.status
  );
end;
$$;

grant execute on function public.queue_workspace_team_invite_notification() to service_role;
grant execute on function public.accept_workspace_team_invite_by_id(uuid) to authenticated;
grant execute on function public.decline_workspace_team_invite(uuid) to authenticated;
