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

  if p_workspace_id is null then
    raise exception 'Workspace is required';
  end if;

  if p_coach_id is distinct from v_user_id then
    raise exception 'Not authorized';
  end if;

  if not public.is_pt_workspace_member(p_workspace_id) then
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

  if not public.is_pt_workspace_member(p_workspace_id) then
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
