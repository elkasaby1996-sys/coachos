-- PR-05.3: Soft/archive workspace-client relationship removal for beta.
-- Do not hard-delete public.clients from normal flows. Relationship removal is
-- an access state distinct from business lifecycle.

alter table public.clients
  add column if not exists relationship_status text not null default 'active',
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by_user_id uuid references auth.users(id) on delete set null;

alter table public.clients
  drop constraint if exists clients_relationship_status_check;

alter table public.clients
  add constraint clients_relationship_status_check
  check (relationship_status in ('active', 'removed'));

create index if not exists clients_workspace_relationship_status_idx
  on public.clients (workspace_id, relationship_status);

update public.clients
set relationship_status = 'active'
where relationship_status is null;

create or replace function public.is_client_owner(p_client_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, extensions
stable
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.user_id = (select auth.uid())
      and (
        c.workspace_id is null
        or coalesce(c.relationship_status, 'active') = 'active'
      )
  );
$$;

create or replace function public.is_own_client(p_client_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select public.is_client_owner(p_client_id);
$$;

create or replace function public.can_access_workspace_client(
  p_workspace_id uuid,
  p_client_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.workspace_id = p_workspace_id
      and c.user_id = (select auth.uid())
      and coalesce(c.relationship_status, 'active') = 'active'
  )
  or exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.workspace_members wm
    left join public.workspace_member_client_assignments wmca
      on wmca.workspace_id = wm.workspace_id
     and wmca.member_id = wm.id
     and wmca.client_id = p_client_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and coalesce(wm.status, 'active') = 'active'
      and (
        coalesce(wm.client_access_mode, 'all_clients') = 'all_clients'
        or wmca.client_id is not null
      )
  );
$$;

create or replace function public.can_access_client(
  p_client_id uuid,
  p_permission text default 'clients.view'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_client record;
  v_context record;
begin
  if p_client_id is null then
    return false;
  end if;

  select c.id, c.workspace_id, c.relationship_status
  into v_client
  from public.clients c
  where c.id = p_client_id;

  if not found or v_client.workspace_id is null then
    return false;
  end if;

  select *
  into v_context
  from public.workspace_access_context(v_client.workspace_id)
  limit 1;

  if not found then
    return false;
  end if;

  if not public.has_workspace_permission(
    v_context.role,
    v_context.member_status,
    p_permission
  ) then
    return false;
  end if;

  if v_context.role in ('owner', 'admin') then
    return true;
  end if;

  if v_context.member_id is null then
    return false;
  end if;

  if p_permission = 'clients.message'
     and v_context.role = 'assistant_coach' then
    return exists (
      select 1
      from public.workspace_member_client_assignments wmca
      where wmca.workspace_id = v_client.workspace_id
        and wmca.member_id = v_context.member_id
        and wmca.client_id = v_client.id
    );
  end if;

  if v_context.client_access_mode = 'all_clients' then
    return true;
  end if;

  return exists (
    select 1
    from public.workspace_member_client_assignments wmca
    where wmca.workspace_id = v_client.workspace_id
      and wmca.member_id = v_context.member_id
      and wmca.client_id = v_client.id
  );
end;
$$;

create or replace function public.accessible_client_ids(p_workspace_id uuid)
returns table (client_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_context record;
begin
  select *
  into v_context
  from public.workspace_access_context(p_workspace_id)
  limit 1;

  if not found
    or not public.has_workspace_permission(
      v_context.role,
      v_context.member_status,
      'clients.view'
    )
  then
    return;
  end if;

  if v_context.role in ('owner', 'admin')
    or v_context.client_access_mode = 'all_clients'
  then
    return query
    select c.id
    from public.clients c
    where c.workspace_id = p_workspace_id
      and coalesce(c.relationship_status, 'active') = 'active';
    return;
  end if;

  return query
  select wmca.client_id
  from public.workspace_member_client_assignments wmca
  join public.clients c
    on c.id = wmca.client_id
  where wmca.workspace_id = p_workspace_id
    and wmca.member_id = v_context.member_id
    and coalesce(c.relationship_status, 'active') = 'active';
end;
$$;

drop policy if exists clients_select_access on public.clients;
create policy clients_select_access
on public.clients
for select
to authenticated
using (
  (
    user_id = (select auth.uid())
    and (
      workspace_id is null
      or coalesce(relationship_status, 'active') = 'active'
    )
  )
  or public.can_access_client(id, 'clients.view')
);

drop policy if exists clients_update_access on public.clients;
create policy clients_update_access
on public.clients
for update
to authenticated
using (
  (
    user_id = (select auth.uid())
    and (
      workspace_id is null
      or coalesce(relationship_status, 'active') = 'active'
    )
  )
  or public.can_access_client(id, 'clients.edit')
)
with check (
  (
    user_id = (select auth.uid())
    and (
      workspace_id is null
      or coalesce(relationship_status, 'active') = 'active'
    )
  )
  or public.can_access_client(id, 'clients.edit')
);

create or replace function public.pt_archive_client_relationship(
  p_client_id uuid
)
returns table (
  id uuid,
  relationship_status text,
  removed_at timestamptz,
  removed_by_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_client record;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.id, c.workspace_id, c.relationship_status
  into v_client
  from public.clients c
  where c.id = p_client_id
  for update;

  if not found or v_client.workspace_id is null then
    raise exception 'Client relationship not found';
  end if;

  if not public.can_access_client(p_client_id, 'clients.edit') then
    raise exception 'Not authorized';
  end if;

  return query
  update public.clients c
  set
    relationship_status = 'removed',
    removed_at = coalesce(c.removed_at, now()),
    removed_by_user_id = coalesce(c.removed_by_user_id, v_actor_user_id),
    updated_at = now()
  where c.id = p_client_id
  returning
    c.id,
    c.relationship_status,
    c.removed_at,
    c.removed_by_user_id;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = v_user_id
    limit 1
    for update;
  end if;

  if v_client_id is null then
    insert into public.clients (
      workspace_id,
      user_id,
      status,
      relationship_status,
      display_name
    )
    values (v_invite.workspace_id, v_user_id, 'active', 'active', null)
    returning id into v_client_id;
  else
    update public.clients c
    set
      workspace_id = v_invite.workspace_id,
      status = 'active',
      user_id = v_user_id,
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null
    where c.id = v_client_id
    returning id into v_client_id;
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

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

create or replace function public.accept_invite(
  p_code text,
  p_display_name text default null
)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $$
declare
  v_inv public.invites%rowtype;
  v_client_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite';
  end if;

  select *
  into v_inv
  from public.invites
  where code = p_code
  for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_inv.uses >= v_inv.max_uses then
    raise exception 'Invite already used';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_inv.workspace_id
    and c.user_id = auth.uid()
  limit 1
  for update;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = auth.uid()
    limit 1
    for update;
  end if;

  if v_client_id is null then
    v_name := coalesce(
      nullif(trim(p_display_name), ''),
      split_part((auth.jwt() ->> 'email'), '@', 1),
      'Client'
    );

    insert into public.clients (
      workspace_id,
      user_id,
      display_name,
      full_name,
      status,
      relationship_status
    )
    values (v_inv.workspace_id, auth.uid(), v_name, v_name, 'active', 'active')
    returning id into v_client_id;
  else
    update public.clients
    set
      workspace_id = v_inv.workspace_id,
      status = 'active',
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null,
      display_name = coalesce(display_name, nullif(trim(p_display_name), '')),
      full_name = coalesce(full_name, nullif(trim(p_display_name), ''))
    where id = v_client_id;
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set uses = uses + 1
  where id = v_inv.id;

  return query select v_inv.workspace_id, v_client_id;
end;
$$;

grant execute on function public.pt_archive_client_relationship(uuid)
  to authenticated;
grant execute on function public.accept_invite(text)
  to anon, authenticated, service_role;
grant execute on function public.accept_invite(text, text)
  to anon, authenticated, service_role;
