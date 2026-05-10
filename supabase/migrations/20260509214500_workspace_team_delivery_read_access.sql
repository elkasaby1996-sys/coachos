-- Let invited workspace team members read delivery data through the same
-- assignment-aware client access helpers used by client rows and messaging.
-- This replaces older role-name checks that only understood legacy pt_* roles.

drop policy if exists assigned_workouts_select on public.assigned_workouts;
create policy assigned_workouts_select
on public.assigned_workouts
for select
to authenticated
using (
  public.is_client_owner(client_id)
  or public.can_access_client(client_id, 'clients.view')
);

drop policy if exists awe_select_access on public.assigned_workout_exercises;
create policy awe_select_access
on public.assigned_workout_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.assigned_workouts aw
    where aw.id = assigned_workout_exercises.assigned_workout_id
      and (
        public.is_client_owner(aw.client_id)
        or public.can_access_client(aw.client_id, 'clients.view')
      )
  )
);

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

drop policy if exists program_templates_pt_manage on public.program_templates;
drop policy if exists program_templates_select_access on public.program_templates;
create policy program_templates_select_access
on public.program_templates
for select
to authenticated
using (public.can_access_workspace(workspace_id));

create policy program_templates_pt_manage
on public.program_templates
for all
to authenticated
using (
  exists (
    select 1
    from public.workspace_access_context(program_templates.workspace_id) ctx
    where 'delivery.manage' = any(ctx.permissions)
  )
)
with check (
  exists (
    select 1
    from public.workspace_access_context(program_templates.workspace_id) ctx
    where 'delivery.manage' = any(ctx.permissions)
  )
);

drop policy if exists program_template_days_pt_manage on public.program_template_days;
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

create policy program_template_days_pt_manage
on public.program_template_days
for all
to authenticated
using (
  exists (
    select 1
    from public.program_templates pt
    join public.workspace_access_context(pt.workspace_id) ctx on true
    where pt.id = program_template_days.program_template_id
      and 'delivery.manage' = any(ctx.permissions)
  )
)
with check (
  exists (
    select 1
    from public.program_templates pt
    join public.workspace_access_context(pt.workspace_id) ctx on true
    where pt.id = program_template_days.program_template_id
      and 'delivery.manage' = any(ctx.permissions)
  )
);

drop policy if exists client_programs_select_access on public.client_programs;
create policy client_programs_select_access
on public.client_programs
for select
to authenticated
using (
  public.can_access_client(client_id, 'clients.view')
  or exists (
    select 1
    from public.clients c
    where c.id = client_programs.client_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists client_program_assignments_select_access on public.client_program_assignments;
create policy client_program_assignments_select_access
on public.client_program_assignments
for select
to authenticated
using (
  public.can_access_client(client_id, 'clients.view')
  or (
    is_active = true
    and exists (
      select 1
      from public.clients c
      where c.id = client_program_assignments.client_id
        and c.user_id = (select auth.uid())
    )
  )
);

drop policy if exists client_program_overrides_select_access on public.client_program_overrides;
create policy client_program_overrides_select_access
on public.client_program_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.client_programs cp
    join public.clients c on c.id = cp.client_id
    where cp.id = client_program_overrides.client_program_id
      and (
        c.user_id = (select auth.uid())
        or public.can_access_client(cp.client_id, 'clients.view')
      )
  )
);

drop policy if exists assigned_nutrition_plans_select_access on public.assigned_nutrition_plans;
create policy assigned_nutrition_plans_select_access
on public.assigned_nutrition_plans
for select
to authenticated
using (
  public.is_client_owner(client_id)
  or public.can_access_client(client_id, 'clients.view')
);

drop policy if exists assigned_nutrition_days_select_access on public.assigned_nutrition_days;
create policy assigned_nutrition_days_select_access
on public.assigned_nutrition_days
for select
to authenticated
using (
  exists (
    select 1
    from public.assigned_nutrition_plans ap
    where ap.id = assigned_nutrition_days.assigned_nutrition_plan_id
      and (
        public.is_client_owner(ap.client_id)
        or public.can_access_client(ap.client_id, 'clients.view')
      )
  )
);

drop policy if exists assigned_nutrition_meals_select_access on public.assigned_nutrition_meals;
create policy assigned_nutrition_meals_select_access
on public.assigned_nutrition_meals
for select
to authenticated
using (
  exists (
    select 1
    from public.assigned_nutrition_days ad
    join public.assigned_nutrition_plans ap
      on ap.id = ad.assigned_nutrition_plan_id
    where ad.id = assigned_nutrition_meals.assigned_nutrition_day_id
      and (
        public.is_client_owner(ap.client_id)
        or public.can_access_client(ap.client_id, 'clients.view')
      )
  )
);

drop policy if exists assigned_nutrition_meal_components_select_access on public.assigned_nutrition_meal_components;
create policy assigned_nutrition_meal_components_select_access
on public.assigned_nutrition_meal_components
for select
to authenticated
using (
  exists (
    select 1
    from public.assigned_nutrition_meals am
    join public.assigned_nutrition_days ad
      on ad.id = am.assigned_nutrition_day_id
    join public.assigned_nutrition_plans ap
      on ap.id = ad.assigned_nutrition_plan_id
    where am.id = assigned_nutrition_meal_components.assigned_nutrition_meal_id
      and (
        public.is_client_owner(ap.client_id)
        or public.can_access_client(ap.client_id, 'clients.view')
      )
  )
);
