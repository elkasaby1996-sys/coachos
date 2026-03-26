create table if not exists public.dismissed_reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  key text not null,
  dismissed_for_date date not null default current_date,
  created_at timestamptz default now(),
  unique (client_id, key, dismissed_for_date)
);

alter table public.dismissed_reminders enable row level security;

create policy "clients_select_own_dismissed_reminders"
  on public.dismissed_reminders
  for select
  using (
    exists (
      select 1
      from public.clients c
      where c.id = dismissed_reminders.client_id
        and c.user_id = auth.uid()
    )
  );

create policy "clients_insert_own_dismissed_reminders"
  on public.dismissed_reminders
  for insert
  with check (
    exists (
      select 1
      from public.clients c
      where c.id = dismissed_reminders.client_id
        and c.user_id = auth.uid()
    )
  );
