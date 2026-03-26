create extension if not exists "pgcrypto";

do $$
begin
  if to_regclass('public.assigned_workouts') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'assigned_workouts_workout_template_id_fkey'
      and conrelid = 'public.assigned_workouts'::regclass
  ) then
    alter table public.assigned_workouts
      drop constraint assigned_workouts_workout_template_id_fkey;
  end if;

  alter table public.assigned_workouts
    add constraint assigned_workouts_workout_template_id_fkey
    foreign key (workout_template_id)
    references public.workout_templates(id)
    on delete set null;
end $$;
