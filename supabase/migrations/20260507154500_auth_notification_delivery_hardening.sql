alter table if exists public.notification_deliveries
  add column if not exists recipient_email text,
  add column if not exists notification_type text,
  add column if not exists template_key text,
  add column if not exists provider_message_id text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists failure_code text,
  add column if not exists failure_reason text;

alter table if exists public.notification_deliveries
  add column if not exists failure_message text;

update public.notification_deliveries
set retry_count = coalesce(retry_count, attempt_count, 0)
where retry_count is distinct from coalesce(retry_count, attempt_count, 0);

alter table if exists public.push_subscriptions
  add column if not exists platform text,
  add column if not exists browser text,
  add column if not exists device_label text,
  add column if not exists permission_status text,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists failure_reason text;

create table if not exists public.auth_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system' check (actor_type in ('user', 'system', 'admin')),
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_deliveries_user_channel_status_idx
  on public.notification_deliveries (recipient_user_id, channel, status, created_at desc);

create index if not exists push_subscriptions_user_endpoint_status_idx
  on public.push_subscriptions (user_id, endpoint, status);

create index if not exists auth_security_events_user_created_idx
  on public.auth_security_events (user_id, created_at desc);

alter table public.auth_security_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists "Users can read own auth security events" on public.auth_security_events;
create policy "Users can read own auth security events"
  on public.auth_security_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage auth security events" on public.auth_security_events;
create policy "Service role can manage auth security events"
  on public.auth_security_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Users can read own notification deliveries" on public.notification_deliveries;
create policy "Users can read own notification deliveries"
  on public.notification_deliveries
  for select
  using (auth.uid() = recipient_user_id);

drop policy if exists "Service role can manage notification deliveries" on public.notification_deliveries;
create policy "Service role can manage notification deliveries"
  on public.notification_deliveries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
  on public.push_subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can upsert own push subscriptions" on public.push_subscriptions;
create policy "Users can upsert own push subscriptions"
  on public.push_subscriptions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
  on public.push_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select on public.auth_security_events to authenticated;
grant all on public.auth_security_events to service_role;
grant all on public.notification_deliveries to service_role;
grant all on public.push_subscriptions to service_role;
