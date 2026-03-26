-- Pass 2B: consolidate the next batch of overlapping legacy RLS policies on
-- messaging, program, nutrition-template, and workout execution tables.
--
-- Each table below already has a specific policy that models the real access
-- pattern used by the app. The old client_read_own / trainer_isolation rules
-- either evaluate to false or duplicate the newer conversation/workspace-aware
-- policy paths, so they only add extra permissive-policy checks.

drop policy if exists client_read_own on public.client_programs;
drop policy if exists trainer_isolation on public.client_programs;

drop policy if exists client_read_own on public.coach_todos;
drop policy if exists trainer_isolation on public.coach_todos;

drop policy if exists client_read_own on public.conversations;
drop policy if exists trainer_isolation on public.conversations;

drop policy if exists client_read_own on public.exercises;
drop policy if exists trainer_isolation on public.exercises;

drop policy if exists client_read_own on public.invites;
drop policy if exists trainer_isolation on public.invites;

drop policy if exists client_read_own on public.messages;
drop policy if exists trainer_isolation on public.messages;

drop policy if exists client_read_own on public.message_typing;
drop policy if exists trainer_isolation on public.message_typing;

drop policy if exists client_read_own on public.nutrition_day_logs;
drop policy if exists trainer_isolation on public.nutrition_day_logs;

drop policy if exists client_read_own on public.nutrition_templates;
drop policy if exists trainer_isolation on public.nutrition_templates;

drop policy if exists client_read_own on public.nutrition_template_days;
drop policy if exists trainer_isolation on public.nutrition_template_days;

drop policy if exists client_read_own on public.nutrition_template_meals;
drop policy if exists trainer_isolation on public.nutrition_template_meals;

drop policy if exists client_read_own on public.nutrition_template_meal_items;
drop policy if exists trainer_isolation on public.nutrition_template_meal_items;

drop policy if exists client_read_own on public.nutrition_template_meal_components;
drop policy if exists trainer_isolation on public.nutrition_template_meal_components;

drop policy if exists client_read_own on public.program_templates;
drop policy if exists trainer_isolation on public.program_templates;

drop policy if exists client_read_own on public.program_template_days;
drop policy if exists trainer_isolation on public.program_template_days;

drop policy if exists client_read_own on public.workout_sessions;
drop policy if exists trainer_isolation on public.workout_sessions;

drop policy if exists client_read_own on public.workout_set_logs;
drop policy if exists trainer_isolation on public.workout_set_logs;
