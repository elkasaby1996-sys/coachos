-- Unified client nutrition ownership + assignment updates.
-- Enables client-owned personal nutrition templates while preserving the
-- existing assigned runtime + logging model.

alter table public.nutrition_templates
  add column if not exists owner_client_id uuid;

alter table public.nutrition_templates
  alter column workspace_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nutrition_templates_owner_client_id_fkey'
  ) then
    alter table public.nutrition_templates
      add constraint nutrition_templates_owner_client_id_fkey
      foreign key (owner_client_id)
      references public.clients(id)
      on delete cascade;
  end if;
end
$$;

alter table public.nutrition_templates
  drop constraint if exists nutrition_templates_owner_path_check;

alter table public.nutrition_templates
  add constraint nutrition_templates_owner_path_check
  check (
    (workspace_id is not null and owner_client_id is null)
    or
    (workspace_id is null and owner_client_id is not null)
  );

create index if not exists nutrition_templates_owner_client_id_idx
  on public.nutrition_templates(owner_client_id);

drop policy if exists nutrition_templates_client_manage_own on public.nutrition_templates;
create policy nutrition_templates_client_manage_own
on public.nutrition_templates
for all
to authenticated
using (
  public.is_client_owner(owner_client_id)
)
with check (
  public.is_client_owner(owner_client_id)
  and workspace_id is null
  and owner_client_id is not null
);

drop policy if exists nutrition_template_days_client_manage_own on public.nutrition_template_days;
create policy nutrition_template_days_client_manage_own
on public.nutrition_template_days
for all
to authenticated
using (
  exists (
    select 1
    from public.nutrition_templates nt
    where nt.id = nutrition_template_days.nutrition_template_id
      and public.is_client_owner(nt.owner_client_id)
  )
)
with check (
  exists (
    select 1
    from public.nutrition_templates nt
    where nt.id = nutrition_template_days.nutrition_template_id
      and public.is_client_owner(nt.owner_client_id)
  )
);

drop policy if exists nutrition_template_meals_client_manage_own on public.nutrition_template_meals;
create policy nutrition_template_meals_client_manage_own
on public.nutrition_template_meals
for all
to authenticated
using (
  exists (
    select 1
    from public.nutrition_template_days td
    join public.nutrition_templates nt
      on nt.id = td.nutrition_template_id
    where td.id = nutrition_template_meals.nutrition_template_day_id
      and public.is_client_owner(nt.owner_client_id)
  )
)
with check (
  exists (
    select 1
    from public.nutrition_template_days td
    join public.nutrition_templates nt
      on nt.id = td.nutrition_template_id
    where td.id = nutrition_template_meals.nutrition_template_day_id
      and public.is_client_owner(nt.owner_client_id)
  )
);

drop policy if exists nutrition_template_meal_components_client_manage_own on public.nutrition_template_meal_components;
create policy nutrition_template_meal_components_client_manage_own
on public.nutrition_template_meal_components
for all
to authenticated
using (
  exists (
    select 1
    from public.nutrition_template_meals tm
    join public.nutrition_template_days td
      on td.id = tm.nutrition_template_day_id
    join public.nutrition_templates nt
      on nt.id = td.nutrition_template_id
    where tm.id = nutrition_template_meal_components.nutrition_template_meal_id
      and public.is_client_owner(nt.owner_client_id)
  )
)
with check (
  exists (
    select 1
    from public.nutrition_template_meals tm
    join public.nutrition_template_days td
      on td.id = tm.nutrition_template_day_id
    join public.nutrition_templates nt
      on nt.id = td.nutrition_template_id
    where tm.id = nutrition_template_meal_components.nutrition_template_meal_id
      and public.is_client_owner(nt.owner_client_id)
  )
);

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
  v_actor_is_pt boolean := false;
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

  v_actor_is_pt := public.is_pt_workspace_member(v_workspace_id);
  v_actor_is_client_owner := public.is_client_owner(p_client_id);

  select nt.workspace_id, nt.owner_client_id, nt.duration_weeks
  into v_template_workspace_id, v_template_owner_client_id, v_duration_weeks
  from public.nutrition_templates nt
  where nt.id = p_template_id
    and nt.is_active = true;

  if not found then
    raise exception 'Template not found';
  end if;

  if v_actor_is_pt then
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

  -- Auto-close only active personal plans owned by this client.
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

create or replace function public.guard_personal_nutrition_template_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.owner_client_id is null then
    return old;
  end if;

  if exists (
    select 1
    from public.assigned_nutrition_plans ap
    where ap.nutrition_template_id = old.id
  ) then
    raise exception 'Used personal nutrition templates cannot be deleted. Archive this template instead.';
  end if;

  return old;
end;
$$;

drop trigger if exists guard_personal_nutrition_template_delete on public.nutrition_templates;
create trigger guard_personal_nutrition_template_delete
before delete on public.nutrition_templates
for each row
execute function public.guard_personal_nutrition_template_delete();
