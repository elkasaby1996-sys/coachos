alter table public.clients
  add column if not exists lifecycle_state text,
  add column if not exists lifecycle_changed_at timestamptz,
  add column if not exists paused_reason text,
  add column if not exists churn_reason text;

alter table public.clients
  alter column lifecycle_state set default 'active',
  alter column lifecycle_changed_at set default now();

update public.clients
set lifecycle_state = case
    when status::text = 'paused' then 'paused'
    when status::text = 'completed' then 'completed'
    else 'active'
  end,
  lifecycle_changed_at = coalesce(updated_at, created_at, now())
where lifecycle_state is null;

update public.clients c
set lifecycle_state = case
    when o.status = 'invited' then 'invited'
    when o.status in ('in_progress', 'submitted', 'review_needed', 'partially_activated') then 'onboarding'
    when o.status = 'completed' then 'active'
    else c.lifecycle_state
  end,
  lifecycle_changed_at = coalesce(c.lifecycle_changed_at, c.updated_at, c.created_at, now())
from (
  select distinct on (client_id)
    client_id,
    status::text as status
  from public.workspace_client_onboardings
  order by client_id, updated_at desc nulls last, created_at desc
) o
where c.id = o.client_id
  and c.lifecycle_state in ('active', 'invited', 'onboarding');

alter table public.clients
  alter column lifecycle_state set not null,
  alter column lifecycle_changed_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_lifecycle_state_check'
  ) then
    alter table public.clients
      add constraint clients_lifecycle_state_check
      check (
        lifecycle_state in (
          'invited',
          'onboarding',
          'active',
          'paused',
          'at_risk',
          'completed',
          'churned'
        )
      );
  end if;
end;
$$;

create index if not exists clients_workspace_lifecycle_state_idx
  on public.clients (workspace_id, lifecycle_state);

create table if not exists public.client_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  previous_state text,
  new_state text not null,
  reason text,
  changed_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint client_lifecycle_events_previous_state_check check (
    previous_state is null
    or previous_state in (
      'invited',
      'onboarding',
      'active',
      'paused',
      'at_risk',
      'completed',
      'churned'
    )
  ),
  constraint client_lifecycle_events_new_state_check check (
    new_state in (
      'invited',
      'onboarding',
      'active',
      'paused',
      'at_risk',
      'completed',
      'churned'
    )
  )
);

create index if not exists client_lifecycle_events_client_created_idx
  on public.client_lifecycle_events (client_id, created_at desc);

alter table public.client_lifecycle_events enable row level security;
alter table public.client_lifecycle_events force row level security;

drop policy if exists client_lifecycle_events_select_access on public.client_lifecycle_events;
create policy client_lifecycle_events_select_access
  on public.client_lifecycle_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.clients c
      left join public.workspace_members wm
        on wm.workspace_id = c.workspace_id
       and wm.user_id = auth.uid()
      where c.id = client_lifecycle_events.client_id
        and (
          c.user_id = auth.uid()
          or wm.role::text like 'pt_%'
        )
    )
  );

create or replace function public.normalize_client_lifecycle_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.lifecycle_state is null or trim(new.lifecycle_state) = '' then
    new.lifecycle_state := coalesce(old.lifecycle_state, 'active');
  else
    new.lifecycle_state := trim(new.lifecycle_state);
  end if;

  if tg_op = 'UPDATE'
     and new.lifecycle_state is not distinct from old.lifecycle_state
     and new.status is distinct from old.status then
    new.lifecycle_state := case new.status::text
      when 'paused' then 'paused'
      when 'completed' then 'completed'
      else 'active'
    end;
  end if;

  new.paused_reason := nullif(trim(coalesce(new.paused_reason, '')), '');
  new.churn_reason := nullif(trim(coalesce(new.churn_reason, '')), '');

  if new.lifecycle_state = 'paused' and new.paused_reason is null then
    raise exception 'Pause reason is required';
  end if;

  if new.lifecycle_state = 'churned' and new.churn_reason is null then
    raise exception 'Churn reason is required';
  end if;

  if new.lifecycle_state <> 'paused' then
    new.paused_reason := null;
  end if;

  if new.lifecycle_state <> 'churned' then
    new.churn_reason := null;
  end if;

  if tg_op = 'INSERT'
     or new.lifecycle_state is distinct from old.lifecycle_state then
    new.lifecycle_changed_at := now();
  elsif new.lifecycle_changed_at is null then
    new.lifecycle_changed_at := coalesce(old.lifecycle_changed_at, now());
  end if;

  new.status := case new.lifecycle_state
    when 'paused' then 'paused'::public.client_status
    when 'completed' then 'completed'::public.client_status
    when 'churned' then 'completed'::public.client_status
    else 'active'::public.client_status
  end;

  return new;
end;
$$;

create or replace function public.log_client_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.client_lifecycle_events (
    client_id,
    workspace_id,
    previous_state,
    new_state,
    reason,
    changed_by_user_id
  )
  values (
    new.id,
    new.workspace_id,
    old.lifecycle_state,
    new.lifecycle_state,
    case new.lifecycle_state
      when 'paused' then new.paused_reason
      when 'churned' then new.churn_reason
      else null
    end,
    auth.uid()
  );

  return new;
end;
$$;

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
    and (
      c.lifecycle_state in ('invited', 'onboarding', 'active')
      or (
        c.lifecycle_state = 'at_risk'
        and v_target_state in ('invited', 'onboarding')
      )
    )
    and c.lifecycle_state is distinct from v_target_state;

  return new;
end;
$$;

drop trigger if exists clients_normalize_lifecycle_transition_trigger on public.clients;
create trigger clients_normalize_lifecycle_transition_trigger
before insert or update on public.clients
for each row
execute function public.normalize_client_lifecycle_transition();

drop trigger if exists clients_log_lifecycle_event_trigger on public.clients;
create trigger clients_log_lifecycle_event_trigger
after update of lifecycle_state on public.clients
for each row
when (old.lifecycle_state is distinct from new.lifecycle_state)
execute function public.log_client_lifecycle_event();

drop trigger if exists workspace_client_onboardings_sync_lifecycle_trigger on public.workspace_client_onboardings;
create trigger workspace_client_onboardings_sync_lifecycle_trigger
after insert or update of status on public.workspace_client_onboardings
for each row
execute function public.sync_client_lifecycle_from_onboarding();

create or replace function public.client_operational_snapshot(
  p_client_id uuid
)
returns table(
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
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  with onboarding as (
    select wco.status::text as onboarding_status
    from public.workspace_client_onboardings wco
    where wco.client_id = p_client_id
    order by wco.updated_at desc nulls last, wco.created_at desc
    limit 1
  ),
  session_activity as (
    select max(coalesce(ws.completed_at, ws.started_at, ws.created_at)) as last_session_at
    from public.workout_sessions ws
    where ws.client_id = p_client_id
  ),
  checkin_activity as (
    select max(ci.submitted_at) as last_checkin_at
    from public.checkins ci
    where ci.client_id = p_client_id
      and ci.submitted_at is not null
  ),
  message_activity as (
    select
      max(conv.last_message_at) as last_message_at,
      max(m.created_at) as last_client_reply_at
    from public.conversations conv
    left join public.messages m
      on m.conversation_id = conv.id
     and m.sender_role = 'client'
    where conv.client_id = p_client_id
  ),
  habit_activity as (
    select max(coalesce(hl.updated_at, hl.created_at)) as last_habit_at
    from public.habit_logs hl
    where hl.client_id = p_client_id
  ),
  overdue_checkins as (
    select count(*)::integer as overdue_checkins_count
    from public.checkins ci
    where ci.client_id = p_client_id
      and ci.submitted_at is null
      and ci.week_ending_saturday < current_date
  ),
  adherence as (
    select
      count(*)::integer as due_workouts_count,
      count(*) filter (where aw.status = 'completed')::integer as completed_workouts_count
    from public.assigned_workouts aw
    where aw.client_id = p_client_id
      and aw.scheduled_date between current_date - 20 and current_date
      and aw.scheduled_date <= current_date
  ),
  activity as (
    select greatest(
      coalesce((select last_session_at from session_activity), '-infinity'::timestamptz),
      coalesce((select last_checkin_at from checkin_activity), '-infinity'::timestamptz),
      coalesce((select last_client_reply_at from message_activity), '-infinity'::timestamptz),
      coalesce((select last_habit_at from habit_activity), '-infinity'::timestamptz)
    ) as raw_last_activity_at
  )
  select
    (select onboarding_status from onboarding),
    coalesce((select onboarding_status from onboarding) is not null and (select onboarding_status from onboarding) <> 'completed', false),
    (select last_session_at from session_activity),
    (select last_checkin_at from checkin_activity),
    (select last_message_at from message_activity),
    (select last_client_reply_at from message_activity),
    nullif((select raw_last_activity_at from activity), '-infinity'::timestamptz),
    coalesce((select overdue_checkins_count from overdue_checkins), 0),
    coalesce((select overdue_checkins_count from overdue_checkins), 0) > 0,
    array_remove(array[
      case
        when coalesce((select overdue_checkins_count from overdue_checkins), 0) > 0
          then 'missed_checkins'
        else null
      end,
      case
        when exists (
          select 1
          from public.conversations conv
          where conv.client_id = p_client_id
            and conv.last_message_sender_role = 'pt'
            and conv.last_message_at <= now() - interval '5 days'
        )
          then 'no_recent_reply'
        else null
      end,
      case
        when coalesce((select due_workouts_count from adherence), 0) >= 3
         and (
           coalesce((select completed_workouts_count from adherence), 0)::numeric
           / greatest(coalesce((select due_workouts_count from adherence), 0), 1)
         ) < 0.5
          then 'low_adherence_trend'
        else null
      end,
      case
        when coalesce((select raw_last_activity_at from activity), '-infinity'::timestamptz)
          < now() - interval '14 days'
          then 'inactive_client'
        else null
      end
    ], null)::text[];
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

create or replace function public.pt_update_client_lifecycle(
  p_client_id uuid,
  p_lifecycle_state text,
  p_reason text default null
)
returns table(
  id uuid,
  status text,
  lifecycle_state text,
  lifecycle_changed_at timestamptz,
  paused_reason text,
  churn_reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
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
    lifecycle_state = trim(coalesce(p_lifecycle_state, '')),
    paused_reason = case when trim(coalesce(p_lifecycle_state, '')) = 'paused' then v_reason else null end,
    churn_reason = case when trim(coalesce(p_lifecycle_state, '')) = 'churned' then v_reason else null end,
    updated_at = now()
  where c.id = p_client_id
  returning
    c.id,
    c.status::text,
    c.lifecycle_state,
    c.lifecycle_changed_at,
    c.paused_reason,
    c.churn_reason;
end;
$$;

revoke all on function public.client_operational_snapshot(uuid) from public;
grant execute on function public.pt_clients_summary(uuid, integer, integer) to authenticated;
grant execute on function public.pt_update_client_lifecycle(uuid, text, text) to authenticated;
