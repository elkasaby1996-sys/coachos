create or replace function public.converted_lead_history_for_conversation(
  p_conversation_id uuid
)
returns table (
  lead_conversation_id uuid,
  lead_id uuid,
  message_id uuid,
  sender_user_id uuid,
  body text,
  sent_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_conversation record;
  v_context record;
  v_can_read_history boolean := false;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_conversation_id is null then
    return;
  end if;

  if not public.can_access_conversation(p_conversation_id, 'clients.message') then
    return;
  end if;

  select conv.id, conv.workspace_id, conv.client_id
  into v_conversation
  from public.conversations conv
  where conv.id = p_conversation_id
  limit 1;

  if not found then
    return;
  end if;

  if exists (
    select 1
    from public.clients c
    where c.id = v_conversation.client_id
      and c.workspace_id = v_conversation.workspace_id
      and c.user_id = v_actor_user_id
      and c.status = 'active'::public.client_status
  ) then
    v_can_read_history := true;
  else
    select *
    into v_context
    from public.workspace_access_context(v_conversation.workspace_id)
    limit 1;

    if found
       and v_context.role in ('owner', 'admin')
       and public.has_workspace_permission(
         v_context.role,
         v_context.member_status,
         'clients.message'
       ) then
      v_can_read_history := true;
    end if;
  end if;

  if not v_can_read_history then
    return;
  end if;

  return query
  select
    lc.id as lead_conversation_id,
    lead.id as lead_id,
    lm.id as message_id,
    lm.sender_user_id,
    lm.body,
    lm.sent_at
  from public.lead_conversations lc
  join public.pt_hub_leads lead
    on lead.id = lc.lead_id
   and lead.status = 'converted'
   and lead.converted_workspace_id = v_conversation.workspace_id
   and lead.converted_client_id = v_conversation.client_id
  join public.lead_messages lm
    on lm.conversation_id = lc.id
  where lc.converted_conversation_id = v_conversation.id
    and lc.archived_reason = 'converted'
  order by lm.sent_at asc, lm.id asc;
end;
$$;

revoke all on function public.converted_lead_history_for_conversation(uuid) from public, anon;
grant execute on function public.converted_lead_history_for_conversation(uuid) to authenticated;
