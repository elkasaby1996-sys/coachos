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
      and c.workspace_id is not null
      and c.status = 'active'::public.client_status
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

create or replace function public.client_accessible_conversations_with_ensure()
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
  v_user_id uuid := (select auth.uid());
  relationship record;
  v_conversation public.conversations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  for relationship in
    select
      c.id as client_id,
      c.workspace_id
    from public.clients c
    where c.user_id = v_user_id
      and c.workspace_id is not null
      and c.status = 'active'::public.client_status
    order by c.created_at asc, c.id asc
  loop
    insert into public.conversations (workspace_id, client_id)
    values (relationship.workspace_id, relationship.client_id)
    on conflict on constraint conversations_workspace_client_key do nothing;

    select conv.*
    into v_conversation
    from public.conversations conv
    where conv.workspace_id = relationship.workspace_id
      and conv.client_id = relationship.client_id
    limit 1;

    if v_conversation.id is not null then
      return query
      select
        v_conversation.id,
        v_conversation.client_id,
        v_conversation.workspace_id,
        v_conversation.last_message_at,
        v_conversation.last_message_preview,
        v_conversation.last_message_sender_name,
        v_conversation.last_message_sender_role;
    end if;
  end loop;
end;
$$;

revoke all on function public.client_accessible_conversations_with_ensure() from public, anon;
grant execute on function public.client_accessible_conversations_with_ensure() to authenticated;
revoke all on function public.can_access_conversation(uuid, text) from public, anon;
grant execute on function public.can_access_conversation(uuid, text) to authenticated;
