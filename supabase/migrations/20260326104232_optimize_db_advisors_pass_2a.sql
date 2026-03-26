-- Pass 2A: consolidate overlapping RLS policies on high-traffic workspace,
-- workout, and nutrition tables without changing the intended access model.

-- These tables already have specific authenticated policies. Their legacy
-- client_read_own / trainer_isolation policies are always false and only add
-- extra permissive-policy evaluations.
drop policy if exists client_read_own on public.assigned_nutrition_days;
drop policy if exists trainer_isolation on public.assigned_nutrition_days;

drop policy if exists client_read_own on public.assigned_nutrition_meal_components;
drop policy if exists trainer_isolation on public.assigned_nutrition_meal_components;

drop policy if exists client_read_own on public.assigned_nutrition_meals;
drop policy if exists trainer_isolation on public.assigned_nutrition_meals;

drop policy if exists client_read_own on public.workout_template_exercises;
drop policy if exists trainer_isolation on public.workout_template_exercises;

drop policy if exists client_read_own on public.workout_templates;
drop policy if exists trainer_isolation on public.workout_templates;

drop policy if exists client_read_own on public.workspaces;
drop policy if exists trainer_isolation on public.workspaces;

-- workspace_members still needs direct self-service access for reads and
-- leaving a workspace, but the old generic public policies overlapped with the
-- explicit select policy and granted a broader ALL action than the app uses.
drop policy if exists client_read_own on public.workspace_members;
drop policy if exists trainer_isolation on public.workspace_members;
drop policy if exists workspace_members_select_own on public.workspace_members;

create policy workspace_members_select_own
on public.workspace_members
for select
to authenticated
using (user_id = (select auth.uid()));

create policy workspace_members_delete_own
on public.workspace_members
for delete
to authenticated
using (user_id = (select auth.uid()));
