-- PR-04.8: make workspace delivery libraries explicitly readable by workspace
-- members so assigned co-coaches can choose assets while client-bound writes
-- remain enforced by can_write_client_delivery/can_access_client policies.

drop policy if exists workout_templates_select_access on public.workout_templates;
create policy workout_templates_select_access
on public.workout_templates
for select
to authenticated
using (
  public.can_access_workspace(workout_templates.workspace_id)
  or exists (
    select 1
    from public.clients c
    where c.workspace_id = workout_templates.workspace_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists workout_template_exercises_select_access on public.workout_template_exercises;
create policy workout_template_exercises_select_access
on public.workout_template_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = workout_template_exercises.workout_template_id
      and public.can_access_workspace(wt.workspace_id)
  )
);

drop policy if exists program_templates_select_access on public.program_templates;
create policy program_templates_select_access
on public.program_templates
for select
to authenticated
using (public.can_access_workspace(workspace_id));

drop policy if exists program_template_days_select_access on public.program_template_days;
create policy program_template_days_select_access
on public.program_template_days
for select
to authenticated
using (
  exists (
    select 1
    from public.program_templates pt
    where pt.id = program_template_days.program_template_id
      and public.can_access_workspace(pt.workspace_id)
  )
);

drop policy if exists nutrition_templates_select_access on public.nutrition_templates;
create policy nutrition_templates_select_access
on public.nutrition_templates
for select
to authenticated
using (
  public.is_client_owner(owner_client_id)
  or public.can_access_workspace(workspace_id)
);

drop policy if exists nutrition_template_days_select_access on public.nutrition_template_days;
create policy nutrition_template_days_select_access
on public.nutrition_template_days
for select
to authenticated
using (
  exists (
    select 1
    from public.nutrition_templates nt
    where nt.id = nutrition_template_days.nutrition_template_id
      and (
        public.is_client_owner(nt.owner_client_id)
        or public.can_access_workspace(nt.workspace_id)
      )
  )
);

drop policy if exists nutrition_template_meals_select_access on public.nutrition_template_meals;
create policy nutrition_template_meals_select_access
on public.nutrition_template_meals
for select
to authenticated
using (
  exists (
    select 1
    from public.nutrition_template_days td
    join public.nutrition_templates nt on nt.id = td.nutrition_template_id
    where td.id = nutrition_template_meals.nutrition_template_day_id
      and (
        public.is_client_owner(nt.owner_client_id)
        or public.can_access_workspace(nt.workspace_id)
      )
  )
);

drop policy if exists nutrition_template_meal_components_select_access on public.nutrition_template_meal_components;
create policy nutrition_template_meal_components_select_access
on public.nutrition_template_meal_components
for select
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
        or public.can_access_workspace(nt.workspace_id)
      )
  )
);

drop policy if exists nutrition_template_meal_items_select_access on public.nutrition_template_meal_items;
create policy nutrition_template_meal_items_select_access
on public.nutrition_template_meal_items
for select
to authenticated
using (public.can_access_workspace(workspace_id));

drop policy if exists checkin_templates_select_access on public.checkin_templates;
create policy checkin_templates_select_access
on public.checkin_templates
for select
to authenticated
using (public.can_access_workspace(workspace_id));

drop policy if exists checkin_questions_select_access on public.checkin_questions;
create policy checkin_questions_select_access
on public.checkin_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.checkin_templates ct
    where ct.id = checkin_questions.template_id
      and public.can_access_workspace(ct.workspace_id)
  )
);
