create extension if not exists "pgcrypto";

create table if not exists public.assigned_workouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workout_name text not null,
  scheduled_date date not null,
  status text not null default 'pending',
  completed_at timestamptz null,
  created_at timestamptz default now()
);

create table if not exists public.client_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null references public.clients(id) on delete cascade,
  calories int null,
  protein_g int null,
  steps int null,
  coach_notes text null,
  updated_at timestamptz default now()
);

alter table public.assigned_workouts enable row level security;
alter table public.client_targets enable row level security;

create policy "clients_select_own_assigned_workouts"
  on public.assigned_workouts
  for select
  using (
    exists (
      select 1
      from public.clients c
      where c.id = assigned_workouts.client_id
        and c.user_id = auth.uid()
    )
  );

create policy "clients_update_own_assigned_workouts"
  on public.assigned_workouts
  for update
  using (
    exists (
      select 1
      from public.clients c
      where c.id = assigned_workouts.client_id
        and c.user_id = auth.uid()
    )
  );

create policy "clients_select_own_client_targets"
  on public.client_targets
  for select
  using (
    exists (
      select 1
      from public.clients c
      where c.id = client_targets.client_id
        and c.user_id = auth.uid()
    )
  );

create policy "clients_update_own_client_targets"
  on public.client_targets
  for update
  using (
    exists (
      select 1
      from public.clients c
      where c.id = client_targets.client_id
        and c.user_id = auth.uid()
    )
  );
