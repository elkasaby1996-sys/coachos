-- Restore optional workout display name on assigned_workouts.
-- Client unified workouts and notification triggers already reference this
-- field, so missing schema causes PostgREST 400s on select/insert.

alter table public.assigned_workouts
  add column if not exists workout_name text;
