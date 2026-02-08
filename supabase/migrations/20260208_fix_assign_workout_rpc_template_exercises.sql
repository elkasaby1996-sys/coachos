-- Fix broken assignment RPC after dropping workout_template_items
-- Uses canonical workout_template_exercises table.

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

  DELETE FROM public.assigned_workout_exercises
  WHERE assigned_workout_id = v_assigned_workout_id;

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
    v_assigned_workout_id,
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
  WHERE wte.workout_template_id = p_workout_template_id
  ORDER BY COALESCE(wte.sort_order, 0) ASC;

  RETURN v_assigned_workout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_workout_with_template(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_workout_with_template(uuid, date, uuid) TO authenticated;
