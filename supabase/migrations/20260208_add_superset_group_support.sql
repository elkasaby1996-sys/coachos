-- Superset support for template builder and assignment materialization.

ALTER TABLE IF EXISTS public.workout_template_exercises
  ADD COLUMN IF NOT EXISTS superset_group text;

ALTER TABLE IF EXISTS public.assigned_workout_exercises
  ADD COLUMN IF NOT EXISTS superset_group text;

-- Backfill consistency: supersets should not carry rest between paired exercises.
UPDATE public.workout_template_exercises
SET rest_seconds = 0
WHERE superset_group IS NOT NULL
  AND COALESCE(rest_seconds, 0) <> 0;

UPDATE public.assigned_workout_exercises
SET rest_seconds = 0
WHERE superset_group IS NOT NULL
  AND COALESCE(rest_seconds, 0) <> 0;

CREATE OR REPLACE FUNCTION public.materialize_assigned_workout_exercises(p_assigned_workout_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workout_template_id uuid;
BEGIN
  IF p_assigned_workout_id IS NULL THEN
    RETURN;
  END IF;

  SELECT aw.workout_template_id
  INTO v_workout_template_id
  FROM public.assigned_workouts aw
  WHERE aw.id = p_assigned_workout_id;

  DELETE FROM public.assigned_workout_exercises awe
  WHERE awe.assigned_workout_id = p_assigned_workout_id;

  IF v_workout_template_id IS NULL THEN
    RETURN;
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
    superset_group,
    is_completed
  )
  SELECT
    p_assigned_workout_id,
    wte.exercise_id,
    COALESCE(wte.sort_order, 0) AS sort_order,
    wte.sets,
    wte.reps,
    wte.rpe,
    wte.tempo,
    wte.notes,
    CASE WHEN wte.superset_group IS NULL THEN wte.rest_seconds ELSE 0 END,
    wte.superset_group,
    false AS is_completed
  FROM public.workout_template_exercises wte
  WHERE wte.workout_template_id = v_workout_template_id
  ORDER BY COALESCE(wte.sort_order, 0) ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_assigned_workout_exercises_from_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.assigned_workout_exercises
  WHERE assigned_workout_id = NEW.id;

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
    superset_group,
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
    CASE WHEN wte.superset_group IS NULL THEN wte.rest_seconds ELSE 0 END,
    wte.superset_group,
    false AS is_completed
  FROM public.workout_template_exercises wte
  WHERE wte.workout_template_id = NEW.workout_template_id
  ORDER BY COALESCE(wte.sort_order, 0) ASC;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_workout_with_template(
  p_client_id uuid,
  p_scheduled_date date,
  p_workout_template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assigned_workout_id uuid;
BEGIN
  INSERT INTO public.assigned_workouts (client_id, workout_template_id, scheduled_date, status)
  VALUES (p_client_id, p_workout_template_id, p_scheduled_date, 'planned')
  ON CONFLICT (client_id, scheduled_date, workout_template_id)
  DO UPDATE SET status = EXCLUDED.status
  RETURNING id INTO v_assigned_workout_id;

  PERFORM public.materialize_assigned_workout_exercises(v_assigned_workout_id);

  RETURN v_assigned_workout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_workout_with_template(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_assigned_workout_exercises(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_assigned_workout_exercises_from_template() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_workout_with_template(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_assigned_workout_exercises(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_assigned_workout_exercises_from_template() TO authenticated;
