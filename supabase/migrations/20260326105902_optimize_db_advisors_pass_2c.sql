-- Pass 2C: consolidate the remaining operational coaching-table overlap from
-- legacy client_read_own / trainer_isolation policies.
--
-- These tables already have explicit authenticated policies that cover the
-- real app access paths for PTs and clients. Removing the old generic policies
-- reduces permissive-policy fanout without changing intended behavior.

drop policy if exists client_read_own on public.assigned_workouts;
drop policy if exists trainer_isolation on public.assigned_workouts;

drop policy if exists client_read_own on public.assigned_workout_exercises;
drop policy if exists trainer_isolation on public.assigned_workout_exercises;

drop policy if exists client_read_own on public.assigned_nutrition_plans;
drop policy if exists trainer_isolation on public.assigned_nutrition_plans;

drop policy if exists client_read_own on public.client_program_assignments;
drop policy if exists trainer_isolation on public.client_program_assignments;

drop policy if exists client_read_own on public.client_program_overrides;
drop policy if exists trainer_isolation on public.client_program_overrides;

drop policy if exists client_read_own on public.client_macro_targets;
drop policy if exists trainer_isolation on public.client_macro_targets;

drop policy if exists client_read_own on public.client_targets;
drop policy if exists trainer_isolation on public.client_targets;

drop policy if exists client_read_own on public.clients;
drop policy if exists trainer_isolation on public.clients;

drop policy if exists client_read_own on public.checkins;
drop policy if exists trainer_isolation on public.checkins;

drop policy if exists client_read_own on public.checkin_answers;
drop policy if exists trainer_isolation on public.checkin_answers;

drop policy if exists client_read_own on public.checkin_questions;
drop policy if exists trainer_isolation on public.checkin_questions;

drop policy if exists client_read_own on public.checkin_photos;
drop policy if exists trainer_isolation on public.checkin_photos;

drop policy if exists client_read_own on public.checkin_templates;
drop policy if exists trainer_isolation on public.checkin_templates;

drop policy if exists client_read_own on public.baseline_entries;
drop policy if exists trainer_isolation on public.baseline_entries;

drop policy if exists client_read_own on public.baseline_marker_templates;
drop policy if exists trainer_isolation on public.baseline_marker_templates;

drop policy if exists client_read_own on public.baseline_marker_values;
drop policy if exists trainer_isolation on public.baseline_marker_values;

drop policy if exists client_read_own on public.baseline_metrics;
drop policy if exists trainer_isolation on public.baseline_metrics;

drop policy if exists client_read_own on public.baseline_photos;
drop policy if exists trainer_isolation on public.baseline_photos;

drop policy if exists client_read_own on public.coach_calendar_events;
drop policy if exists trainer_isolation on public.coach_calendar_events;

drop policy if exists client_read_own on public.coach_activity_log;
drop policy if exists trainer_isolation on public.coach_activity_log;

drop policy if exists client_read_own on public.dismissed_reminders;
drop policy if exists trainer_isolation on public.dismissed_reminders;

drop policy if exists client_read_own on public.habit_logs;
drop policy if exists trainer_isolation on public.habit_logs;

drop policy if exists client_read_own on public.nutrition_meal_logs;
drop policy if exists trainer_isolation on public.nutrition_meal_logs;

drop policy if exists client_read_own on public.pt_profiles;
drop policy if exists trainer_isolation on public.pt_profiles;

drop policy if exists client_read_own on public.workout_logs;
drop policy if exists trainer_isolation on public.workout_logs;
