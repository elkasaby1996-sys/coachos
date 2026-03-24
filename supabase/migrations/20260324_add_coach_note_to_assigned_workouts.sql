alter table public.assigned_workouts
  add column if not exists coach_note text null;
