-- Phase 3: PT clients summary RPC (last session + last check-in)

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.pt_clients_summary(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pt_clients_summary(uuid, int, int) TO authenticated;
