alter table if exists public.notification_events
  add column if not exists notification_class text not null default 'product'
    check (notification_class in ('product', 'reminder', 'digest', 'transactional', 'security', 'system')),
  add column if not exists category text not null default 'general',
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  add column if not exists action_label text,
  add column if not exists image_url text;

alter table if exists public.notification_deliveries
  add column if not exists seen_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists action_label text;

create index if not exists notification_deliveries_in_app_recipient_archive_created_idx
  on public.notification_deliveries (recipient_user_id, channel, archived_at, created_at desc)
  where channel = 'in_app';

create index if not exists notification_deliveries_in_app_recipient_read_archive_idx
  on public.notification_deliveries (recipient_user_id, channel, read_at, archived_at)
  where channel = 'in_app';

create or replace function public.restrict_notification_delivery_inbox_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if old.event_id is distinct from new.event_id
    or old.recipient_user_id is distinct from new.recipient_user_id
    or old.channel is distinct from new.channel
    or old.status is distinct from new.status
    or old.provider is distinct from new.provider
    or old.provider_message_id is distinct from new.provider_message_id
    or old.recipient_email is distinct from new.recipient_email
    or old.notification_type is distinct from new.notification_type
    or old.template_key is distinct from new.template_key
    or old.retry_count is distinct from new.retry_count
    or old.next_retry_at is distinct from new.next_retry_at
    or old.failure_code is distinct from new.failure_code
    or old.failure_reason is distinct from new.failure_reason
    or old.idempotency_key is distinct from new.idempotency_key
    or old.action_label is distinct from new.action_label
    or old.created_at is distinct from new.created_at
    or old.updated_at is distinct from new.updated_at then
    raise exception 'Only notification inbox state can be updated.';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restrict_notification_delivery_inbox_updates_trigger
  on public.notification_deliveries;

create trigger restrict_notification_delivery_inbox_updates_trigger
before update on public.notification_deliveries
for each row
execute function public.restrict_notification_delivery_inbox_updates();

alter table if exists public.notification_deliveries enable row level security;

drop policy if exists "Users update own in-app notification state" on public.notification_deliveries;
create policy "Users update own in-app notification state"
  on public.notification_deliveries
  for update
  to authenticated
  using (auth.uid() = recipient_user_id and channel = 'in_app')
  with check (auth.uid() = recipient_user_id and channel = 'in_app');

grant update (seen_at, read_at, archived_at, clicked_at)
  on public.notification_deliveries to authenticated;

create or replace function public.notification_center_preference_enabled(
  p_user_id uuid,
  p_type text,
  p_channel text,
  p_transactional boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  prefs public.notification_preferences%rowtype;
  channel_enabled boolean := true;
  type_enabled boolean := true;
begin
  if coalesce(p_transactional, false) then
    return true;
  end if;

  select *
    into prefs
    from public.notification_preferences
   where user_id = p_user_id;

  if not found then
    return true;
  end if;

  channel_enabled := case p_channel
    when 'in_app' then coalesce(prefs.in_app_enabled, true)
    when 'email' then coalesce(prefs.email_enabled, true)
    when 'push' then coalesce(prefs.push_enabled, true)
    else true
  end;

  type_enabled := case p_type
    when 'workout_assigned' then coalesce(prefs.workout_assigned, true)
    when 'workout_updated' then coalesce(prefs.workout_updated, true)
    when 'checkin_requested' then coalesce(prefs.checkin_requested, true)
    when 'checkin_submitted' then coalesce(prefs.checkin_submitted, true)
    when 'message_received' then coalesce(prefs.message_received, true)
    when 'program_assigned' then coalesce(prefs.program_assigned, true)
    when 'habit_assigned' then coalesce(prefs.habit_reminders, true)
    when 'file_shared' then coalesce(prefs.files_resources, true)
    when 'join_request_submitted' then coalesce(prefs.join_requests, true)
    when 'join_request_approved' then coalesce(prefs.join_requests, true)
    when 'join_request_declined' then coalesce(prefs.join_requests, true)
    when 'client_inactive' then coalesce(prefs.inactivity_alerts, true)
    when 'system' then coalesce(prefs.system_events, true)
    else true
  end;

  return channel_enabled and type_enabled;
end;
$$;

create or replace function public.create_in_app_delivery_for_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
  v_delivery_status text;
begin
  v_allowed := public.notification_center_preference_enabled(
    new.recipient_user_id,
    new.type,
    'in_app',
    new.transactional or new.notification_class in ('transactional', 'security')
  );
  v_delivery_status := case when v_allowed then 'delivered' else 'suppressed_preference' end;

  insert into public.notification_deliveries (
    event_id,
    recipient_user_id,
    channel,
    status,
    notification_type,
    template_key,
    action_label,
    retry_count,
    idempotency_key
  )
  values (
    new.id,
    new.recipient_user_id,
    'in_app',
    v_delivery_status,
    new.type,
    coalesce(new.notification_class, 'product') || '.' || new.type,
    new.action_label,
    0,
    new.idempotency_key || ':in_app'
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

drop trigger if exists create_in_app_delivery_for_notification_event_trigger
  on public.notification_events;

create trigger create_in_app_delivery_for_notification_event_trigger
after insert on public.notification_events
for each row
execute function public.create_in_app_delivery_for_notification_event();

create or replace function public.notify_user(
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_body text default '',
  p_action_url text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_priority text default 'normal',
  p_category text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_id uuid;
  event_id uuid;
  should_deliver boolean;
  event_idempotency_key text;
begin
  should_deliver := public.notification_center_preference_enabled(
    p_recipient_user_id,
    p_type,
    'in_app',
    p_type in ('security', 'system')
  );

  insert into public.notifications (
    recipient_user_id,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    metadata,
    priority,
    category
  )
  select
    p_recipient_user_id,
    p_type,
    p_title,
    p_body,
    p_action_url,
    p_entity_type,
    p_entity_id,
    p_metadata,
    p_priority,
    p_category
  where should_deliver
  returning id into notification_id;

  event_idempotency_key := concat_ws(
    ':',
    'notify_user',
    p_recipient_user_id::text,
    p_type,
    coalesce(p_entity_type, 'none'),
    coalesce(p_entity_id::text, md5(coalesce(p_title, '') || coalesce(p_body, '')))
  );

  insert into public.notification_events (
    recipient_user_id,
    actor_type,
    type,
    notification_class,
    category,
    priority,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    metadata,
    transactional,
    idempotency_key
  )
  values (
    p_recipient_user_id,
    'system',
    p_type,
    case when p_type in ('security', 'system') then 'security' else 'product' end,
    coalesce(p_category, 'general'),
    coalesce(p_priority, 'normal'),
    p_title,
    p_body,
    p_action_url,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_type in ('security', 'system'),
    event_idempotency_key
  )
  on conflict (idempotency_key) do update
    set updated_at = public.notification_events.updated_at
  returning id into event_id;

  return coalesce(event_id, notification_id);
end;
$$;

create or replace function public.get_unread_notification_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.notification_deliveries
   where recipient_user_id = auth.uid()
     and channel = 'in_app'
     and read_at is null
     and archived_at is null
     and status <> 'suppressed_preference';
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.notification_deliveries
     set read_at = now(),
         seen_at = coalesce(seen_at, now()),
         updated_at = now()
   where recipient_user_id = auth.uid()
     and channel = 'in_app'
     and read_at is null
     and archived_at is null
     and status <> 'suppressed_preference';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.notification_center_preference_enabled(uuid, text, text, boolean)
  to authenticated, service_role;
grant execute on function public.create_in_app_delivery_for_notification_event()
  to service_role;
grant execute on function public.notify_user(uuid, text, text, text, text, text, uuid, jsonb, text, text)
  to authenticated, service_role;
grant execute on function public.get_unread_notification_count()
  to authenticated;
grant execute on function public.mark_all_notifications_read()
  to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.notification_deliveries;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
