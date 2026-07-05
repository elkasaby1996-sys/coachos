create or replace function public.can_manage_workspace_delivery(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.workspace_access_context(p_workspace_id) ctx
    where public.has_workspace_permission(
      ctx.role,
      ctx.member_status,
      'delivery.manage'
    )
  );
$$;

create or replace function public.can_write_client_delivery(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.can_access_client(p_client_id, 'clients.edit');
$$;

grant execute on function public.can_manage_workspace_delivery(uuid) to authenticated;
grant execute on function public.can_write_client_delivery(uuid) to authenticated;

drop policy if exists assigned_workouts_insert_pt on public.assigned_workouts;
create policy assigned_workouts_insert_pt
on public.assigned_workouts
for insert
to authenticated
with check (public.can_write_client_delivery(client_id));

drop policy if exists assigned_workouts_update on public.assigned_workouts;
create policy assigned_workouts_update
on public.assigned_workouts
for update
to authenticated
using (
  public.is_client_owner(client_id)
  or public.can_write_client_delivery(assigned_workouts.client_id)
)
with check (
  public.is_client_owner(client_id)
  or public.can_write_client_delivery(assigned_workouts.client_id)
);

drop policy if exists assigned_workouts_delete_pt on public.assigned_workouts;
create policy assigned_workouts_delete_pt
on public.assigned_workouts
for delete
to authenticated
using (public.can_write_client_delivery(assigned_workouts.client_id));

drop policy if exists awe_insert_pt on public.assigned_workout_exercises;
create policy awe_insert_pt
on public.assigned_workout_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.assigned_workouts aw
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and public.can_write_client_delivery(aw.client_id)
  )
);

drop policy if exists awe_update_access on public.assigned_workout_exercises;
create policy awe_update_access
on public.assigned_workout_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.assigned_workouts aw
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and public.can_write_client_delivery(aw.client_id)
  )
)
with check (
  exists (
    select 1
    from public.assigned_workouts aw
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and public.can_write_client_delivery(aw.client_id)
  )
);

drop policy if exists awe_delete_pt on public.assigned_workout_exercises;
create policy awe_delete_pt
on public.assigned_workout_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.assigned_workouts aw
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and public.can_write_client_delivery(aw.client_id)
  )
);

drop policy if exists workout_templates_insert_pt on public.workout_templates;
create policy workout_templates_insert_pt
on public.workout_templates
for insert
to authenticated
with check (public.can_manage_workspace_delivery(workspace_id));

drop policy if exists workout_templates_update_pt on public.workout_templates;
create policy workout_templates_update_pt
on public.workout_templates
for update
to authenticated
using (public.can_manage_workspace_delivery(workout_templates.workspace_id))
with check (public.can_manage_workspace_delivery(workout_templates.workspace_id));

drop policy if exists workout_templates_delete_pt on public.workout_templates;
create policy workout_templates_delete_pt
on public.workout_templates
for delete
to authenticated
using (public.can_manage_workspace_delivery(workout_templates.workspace_id));

drop policy if exists workout_template_exercises_pt_manage on public.workout_template_exercises;
create policy workout_template_exercises_pt_manage
on public.workout_template_exercises
for all
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.workout_template_id
      and public.can_manage_workspace_delivery(wt.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.workout_template_id
      and public.can_manage_workspace_delivery(wt.workspace_id)
  )
);

drop policy if exists client_programs_insert_pt on public.client_programs;
create policy client_programs_insert_pt
on public.client_programs
for insert
to authenticated
with check (public.can_write_client_delivery(client_id));

drop policy if exists client_programs_update_pt on public.client_programs;
create policy client_programs_update_pt
on public.client_programs
for update
to authenticated
using (public.can_write_client_delivery(client_programs.client_id))
with check (public.can_write_client_delivery(client_programs.client_id));

drop policy if exists client_programs_delete_pt on public.client_programs;
create policy client_programs_delete_pt
on public.client_programs
for delete
to authenticated
using (public.can_write_client_delivery(client_programs.client_id));

drop policy if exists client_program_assignments_insert_pt on public.client_program_assignments;
create policy client_program_assignments_insert_pt
on public.client_program_assignments
for insert
to authenticated
with check (public.can_write_client_delivery(client_id));

drop policy if exists client_program_assignments_update_pt on public.client_program_assignments;
create policy client_program_assignments_update_pt
on public.client_program_assignments
for update
to authenticated
using (public.can_write_client_delivery(client_program_assignments.client_id))
with check (public.can_write_client_delivery(client_program_assignments.client_id));

drop policy if exists client_program_assignments_delete_pt on public.client_program_assignments;
create policy client_program_assignments_delete_pt
on public.client_program_assignments
for delete
to authenticated
using (public.can_write_client_delivery(client_program_assignments.client_id));

drop policy if exists client_program_overrides_insert_pt on public.client_program_overrides;
create policy client_program_overrides_insert_pt
on public.client_program_overrides
for insert
to authenticated
with check (
  exists (
    select 1
    from public.client_programs cp
    where cp.id = client_program_overrides.client_program_id
      and public.can_write_client_delivery(cp.client_id)
  )
);

drop policy if exists client_program_overrides_update_pt on public.client_program_overrides;
create policy client_program_overrides_update_pt
on public.client_program_overrides
for update
to authenticated
using (
  exists (
    select 1
    from public.client_programs cp
    where cp.id = client_program_overrides.client_program_id
      and public.can_write_client_delivery(cp.client_id)
  )
)
with check (
  exists (
    select 1
    from public.client_programs cp
    where cp.id = client_program_overrides.client_program_id
      and public.can_write_client_delivery(cp.client_id)
  )
);

drop policy if exists client_program_overrides_delete_pt on public.client_program_overrides;
create policy client_program_overrides_delete_pt
on public.client_program_overrides
for delete
to authenticated
using (
  exists (
    select 1
    from public.client_programs cp
    where cp.id = client_program_overrides.client_program_id
      and public.can_write_client_delivery(cp.client_id)
  )
);

drop policy if exists assigned_nutrition_plans_insert_pt on public.assigned_nutrition_plans;
create policy assigned_nutrition_plans_insert_pt
on public.assigned_nutrition_plans
for insert
to authenticated
with check (public.can_write_client_delivery(client_id));

drop policy if exists assigned_nutrition_plans_update_pt on public.assigned_nutrition_plans;
create policy assigned_nutrition_plans_update_pt
on public.assigned_nutrition_plans
for update
to authenticated
using (public.can_write_client_delivery(assigned_nutrition_plans.client_id))
with check (public.can_write_client_delivery(assigned_nutrition_plans.client_id));

drop policy if exists assigned_nutrition_plans_delete_pt on public.assigned_nutrition_plans;
create policy assigned_nutrition_plans_delete_pt
on public.assigned_nutrition_plans
for delete
to authenticated
using (public.can_write_client_delivery(assigned_nutrition_plans.client_id));

drop policy if exists assigned_nutrition_days_manage_pt on public.assigned_nutrition_days;
create policy assigned_nutrition_days_manage_pt
on public.assigned_nutrition_days
for all
to authenticated
using (
  exists (
    select 1
    from public.assigned_nutrition_plans ap
    where ap.id = assigned_nutrition_days.assigned_nutrition_plan_id
      and public.can_write_client_delivery(ap.client_id)
  )
)
with check (
  exists (
    select 1
    from public.assigned_nutrition_plans ap
    where ap.id = assigned_nutrition_days.assigned_nutrition_plan_id
      and public.can_write_client_delivery(ap.client_id)
  )
);

drop policy if exists assigned_nutrition_meals_manage_pt on public.assigned_nutrition_meals;
create policy assigned_nutrition_meals_manage_pt
on public.assigned_nutrition_meals
for all
to authenticated
using (
  exists (
    select 1
    from public.assigned_nutrition_days ad
    join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
    where ad.id = assigned_nutrition_meals.assigned_nutrition_day_id
      and public.can_write_client_delivery(ap.client_id)
  )
)
with check (
  exists (
    select 1
    from public.assigned_nutrition_days ad
    join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
    where ad.id = assigned_nutrition_meals.assigned_nutrition_day_id
      and public.can_write_client_delivery(ap.client_id)
  )
);

drop policy if exists assigned_nutrition_meal_components_manage_pt on public.assigned_nutrition_meal_components;
create policy assigned_nutrition_meal_components_manage_pt
on public.assigned_nutrition_meal_components
for all
to authenticated
using (
  exists (
    select 1
    from public.assigned_nutrition_meals am
    join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
    join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
    where am.id = assigned_nutrition_meal_components.assigned_nutrition_meal_id
      and public.can_write_client_delivery(ap.client_id)
  )
)
with check (
  exists (
    select 1
    from public.assigned_nutrition_meals am
    join public.assigned_nutrition_days ad on ad.id = am.assigned_nutrition_day_id
    join public.assigned_nutrition_plans ap on ap.id = ad.assigned_nutrition_plan_id
    where am.id = assigned_nutrition_meal_components.assigned_nutrition_meal_id
      and public.can_write_client_delivery(ap.client_id)
  )
);

drop policy if exists nutrition_templates_manage_access on public.nutrition_templates;
create policy nutrition_templates_manage_access
on public.nutrition_templates
for all
to authenticated
using (
  public.is_client_owner(owner_client_id)
  or public.can_manage_workspace_delivery(workspace_id)
)
with check (
  (
    public.is_client_owner(owner_client_id)
    and workspace_id is null
    and owner_client_id is not null
  )
  or public.can_manage_workspace_delivery(workspace_id)
);

drop policy if exists nutrition_template_days_manage_access on public.nutrition_template_days;
create policy nutrition_template_days_manage_access
on public.nutrition_template_days
for all
to authenticated
using (
  exists (
    select 1
    from public.nutrition_templates nt
    where nt.id = nutrition_template_days.nutrition_template_id
      and (
        public.is_client_owner(nt.owner_client_id)
        or public.can_manage_workspace_delivery(nt.workspace_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.nutrition_templates nt
    where nt.id = nutrition_template_days.nutrition_template_id
      and (
        public.is_client_owner(nt.owner_client_id)
        or public.can_manage_workspace_delivery(nt.workspace_id)
      )
  )
);

drop policy if exists nutrition_template_meals_manage_access on public.nutrition_template_meals;
create policy nutrition_template_meals_manage_access
on public.nutrition_template_meals
for all
to authenticated
using (
  exists (
    select 1
    from public.nutrition_template_days td
    join public.nutrition_templates nt on nt.id = td.nutrition_template_id
    where td.id = nutrition_template_meals.nutrition_template_day_id
      and (
        public.is_client_owner(nt.owner_client_id)
        or public.can_manage_workspace_delivery(nt.workspace_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.nutrition_template_days td
    join public.nutrition_templates nt on nt.id = td.nutrition_template_id
    where td.id = nutrition_template_meals.nutrition_template_day_id
      and (
        public.is_client_owner(nt.owner_client_id)
        or public.can_manage_workspace_delivery(nt.workspace_id)
      )
  )
);

drop policy if exists nutrition_template_meal_components_manage_access on public.nutrition_template_meal_components;
create policy nutrition_template_meal_components_manage_access
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
      and (
        public.is_client_owner(nt.owner_client_id)
        or public.can_manage_workspace_delivery(nt.workspace_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.nutrition_template_meals tm
    join public.nutrition_template_days td on td.id = tm.nutrition_template_day_id
    join public.nutrition_templates nt on nt.id = td.nutrition_template_id
    where tm.id = nutrition_template_meal_components.nutrition_template_meal_id
      and (
        public.is_client_owner(nt.owner_client_id)
        or public.can_manage_workspace_delivery(nt.workspace_id)
      )
  )
);

drop policy if exists nutrition_template_meal_items_pt_manage on public.nutrition_template_meal_items;
create policy nutrition_template_meal_items_pt_manage
on public.nutrition_template_meal_items
for all
to authenticated
using (public.can_manage_workspace_delivery(workspace_id))
with check (public.can_manage_workspace_delivery(workspace_id));

drop policy if exists checkin_templates_pt_manage on public.checkin_templates;
create policy checkin_templates_pt_manage
on public.checkin_templates
for all
to authenticated
using (public.can_manage_workspace_delivery(workspace_id))
with check (public.can_manage_workspace_delivery(workspace_id));

drop policy if exists client_macro_targets_insert_pt on public.client_macro_targets;
create policy client_macro_targets_insert_pt
on public.client_macro_targets
for insert
to authenticated
with check (public.can_write_client_delivery(client_id));

drop policy if exists client_macro_targets_update_pt on public.client_macro_targets;
create policy client_macro_targets_update_pt
on public.client_macro_targets
for update
to authenticated
using (public.can_write_client_delivery(client_id))
with check (public.can_write_client_delivery(client_id));

drop policy if exists client_macro_targets_delete_pt on public.client_macro_targets;
create policy client_macro_targets_delete_pt
on public.client_macro_targets
for delete
to authenticated
using (public.can_write_client_delivery(client_id));

drop policy if exists nutrition_day_logs_insert_pt on public.nutrition_day_logs;
create policy nutrition_day_logs_insert_pt
on public.nutrition_day_logs
for insert
to authenticated
with check (public.can_write_client_delivery(client_id));

drop policy if exists nutrition_day_logs_update_access on public.nutrition_day_logs;
create policy nutrition_day_logs_update_access
on public.nutrition_day_logs
for update
to authenticated
using (
  public.is_client_owner(client_id)
  or public.can_write_client_delivery(client_id)
)
with check (
  public.is_client_owner(client_id)
  or public.can_write_client_delivery(client_id)
);

drop policy if exists nutrition_day_logs_delete_pt on public.nutrition_day_logs;
create policy nutrition_day_logs_delete_pt
on public.nutrition_day_logs
for delete
to authenticated
using (public.can_write_client_delivery(client_id));

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

  if not public.can_write_client_delivery(p_client_id) then
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

    update public.assigned_workouts
    set workout_template_id = case when v_is_rest then null else v_workout_template_id end,
        day_type = case when v_is_rest or v_workout_template_id is null then 'rest' else 'workout' end,
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
        case when v_is_rest then null else v_workout_template_id end,
        v_target_date,
        'planned',
        case when v_is_rest or v_workout_template_id is null then 'rest' else 'workout' end,
        p_program_id,
        v_i,
        v_day_note
      );
      v_upserted := v_upserted + 1;
    else
      v_upserted := v_upserted + v_rowcount;
    end if;
  end loop;

  return v_upserted;
end;
$$;

grant execute on function public.assign_program_to_client(uuid, uuid, date, integer) to authenticated;

create or replace function public.assign_nutrition_template_to_client(
  p_client_id uuid,
  p_template_id uuid,
  p_start_date date
)
returns table(
  assigned_plan_id uuid,
  days_inserted integer,
  meals_inserted integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_workspace_id uuid;
  v_template_workspace_id uuid;
  v_template_owner_client_id uuid;
  v_duration_weeks int;
  v_end_date date;
  v_plan_id uuid;
  v_actor_can_write_client_delivery boolean := false;
  v_actor_is_client_owner boolean := false;
begin
  if p_client_id is null or p_template_id is null or p_start_date is null then
    raise exception 'client, template and start_date are required';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if not found then
    raise exception 'Client not found';
  end if;

  v_actor_can_write_client_delivery := public.can_write_client_delivery(p_client_id);
  v_actor_is_client_owner := public.is_client_owner(p_client_id);

  select nt.workspace_id, nt.owner_client_id, nt.duration_weeks
  into v_template_workspace_id, v_template_owner_client_id, v_duration_weeks
  from public.nutrition_templates nt
  where nt.id = p_template_id
    and nt.is_active = true;

  if not found then
    raise exception 'Template not found';
  end if;

  if v_actor_can_write_client_delivery then
    if v_template_workspace_id is null then
      raise exception 'Template not found';
    end if;
    if v_template_workspace_id <> v_workspace_id then
      raise exception 'Template not in client workspace';
    end if;
  elsif v_actor_is_client_owner then
    if v_template_owner_client_id is distinct from p_client_id then
      raise exception 'Not authorized';
    end if;
  else
    raise exception 'Not authorized';
  end if;

  if v_template_owner_client_id is not null then
    update public.assigned_nutrition_plans ap
    set
      status = 'completed',
      updated_at = now()
    where ap.client_id = p_client_id
      and ap.status = 'active'
      and exists (
        select 1
        from public.nutrition_templates nt
        where nt.id = ap.nutrition_template_id
          and nt.owner_client_id = p_client_id
          and nt.workspace_id is null
      );
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

grant execute on function public.assign_nutrition_template_to_client(uuid, uuid, date) to authenticated;

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

  if public.is_client_owner(p_client_id)
     or public.can_write_client_delivery(p_client_id) then
    perform public.reconcile_client_checkins(
      p_client_id,
      p_range_start,
      p_range_end
    );
    return;
  end if;

  if public.can_access_client(p_client_id, 'clients.view') then
    return;
  end if;

  raise exception 'Not authorized';
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

  if not public.can_manage_workspace_delivery(p_workspace_id) then
    if public.can_access_workspace(p_workspace_id) then
      return;
    end if;
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

create or replace function public.enforce_checkin_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
begin
  if new.week_ending_saturday is not null then
    new.week_ending_saturday := public.normalize_checkin_due_date(new.week_ending_saturday);
  end if;

  if (new.reviewed_at is null) <> (new.reviewed_by_user_id is null) then
    raise exception 'Review metadata must be set together';
  end if;

  v_client_id := coalesce(new.client_id, old.client_id);

  if tg_op = 'INSERT' then
    if (
      new.pt_feedback is not null
      or new.reviewed_at is not null
      or new.reviewed_by_user_id is not null
    ) and not public.can_write_client_delivery(v_client_id) then
      raise exception 'Only workspace members with client edit access can write check-in review metadata';
    end if;

    if new.submitted_at is null and (
      new.reviewed_at is not null
      or new.reviewed_by_user_id is not null
    ) then
      raise exception 'Check-ins cannot be reviewed before submission';
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

    if (
      new.pt_feedback is distinct from old.pt_feedback
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
    ) and not public.can_write_client_delivery(v_client_id) then
      raise exception 'Only workspace members with client edit access can review submitted check-ins';
    end if;

    if old.reviewed_at is not null and new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Reviewed check-ins cannot be unreviewed or re-timestamped';
    end if;

    if old.reviewed_by_user_id is not null
       and new.reviewed_by_user_id is distinct from old.reviewed_by_user_id then
      raise exception 'Reviewed check-ins cannot change reviewer metadata';
    end if;

    return new;
  end if;

  if (
    new.pt_feedback is distinct from old.pt_feedback
    or new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
  ) and not public.can_write_client_delivery(v_client_id) then
    raise exception 'Only workspace members with client edit access can write coach review metadata';
  end if;

  if old.submitted_at is null and new.submitted_at is not null then
    perform public.validate_checkin_submission_requirements(new.id);
  end if;

  if new.submitted_at is null and (
    new.reviewed_at is not null
    or new.reviewed_by_user_id is not null
  ) then
    raise exception 'Check-ins cannot be reviewed before submission';
  end if;

  return new;
end;
$$;

create or replace function public.review_checkin(
  p_checkin_id uuid,
  p_pt_feedback text default null,
  p_mark_reviewed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_submitted_at timestamptz;
  v_feedback text := nullif(trim(p_pt_feedback), '');
begin
  select ci.client_id, ci.submitted_at
  into v_client_id, v_submitted_at
  from public.checkins ci
  where ci.id = p_checkin_id;

  if v_client_id is null then
    raise exception 'Check-in not found';
  end if;

  if not public.can_write_client_delivery(v_client_id) then
    raise exception 'Not authorized';
  end if;

  if v_submitted_at is null then
    raise exception 'Check-in must be submitted before review';
  end if;

  if p_mark_reviewed and v_feedback is null then
    raise exception 'Review notes are required before marking a check-in reviewed';
  end if;

  update public.checkins
  set pt_feedback = v_feedback,
      reviewed_at = case
        when p_mark_reviewed then coalesce(reviewed_at, now())
        else reviewed_at
      end,
      reviewed_by_user_id = case
        when p_mark_reviewed then coalesce(reviewed_by_user_id, auth.uid())
        else reviewed_by_user_id
      end
  where id = p_checkin_id;
end;
$$;

revoke all on function public.review_checkin(uuid, text, boolean) from public;
grant execute on function public.review_checkin(uuid, text, boolean) to authenticated;
