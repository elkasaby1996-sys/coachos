-- Cleanup unused tables/columns (confirmed unused)

-- Drop dependent tables first
DROP TABLE IF EXISTS public.crossfit_block_movements;
DROP TABLE IF EXISTS public.crossfit_blocks;
DROP TABLE IF EXISTS public.crossfit_results;

DROP TABLE IF EXISTS public.nutrition_template_day_meals;
DROP TABLE IF EXISTS public.nutrition_template_days;
DROP TABLE IF EXISTS public.nutrition_templates;
DROP TABLE IF EXISTS public.meals;
DROP TABLE IF EXISTS public.client_nutrition_days;

DROP TABLE IF EXISTS public.workout_log_items;
DROP TABLE IF EXISTS public.workout_template_items;

DROP TABLE IF EXISTS public.progress_photos;
DROP TABLE IF EXISTS public.progress_entries;

DROP TABLE IF EXISTS public.client_day_plans;
DROP TABLE IF EXISTS public.client_notes;

-- Drop legacy columns
ALTER TABLE public.baseline_marker_values
  DROP COLUMN IF EXISTS value;

ALTER TABLE public.baseline_photos
  DROP COLUMN IF EXISTS photo_url;
