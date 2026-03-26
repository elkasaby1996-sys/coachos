create or replace function public.create_workspace(p_name text)
returns table (
  workspace_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text;
  v_member_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Workspace name is required';
  end if;

  insert into public.workspaces (name, owner_user_id)
  values (v_name, v_user_id)
  returning id into v_workspace_id;

  select wm.id
  into v_member_id
  from public.workspace_members wm
  where wm.workspace_id = v_workspace_id
    and wm.user_id = v_user_id
  limit 1
  for update;

  if v_member_id is null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, v_user_id, 'pt_owner');
  else
    update public.workspace_members wm
    set role = 'pt_owner'
    where wm.id = v_member_id;
  end if;

  insert into public.pt_profiles (user_id, workspace_id)
  values (v_user_id, v_workspace_id)
  on conflict (user_id, workspace_id) do nothing;

  workspace_id := v_workspace_id;
  return next;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns table (
  workspace_id uuid,
  client_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_invite public.invites%rowtype;
  v_client_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select i.*
  into v_invite
  from public.invites i
  where i.token = p_token
     or i.code = p_token
  order by i.created_at desc
  limit 1
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if v_invite.role is distinct from 'client' then
    raise exception 'Invite role not supported';
  end if;

  if v_invite.used_at is not null then
    raise exception 'Invite already used';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_invite.max_uses is not null and coalesce(v_invite.uses, 0) >= v_invite.max_uses then
    raise exception 'Invite max uses reached';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_invite.workspace_id
    and c.user_id = v_user_id
  limit 1
  for update;

  if v_client_id is null then
    insert into public.clients (workspace_id, user_id, status, display_name)
    values (v_invite.workspace_id, v_user_id, 'active', null)
    returning id into v_client_id;
  else
    update public.clients c
    set user_id = v_user_id
    where c.id = v_client_id
    returning id into v_client_id;
  end if;

  update public.invites
  set
    used_at = now(),
    uses = coalesce(uses, 0) + 1
  where id = v_invite.id;

  workspace_id := v_invite.workspace_id;
  client_id := v_client_id;
  return next;
end;
$$;