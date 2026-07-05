-- PR-04.5: persist one-day program workout overrides by updating the
-- materialized assigned_workouts snapshot for the affected date only.

create or replace function public.save_client_program_day_override(
  p_client_program_id uuid,
  p_override_date date,
  p_workout_template_id uuid,
  p_is_rest boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_workspace_id uuid;
  v_program_template_id uuid;
  v_program_start_date date;
  v_template_workspace_id uuid;
  v_assigned_workout_id uuid;
  v_override_id uuid;
  v_program_day_index integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_client_program_id is null or p_override_date is null then
    raise exception 'client_program_id and override_date are required';
  end if;

  if coalesce(p_is_rest, false) = false and p_workout_template_id is null then
    raise exception 'workout_template_id is required unless override is a rest day';
  end if;

  select cp.client_id, c.workspace_id, cp.program_template_id, cp.start_date
  into v_client_id, v_workspace_id, v_program_template_id, v_program_start_date
  from public.client_programs cp
  join public.clients c on c.id = cp.client_id
  where cp.id = p_client_program_id
    and cp.is_active = true;

  if v_client_id is null then
    raise exception 'Active client program not found';
  end if;

  if not public.can_write_client_delivery(v_client_id) then
    raise exception 'Not authorized';
  end if;

  if p_override_date < v_program_start_date then
    raise exception 'Override date is before the active program start date';
  end if;

  if coalesce(p_is_rest, false) = false then
    select wt.workspace_id
    into v_template_workspace_id
    from public.workout_templates wt
    where wt.id = p_workout_template_id;

    if v_template_workspace_id is null then
      raise exception 'Workout template not found';
    end if;

    if v_template_workspace_id <> v_workspace_id then
      raise exception 'Template not in client workspace';
    end if;
  end if;

  if exists (
    select 1
    from public.assigned_workouts aw
    where aw.client_id = v_client_id
      and aw.scheduled_date = p_override_date
      and aw.status = 'completed'
  ) then
    raise exception 'Cannot override a completed workout day';
  end if;

  insert into public.client_program_overrides (
    client_program_id,
    override_date,
    workout_template_id,
    is_rest,
    notes
  )
  values (
    p_client_program_id,
    p_override_date,
    case when coalesce(p_is_rest, false) then null else p_workout_template_id end,
    coalesce(p_is_rest, false),
    nullif(btrim(p_notes), '')
  )
  on conflict (client_program_id, override_date)
  do update set
    workout_template_id = excluded.workout_template_id,
    is_rest = excluded.is_rest,
    notes = excluded.notes
  returning id into v_override_id;

  v_program_day_index := p_override_date - v_program_start_date;

  select aw.id
  into v_assigned_workout_id
  from public.assigned_workouts aw
  where aw.client_id = v_client_id
    and aw.scheduled_date = p_override_date
    and aw.status <> 'completed'
  order by
    case when aw.program_id = v_program_template_id then 0 else 1 end,
    aw.created_at asc
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
      v_client_id,
      case when coalesce(p_is_rest, false) then null else p_workout_template_id end,
      p_override_date,
      'planned',
      case when coalesce(p_is_rest, false) then 'rest' else 'workout' end,
      v_program_template_id,
      v_program_day_index,
      nullif(btrim(p_notes), '')
    )
    returning id into v_assigned_workout_id;
  else
    update public.assigned_workouts
    set workout_template_id = case when coalesce(p_is_rest, false) then null else p_workout_template_id end,
        status = 'planned',
        completed_at = null,
        day_type = case when coalesce(p_is_rest, false) then 'rest' else 'workout' end,
        program_id = v_program_template_id,
        program_day_index = v_program_day_index,
        coach_note = nullif(btrim(p_notes), '')
    where id = v_assigned_workout_id;
  end if;

  delete from public.assigned_workouts aw
  where aw.client_id = v_client_id
    and aw.scheduled_date = p_override_date
    and aw.status <> 'completed'
    and aw.id <> v_assigned_workout_id;

  perform public.materialize_assigned_workout_exercises(v_assigned_workout_id);

  return v_assigned_workout_id;
end;
$$;

grant execute on function public.save_client_program_day_override(uuid, date, uuid, boolean, text) to authenticated;
