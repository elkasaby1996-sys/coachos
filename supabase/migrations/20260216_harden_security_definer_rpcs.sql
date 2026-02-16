-- Harden SECURITY DEFINER RPC authorization checks.
-- Prevent cross-workspace data access when callers tamper with workspace/client IDs.

CREATE OR REPLACE FUNCTION public.pt_dashboard_summary(p_workspace_id uuid, p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_user_id uuid;
  v_today date := current_date;
  v_start_week date := v_today - 6;
  v_end_week date := v_today + 6;
  v_last_saturday date := v_today - ((EXTRACT(DOW FROM v_today)::int - 6 + 7) % 7);
  v_client_ids uuid[];
  v_clients jsonb;
  v_checkins jsonb;
  v_assigned jsonb;
  v_messages jsonb;
  v_unread int;
  v_todos jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_coach_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = v_user_id
      AND wm.role::text LIKE 'pt_%'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT array_agg(id) INTO v_client_ids
  FROM public.clients
  WHERE workspace_id = p_workspace_id;

  SELECT jsonb_agg(c) INTO v_clients
  FROM (
    SELECT id, workspace_id, user_id, status, display_name, created_at, tags, timezone
    FROM public.clients
    WHERE workspace_id = p_workspace_id
    ORDER BY created_at DESC
  ) c;

  SELECT jsonb_agg(a) INTO v_assigned
  FROM (
    SELECT id, client_id, status, scheduled_date
    FROM public.assigned_workouts
    WHERE client_id = ANY(v_client_ids)
      AND scheduled_date BETWEEN v_start_week AND v_today
  ) a;

  SELECT jsonb_agg(ci) INTO v_checkins
  FROM (
    SELECT id, client_id, week_ending_saturday, submitted_at, created_at
    FROM public.checkins
    WHERE client_id = ANY(v_client_ids)
      AND week_ending_saturday BETWEEN v_start_week AND v_end_week
  ) ci;

  SELECT jsonb_agg(m) INTO v_messages
  FROM (
    SELECT
      conv.id,
      conv.last_message_at AS created_at,
      conv.last_message_sender_name AS sender_name,
      conv.last_message_preview AS preview
    FROM public.conversations conv
    WHERE conv.workspace_id = p_workspace_id
    ORDER BY conv.last_message_at DESC NULLS LAST
    LIMIT 5
  ) m;

  SELECT count(*) INTO v_unread
  FROM public.messages m
  JOIN public.conversations conv ON conv.id = m.conversation_id
  JOIN public.clients c ON c.id = conv.client_id
  WHERE m.unread = true
    AND c.workspace_id = p_workspace_id;

  SELECT jsonb_agg(t) INTO v_todos
  FROM (
    SELECT id, title, is_done, created_at
    FROM public.coach_todos
    WHERE workspace_id = p_workspace_id
      AND coach_id = p_coach_id
    ORDER BY created_at ASC
  ) t;

  RETURN jsonb_build_object(
    'clients', COALESCE(v_clients, '[]'::jsonb),
    'assignedWorkouts', COALESCE(v_assigned, '[]'::jsonb),
    'checkins', COALESCE(v_checkins, '[]'::jsonb),
    'messages', COALESCE(v_messages, '[]'::jsonb),
    'unreadCount', COALESCE(v_unread, 0),
    'coachTodos', COALESCE(v_todos, '[]'::jsonb),
    'today', v_today::text,
    'lastSaturday', v_last_saturday::text
  );
END;
$fn$;


CREATE OR REPLACE FUNCTION public.pt_clients_summary(
  p_workspace_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  status text,
  display_name text,
  tags text[],
  created_at timestamptz,
  last_session_at timestamptz,
  last_checkin_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = v_user_id
      AND wm.role::text LIKE 'pt_%'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.status::text,
    c.display_name,
    c.tags,
    c.created_at,
    ls.last_session_at,
    lc.last_checkin_at
  FROM public.clients c
  LEFT JOIN LATERAL (
    SELECT MAX(ws.started_at) AS last_session_at
    FROM public.workout_sessions ws
    LEFT JOIN public.assigned_workouts aw ON aw.id = ws.assigned_workout_id
    WHERE ws.client_id = c.id OR aw.client_id = c.id
  ) ls ON true
  LEFT JOIN LATERAL (
    SELECT MAX(COALESCE(ci.submitted_at, ci.created_at)) AS last_checkin_at
    FROM public.checkins ci
    WHERE ci.client_id = c.id
  ) lc ON true
  WHERE c.workspace_id = p_workspace_id
  ORDER BY c.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.assign_workout_with_template(
  p_client_id uuid,
  p_scheduled_date date,
  p_workout_template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user_id uuid;
  v_assigned_workout_id uuid;
  v_client_workspace_id uuid;
  v_template_workspace_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_client_id IS NULL OR p_scheduled_date IS NULL OR p_workout_template_id IS NULL THEN
    RAISE EXCEPTION 'client_id, scheduled_date and workout_template_id are required';
  END IF;

  SELECT c.workspace_id
  INTO v_client_workspace_id
  FROM public.clients c
  WHERE c.id = p_client_id;

  IF v_client_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  SELECT wt.workspace_id
  INTO v_template_workspace_id
  FROM public.workout_templates wt
  WHERE wt.id = p_workout_template_id;

  IF v_template_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workout template not found';
  END IF;

  IF v_template_workspace_id <> v_client_workspace_id THEN
    RAISE EXCEPTION 'Template not in client workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = v_client_workspace_id
      AND wm.user_id = v_user_id
      AND wm.role::text LIKE 'pt_%'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.assigned_workouts (client_id, workout_template_id, scheduled_date, status)
  VALUES (p_client_id, p_workout_template_id, p_scheduled_date, 'planned')
  ON CONFLICT (client_id, scheduled_date, workout_template_id)
  DO UPDATE SET status = EXCLUDED.status
  RETURNING id INTO v_assigned_workout_id;

  PERFORM public.materialize_assigned_workout_exercises(v_assigned_workout_id);

  RETURN v_assigned_workout_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.pt_dashboard_summary(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pt_clients_summary(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_workout_with_template(uuid, date, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.pt_dashboard_summary(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pt_clients_summary(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_workout_with_template(uuid, date, uuid) TO authenticated;
