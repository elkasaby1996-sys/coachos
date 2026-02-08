-- Security hardening for legacy archive tables exposed in public schema.

DO $$
BEGIN
  IF to_regclass('public._archive_workout_template_items') IS NOT NULL THEN
    ALTER TABLE public._archive_workout_template_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public._archive_workout_template_items FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public._archive_workout_template_items FROM PUBLIC;
    REVOKE ALL ON TABLE public._archive_workout_template_items FROM anon;
    REVOKE ALL ON TABLE public._archive_workout_template_items FROM authenticated;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public._archive_workout_log_items') IS NOT NULL THEN
    ALTER TABLE public._archive_workout_log_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public._archive_workout_log_items FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public._archive_workout_log_items FROM PUBLIC;
    REVOKE ALL ON TABLE public._archive_workout_log_items FROM anon;
    REVOKE ALL ON TABLE public._archive_workout_log_items FROM authenticated;
  END IF;
END $$;
