create extension if not exists "pgcrypto";

-- =========================
-- Core tables (create/verify)
-- =========================
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'pt_coach',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.pt_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid,
  status text not null default 'active',
  display_name text,
  goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null default 'client',
  code text not null unique,
  token text,
  expires_at timestamptz,
  max_uses int,
  uses int not null default 0,
  used_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);

alter table public.invites
  add column if not exists token text;

update public.invites
set token = code
where token is null
  and code is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invites_role_check'
      and conrelid = 'public.invites'::regclass
  ) then
    alter table public.invites
      add constraint invites_role_check
      check (role in ('client', 'pt_coach', 'pt_owner'));
  end if;
end $$;

create unique index if not exists invites_token_uidx
  on public.invites (token)
  where token is not null;

create index if not exists invites_workspace_id_idx
  on public.invites (workspace_id);

create index if not exists clients_workspace_id_idx
  on public.clients (workspace_id);

create index if not exists clients_user_id_idx
  on public.clients (user_id);

create unique index if not exists clients_workspace_user_uidx
  on public.clients (workspace_id, user_id)
  where user_id is not null;

create index if not exists pt_profiles_user_id_idx
  on public.pt_profiles (user_id);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

create unique index if not exists pt_profiles_user_workspace_uidx
  on public.pt_profiles (user_id, workspace_id);

-- =========================
-- updated_at helpers
-- =========================
do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    create function public.set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_workspaces_updated_at') then
    create trigger set_workspaces_updated_at
    before update on public.workspaces
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_clients_updated_at') then
    create trigger set_clients_updated_at
    before update on public.clients
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_pt_profiles_updated_at') then
    create trigger set_pt_profiles_updated_at
    before update on public.pt_profiles
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- =========================
-- RPCs
-- =========================
create or replace function public.create_workspace(p_name text)
returns table (
  workspace_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text;
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

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'pt_owner')
  on conflict (workspace_id, user_id)
  do update set role = excluded.role;

  insert into public.pt_profiles (user_id, workspace_id)
  values (v_user_id, v_workspace_id)
  on conflict (user_id, workspace_id) do nothing;

  workspace_id := v_workspace_id;
  return next;
end;
$$;

create or replace function public.verify_invite(p_token text)
returns table (
  is_valid boolean,
  reason text,
  invite_id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_logo_url text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.invites%rowtype;
begin
  if p_token is null or trim(p_token) = '' then
    return query
    select false, 'missing_token', null::uuid, null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select i.*
  into v_invite
  from public.invites i
  where i.token = p_token
     or i.code = p_token
  order by i.created_at desc
  limit 1;

  if v_invite.id is null then
    return query
    select false, 'not_found', null::uuid, null::uuid, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_invite.role is distinct from 'client' then
    return query
    select false, 'invalid_role', v_invite.id, v_invite.workspace_id, null::text, null::text, v_invite.role, v_invite.expires_at;
    return;
  end if;

  if v_invite.used_at is not null then
    return query
    select false, 'already_used', v_invite.id, v_invite.workspace_id, null::text, null::text, v_invite.role, v_invite.expires_at;
    return;
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    return query
    select false, 'expired', v_invite.id, v_invite.workspace_id, null::text, null::text, v_invite.role, v_invite.expires_at;
    return;
  end if;

  if v_invite.max_uses is not null and coalesce(v_invite.uses, 0) >= v_invite.max_uses then
    return query
    select false, 'max_uses_reached', v_invite.id, v_invite.workspace_id, null::text, null::text, v_invite.role, v_invite.expires_at;
    return;
  end if;

  return query
  select
    true,
    null::text,
    v_invite.id,
    v_invite.workspace_id,
    w.name,
    w.logo_url,
    v_invite.role,
    v_invite.expires_at
  from public.workspaces w
  where w.id = v_invite.workspace_id;
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

  insert into public.clients (workspace_id, user_id, status, display_name)
  values (v_invite.workspace_id, v_user_id, 'active', null)
  on conflict (workspace_id, user_id)
  do update set user_id = excluded.user_id
  returning id into v_client_id;

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

revoke all on function public.create_workspace(text) from public;
revoke all on function public.verify_invite(text) from public;
revoke all on function public.accept_invite(text) from public;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.verify_invite(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;

-- =========================
-- RLS
-- =========================
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.pt_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.invites enable row level security;

drop policy if exists "workspace_members_select_own" on public.workspace_members;
create policy "workspace_members_select_own"
  on public.workspace_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "workspaces_member_read" on public.workspaces;
create policy "workspaces_member_read"
  on public.workspaces
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = (select auth.uid())
    )
  );

drop policy if exists "pt_manage_invites" on public.invites;
create policy "pt_manage_invites"
  on public.invites
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = invites.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = invites.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
  );

drop policy if exists "pt_read_workspace_clients" on public.clients;
create policy "pt_read_workspace_clients"
  on public.clients
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = clients.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
  );

drop policy if exists "client_read_own" on public.clients;
create policy "client_read_own"
  on public.clients
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "client_update_own" on public.clients;
create policy "client_update_own"
  on public.clients
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "pt_profiles_select_own" on public.pt_profiles;
create policy "pt_profiles_select_own"
  on public.pt_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "pt_profiles_insert_own" on public.pt_profiles;
create policy "pt_profiles_insert_own"
  on public.pt_profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "pt_profiles_update_own" on public.pt_profiles;
create policy "pt_profiles_update_own"
  on public.pt_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
