create or replace function public.ensure_lead_conversation_for_lead(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_user_id uuid;
  v_lead public.pt_hub_leads%rowtype;
  v_conversation public.lead_conversations%rowtype;
  v_now timestamptz := now();
  v_should_open boolean;
  v_archive_reason text;
  v_previous_status text;
begin
  if p_lead_id is null then
    return null;
  end if;

  select *
  into v_lead
  from public.pt_hub_leads lead
  where lead.id = p_lead_id
  for update;

  if not found or v_lead.applicant_user_id is null then
    return null;
  end if;

  v_actor_user_id := auth.uid();
  if v_actor_user_id is not null
     and v_actor_user_id <> v_lead.user_id
     and v_actor_user_id <> v_lead.applicant_user_id then
    raise exception 'Not allowed to access this lead conversation';
  end if;

  v_should_open := public.lead_chat_is_open_lead_status(v_lead.status);

  if not v_should_open then
    v_archive_reason := case
      when v_lead.status = 'converted' then 'converted'
      when v_lead.status = 'declined' then 'declined'
      else 'manual'
    end;
  end if;

  select *
  into v_conversation
  from public.lead_conversations c
  where c.lead_id = v_lead.id
  for update;

  if not found then
    insert into public.lead_conversations (
      lead_id,
      pt_user_id,
      lead_user_id,
      status,
      archived_reason,
      archived_at
    )
    values (
      v_lead.id,
      v_lead.user_id,
      v_lead.applicant_user_id,
      case when v_should_open then 'open' else 'archived' end,
      case when v_should_open then null else v_archive_reason end,
      case when v_should_open then null else v_now end
    )
    returning * into v_conversation;

    perform public.log_lead_chat_event(
      v_lead.id,
      v_conversation.id,
      null,
      'lead_conversation_created',
      jsonb_build_object('status', v_conversation.status)
    );

    if v_conversation.status = 'archived' and v_archive_reason in ('converted', 'declined') then
      perform public.log_lead_chat_event(
        v_lead.id,
        v_conversation.id,
        null,
        case
          when v_archive_reason = 'converted' then 'lead_conversation_archived_converted'
          else 'lead_conversation_archived_declined'
        end,
        jsonb_build_object('reason', v_archive_reason)
      );
    end if;
  else
    v_previous_status := v_conversation.status;

    update public.lead_conversations c
    set
      pt_user_id = v_lead.user_id,
      lead_user_id = v_lead.applicant_user_id,
      status = case when v_should_open then 'open' else 'archived' end,
      archived_reason = case when v_should_open then null else v_archive_reason end,
      archived_at = case
        when v_should_open then null
        else coalesce(c.archived_at, v_now)
      end
    where c.id = v_conversation.id
    returning * into v_conversation;

    if v_previous_status = 'open' and v_conversation.status = 'archived' then
      perform public.log_lead_chat_event(
        v_lead.id,
        v_conversation.id,
        null,
        case
          when v_archive_reason = 'converted' then 'lead_conversation_archived_converted'
          when v_archive_reason = 'declined' then 'lead_conversation_archived_declined'
          else 'lead_conversation_archived_manual'
        end,
        jsonb_build_object('reason', v_archive_reason)
      );
    end if;
  end if;

  insert into public.lead_conversation_participants (conversation_id, user_id, role)
  values (v_conversation.id, v_lead.user_id, 'pt')
  on conflict (conversation_id, user_id) do update
    set role = 'pt';

  insert into public.lead_conversation_participants (conversation_id, user_id, role)
  values (v_conversation.id, v_lead.applicant_user_id, 'lead')
  on conflict (conversation_id, user_id) do update
    set role = 'lead';

  return v_conversation.id;
end;
$$;

revoke all on function public.ensure_lead_conversation_for_lead(uuid) from public, anon;
grant execute on function public.ensure_lead_conversation_for_lead(uuid) to authenticated, service_role;
