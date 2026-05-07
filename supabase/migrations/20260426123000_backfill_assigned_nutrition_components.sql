-- Ensure older assigned nutrition plans expose PT-authored meal components
-- and notes in the client portal.

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
from public.assigned_nutrition_meals am
join public.nutrition_template_meal_components tc
  on tc.nutrition_template_meal_id = am.template_meal_id
where not exists (
  select 1
  from public.assigned_nutrition_meal_components existing
  where existing.assigned_nutrition_meal_id = am.id
    and existing.template_component_id = tc.id
);

update public.assigned_nutrition_meals am
set
  recipe_text = coalesce(am.recipe_text, tm.recipe_text),
  notes = coalesce(am.notes, tm.notes),
  updated_at = now()
from public.nutrition_template_meals tm
where tm.id = am.template_meal_id
  and (
    (am.recipe_text is null and tm.recipe_text is not null)
    or (am.notes is null and tm.notes is not null)
  );

update public.assigned_nutrition_days ad
set
  notes = td.notes,
  updated_at = now()
from public.assigned_nutrition_plans ap
join public.nutrition_template_days td
  on td.nutrition_template_id = ap.nutrition_template_id
where ap.id = ad.assigned_nutrition_plan_id
  and td.week_index = ad.week_index
  and td.day_of_week = ad.day_of_week
  and ad.notes is null
  and td.notes is not null;
