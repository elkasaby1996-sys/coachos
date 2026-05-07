-- Enable the minimal client-owned personal workout creation chain:
-- 1) client-owned personal exercises
-- 2) client insert into assigned_workout_exercises for own assigned rows
-- This keeps creation on the same assigned_workouts + runner/session stack.

drop policy if exists exercises_insert_client_own on public.exercises;
create policy exercises_insert_client_own
on public.exercises
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and workspace_id is null
);

drop policy if exists exercises_select_own on public.exercises;
create policy exercises_select_own
on public.exercises
for select
to authenticated
using (
  owner_user_id = auth.uid()
);

drop policy if exists awe_insert_client on public.assigned_workout_exercises;
create policy awe_insert_client
on public.assigned_workout_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.assigned_workouts aw
    join public.clients c on c.id = aw.client_id
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and c.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.exercises e
    where e.id = assigned_workout_exercises.exercise_id
      and e.owner_user_id = auth.uid()
      and e.workspace_id is null
  )
);
