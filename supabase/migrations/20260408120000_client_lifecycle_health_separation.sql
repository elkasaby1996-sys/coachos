alter table public.clients
  add column if not exists manual_risk_flag boolean not null default false;

update public.clients
set manual_risk_flag = true
where lifecycle_state = 'at_risk'
  and manual_risk_flag = false;

update public.clients
set lifecycle_state = 'active'
where lifecycle_state = 'at_risk';

alter table public.clients
  drop constraint if exists clients_lifecycle_state_check;

alter table public.clients
  add constraint clients_lifecycle_state_check
  check (
    lifecycle_state in (
      'invited',
      'onboarding',
      'active',
      'paused',
      'completed',
      'churned'
    )
  );

create or replace function public.sync_client_lifecycle_from_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_state text;
begin
  v_target_state := case new.status::text
    when 'invited' then 'invited'
    when 'in_progress' then 'onboarding'
    when 'submitted' then 'onboarding'
    when 'review_needed' then 'onboarding'
    when 'partially_activated' then 'onboarding'
    when 'completed' then 'active'
    else null
  end;

  if v_target_state is null then
    return new;
  end if;

  update public.clients c
  set lifecycle_state = v_target_state
  where c.id = new.client_id
    and c.lifecycle_state in ('invited', 'onboarding', 'active')
    and c.lifecycle_state is distinct from v_target_state;

  return new;
end;
$$;

drop function if exists public.pt_clients_summary(uuid, integer, integer);

create or replace function public.pt_clients_summary(
  p_workspace_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
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

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'Not authorized';
  end if;

  perform public.ensure_workspace_checkins(
    p_workspace_id,
    current_date,
    current_date + 21
  );

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into v_client_ids
  from public.clients c
  where c.workspace_id = p_workspace_id;

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
  left join lateral public.client_operational_snapshot(c.id) ops on true
  where c.workspace_id = p_workspace_id
  order by c.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.pt_set_client_manual_risk(
  p_client_id uuid,
  p_manual_risk_flag boolean default true
)
returns table(
  id uuid,
  manual_risk_flag boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  update public.clients c
  set
    manual_risk_flag = coalesce(p_manual_risk_flag, false),
    updated_at = now()
  where c.id = p_client_id
  returning
    c.id,
    c.manual_risk_flag,
    c.updated_at;
end;
$$;

drop function if exists public.pt_hub_client_stats();

create or replace function public.pt_hub_client_stats()
returns table(
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
  from public.clients c
  join public.workspaces w
    on w.id = c.workspace_id
  left join lateral public.client_operational_snapshot(c.id) ops
    on true
  where w.owner_user_id = v_user_id;
end;
$$;

drop function if exists public.pt_hub_clients_page(integer, integer, uuid, text, text, text);

create or replace function public.pt_hub_clients_page(
  p_limit integer default 25,
  p_offset integer default 0,
  p_workspace_id uuid default null,
  p_search text default null,
  p_lifecycle text default null,
  p_segment text default null
)
returns table(
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

  return query
  with scoped_clients as (
    select
      c.id,
      c.workspace_id,
      w.name as workspace_name,
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
    from public.clients c
    join public.workspaces w
      on w.id = c.workspace_id
    left join lateral public.client_operational_snapshot(c.id) ops
      on true
    where w.owner_user_id = v_user_id
      and (p_workspace_id is null or c.workspace_id = p_workspace_id)
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

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'Not authorized';
  end if;

  perform public.ensure_workspace_checkins(
    p_workspace_id,
    v_today,
    v_end_week
  );

  select array_agg(id) into v_client_ids
  from public.clients
  where workspace_id = p_workspace_id;

  select jsonb_agg(c) into v_clients
  from (
    select
      id,
      workspace_id,
      user_id,
      status,
      lifecycle_state,
      manual_risk_flag,
      display_name,
      created_at,
      tags,
      timezone
    from public.clients
    where workspace_id = p_workspace_id
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
    select
      id,
      client_id,
      week_ending_saturday,
      submitted_at,
      reviewed_at,
      created_at
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
    order by conv.last_message_at desc nulls last
    limit 5
  ) m;

  select count(*) into v_unread
  from public.messages m
  join public.conversations conv on conv.id = m.conversation_id
  join public.clients c on c.id = conv.client_id
  where m.unread = true
    and c.workspace_id = p_workspace_id;

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

revoke all on function public.pt_clients_summary(uuid, integer, integer) from public;
grant execute on function public.pt_clients_summary(uuid, integer, integer) to authenticated;

revoke all on function public.pt_hub_client_stats() from public;
grant execute on function public.pt_hub_client_stats() to authenticated;

revoke all on function public.pt_hub_clients_page(integer, integer, uuid, text, text, text) from public;
grant execute on function public.pt_hub_clients_page(integer, integer, uuid, text, text, text) to authenticated;

grant execute on function public.pt_set_client_manual_risk(uuid, boolean) to authenticated;
