-- PR-EXLIB-07B: preserve active-delivery protection without discarding allowed updates.

create or replace function public.prevent_assigned_workout_exercise_rewrite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_workout_template_in_active_delivery(old.workout_template_id) then
    perform public.raise_assigned_template_delete_protection();
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;

  return old;
end;
$$;
