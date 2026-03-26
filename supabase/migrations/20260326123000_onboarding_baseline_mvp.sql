do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'onboarding_source'
  ) then
    create type public.onboarding_source as enum (
      'direct_invite',
      'converted_lead'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'onboarding_status'
  ) then
    create type public.onboarding_status as enum (
      'invited',
      'in_progress',
      'submitted',
      'review_needed',
      'partially_activated',
      'completed'
    );
  end if;
end $$;

create table if not exists public.workspace_client_onboardings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  source public.onboarding_source not null default 'direct_invite',
  status public.onboarding_status not null default 'invited',
  basics jsonb not null default '{}'::jsonb,
  goals jsonb not null default '{}'::jsonb,
  training_history jsonb not null default '{}'::jsonb,
  injuries_limitations jsonb not null default '{}'::jsonb,
  nutrition_lifestyle jsonb not null default '{}'::jsonb,
  step_state jsonb not null default '{}'::jsonb,
  initial_baseline_entry_id uuid references public.baseline_entries(id) on delete set null,
  coach_review_notes text,
  first_program_template_id uuid references public.program_templates(id) on delete set null,
  first_program_applied_at timestamptz,
  first_checkin_template_id uuid references public.checkin_templates(id) on delete set null,
  first_checkin_date date,
  first_checkin_scheduled_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, client_id)
);

create index if not exists workspace_client_onboardings_workspace_id_idx
  on public.workspace_client_onboardings (workspace_id);

create index if not exists workspace_client_onboardings_client_id_idx
  on public.workspace_client_onboardings (client_id);

create index if not exists workspace_client_onboardings_status_idx
  on public.workspace_client_onboardings (status);

create index if not exists workspace_client_onboardings_workspace_status_idx
  on public.workspace_client_onboardings (workspace_id, status);

alter table public.workspace_client_onboardings enable row level security;
alter table public.workspace_client_onboardings force row level security;

create or replace function public.set_workspace_client_onboarding_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.last_saved_at := now();
  return new;
end;
$$;

drop trigger if exists trg_workspace_client_onboardings_timestamps
  on public.workspace_client_onboardings;

create trigger trg_workspace_client_onboardings_timestamps
before update on public.workspace_client_onboardings
for each row
execute function public.set_workspace_client_onboarding_timestamps();

drop policy if exists workspace_client_onboardings_select_access
  on public.workspace_client_onboardings;
create policy workspace_client_onboardings_select_access
  on public.workspace_client_onboardings
  for select
  to authenticated
  using (
    public.is_client_owner(client_id)
    or public.is_pt_workspace_member(workspace_id)
  );

drop policy if exists workspace_client_onboardings_insert_access
  on public.workspace_client_onboardings;
create policy workspace_client_onboardings_insert_access
  on public.workspace_client_onboardings
  for insert
  to authenticated
  with check (
    public.is_client_owner(client_id)
    or public.is_pt_workspace_member(workspace_id)
  );

drop policy if exists workspace_client_onboardings_update_access
  on public.workspace_client_onboardings;
create policy workspace_client_onboardings_update_access
  on public.workspace_client_onboardings
  for update
  to authenticated
  using (
    public.is_client_owner(client_id)
    or public.is_pt_workspace_member(workspace_id)
  )
  with check (
    public.is_client_owner(client_id)
    or public.is_pt_workspace_member(workspace_id)
  );

create or replace function public.ensure_workspace_client_onboarding(
  p_client_id uuid,
  p_source public.onboarding_source default 'direct_invite'
)
returns public.workspace_client_onboardings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_workspace_id uuid;
  v_row public.workspace_client_onboardings;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not (
    public.is_client_owner(p_client_id)
    or public.is_pt_workspace_member(v_workspace_id)
  ) then
    raise exception 'Not authorized';
  end if;

  select *
  into v_row
  from public.workspace_client_onboardings wco
  where wco.workspace_id = v_workspace_id
    and wco.client_id = p_client_id
  limit 1;

  if v_row.id is null then
    insert into public.workspace_client_onboardings (
      workspace_id,
      client_id,
      source,
      status
    )
    values (
      v_workspace_id,
      p_client_id,
      coalesce(p_source, 'direct_invite'),
      'invited'
    )
    returning *
    into v_row;
  end if;

  return v_row;
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
begin
  v_row := public.ensure_workspace_client_onboarding(p_client_id, 'direct_invite');

  if v_row.status = 'completed' then
    raise exception 'Onboarding is already completed';
  end if;

  if v_row.basics = '{}'::jsonb then
    raise exception 'Onboarding basics are incomplete';
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

create or replace function public.review_workspace_client_onboarding(
  p_client_id uuid,
  p_coach_review_notes text default null
)
returns public.workspace_client_onboardings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.workspace_client_onboardings;
  v_next_status public.onboarding_status;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select *
  into v_row
  from public.workspace_client_onboardings wco
  where wco.client_id = p_client_id
  limit 1
  for update;

  if v_row.id is null then
    raise exception 'Onboarding row not found';
  end if;

  if not public.is_pt_workspace_member(v_row.workspace_id) then
    raise exception 'Not authorized';
  end if;

  v_next_status :=
    case
      when v_row.completed_at is not null then 'completed'::public.onboarding_status
      when v_row.first_program_applied_at is not null
        or v_row.first_checkin_scheduled_at is not null
        then 'partially_activated'::public.onboarding_status
      else 'submitted'::public.onboarding_status
    end;

  update public.workspace_client_onboardings
  set
    coach_review_notes = coalesce(p_coach_review_notes, coach_review_notes),
    reviewed_at = now(),
    reviewed_by_user_id = auth.uid(),
    status = v_next_status
  where id = v_row.id
  returning *
  into v_row;

  return v_row;
end;
$$;

create or replace function public.complete_workspace_client_onboarding(
  p_client_id uuid,
  p_program_template_id uuid default null,
  p_checkin_template_id uuid default null,
  p_first_checkin_date date default null,
  p_coach_review_notes text default null
)
returns public.workspace_client_onboardings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.workspace_client_onboardings;
  v_client public.clients%rowtype;
  v_baseline_id uuid;
  v_metrics public.baseline_metrics%rowtype;
  v_program_started_at timestamptz := null;
  v_checkin_scheduled_at timestamptz := null;
  v_checkin_start_date date := coalesce(p_first_checkin_date, current_date);
  v_checkin_workspace_id uuid;
  v_display_name text;
  v_goal text;
  v_injuries text;
  v_limitations text;
  v_equipment text;
  v_phone text;
  v_email text;
  v_location text;
  v_location_country text;
  v_timezone text;
  v_gender text;
  v_unit_preference text;
  v_training_type text;
  v_gym_name text;
  v_photo_url text;
  v_dob date;
  v_days_per_week integer;
  v_height_cm integer;
  v_current_weight numeric;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select c.*
  into v_client
  from public.clients c
  where c.id = p_client_id
  limit 1;

  if v_client.id is null then
    raise exception 'Client not found';
  end if;

  select *
  into v_row
  from public.workspace_client_onboardings wco
  where wco.workspace_id = v_client.workspace_id
    and wco.client_id = p_client_id
  limit 1
  for update;

  if v_row.id is null then
    raise exception 'Onboarding row not found';
  end if;

  if not public.is_pt_workspace_member(v_row.workspace_id) then
    raise exception 'Not authorized';
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
    raise exception 'Submitted baseline is required before completion';
  end if;

  if not exists (
    select 1
    from public.baseline_entries be
    where be.id = v_baseline_id
      and be.client_id = p_client_id
      and be.status = 'submitted'
  ) then
    raise exception 'Linked baseline must be submitted before completion';
  end if;

  select *
  into v_metrics
  from public.baseline_metrics bm
  where bm.baseline_id = v_baseline_id;

  if p_program_template_id is not null then
    perform public.assign_program_to_client(
      p_client_id,
      p_program_template_id,
      current_date,
      14
    );
    v_program_started_at := now();
  end if;

  if p_checkin_template_id is not null then
    select ct.workspace_id
    into v_checkin_workspace_id
    from public.checkin_templates ct
    where ct.id = p_checkin_template_id;

    if v_checkin_workspace_id is null then
      raise exception 'Check-in template not found';
    end if;

    if v_checkin_workspace_id <> v_client.workspace_id then
      raise exception 'Check-in template not found in workspace';
    end if;

    v_checkin_scheduled_at := now();
  end if;

  v_display_name := nullif(trim(coalesce(
    v_row.basics ->> 'display_name',
    v_client.display_name
  )), '');

  if coalesce(v_row.basics ->> 'dob', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_dob := (v_row.basics ->> 'dob')::date;
  else
    v_dob := v_client.dob;
  end if;

  v_phone := nullif(trim(coalesce(v_row.basics ->> 'phone', v_client.phone)), '');
  v_email := nullif(trim(coalesce(v_row.basics ->> 'email', v_client.email)), '');
  v_location := nullif(trim(coalesce(v_row.basics ->> 'location', v_client.location)), '');
  v_location_country := nullif(trim(coalesce(v_row.basics ->> 'location_country', v_client.location_country)), '');
  v_timezone := nullif(trim(coalesce(v_row.basics ->> 'timezone', v_client.timezone)), '');
  v_gender := nullif(trim(coalesce(v_row.basics ->> 'gender', v_client.gender)), '');
  v_goal := nullif(trim(coalesce(v_row.goals ->> 'goal', v_client.goal)), '');
  v_injuries := nullif(trim(coalesce(v_row.injuries_limitations ->> 'injuries', v_client.injuries)), '');
  v_limitations := nullif(trim(coalesce(v_row.injuries_limitations ->> 'limitations', v_client.limitations)), '');
  v_equipment := nullif(trim(coalesce(v_row.training_history ->> 'equipment', v_client.equipment)), '');
  v_gym_name := nullif(trim(coalesce(
    v_row.training_history ->> 'gym_name',
    v_row.basics ->> 'gym_name',
    v_client.gym_name
  )), '');
  v_photo_url := nullif(trim(coalesce(v_row.basics ->> 'photo_url', v_client.photo_url)), '');

  v_unit_preference := lower(trim(coalesce(
    v_row.nutrition_lifestyle ->> 'unit_preference',
    v_row.basics ->> 'unit_preference',
    v_client.unit_preference
  )));
  if v_unit_preference not in ('metric', 'imperial') then
    v_unit_preference := v_client.unit_preference;
  end if;

  v_training_type := lower(trim(coalesce(
    v_row.training_history ->> 'training_type',
    v_client.training_type
  )));
  if v_training_type not in ('online', 'hybrid', 'in_person') then
    v_training_type := v_client.training_type;
  end if;

  if coalesce(
    v_row.goals ->> 'days_per_week',
    v_row.training_history ->> 'days_per_week',
    v_row.basics ->> 'days_per_week',
    ''
  ) ~ '^\d+$' then
    v_days_per_week := (
      coalesce(
        v_row.goals ->> 'days_per_week',
        v_row.training_history ->> 'days_per_week',
        v_row.basics ->> 'days_per_week'
      )
    )::integer;
  else
    v_days_per_week := v_client.days_per_week;
  end if;

  if coalesce(
    v_row.basics ->> 'height_cm',
    ''
  ) ~ '^-?\d+(\.\d+)?$' then
    v_height_cm := round((v_row.basics ->> 'height_cm')::numeric)::integer;
  elsif v_metrics.height_cm is not null then
    v_height_cm := round(v_metrics.height_cm)::integer;
  else
    v_height_cm := v_client.height_cm;
  end if;

  if coalesce(
    v_row.basics ->> 'current_weight',
    ''
  ) ~ '^-?\d+(\.\d+)?$' then
    v_current_weight := (v_row.basics ->> 'current_weight')::numeric;
  elsif v_metrics.weight_kg is not null then
    v_current_weight := v_metrics.weight_kg;
  else
    v_current_weight := v_client.current_weight;
  end if;

  update public.clients
  set
    display_name = coalesce(v_display_name, display_name),
    goal = coalesce(v_goal, goal),
    injuries = coalesce(v_injuries, injuries),
    equipment = coalesce(v_equipment, equipment),
    height_cm = coalesce(v_height_cm, height_cm),
    dob = coalesce(v_dob, dob),
    phone = coalesce(v_phone, phone),
    email = coalesce(v_email, email),
    location = coalesce(v_location, location),
    timezone = coalesce(v_timezone, timezone),
    unit_preference = coalesce(v_unit_preference, unit_preference),
    gender = coalesce(v_gender, gender),
    training_type = coalesce(v_training_type, training_type),
    gym_name = coalesce(v_gym_name, gym_name),
    photo_url = coalesce(v_photo_url, photo_url),
    limitations = coalesce(v_limitations, limitations),
    location_country = coalesce(v_location_country, location_country),
    days_per_week = coalesce(v_days_per_week, days_per_week),
    current_weight = coalesce(v_current_weight, current_weight),
    checkin_template_id = coalesce(p_checkin_template_id, checkin_template_id),
    checkin_start_date = case
      when p_checkin_template_id is not null then v_checkin_start_date
      else checkin_start_date
    end,
    updated_at = now()
  where id = p_client_id;

  update public.workspace_client_onboardings
  set
    initial_baseline_entry_id = coalesce(initial_baseline_entry_id, v_baseline_id),
    coach_review_notes = coalesce(p_coach_review_notes, coach_review_notes),
    first_program_template_id = coalesce(p_program_template_id, first_program_template_id),
    first_program_applied_at = coalesce(v_program_started_at, first_program_applied_at),
    first_checkin_template_id = coalesce(p_checkin_template_id, first_checkin_template_id),
    first_checkin_date = coalesce(
      case when p_checkin_template_id is not null then v_checkin_start_date else null end,
      first_checkin_date
    ),
    first_checkin_scheduled_at = coalesce(v_checkin_scheduled_at, first_checkin_scheduled_at),
    reviewed_by_user_id = auth.uid(),
    submitted_at = coalesce(submitted_at, now()),
    reviewed_at = coalesce(reviewed_at, now()),
    activated_at = coalesce(activated_at, now()),
    completed_at = coalesce(completed_at, now()),
    status = 'completed'
  where id = v_row.id
  returning *
  into v_row;

  return v_row;
end;
$$;

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
    insert into public.clients (workspace_id, user_id, status, display_name)
    values (v_invite.workspace_id, v_user_id, 'active', null)
    returning id into v_client_id;
  else
    update public.clients c
    set user_id = v_user_id
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
    v_name := coalesce(nullif(trim(p_display_name), ''), split_part((auth.jwt() ->> 'email'), '@', 1), 'Client');

    insert into public.clients (workspace_id, user_id, display_name, status)
    values (v_inv.workspace_id, auth.uid(), v_name, 'active')
    returning id into v_client_id;
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set uses = uses + 1
  where id = v_inv.id;

  return query select v_inv.workspace_id, v_client_id;
end;
$$;

revoke all on table public.workspace_client_onboardings from public;
grant all on table public.workspace_client_onboardings to authenticated;
grant all on table public.workspace_client_onboardings to service_role;

revoke all on function public.ensure_workspace_client_onboarding(uuid, public.onboarding_source) from public;
grant all on function public.ensure_workspace_client_onboarding(uuid, public.onboarding_source) to authenticated;
grant all on function public.ensure_workspace_client_onboarding(uuid, public.onboarding_source) to service_role;

revoke all on function public.submit_workspace_client_onboarding(uuid) from public;
grant all on function public.submit_workspace_client_onboarding(uuid) to authenticated;
grant all on function public.submit_workspace_client_onboarding(uuid) to service_role;

revoke all on function public.review_workspace_client_onboarding(uuid, text) from public;
grant all on function public.review_workspace_client_onboarding(uuid, text) to authenticated;
grant all on function public.review_workspace_client_onboarding(uuid, text) to service_role;

revoke all on function public.complete_workspace_client_onboarding(uuid, uuid, uuid, date, text) from public;
grant all on function public.complete_workspace_client_onboarding(uuid, uuid, uuid, date, text) to authenticated;
grant all on function public.complete_workspace_client_onboarding(uuid, uuid, uuid, date, text) to service_role;

grant usage on type public.onboarding_source to authenticated, service_role;
grant usage on type public.onboarding_status to authenticated, service_role;
