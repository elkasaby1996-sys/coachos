-- Prevent newly joined or recently touched clients from being flagged inactive
-- solely because no workout/check-in/habit activity exists yet.

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
  with client_profile as (
    select
      c.created_at as joined_at,
      c.updated_at as profile_updated_at
    from public.clients c
    where c.id = p_client_id
  ),
  onboarding as (
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
    select
      greatest(
        coalesce((select last_session_at from session_activity), '-infinity'::timestamptz),
        coalesce((select last_checkin_at from checkin_activity), '-infinity'::timestamptz),
        coalesce((select last_client_reply_at from message_activity), '-infinity'::timestamptz),
        coalesce((select last_message_at from message_activity), '-infinity'::timestamptz),
        coalesce((select last_habit_at from habit_activity), '-infinity'::timestamptz),
        coalesce((select profile_updated_at from client_profile), '-infinity'::timestamptz),
        coalesce((select joined_at from client_profile), '-infinity'::timestamptz)
      ) as latest_activity_at,
      greatest(
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
        when nullif((select latest_activity_at from activity), '-infinity'::timestamptz)
          < now() - interval '14 days'
          then 'inactive_client'
        else null
      end
    ], null)::text[];
$$;
