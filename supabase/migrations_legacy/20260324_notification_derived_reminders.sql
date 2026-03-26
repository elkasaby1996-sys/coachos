create or replace function public.sync_notification_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_inserted integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  with pt_workspaces as (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  ),
  birthday_candidates as (
    select
      c.id as client_id,
      coalesce(nullif(trim(c.display_name), ''), 'Client') as client_name,
      case
        when to_char(c.dob, 'MM-DD') = to_char(current_date, 'MM-DD')
          then 'today'
        when to_char(c.dob, 'MM-DD') = to_char(current_date + 1, 'MM-DD')
          then 'tomorrow'
        else null
      end as reminder_kind
    from public.clients c
    where c.workspace_id in (select workspace_id from pt_workspaces)
      and c.status = 'active'
      and c.dob is not null
      and to_char(c.dob, 'MM-DD') in (
        to_char(current_date, 'MM-DD'),
        to_char(current_date + 1, 'MM-DD')
      )
  ),
  inserted_birthdays as (
    insert into public.notifications (
      recipient_user_id,
      type,
      category,
      priority,
      title,
      body,
      action_url,
      entity_type,
      entity_id,
      metadata
    )
    select
      v_user_id,
      'birthday_reminder',
      'general',
      'normal',
      case
        when candidate.reminder_kind = 'today' then 'Birthday today'
        else 'Birthday tomorrow'
      end,
      case
        when candidate.reminder_kind = 'today'
          then format('%s has a birthday today.', candidate.client_name)
        else format('%s has a birthday tomorrow.', candidate.client_name)
      end,
      format('/pt/clients/%s?tab=overview', candidate.client_id),
      'client',
      candidate.client_id,
      jsonb_build_object(
        'reminder_kind',
        candidate.reminder_kind,
        'reminder_date',
        current_date::text
      )
    from birthday_candidates candidate
    where candidate.reminder_kind is not null
      and not exists (
        select 1
        from public.notifications n
        where n.recipient_user_id = v_user_id
          and n.type = 'birthday_reminder'
          and n.entity_type = 'client'
          and n.entity_id = candidate.client_id
          and n.metadata ->> 'reminder_kind' = candidate.reminder_kind
          and n.metadata ->> 'reminder_date' = current_date::text
      )
    returning 1
  ),
  client_activity as (
    select
      c.id as client_id,
      coalesce(
        greatest(
          coalesce((
            select max(conv.last_message_at)
            from public.conversations conv
            where conv.client_id = c.id
              and conv.last_message_sender_role = 'client'
          ), '-infinity'::timestamptz),
          coalesce((
            select max(aw.completed_at)
            from public.assigned_workouts aw
            where aw.client_id = c.id
              and aw.status = 'completed'
          ), '-infinity'::timestamptz),
          coalesce((
            select max(hl.created_at)
            from public.habit_logs hl
            where hl.client_id = c.id
          ), '-infinity'::timestamptz),
          coalesce((
            select max(ch.submitted_at)
            from public.checkins ch
            where ch.client_id = c.id
          ), '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) as last_activity_at
    from public.clients c
    where c.workspace_id in (select workspace_id from pt_workspaces)
      and c.status = 'active'
  ),
  inactive_candidates as (
    select
      c.id as client_id,
      coalesce(nullif(trim(c.display_name), ''), 'Client') as client_name,
      activity.last_activity_at
    from public.clients c
    join client_activity activity on activity.client_id = c.id
    where c.workspace_id in (select workspace_id from pt_workspaces)
      and c.status = 'active'
      and activity.last_activity_at < now() - interval '2 days'
  ),
  inserted_inactive as (
    insert into public.notifications (
      recipient_user_id,
      type,
      category,
      priority,
      title,
      body,
      action_url,
      entity_type,
      entity_id,
      metadata
    )
    select
      v_user_id,
      'client_inactive',
      'general',
      'normal',
      'Client inactive for 2+ days',
      format('%s has no recent activity.', candidate.client_name),
      format('/pt/clients/%s?tab=overview', candidate.client_id),
      'client',
      candidate.client_id,
      jsonb_build_object(
        'reminder_date',
        current_date::text,
        'last_activity_at',
        candidate.last_activity_at
      )
    from inactive_candidates candidate
    where not exists (
      select 1
      from public.notifications n
      where n.recipient_user_id = v_user_id
        and n.type = 'client_inactive'
        and n.entity_type = 'client'
        and n.entity_id = candidate.client_id
        and n.metadata ->> 'reminder_date' = current_date::text
    )
    returning 1
  )
  select
    coalesce((select count(*) from inserted_birthdays), 0) +
    coalesce((select count(*) from inserted_inactive), 0)
  into v_inserted;

  return v_inserted;
end;
$$;

revoke all on function public.sync_notification_reminders() from public;
grant execute on function public.sync_notification_reminders() to authenticated;
