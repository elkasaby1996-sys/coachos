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

  if new.week_ending_saturday > current_date + 7 then
    return new;
  end if;

  if exists (
    select 1
    from public.checkins ci
    where ci.client_id = new.client_id
      and ci.id <> new.id
      and ci.submitted_at is null
      and ci.week_ending_saturday < new.week_ending_saturday
  ) then
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
