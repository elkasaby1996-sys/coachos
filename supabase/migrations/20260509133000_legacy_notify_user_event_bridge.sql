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
set search_path = public
as $$
declare
  notification_id uuid;
  event_id uuid;
  should_deliver_legacy boolean;
  event_idempotency_key text;
  event_metadata jsonb;
begin
  should_deliver_legacy := public.notification_center_preference_enabled(
    p_recipient_user_id,
    p_type,
    'in_app',
    p_type in ('security', 'system')
  );

  event_metadata := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'action_url', p_action_url,
      'category', coalesce(p_category, 'general'),
      'priority', coalesce(p_priority, 'normal')
    );

  insert into public.notifications (
    recipient_user_id,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    image_url,
    metadata,
    category,
    priority
  )
  select
    p_recipient_user_id,
    p_type,
    p_title,
    coalesce(p_body, ''),
    p_action_url,
    p_entity_type,
    p_entity_id,
    p_image_url,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_category, 'general'),
    coalesce(p_priority, 'normal')
  where should_deliver_legacy
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
    action_label,
    entity_type,
    entity_id,
    image_url,
    metadata,
    transactional,
    idempotency_key
  )
  values (
    p_recipient_user_id,
    case
      when coalesce(p_action_url, '') like '/app%' then 'client'
      when coalesce(p_action_url, '') like '/client/onboarding%' then 'client'
      when coalesce(p_action_url, '') like '/pt%' then 'pt'
      when coalesce(p_action_url, '') like '/workspace/%' then 'pt'
      else 'system'
    end,
    p_type,
    case
      when p_type in ('security', 'system') then 'security'
      when p_type in ('workout_due_today', 'checkin_due_tomorrow') then 'reminder'
      else 'product'
    end,
    coalesce(p_category, 'general'),
    coalesce(p_priority, 'normal'),
    p_title,
    coalesce(p_body, ''),
    p_action_url,
    case
      when p_type = 'workout_assigned' then 'Open workout'
      when p_type = 'workout_updated' then 'View workout'
      else 'Open RepSync'
    end,
    p_entity_type,
    p_entity_id,
    p_image_url,
    event_metadata,
    p_type in ('security', 'system'),
    event_idempotency_key
  )
  on conflict (idempotency_key) do update
    set updated_at = public.notification_events.updated_at
  returning id into event_id;

  return coalesce(event_id, notification_id);
end;
$$;

grant execute on function public.notify_user(
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  text,
  jsonb,
  text,
  text
) to authenticated, service_role;
