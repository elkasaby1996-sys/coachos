-- Allow repeated exercise rows within one assigned workout.
-- The UI/template builder supports duplicates, so uniqueness on
-- (assigned_workout_id, exercise_id) causes assignment failures.

do $$
begin
  if to_regclass('public.assigned_workout_exercises') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'assigned_workout_exercises_unique_per_aw_ex'
      and conrelid = 'public.assigned_workout_exercises'::regclass
  ) then
    alter table public.assigned_workout_exercises
      drop constraint assigned_workout_exercises_unique_per_aw_ex;
  end if;
end $$;

create index if not exists assigned_workout_exercises_aw_ex_idx
  on public.assigned_workout_exercises (assigned_workout_id, exercise_id);
