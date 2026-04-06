create table if not exists public.pt_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  coach_business_name text,
  headline text,
  bio text,
  location_country text,
  location_city text,
  languages text[] not null default '{}'::text[],
  specialties text[] not null default '{}'::text[],
  starting_price numeric,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pt_profiles enable row level security;

drop policy if exists pt_profiles_self_access on public.pt_profiles;
create policy pt_profiles_self_access
on public.pt_profiles
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists trg_pt_profiles_updated_at on public.pt_profiles;
create trigger trg_pt_profiles_updated_at
before update on public.pt_profiles
for each row
execute function public.set_updated_at();

alter table public.clients
  alter column workspace_id drop not null;

alter table public.clients
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists date_of_birth date,
  add column if not exists sex text,
  add column if not exists height_value numeric,
  add column if not exists height_unit text,
  add column if not exists weight_value_current numeric,
  add column if not exists weight_unit text,
  add column if not exists account_onboarding_completed_at timestamptz;

update public.clients
set
  full_name = coalesce(full_name, display_name),
  avatar_url = coalesce(avatar_url, photo_url),
  date_of_birth = coalesce(date_of_birth, dob),
  sex = coalesce(sex, gender),
  height_value = coalesce(height_value, height_cm),
  height_unit = coalesce(height_unit, 'cm'),
  weight_value_current = coalesce(weight_value_current, current_weight),
  weight_unit = coalesce(weight_unit, case
    when unit_preference = 'imperial' then 'lb'
    else 'kg'
  end);

create unique index if not exists clients_standalone_user_uidx
on public.clients (user_id)
where workspace_id is null;

create or replace function public.ensure_client_profile(
  p_user_id uuid,
  p_full_name text default null,
  p_avatar_url text default null,
  p_email text default null
)
returns public.clients
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.clients;
begin
  if p_user_id is null then
    raise exception 'User is required';
  end if;

  select *
  into v_row
  from public.clients c
  where c.user_id = p_user_id
  order by case when c.workspace_id is null then 0 else 1 end, c.created_at asc
  limit 1
  for update;

  if v_row.id is null then
    insert into public.clients (
      workspace_id,
      user_id,
      status,
      display_name,
      full_name,
      avatar_url,
      photo_url,
      email
    )
    values (
      null,
      p_user_id,
      'active',
      nullif(trim(p_full_name), ''),
      nullif(trim(p_full_name), ''),
      nullif(trim(p_avatar_url), ''),
      nullif(trim(p_avatar_url), ''),
      nullif(trim(p_email), '')
    )
    returning *
    into v_row;
  else
    update public.clients
    set
      full_name = coalesce(full_name, nullif(trim(p_full_name), '')),
      display_name = coalesce(display_name, nullif(trim(p_full_name), '')),
      avatar_url = coalesce(avatar_url, nullif(trim(p_avatar_url), '')),
      photo_url = coalesce(photo_url, nullif(trim(p_avatar_url), '')),
      email = coalesce(email, nullif(trim(p_email), ''))
    where id = v_row.id
    returning *
    into v_row;
  end if;

  return v_row;
end;
$$;

grant all on table public.pt_profiles to authenticated;
grant all on table public.pt_profiles to service_role;
grant execute on function public.ensure_client_profile(uuid, text, text, text) to authenticated;
grant execute on function public.ensure_client_profile(uuid, text, text, text) to service_role;

create or replace function public.accept_invite(p_token text)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_invite public.invites%rowtype;
  v_client_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select i.*
  into v_invite
  from public.invites i
  where i.token = p_token
     or i.code = p_token
  order by i.created_at desc
  limit 1
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if v_invite.role is distinct from 'client' then
    raise exception 'Invite role not supported';
  end if;

  if v_invite.used_at is not null then
    raise exception 'Invite already used';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_invite.max_uses is not null and coalesce(v_invite.uses, 0) >= v_invite.max_uses then
    raise exception 'Invite max uses reached';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_invite.workspace_id
    and c.user_id = v_user_id
  limit 1
  for update;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = v_user_id
    limit 1
    for update;
  end if;

  if v_client_id is null then
    insert into public.clients (workspace_id, user_id, status, display_name)
    values (v_invite.workspace_id, v_user_id, 'active', null)
    returning id into v_client_id;
  else
    update public.clients c
    set
      workspace_id = v_invite.workspace_id,
      status = 'active',
      user_id = v_user_id
    where c.id = v_client_id
    returning id into v_client_id;
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set
    used_at = now(),
    uses = coalesce(uses, 0) + 1
  where id = v_invite.id;

  workspace_id := v_invite.workspace_id;
  client_id := v_client_id;
  return next;
end;
$$;

create or replace function public.accept_invite(
  p_code text,
  p_display_name text default null
)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $$
declare
  v_inv public.invites%rowtype;
  v_client_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite';
  end if;

  select *
  into v_inv
  from public.invites
  where code = p_code
  for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_inv.uses >= v_inv.max_uses then
    raise exception 'Invite already used';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_inv.workspace_id
    and c.user_id = auth.uid()
  limit 1;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = auth.uid()
    limit 1
    for update;
  end if;

  if v_client_id is null then
    v_name := coalesce(
      nullif(trim(p_display_name), ''),
      split_part((auth.jwt() ->> 'email'), '@', 1),
      'Client'
    );

    insert into public.clients (workspace_id, user_id, display_name, full_name, status)
    values (v_inv.workspace_id, auth.uid(), v_name, v_name, 'active')
    returning id into v_client_id;
  else
    update public.clients
    set
      workspace_id = v_inv.workspace_id,
      status = 'active',
      display_name = coalesce(display_name, nullif(trim(p_display_name), '')),
      full_name = coalesce(full_name, nullif(trim(p_display_name), ''))
    where id = v_client_id;
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set uses = uses + 1
  where id = v_inv.id;

  return query select v_inv.workspace_id, v_client_id;
end;
$$;

create or replace function public.submit_workspace_client_onboarding(
  p_client_id uuid
)
returns public.workspace_client_onboardings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.workspace_client_onboardings;
  v_baseline_id uuid;
  v_client public.clients%rowtype;
  v_full_name text;
  v_phone text;
  v_sex text;
  v_dob date;
  v_height numeric;
  v_weight numeric;
begin
  v_row := public.ensure_workspace_client_onboarding(p_client_id, 'direct_invite');

  select *
  into v_client
  from public.clients c
  where c.id = p_client_id
  limit 1;

  if v_row.status = 'completed' then
    raise exception 'Onboarding is already completed';
  end if;

  v_full_name := coalesce(
    nullif(trim(v_client.full_name), ''),
    nullif(trim(v_client.display_name), ''),
    nullif(trim(v_row.basics ->> 'display_name'), '')
  );
  v_phone := coalesce(
    nullif(trim(v_client.phone), ''),
    nullif(trim(v_row.basics ->> 'phone'), '')
  );
  v_sex := coalesce(
    nullif(trim(v_client.sex), ''),
    nullif(trim(v_client.gender), ''),
    nullif(trim(v_row.basics ->> 'gender'), '')
  );
  v_dob := coalesce(
    v_client.date_of_birth,
    v_client.dob,
    nullif(v_row.basics ->> 'date_of_birth', '')::date
  );
  v_height := coalesce(
    v_client.height_value,
    v_client.height_cm,
    nullif(v_row.basics ->> 'height_value', '')::numeric
  );
  v_weight := coalesce(
    v_client.weight_value_current,
    v_client.current_weight,
    nullif(v_row.basics ->> 'weight_value_current', '')::numeric
  );

  if v_full_name is null then
    raise exception 'Client profile full name is incomplete';
  end if;

  if v_phone is null then
    raise exception 'Client profile phone is incomplete';
  end if;

  if v_sex is null then
    raise exception 'Client profile sex/gender is incomplete';
  end if;

  if v_dob is null then
    raise exception 'Client profile date of birth is incomplete';
  end if;

  if v_height is null then
    raise exception 'Client profile height is incomplete';
  end if;

  if v_weight is null then
    raise exception 'Client profile current weight is incomplete';
  end if;

  if v_row.goals = '{}'::jsonb then
    raise exception 'Onboarding goals are incomplete';
  end if;

  if v_row.training_history = '{}'::jsonb then
    raise exception 'Onboarding training history is incomplete';
  end if;

  if v_row.injuries_limitations = '{}'::jsonb then
    raise exception 'Onboarding injuries/limitations are incomplete';
  end if;

  if v_row.nutrition_lifestyle = '{}'::jsonb then
    raise exception 'Onboarding nutrition/lifestyle is incomplete';
  end if;

  v_baseline_id := v_row.initial_baseline_entry_id;

  if v_baseline_id is null then
    select be.id
    into v_baseline_id
    from public.baseline_entries be
    where be.client_id = p_client_id
      and be.status = 'submitted'
    order by coalesce(be.submitted_at, be.created_at) desc
    limit 1;
  end if;

  if v_baseline_id is null then
    raise exception 'Submitted baseline is required before onboarding can be submitted';
  end if;

  if not exists (
    select 1
    from public.baseline_entries be
    where be.id = v_baseline_id
      and be.client_id = p_client_id
      and be.status = 'submitted'
  ) then
    raise exception 'Linked baseline must be submitted before onboarding can be submitted';
  end if;

  update public.workspace_client_onboardings
  set
    initial_baseline_entry_id = coalesce(initial_baseline_entry_id, v_baseline_id),
    status = 'review_needed',
    submitted_at = now()
  where id = v_row.id
  returning *
  into v_row;

  return v_row;
end;
$$;
