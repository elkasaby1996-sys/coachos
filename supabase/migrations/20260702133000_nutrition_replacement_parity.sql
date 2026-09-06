-- Align coach-assigned nutrition replacement with workout/program assignment
-- behavior. Assigned nutrition remains snapshot-based; old plans are preserved
-- and marked non-active instead of being deleted.

with ranked_active_coach_plans as (
  select
    ap.id,
    row_number() over (
      partition by ap.client_id, nt.workspace_id
      order by ap.created_at desc nulls last, ap.start_date desc, ap.id desc
    ) as rn
  from public.assigned_nutrition_plans ap
  join public.nutrition_templates nt
    on nt.id = ap.nutrition_template_id
  where ap.status = 'active'
    and nt.workspace_id is not null
    and nt.owner_client_id is null
)
update public.assigned_nutrition_plans ap
set
  status = 'completed',
  updated_at = now()
from ranked_active_coach_plans ranked
where ap.id = ranked.id
  and ranked.rn > 1;

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

  if v_template_owner_client_id is null
     and v_template_workspace_id is not null then
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
          and nt.workspace_id = v_workspace_id
          and nt.owner_client_id is null
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
    returning id
  )
  select v_plan_id, count(distinct inserted_days.id)::int, count(distinct inserted_meals.id)::int
  into assigned_plan_id, days_inserted, meals_inserted
  from inserted_days
  left join inserted_meals on true
  left join inserted_components on true;

  return next;
end;
$$;

grant execute on function public.assign_nutrition_template_to_client(uuid, uuid, date) to authenticated;
