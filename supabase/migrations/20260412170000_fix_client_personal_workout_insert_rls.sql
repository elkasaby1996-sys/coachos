-- Allow clients to create personal workouts under their own client profile.
-- This keeps the unified workouts flow on the same assigned_workouts model
-- without requiring PT workspace membership for personal-only usage.

drop policy if exists assigned_workouts_insert_client on public.assigned_workouts;

create policy assigned_workouts_insert_client
on public.assigned_workouts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.clients c
    where c.id = assigned_workouts.client_id
      and c.user_id = auth.uid()
  )
);
