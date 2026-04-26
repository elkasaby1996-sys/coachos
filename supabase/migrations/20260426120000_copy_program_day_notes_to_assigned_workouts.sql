create or replace function public.assign_program_to_client(
  p_client_id uuid,
  p_program_id uuid,
  p_start_date date,
  p_days_ahead integer default 14
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_program_workspace_id uuid;
  v_weeks_count int;
  v_i int;
  v_target_date date;
  v_week_number int;
  v_day_of_week int;
  v_workout_template_id uuid;
  v_is_rest bool;
  v_day_note text;
  v_upserted int := 0;
  v_rowcount int;
begin
  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'Not authorized';
  end if;

  select pt.workspace_id, pt.weeks_count
  into v_program_workspace_id, v_weeks_count
  from public.program_templates pt
  where pt.id = p_program_id;

  if v_program_workspace_id is null then
    raise exception 'Program not found';
  end if;

  if v_program_workspace_id <> v_workspace_id then
    raise exception 'Program not found in workspace';
  end if;

  update public.client_program_assignments
  set is_active = false
  where client_id = p_client_id
    and is_active = true;

  insert into public.client_program_assignments (
    workspace_id,
    client_id,
    program_id,
    start_date,
    is_active
  ) values (
    v_workspace_id,
    p_client_id,
    p_program_id,
    p_start_date,
    true
  );

  if to_regclass('public.client_programs') is not null then
    update public.client_programs
    set is_active = false,
        updated_at = now()
    where client_id = p_client_id
      and is_active = true;

    insert into public.client_programs (
      client_id,
      program_template_id,
      start_date,
      is_active
    ) values (
      p_client_id,
      p_program_id,
      p_start_date,
      true
    );
  end if;

  for v_i in 0..greatest(p_days_ahead, 0) - 1 loop
    v_target_date := p_start_date + v_i;
    v_week_number := ((v_i / 7) % v_weeks_count) + 1;
    v_day_of_week := (v_i % 7) + 1;

    select d.workout_template_id, d.is_rest, nullif(btrim(d.notes), '')
    into v_workout_template_id, v_is_rest, v_day_note
    from public.program_template_days d
    where d.program_template_id = p_program_id
      and d.week_number = v_week_number
      and d.day_of_week = v_day_of_week
    order by d.sort_order asc
    limit 1;

    if not found then
      continue;
    end if;

    if v_is_rest or v_workout_template_id is null then
      update public.assigned_workouts
      set workout_template_id = null,
          day_type = 'rest',
          status = 'planned',
          program_id = p_program_id,
          program_day_index = v_i,
          coach_note = v_day_note
      where client_id = p_client_id
        and scheduled_date = v_target_date;

      get diagnostics v_rowcount = row_count;

      if v_rowcount = 0 then
        insert into public.assigned_workouts (
          client_id,
          workout_template_id,
          scheduled_date,
          status,
          day_type,
          program_id,
          program_day_index,
          coach_note
        ) values (
          p_client_id,
          null,
          v_target_date,
          'planned',
          'rest',
          p_program_id,
          v_i,
          v_day_note
        );
        v_upserted := v_upserted + 1;
      else
        v_upserted := v_upserted + v_rowcount;
      end if;
    else
      update public.assigned_workouts
      set workout_template_id = v_workout_template_id,
          day_type = 'workout',
          status = 'planned',
          program_id = p_program_id,
          program_day_index = v_i,
          coach_note = v_day_note
      where client_id = p_client_id
        and scheduled_date = v_target_date;

      get diagnostics v_rowcount = row_count;

      if v_rowcount = 0 then
        insert into public.assigned_workouts (
          client_id,
          workout_template_id,
          scheduled_date,
          status,
          day_type,
          program_id,
          program_day_index,
          coach_note
        ) values (
          p_client_id,
          v_workout_template_id,
          v_target_date,
          'planned',
          'workout',
          p_program_id,
          v_i,
          v_day_note
        );
        v_upserted := v_upserted + 1;
      else
        v_upserted := v_upserted + v_rowcount;
      end if;
    end if;
  end loop;

  return v_upserted;
end;
$$;

grant execute on function public.assign_program_to_client(uuid, uuid, date, integer) to authenticated;

update public.assigned_workouts aw
set coach_note = nullif(btrim(d.notes), '')
from public.program_templates pt
join public.program_template_days d
  on d.program_template_id = pt.id
where aw.program_id = pt.id
  and aw.program_day_index is not null
  and d.week_number = (((aw.program_day_index / 7) % pt.weeks_count) + 1)
  and d.day_of_week = ((aw.program_day_index % 7) + 1)
  and nullif(btrim(d.notes), '') is not null
  and aw.coach_note is null;
