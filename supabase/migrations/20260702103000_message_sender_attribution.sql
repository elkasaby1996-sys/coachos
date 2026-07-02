create or replace function public.conversation_sender_attributions(
  p_conversation_id uuid
)
returns table (
  sender_user_id uuid,
  display_name text,
  workspace_role text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_conversation record;
begin
  if (select auth.uid()) is null then
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
  where conv.id = p_conversation_id;

  if not found then
    return;
  end if;

  return query
  with message_senders as (
    select distinct on (m.sender_user_id)
      m.sender_user_id,
      m.sender_role,
      nullif(btrim(m.sender_name), '') as message_sender_name
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.sender_user_id is not null
    order by m.sender_user_id, m.created_at desc nulls last, m.id desc
  )
  select
    ms.sender_user_id,
    coalesce(
      nullif(btrim(c.display_name), ''),
      nullif(btrim(hub_profile.display_name), ''),
      nullif(btrim(hub_profile.full_name), ''),
      nullif(btrim(pt_profile.display_name), ''),
      ms.message_sender_name
    ) as display_name,
    case
      when ms.sender_role = 'client' then 'client'::text
      when ms.sender_role = 'system' then 'system'::text
      when workspace.owner_user_id = ms.sender_user_id then 'owner'::text
      else public.normalize_workspace_role(wm.role::text)
    end as workspace_role
  from message_senders ms
  left join public.workspaces workspace
    on workspace.id = v_conversation.workspace_id
  left join public.clients c
    on c.id = v_conversation.client_id
   and c.user_id = ms.sender_user_id
  left join public.workspace_members wm
    on wm.workspace_id = v_conversation.workspace_id
   and wm.user_id = ms.sender_user_id
  left join public.pt_hub_profiles hub_profile
    on hub_profile.user_id = ms.sender_user_id
  left join public.pt_profiles pt_profile
    on pt_profile.user_id = ms.sender_user_id;
end;
$$;

revoke all on function public.conversation_sender_attributions(uuid) from public, anon;
grant execute on function public.conversation_sender_attributions(uuid) to authenticated;
