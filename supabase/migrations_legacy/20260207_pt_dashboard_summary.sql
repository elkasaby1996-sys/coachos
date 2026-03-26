-- Dashboard summary RPC

CREATE OR REPLACE FUNCTION public.pt_dashboard_summary(p_workspace_id uuid, p_coach_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
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

REVOKE ALL ON FUNCTION public.pt_dashboard_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pt_dashboard_summary(uuid, uuid) TO authenticated;
