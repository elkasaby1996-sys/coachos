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
