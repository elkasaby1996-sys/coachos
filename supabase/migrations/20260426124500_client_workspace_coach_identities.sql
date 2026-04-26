create or replace function public.get_client_workspace_coach_identities(
  p_workspace_ids uuid[] default '{}'::uuid[]
)
returns table(
  workspace_id uuid,
  workspace_name text,
  owner_user_id uuid,
  coach_display_name text
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    w.id as workspace_id,
    w.name as workspace_name,
    w.owner_user_id,
    coalesce(
      nullif(btrim(hub.full_name), ''),
      nullif(btrim(hub.display_name), ''),
      nullif(btrim(pt.full_name), ''),
      nullif(btrim(pt.display_name), ''),
      nullif(btrim(pt.coach_business_name), '')
    ) as coach_display_name
  from public.workspaces w
  left join public.pt_hub_profiles hub
    on hub.user_id = w.owner_user_id
  left join public.pt_profiles pt
    on pt.user_id = w.owner_user_id
   and pt.workspace_id is null
  where w.id = any(coalesce(p_workspace_ids, '{}'::uuid[]))
    and exists (
      select 1
      from public.clients c
      where c.workspace_id = w.id
        and c.user_id = auth.uid()
    );
$$;

revoke all on function public.get_client_workspace_coach_identities(uuid[]) from public;
grant execute on function public.get_client_workspace_coach_identities(uuid[]) to authenticated;
