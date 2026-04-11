create or replace function public.is_pt_workspace_member(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if p_workspace_id is null or v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = v_user_id
  ) or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  );
end;
$$;

create or replace function public.sync_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.owner_user_id is null then
    return new;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_user_id, 'pt_owner')
  on conflict on constraint workspace_members_workspace_id_user_id_key do update
    set role = 'pt_owner';

  return new;
end;
$$;

drop trigger if exists workspace_owner_membership_sync_trigger on public.workspaces;

create trigger workspace_owner_membership_sync_trigger
after insert or update of owner_user_id
on public.workspaces
for each row
execute function public.sync_workspace_owner_membership();

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.owner_user_id, 'pt_owner'::public.workspace_role
from public.workspaces w
where w.owner_user_id is not null
on conflict on constraint workspace_members_workspace_id_user_id_key do update
  set role = 'pt_owner'::public.workspace_role;
