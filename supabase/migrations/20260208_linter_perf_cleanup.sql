-- Linter performance cleanup: initplan + duplicate indexes

-- 1) clients/workspaces policies: ensure auth.uid() is wrapped as (select auth.uid())
--    and reduce duplicate permissive policies on clients select/update.

-- clients SELECT: single policy
DROP POLICY IF EXISTS "clients_select_own_profile" ON public.clients;
DROP POLICY IF EXISTS "clients_select_access" ON public.clients;
CREATE POLICY "clients_select_access"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = (select auth.uid())
    )
    OR public.is_workspace_member(clients.workspace_id)
  );

-- clients UPDATE: single policy (self update OR PT update in workspace)
DROP POLICY IF EXISTS "clients_update_own" ON public.clients;
DROP POLICY IF EXISTS "pt_update_client_checkin_template" ON public.clients;
CREATE POLICY "clients_update_access"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- workspaces UPDATE defaults by PT
DROP POLICY IF EXISTS "pt_update_workspace_defaults" ON public.workspaces;
CREATE POLICY "pt_update_workspace_defaults"
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- 2) Remove duplicate indexes (keep canonical *_idx names from schema_cleanup)
DROP INDEX IF EXISTS public.idx_assigned_workouts_client_date;
DROP INDEX IF EXISTS public.checkin_answers_checkin_id_idx;
DROP INDEX IF EXISTS public.checkin_questions_template_id_idx;
DROP INDEX IF EXISTS public.idx_checkins_client_week;
DROP INDEX IF EXISTS public.workout_sessions_client_id_idx;
DROP INDEX IF EXISTS public.workout_set_logs_session_id_idx;
