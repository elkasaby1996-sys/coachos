create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  category text not null default 'general',
  priority text not null default 'normal',
  title text not null,
  body text not null,
  action_url text null,
  entity_type text null,
  entity_id uuid null,
  image_url text null,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz null,
  delivery_in_app boolean not null default true,
  delivery_email boolean not null default false,
  delivery_push boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists notifications_recipient_read_created_at_idx
  on public.notifications (recipient_user_id, is_read, created_at desc);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  workout_assigned boolean not null default true,
  workout_updated boolean not null default true,
  checkin_requested boolean not null default true,
  checkin_submitted boolean not null default true,
  message_received boolean not null default true,
  reminders_enabled boolean not null default true,
  milestone_events boolean not null default true,
  inactivity_alerts boolean not null default true,
  system_events boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_notification_preferences_updated_at'
  ) then
    create trigger set_notification_preferences_updated_at
    before update on public.notification_preferences
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (recipient_user_id = (select auth.uid()));

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
  on public.notification_preferences
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, update on public.notifications to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
revoke insert, delete on public.notifications from authenticated;
revoke all on public.notifications from anon;
revoke all on public.notification_preferences from anon;

create or replace function public.notification_pref_enabled(
  p_user_id uuid,
  p_type text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prefs public.notification_preferences%rowtype;
begin
  if p_user_id is null then
    return false;
  end if;

  select *
  into prefs
  from public.notification_preferences
  where user_id = p_user_id;

  if prefs.user_id is null then
    return true;
  end if;

  if coalesce(prefs.in_app_enabled, true) = false then
    return false;
  end if;

  case p_type
    when 'workout_assigned' then return coalesce(prefs.workout_assigned, true);
    when 'workout_updated' then return coalesce(prefs.workout_updated, true);
    when 'checkin_requested' then return coalesce(prefs.checkin_requested, true);
    when 'checkin_submitted' then return coalesce(prefs.checkin_submitted, true);
    when 'message_received' then return coalesce(prefs.message_received, true);
    when 'milestone_achieved' then return coalesce(prefs.milestone_events, true);
    when 'workout_due_today' then return coalesce(prefs.reminders_enabled, true);
    when 'checkin_due_tomorrow' then return coalesce(prefs.reminders_enabled, true);
    when 'client_inactive' then return coalesce(prefs.inactivity_alerts, true);
    when 'system' then return coalesce(prefs.system_events, true);
    when 'client_joined_workspace' then return coalesce(prefs.system_events, true);
    when 'invite_accepted' then return coalesce(prefs.system_events, true);
    else
      return true;
  end case;
end;
$$;

create or replace function public.notify_user(
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_action_url text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_image_url text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_category text default 'general',
  p_priority text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification_id uuid;
begin
  if p_recipient_user_id is null then
    return null;
  end if;

  if not public.notification_pref_enabled(p_recipient_user_id, p_type) then
    return null;
  end if;

  insert into public.notifications (
    recipient_user_id,
    type,
    category,
    priority,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    image_url,
    metadata
  )
  values (
    p_recipient_user_id,
    p_type,
    coalesce(nullif(trim(p_category), ''), 'general'),
    coalesce(nullif(trim(p_priority), ''), 'normal'),
    p_title,
    p_body,
    p_action_url,
    p_entity_type,
    p_entity_id,
    p_image_url,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

create or replace function public.restrict_notification_updates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.recipient_user_id is distinct from old.recipient_user_id
     or new.type is distinct from old.type
     or new.category is distinct from old.category
     or new.priority is distinct from old.priority
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.action_url is distinct from old.action_url
     or new.entity_type is distinct from old.entity_type
     or new.entity_id is distinct from old.entity_id
     or new.image_url is distinct from old.image_url
     or new.metadata is distinct from old.metadata
     or new.delivery_in_app is distinct from old.delivery_in_app
     or new.delivery_email is distinct from old.delivery_email
     or new.delivery_push is distinct from old.delivery_push
     or new.created_at is distinct from old.created_at then
    raise exception 'Only notification read state can be updated.';
  end if;

  if new.is_read and new.read_at is null then
    new.read_at := now();
  elsif not new.is_read then
    new.read_at := null;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'restrict_notification_updates_trigger'
  ) then
    create trigger restrict_notification_updates_trigger
    before update on public.notifications
    for each row execute function public.restrict_notification_updates();
  end if;
end $$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_updated integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.notifications
  set is_read = true,
      read_at = now()
  where recipient_user_id = v_user_id
    and is_read = false;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.get_unread_notification_count()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.notifications
  where recipient_user_id = auth.uid()
    and is_read = false;
$$;

revoke all on function public.notification_pref_enabled(uuid, text) from public;
revoke all on function public.notify_user(uuid, text, text, text, text, text, uuid, text, jsonb, text, text) from public;
revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.get_unread_notification_count() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.get_unread_notification_count() to authenticated;

create or replace function public.handle_assigned_workout_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_user_id uuid;
  v_workout_name text;
  v_date_label text;
begin
  select c.user_id
  into v_client_user_id
  from public.clients c
  where c.id = new.client_id;

  if v_client_user_id is null then
    return new;
  end if;

  v_workout_name := coalesce(nullif(trim(new.workout_name), ''), 'Workout');
  v_date_label := to_char(new.scheduled_date::timestamp, 'Mon DD');

  if tg_op = 'INSERT' then
    perform public.notify_user(
      v_client_user_id,
      'workout_assigned',
      'Workout assigned',
      format('%s is scheduled for %s.', v_workout_name, v_date_label),
      '/app/home',
      'assigned_workout',
      new.id,
      null,
      jsonb_build_object('scheduled_date', new.scheduled_date, 'client_id', new.client_id),
      'workouts',
      'normal'
    );
    return new;
  end if;

  if new.scheduled_date is not distinct from old.scheduled_date
     and new.workout_template_id is not distinct from old.workout_template_id
     and new.day_type is not distinct from old.day_type
     and coalesce(new.workout_name, '') = coalesce(old.workout_name, '')
     and coalesce(new.coach_note, '') = coalesce(old.coach_note, '') then
    return new;
  end if;

  perform public.notify_user(
    v_client_user_id,
    'workout_updated',
    'Workout updated',
    format('Your coach updated your workout for %s.', v_date_label),
    '/app/home',
    'assigned_workout',
    new.id,
    null,
    jsonb_build_object('scheduled_date', new.scheduled_date, 'client_id', new.client_id),
    'workouts',
    'normal'
  );

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'assigned_workout_notifications_insert'
  ) then
    create trigger assigned_workout_notifications_insert
    after insert on public.assigned_workouts
    for each row execute function public.handle_assigned_workout_notifications();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'assigned_workout_notifications_update'
  ) then
    create trigger assigned_workout_notifications_update
    after update on public.assigned_workouts
    for each row execute function public.handle_assigned_workout_notifications();
  end if;
end $$;

create or replace function public.handle_checkin_requested_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_user_id uuid;
  v_workspace_id uuid;
begin
  select c.user_id, c.workspace_id
  into v_client_user_id, v_workspace_id
  from public.clients c
  where c.id = new.client_id;

  if v_client_user_id is null or new.submitted_at is not null then
    return new;
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  ) then
    return new;
  end if;

  perform public.notify_user(
    v_client_user_id,
    'checkin_requested',
    'Check-in requested',
    format('Your coach requested a check-in for the week ending %s.', to_char(new.week_ending_saturday::timestamp, 'Mon DD')),
    '/app/checkin',
    'checkin',
    new.id,
    null,
    jsonb_build_object('week_ending_saturday', new.week_ending_saturday, 'client_id', new.client_id),
    'checkins',
    'normal'
  );

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'checkin_requested_notifications_insert'
  ) then
    create trigger checkin_requested_notifications_insert
    after insert on public.checkins
    for each row execute function public.handle_checkin_requested_notifications();
  end if;
end $$;

create or replace function public.handle_checkin_submitted_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_client_name text;
  v_recipient record;
begin
  if old.submitted_at is not null or new.submitted_at is null then
    return new;
  end if;

  select c.workspace_id,
         coalesce(nullif(trim(c.display_name), ''), 'A client')
  into v_workspace_id, v_client_name
  from public.clients c
  where c.id = new.client_id;

  if v_workspace_id is null then
    return new;
  end if;

  for v_recipient in
    select wm.user_id
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.role::text like 'pt_%'
  loop
    perform public.notify_user(
      v_recipient.user_id,
      'checkin_submitted',
      'Check-in submitted',
      format('%s submitted a check-in.', v_client_name),
      format('/pt/clients/%s?tab=checkins', new.client_id),
      'checkin',
      new.id,
      null,
      jsonb_build_object('week_ending_saturday', new.week_ending_saturday, 'client_id', new.client_id),
      'checkins',
      'normal'
    );
  end loop;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'checkin_submitted_notifications_update'
  ) then
    create trigger checkin_submitted_notifications_update
    after update on public.checkins
    for each row execute function public.handle_checkin_submitted_notifications();
  end if;
end $$;

create or replace function public.handle_message_received_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation record;
  v_recipient record;
  v_client_name text;
  v_preview text;
begin
  select conv.client_id,
         conv.workspace_id,
         c.user_id as client_user_id,
         coalesce(nullif(trim(c.display_name), ''), 'Client') as client_name
  into v_conversation
  from public.conversations conv
  join public.clients c on c.id = conv.client_id
  where conv.id = new.conversation_id;

  if v_conversation.client_id is null then
    return new;
  end if;

  v_client_name := v_conversation.client_name;
  v_preview := left(coalesce(new.preview, new.body, ''), 140);

  if new.sender_role = 'pt' then
    perform public.notify_user(
      v_conversation.client_user_id,
      'message_received',
      'New message from your coach',
      coalesce(nullif(v_preview, ''), 'Open messages to read it.'),
      '/app/messages',
      'conversation',
      new.conversation_id,
      null,
      jsonb_build_object('conversation_id', new.conversation_id, 'client_id', v_conversation.client_id),
      'messages',
      'normal'
    );
    return new;
  end if;

  if new.sender_role = 'client' then
    for v_recipient in
      select wm.user_id
      from public.workspace_members wm
      where wm.workspace_id = v_conversation.workspace_id
        and wm.role::text like 'pt_%'
    loop
      perform public.notify_user(
        v_recipient.user_id,
        'message_received',
        format('New message from %s', v_client_name),
        coalesce(nullif(v_preview, ''), 'Open messages to read it.'),
        format('/pt/messages?client=%s', v_conversation.client_id),
        'conversation',
        new.conversation_id,
        null,
        jsonb_build_object('conversation_id', new.conversation_id, 'client_id', v_conversation.client_id),
        'messages',
        'normal'
      );
    end loop;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'message_received_notifications_insert'
  ) then
    create trigger message_received_notifications_insert
    after insert on public.messages
    for each row execute function public.handle_message_received_notifications();
  end if;
end $$;

create or replace function public.handle_invite_accepted_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_recipient record;
  v_client_name text;
  v_target_client_id uuid;
begin
  if coalesce(new.uses, 0) <= coalesce(old.uses, 0)
     and new.used_at is not distinct from old.used_at then
    return new;
  end if;

  select c.id,
         coalesce(nullif(trim(c.display_name), ''), 'A client') as display_name
  into v_client
  from public.clients c
  where c.workspace_id = new.workspace_id
    and c.user_id = auth.uid()
  order by c.created_at desc
  limit 1;

  v_target_client_id := v_client.id;
  v_client_name := coalesce(v_client.display_name, 'A client');

  if new.created_by_user_id is not null then
    perform public.notify_user(
      new.created_by_user_id,
      'invite_accepted',
      'Invite accepted',
      format('%s accepted your invite.', v_client_name),
      coalesce(format('/pt/clients/%s', v_target_client_id), '/pt/clients'),
      'invite',
      new.id,
      null,
      jsonb_build_object('workspace_id', new.workspace_id, 'client_id', v_target_client_id),
      'system',
      'normal'
    );
    return new;
  end if;

  for v_recipient in
    select wm.user_id
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and wm.role::text like 'pt_%'
  loop
    perform public.notify_user(
      v_recipient.user_id,
      'client_joined_workspace',
      'Client joined your workspace',
      format('%s joined your workspace.', v_client_name),
      coalesce(format('/pt/clients/%s', v_target_client_id), '/pt/clients'),
      'client',
      v_target_client_id,
      null,
      jsonb_build_object('workspace_id', new.workspace_id, 'client_id', v_target_client_id),
      'system',
      'normal'
    );
  end loop;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'invite_accepted_notifications_update'
  ) then
    create trigger invite_accepted_notifications_update
    after update on public.invites
    for each row execute function public.handle_invite_accepted_notifications();
  end if;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.notifications';
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end $$;
