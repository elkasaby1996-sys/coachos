create or replace function public.list_calendar_mention_users(p_workspace_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text
)
language sql
security definer
set search_path = public, auth
as $$
  with caller_access as (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
    limit 1
  ),
  client_users as (
    select
      c.user_id,
      coalesce(nullif(trim(c.display_name), ''), split_part(au.email, '@', 1), 'Client') as display_name,
      'client'::text as role
    from public.clients c
    left join auth.users au on au.id = c.user_id
    where c.workspace_id = p_workspace_id
      and c.user_id is not null
  ),
  coach_users as (
    select
      wm.user_id,
      coalesce(
        nullif(trim(pp.display_name), ''),
        nullif(trim(php.display_name), ''),
        nullif(trim(php.full_name), ''),
        split_part(au.email, '@', 1),
        'Coach'
      ) as display_name,
      'coach'::text as role
    from public.workspace_members wm
    left join public.pt_profiles pp
      on pp.user_id = wm.user_id
     and (pp.workspace_id = wm.workspace_id or pp.workspace_id is null)
    left join public.pt_hub_profiles php on php.user_id = wm.user_id
    left join auth.users au on au.id = wm.user_id
    where wm.workspace_id = p_workspace_id
      and wm.role::text like 'pt_%'
  )
  select distinct on (mentionable.user_id)
    mentionable.user_id,
    mentionable.display_name,
    mentionable.role
  from (
    select * from client_users
    union all
    select * from coach_users
  ) mentionable
  where exists (select 1 from caller_access)
  order by mentionable.user_id, mentionable.role, mentionable.display_name;
$$;

create or replace function public.create_coach_calendar_event_with_mentions(
  p_workspace_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event_id uuid;
  v_actor_name text;
  v_mention record;
  v_action_url text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text in ('pt_owner', 'pt_coach')
  ) then
    raise exception 'Only workspace coaches can create calendar events.';
  end if;

  if coalesce(nullif(trim(p_title), ''), '') = '' then
    raise exception 'Event title is required.';
  end if;

  select coalesce(
    nullif(trim(pp.display_name), ''),
    nullif(trim(php.display_name), ''),
    nullif(trim(php.full_name), ''),
    split_part(au.email, '@', 1),
    'A coach'
  )
  into v_actor_name
  from auth.users au
  left join public.pt_profiles pp
    on pp.user_id = au.id
   and (pp.workspace_id = p_workspace_id or pp.workspace_id is null)
  left join public.pt_hub_profiles php on php.user_id = au.id
  where au.id = auth.uid()
  limit 1;

  insert into public.coach_calendar_events (
    workspace_id,
    title,
    description,
    starts_at,
    ends_at,
    created_by
  )
  values (
    p_workspace_id,
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    p_starts_at,
    p_ends_at,
    auth.uid()
  )
  returning id into v_event_id;

  for v_mention in
    with requested as (
      select distinct unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) as user_id
    ),
    valid_mentions as (
      select
        requested.user_id,
        'client'::text as role
      from requested
      join public.clients c
        on c.user_id = requested.user_id
       and c.workspace_id = p_workspace_id
      union
      select
        requested.user_id,
        'coach'::text as role
      from requested
      join public.workspace_members wm
        on wm.user_id = requested.user_id
       and wm.workspace_id = p_workspace_id
       and wm.role::text like 'pt_%'
    )
    select distinct on (user_id) user_id, role
    from valid_mentions
    where user_id <> auth.uid()
    order by user_id, role
  loop
    v_action_url := case
      when v_mention.role = 'client' then '/app/notifications'
      else '/pt/calendar'
    end;

    insert into public.notification_events (
      recipient_user_id,
      actor_type,
      type,
      notification_class,
      category,
      priority,
      title,
      body,
      action_url,
      action_label,
      entity_type,
      entity_id,
      metadata,
      transactional,
      idempotency_key
    )
    values (
      v_mention.user_id,
      'pt',
      'calendar_mention',
      'product',
      'general',
      'normal',
      'You were mentioned in a calendar event',
      coalesce(v_actor_name, 'A coach') || ' mentioned you in "' || trim(p_title) || '".',
      v_action_url,
      'Open calendar',
      'coach_calendar_event',
      v_event_id::text,
      jsonb_build_object(
        'workspace_id', p_workspace_id,
        'event_id', v_event_id,
        'event_title', trim(p_title),
        'event_starts_at', p_starts_at,
        'mentioned_by_user_id', auth.uid(),
        'mentioned_by_name', coalesce(v_actor_name, 'A coach')
      ),
      false,
      'calendar_mention:' || v_event_id::text || ':' || v_mention.user_id::text
    )
    on conflict (idempotency_key) do nothing;
  end loop;

  return v_event_id;
end;
$$;

grant execute on function public.list_calendar_mention_users(uuid) to authenticated;
grant execute on function public.create_coach_calendar_event_with_mentions(uuid, text, text, timestamptz, timestamptz, uuid[]) to authenticated;
