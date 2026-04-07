create table if not exists public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_user_id uuid,
  actor_key text,
  target_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_action_created_idx
  on public.rate_limit_events (action, created_at desc);

create index if not exists rate_limit_events_user_action_created_idx
  on public.rate_limit_events (actor_user_id, action, created_at desc)
  where actor_user_id is not null;

create index if not exists rate_limit_events_actor_key_action_created_idx
  on public.rate_limit_events (actor_key, action, created_at desc)
  where actor_key is not null;

create index if not exists rate_limit_events_target_key_action_created_idx
  on public.rate_limit_events (target_key, action, created_at desc)
  where target_key is not null;

alter table public.rate_limit_events enable row level security;
alter table public.rate_limit_events force row level security;

revoke all on table public.rate_limit_events from anon, authenticated;
revoke all on table public.rate_limit_events from public;

create or replace function public.hash_rate_limit_key(p_value text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_value, '')), '') is null then null
    else md5(lower(btrim(p_value)))
  end;
$$;

create or replace function public.enforce_rate_limit(
  p_action text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_actor_user_id uuid default null,
  p_actor_key text default null,
  p_target_key text default null,
  p_error_message text default 'Rate limit exceeded. Please try again later.',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_count integer;
begin
  if coalesce(p_action, '') = '' then
    raise exception 'Rate limit action is required';
  end if;

  if coalesce(p_max_attempts, 0) <= 0 or coalesce(p_window_seconds, 0) <= 0 then
    return;
  end if;

  if p_actor_user_id is null
     and nullif(btrim(coalesce(p_actor_key, '')), '') is null
     and nullif(btrim(coalesce(p_target_key, '')), '') is null then
    raise exception 'Rate limit requires at least one actor or target key';
  end if;

  select count(*)
  into v_existing_count
  from public.rate_limit_events event
  where event.action = p_action
    and event.created_at >= now() - make_interval(secs => p_window_seconds)
    and (
      (p_actor_user_id is not null and event.actor_user_id = p_actor_user_id)
      or (nullif(btrim(coalesce(p_actor_key, '')), '') is not null and event.actor_key = p_actor_key)
      or (nullif(btrim(coalesce(p_target_key, '')), '') is not null and event.target_key = p_target_key)
    );

  if v_existing_count >= p_max_attempts then
    raise exception using message = p_error_message;
  end if;

  insert into public.rate_limit_events (
    action,
    actor_user_id,
    actor_key,
    target_key,
    metadata
  ) values (
    p_action,
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_key, '')), ''),
    nullif(btrim(coalesce(p_target_key, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.create_workspace(p_name text)
returns table(workspace_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text;
  v_member_id uuid;
  v_profile_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.enforce_rate_limit(
    'workspace_create_burst',
    1,
    60,
    v_user_id,
    null,
    null,
    'Please wait a minute before creating another workspace.'
  );

  perform public.enforce_rate_limit(
    'workspace_create_daily',
    3,
    86400,
    v_user_id,
    null,
    null,
    'You have reached the workspace creation limit for today.'
  );

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Workspace name is required';
  end if;

  insert into public.workspaces (name, owner_user_id)
  values (v_name, v_user_id)
  returning id into v_workspace_id;

  select wm.id
  into v_member_id
  from public.workspace_members wm
  where wm.workspace_id = v_workspace_id
    and wm.user_id = v_user_id
  limit 1
  for update;

  if v_member_id is null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, v_user_id, 'pt_owner');
  else
    update public.workspace_members wm
    set role = 'pt_owner'
    where wm.id = v_member_id;
  end if;

  select pp.id
  into v_profile_id
  from public.pt_profiles pp
  where pp.user_id = v_user_id
    and pp.workspace_id = v_workspace_id
  limit 1
  for update;

  if v_profile_id is null then
    insert into public.pt_profiles (user_id, workspace_id)
    values (v_user_id, v_workspace_id);
  end if;

  workspace_id := v_workspace_id;
  return next;
end;
$$;

create or replace function public.submit_public_pt_application(
  p_slug text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_goal_summary text,
  p_training_experience text,
  p_budget_interest text,
  p_package_interest text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile record;
  v_lead_id uuid;
  v_slug text;
  v_email text;
  v_email_slug_key text;
begin
  v_slug := lower(btrim(coalesce(p_slug, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  v_email_slug_key := public.hash_rate_limit_key(v_email || '|' || v_slug);

  select
    profile.user_id,
    profile.slug
  into v_profile
  from public.pt_hub_profiles profile
  join public.pt_hub_settings settings
    on settings.user_id = profile.user_id
  where lower(profile.slug) = v_slug
    and profile.is_published = true
    and settings.profile_visibility = 'listed'
  limit 1;

  if not found then
    raise exception 'Published profile not found';
  end if;

  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'Full name is required';
  end if;

  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if coalesce(btrim(p_goal_summary), '') = '' then
    raise exception 'Goal summary is required';
  end if;

  perform public.enforce_rate_limit(
    'public_pt_application_burst',
    1,
    300,
    null,
    v_email_slug_key,
    public.hash_rate_limit_key(v_slug),
    'You recently submitted an application. Please wait a few minutes before trying again.'
  );

  perform public.enforce_rate_limit(
    'public_pt_application_hourly',
    3,
    3600,
    null,
    v_email_slug_key,
    null,
    'Too many applications were submitted from this contact recently. Please try again later.'
  );

  insert into public.pt_hub_leads (
    user_id,
    full_name,
    email,
    phone,
    goal_summary,
    training_experience,
    budget_interest,
    package_interest,
    status,
    submitted_at,
    source,
    source_slug
  )
  values (
    v_profile.user_id,
    btrim(p_full_name),
    v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_goal_summary),
    nullif(btrim(coalesce(p_training_experience, '')), ''),
    nullif(btrim(coalesce(p_budget_interest, '')), ''),
    nullif(btrim(coalesce(p_package_interest, '')), ''),
    'new',
    now(),
    'public_profile',
    v_profile.slug
  )
  returning id into v_lead_id;

  return v_lead_id;
end;
$$;

create or replace function public.enforce_message_insert_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if new.sender_user_id is distinct from v_user_id then
    raise exception 'Messages must be sent by the authenticated user.';
  end if;

  new.body := nullif(btrim(coalesce(new.body, '')), '');
  if new.body is null then
    raise exception 'Message body is required.';
  end if;

  if length(new.body) > 4000 then
    raise exception 'Messages must be 4000 characters or fewer.';
  end if;

  new.preview := left(coalesce(nullif(btrim(coalesce(new.preview, '')), ''), new.body), 140);

  perform public.enforce_rate_limit(
    'message_send_burst',
    3,
    5,
    v_user_id,
    null,
    new.conversation_id::text,
    'You are sending messages too quickly. Please slow down.'
  );

  perform public.enforce_rate_limit(
    'message_send_minute',
    25,
    60,
    v_user_id,
    null,
    new.conversation_id::text,
    'You have reached the message limit for this minute. Please wait a bit.'
  );

  return new;
end;
$$;

drop trigger if exists enforce_message_insert_limits_trigger on public.messages;
create trigger enforce_message_insert_limits_trigger
before insert on public.messages
for each row
execute function public.enforce_message_insert_limits();

create or replace function public.enforce_client_medical_record_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  new.title := nullif(btrim(coalesce(new.title, '')), '');
  if new.title is null then
    raise exception 'A title is required.';
  end if;

  perform public.enforce_rate_limit(
    'medical_record_insert_hourly',
    30,
    3600,
    v_user_id,
    null,
    new.client_id::text,
    'You have reached the medical record update limit for now. Please try again later.'
  );

  return new;
end;
$$;

drop trigger if exists enforce_client_medical_record_limits_trigger on public.client_medical_records;
create trigger enforce_client_medical_record_limits_trigger
before insert on public.client_medical_records
for each row
execute function public.enforce_client_medical_record_limits();

create or replace function public.enforce_client_medical_document_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(new.file_name, '') = '' then
    raise exception 'A document file name is required.';
  end if;

  if new.file_size is not null and new.file_size > 15728640 then
    raise exception 'Medical documents must be 15 MB or smaller.';
  end if;

  if new.mime_type is not null and new.mime_type <> all (array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]) then
    raise exception 'Unsupported medical document type.';
  end if;

  perform public.enforce_rate_limit(
    'medical_document_insert_hourly',
    10,
    3600,
    v_user_id,
    null,
    new.client_id::text,
    'You have reached the medical document upload limit for now. Please try again later.'
  );

  return new;
end;
$$;

drop trigger if exists enforce_client_medical_document_limits_trigger on public.client_medical_documents;
create trigger enforce_client_medical_document_limits_trigger
before insert on public.client_medical_documents
for each row
execute function public.enforce_client_medical_document_limits();
