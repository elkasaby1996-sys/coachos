create table if not exists public.lead_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.pt_hub_leads(id) on delete cascade,
  pt_user_id uuid not null references auth.users(id) on delete cascade,
  lead_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status = any (array['open'::text, 'archived'::text])),
  archived_reason text null check (archived_reason is null or archived_reason = any (array['converted'::text, 'declined'::text, 'manual'::text])),
  created_at timestamptz not null default now(),
  archived_at timestamptz null,
  last_message_at timestamptz null,
  last_message_preview text null
);

create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  sent_at timestamptz not null default now(),
  edited_at timestamptz null,
  constraint lead_messages_body_not_empty check (nullif(btrim(body), '') is not null)
);

create table if not exists public.lead_conversation_participants (
  conversation_id uuid not null references public.lead_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role = any (array['pt'::text, 'lead'::text])),
  last_read_message_id uuid null,
  last_read_at timestamptz null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.lead_conversation_participants
  add constraint lead_conversation_participants_last_read_message_fkey
  foreign key (last_read_message_id)
  references public.lead_messages(id)
  on delete set null;

create table if not exists public.lead_chat_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.pt_hub_leads(id) on delete cascade,
  conversation_id uuid null references public.lead_conversations(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_conversations_pt_user_id_idx
  on public.lead_conversations (pt_user_id);

create index if not exists lead_conversations_lead_user_id_idx
  on public.lead_conversations (lead_user_id);

create index if not exists lead_conversations_status_idx
  on public.lead_conversations (status, last_message_at desc nulls last);

create index if not exists lead_messages_conversation_sent_at_idx
  on public.lead_messages (conversation_id, sent_at desc, id desc);

create index if not exists lead_messages_sender_user_id_idx
  on public.lead_messages (sender_user_id, sent_at desc);

create index if not exists lead_chat_events_lead_id_created_at_idx
  on public.lead_chat_events (lead_id, created_at desc);

alter table public.lead_conversations enable row level security;
alter table public.lead_messages enable row level security;
alter table public.lead_conversation_participants enable row level security;
alter table public.lead_chat_events enable row level security;

create policy lead_conversations_select_participants
on public.lead_conversations
for select
to authenticated
using (auth.uid() = pt_user_id or auth.uid() = lead_user_id);

create policy lead_messages_select_participants
on public.lead_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.lead_conversations c
    where c.id = lead_messages.conversation_id
      and (c.pt_user_id = auth.uid() or c.lead_user_id = auth.uid())
  )
);

create policy lead_conversation_participants_select_own
on public.lead_conversation_participants
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.lead_conversations c
    where c.id = lead_conversation_participants.conversation_id
      and (c.pt_user_id = auth.uid() or c.lead_user_id = auth.uid())
  )
);

create policy lead_conversation_participants_update_own
on public.lead_conversation_participants
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy lead_chat_events_select_participants
on public.lead_chat_events
for select
to authenticated
using (
  exists (
    select 1
    from public.lead_conversations c
    where c.id = lead_chat_events.conversation_id
      and (c.pt_user_id = auth.uid() or c.lead_user_id = auth.uid())
  )
  or exists (
    select 1
    from public.pt_hub_leads lead
    where lead.id = lead_chat_events.lead_id
      and (lead.user_id = auth.uid() or lead.applicant_user_id = auth.uid())
  )
);

create or replace function public.log_lead_chat_event(
  p_lead_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_id uuid;
begin
  if p_lead_id is null or nullif(btrim(coalesce(p_event_type, '')), '') is null then
    return null;
  end if;

  insert into public.lead_chat_events (
    lead_id,
    conversation_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    p_lead_id,
    p_conversation_id,
    p_actor_user_id,
    btrim(p_event_type),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.lead_chat_is_open_lead_status(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status, '') = any (
    array[
      'new'::text,
      'contacted'::text,
      'approved_pending_workspace'::text
    ]
  );
$$;

create or replace function public.ensure_lead_conversation_for_lead(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
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

create or replace function public.handle_pt_hub_lead_conversation_sync()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT'
     or old.status is distinct from new.status
     or old.applicant_user_id is distinct from new.applicant_user_id
     or old.user_id is distinct from new.user_id then
    perform public.ensure_lead_conversation_for_lead(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pt_hub_lead_conversation_sync on public.pt_hub_leads;
create trigger trg_pt_hub_lead_conversation_sync
after insert or update of status, applicant_user_id, user_id
on public.pt_hub_leads
for each row
execute function public.handle_pt_hub_lead_conversation_sync();

insert into public.lead_conversations (
  lead_id,
  pt_user_id,
  lead_user_id,
  status,
  archived_reason,
  archived_at,
  created_at
)
select
  lead.id,
  lead.user_id,
  lead.applicant_user_id,
  'open',
  null,
  null,
  lead.created_at
from public.pt_hub_leads lead
where lead.applicant_user_id is not null
  and lead.status = any (array['new'::text, 'contacted'::text, 'approved_pending_workspace'::text])
  and not exists (
    select 1
    from public.lead_conversations c
    where c.lead_id = lead.id
  );

insert into public.lead_conversation_participants (conversation_id, user_id, role)
select c.id, c.pt_user_id, 'pt'
from public.lead_conversations c
on conflict (conversation_id, user_id) do update
  set role = 'pt';

insert into public.lead_conversation_participants (conversation_id, user_id, role)
select c.id, c.lead_user_id, 'lead'
from public.lead_conversations c
on conflict (conversation_id, user_id) do update
  set role = 'lead';

create or replace function public.lead_chat_send_message(
  p_lead_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_user_id uuid;
  v_trimmed_body text;
  v_conversation public.lead_conversations%rowtype;
  v_message_id uuid;
  v_message_timestamp timestamptz := now();
  v_pt_message_count integer;
  v_lead_message_count integer;
  v_contacted_rows integer;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_trimmed_body := nullif(btrim(coalesce(p_body, '')), '');
  if v_trimmed_body is null then
    raise exception 'Message body is required';
  end if;

  perform public.ensure_lead_conversation_for_lead(p_lead_id);

  select *
  into v_conversation
  from public.lead_conversations c
  where c.lead_id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead conversation not found';
  end if;

  if v_actor_user_id <> v_conversation.pt_user_id
     and v_actor_user_id <> v_conversation.lead_user_id then
    raise exception 'Not allowed to message this lead';
  end if;

  if v_conversation.status <> 'open' then
    raise exception 'Lead conversation is archived';
  end if;

  insert into public.lead_messages (
    conversation_id,
    sender_user_id,
    body,
    sent_at
  )
  values (
    v_conversation.id,
    v_actor_user_id,
    v_trimmed_body,
    v_message_timestamp
  )
  returning id into v_message_id;

  update public.lead_conversations c
  set
    last_message_at = v_message_timestamp,
    last_message_preview = left(v_trimmed_body, 200)
  where c.id = v_conversation.id;

  update public.lead_conversation_participants p
  set
    last_read_message_id = v_message_id,
    last_read_at = v_message_timestamp
  where p.conversation_id = v_conversation.id
    and p.user_id = v_actor_user_id;

  if v_actor_user_id = v_conversation.pt_user_id then
    select count(*)
    into v_pt_message_count
    from public.lead_messages m
    where m.conversation_id = v_conversation.id
      and m.sender_user_id = v_conversation.pt_user_id;

    if v_pt_message_count = 1 then
      perform public.log_lead_chat_event(
        p_lead_id,
        v_conversation.id,
        v_actor_user_id,
        'lead_first_pt_message_sent',
        jsonb_build_object('message_id', v_message_id)
      );
    end if;

    perform public.notify_user(
      v_conversation.lead_user_id,
      'lead_chat_message_received',
      'New message from your coach',
      left(v_trimmed_body, 140),
      '/app/home',
      'lead_conversation',
      v_conversation.id,
      null,
      jsonb_build_object(
        'lead_id', p_lead_id,
        'conversation_id', v_conversation.id
      ),
      'messages',
      'normal'
    );
  else
    select count(*)
    into v_lead_message_count
    from public.lead_messages m
    where m.conversation_id = v_conversation.id
      and m.sender_user_id = v_conversation.lead_user_id;

    if v_lead_message_count = 1 then
      perform public.log_lead_chat_event(
        p_lead_id,
        v_conversation.id,
        v_actor_user_id,
        'lead_first_reply_sent',
        jsonb_build_object('message_id', v_message_id)
      );
    end if;

    perform public.notify_user(
      v_conversation.pt_user_id,
      'lead_chat_message_received',
      'New lead reply',
      left(v_trimmed_body, 140),
      format('/pt-hub/leads/%s', p_lead_id),
      'lead_conversation',
      v_conversation.id,
      null,
      jsonb_build_object(
        'lead_id', p_lead_id,
        'conversation_id', v_conversation.id
      ),
      'messages',
      'normal'
    );
  end if;

  update public.pt_hub_leads lead
  set status = 'contacted'
  where lead.id = p_lead_id
    and lead.status = 'new';

  get diagnostics v_contacted_rows = row_count;
  if v_contacted_rows > 0 then
    perform public.log_lead_chat_event(
      p_lead_id,
      v_conversation.id,
      v_actor_user_id,
      'lead_status_moved_to_contacted',
      jsonb_build_object('message_id', v_message_id)
    );
  end if;

  return v_message_id;
end;
$$;

create or replace function public.lead_chat_mark_read(
  p_lead_id uuid,
  p_up_to_message_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_user_id uuid;
  v_conversation public.lead_conversations%rowtype;
  v_message_id uuid;
  v_message_time timestamptz;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_conversation
  from public.lead_conversations c
  where c.lead_id = p_lead_id
  limit 1;

  if not found then
    return;
  end if;

  if v_actor_user_id <> v_conversation.pt_user_id
     and v_actor_user_id <> v_conversation.lead_user_id then
    raise exception 'Not allowed to access this conversation';
  end if;

  if p_up_to_message_id is not null then
    select m.id, m.sent_at
    into v_message_id, v_message_time
    from public.lead_messages m
    where m.id = p_up_to_message_id
      and m.conversation_id = v_conversation.id
    limit 1;
  else
    select m.id, m.sent_at
    into v_message_id, v_message_time
    from public.lead_messages m
    where m.conversation_id = v_conversation.id
    order by m.sent_at desc, m.id desc
    limit 1;
  end if;

  update public.lead_conversation_participants p
  set
    last_read_message_id = coalesce(v_message_id, p.last_read_message_id),
    last_read_at = coalesce(v_message_time, now())
  where p.conversation_id = v_conversation.id
    and p.user_id = v_actor_user_id;
end;
$$;

create or replace function public.pt_hub_lead_chat_summaries()
returns table(
  lead_id uuid,
  conversation_id uuid,
  conversation_status text,
  archived_reason text,
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
    convo.status as conversation_status,
    convo.archived_reason,
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
  where lead.user_id = v_actor_user_id;
end;
$$;

create or replace function public.my_lead_chat_threads()
returns table(
  lead_id uuid,
  conversation_id uuid,
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

create or replace function public.pt_hub_approve_lead(
  p_lead_id uuid,
  p_workspace_id uuid default null,
  p_workspace_name text default null
)
returns table(
  lead_id uuid,
  status text,
  workspace_id uuid,
  client_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid;
  v_lead public.pt_hub_leads%rowtype;
  v_target_workspace_id uuid;
  v_target_client_id uuid;
  v_workspace_name text;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_lead_id is null then
    raise exception 'Lead is required';
  end if;

  select *
  into v_lead
  from public.pt_hub_leads lead
  where lead.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  if v_lead.user_id <> v_actor_user_id then
    raise exception 'Not allowed to update this lead';
  end if;

  if v_lead.status = 'declined' then
    raise exception 'Declined leads cannot be approved';
  end if;

  if v_lead.status = 'converted'
     and v_lead.converted_workspace_id is not null
     and v_lead.converted_client_id is not null then
    return query
    select
      v_lead.id,
      'converted'::text,
      v_lead.converted_workspace_id,
      v_lead.converted_client_id;
    return;
  end if;

  v_workspace_name := nullif(btrim(coalesce(p_workspace_name, '')), '');

  if p_workspace_id is not null then
    select workspace.id
    into v_target_workspace_id
    from public.workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_user_id = v_actor_user_id
    limit 1;

    if v_target_workspace_id is null then
      raise exception 'Workspace not found';
    end if;
  elsif v_workspace_name is not null then
    insert into public.workspaces (name, owner_user_id)
    values (v_workspace_name, v_actor_user_id)
    returning id into v_target_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_target_workspace_id, v_actor_user_id, 'pt_owner')
    on conflict on constraint workspace_members_pkey do update
      set role = 'pt_owner';
  else
    update public.pt_hub_leads lead
    set
      status = 'approved_pending_workspace',
      converted_at = null,
      converted_workspace_id = null,
      converted_client_id = null
    where lead.id = v_lead.id;

    return query
    select v_lead.id, 'approved_pending_workspace'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_lead.applicant_user_id is null then
    update public.pt_hub_leads lead
    set
      status = 'approved_pending_workspace',
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = null
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'approved_pending_workspace'::text,
      v_target_workspace_id,
      null::uuid;
    return;
  end if;

  begin
    select c.id
    into v_target_client_id
    from public.clients c
    where c.workspace_id = v_target_workspace_id
      and c.user_id = v_lead.applicant_user_id
    limit 1
    for update;

    if v_target_client_id is null then
      select c.id
      into v_target_client_id
      from public.clients c
      where c.workspace_id is null
        and c.user_id = v_lead.applicant_user_id
      order by c.created_at asc
      limit 1
      for update;
    end if;

    if v_target_client_id is null then
      insert into public.clients (
        workspace_id,
        user_id,
        status,
        display_name,
        full_name,
        email,
        phone
      )
      values (
        v_target_workspace_id,
        v_lead.applicant_user_id,
        'active',
        nullif(btrim(v_lead.full_name), ''),
        nullif(btrim(v_lead.full_name), ''),
        nullif(lower(btrim(coalesce(v_lead.email, ''))), ''),
        nullif(btrim(coalesce(v_lead.phone, '')), '')
      )
      returning id into v_target_client_id;
    else
      update public.clients c
      set
        workspace_id = v_target_workspace_id,
        status = 'active',
        display_name = coalesce(
          c.display_name,
          nullif(btrim(v_lead.full_name), '')
        ),
        full_name = coalesce(
          c.full_name,
          nullif(btrim(v_lead.full_name), '')
        ),
        email = coalesce(
          c.email,
          nullif(lower(btrim(coalesce(v_lead.email, ''))), '')
        ),
        phone = coalesce(
          c.phone,
          nullif(btrim(coalesce(v_lead.phone, '')), '')
        )
      where c.id = v_target_client_id;
    end if;

    perform public.ensure_workspace_client_onboarding(
      v_target_client_id,
      'converted_lead'
    );

    update public.pt_hub_leads lead
    set
      status = 'converted',
      converted_at = coalesce(lead.converted_at, now()),
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = v_target_client_id
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'converted'::text,
      v_target_workspace_id,
      v_target_client_id;
    return;
  exception
    when others then
      perform public.log_lead_chat_event(
        v_lead.id,
        null,
        v_actor_user_id,
        'lead_workspace_assignment_failed',
        jsonb_build_object(
          'workspace_id', v_target_workspace_id,
          'error', sqlerrm
        )
      );

      update public.pt_hub_leads lead
      set
        status = 'approved_pending_workspace',
        converted_workspace_id = v_target_workspace_id,
        converted_client_id = null
      where lead.id = v_lead.id;

      return query
      select
        v_lead.id,
        'approved_pending_workspace'::text,
        v_target_workspace_id,
        null::uuid;
      return;
  end;
end;
$$;

grant all on table public.lead_conversations to authenticated;
grant all on table public.lead_conversations to service_role;
grant all on table public.lead_messages to authenticated;
grant all on table public.lead_messages to service_role;
grant all on table public.lead_conversation_participants to authenticated;
grant all on table public.lead_conversation_participants to service_role;
grant all on table public.lead_chat_events to authenticated;
grant all on table public.lead_chat_events to service_role;

revoke all on function public.log_lead_chat_event(uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.log_lead_chat_event(uuid, uuid, uuid, text, jsonb) to authenticated, service_role;

revoke all on function public.lead_chat_is_open_lead_status(text) from public, anon;
grant execute on function public.lead_chat_is_open_lead_status(text) to authenticated, service_role;

revoke all on function public.ensure_lead_conversation_for_lead(uuid) from public, anon;
grant execute on function public.ensure_lead_conversation_for_lead(uuid) to authenticated, service_role;

revoke all on function public.lead_chat_send_message(uuid, text) from public, anon;
grant execute on function public.lead_chat_send_message(uuid, text) to authenticated, service_role;

revoke all on function public.lead_chat_mark_read(uuid, uuid) from public, anon;
grant execute on function public.lead_chat_mark_read(uuid, uuid) to authenticated, service_role;

revoke all on function public.pt_hub_lead_chat_summaries() from public, anon;
grant execute on function public.pt_hub_lead_chat_summaries() to authenticated, service_role;

revoke all on function public.my_lead_chat_threads() from public, anon;
grant execute on function public.my_lead_chat_threads() to authenticated, service_role;

revoke all on function public.pt_hub_approve_lead(uuid, uuid, text) from public, anon;
grant execute on function public.pt_hub_approve_lead(uuid, uuid, text) to authenticated, service_role;
