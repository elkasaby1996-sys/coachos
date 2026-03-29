create or replace function public.normalize_checkin_due_date(p_anchor_date date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_anchor_date
$$;

create or replace function public.calculate_checkin_due_date(
  p_start_date date,
  p_frequency text,
  p_occurrence integer
)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_frequency text := coalesce(p_frequency, 'weekly');
  v_due_date date;
begin
  if p_start_date is null or p_occurrence is null or p_occurrence < 0 then
    return null;
  end if;

  if v_frequency not in ('weekly', 'biweekly', 'monthly') then
    v_frequency := 'weekly';
  end if;

  if v_frequency = 'monthly' then
    v_due_date := public.add_months_clamped(p_start_date, p_occurrence);
  elsif v_frequency = 'biweekly' then
    v_due_date := p_start_date + (p_occurrence * 14);
  else
    v_due_date := p_start_date + (p_occurrence * 7);
  end if;

  return public.normalize_checkin_due_date(v_due_date);
end;
$$;

create or replace function public.validate_checkin_submission_requirements(
  p_checkin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_checkin record;
  v_effective_template_id uuid;
  v_missing_questions text[];
  v_missing_photos text[];
begin
  select ci.id,
         ci.client_id,
         ci.template_id,
         ci.week_ending_saturday,
         c.checkin_start_date,
         c.checkin_frequency
  into v_checkin
  from public.checkins ci
  join public.clients c on c.id = ci.client_id
  where ci.id = p_checkin_id;

  if v_checkin.id is null then
    raise exception 'Check-in not found';
  end if;

  if v_checkin.checkin_start_date is null then
    raise exception 'Check-in start date is required before submission';
  end if;

  v_effective_template_id := public.get_effective_client_checkin_template_id(
    v_checkin.client_id
  );

  if v_effective_template_id is null then
    raise exception 'Check-in template is required before submission';
  end if;

  if v_checkin.template_id is distinct from v_effective_template_id then
    raise exception 'Check-in template is out of date for this client';
  end if;

  if not public.is_client_checkin_due_date(
    v_checkin.client_id,
    v_checkin.week_ending_saturday
  ) then
    raise exception 'Check-in due date does not match the client schedule';
  end if;

  select array_agg(
           coalesce(
             nullif(trim(q.question_text), ''),
             nullif(trim(q.prompt), ''),
             q.id::text
           )
           order by coalesce(q.sort_order, q.position, 0), q.id
         )
  into v_missing_questions
  from public.checkin_questions q
  left join public.checkin_answers a
    on a.checkin_id = v_checkin.id
   and a.question_id = q.id
  where q.template_id = v_checkin.template_id
    and q.is_required
    and nullif(btrim(coalesce(a.value_text, '')), '') is null
    and a.value_number is null;

  if coalesce(array_length(v_missing_questions, 1), 0) > 0 then
    raise exception 'Required check-in answers are missing';
  end if;

  select array_agg(req.photo_type order by req.photo_type)
  into v_missing_photos
  from (values ('front'), ('side'), ('back')) as req(photo_type)
  left join public.checkin_photos cp
    on cp.checkin_id = v_checkin.id
   and cp.photo_type = req.photo_type
  where cp.id is null;

  if coalesce(array_length(v_missing_photos, 1), 0) > 0 then
    raise exception 'Required progress photos are missing';
  end if;
end;
$$;

create or replace function public.handle_checkin_requested_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_user_id uuid;
  v_workspace_id uuid;
begin
  select c.user_id, c.workspace_id
  into v_client_user_id, v_workspace_id
  from public.clients c
  where c.id = new.client_id;

  if v_client_user_id is null or new.submitted_at is not null then
    return new;
  end if;

  if new.week_ending_saturday > current_date + 7 then
    return new;
  end if;

  if exists (
    select 1
    from public.checkins ci
    where ci.client_id = new.client_id
      and ci.id <> new.id
      and ci.submitted_at is null
      and ci.week_ending_saturday < new.week_ending_saturday
  ) then
    return new;
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  ) then
    return new;
  end if;

  perform public.notify_user(
    v_client_user_id,
    'checkin_requested',
    'Check-in requested',
    format('Your coach requested a check-in due on %s.', to_char(new.week_ending_saturday::timestamp, 'Mon DD')),
    '/app/checkin',
    'checkin',
    new.id,
    null,
    jsonb_build_object('week_ending_saturday', new.week_ending_saturday, 'client_id', new.client_id),
    'checkins',
    'normal'
  );

  return new;
end;
$$;

alter table public.checkins
  drop constraint if exists checkins_week_ending_saturday_is_saturday;
