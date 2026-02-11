create extension if not exists "pgcrypto";

-- updated_at helper (portable across environments)
do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    create function public.set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end $$;

-- auth helpers that tolerate minor schema variance
create or replace function public.is_pt_workspace_member(p_workspace_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_pt boolean := false;
begin
  if p_workspace_id is null or to_regclass('public.workspace_members') is null then
    return false;
  end if;

  execute $sql$
    select exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = $1
        and wm.user_id = (select auth.uid())
        and wm.role::text like 'pt_%'
    )
  $sql$
  into v_is_pt
  using p_workspace_id;

  return coalesce(v_is_pt, false);
end;
$$;

create or replace function public.is_client_owner(p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_col text;
  v_is_owner boolean := false;
begin
  if p_client_id is null or to_regclass('public.clients') is null then
    return false;
  end if;

  select c.column_name
  into v_owner_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'clients'
    and c.column_name in ('user_id', 'auth_user_id', 'owner_user_id')
  order by case c.column_name
    when 'user_id' then 1
    when 'auth_user_id' then 2
    when 'owner_user_id' then 3
    else 99
  end
  limit 1;

  if v_owner_col is null then
    return false;
  end if;

  execute format(
    'select exists (
       select 1
       from public.clients c
       where c.id = $1
         and c.%I = (select auth.uid())
     )',
    v_owner_col
  )
  into v_is_owner
  using p_client_id;

  return coalesce(v_is_owner, false);
end;
$$;

-- =========================
-- tables
-- =========================
create table if not exists public.nutrition_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  description text,
  duration_weeks int not null check (duration_weeks between 1 and 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_template_days (
  id uuid primary key default gen_random_uuid(),
  nutrition_template_id uuid not null references public.nutrition_templates(id) on delete cascade,
  week_index int not null check (week_index between 1 and 4),
  day_of_week int not null check (day_of_week between 1 and 7),
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nutrition_template_id, week_index, day_of_week)
);

create table if not exists public.nutrition_template_meals (
  id uuid primary key default gen_random_uuid(),
  nutrition_template_day_id uuid not null references public.nutrition_template_days(id) on delete cascade,
  meal_order int not null default 0,
  meal_name text not null,
  recipe_text text,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_template_meal_components (
  id uuid primary key default gen_random_uuid(),
  nutrition_template_meal_id uuid not null references public.nutrition_template_meals(id) on delete cascade,
  sort_order int not null default 0,
  component_name text not null,
  quantity numeric,
  unit text,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  recipe_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assigned_nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nutrition_template_id uuid not null references public.nutrition_templates(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assigned_nutrition_days (
  id uuid primary key default gen_random_uuid(),
  assigned_nutrition_plan_id uuid not null references public.assigned_nutrition_plans(id) on delete cascade,
  date date not null,
  week_index int not null check (week_index between 1 and 4),
  day_of_week int not null check (day_of_week between 1 and 7),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assigned_nutrition_plan_id, date)
);

create table if not exists public.assigned_nutrition_meals (
  id uuid primary key default gen_random_uuid(),
  assigned_nutrition_day_id uuid not null references public.assigned_nutrition_days(id) on delete cascade,
  template_meal_id uuid,
  meal_order int not null default 0,
  meal_name text not null,
  recipe_text text,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assigned_nutrition_meals
  add column if not exists template_meal_id uuid;

create table if not exists public.assigned_nutrition_meal_components (
  id uuid primary key default gen_random_uuid(),
  assigned_nutrition_meal_id uuid not null references public.assigned_nutrition_meals(id) on delete cascade,
  template_component_id uuid,
  sort_order int not null default 0,
  component_name text not null,
  quantity numeric,
  unit text,
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  recipe_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_meal_logs (
  id uuid primary key default gen_random_uuid(),
  assigned_nutrition_meal_id uuid not null references public.assigned_nutrition_meals(id) on delete cascade,
  consumed_at timestamptz not null default now(),
  is_completed boolean not null default true,
  actual_calories int,
  actual_protein_g numeric,
  actual_carbs_g numeric,
  actual_fat_g numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- optional workspace fk where table exists
DO $$
BEGIN
  IF to_regclass('public.workspaces') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'nutrition_templates_workspace_id_fkey'
        AND conrelid = 'public.nutrition_templates'::regclass
    ) THEN
      ALTER TABLE public.nutrition_templates
        ADD CONSTRAINT nutrition_templates_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- =========================
-- indexes
-- =========================
create index if not exists nutrition_templates_workspace_id_idx
  on public.nutrition_templates (workspace_id);

create index if not exists nutrition_template_days_template_week_day_idx
  on public.nutrition_template_days (nutrition_template_id, week_index, day_of_week);

create index if not exists nutrition_template_meals_day_order_idx
  on public.nutrition_template_meals (nutrition_template_day_id, meal_order);

create index if not exists nutrition_template_meal_components_meal_order_idx
  on public.nutrition_template_meal_components (nutrition_template_meal_id, sort_order);

create index if not exists assigned_nutrition_plans_client_id_idx
  on public.assigned_nutrition_plans (client_id);

create index if not exists assigned_nutrition_plans_template_id_idx
  on public.assigned_nutrition_plans (nutrition_template_id);

create index if not exists assigned_nutrition_plans_start_date_idx
  on public.assigned_nutrition_plans (start_date);

create index if not exists assigned_nutrition_plans_client_date_idx
  on public.assigned_nutrition_plans (client_id, start_date, end_date);

create index if not exists assigned_nutrition_days_date_idx
  on public.assigned_nutrition_days (date);

create index if not exists assigned_nutrition_days_plan_date_idx
  on public.assigned_nutrition_days (assigned_nutrition_plan_id, date);

create index if not exists assigned_nutrition_meals_day_order_idx
  on public.assigned_nutrition_meals (assigned_nutrition_day_id, meal_order);

create index if not exists assigned_nutrition_meal_components_meal_order_idx
  on public.assigned_nutrition_meal_components (assigned_nutrition_meal_id, sort_order);

create index if not exists nutrition_meal_logs_assigned_meal_idx
  on public.nutrition_meal_logs (assigned_nutrition_meal_id, consumed_at desc);

-- =========================
-- updated_at triggers
-- =========================
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_nutrition_templates_updated_at') then
    create trigger set_nutrition_templates_updated_at
    before update on public.nutrition_templates
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_nutrition_template_days_updated_at') then
    create trigger set_nutrition_template_days_updated_at
    before update on public.nutrition_template_days
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_nutrition_template_meals_updated_at') then
    create trigger set_nutrition_template_meals_updated_at
    before update on public.nutrition_template_meals
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_nutrition_template_meal_components_updated_at') then
    create trigger set_nutrition_template_meal_components_updated_at
    before update on public.nutrition_template_meal_components
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_assigned_nutrition_plans_updated_at') then
    create trigger set_assigned_nutrition_plans_updated_at
    before update on public.assigned_nutrition_plans
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_assigned_nutrition_days_updated_at') then
    create trigger set_assigned_nutrition_days_updated_at
    before update on public.assigned_nutrition_days
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_assigned_nutrition_meals_updated_at') then
    create trigger set_assigned_nutrition_meals_updated_at
    before update on public.assigned_nutrition_meals
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_assigned_nutrition_meal_components_updated_at') then
    create trigger set_assigned_nutrition_meal_components_updated_at
    before update on public.assigned_nutrition_meal_components
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_nutrition_meal_logs_updated_at') then
    create trigger set_nutrition_meal_logs_updated_at
    before update on public.nutrition_meal_logs
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- =========================
-- rpc: assign template to client and expand snapshot
-- =========================
create or replace function public.assign_nutrition_template_to_client(
  p_client_id uuid,
  p_template_id uuid,
  p_start_date date
)
returns table (
  assigned_plan_id uuid,
  days_inserted int,
  meals_inserted int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_template_workspace_id uuid;
  v_duration_weeks int;
  v_end_date date;
  v_plan_id uuid;
begin
  if p_client_id is null or p_template_id is null or p_start_date is null then
    raise exception 'client, template and start_date are required';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Not authorized';
  end if;

  select nt.workspace_id, nt.duration_weeks
  into v_template_workspace_id, v_duration_weeks
  from public.nutrition_templates nt
  where nt.id = p_template_id;

  if v_template_workspace_id is null then
    raise exception 'Template not found';
  end if;

  if v_template_workspace_id <> v_workspace_id then
    raise exception 'Template not in client workspace';
  end if;

  v_end_date := p_start_date + ((v_duration_weeks * 7) - 1);

  insert into public.assigned_nutrition_plans (
    client_id,
    nutrition_template_id,
    start_date,
    end_date,
    status
  ) values (
    p_client_id,
    p_template_id,
    p_start_date,
    v_end_date,
    'active'
  )
  returning id into v_plan_id;

  with inserted_days as (
    insert into public.assigned_nutrition_days (
      assigned_nutrition_plan_id,
      date,
      week_index,
      day_of_week,
      notes
    )
    select
      v_plan_id,
      (p_start_date + ((td.week_index - 1) * 7) + (td.day_of_week - 1))::date as date,
      td.week_index,
      td.day_of_week,
      td.notes
    from public.nutrition_template_days td
    where td.nutrition_template_id = p_template_id
      and td.week_index <= v_duration_weeks
    order by td.week_index, td.day_of_week
    returning id, week_index, day_of_week
  ),
  inserted_meals as (
    insert into public.assigned_nutrition_meals (
      assigned_nutrition_day_id,
      template_meal_id,
      meal_order,
      meal_name,
      recipe_text,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      notes
    )
    select
      d.id,
      tm.id,
      tm.meal_order,
      tm.meal_name,
      tm.recipe_text,
      coalesce(comp.calories_sum, tm.calories),
      coalesce(comp.protein_sum, tm.protein_g),
      coalesce(comp.carbs_sum, tm.carbs_g),
      coalesce(comp.fat_sum, tm.fat_g),
      tm.notes
    from inserted_days d
    join public.nutrition_template_days td
      on td.nutrition_template_id = p_template_id
     and td.week_index = d.week_index
     and td.day_of_week = d.day_of_week
    join public.nutrition_template_meals tm
      on tm.nutrition_template_day_id = td.id
    left join (
      select
        nutrition_template_meal_id,
        sum(calories)::int as calories_sum,
        sum(protein_g) as protein_sum,
        sum(carbs_g) as carbs_sum,
        sum(fat_g) as fat_sum
      from public.nutrition_template_meal_components
      group by nutrition_template_meal_id
    ) comp on comp.nutrition_template_meal_id = tm.id
    order by d.week_index, d.day_of_week, tm.meal_order, tm.id
    returning id, template_meal_id
  ),
  inserted_components as (
    insert into public.assigned_nutrition_meal_components (
      assigned_nutrition_meal_id,
      template_component_id,
      sort_order,
      component_name,
      quantity,
      unit,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      recipe_text,
      notes
    )
    select
      am.id,
      tc.id,
      tc.sort_order,
      tc.component_name,
      tc.quantity,
      tc.unit,
      tc.calories,
      tc.protein_g,
      tc.carbs_g,
      tc.fat_g,
      tc.recipe_text,
      tc.notes
    from inserted_meals am
    join public.nutrition_template_meal_components tc
      on tc.nutrition_template_meal_id = am.template_meal_id
    order by am.id, tc.sort_order, tc.id
    returning 1
  )
  select
    v_plan_id,
    (select count(*)::int from inserted_days),
    (select count(*)::int from inserted_meals)
  into assigned_plan_id, days_inserted, meals_inserted;

  return next;
end;
$$;

revoke all on function public.assign_nutrition_template_to_client(uuid, uuid, date) from public;
grant execute on function public.assign_nutrition_template_to_client(uuid, uuid, date) to authenticated;

-- =========================
-- rls
-- =========================
alter table public.nutrition_templates enable row level security;
alter table public.nutrition_template_days enable row level security;
alter table public.nutrition_template_meals enable row level security;
alter table public.nutrition_template_meal_components enable row level security;
alter table public.assigned_nutrition_plans enable row level security;
alter table public.assigned_nutrition_days enable row level security;
alter table public.assigned_nutrition_meals enable row level security;
alter table public.assigned_nutrition_meal_components enable row level security;
alter table public.nutrition_meal_logs enable row level security;

-- PT: CRUD template structures in own workspace
DROP POLICY IF EXISTS "nutrition_templates_pt_manage" ON public.nutrition_templates;
create policy "nutrition_templates_pt_manage"
  on public.nutrition_templates
  for all
  to authenticated
  using (public.is_pt_workspace_member(nutrition_templates.workspace_id))
  with check (public.is_pt_workspace_member(nutrition_templates.workspace_id));

DROP POLICY IF EXISTS "nutrition_template_days_pt_manage" ON public.nutrition_template_days;
create policy "nutrition_template_days_pt_manage"
  on public.nutrition_template_days
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.nutrition_templates nt
      where nt.id = nutrition_template_days.nutrition_template_id
        and public.is_pt_workspace_member(nt.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.nutrition_templates nt
      where nt.id = nutrition_template_days.nutrition_template_id
        and public.is_pt_workspace_member(nt.workspace_id)
    )
  );

DROP POLICY IF EXISTS "nutrition_template_meals_pt_manage" ON public.nutrition_template_meals;
create policy "nutrition_template_meals_pt_manage"
  on public.nutrition_template_meals
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.nutrition_template_days td
      join public.nutrition_templates nt on nt.id = td.nutrition_template_id
      where td.id = nutrition_template_meals.nutrition_template_day_id
        and public.is_pt_workspace_member(nt.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.nutrition_template_days td
      join public.nutrition_templates nt on nt.id = td.nutrition_template_id
      where td.id = nutrition_template_meals.nutrition_template_day_id
        and public.is_pt_workspace_member(nt.workspace_id)
    )
  );

DROP POLICY IF EXISTS "nutrition_template_meal_components_pt_manage" ON public.nutrition_template_meal_components;
create policy "nutrition_template_meal_components_pt_manage"
  on public.nutrition_template_meal_components
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.nutrition_template_meals tm
      join public.nutrition_template_days td on td.id = tm.nutrition_template_day_id
      join public.nutrition_templates nt on nt.id = td.nutrition_template_id
      where tm.id = nutrition_template_meal_components.nutrition_template_meal_id
        and public.is_pt_workspace_member(nt.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.nutrition_template_meals tm
      join public.nutrition_template_days td on td.id = tm.nutrition_template_day_id
      join public.nutrition_templates nt on nt.id = td.nutrition_template_id
      where tm.id = nutrition_template_meal_components.nutrition_template_meal_id
        and public.is_pt_workspace_member(nt.workspace_id)
    )
  );

-- PT: view assigned plans/days/meals/logs for clients in workspace
DROP POLICY IF EXISTS "assigned_nutrition_plans_pt_view" ON public.assigned_nutrition_plans;
create policy "assigned_nutrition_plans_pt_view"
  on public.assigned_nutrition_plans
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.clients c
      where c.id = assigned_nutrition_plans.client_id
        and public.is_pt_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "assigned_nutrition_days_pt_view" ON public.assigned_nutrition_days;
create policy "assigned_nutrition_days_pt_view"
  on public.assigned_nutrition_days
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_plans ap
      join public.clients c on c.id = ap.client_id
      where ap.id = assigned_nutrition_days.assigned_nutrition_plan_id
        and public.is_pt_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "assigned_nutrition_meals_pt_view" ON public.assigned_nutrition_meals;
create policy "assigned_nutrition_meals_pt_view"
  on public.assigned_nutrition_meals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_days ad
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      join public.clients c on c.id = ap.client_id
      where ad.id = assigned_nutrition_meals.assigned_nutrition_day_id
        and public.is_pt_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "assigned_nutrition_meal_components_pt_view" ON public.assigned_nutrition_meal_components;
create policy "assigned_nutrition_meal_components_pt_view"
  on public.assigned_nutrition_meal_components
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_meals am
      join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      join public.clients c on c.id = ap.client_id
      where am.id = assigned_nutrition_meal_components.assigned_nutrition_meal_id
        and public.is_pt_workspace_member(c.workspace_id)
    )
  );

DROP POLICY IF EXISTS "nutrition_meal_logs_pt_view" ON public.nutrition_meal_logs;
create policy "nutrition_meal_logs_pt_view"
  on public.nutrition_meal_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_meals am
      join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      join public.clients c on c.id = ap.client_id
      where am.id = nutrition_meal_logs.assigned_nutrition_meal_id
        and public.is_pt_workspace_member(c.workspace_id)
    )
  );

-- Client: read assigned plans/days/meals for own client record
DROP POLICY IF EXISTS "assigned_nutrition_plans_client_select_own" ON public.assigned_nutrition_plans;
create policy "assigned_nutrition_plans_client_select_own"
  on public.assigned_nutrition_plans
  for select
  to authenticated
  using (public.is_client_owner(assigned_nutrition_plans.client_id));

DROP POLICY IF EXISTS "assigned_nutrition_days_client_select_own" ON public.assigned_nutrition_days;
create policy "assigned_nutrition_days_client_select_own"
  on public.assigned_nutrition_days
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_plans ap
      where ap.id = assigned_nutrition_days.assigned_nutrition_plan_id
        and public.is_client_owner(ap.client_id)
    )
  );

DROP POLICY IF EXISTS "assigned_nutrition_meals_client_select_own" ON public.assigned_nutrition_meals;
create policy "assigned_nutrition_meals_client_select_own"
  on public.assigned_nutrition_meals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_days ad
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      where ad.id = assigned_nutrition_meals.assigned_nutrition_day_id
        and public.is_client_owner(ap.client_id)
    )
  );

DROP POLICY IF EXISTS "assigned_nutrition_meal_components_client_select_own" ON public.assigned_nutrition_meal_components;
create policy "assigned_nutrition_meal_components_client_select_own"
  on public.assigned_nutrition_meal_components
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_meals am
      join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      where am.id = assigned_nutrition_meal_components.assigned_nutrition_meal_id
        and public.is_client_owner(ap.client_id)
    )
  );

-- Client: insert/update own meal logs
DROP POLICY IF EXISTS "nutrition_meal_logs_client_select_own" ON public.nutrition_meal_logs;
create policy "nutrition_meal_logs_client_select_own"
  on public.nutrition_meal_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_meals am
      join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      where am.id = nutrition_meal_logs.assigned_nutrition_meal_id
        and public.is_client_owner(ap.client_id)
    )
  );

DROP POLICY IF EXISTS "nutrition_meal_logs_client_insert_own" ON public.nutrition_meal_logs;
create policy "nutrition_meal_logs_client_insert_own"
  on public.nutrition_meal_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.assigned_nutrition_meals am
      join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      where am.id = nutrition_meal_logs.assigned_nutrition_meal_id
        and public.is_client_owner(ap.client_id)
    )
  );

DROP POLICY IF EXISTS "nutrition_meal_logs_client_update_own" ON public.nutrition_meal_logs;
create policy "nutrition_meal_logs_client_update_own"
  on public.nutrition_meal_logs
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.assigned_nutrition_meals am
      join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      where am.id = nutrition_meal_logs.assigned_nutrition_meal_id
        and public.is_client_owner(ap.client_id)
    )
  )
  with check (
    exists (
      select 1
      from public.assigned_nutrition_meals am
      join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
      join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
      where am.id = nutrition_meal_logs.assigned_nutrition_meal_id
        and public.is_client_owner(ap.client_id)
    )
  );
