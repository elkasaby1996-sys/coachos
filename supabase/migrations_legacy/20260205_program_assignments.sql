create table if not exists public.client_program_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  program_id uuid not null,
  start_date date not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_program_assignments_program_id_fkey'
      and conrelid = 'public.client_program_assignments'::regclass
  ) then
    if to_regclass('public.programs') is not null then
      alter table public.client_program_assignments
        add constraint client_program_assignments_program_id_fkey
        foreign key (program_id) references public.programs(id) on delete cascade;
    elsif to_regclass('public.program_templates') is not null then
      alter table public.client_program_assignments
        add constraint client_program_assignments_program_id_fkey
        foreign key (program_id) references public.program_templates(id) on delete cascade;
    end if;
  end if;
end $$;

create unique index if not exists client_program_assignments_one_active_idx
  on public.client_program_assignments (client_id)
  where is_active;

alter table public.assigned_workouts
  add column if not exists day_type text not null default 'workout';

alter table public.assigned_workouts
  add column if not exists program_id uuid null;

alter table public.assigned_workouts
  add column if not exists program_day_index int null;

update public.assigned_workouts
set day_type = 'rest'
where day_type = 'workout'
  and workout_template_id is null;

do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.assigned_workouts'::regclass
      and attname = 'workout_template_id'
      and attnotnull = true
  ) then
    alter table public.assigned_workouts
      alter column workout_template_id drop not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assigned_workouts_day_type_check'
      and conrelid = 'public.assigned_workouts'::regclass
  ) then
    alter table public.assigned_workouts
      add constraint assigned_workouts_day_type_check
      check (day_type in ('workout', 'rest'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assigned_workouts_program_id_fkey'
      and conrelid = 'public.assigned_workouts'::regclass
  ) then
    if to_regclass('public.programs') is not null then
      alter table public.assigned_workouts
        add constraint assigned_workouts_program_id_fkey
        foreign key (program_id) references public.programs(id) on delete set null;
    elsif to_regclass('public.program_templates') is not null then
      alter table public.assigned_workouts
        add constraint assigned_workouts_program_id_fkey
        foreign key (program_id) references public.program_templates(id) on delete set null;
    end if;
  end if;
end $$;

alter table public.client_program_assignments enable row level security;

alter table public.workspace_members enable row level security;

drop policy if exists "workspace_members_select_own" on public.workspace_members;
create policy "workspace_members_select_own"
  on public.workspace_members
  for select
  using (user_id = auth.uid());

alter table public.clients enable row level security;

drop policy if exists "clients_select_own_profile" on public.clients;
create policy "clients_select_own_profile"
  on public.clients
  for select
  using (user_id = auth.uid());

drop policy if exists "pt_select_workspace_clients" on public.clients;
create policy "pt_select_workspace_clients"
  on public.clients
  for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = clients.workspace_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

drop policy if exists "pt_manage_client_program_assignments" on public.client_program_assignments;
create policy "pt_manage_client_program_assignments"
  on public.client_program_assignments
  for all
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = client_program_assignments.workspace_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = client_program_assignments.workspace_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

drop policy if exists "client_select_own_program_assignment" on public.client_program_assignments;
create policy "client_select_own_program_assignment"
  on public.client_program_assignments
  for select
  using (
    client_program_assignments.is_active = true
    and exists (
      select 1
      from public.clients c
      where c.id = client_program_assignments.client_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "pt_manage_assigned_workouts" on public.assigned_workouts;
create policy "pt_manage_assigned_workouts"
  on public.assigned_workouts
  for all
  using (
    exists (
      select 1
      from public.clients c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = assigned_workouts.client_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  )
  with check (
    exists (
      select 1
      from public.clients c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = assigned_workouts.client_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

create or replace function public.assign_program_to_client(
  p_client_id uuid,
  p_program_id uuid,
  p_start_date date,
  p_days_ahead int default 14
)
returns int
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

    select d.workout_template_id, d.is_rest
    into v_workout_template_id, v_is_rest
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
          program_day_index = v_i
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
          program_day_index
        ) values (
          p_client_id,
          null,
          v_target_date,
          'planned',
          'rest',
          p_program_id,
          v_i
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
          program_day_index = v_i
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
          program_day_index
        ) values (
          p_client_id,
          v_workout_template_id,
          v_target_date,
          'planned',
          'workout',
          p_program_id,
          v_i
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

grant execute on function public.assign_program_to_client(uuid, uuid, date, int) to authenticated;

create or replace function public.apply_program_to_client(
  p_client_id uuid,
  p_program_template_id uuid,
  p_start_date date,
  p_horizon_days int default 14
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_program_id uuid;
  v_workspace_id uuid;
  v_weeks_count int;
  v_i int;
  v_target_date date;
  v_week_number int;
  v_day_of_week int;
  v_workout_template_id uuid;
  v_is_rest bool;
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

  select weeks_count
  into v_weeks_count
  from public.program_templates pt
  where pt.id = p_program_template_id
    and pt.workspace_id = v_workspace_id;

  if v_weeks_count is null then
    raise exception 'Program template not found in workspace';
  end if;

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
    p_program_template_id,
    p_start_date,
    true
  )
  returning id into v_client_program_id;

  for v_i in 0..greatest(p_horizon_days, 0) - 1 loop
    v_target_date := p_start_date + v_i;
    v_week_number := ((v_i / 7) % v_weeks_count) + 1;
    v_day_of_week := (v_i % 7) + 1;

    select o.workout_template_id, o.is_rest
    into v_workout_template_id, v_is_rest
    from public.client_program_overrides o
    where o.client_program_id = v_client_program_id
      and o.override_date = v_target_date;

    if not found then
      select d.workout_template_id, d.is_rest
      into v_workout_template_id, v_is_rest
      from public.program_template_days d
      where d.program_template_id = p_program_template_id
        and d.week_number = v_week_number
        and d.day_of_week = v_day_of_week
      order by d.sort_order asc
      limit 1;
    end if;

    if not found then
      continue;
    end if;

    if v_is_rest or v_workout_template_id is null then
      update public.assigned_workouts
      set status = 'planned',
          workout_template_id = null,
          day_type = 'rest',
          program_id = p_program_template_id,
          program_day_index = v_i
      where client_id = p_client_id
        and scheduled_date = v_target_date
        and workout_template_id is null;

      get diagnostics v_rowcount = row_count;

      if v_rowcount = 0 then
        insert into public.assigned_workouts (
          client_id,
          workout_template_id,
          scheduled_date,
          status,
          day_type,
          program_id,
          program_day_index
        ) values (
          p_client_id,
          null,
          v_target_date,
          'planned',
          'rest',
          p_program_template_id,
          v_i
        );
        v_upserted := v_upserted + 1;
      else
        v_upserted := v_upserted + v_rowcount;
      end if;
    else
      insert into public.assigned_workouts (
        client_id,
        workout_template_id,
        scheduled_date,
        status,
        day_type,
        program_id,
        program_day_index
      ) values (
        p_client_id,
        v_workout_template_id,
        v_target_date,
        'planned',
        'workout',
        p_program_template_id,
        v_i
      )
      on conflict (client_id, scheduled_date, workout_template_id)
      do update set
        status = 'planned',
        day_type = 'workout',
        program_id = p_program_template_id,
        program_day_index = v_i;

      get diagnostics v_rowcount = row_count;
      v_upserted := v_upserted + v_rowcount;
    end if;
  end loop;

  return v_upserted;
end;
$$;

grant execute on function public.apply_program_to_client(uuid, uuid, date, int) to authenticated;
