-- PR-05.2: Treat client account onboarding as user-level continuity.
-- public.clients still stores account fields during beta, so copy only safe
-- account/profile fields across rows for the same user. Do not copy workspace
-- delivery/history data.

create or replace function public.sync_client_account_profile_fields(
  p_client_id uuid
)
returns public.clients
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.clients%rowtype;
  v_source public.clients%rowtype;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select *
  into v_target
  from public.clients c
  where c.id = p_client_id
  limit 1;

  if v_target.id is null then
    raise exception 'Client not found';
  end if;

  if v_target.user_id is null then
    return v_target;
  end if;

  select *
  into v_source
  from public.clients c
  where c.user_id = v_target.user_id
    and c.id <> v_target.id
    and (
      c.account_onboarding_completed_at is not null
      or c.full_name is not null
      or c.display_name is not null
      or c.phone is not null
      or c.email is not null
      or c.avatar_url is not null
      or c.photo_url is not null
      or c.date_of_birth is not null
      or c.dob is not null
      or c.sex is not null
      or c.gender is not null
      or c.height_value is not null
      or c.height_cm is not null
      or c.weight_value_current is not null
      or c.current_weight is not null
    )
  order by
    case when c.account_onboarding_completed_at is not null then 0 else 1 end,
    case when c.workspace_id is null then 0 else 1 end,
    c.updated_at desc nulls last,
    c.created_at desc
  limit 1;

  if v_source.id is null then
    return v_target;
  end if;

  update public.clients c
  set
    account_onboarding_completed_at = coalesce(
      c.account_onboarding_completed_at,
      v_source.account_onboarding_completed_at
    ),
    display_name = coalesce(c.display_name, v_source.display_name),
    full_name = coalesce(c.full_name, v_source.full_name),
    phone = coalesce(c.phone, v_source.phone),
    email = coalesce(c.email, v_source.email),
    avatar_url = coalesce(c.avatar_url, v_source.avatar_url),
    photo_url = coalesce(c.photo_url, v_source.photo_url),
    date_of_birth = coalesce(c.date_of_birth, v_source.date_of_birth),
    dob = coalesce(c.dob, v_source.dob),
    sex = coalesce(c.sex, v_source.sex),
    gender = coalesce(c.gender, v_source.gender),
    height_value = coalesce(c.height_value, v_source.height_value),
    height_unit = coalesce(c.height_unit, v_source.height_unit),
    height_cm = coalesce(c.height_cm, v_source.height_cm),
    weight_value_current = coalesce(
      c.weight_value_current,
      v_source.weight_value_current
    ),
    weight_unit = coalesce(c.weight_unit, v_source.weight_unit),
    current_weight = coalesce(c.current_weight, v_source.current_weight),
    unit_preference = coalesce(c.unit_preference, v_source.unit_preference),
    location = coalesce(c.location, v_source.location),
    location_country = coalesce(c.location_country, v_source.location_country),
    timezone = coalesce(c.timezone, v_source.timezone)
  where c.id = v_target.id
  returning *
  into v_target;

  return v_target;
end;
$$;

create or replace function public.apply_client_account_profile_defaults()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source public.clients%rowtype;
begin
  if new.user_id is null then
    return new;
  end if;

  select *
  into v_source
  from public.clients c
  where c.user_id = new.user_id
    and c.id is distinct from new.id
    and (
      c.account_onboarding_completed_at is not null
      or c.full_name is not null
      or c.display_name is not null
      or c.phone is not null
      or c.email is not null
      or c.avatar_url is not null
      or c.photo_url is not null
      or c.date_of_birth is not null
      or c.dob is not null
      or c.sex is not null
      or c.gender is not null
      or c.height_value is not null
      or c.height_cm is not null
      or c.weight_value_current is not null
      or c.current_weight is not null
    )
  order by
    case when c.account_onboarding_completed_at is not null then 0 else 1 end,
    case when c.workspace_id is null then 0 else 1 end,
    c.updated_at desc nulls last,
    c.created_at desc
  limit 1;

  if v_source.id is null then
    return new;
  end if;

  new.account_onboarding_completed_at := coalesce(
    new.account_onboarding_completed_at,
    v_source.account_onboarding_completed_at
  );
  new.display_name := coalesce(new.display_name, v_source.display_name);
  new.full_name := coalesce(new.full_name, v_source.full_name);
  new.phone := coalesce(new.phone, v_source.phone);
  new.email := coalesce(new.email, v_source.email);
  new.avatar_url := coalesce(new.avatar_url, v_source.avatar_url);
  new.photo_url := coalesce(new.photo_url, v_source.photo_url);
  new.date_of_birth := coalesce(new.date_of_birth, v_source.date_of_birth);
  new.dob := coalesce(new.dob, v_source.dob);
  new.sex := coalesce(new.sex, v_source.sex);
  new.gender := coalesce(new.gender, v_source.gender);
  new.height_value := coalesce(new.height_value, v_source.height_value);
  new.height_unit := coalesce(new.height_unit, v_source.height_unit);
  new.height_cm := coalesce(new.height_cm, v_source.height_cm);
  new.weight_value_current := coalesce(
    new.weight_value_current,
    v_source.weight_value_current
  );
  new.weight_unit := coalesce(new.weight_unit, v_source.weight_unit);
  new.current_weight := coalesce(new.current_weight, v_source.current_weight);
  new.unit_preference := coalesce(new.unit_preference, v_source.unit_preference);
  new.location := coalesce(new.location, v_source.location);
  new.location_country := coalesce(
    new.location_country,
    v_source.location_country
  );
  new.timezone := coalesce(new.timezone, v_source.timezone);

  return new;
end;
$$;

drop trigger if exists clients_account_profile_defaults_trigger
  on public.clients;

create trigger clients_account_profile_defaults_trigger
before insert or update of user_id, workspace_id on public.clients
for each row
execute function public.apply_client_account_profile_defaults();

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
  order by
    case when c.workspace_id is null then 0 else 1 end,
    case when c.account_onboarding_completed_at is not null then 0 else 1 end,
    c.created_at asc
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

  v_row := public.sync_client_account_profile_fields(v_row.id);

  return v_row;
end;
$$;

grant execute on function public.sync_client_account_profile_fields(uuid)
  to authenticated, service_role;
grant execute on function public.ensure_client_profile(uuid, text, text, text)
  to authenticated, service_role;

with source_candidates as (
  select
    target_client.id as target_id,
    source_client.*,
    row_number() over (
      partition by target_client.id
      order by
        case
          when source_client.account_onboarding_completed_at is not null then 0
          else 1
        end,
        case when source_client.workspace_id is null then 0 else 1 end,
        source_client.updated_at desc nulls last,
        source_client.created_at desc
    ) as source_rank
  from public.clients target_client
  join public.clients source_client
    on source_client.user_id = target_client.user_id
   and source_client.id <> target_client.id
  where target_client.user_id is not null
    and (
      target_client.account_onboarding_completed_at is null
      or target_client.full_name is null
      or target_client.display_name is null
      or target_client.phone is null
      or target_client.email is null
      or target_client.avatar_url is null
      or target_client.photo_url is null
      or target_client.date_of_birth is null
      or target_client.dob is null
      or target_client.sex is null
      or target_client.gender is null
      or target_client.height_value is null
      or target_client.height_cm is null
      or target_client.weight_value_current is null
      or target_client.current_weight is null
    )
    and (
      source_client.account_onboarding_completed_at is not null
      or source_client.full_name is not null
      or source_client.display_name is not null
      or source_client.phone is not null
      or source_client.email is not null
      or source_client.avatar_url is not null
      or source_client.photo_url is not null
      or source_client.date_of_birth is not null
      or source_client.dob is not null
      or source_client.sex is not null
      or source_client.gender is not null
      or source_client.height_value is not null
      or source_client.height_cm is not null
      or source_client.weight_value_current is not null
      or source_client.current_weight is not null
    )
)
update public.clients c
set
  account_onboarding_completed_at = coalesce(
    c.account_onboarding_completed_at,
    source.account_onboarding_completed_at
  ),
  display_name = coalesce(c.display_name, source.display_name),
  full_name = coalesce(c.full_name, source.full_name),
  phone = coalesce(c.phone, source.phone),
  email = coalesce(c.email, source.email),
  avatar_url = coalesce(c.avatar_url, source.avatar_url),
  photo_url = coalesce(c.photo_url, source.photo_url),
  date_of_birth = coalesce(c.date_of_birth, source.date_of_birth),
  dob = coalesce(c.dob, source.dob),
  sex = coalesce(c.sex, source.sex),
  gender = coalesce(c.gender, source.gender),
  height_value = coalesce(c.height_value, source.height_value),
  height_unit = coalesce(c.height_unit, source.height_unit),
  height_cm = coalesce(c.height_cm, source.height_cm),
  weight_value_current = coalesce(
    c.weight_value_current,
    source.weight_value_current
  ),
  weight_unit = coalesce(c.weight_unit, source.weight_unit),
  current_weight = coalesce(c.current_weight, source.current_weight),
  unit_preference = coalesce(c.unit_preference, source.unit_preference),
  location = coalesce(c.location, source.location),
  location_country = coalesce(c.location_country, source.location_country),
  timezone = coalesce(c.timezone, source.timezone)
from source_candidates source
where source.source_rank = 1
  and source.target_id = c.id;
