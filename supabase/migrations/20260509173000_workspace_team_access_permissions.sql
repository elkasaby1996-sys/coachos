create or replace function public.normalize_workspace_role(p_role text)
returns text
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select case p_role
    when 'pt_owner' then 'owner'
    when 'pt_coach' then 'coach'
    else p_role
  end
$$;

create or replace function public.workspace_role_permissions(p_role text)
returns text[]
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select case public.normalize_workspace_role(p_role)
    when 'owner' then array[
      'workspace.view',
      'team.view',
      'team.manage',
      'clients.view',
      'clients.create',
      'clients.edit',
      'clients.lifecycle.update',
      'clients.message',
      'delivery.manage',
      'billing.manage',
      'workspace.danger.manage'
    ]::text[]
    when 'admin' then array[
      'workspace.view',
      'team.view',
      'team.manage',
      'clients.view',
      'clients.create',
      'clients.edit',
      'clients.lifecycle.update',
      'clients.message',
      'delivery.manage'
    ]::text[]
    when 'coach' then array[
      'workspace.view',
      'team.view',
      'clients.view',
      'clients.create',
      'clients.edit',
      'clients.lifecycle.update',
      'clients.message',
      'delivery.manage'
    ]::text[]
    when 'assistant_coach' then array[
      'workspace.view',
      'clients.view',
      'clients.edit',
      'clients.message'
    ]::text[]
    when 'viewer' then array[
      'workspace.view',
      'clients.view'
    ]::text[]
    else '{}'::text[]
  end
$$;

create or replace function public.has_workspace_permission(
  p_role text,
  p_member_status text,
  p_permission text
)
returns boolean
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select coalesce(p_member_status, 'removed') = 'active'
    and p_permission = any(public.workspace_role_permissions(p_role))
$$;

drop function if exists public.workspace_access_context(uuid);

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

create or replace function public.can_access_workspace(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, extensions
as $$
  select exists (
    select 1
    from public.workspace_access_context(p_workspace_id)
  )
$$;

create or replace function public.can_manage_workspace_team(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, extensions
as $$
  select exists (
    select 1
    from public.workspace_access_context(p_workspace_id) ctx
    where 'team.manage' = any(ctx.permissions)
  )
$$;

create or replace function public.is_pt_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, extensions
as $$
  select public.can_access_workspace(p_workspace_id)
$$;

create or replace function public.can_access_client(
  p_client_id uuid,
  p_permission text default 'clients.view'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_client record;
  v_context record;
begin
  if p_client_id is null then
    return false;
  end if;

  select c.id, c.workspace_id
  into v_client
  from public.clients c
  where c.id = p_client_id;

  if not found or v_client.workspace_id is null then
    return false;
  end if;

  select *
  into v_context
  from public.workspace_access_context(v_client.workspace_id)
  limit 1;

  if not found then
    return false;
  end if;

  if not public.has_workspace_permission(
    v_context.role,
    v_context.member_status,
    p_permission
  ) then
    return false;
  end if;

  if v_context.role in ('owner', 'admin') then
    return true;
  end if;

  if v_context.client_access_mode = 'all_clients' then
    return true;
  end if;

  if v_context.member_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.workspace_member_client_assignments wmca
    where wmca.workspace_id = v_client.workspace_id
      and wmca.member_id = v_context.member_id
      and wmca.client_id = v_client.id
  );
end;
$$;

create or replace function public.accessible_client_ids(p_workspace_id uuid)
returns table (client_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_context record;
begin
  select *
  into v_context
  from public.workspace_access_context(p_workspace_id)
  limit 1;

  if not found
    or not public.has_workspace_permission(
      v_context.role,
      v_context.member_status,
      'clients.view'
    )
  then
    return;
  end if;

  if v_context.role in ('owner', 'admin')
    or v_context.client_access_mode = 'all_clients'
  then
    return query
    select c.id
    from public.clients c
    where c.workspace_id = p_workspace_id;
    return;
  end if;

  return query
  select wmca.client_id
  from public.workspace_member_client_assignments wmca
  where wmca.workspace_id = p_workspace_id
    and wmca.member_id = v_context.member_id;
end;
$$;

create or replace function public.accessible_workspace_relations_for_user()
returns table (
  workspace_id uuid,
  workspace_name text,
  relation text,
  role text,
  member_status text,
  client_access_mode text,
  member_id uuid,
  owner_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return;
  end if;

  return query
  select
    w.id,
    w.name,
    'owned'::text,
    'owner'::text,
    'active'::text,
    'all_clients'::text,
    null::uuid,
    w.owner_user_id
  from public.workspaces w
  where w.owner_user_id = v_user_id

  union

  select
    w.id,
    w.name,
    'shared'::text,
    public.normalize_workspace_role(wm.role::text),
    wm.status,
    wm.client_access_mode,
    wm.id,
    w.owner_user_id
  from public.workspace_members wm
  join public.workspaces w
    on w.id = wm.workspace_id
  where wm.user_id = v_user_id
    and wm.status = 'active'
    and w.owner_user_id is distinct from v_user_id
    and public.has_workspace_permission(
      wm.role::text,
      wm.status,
      'workspace.view'
    );
end;
$$;

drop policy if exists clients_select_access on public.clients;
create policy clients_select_access
on public.clients
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_access_client(id, 'clients.view')
);

drop policy if exists clients_update_access on public.clients;
create policy clients_update_access
on public.clients
for update
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_access_client(id, 'clients.edit')
)
with check (
  user_id = (select auth.uid())
  or public.can_access_client(id, 'clients.edit')
);

create or replace function public.pt_clients_summary(
  p_workspace_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  workspace_id uuid,
  user_id uuid,
  status text,
  lifecycle_state text,
  manual_risk_flag boolean,
  lifecycle_changed_at timestamptz,
  paused_reason text,
  churn_reason text,
  display_name text,
  goal text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  onboarding_status text,
  onboarding_incomplete boolean,
  last_session_at timestamptz,
  last_checkin_at timestamptz,
  last_message_at timestamptz,
  last_client_reply_at timestamptz,
  last_activity_at timestamptz,
  overdue_checkins_count integer,
  has_overdue_checkin boolean,
  risk_flags text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
  v_client_ids uuid[];
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'Workspace is required';
  end if;

  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Not authorized';
  end if;

  perform public.ensure_workspace_checkins(
    p_workspace_id,
    current_date,
    current_date + 21
  );

  select coalesce(array_agg(aci.client_id), '{}'::uuid[])
  into v_client_ids
  from public.accessible_client_ids(p_workspace_id) aci;

  if cardinality(v_client_ids) > 0 then
    perform public.ensure_workspace_client_onboardings(
      p_workspace_id,
      v_client_ids
    );
  end if;

  return query
  select
    c.id,
    c.workspace_id,
    c.user_id,
    c.status::text,
    c.lifecycle_state,
    c.manual_risk_flag,
    c.lifecycle_changed_at,
    c.paused_reason,
    c.churn_reason,
    c.display_name,
    c.goal,
    c.tags,
    c.created_at,
    c.updated_at,
    ops.onboarding_status,
    ops.onboarding_incomplete,
    ops.last_session_at,
    ops.last_checkin_at,
    ops.last_message_at,
    ops.last_client_reply_at,
    ops.last_activity_at,
    ops.overdue_checkins_count,
    ops.has_overdue_checkin,
    coalesce(ops.risk_flags, '{}'::text[])
  from public.clients c
  join public.accessible_client_ids(p_workspace_id) aci
    on aci.client_id = c.id
  left join lateral public.client_operational_snapshot(c.id) ops on true
  where c.workspace_id = p_workspace_id
  order by c.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.pt_hub_clients_page(
  p_limit int default 25,
  p_offset int default 0,
  p_workspace_id uuid default null,
  p_search text default null,
  p_lifecycle text default null,
  p_segment text default null
)
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  user_id uuid,
  status text,
  lifecycle_state text,
  manual_risk_flag boolean,
  lifecycle_changed_at timestamptz,
  paused_reason text,
  churn_reason text,
  display_name text,
  goal text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  onboarding_status text,
  onboarding_incomplete boolean,
  last_session_at timestamptz,
  last_checkin_at timestamptz,
  last_message_at timestamptz,
  last_client_reply_at timestamptz,
  last_activity_at timestamptz,
  overdue_checkins_count integer,
  has_overdue_checkin boolean,
  risk_flags text[],
  total_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_lifecycle text := nullif(trim(coalesce(p_lifecycle, '')), '');
  v_segment text := nullif(trim(coalesce(p_segment, '')), '');
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_workspace_id is not null and not public.can_access_workspace(p_workspace_id) then
    raise exception 'Not authorized';
  end if;

  return query
  with accessible_workspaces as (
    select awr.workspace_id, awr.workspace_name
    from public.accessible_workspace_relations_for_user() awr
    where p_workspace_id is null
       or awr.workspace_id = p_workspace_id
  ),
  scoped_clients as (
    select
      c.id,
      c.workspace_id,
      aw.workspace_name,
      c.user_id,
      c.status::text as status,
      c.lifecycle_state,
      c.manual_risk_flag,
      c.lifecycle_changed_at,
      c.paused_reason,
      c.churn_reason,
      c.display_name,
      c.goal,
      c.tags,
      c.created_at,
      c.updated_at,
      ops.onboarding_status,
      ops.onboarding_incomplete,
      ops.last_session_at,
      ops.last_checkin_at,
      ops.last_message_at,
      ops.last_client_reply_at,
      ops.last_activity_at,
      ops.overdue_checkins_count,
      ops.has_overdue_checkin,
      coalesce(ops.risk_flags, '{}'::text[]) as risk_flags
    from accessible_workspaces aw
    join lateral public.accessible_client_ids(aw.workspace_id) aci
      on true
    join public.clients c
      on c.id = aci.client_id
    left join lateral public.client_operational_snapshot(c.id) ops
      on true
  ),
  filtered_clients as (
    select *
    from scoped_clients sc
    where (v_lifecycle is null or sc.lifecycle_state = v_lifecycle)
      and (
        v_segment is null
        or (
          v_segment = 'onboarding_incomplete'
          and coalesce(sc.onboarding_incomplete, false)
        )
        or (
          v_segment = 'checkin_overdue'
          and coalesce(sc.has_overdue_checkin, false)
        )
        or (
          v_segment = 'at_risk'
          and (
            sc.manual_risk_flag
            or coalesce(array_length(sc.risk_flags, 1), 0) > 0
          )
        )
        or (
          v_segment = 'paused'
          and sc.lifecycle_state = 'paused'
        )
      )
      and (
        v_search is null
        or concat_ws(
          ' ',
          coalesce(sc.display_name, ''),
          coalesce(sc.goal, ''),
          coalesce(sc.workspace_name, ''),
          coalesce(sc.lifecycle_state, ''),
          coalesce(sc.onboarding_status, ''),
          case when sc.manual_risk_flag then 'manual at risk' else '' end,
          array_to_string(coalesce(sc.risk_flags, '{}'::text[]), ' ')
        ) ilike '%' || v_search || '%'
      )
  )
  select
    fc.id,
    fc.workspace_id,
    fc.workspace_name,
    fc.user_id,
    fc.status,
    fc.lifecycle_state,
    fc.manual_risk_flag,
    fc.lifecycle_changed_at,
    fc.paused_reason,
    fc.churn_reason,
    fc.display_name,
    fc.goal,
    fc.tags,
    fc.created_at,
    fc.updated_at,
    fc.onboarding_status,
    fc.onboarding_incomplete,
    fc.last_session_at,
    fc.last_checkin_at,
    fc.last_message_at,
    fc.last_client_reply_at,
    fc.last_activity_at,
    fc.overdue_checkins_count,
    fc.has_overdue_checkin,
    fc.risk_flags,
    count(*) over ()::integer as total_count
  from filtered_clients fc
  order by fc.created_at desc nulls last, fc.id desc
  limit greatest(coalesce(p_limit, 25), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.pt_hub_client_stats()
returns table (
  total_clients integer,
  active_clients integer,
  paused_clients integer,
  at_risk_clients integer,
  onboarding_incomplete_clients integer,
  overdue_checkin_clients integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with accessible_workspaces as (
    select awr.workspace_id
    from public.accessible_workspace_relations_for_user() awr
  )
  select
    count(*)::integer as total_clients,
    count(*) filter (
      where c.lifecycle_state = 'active'
    )::integer as active_clients,
    count(*) filter (
      where c.lifecycle_state = 'paused'
    )::integer as paused_clients,
    count(*) filter (
      where c.manual_risk_flag
         or coalesce(array_length(ops.risk_flags, 1), 0) > 0
    )::integer as at_risk_clients,
    count(*) filter (
      where coalesce(ops.onboarding_incomplete, false)
    )::integer as onboarding_incomplete_clients,
    count(*) filter (
      where coalesce(ops.has_overdue_checkin, false)
    )::integer as overdue_checkin_clients
  from accessible_workspaces aw
  join lateral public.accessible_client_ids(aw.workspace_id) aci
    on true
  join public.clients c
    on c.id = aci.client_id
  left join lateral public.client_operational_snapshot(c.id) ops
    on true;
end;
$$;

create or replace function public.pt_dashboard_summary(
  p_workspace_id uuid,
  p_coach_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
  v_today date := current_date;
  v_start_week date := v_today - 6;
  v_end_week date := v_today + 6;
  v_last_saturday date := v_today - ((extract(dow from v_today)::int - 6 + 7) % 7);
  v_client_ids uuid[];
  v_clients jsonb;
  v_checkins jsonb;
  v_assigned jsonb;
  v_messages jsonb;
  v_unread int;
  v_todos jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_coach_id is distinct from v_user_id then
    raise exception 'Not authorized';
  end if;

  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Not authorized';
  end if;

  perform public.ensure_workspace_checkins(
    p_workspace_id,
    v_today,
    v_end_week
  );

  select coalesce(array_agg(aci.client_id), '{}'::uuid[])
  into v_client_ids
  from public.accessible_client_ids(p_workspace_id) aci;

  select jsonb_agg(c) into v_clients
  from (
    select id, workspace_id, user_id, status, display_name, created_at, tags, timezone
    from public.clients
    where id = any(v_client_ids)
    order by created_at desc
  ) c;

  select jsonb_agg(a) into v_assigned
  from (
    select id, client_id, status, scheduled_date
    from public.assigned_workouts
    where client_id = any(v_client_ids)
      and scheduled_date between v_start_week and v_today
  ) a;

  select jsonb_agg(ci) into v_checkins
  from (
    select id, client_id, week_ending_saturday, submitted_at, created_at
    from public.checkins
    where client_id = any(v_client_ids)
      and week_ending_saturday between v_start_week and v_end_week
  ) ci;

  select jsonb_agg(m) into v_messages
  from (
    select
      conv.id,
      conv.last_message_at as created_at,
      conv.last_message_sender_name as sender_name,
      conv.last_message_preview as preview
    from public.conversations conv
    where conv.workspace_id = p_workspace_id
      and (
        conv.client_id is null
        or conv.client_id = any(v_client_ids)
      )
    order by conv.last_message_at desc nulls last
    limit 5
  ) m;

  select count(*) into v_unread
  from public.messages m
  join public.conversations conv on conv.id = m.conversation_id
  where m.unread = true
    and conv.workspace_id = p_workspace_id
    and (
      conv.client_id is null
      or conv.client_id = any(v_client_ids)
    );

  select jsonb_agg(t) into v_todos
  from (
    select id, title, is_done, created_at
    from public.coach_todos
    where workspace_id = p_workspace_id
      and coach_id = p_coach_id
    order by created_at asc
  ) t;

  return jsonb_build_object(
    'clients', coalesce(v_clients, '[]'::jsonb),
    'assignedWorkouts', coalesce(v_assigned, '[]'::jsonb),
    'checkins', coalesce(v_checkins, '[]'::jsonb),
    'messages', coalesce(v_messages, '[]'::jsonb),
    'unreadCount', coalesce(v_unread, 0),
    'coachTodos', coalesce(v_todos, '[]'::jsonb),
    'today', v_today::text,
    'lastSaturday', v_last_saturday::text
  );
end;
$$;

grant execute on function public.normalize_workspace_role(text) to authenticated;
grant execute on function public.workspace_role_permissions(text) to authenticated;
grant execute on function public.has_workspace_permission(text, text, text) to authenticated;
grant execute on function public.workspace_access_context(uuid) to authenticated;
grant execute on function public.can_access_workspace(uuid) to authenticated;
grant execute on function public.can_manage_workspace_team(uuid) to authenticated;
grant execute on function public.can_access_client(uuid, text) to authenticated;
grant execute on function public.accessible_client_ids(uuid) to authenticated;
grant execute on function public.accessible_workspace_relations_for_user() to authenticated;
grant execute on function public.pt_clients_summary(uuid, integer, integer) to authenticated;
grant execute on function public.pt_hub_clients_page(integer, integer, uuid, text, text, text) to authenticated;
grant execute on function public.pt_hub_client_stats() to authenticated;
grant execute on function public.pt_dashboard_summary(uuid, uuid) to authenticated;
