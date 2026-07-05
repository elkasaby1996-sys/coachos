create or replace function public.can_access_client(
  p_client_id uuid,
  p_permission text default 'clients.view'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_client record;
  v_context record;
begin
  if p_client_id is null then
    return false;
  end if;

  select c.id, c.workspace_id
  into v_client
  from public.clients c
  where c.id = p_client_id;

  if not found or v_client.workspace_id is null then
    return false;
  end if;

  select *
  into v_context
  from public.workspace_access_context(v_client.workspace_id)
  limit 1;

  if not found then
    return false;
  end if;

  if not public.has_workspace_permission(
    v_context.role,
    v_context.member_status,
    p_permission
  ) then
    return false;
  end if;

  if v_context.role in ('owner', 'admin') then
    return true;
  end if;

  if v_context.member_id is null then
    return false;
  end if;

  if p_permission = 'clients.message'
     and v_context.role = 'assistant_coach' then
    return exists (
      select 1
      from public.workspace_member_client_assignments wmca
      where wmca.workspace_id = v_client.workspace_id
        and wmca.member_id = v_context.member_id
        and wmca.client_id = v_client.id
    );
  end if;

  if v_context.client_access_mode = 'all_clients' then
    return true;
  end if;

  return exists (
    select 1
    from public.workspace_member_client_assignments wmca
    where wmca.workspace_id = v_client.workspace_id
      and wmca.member_id = v_context.member_id
      and wmca.client_id = v_client.id
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
  from public.clients c
  where c.workspace_id = p_workspace_id
    and public.can_access_client(c.id, 'clients.message')
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
  where conv.workspace_id = p_workspace_id
    and public.can_access_client(conv.client_id, 'clients.message')
  order by conv.last_message_at desc nulls last;
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

create or replace function public.handle_message_received_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_conversation record;
  v_recipient record;
  v_client_name text;
  v_preview text;
  v_sender_name text;
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
  v_sender_name := coalesce(nullif(trim(new.sender_name), ''), 'your coach');

  if new.sender_role = 'pt' then
    if v_conversation.client_user_id is not null
       and v_conversation.client_user_id is distinct from new.sender_user_id then
      perform public.notify_user(
        v_conversation.client_user_id,
        'message_received',
        format('New message from %s', v_sender_name),
        coalesce(nullif(v_preview, ''), 'Open messages to read it.'),
        '/app/messages',
        'conversation',
        new.conversation_id,
        null,
        jsonb_build_object(
          'conversation_id', new.conversation_id,
          'client_id', v_conversation.client_id
        ),
        'messages',
        'normal'
      );
    end if;
    return new;
  end if;

  if new.sender_role = 'client' then
    for v_recipient in
      select distinct wm.user_id
      from public.workspace_members wm
      where wm.workspace_id = v_conversation.workspace_id
        and wm.status = 'active'
        and wm.user_id is distinct from new.sender_user_id
        and public.has_workspace_permission(
          wm.role::text,
          wm.status,
          'clients.message'
        )
        and (
          public.normalize_workspace_role(wm.role::text) in ('owner', 'admin')
          or (
            public.normalize_workspace_role(wm.role::text) <> 'assistant_coach'
            and wm.client_access_mode = 'all_clients'
          )
          or exists (
            select 1
            from public.workspace_member_client_assignments wmca
            where wmca.workspace_id = v_conversation.workspace_id
              and wmca.member_id = wm.id
              and wmca.client_id = v_conversation.client_id
          )
        )
      union
      select w.owner_user_id
      from public.workspaces w
      where w.id = v_conversation.workspace_id
        and w.owner_user_id is not null
        and w.owner_user_id is distinct from new.sender_user_id
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
        jsonb_build_object(
          'conversation_id', new.conversation_id,
          'client_id', v_conversation.client_id
        ),
        'messages',
        'normal'
      );
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.can_access_client(uuid, text) from public, anon;
grant execute on function public.can_access_client(uuid, text) to authenticated;

revoke all on function public.pt_message_recipients(uuid) from public, anon;
grant execute on function public.pt_message_recipients(uuid) to authenticated;

revoke all on function public.pt_accessible_conversations(uuid) from public, anon;
grant execute on function public.pt_accessible_conversations(uuid) to authenticated;
