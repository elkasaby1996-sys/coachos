alter table public.exercises
  add column if not exists owner_user_id uuid,
  add column if not exists source text not null default 'manual',
  add column if not exists source_exercise_id text,
  add column if not exists source_payload jsonb;

update public.exercises e
set owner_user_id = w.owner_user_id
from public.workspaces w
where e.workspace_id = w.id
  and e.owner_user_id is null;

alter table public.exercises
  alter column owner_user_id set not null,
  alter column workspace_id drop not null;

alter table public.exercises
  drop constraint if exists exercises_workspace_id_fkey;

drop policy if exists exercises_delete_pt on public.exercises;
drop policy if exists exercises_insert_pt on public.exercises;
drop policy if exists exercises_select_access on public.exercises;
drop policy if exists exercises_update_pt on public.exercises;

create index if not exists exercises_owner_user_id_idx
  on public.exercises (owner_user_id);

create unique index if not exists exercises_owner_name_uidx
  on public.exercises (owner_user_id, lower(btrim(name)));

create unique index if not exists exercises_owner_source_uidx
  on public.exercises (owner_user_id, source, source_exercise_id)
  where source_exercise_id is not null;

create policy exercises_delete_pt on public.exercises
  for delete to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.owner_user_id = exercises.owner_user_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

create policy exercises_insert_pt on public.exercises
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.owner_user_id = exercises.owner_user_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

create policy exercises_select_access on public.exercises
  for select to authenticated
  using (
    exists (
      select 1
      from public.assigned_workout_exercises awe
      join public.assigned_workouts aw on aw.id = awe.assigned_workout_id
      join public.clients c on c.id = aw.client_id
      where awe.exercise_id = exercises.id
        and c.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.owner_user_id = exercises.owner_user_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

create policy exercises_update_pt on public.exercises
  for update to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.owner_user_id = exercises.owner_user_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.owner_user_id = exercises.owner_user_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );
