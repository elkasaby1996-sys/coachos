create table if not exists public.client_coach_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  is_done boolean not null default false,
  source_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, client_id, source_key)
);

create index if not exists client_coach_tasks_lookup_idx
  on public.client_coach_tasks (workspace_id, client_id, coach_id, created_at desc);

create index if not exists client_coach_tasks_active_idx
  on public.client_coach_tasks (client_id, coach_id)
  where deleted_at is null;

drop trigger if exists set_client_coach_tasks_updated_at
  on public.client_coach_tasks;
create trigger set_client_coach_tasks_updated_at
  before update on public.client_coach_tasks
  for each row execute function public.set_updated_at();

alter table public.client_coach_tasks enable row level security;
alter table public.client_coach_tasks force row level security;

drop policy if exists client_coach_tasks_access
  on public.client_coach_tasks;
create policy client_coach_tasks_access
  on public.client_coach_tasks
  for all
  to authenticated
  using (
    coach_id = (select auth.uid())
    and public.can_access_client(client_id, 'clients.view')
    and exists (
      select 1
      from public.clients c
      where c.id = client_coach_tasks.client_id
        and c.workspace_id = client_coach_tasks.workspace_id
    )
  )
  with check (
    coach_id = (select auth.uid())
    and public.can_access_client(client_id, 'clients.view')
    and exists (
      select 1
      from public.clients c
      where c.id = client_coach_tasks.client_id
        and c.workspace_id = client_coach_tasks.workspace_id
    )
  );

grant select, insert, update, delete
  on table public.client_coach_tasks
  to authenticated;
