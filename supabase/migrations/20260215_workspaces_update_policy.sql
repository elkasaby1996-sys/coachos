alter table public.workspaces enable row level security;

drop policy if exists "workspaces_pt_owner_update" on public.workspaces;
create policy "workspaces_pt_owner_update"
  on public.workspaces
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = (select auth.uid())
        and wm.role = 'pt_owner'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = (select auth.uid())
        and wm.role = 'pt_owner'
    )
  );
