create extension if not exists "pgcrypto";

create table if not exists public.program_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text null,
  weeks_count int not null,
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_template_days (
  id uuid primary key default gen_random_uuid(),
  program_template_id uuid not null references public.program_templates(id) on delete cascade,
  week_number int not null,
  day_of_week int not null,
  workout_template_id uuid null references public.workout_templates(id) on delete set null,
  is_rest bool not null default false,
  notes text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.client_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  program_template_id uuid not null references public.program_templates(id) on delete cascade,
  start_date date not null,
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_program_overrides (
  id uuid primary key default gen_random_uuid(),
  client_program_id uuid not null references public.client_programs(id) on delete cascade,
  override_date date not null,
  workout_template_id uuid null references public.workout_templates(id) on delete set null,
  is_rest bool not null default false,
  notes text null,
  created_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.program_templates') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'program_templates_weeks_count_check'
        and conrelid = 'public.program_templates'::regclass
    ) then
      alter table public.program_templates
        add constraint program_templates_weeks_count_check
        check (weeks_count > 0);
    end if;
  end if;

  if to_regclass('public.program_template_days') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'program_template_days_week_number_check'
        and conrelid = 'public.program_template_days'::regclass
    ) then
      alter table public.program_template_days
        add constraint program_template_days_week_number_check
        check (week_number > 0);
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'program_template_days_day_of_week_check'
        and conrelid = 'public.program_template_days'::regclass
    ) then
      alter table public.program_template_days
        add constraint program_template_days_day_of_week_check
        check (day_of_week between 1 and 7);
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'program_template_days_workout_or_rest_check'
        and conrelid = 'public.program_template_days'::regclass
    ) then
      alter table public.program_template_days
        add constraint program_template_days_workout_or_rest_check
        check (workout_template_id is not null or is_rest = true);
    end if;
  end if;

  if to_regclass('public.client_program_overrides') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'client_program_overrides_workout_or_rest_check'
        and conrelid = 'public.client_program_overrides'::regclass
    ) then
      alter table public.client_program_overrides
        add constraint client_program_overrides_workout_or_rest_check
        check (workout_template_id is not null or is_rest = true);
    end if;
  end if;
end $$;

create index if not exists program_templates_workspace_id_idx
  on public.program_templates (workspace_id);

create unique index if not exists program_template_days_unique_idx
  on public.program_template_days (program_template_id, week_number, day_of_week);

create index if not exists program_template_days_template_idx
  on public.program_template_days (program_template_id);

create index if not exists client_programs_client_id_idx
  on public.client_programs (client_id);

create unique index if not exists client_programs_one_active_idx
  on public.client_programs (client_id)
  where is_active;

create unique index if not exists client_program_overrides_unique_idx
  on public.client_program_overrides (client_program_id, override_date);

create index if not exists client_program_overrides_program_idx
  on public.client_program_overrides (client_program_id);

alter table public.program_templates enable row level security;
alter table public.program_template_days enable row level security;
alter table public.client_programs enable row level security;
alter table public.client_program_overrides enable row level security;

drop policy if exists "pt_manage_program_templates" on public.program_templates;
create policy "pt_manage_program_templates"
  on public.program_templates
  for all
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = program_templates.workspace_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = program_templates.workspace_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

drop policy if exists "pt_manage_program_template_days" on public.program_template_days;
create policy "pt_manage_program_template_days"
  on public.program_template_days
  for all
  using (
    exists (
      select 1
      from public.program_templates pt
      join public.workspace_members wm on wm.workspace_id = pt.workspace_id
      where pt.id = program_template_days.program_template_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  )
  with check (
    exists (
      select 1
      from public.program_templates pt
      join public.workspace_members wm on wm.workspace_id = pt.workspace_id
      where pt.id = program_template_days.program_template_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

drop policy if exists "pt_manage_client_programs" on public.client_programs;
create policy "pt_manage_client_programs"
  on public.client_programs
  for all
  using (
    exists (
      select 1
      from public.clients c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = client_programs.client_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  )
  with check (
    exists (
      select 1
      from public.clients c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = client_programs.client_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

drop policy if exists "client_select_own_programs" on public.client_programs;
create policy "client_select_own_programs"
  on public.client_programs
  for select
  using (
    exists (
      select 1
      from public.clients c
      where c.id = client_programs.client_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "pt_manage_client_program_overrides" on public.client_program_overrides;
create policy "pt_manage_client_program_overrides"
  on public.client_program_overrides
  for all
  using (
    exists (
      select 1
      from public.client_programs cp
      join public.clients c on c.id = cp.client_id
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where cp.id = client_program_overrides.client_program_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  )
  with check (
    exists (
      select 1
      from public.client_programs cp
      join public.clients c on c.id = cp.client_id
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where cp.id = client_program_overrides.client_program_id
        and wm.user_id = auth.uid()
        and wm.role::text like 'pt_%'
    )
  );

drop policy if exists "client_select_own_program_overrides" on public.client_program_overrides;
create policy "client_select_own_program_overrides"
  on public.client_program_overrides
  for select
  using (
    exists (
      select 1
      from public.client_programs cp
      join public.clients c on c.id = cp.client_id
      where cp.id = client_program_overrides.client_program_id
        and c.user_id = auth.uid()
    )
  );

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
      set status = 'recovery',
          workout_template_id = null
      where client_id = p_client_id
        and scheduled_date = v_target_date
        and workout_template_id is null;

      get diagnostics v_rowcount = row_count;

      if v_rowcount = 0 then
        insert into public.assigned_workouts (
          client_id,
          workout_template_id,
          scheduled_date,
          status
        ) values (
          p_client_id,
          null,
          v_target_date,
          'recovery'
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
        status
      ) values (
        p_client_id,
        v_workout_template_id,
        v_target_date,
        'planned'
      )
      on conflict (client_id, scheduled_date, workout_template_id)
      do update set status = 'planned';

      get diagnostics v_rowcount = row_count;
      v_upserted := v_upserted + v_rowcount;
    end if;
  end loop;

  return v_upserted;
end;
$$;

grant execute on function public.apply_program_to_client(uuid, uuid, date, int) to authenticated;
