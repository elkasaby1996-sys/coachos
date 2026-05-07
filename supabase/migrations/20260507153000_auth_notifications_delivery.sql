alter table if exists public.notification_preferences
  add column if not exists actor_type text not null default 'unknown',
  add column if not exists lead_alerts boolean not null default true,
  add column if not exists join_requests boolean not null default true,
  add column if not exists client_escalation boolean not null default true,
  add column if not exists missed_checkins boolean not null default true,
  add column if not exists client_onboarding boolean not null default true,
  add column if not exists weekly_digest boolean not null default true,
  add column if not exists product_updates boolean not null default true,
  add column if not exists program_assigned boolean not null default true,
  add column if not exists habit_reminders boolean not null default true,
  add column if not exists files_resources boolean not null default true,
  add column if not exists appointment_reminders boolean not null default true;

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_type text not null check (actor_type in ('pt', 'client', 'system')),
  type text not null,
  title text not null,
  body text not null,
  action_url text,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  transactional boolean not null default false,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'push')),
  status text not null check (
    status in (
      'queued',
      'sending',
      'sent',
      'delivered',
      'failed',
      'retrying',
      'suppressed_preference',
      'suppressed_unsubscribed',
      'suppressed_no_channel',
      'bounced'
    )
  ),
  provider text,
  provider_message_id text,
  error_message text,
  attempt_count integer not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  status text not null default 'active' check (
    status in ('active', 'invalid', 'revoked')
  ),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists notification_events_recipient_created_idx
  on public.notification_events (recipient_user_id, created_at desc);

create index if not exists notification_deliveries_event_idx
  on public.notification_deliveries (event_id);

create index if not exists push_subscriptions_user_status_idx
  on public.push_subscriptions (user_id, status);

alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own notification events" on public.notification_events;
create policy "Users can read own notification events"
  on public.notification_events
  for select
  using (auth.uid() = recipient_user_id);

drop policy if exists "Users can read own notification deliveries" on public.notification_deliveries;
create policy "Users can read own notification deliveries"
  on public.notification_deliveries
  for select
  using (auth.uid() = recipient_user_id);

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
