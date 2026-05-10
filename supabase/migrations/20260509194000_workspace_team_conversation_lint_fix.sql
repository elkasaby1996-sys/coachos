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
  on conflict on constraint conversations_workspace_client_key do nothing
  returning *
  into v_conversation;

  if v_conversation.id is null then
    select conv.*
    into v_conversation
    from public.conversations conv
    where conv.workspace_id = p_workspace_id
      and conv.client_id = p_client_id
    limit 1;
  end if;

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

grant execute on function public.ensure_pt_conversation(uuid, uuid) to authenticated;
