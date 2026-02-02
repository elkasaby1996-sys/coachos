-- Make workout_template_items canonical and align assignment RPC

-- 1) Backfill template items from existing template exercises
INSERT INTO public.workout_template_items (
  workout_template_id,
  exercise_id,
  sort_order,
  sets,
  reps,
  rest_sec,
  rpe_target,
  tempo,
  notes
)
SELECT
  e.workout_template_id,
  e.exercise_id,
  e.sort_order,
  e.sets,
  e.reps,
  e.rest_seconds,
  e.rpe,
  e.tempo,
  e.notes
FROM public.workout_template_exercises e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workout_template_items i
  WHERE i.workout_template_id = e.workout_template_id
    AND i.exercise_id = e.exercise_id
    AND COALESCE(i.sort_order, 0) = COALESCE(e.sort_order, 0)
);

-- 2) Canonical RPC for assignment + materialization
CREATE OR REPLACE FUNCTION public.assign_workout_with_template(
  p_client_id uuid,
  p_scheduled_date date,
  p_workout_template_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_assigned_workout_id uuid;
BEGIN
  INSERT INTO public.assigned_workouts (client_id, workout_template_id, scheduled_date, status)
  VALUES (p_client_id, p_workout_template_id, p_scheduled_date, 'planned')
  ON CONFLICT (client_id, workout_template_id, scheduled_date)
  DO UPDATE SET status = 'planned'
  RETURNING id INTO v_assigned_workout_id;

  DELETE FROM public.assigned_workout_exercises
  WHERE assigned_workout_id = v_assigned_workout_id;

  INSERT INTO public.assigned_workout_exercises (
    assigned_workout_id,
    exercise_id,
    sort_order,
    sets,
    reps,
    rest_seconds,
    rpe,
    tempo,
    notes
  )
  SELECT
    v_assigned_workout_id,
    i.exercise_id,
    i.sort_order,
    i.sets,
    i.reps,
    i.rest_sec,
    i.rpe_target,
    i.tempo,
    i.notes
  FROM public.workout_template_items i
  WHERE i.workout_template_id = p_workout_template_id;

  RETURN v_assigned_workout_id;
END;
$$;
