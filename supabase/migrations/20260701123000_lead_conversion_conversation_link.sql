alter table public.lead_conversations
  add column if not exists converted_conversation_id uuid
    references public.conversations(id) on delete set null;

create index if not exists lead_conversations_converted_conversation_id_idx
  on public.lead_conversations (converted_conversation_id);

create or replace function public.link_converted_lead_conversation(
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_lead record;
  v_active_conversation_id uuid;
begin
  if p_lead_id is null then
    return null;
  end if;

  select
    lead.id,
    lead.applicant_user_id,
    lead.status,
    lead.converted_workspace_id,
    lead.converted_client_id
  into v_lead
  from public.pt_hub_leads lead
  where lead.id = p_lead_id
  limit 1;

  if not found
     or v_lead.status <> 'converted'
     or v_lead.applicant_user_id is null
     or v_lead.converted_workspace_id is null
     or v_lead.converted_client_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = v_lead.converted_client_id
      and c.workspace_id = v_lead.converted_workspace_id
      and c.user_id = v_lead.applicant_user_id
      and c.status = 'active'::public.client_status
  ) then
    return null;
  end if;

  insert into public.conversations (workspace_id, client_id)
  values (v_lead.converted_workspace_id, v_lead.converted_client_id)
  on conflict on constraint conversations_workspace_client_key do nothing;

  select conv.id
  into v_active_conversation_id
  from public.conversations conv
  where conv.workspace_id = v_lead.converted_workspace_id
    and conv.client_id = v_lead.converted_client_id
  limit 1;

  if v_active_conversation_id is null then
    return null;
  end if;

  update public.lead_conversations lc
  set converted_conversation_id = v_active_conversation_id
  where lc.lead_id = v_lead.id
    and lc.converted_conversation_id is distinct from v_active_conversation_id;

  return v_active_conversation_id;
end;
$$;

create or replace function public.handle_link_converted_lead_conversation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.status = 'converted'
     and new.converted_workspace_id is not null
     and new.converted_client_id is not null then
    perform public.link_converted_lead_conversation(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_link_converted_lead_conversation
  on public.pt_hub_leads;

create trigger trg_link_converted_lead_conversation
after insert or update of status, converted_workspace_id, converted_client_id
on public.pt_hub_leads
for each row
execute function public.handle_link_converted_lead_conversation();

drop function if exists public.my_lead_chat_threads();

create or replace function public.my_lead_chat_threads()
returns table(
  lead_id uuid,
  conversation_id uuid,
  converted_conversation_id uuid,
  conversation_status text,
  archived_reason text,
  lead_status text,
  submitted_at timestamptz,
  pt_user_id uuid,
  pt_display_name text,
  pt_slug text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_user_id uuid;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    lead.id as lead_id,
    convo.id as conversation_id,
    convo.converted_conversation_id,
    convo.status as conversation_status,
    convo.archived_reason,
    lead.status as lead_status,
    lead.submitted_at,
    lead.user_id as pt_user_id,
    coalesce(
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(profile.full_name), ''),
      nullif(btrim(pt_profile.display_name), ''),
      'Coach'
    ) as pt_display_name,
    profile.slug as pt_slug,
    convo.last_message_at,
    convo.last_message_preview,
    coalesce((
      select count(*)::integer
      from public.lead_messages m
      where m.conversation_id = convo.id
        and m.sender_user_id <> v_actor_user_id
        and m.sent_at > coalesce(participant.last_read_at, '-infinity'::timestamptz)
    ), 0) as unread_count
  from public.pt_hub_leads lead
  left join public.lead_conversations convo
    on convo.lead_id = lead.id
  left join public.lead_conversation_participants participant
    on participant.conversation_id = convo.id
   and participant.user_id = v_actor_user_id
  left join public.pt_hub_profiles profile
    on profile.user_id = lead.user_id
  left join public.pt_profiles pt_profile
    on pt_profile.user_id = lead.user_id
  where lead.applicant_user_id = v_actor_user_id
    and lead.status = any (
      array[
        'new'::text,
        'contacted'::text,
        'approved_pending_workspace'::text,
        'converted'::text,
        'declined'::text
      ]
    )
  order by coalesce(convo.last_message_at, lead.submitted_at) desc;
end;
$$;

select public.link_converted_lead_conversation(lead.id)
from public.pt_hub_leads lead
where lead.status = 'converted'
  and lead.converted_workspace_id is not null
  and lead.converted_client_id is not null;

revoke all on function public.link_converted_lead_conversation(uuid) from public, anon, authenticated;
grant execute on function public.link_converted_lead_conversation(uuid) to service_role;

revoke all on function public.handle_link_converted_lead_conversation() from public, anon, authenticated;
grant execute on function public.handle_link_converted_lead_conversation() to service_role;

revoke all on function public.my_lead_chat_threads() from public, anon;
grant execute on function public.my_lead_chat_threads() to authenticated, service_role;
