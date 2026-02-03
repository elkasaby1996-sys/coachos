DO $$
BEGIN
  IF to_regclass('public.workout_template_exercises') IS NOT NULL THEN
    ALTER TABLE public.workout_template_exercises
      DROP CONSTRAINT IF EXISTS workout_template_exercises_workout_template_id_fkey;
    ALTER TABLE public.workout_template_exercises
      ADD CONSTRAINT workout_template_exercises_workout_template_id_fkey
      FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id) ON DELETE CASCADE;

    ALTER TABLE public.workout_template_exercises
      DROP CONSTRAINT IF EXISTS workout_template_exercises_exercise_id_fkey;
    ALTER TABLE public.workout_template_exercises
      ADD CONSTRAINT workout_template_exercises_exercise_id_fkey
      FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.assigned_workouts') IS NOT NULL THEN
    ALTER TABLE public.assigned_workouts
      DROP CONSTRAINT IF EXISTS assigned_workouts_workout_template_id_fkey;
    ALTER TABLE public.assigned_workouts
      ADD CONSTRAINT assigned_workouts_workout_template_id_fkey
      FOREIGN KEY (workout_template_id) REFERENCES public.workout_templates(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.assigned_workout_exercises') IS NOT NULL THEN
    ALTER TABLE public.assigned_workout_exercises
      DROP CONSTRAINT IF EXISTS assigned_workout_exercises_assigned_workout_id_fkey;
    ALTER TABLE public.assigned_workout_exercises
      ADD CONSTRAINT assigned_workout_exercises_assigned_workout_id_fkey
      FOREIGN KEY (assigned_workout_id) REFERENCES public.assigned_workouts(id) ON DELETE CASCADE;

    ALTER TABLE public.assigned_workout_exercises
      DROP CONSTRAINT IF EXISTS assigned_workout_exercises_exercise_id_fkey;
    ALTER TABLE public.assigned_workout_exercises
      ADD CONSTRAINT assigned_workout_exercises_exercise_id_fkey
      FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.workout_sessions') IS NOT NULL THEN
    ALTER TABLE public.workout_sessions
      DROP CONSTRAINT IF EXISTS workout_sessions_assigned_workout_id_fkey;
    ALTER TABLE public.workout_sessions
      ADD CONSTRAINT workout_sessions_assigned_workout_id_fkey
      FOREIGN KEY (assigned_workout_id) REFERENCES public.assigned_workouts(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.workout_logs') IS NOT NULL THEN
    ALTER TABLE public.workout_logs
      DROP CONSTRAINT IF EXISTS workout_logs_workout_session_id_fkey;
    ALTER TABLE public.workout_logs
      ADD CONSTRAINT workout_logs_workout_session_id_fkey
      FOREIGN KEY (workout_session_id) REFERENCES public.workout_sessions(id) ON DELETE CASCADE;

    ALTER TABLE public.workout_logs
      DROP CONSTRAINT IF EXISTS workout_logs_exercise_id_fkey;
    ALTER TABLE public.workout_logs
      ADD CONSTRAINT workout_logs_exercise_id_fkey
      FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;
  END IF;
END $$;