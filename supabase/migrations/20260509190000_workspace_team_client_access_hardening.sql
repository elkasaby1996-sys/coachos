create or replace function public.can_access_conversation(
  p_conversation_id uuid,
  p_permission text default 'clients.message'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_conversation record;
  v_context record;
begin
  if p_conversation_id is null then
    return false;
  end if;

  select conv.id, conv.workspace_id, conv.client_id
  into v_conversation
  from public.conversations conv
  where conv.id = p_conversation_id;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.clients c
    where c.id = v_conversation.client_id
      and c.user_id = (select auth.uid())
  ) then
    return true;
  end if;

  if v_conversation.client_id is not null then
    return public.can_access_client(v_conversation.client_id, p_permission);
  end if;

  select *
  into v_context
  from public.workspace_access_context(v_conversation.workspace_id)
  limit 1;

  if not found then
    return false;
  end if;

  return public.has_workspace_permission(
    v_context.role,
    v_context.member_status,
    p_permission
  );
end;
$$;

create or replace function public.pt_message_recipients(p_workspace_id uuid)
returns table (
  id uuid,
  display_name text,
  user_id uuid,
  lifecycle_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'Workspace is required';
  end if;

  if not exists (
    select 1
    from public.workspace_access_context(p_workspace_id) ctx
    where public.has_workspace_permission(
      ctx.role,
      ctx.member_status,
      'clients.message'
    )
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    c.id,
    c.display_name,
    c.user_id,
    c.lifecycle_state
  from public.accessible_client_ids(p_workspace_id) aci
  join public.clients c
    on c.id = aci.client_id
  order by c.display_name asc nulls last, c.created_at asc;
end;
$$;

create or replace function public.pt_accessible_conversations(p_workspace_id uuid)
returns table (
  id uuid,
  client_id uuid,
  workspace_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender_name text,
  last_message_sender_role text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if p_workspace_id is null then
    raise exception 'Workspace is required';
  end if;

  if not exists (
    select 1
    from public.workspace_access_context(p_workspace_id) ctx
    where public.has_workspace_permission(
      ctx.role,
      ctx.member_status,
      'clients.message'
    )
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    conv.id,
    conv.client_id,
    conv.workspace_id,
    conv.last_message_at,
    conv.last_message_preview,
    conv.last_message_sender_name,
    conv.last_message_sender_role
  from public.conversations conv
  join public.accessible_client_ids(p_workspace_id) aci
    on aci.client_id = conv.client_id
  where conv.workspace_id = p_workspace_id
  order by conv.last_message_at desc nulls last;
end;
$$;

create or replace function public.ensure_pt_conversation(
  p_workspace_id uuid,
  p_client_id uuid
)
returns table (
  id uuid,
  client_id uuid,
  workspace_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_sender_name text,
  last_message_sender_role text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_conversation public.conversations%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_access_client(p_client_id, 'clients.message') then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.workspace_id = p_workspace_id
  ) then
    raise exception 'Client not found';
  end if;

  insert into public.conversations (workspace_id, client_id)
  values (p_workspace_id, p_client_id)
  on conflict (workspace_id, client_id) do update
  set workspace_id = excluded.workspace_id
  returning *
  into v_conversation;

  return query
  select
    v_conversation.id,
    v_conversation.client_id,
    v_conversation.workspace_id,
    v_conversation.last_message_at,
    v_conversation.last_message_preview,
    v_conversation.last_message_sender_name,
    v_conversation.last_message_sender_role;
end;
$$;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_sender_user_id uuid,
  p_sender_role text,
  p_sender_name text,
  p_body text,
  p_unread boolean default false
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_user_id uuid,
  sender_role text,
  sender_name text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_user_id uuid := (select auth.uid());
  v_message public.messages%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_sender_user_id is distinct from v_user_id then
    raise exception 'Not authorized';
  end if;

  if v_body = '' then
    raise exception 'Message body is required';
  end if;

  if p_sender_role = 'pt' then
    if not public.can_access_conversation(p_conversation_id, 'clients.message') then
      raise exception 'Not authorized';
    end if;
  elsif p_sender_role = 'client' then
    if not public.can_access_conversation(p_conversation_id, 'clients.view') then
      raise exception 'Not authorized';
    end if;
  else
    raise exception 'Invalid sender role';
  end if;

  insert into public.messages (
    conversation_id,
    sender_user_id,
    sender_role,
    sender_name,
    body,
    preview,
    unread
  )
  values (
    p_conversation_id,
    p_sender_user_id,
    p_sender_role,
    p_sender_name,
    v_body,
    left(v_body, 140),
    coalesce(p_unread, false)
  )
  returning *
  into v_message;

  return query
  select
    v_message.id,
    v_message.conversation_id,
    v_message.sender_user_id,
    v_message.sender_role,
    v_message.sender_name,
    v_message.body,
    v_message.created_at;
end;
$$;

drop policy if exists conversations_access on public.conversations;
create policy conversations_access
on public.conversations
to authenticated
using (
  public.can_access_conversation(id, 'clients.message')
)
with check (
  client_id is not null
  and public.can_access_client(client_id, 'clients.message')
);

drop policy if exists messages_access on public.messages;
create policy messages_access
on public.messages
to authenticated
using (
  public.can_access_conversation(conversation_id, 'clients.message')
)
with check (
  public.can_access_conversation(conversation_id, 'clients.message')
);

drop policy if exists message_typing_access on public.message_typing;
create policy message_typing_access
on public.message_typing
to authenticated
using (
  public.can_access_conversation(conversation_id, 'clients.message')
)
with check (
  public.can_access_conversation(conversation_id, 'clients.message')
);

create or replace function public.pt_update_client_admin_fields(
  p_client_id uuid,
  p_training_type text,
  p_tags text
)
returns public.clients
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_tags text[];
  v_client public.clients;
begin
  if not public.can_access_client(p_client_id, 'clients.edit') then
    raise exception 'not allowed';
  end if;

  if p_training_type is not null
     and p_training_type not in ('online', 'hybrid', 'in_person') then
    raise exception 'invalid training_type %', p_training_type;
  end if;

  v_tags := case
    when p_tags is null or btrim(p_tags) = '' then null
    else regexp_split_to_array(p_tags, '\s*,\s*')
  end;

  update public.clients
  set
    training_type = coalesce(p_training_type, training_type),
    tags = coalesce(v_tags, tags)
  where id = p_client_id
  returning *
  into v_client;

  return v_client;
end;
$$;

create or replace function public.pt_update_client_checkin_settings(
  p_client_id uuid,
  p_checkin_template_id uuid default null,
  p_checkin_frequency text default 'weekly',
  p_checkin_start_date date default null
)
returns public.clients
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_client public.clients;
  v_template_workspace_id uuid;
  v_frequency text := coalesce(nullif(trim(p_checkin_frequency), ''), 'weekly');
  v_onboarding_due_date date;
begin
  if not public.can_access_client(p_client_id, 'delivery.manage') then
    raise exception 'Not authorized';
  end if;

  select c.*
  into v_client
  from public.clients c
  where c.id = p_client_id;

  if v_client.id is null then
    raise exception 'Client not found';
  end if;

  if v_frequency not in ('weekly', 'biweekly', 'monthly') then
    raise exception 'Invalid check-in frequency';
  end if;

  if p_checkin_template_id is not null then
    select ct.workspace_id
    into v_template_workspace_id
    from public.checkin_templates ct
    where ct.id = p_checkin_template_id;

    if v_template_workspace_id is null then
      raise exception 'Check-in template not found';
    end if;

    if v_template_workspace_id <> v_client.workspace_id then
      raise exception 'Check-in template not in client workspace';
    end if;
  end if;

  update public.clients
  set
    checkin_template_id = p_checkin_template_id,
    checkin_frequency = v_frequency,
    checkin_start_date = p_checkin_start_date
  where id = p_client_id
  returning *
  into v_client;

  if p_checkin_template_id is not null and p_checkin_start_date is not null then
    v_onboarding_due_date := public.normalize_checkin_due_date(
      p_checkin_start_date
    );
  else
    v_onboarding_due_date := null;
  end if;

  update public.workspace_client_onboardings
  set
    first_checkin_template_id = p_checkin_template_id,
    first_checkin_date = v_onboarding_due_date,
    first_checkin_scheduled_at = case
      when v_onboarding_due_date is not null then now()
      else null
    end
  where workspace_id = v_client.workspace_id
    and client_id = v_client.id
    and completed_at is null;

  return v_client;
end;
$$;

create or replace function public.pt_update_client_lifecycle(
  p_client_id uuid,
  p_lifecycle_state text,
  p_reason text default null
)
returns table(
  id uuid,
  status text,
  lifecycle_state text,
  lifecycle_changed_at timestamptz,
  paused_reason text,
  churn_reason text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.can_access_client(p_client_id, 'clients.lifecycle.update') then
    raise exception 'Not authorized';
  end if;

  return query
  update public.clients c
  set
    lifecycle_state = trim(coalesce(p_lifecycle_state, '')),
    paused_reason = case when trim(coalesce(p_lifecycle_state, '')) = 'paused' then v_reason else null end,
    churn_reason = case when trim(coalesce(p_lifecycle_state, '')) = 'churned' then v_reason else null end,
    updated_at = now()
  where c.id = p_client_id
  returning
    c.id,
    c.status::text,
    c.lifecycle_state,
    c.lifecycle_changed_at,
    c.paused_reason,
    c.churn_reason;
end;
$$;

grant execute on function public.can_access_conversation(uuid, text) to authenticated;
grant execute on function public.pt_message_recipients(uuid) to authenticated;
grant execute on function public.pt_accessible_conversations(uuid) to authenticated;
grant execute on function public.ensure_pt_conversation(uuid, uuid) to authenticated;
grant execute on function public.send_conversation_message(uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.pt_update_client_admin_fields(uuid, text, text) to authenticated;
grant execute on function public.pt_update_client_checkin_settings(uuid, uuid, text, date) to authenticated;
grant execute on function public.pt_update_client_lifecycle(uuid, text, text) to authenticated;
