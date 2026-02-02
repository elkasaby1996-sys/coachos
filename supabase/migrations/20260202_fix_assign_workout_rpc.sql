create or replace function public.assign_workout_with_template(
  p_client_id uuid,
  p_scheduled_date date,
  p_workout_template_id uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_assigned_workout_id uuid;
begin
  -- 1) Upsert assigned workout (unique constraint exists on client_id + scheduled_date + workout_template_id)
  insert into public.assigned_workouts (client_id, workout_template_id, scheduled_date, status)
  values (p_client_id, p_workout_template_id, p_scheduled_date, 'planned')
  on conflict (client_id, scheduled_date, workout_template_id)
  do update set status = excluded.status
  returning id into v_assigned_workout_id;

  -- 2) Rebuild assigned exercises from template items
  delete from public.assigned_workout_exercises
  where assigned_workout_id = v_assigned_workout_id;

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
    is_completed
  )
  select
    v_assigned_workout_id,
    wti.exercise_id,
    coalesce(wti.sort_order, 0) as sort_order,
    wti.sets,
    wti.reps,
    wti.rpe_target as rpe,
    wti.tempo,
    wti.notes,
    wti.rest_sec as rest_seconds,
    false as is_completed
  from public.workout_template_items wti
  where wti.workout_template_id = p_workout_template_id
  order by coalesce(wti.sort_order, 0) asc;

  return v_assigned_workout_id;
end;
$$;

-- allow calling via supabase rpc
grant execute on function public.assign_workout_with_template(uuid, date, uuid) to authenticated;
