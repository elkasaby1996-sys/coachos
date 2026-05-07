-- Allow clients to manage (delete) personal workouts and their exercise rows.
-- Scope is intentionally narrow: only client-owned rows that are not template/program-backed.

drop policy if exists assigned_workouts_delete_client_personal on public.assigned_workouts;

create policy assigned_workouts_delete_client_personal
on public.assigned_workouts
for delete
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = assigned_workouts.client_id
      and c.user_id = auth.uid()
  )
  and assigned_workouts.workout_template_id is null
  and assigned_workouts.program_id is null
);

drop policy if exists awe_delete_client on public.assigned_workout_exercises;

create policy awe_delete_client
on public.assigned_workout_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.assigned_workouts aw
    join public.clients c on c.id = aw.client_id
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and c.user_id = auth.uid()
      and aw.workout_template_id is null
      and aw.program_id is null
  )
);
