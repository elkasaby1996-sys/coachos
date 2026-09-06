drop policy if exists workspaces_update_access on public.workspaces;
create policy workspaces_update_access
on public.workspaces
for update
to authenticated
using (public.can_manage_workspace_team(id))
with check (public.can_manage_workspace_team(id));

drop policy if exists workspaces_delete_owner_access on public.workspaces;
create policy workspaces_delete_owner_access
on public.workspaces
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspace_access_context(id) ctx
    where public.has_workspace_permission(
      ctx.role,
      ctx.member_status,
      'workspace.danger.manage'
    )
  )
);
