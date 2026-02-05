-- RLS policy cleanup for performance + correctness
-- - Remove duplicate/permissive policies
-- - Use (select auth.uid()) to avoid per-row evaluation
-- - Keep intent: PT can manage in workspace, clients can access own data

-- assigned_workout_exercises
DROP POLICY IF EXISTS "client_can_read_assigned_workout_exercises" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "client_select_own_assigned_workout_exercises" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "clients_select_own_assigned_workout_exercises" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "client_update_own_assigned_workout_exercises" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "pt_select_assigned_workout_exercises" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "pt_insert_assigned_workout_exercises" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "pt_update_assigned_workout_exercises" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "pt_delete_assigned_workout_exercises" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "pt_manage_assigned_workout_exercises" ON public.assigned_workout_exercises;

CREATE POLICY "awe_client_read"
  ON public.assigned_workout_exercises
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      WHERE aw.id = assigned_workout_exercises.assigned_workout_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "awe_client_update"
  ON public.assigned_workout_exercises
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      WHERE aw.id = assigned_workout_exercises.assigned_workout_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      WHERE aw.id = assigned_workout_exercises.assigned_workout_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "awe_pt_manage"
  ON public.assigned_workout_exercises
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE aw.id = assigned_workout_exercises.assigned_workout_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE aw.id = assigned_workout_exercises.assigned_workout_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- assigned_workouts
DROP POLICY IF EXISTS "assigned workouts pt + client access" ON public.assigned_workouts;
DROP POLICY IF EXISTS "client_can_read_own_assigned_workouts" ON public.assigned_workouts;
DROP POLICY IF EXISTS "clients_select_own_assigned_workouts" ON public.assigned_workouts;
DROP POLICY IF EXISTS "clients_update_own_assigned_workouts" ON public.assigned_workouts;
DROP POLICY IF EXISTS "pt_insert_update_assigned_workouts" ON public.assigned_workouts;
DROP POLICY IF EXISTS "pt_manage_assigned_workouts" ON public.assigned_workouts;
DROP POLICY IF EXISTS "pt_select_assigned_workouts" ON public.assigned_workouts;
DROP POLICY IF EXISTS "pt_update_assigned_workouts" ON public.assigned_workouts;

CREATE POLICY "assigned_workouts_select"
  ON public.assigned_workouts
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = assigned_workouts.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = assigned_workouts.client_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "assigned_workouts_insert_pt"
  ON public.assigned_workouts
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = assigned_workouts.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "assigned_workouts_update"
  ON public.assigned_workouts
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = assigned_workouts.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = assigned_workouts.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = assigned_workouts.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = assigned_workouts.client_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "assigned_workouts_delete_pt"
  ON public.assigned_workouts
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = assigned_workouts.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- workout_sessions
DROP POLICY IF EXISTS "client_can_read_own_sessions" ON public.workout_sessions;
DROP POLICY IF EXISTS "client_insert_own_workout_sessions" ON public.workout_sessions;
DROP POLICY IF EXISTS "client_select_own_workout_sessions" ON public.workout_sessions;
DROP POLICY IF EXISTS "client_update_own_workout_sessions" ON public.workout_sessions;
DROP POLICY IF EXISTS "pt_select_workout_sessions" ON public.workout_sessions;
DROP POLICY IF EXISTS "workout sessions pt + client access" ON public.workout_sessions;

CREATE POLICY "workout_sessions_select"
  ON public.workout_sessions
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE aw.id = workout_sessions.assigned_workout_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      WHERE aw.id = workout_sessions.assigned_workout_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "workout_sessions_insert_client"
  ON public.workout_sessions
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      WHERE aw.id = workout_sessions.assigned_workout_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "workout_sessions_update"
  ON public.workout_sessions
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE aw.id = workout_sessions.assigned_workout_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      WHERE aw.id = workout_sessions.assigned_workout_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE aw.id = workout_sessions.assigned_workout_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      WHERE aw.id = workout_sessions.assigned_workout_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "workout_sessions_delete_pt"
  ON public.workout_sessions
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE aw.id = workout_sessions.assigned_workout_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- workout_set_logs
DROP POLICY IF EXISTS "client_can_read_own_set_logs" ON public.workout_set_logs;
DROP POLICY IF EXISTS "client_insert_own_workout_set_logs" ON public.workout_set_logs;
DROP POLICY IF EXISTS "client_select_own_workout_set_logs" ON public.workout_set_logs;
DROP POLICY IF EXISTS "pt_select_workout_set_logs" ON public.workout_set_logs;
DROP POLICY IF EXISTS "workout set logs pt + client access" ON public.workout_set_logs;

CREATE POLICY "workout_set_logs_select"
  ON public.workout_set_logs
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ws.id = workout_set_logs.workout_session_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      WHERE ws.id = workout_set_logs.workout_session_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "workout_set_logs_insert_client"
  ON public.workout_set_logs
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      WHERE ws.id = workout_set_logs.workout_session_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "workout_set_logs_update"
  ON public.workout_set_logs
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ws.id = workout_set_logs.workout_session_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      WHERE ws.id = workout_set_logs.workout_session_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ws.id = workout_set_logs.workout_session_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      WHERE ws.id = workout_set_logs.workout_session_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "workout_set_logs_delete_pt"
  ON public.workout_set_logs
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ws.id = workout_set_logs.workout_session_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- exercises
DROP POLICY IF EXISTS "client_can_read_exercises_in_their_workouts" ON public.exercises;
DROP POLICY IF EXISTS "clients_select_exercises_in_their_assigned_workouts" ON public.exercises;
DROP POLICY IF EXISTS "pt members manage exercises" ON public.exercises;
DROP POLICY IF EXISTS "exercises_client_read" ON public.exercises;
DROP POLICY IF EXISTS "exercises_pt_manage" ON public.exercises;

CREATE POLICY "exercises_client_read"
  ON public.exercises
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM assigned_workout_exercises awe
      JOIN assigned_workouts aw ON aw.id = awe.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      WHERE awe.exercise_id = exercises.id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "exercises_pt_manage"
  ON public.exercises
  FOR ALL
  TO public
  USING (
    exercises.workspace_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = exercises.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    exercises.workspace_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = exercises.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- workout_templates
DROP POLICY IF EXISTS "clients_select_workout_templates_in_workspace" ON public.workout_templates;
DROP POLICY IF EXISTS "pt members manage workout templates" ON public.workout_templates;
DROP POLICY IF EXISTS "workout_templates_client_read" ON public.workout_templates;
DROP POLICY IF EXISTS "workout_templates_pt_manage" ON public.workout_templates;

CREATE POLICY "workout_templates_client_read"
  ON public.workout_templates
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.workspace_id = workout_templates.workspace_id
        AND c.user_id = (select auth.uid())
    )
  );

CREATE POLICY "workout_templates_pt_manage"
  ON public.workout_templates
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- workout_template_exercises
DROP POLICY IF EXISTS "pt_select_template_exercises" ON public.workout_template_exercises;
DROP POLICY IF EXISTS "pt_insert_template_exercises" ON public.workout_template_exercises;
DROP POLICY IF EXISTS "pt_update_template_exercises" ON public.workout_template_exercises;
DROP POLICY IF EXISTS "pt_delete_template_exercises" ON public.workout_template_exercises;
DROP POLICY IF EXISTS "workout_template_exercises_pt_manage" ON public.workout_template_exercises;

CREATE POLICY "workout_template_exercises_pt_manage"
  ON public.workout_template_exercises
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workout_templates wt
      JOIN workspace_members wm ON wm.workspace_id = wt.workspace_id
      WHERE wt.id = workout_template_exercises.workout_template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workout_templates wt
      JOIN workspace_members wm ON wm.workspace_id = wt.workspace_id
      WHERE wt.id = workout_template_exercises.workout_template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- workspaces
DROP POLICY IF EXISTS "workspace members can read" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_member_read" ON public.workspaces;
CREATE POLICY "workspaces_member_read"
  ON public.workspaces
  FOR SELECT
  TO public
  USING (
    owner_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = (select auth.uid())
    )
  );

-- workspace_members
DROP POLICY IF EXISTS "wm_select_own" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_select_own" ON public.workspace_members;
CREATE POLICY "workspace_members_select_own"
  ON public.workspace_members
  FOR SELECT
  TO public
  USING (user_id = (select auth.uid()));

-- invites
DROP POLICY IF EXISTS "pt members manage invites" ON public.invites;
DROP POLICY IF EXISTS "invites_select_pt" ON public.invites;
DROP POLICY IF EXISTS "invites_select_by_code" ON public.invites;

CREATE POLICY "invites_select_by_code"
  ON public.invites
  FOR SELECT
  TO authenticated
  USING (code IS NOT NULL);

CREATE POLICY "invites_pt_manage"
  ON public.invites
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- client_notes
DROP POLICY IF EXISTS "pt members manage client notes" ON public.client_notes;
CREATE POLICY "client_notes_pt_manage"
  ON public.client_notes
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = client_notes.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = client_notes.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- Duplicate indexes cleanup
DROP INDEX IF EXISTS public.idx_awe_assigned_workout_id;
DROP INDEX IF EXISTS public.idx_awex_assigned_workout_id;
DROP INDEX IF EXISTS public.idx_assigned_workout_exercises_awid;
DROP INDEX IF EXISTS public.idx_awx_awid_order;
DROP INDEX IF EXISTS public.baseline_marker_values_one_per_template;
DROP INDEX IF EXISTS public.baseline_metrics_one_per_baseline;
DROP INDEX IF EXISTS public.baseline_one_photo_per_type;
DROP INDEX IF EXISTS public.workout_set_logs_workout_session_id_idx;
