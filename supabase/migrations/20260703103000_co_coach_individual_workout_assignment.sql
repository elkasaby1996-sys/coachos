-- PR-04.8B: align one-off workout assignment with the same assigned-client
-- delivery-write permission model used by program and nutrition assignment.

create or replace function public.materialize_assigned_workout_exercises(
  p_assigned_workout_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workout_template_id uuid;
  v_client_id uuid;
begin
  if p_assigned_workout_id is null then
    return;
  end if;

  select aw.workout_template_id, aw.client_id
  into v_workout_template_id, v_client_id
  from public.assigned_workouts aw
  where aw.id = p_assigned_workout_id;

  if not found then
    return;
  end if;

  if not public.can_write_client_delivery(v_client_id) then
    raise exception 'Not authorized';
  end if;

  delete from public.assigned_workout_exercises awe
  where awe.assigned_workout_id = p_assigned_workout_id;

  if v_workout_template_id is null then
    return;
  end if;

  insert into public.assigned_workout_exercises (
    assigned_workout_id,
    exercise_id,
    sort_order,
    sets,
    reps,
    rpe,
    tempo,
    notes,
    rest_seconds,
    superset_group,
    is_completed
  )
  select
    p_assigned_workout_id,
    wte.exercise_id,
    coalesce(wte.sort_order, 0) as sort_order,
    wte.sets,
    wte.reps,
    wte.rpe,
    wte.tempo,
    wte.notes,
    case when wte.superset_group is null then wte.rest_seconds else 0 end,
    wte.superset_group,
    false as is_completed
  from public.workout_template_exercises wte
  where wte.workout_template_id = v_workout_template_id
  order by coalesce(wte.sort_order, 0) asc;
end;
$$;

grant execute on function public.materialize_assigned_workout_exercises(uuid) to authenticated;

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

  insert into public.assigned_workouts (
    client_id,
    workout_template_id,
    scheduled_date,
    status
  )
  values (
    p_client_id,
    p_workout_template_id,
    p_scheduled_date,
    'planned'
  )
  on conflict (client_id, scheduled_date, workout_template_id)
  do update set status = excluded.status
  returning id into v_assigned_workout_id;

  perform public.materialize_assigned_workout_exercises(v_assigned_workout_id);

  return v_assigned_workout_id;
end;
$$;

grant execute on function public.assign_workout_with_template(uuid, date, uuid) to authenticated;
