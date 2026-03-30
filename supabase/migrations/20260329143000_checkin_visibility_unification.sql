create or replace function public.normalize_workspace_client_onboarding_checkin_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.first_checkin_date is not null then
    new.first_checkin_date := public.normalize_checkin_due_date(
      new.first_checkin_date
    );
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_client_onboardings_normalize_checkin_date_trigger
  on public.workspace_client_onboardings;

create trigger workspace_client_onboardings_normalize_checkin_date_trigger
before insert or update of first_checkin_date
on public.workspace_client_onboardings
for each row
execute function public.normalize_workspace_client_onboarding_checkin_date();

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
    select id, workspace_id, user_id, status, display_name, created_at, tags, timezone
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
