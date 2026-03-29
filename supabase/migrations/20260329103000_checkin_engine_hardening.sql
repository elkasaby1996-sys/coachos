create or replace function public.add_months_clamped(
  p_date date,
  p_months integer
)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_month_start date;
  v_month_end date;
  v_day integer;
begin
  if p_date is null then
    return null;
  end if;

  v_month_start := (
    date_trunc('month', p_date)::date + make_interval(months => p_months)
  )::date;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_day := least(
    extract(day from p_date)::integer,
    extract(day from v_month_end)::integer
  );

  return v_month_start + (v_day - 1);
end;
$$;

create or replace function public.normalize_checkin_due_date(p_anchor_date date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_anchor_date is null then null
    else p_anchor_date + ((6 - extract(dow from p_anchor_date)::integer + 7) % 7)
  end
$$;

create or replace function public.get_effective_client_checkin_template_id(
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_template_id uuid;
begin
  if p_client_id is null then
    return null;
  end if;

  select c.workspace_id, c.checkin_template_id
  into v_workspace_id, v_template_id
  from public.clients c
  where c.id = p_client_id;

  if v_template_id is not null then
    return v_template_id;
  end if;

  select w.default_checkin_template_id
  into v_template_id
  from public.workspaces w
  where w.id = v_workspace_id;

  if v_template_id is not null then
    return v_template_id;
  end if;

  select ct.id
  into v_template_id
  from public.checkin_templates ct
  where ct.workspace_id = v_workspace_id
  order by ct.created_at desc
  limit 1;

  return v_template_id;
end;
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
  v_anchor_date date;
begin
  if p_start_date is null or p_occurrence is null or p_occurrence < 0 then
    return null;
  end if;

  if v_frequency not in ('weekly', 'biweekly', 'monthly') then
    v_frequency := 'weekly';
  end if;

  if v_frequency = 'monthly' then
    v_anchor_date := public.add_months_clamped(p_start_date, p_occurrence);
  elsif v_frequency = 'biweekly' then
    v_anchor_date := p_start_date + (p_occurrence * 14);
  else
    v_anchor_date := p_start_date + (p_occurrence * 7);
  end if;

  return public.normalize_checkin_due_date(v_anchor_date);
end;
$$;

create or replace function public.is_client_checkin_due_date(
  p_client_id uuid,
  p_due_date date
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start_date date;
  v_frequency text;
  v_occurrence integer := 0;
  v_calculated_due date;
begin
  if p_client_id is null or p_due_date is null then
    return false;
  end if;

  select c.checkin_start_date, c.checkin_frequency
  into v_start_date, v_frequency
  from public.clients c
  where c.id = p_client_id;

  if v_start_date is null then
    return false;
  end if;

  loop
    v_calculated_due := public.calculate_checkin_due_date(
      v_start_date,
      v_frequency,
      v_occurrence
    );

    exit when v_calculated_due is null or v_calculated_due > p_due_date;

    if v_calculated_due = p_due_date then
      return true;
    end if;

    v_occurrence := v_occurrence + 1;
    exit when v_occurrence > 1000;
  end loop;

  return false;
end;
$$;

create or replace function public.is_client_checkin_owner(p_checkin_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.checkins ci
    where ci.id = p_checkin_id
      and public.is_client_owner(ci.client_id)
  )
$$;

create or replace function public.is_client_checkin_draft_owner(p_checkin_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.checkins ci
    where ci.id = p_checkin_id
      and ci.submitted_at is null
      and public.is_client_owner(ci.client_id)
  )
$$;

create or replace function public.is_pt_checkin_manager(p_checkin_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.checkins ci
    join public.clients c on c.id = ci.client_id
    where ci.id = p_checkin_id
      and public.is_pt_workspace_member(c.workspace_id)
  )
$$;

create or replace function public.reconcile_client_checkins(
  p_client_id uuid,
  p_range_start date,
  p_range_end date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_template_id uuid;
  v_occurrence integer := 0;
  v_due_date date;
  v_due_dates date[] := '{}'::date[];
begin
  if p_client_id is null or p_range_start is null or p_range_end is null then
    return;
  end if;

  if p_range_end < p_range_start then
    return;
  end if;

  select c.id, c.checkin_start_date, c.checkin_frequency
  into v_client
  from public.clients c
  where c.id = p_client_id;

  if v_client.id is null then
    return;
  end if;

  v_template_id := public.get_effective_client_checkin_template_id(p_client_id);

  if v_client.checkin_start_date is null or v_template_id is null then
    delete from public.checkins ci
    where ci.client_id = p_client_id
      and ci.submitted_at is null
      and ci.week_ending_saturday between p_range_start and p_range_end;
    return;
  end if;

  loop
    v_due_date := public.calculate_checkin_due_date(
      v_client.checkin_start_date,
      v_client.checkin_frequency,
      v_occurrence
    );

    exit when v_due_date is null or v_due_date > p_range_end;

    if v_due_date >= p_range_start then
      v_due_dates := array_append(v_due_dates, v_due_date);

      insert into public.checkins (client_id, template_id, week_ending_saturday)
      values (p_client_id, v_template_id, v_due_date)
      on conflict (client_id, week_ending_saturday) do update
      set template_id = excluded.template_id
      where public.checkins.submitted_at is null
        and public.checkins.template_id is distinct from excluded.template_id;
    end if;

    v_occurrence := v_occurrence + 1;
    exit when v_occurrence > 1000;
  end loop;

  delete from public.checkins ci
  where ci.client_id = p_client_id
    and ci.submitted_at is null
    and ci.week_ending_saturday between p_range_start and p_range_end
    and not (ci.week_ending_saturday = any(v_due_dates));
end;
$$;

create or replace function public.ensure_client_checkins(
  p_client_id uuid,
  p_range_start date,
  p_range_end date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
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

  if not public.is_client_owner(p_client_id)
     and not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Not authorized';
  end if;

  perform public.reconcile_client_checkins(
    p_client_id,
    p_range_start,
    p_range_end
  );
end;
$$;

create or replace function public.ensure_workspace_checkins(
  p_workspace_id uuid,
  p_range_start date,
  p_range_end date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
begin
  if p_workspace_id is null then
    raise exception 'Workspace is required';
  end if;

  if not public.is_pt_workspace_member(p_workspace_id) then
    raise exception 'Not authorized';
  end if;

  for v_client in
    select c.id
    from public.clients c
    where c.workspace_id = p_workspace_id
  loop
    perform public.reconcile_client_checkins(
      v_client.id,
      p_range_start,
      p_range_end
    );
  end loop;
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

  if extract(dow from v_checkin.week_ending_saturday)::integer <> 6 then
    raise exception 'Check-in due dates must be Saturdays';
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

create or replace function public.enforce_checkin_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  if new.week_ending_saturday is not null then
    new.week_ending_saturday := public.normalize_checkin_due_date(new.week_ending_saturday);
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = coalesce(new.client_id, old.client_id);

  if tg_op = 'INSERT' then
    if new.pt_feedback is not null and not public.is_pt_workspace_member(v_workspace_id) then
      raise exception 'Only PT workspace members can write coach feedback';
    end if;

    if new.submitted_at is not null then
      perform public.validate_checkin_submission_requirements(new.id);
    end if;

    return new;
  end if;

  if old.submitted_at is not null then
    if new.client_id is distinct from old.client_id
       or new.template_id is distinct from old.template_id
       or new.week_ending_saturday is distinct from old.week_ending_saturday
       or new.submitted_at is distinct from old.submitted_at
       or new.created_at is distinct from old.created_at then
      raise exception 'Submitted check-ins are immutable';
    end if;

    if new.pt_feedback is distinct from old.pt_feedback
       and not public.is_pt_workspace_member(v_workspace_id) then
      raise exception 'Only PT workspace members can review submitted check-ins';
    end if;

    return new;
  end if;

  if new.pt_feedback is distinct from old.pt_feedback
     and not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Only PT workspace members can write coach feedback';
  end if;

  if old.submitted_at is null and new.submitted_at is not null then
    perform public.validate_checkin_submission_requirements(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.prevent_submitted_checkin_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_checkin_id uuid := coalesce(new.checkin_id, old.checkin_id);
  v_submitted_at timestamptz;
begin
  select ci.submitted_at
  into v_submitted_at
  from public.checkins ci
  where ci.id = v_checkin_id;

  if v_submitted_at is not null then
    raise exception 'Submitted check-ins are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.sync_client_checkins_from_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.reconcile_client_checkins(
    new.id,
    least(coalesce(new.checkin_start_date, current_date), current_date),
    current_date + 120
  );

  return new;
end;
$$;

create or replace function public.sync_future_checkins_after_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.submitted_at is null and new.submitted_at is not null then
    perform public.reconcile_client_checkins(
      new.client_id,
      current_date,
      current_date + 120
    );
  end if;

  return new;
end;
$$;

create or replace function public.can_manage_checkin_photo_object(
  p_object_name text
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_checkin_id uuid;
begin
  if p_object_name is null then
    return false;
  end if;

  begin
    v_client_id := nullif(split_part(p_object_name, '/', 1), '')::uuid;
    v_checkin_id := nullif(split_part(p_object_name, '/', 2), '')::uuid;
  exception
    when others then
      return false;
  end;

  if v_client_id is null or v_checkin_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.checkins ci
    where ci.id = v_checkin_id
      and ci.client_id = v_client_id
      and ci.submitted_at is null
      and public.is_client_owner(v_client_id)
  );
end;
$$;

create or replace function public.review_checkin(
  p_checkin_id uuid,
  p_pt_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select c.workspace_id
  into v_workspace_id
  from public.checkins ci
  join public.clients c on c.id = ci.client_id
  where ci.id = p_checkin_id;

  if v_workspace_id is null then
    raise exception 'Check-in not found';
  end if;

  if not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Not authorized';
  end if;

  update public.checkins
  set pt_feedback = nullif(trim(p_pt_feedback), '')
  where id = p_checkin_id;
end;
$$;

delete from public.checkins draft
using public.checkins existing
where draft.id <> existing.id
  and draft.client_id = existing.client_id
  and draft.submitted_at is null
  and draft.week_ending_saturday is distinct from public.normalize_checkin_due_date(draft.week_ending_saturday)
  and public.normalize_checkin_due_date(draft.week_ending_saturday) = existing.week_ending_saturday;

update public.checkins
set week_ending_saturday = public.normalize_checkin_due_date(week_ending_saturday)
where week_ending_saturday is distinct from public.normalize_checkin_due_date(week_ending_saturday);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'checkins_week_ending_saturday_is_saturday'
  ) then
    alter table public.checkins
      add constraint checkins_week_ending_saturday_is_saturday
      check (extract(dow from week_ending_saturday) = 6);
  end if;
end
$$;

drop trigger if exists checkins_enforce_write_rules_trigger on public.checkins;
create trigger checkins_enforce_write_rules_trigger
before insert or update on public.checkins
for each row
execute function public.enforce_checkin_write_rules();

drop trigger if exists checkins_sync_future_rows_trigger on public.checkins;
create trigger checkins_sync_future_rows_trigger
after update on public.checkins
for each row
execute function public.sync_future_checkins_after_submission();

drop trigger if exists clients_sync_checkins_trigger on public.clients;
create trigger clients_sync_checkins_trigger
after insert or update of checkin_template_id, checkin_frequency, checkin_start_date
on public.clients
for each row
execute function public.sync_client_checkins_from_settings();

drop trigger if exists checkin_answers_submission_lock_trigger on public.checkin_answers;
create trigger checkin_answers_submission_lock_trigger
before insert or update or delete on public.checkin_answers
for each row
execute function public.prevent_submitted_checkin_child_mutation();

drop trigger if exists checkin_photos_submission_lock_trigger on public.checkin_photos;
create trigger checkin_photos_submission_lock_trigger
before insert or update or delete on public.checkin_photos
for each row
execute function public.prevent_submitted_checkin_child_mutation();

drop policy if exists "checkins_access" on public.checkins;
drop policy if exists "checkin_answers_access" on public.checkin_answers;
drop policy if exists "checkin_photos_access" on public.checkin_photos;

create policy "checkins_select_access"
  on public.checkins
  for select
  to authenticated
  using (
    public.is_client_owner(client_id)
    or exists (
      select 1
      from public.clients c
      where c.id = checkins.client_id
        and public.is_pt_workspace_member(c.workspace_id)
    )
  );

create policy "checkins_insert_client_draft"
  on public.checkins
  for insert
  to authenticated
  with check (
    public.is_client_owner(client_id)
    and pt_feedback is null
    and public.is_client_checkin_due_date(client_id, week_ending_saturday)
  );

create policy "checkins_update_client_draft"
  on public.checkins
  for update
  to authenticated
  using (
    public.is_client_owner(client_id)
    and submitted_at is null
  )
  with check (
    public.is_client_owner(client_id)
    and pt_feedback is null
    and public.is_client_checkin_due_date(client_id, week_ending_saturday)
  );

create policy "checkin_answers_select_access"
  on public.checkin_answers
  for select
  to authenticated
  using (
    public.is_client_checkin_owner(checkin_id)
    or public.is_pt_checkin_manager(checkin_id)
  );

create policy "checkin_answers_insert_client_draft"
  on public.checkin_answers
  for insert
  to authenticated
  with check (public.is_client_checkin_draft_owner(checkin_id));

create policy "checkin_answers_update_client_draft"
  on public.checkin_answers
  for update
  to authenticated
  using (public.is_client_checkin_draft_owner(checkin_id))
  with check (public.is_client_checkin_draft_owner(checkin_id));

create policy "checkin_answers_delete_client_draft"
  on public.checkin_answers
  for delete
  to authenticated
  using (public.is_client_checkin_draft_owner(checkin_id));

create policy "checkin_photos_select_access"
  on public.checkin_photos
  for select
  to authenticated
  using (
    public.is_client_checkin_owner(checkin_id)
    or public.is_pt_checkin_manager(checkin_id)
  );

create policy "checkin_photos_insert_client_draft"
  on public.checkin_photos
  for insert
  to authenticated
  with check (public.is_client_checkin_draft_owner(checkin_id));

create policy "checkin_photos_update_client_draft"
  on public.checkin_photos
  for update
  to authenticated
  using (public.is_client_checkin_draft_owner(checkin_id))
  with check (public.is_client_checkin_draft_owner(checkin_id));

create policy "checkin_photos_delete_client_draft"
  on public.checkin_photos
  for delete
  to authenticated
  using (public.is_client_checkin_draft_owner(checkin_id));

drop policy if exists "checkin_photos_storage_client_rw" on storage.objects;
drop policy if exists "checkin_photos_storage_pt_read" on storage.objects;

create policy "checkin_photos_storage_client_manage"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'checkin-photos'
    and public.can_manage_checkin_photo_object(storage.objects.name)
  )
  with check (
    bucket_id = 'checkin-photos'
    and public.can_manage_checkin_photo_object(storage.objects.name)
  );

create policy "checkin_photos_storage_pt_read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'checkin-photos'
    and exists (
      select 1
      from public.clients c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where storage.objects.name like c.id || '/%'
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
  );

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
      and wm.role like 'pt_%'
  ) then
    return new;
  end if;

  perform public.notify_user(
    v_client_user_id,
    'checkin_requested',
    'Check-in requested',
    format('Your coach requested a check-in for the week ending %s.', to_char(new.week_ending_saturday::timestamp, 'Mon DD')),
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

create or replace function public.pt_clients_summary(
  p_workspace_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  user_id uuid,
  status text,
  display_name text,
  tags text[],
  created_at timestamptz,
  last_session_at timestamptz,
  last_checkin_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    c.id,
    c.user_id,
    c.status::text,
    c.display_name,
    c.tags,
    c.created_at,
    ls.last_session_at,
    lc.last_checkin_at
  from public.clients c
  left join lateral (
    select max(ws.started_at) as last_session_at
    from public.workout_sessions ws
    left join public.assigned_workouts aw on aw.id = ws.assigned_workout_id
    where ws.client_id = c.id or aw.client_id = c.id
  ) ls on true
  left join lateral (
    select max(ci.submitted_at) as last_checkin_at
    from public.checkins ci
    where ci.client_id = c.id
      and ci.submitted_at is not null
  ) lc on true
  where c.workspace_id = p_workspace_id
  order by c.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.pt_dashboard_summary(
  p_workspace_id uuid,
  p_coach_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
  v_today date := current_date;
  v_start_week date := v_today - 6;
  v_end_week date := v_today + 6;
  v_last_saturday date := v_today - ((extract(dow from v_today)::int - 6 + 7) % 7);
  v_client_ids uuid[];
  v_clients jsonb;
  v_checkins jsonb;
  v_assigned jsonb;
  v_messages jsonb;
  v_unread int;
  v_todos jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_coach_id is distinct from v_user_id then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'Not authorized';
  end if;

  perform public.ensure_workspace_checkins(
    p_workspace_id,
    v_today,
    v_end_week
  );

  select array_agg(id) into v_client_ids
  from public.clients
  where workspace_id = p_workspace_id;

  select jsonb_agg(c) into v_clients
  from (
    select id, workspace_id, user_id, status, display_name, created_at, tags, timezone
    from public.clients
    where workspace_id = p_workspace_id
    order by created_at desc
  ) c;

  select jsonb_agg(a) into v_assigned
  from (
    select id, client_id, status, scheduled_date
    from public.assigned_workouts
    where client_id = any(v_client_ids)
      and scheduled_date between v_start_week and v_today
  ) a;

  select jsonb_agg(ci) into v_checkins
  from (
    select id, client_id, week_ending_saturday, submitted_at, created_at
    from public.checkins
    where client_id = any(v_client_ids)
      and week_ending_saturday between v_start_week and v_end_week
  ) ci;

  select jsonb_agg(m) into v_messages
  from (
    select
      conv.id,
      conv.last_message_at as created_at,
      conv.last_message_sender_name as sender_name,
      conv.last_message_preview as preview
    from public.conversations conv
    where conv.workspace_id = p_workspace_id
    order by conv.last_message_at desc nulls last
    limit 5
  ) m;

  select count(*) into v_unread
  from public.messages m
  join public.conversations conv on conv.id = m.conversation_id
  join public.clients c on c.id = conv.client_id
  where m.unread = true
    and c.workspace_id = p_workspace_id;

  select jsonb_agg(t) into v_todos
  from (
    select id, title, is_done, created_at
    from public.coach_todos
    where workspace_id = p_workspace_id
      and coach_id = p_coach_id
    order by created_at asc
  ) t;

  return jsonb_build_object(
    'clients', coalesce(v_clients, '[]'::jsonb),
    'assignedWorkouts', coalesce(v_assigned, '[]'::jsonb),
    'checkins', coalesce(v_checkins, '[]'::jsonb),
    'messages', coalesce(v_messages, '[]'::jsonb),
    'unreadCount', coalesce(v_unread, 0),
    'coachTodos', coalesce(v_todos, '[]'::jsonb),
    'today', v_today::text,
    'lastSaturday', v_last_saturday::text
  );
end;
$$;

do $$
declare
  v_client record;
begin
  for v_client in
    select c.id
    from public.clients c
    where c.checkin_start_date is not null
  loop
    perform public.reconcile_client_checkins(
      v_client.id,
      current_date,
      current_date + 120
    );
  end loop;
end;
$$;

revoke all on function public.add_months_clamped(date, integer) from public;
revoke all on function public.normalize_checkin_due_date(date) from public;
revoke all on function public.get_effective_client_checkin_template_id(uuid) from public;
revoke all on function public.calculate_checkin_due_date(date, text, integer) from public;
revoke all on function public.is_client_checkin_due_date(uuid, date) from public;
revoke all on function public.is_client_checkin_owner(uuid) from public;
revoke all on function public.is_client_checkin_draft_owner(uuid) from public;
revoke all on function public.is_pt_checkin_manager(uuid) from public;
revoke all on function public.reconcile_client_checkins(uuid, date, date) from public;
revoke all on function public.ensure_client_checkins(uuid, date, date) from public;
revoke all on function public.ensure_workspace_checkins(uuid, date, date) from public;
revoke all on function public.validate_checkin_submission_requirements(uuid) from public;
revoke all on function public.enforce_checkin_write_rules() from public;
revoke all on function public.prevent_submitted_checkin_child_mutation() from public;
revoke all on function public.sync_client_checkins_from_settings() from public;
revoke all on function public.sync_future_checkins_after_submission() from public;
revoke all on function public.can_manage_checkin_photo_object(text) from public;
revoke all on function public.review_checkin(uuid, text) from public;

grant execute on function public.normalize_checkin_due_date(date) to authenticated;
grant execute on function public.calculate_checkin_due_date(date, text, integer) to authenticated;
grant execute on function public.is_client_checkin_due_date(uuid, date) to authenticated;
grant execute on function public.ensure_client_checkins(uuid, date, date) to authenticated;
grant execute on function public.ensure_workspace_checkins(uuid, date, date) to authenticated;
grant execute on function public.review_checkin(uuid, text) to authenticated;
