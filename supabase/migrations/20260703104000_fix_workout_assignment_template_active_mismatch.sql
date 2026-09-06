-- Workout templates do not have an is_active column. The individual workout
-- assignment RPC should validate workspace ownership without requiring it.

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
