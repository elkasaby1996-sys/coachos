alter type public.workspace_role add value if not exists 'owner';
alter type public.workspace_role add value if not exists 'admin';
alter type public.workspace_role add value if not exists 'coach';
alter type public.workspace_role add value if not exists 'assistant_coach';
alter type public.workspace_role add value if not exists 'viewer';

alter table public.workspace_members
  add column if not exists status text not null default 'active',
  add column if not exists client_access_mode text not null default 'all_clients',
  add column if not exists source_invite_id uuid,
  add column if not exists invited_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists joined_at timestamptz;

alter table public.workspace_members
  drop constraint if exists workspace_members_status_check;

alter table public.workspace_members
  add constraint workspace_members_status_check
  check (status in ('active', 'suspended', 'removed'));

alter table public.workspace_members
  drop constraint if exists workspace_members_client_access_mode_check;

alter table public.workspace_members
  add constraint workspace_members_client_access_mode_check
  check (client_access_mode in ('all_clients', 'assigned_clients_only'));

create table if not exists public.workspace_member_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null,
  client_access_mode text not null default 'assigned_clients_only',
  token_hash text not null,
  status text not null default 'pending',
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_member_invites_email_normalized_check check (email = lower(trim(email))),
  constraint workspace_member_invites_role_check check (role in ('admin', 'coach', 'assistant_coach', 'viewer')),
  constraint workspace_member_invites_client_access_mode_check check (client_access_mode in ('all_clients', 'assigned_clients_only')),
  constraint workspace_member_invites_status_check check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint workspace_member_invites_accepted_user_check check (
    (status = 'accepted' and accepted_by_user_id is not null and accepted_at is not null)
    or (status <> 'accepted' and accepted_by_user_id is null and accepted_at is null)
  )
);

alter table public.workspace_members
  drop constraint if exists workspace_members_source_invite_id_fkey;

alter table public.workspace_members
  add constraint workspace_members_source_invite_id_fkey
  foreign key (source_invite_id)
  references public.workspace_member_invites(id)
  on delete set null;

create unique index if not exists workspace_member_invites_pending_email_uidx
  on public.workspace_member_invites (workspace_id, lower(email))
  where status = 'pending';

create unique index if not exists workspace_member_invites_token_hash_uidx
  on public.workspace_member_invites (token_hash);

create index if not exists workspace_member_invites_workspace_status_idx
  on public.workspace_member_invites (workspace_id, status, created_at desc);

create index if not exists workspace_member_invites_invited_by_idx
  on public.workspace_member_invites (invited_by_user_id, created_at desc);

create index if not exists workspace_members_active_workspace_user_idx
  on public.workspace_members (workspace_id, user_id)
  where status = 'active';

create index if not exists workspace_members_source_invite_id_idx
  on public.workspace_members (source_invite_id)
  where source_invite_id is not null;

create table if not exists public.workspace_invite_client_assignments (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.workspace_member_invites(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (invite_id, client_id)
);

create index if not exists workspace_invite_client_assignments_invite_idx
  on public.workspace_invite_client_assignments (invite_id);

create index if not exists workspace_invite_client_assignments_workspace_client_idx
  on public.workspace_invite_client_assignments (workspace_id, client_id);

create table if not exists public.workspace_member_client_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid not null references public.workspace_members(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_by_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (workspace_id, member_id, client_id)
);

create index if not exists workspace_member_client_assignments_member_idx
  on public.workspace_member_client_assignments (member_id);

create index if not exists workspace_member_client_assignments_client_idx
  on public.workspace_member_client_assignments (workspace_id, client_id);

create table if not exists public.workspace_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id uuid,
  target_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workspace_audit_events_workspace_created_idx
  on public.workspace_audit_events (workspace_id, created_at desc);

create index if not exists workspace_audit_events_actor_created_idx
  on public.workspace_audit_events (actor_user_id, created_at desc);

drop trigger if exists set_workspace_member_invites_updated_at
  on public.workspace_member_invites;

create trigger set_workspace_member_invites_updated_at
before update on public.workspace_member_invites
for each row
execute function public.set_updated_at();

alter table public.workspace_member_invites enable row level security;
alter table public.workspace_invite_client_assignments enable row level security;
alter table public.workspace_member_client_assignments enable row level security;
alter table public.workspace_audit_events enable row level security;

drop policy if exists workspace_member_invites_owner_admin_read
  on public.workspace_member_invites;

create policy workspace_member_invites_owner_admin_read
  on public.workspace_member_invites
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_member_invites.workspace_id
        and w.owner_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_member_invites.workspace_id
        and wm.user_id = (select auth.uid())
        and coalesce(wm.status, 'active') = 'active'
        and wm.role::text in ('admin', 'pt_owner', 'owner')
    )
  );

drop policy if exists workspace_invite_client_assignments_owner_admin_read
  on public.workspace_invite_client_assignments;

create policy workspace_invite_client_assignments_owner_admin_read
  on public.workspace_invite_client_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_invite_client_assignments.workspace_id
        and w.owner_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_invite_client_assignments.workspace_id
        and wm.user_id = (select auth.uid())
        and coalesce(wm.status, 'active') = 'active'
        and wm.role::text in ('admin', 'pt_owner', 'owner')
    )
  );

drop policy if exists workspace_member_client_assignments_member_or_owner_admin_read
  on public.workspace_member_client_assignments;

create policy workspace_member_client_assignments_member_or_owner_admin_read
  on public.workspace_member_client_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members own_member
      where own_member.id = workspace_member_client_assignments.member_id
        and own_member.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.workspaces w
      where w.id = workspace_member_client_assignments.workspace_id
        and w.owner_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_member_client_assignments.workspace_id
        and wm.user_id = (select auth.uid())
        and coalesce(wm.status, 'active') = 'active'
        and wm.role::text in ('admin', 'pt_owner', 'owner')
    )
  );

drop policy if exists workspace_audit_events_owner_admin_read
  on public.workspace_audit_events;

create policy workspace_audit_events_owner_admin_read
  on public.workspace_audit_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_audit_events.workspace_id
        and w.owner_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_audit_events.workspace_id
        and wm.user_id = (select auth.uid())
        and coalesce(wm.status, 'active') = 'active'
        and wm.role::text in ('admin', 'pt_owner', 'owner')
    )
  );
