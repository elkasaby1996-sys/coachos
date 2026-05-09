alter table if exists public.notification_deliveries
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists next_retry_at timestamptz;

create index if not exists notification_deliveries_email_status_retry_idx
  on public.notification_deliveries (channel, status, next_retry_at, created_at)
  where channel = 'email';

create or replace function public.notification_email_template_key(
  p_actor_type text,
  p_type text
)
returns text
language sql
stable
as $$
  select case
    when p_actor_type = 'client' and p_type = 'workout_assigned' then 'client.workout_assigned'
    when p_actor_type = 'client' and p_type = 'program_assigned' then 'client.program_assigned'
    when p_actor_type = 'client' and p_type = 'habit_assigned' then 'client.habit_assigned'
    when p_actor_type = 'client' and p_type in ('workout_due_today', 'checkin_due_tomorrow', 'checkin_requested') then 'client.checkin_due'
    when p_actor_type = 'client' and p_type = 'checkin_submitted' then 'client.checkin_feedback'
    when p_actor_type = 'client' and p_type = 'message_received' then 'client.message_received'
    when p_actor_type = 'client' and p_type = 'file_shared' then 'client.file_shared'
    when p_actor_type = 'pt' and p_type = 'join_request_submitted' then 'pt.join_request_submitted'
    when p_actor_type = 'pt' and p_type = 'client_inactive' then 'pt.client_escalation'
    when p_actor_type = 'pt' and p_type in ('checkin_due_tomorrow', 'workout_due_today') then 'pt.missed_checkin_summary'
    when p_actor_type = 'pt' and p_type in ('client_joined_workspace', 'client_assigned_workspace', 'invite_accepted') then 'pt.client_onboarding'
    when p_actor_type = 'pt' and p_type = 'system' then 'pt.product_update'
    else coalesce(nullif(p_actor_type, 'system'), 'pt') || '.' || p_type
  end;
$$;

create or replace function public.create_email_delivery_for_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_allowed boolean;
  v_recipient_email text;
  v_delivery_status text;
begin
  select email
    into v_recipient_email
    from auth.users
   where id = new.recipient_user_id;

  v_allowed := public.notification_center_preference_enabled(
    new.recipient_user_id,
    new.type,
    'email',
    new.transactional or new.notification_class in ('transactional', 'security')
  );

  v_delivery_status := case
    when nullif(trim(coalesce(v_recipient_email, '')), '') is null then 'suppressed_no_channel'
    when not v_allowed then 'suppressed_preference'
    else 'queued'
  end;

  insert into public.notification_deliveries (
    event_id,
    recipient_user_id,
    recipient_email,
    channel,
    status,
    notification_type,
    template_key,
    retry_count,
    provider,
    provider_message_id,
    idempotency_key
  )
  values (
    new.id,
    new.recipient_user_id,
    nullif(trim(coalesce(v_recipient_email, '')), ''),
    'email',
    v_delivery_status,
    new.type,
    public.notification_email_template_key(new.actor_type, new.type),
    0,
    case when v_delivery_status = 'queued' then 'dev-log' else null end,
    null,
    new.idempotency_key || ':email'
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

drop trigger if exists create_email_delivery_for_notification_event_trigger
  on public.notification_events;

create trigger create_email_delivery_for_notification_event_trigger
after insert on public.notification_events
for each row
execute function public.create_email_delivery_for_notification_event();

grant execute on function public.notification_email_template_key(text, text)
  to authenticated, service_role;
grant execute on function public.create_email_delivery_for_notification_event()
  to service_role;

drop policy if exists "Service role can manage notification deliveries"
  on public.notification_deliveries;
create policy "Service role can manage notification deliveries"
  on public.notification_deliveries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant all on public.notification_deliveries to service_role;
