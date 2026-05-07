-- Avoid policy recursion when clients insert assigned_workout_exercises.
-- The previous awe_insert_client policy queried public.exercises, while
-- exercises_select_access queries assigned_workout_exercises, causing a cycle.
-- Keep insert authorization scoped to the actor owning the assigned workout.

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
);
