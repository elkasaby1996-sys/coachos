create or replace function public.workspace_team_settings_summary(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_payload jsonb;
begin
  if (select auth.uid()) is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  with member_rows as (
    select
      null::uuid as id,
      w.id as workspace_id,
      w.owner_user_id as user_id,
      'owner'::text as role,
      'active'::text as status,
      'all_clients'::text as client_access_mode,
      null::uuid as source_invite_id,
      null::uuid as invited_by_user_id,
      w.created_at as joined_at,
      w.created_at,
      w.updated_at,
      coalesce(pp.display_name, pp.full_name, u.email) as display_name,
      u.email as email,
      null::integer as assigned_client_count,
      null::uuid[] as assigned_client_ids
    from public.workspaces w
    left join auth.users u
      on u.id = w.owner_user_id
    left join public.pt_profiles pp
      on pp.user_id = w.owner_user_id
    where w.id = p_workspace_id

    union all

    select
      wm.id,
      wm.workspace_id,
      wm.user_id,
      public.normalize_workspace_role(wm.role::text) as role,
      coalesce(wm.status, 'active') as status,
      coalesce(wm.client_access_mode, 'all_clients') as client_access_mode,
      wm.source_invite_id,
      wm.invited_by_user_id,
      coalesce(wm.joined_at, wm.created_at) as joined_at,
      wm.created_at,
      wm.updated_at,
      coalesce(pp.display_name, pp.full_name, u.email, wm.user_id::text) as display_name,
      u.email as email,
      (
        select count(*)::integer
        from public.workspace_member_client_assignments wmca
        where wmca.workspace_id = wm.workspace_id
          and wmca.member_id = wm.id
      ) as assigned_client_count,
      (
        select coalesce(array_agg(wmca.client_id order by wmca.assigned_at), '{}'::uuid[])
        from public.workspace_member_client_assignments wmca
        where wmca.workspace_id = wm.workspace_id
          and wmca.member_id = wm.id
      ) as assigned_client_ids
    from public.workspace_members wm
    left join auth.users u
      on u.id = wm.user_id
    left join public.pt_profiles pp
      on pp.user_id = wm.user_id
    where wm.workspace_id = p_workspace_id
  ),
  invite_rows as (
    select
      wmi.id,
      wmi.workspace_id,
      wmi.email,
      wmi.role,
      wmi.client_access_mode,
      case
        when wmi.status = 'pending' and wmi.expires_at <= now() then 'expired'
        else wmi.status
      end as status,
      wmi.invited_by_user_id,
      wmi.accepted_by_user_id,
      wmi.accepted_at,
      wmi.expires_at,
      wmi.created_at,
      wmi.updated_at,
      (
        select count(*)::integer
        from public.workspace_invite_client_assignments wica
        where wica.invite_id = wmi.id
      ) as assigned_client_count,
      (
        select coalesce(array_agg(wica.client_id order by wica.created_at), '{}'::uuid[])
        from public.workspace_invite_client_assignments wica
        where wica.invite_id = wmi.id
      ) as assigned_client_ids
    from public.workspace_member_invites wmi
    where wmi.workspace_id = p_workspace_id
      and wmi.status <> 'accepted'
  )
  select jsonb_build_object(
    'members',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', mr.id,
            'workspaceId', mr.workspace_id,
            'userId', mr.user_id,
            'displayName', mr.display_name,
            'email', mr.email,
            'role', mr.role,
            'status', mr.status,
            'clientAccessMode', mr.client_access_mode,
            'sourceInviteId', mr.source_invite_id,
            'invitedByUserId', mr.invited_by_user_id,
            'joinedAt', mr.joined_at,
            'createdAt', mr.created_at,
            'updatedAt', mr.updated_at,
            'assignedClientCount', mr.assigned_client_count,
            'assignedClientIds', mr.assigned_client_ids
          )
          order by
            case mr.role when 'owner' then 0 when 'admin' then 1 else 2 end,
            mr.joined_at nulls last
        )
        from member_rows mr
      ),
      '[]'::jsonb
    ),
    'pendingInvites',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ir.id,
            'workspaceId', ir.workspace_id,
            'email', ir.email,
            'role', ir.role,
            'status', ir.status,
            'clientAccessMode', ir.client_access_mode,
            'invitedByUserId', ir.invited_by_user_id,
            'acceptedByUserId', ir.accepted_by_user_id,
            'acceptedAt', ir.accepted_at,
            'expiresAt', ir.expires_at,
            'createdAt', ir.created_at,
            'updatedAt', ir.updated_at,
            'assignedClientCount', ir.assigned_client_count,
            'assignedClientIds', ir.assigned_client_ids
          )
          order by ir.created_at desc
        )
        from invite_rows ir
      ),
      '[]'::jsonb
    )
  )
  into v_payload;

  return v_payload;
end;
$$;

create or replace function public.workspace_team_client_picker(
  p_workspace_id uuid,
  p_search text default null,
  p_limit int default 50
)
returns table (
  id uuid,
  display_name text,
  email text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if (select auth.uid()) is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if not public.can_manage_workspace_team(p_workspace_id) then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  return query
  select
    c.id,
    coalesce(c.display_name, c.full_name, c.email, 'Unnamed client')::text,
    c.email::text
  from public.clients c
  where c.workspace_id = p_workspace_id
    and (
      v_search is null
      or concat_ws(' ', c.display_name, c.full_name, c.email) ilike '%' || v_search || '%'
    )
  order by coalesce(c.display_name, c.full_name, c.email, c.id::text)
  limit greatest(coalesce(p_limit, 50), 1);
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

  update public.workspace_members
  set role = v_next_role::public.workspace_role,
      updated_at = now()
  where id = p_member_id
  returning * into v_member;

  insert into public.workspace_audit_events (
    workspace_id,
    actor_user_id,
    event_type,
    target_type,
    target_id,
    metadata
  )
  values (
    p_workspace_id,
    v_actor_user_id,
    'team.role_changed',
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

  update public.workspace_members
  set status = v_next_status,
      updated_at = now()
  where id = p_member_id
  returning * into v_member;

  insert into public.workspace_audit_events (
    workspace_id,
    actor_user_id,
    event_type,
    target_type,
    target_id,
    metadata
  )
  values (
    p_workspace_id,
    v_actor_user_id,
    case
      when v_next_status = 'suspended' then 'team.member_suspended'
      when v_next_status = 'removed' then 'team.member_removed'
      else 'team.member_reactivated'
    end,
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

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.id = p_member_id
      and wm.workspace_id = p_workspace_id
      and public.normalize_workspace_role(wm.role::text) <> 'owner'
  ) then
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
    insert into public.workspace_audit_events (
      workspace_id,
      actor_user_id,
      event_type,
      target_type,
      target_id,
      metadata
    )
    values (
      p_workspace_id,
      v_actor_user_id,
      'team.client_assigned',
      'workspace_member',
      p_member_id,
      jsonb_build_object('clientIds', v_added_client_ids)
    );
  end if;

  if cardinality(v_removed_client_ids) > 0 then
    insert into public.workspace_audit_events (
      workspace_id,
      actor_user_id,
      event_type,
      target_type,
      target_id,
      metadata
    )
    values (
      p_workspace_id,
      v_actor_user_id,
      'team.client_unassigned',
      'workspace_member',
      p_member_id,
      jsonb_build_object('clientIds', v_removed_client_ids)
    );
  end if;

  return jsonb_build_object(
    'memberId', p_member_id,
    'workspaceId', p_workspace_id,
    'assignedClientCount', cardinality(v_client_ids)
  );
end;
$$;

grant execute on function public.workspace_team_settings_summary(uuid) to authenticated;
grant execute on function public.workspace_team_client_picker(uuid, text, int) to authenticated;
grant execute on function public.update_workspace_team_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.update_workspace_team_member_status(uuid, uuid, text) to authenticated;
grant execute on function public.update_workspace_team_member_clients(uuid, uuid, uuid[]) to authenticated;
