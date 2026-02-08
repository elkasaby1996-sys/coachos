-- Fix legacy trigger function that still referenced dropped workout_template_items.
-- Keeps assigned_workout_exercises synced from canonical workout_template_exercises.

CREATE OR REPLACE FUNCTION public.sync_assigned_workout_exercises_from_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Keep target rows clean before re-materializing.
  DELETE FROM public.assigned_workout_exercises
  WHERE assigned_workout_id = NEW.id;

  -- If this is a rest day/no template, there is nothing to materialize.
  IF NEW.workout_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.assigned_workout_exercises (
    assigned_workout_id,
    exercise_id,
    sort_order,
    sets,
    reps,
    rpe,
    tempo,
    notes,
    rest_seconds,
    is_completed
  )
  SELECT
    NEW.id,
    wte.exercise_id,
    COALESCE(wte.sort_order, 0) AS sort_order,
    wte.sets,
    wte.reps,
    wte.rpe,
    wte.tempo,
    wte.notes,
    wte.rest_seconds,
    false AS is_completed
  FROM public.workout_template_exercises wte
  WHERE wte.workout_template_id = NEW.workout_template_id
  ORDER BY COALESCE(wte.sort_order, 0) ASC;

  RETURN NEW;
END;
$$;
