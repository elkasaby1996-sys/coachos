-- Drop redundant non-unique indexes when an equivalent unique index exists.
-- This reduces write overhead and index bloat without changing query capability.

drop index if exists public.assigned_nutrition_days_plan_date_idx;
drop index if exists public.checkins_client_week_idx;
drop index if exists public.conversations_client_id_idx;
drop index if exists public.idx_habit_logs_client_date;
drop index if exists public.nutrition_template_days_template_week_day_idx;