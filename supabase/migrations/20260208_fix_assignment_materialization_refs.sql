-- Defensive fix: remove any remaining dependency on dropped workout_template_items
-- Covers direct RPC assignment and trigger-based materialization paths.

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
    wte.rest_seconds,
    false AS is_completed
  FROM public.workout_template_exercises wte
  WHERE wte.workout_template_id = v_workout_template_id
  ORDER BY COALESCE(wte.sort_order, 0) ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_materialize_assigned_exercises()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.materialize_assigned_workout_exercises(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.workout_template_id IS DISTINCT FROM OLD.workout_template_id THEN
      PERFORM public.materialize_assigned_workout_exercises(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Keep assignment RPC aligned with canonical template-exercise table.
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
REVOKE ALL ON FUNCTION public.auto_materialize_assigned_exercises() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_workout_with_template(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_assigned_workout_exercises(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_materialize_assigned_exercises() TO authenticated;
