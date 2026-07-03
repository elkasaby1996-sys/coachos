-- Same-day individual workout assignment must produce one effective workout
-- for a client/date. If the date belongs to an active program, persist the
-- assignment as a one-day program override; otherwise replace same-day
-- non-completed assignments deterministically.

create or replace function public.assign_workout_with_template(
  p_client_id uuid,
  p_scheduled_date date,
  p_workout_template_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assigned_workout_id uuid;
  v_client_workspace_id uuid;
  v_template_workspace_id uuid;
  v_active_client_program_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_client_id is null or p_scheduled_date is null or p_workout_template_id is null then
    raise exception 'client_id, scheduled_date and workout_template_id are required';
  end if;

  select c.workspace_id
  into v_client_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_client_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not public.can_write_client_delivery(p_client_id) then
    raise exception 'Not authorized';
  end if;

  select wt.workspace_id
  into v_template_workspace_id
  from public.workout_templates wt
  where wt.id = p_workout_template_id;

  if v_template_workspace_id is null then
    raise exception 'Workout template not found';
  end if;

  if v_template_workspace_id <> v_client_workspace_id then
    raise exception 'Template not in client workspace';
  end if;

  if exists (
    select 1
    from public.assigned_workouts aw
    where aw.client_id = p_client_id
      and aw.scheduled_date = p_scheduled_date
      and aw.status = 'completed'
  ) then
    raise exception 'Cannot replace a completed workout day';
  end if;

  select cp.id
  into v_active_client_program_id
  from public.client_programs cp
  where cp.client_id = p_client_id
    and cp.is_active = true
    and cp.start_date <= p_scheduled_date
  order by cp.start_date desc, cp.created_at desc
  limit 1;

  if v_active_client_program_id is not null then
    return public.save_client_program_day_override(
      v_active_client_program_id,
      p_scheduled_date,
      p_workout_template_id,
      false,
      null
    );
  end if;

  select aw.id
  into v_assigned_workout_id
  from public.assigned_workouts aw
  where aw.client_id = p_client_id
    and aw.scheduled_date = p_scheduled_date
    and aw.status <> 'completed'
  order by aw.created_at asc
  limit 1;

  if v_assigned_workout_id is null then
    insert into public.assigned_workouts (
      client_id,
      workout_template_id,
      scheduled_date,
      status,
      day_type,
      program_id,
      program_day_index,
      coach_note
    )
    values (
      p_client_id,
      p_workout_template_id,
      p_scheduled_date,
      'planned',
      'workout',
      null,
      null,
      null
    )
    returning id into v_assigned_workout_id;
  else
    update public.assigned_workouts
    set workout_template_id = p_workout_template_id,
        status = 'planned',
        completed_at = null,
        day_type = 'workout',
        program_id = null,
        program_day_index = null,
        coach_note = null
    where id = v_assigned_workout_id;
  end if;

  delete from public.assigned_workouts aw
  where aw.client_id = p_client_id
    and aw.scheduled_date = p_scheduled_date
    and aw.status <> 'completed'
    and aw.id <> v_assigned_workout_id;

  perform public.materialize_assigned_workout_exercises(v_assigned_workout_id);

  return v_assigned_workout_id;
end;
$$;

grant execute on function public.assign_workout_with_template(uuid, date, uuid) to authenticated;
