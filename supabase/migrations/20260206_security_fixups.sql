-- Security advisor fixups
-- - Ensure view is security invoker
-- - Lock function search_path
-- - Replace permissive WITH CHECK (true) policies

-- View: enforce security invoker
CREATE OR REPLACE VIEW public.v_workspace_pt_members
WITH (security_invoker = true) AS
SELECT
  wm.workspace_id,
  wm.user_id,
  wm.role
FROM public.workspace_members wm;

-- Function search_path hardening
ALTER FUNCTION public.accept_invite(text, text)
  SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.auto_materialize_assigned_exercises()
  SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.create_invite(uuid, integer, timestamp with time zone)
  SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.is_workspace_member(uuid)
  SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.is_workspace_pt(uuid)
  SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.materialize_assigned_workout_exercises(uuid)
  SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.pt_update_client_admin_fields(uuid, text, text)
  SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.set_updated_at()
  SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.set_workout_session_client_id()
  SET search_path = pg_catalog, public, extensions;

-- RLS policies: replace WITH CHECK (true)

-- baseline_entries
DROP POLICY IF EXISTS "baseline_entries_update" ON public.baseline_entries;
CREATE POLICY "baseline_entries_update"
  ON public.baseline_entries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = baseline_entries.client_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = baseline_entries.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = baseline_entries.client_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = baseline_entries.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- baseline_marker_templates
DROP POLICY IF EXISTS "baseline_marker_templates_update_pt" ON public.baseline_marker_templates;
CREATE POLICY "baseline_marker_templates_update_pt"
  ON public.baseline_marker_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = baseline_marker_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = baseline_marker_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- baseline_marker_values
DROP POLICY IF EXISTS "baseline_marker_values_rw" ON public.baseline_marker_values;
CREATE POLICY "baseline_marker_values_rw"
  ON public.baseline_marker_values
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.baseline_entries be
      JOIN public.clients c ON c.id = be.client_id
      WHERE be.id = baseline_marker_values.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.baseline_entries be
      JOIN public.clients c ON c.id = be.client_id
      WHERE be.id = baseline_marker_values.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  );

-- baseline_metrics
DROP POLICY IF EXISTS "baseline_metrics_update_access" ON public.baseline_metrics;
CREATE POLICY "baseline_metrics_update_access"
  ON public.baseline_metrics
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.baseline_entries be
      JOIN public.clients c ON c.id = be.client_id
      WHERE be.id = baseline_metrics.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.baseline_entries be
      JOIN public.clients c ON c.id = be.client_id
      WHERE be.id = baseline_metrics.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  );

-- baseline_photos
DROP POLICY IF EXISTS "baseline_photos_rw" ON public.baseline_photos;
CREATE POLICY "baseline_photos_rw"
  ON public.baseline_photos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.baseline_entries be
      JOIN public.clients c ON c.id = be.client_id
      WHERE be.id = baseline_photos.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.baseline_entries be
      JOIN public.clients c ON c.id = be.client_id
      WHERE be.id = baseline_photos.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  );

-- client_program_assignments
DROP POLICY IF EXISTS "client_program_assignments_update_pt" ON public.client_program_assignments;
CREATE POLICY "client_program_assignments_update_pt"
  ON public.client_program_assignments
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = client_program_assignments.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = client_program_assignments.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- client_program_overrides
DROP POLICY IF EXISTS "client_program_overrides_update_pt" ON public.client_program_overrides;
CREATE POLICY "client_program_overrides_update_pt"
  ON public.client_program_overrides
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_programs cp
      JOIN public.clients c ON c.id = cp.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE cp.id = client_program_overrides.client_program_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.client_programs cp
      JOIN public.clients c ON c.id = cp.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE cp.id = client_program_overrides.client_program_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- client_programs
DROP POLICY IF EXISTS "client_programs_update_pt" ON public.client_programs;
CREATE POLICY "client_programs_update_pt"
  ON public.client_programs
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = client_programs.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = client_programs.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- conversations
DROP POLICY IF EXISTS "conversations_access" ON public.conversations;
CREATE POLICY "conversations_access"
  ON public.conversations
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = conversations.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = conversations.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = conversations.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = conversations.client_id
        AND c.user_id = (select auth.uid())
    )
  );

-- crossfit_results
DROP POLICY IF EXISTS "crossfit_results_access" ON public.crossfit_results;
CREATE POLICY "crossfit_results_access"
  ON public.crossfit_results
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_sessions ws
      JOIN public.assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN public.clients c ON c.id = aw.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ws.id = crossfit_results.workout_session_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.workout_sessions ws
      JOIN public.assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN public.clients c ON c.id = aw.client_id
      WHERE ws.id = crossfit_results.workout_session_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workout_sessions ws
      JOIN public.assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN public.clients c ON c.id = aw.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ws.id = crossfit_results.workout_session_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.workout_sessions ws
      JOIN public.assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN public.clients c ON c.id = aw.client_id
      WHERE ws.id = crossfit_results.workout_session_id
        AND c.user_id = (select auth.uid())
    )
  );

-- invites
DROP POLICY IF EXISTS "invites_update_pt" ON public.invites;
CREATE POLICY "invites_update_pt"
  ON public.invites
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- messages
DROP POLICY IF EXISTS "messages_access" ON public.messages;
CREATE POLICY "messages_access"
  ON public.messages
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE conv.id = messages.conversation_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = messages.conversation_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE conv.id = messages.conversation_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = messages.conversation_id
        AND c.user_id = (select auth.uid())
    )
  );

-- program_template_days
DROP POLICY IF EXISTS "program_template_days_pt_manage" ON public.program_template_days;
CREATE POLICY "program_template_days_pt_manage"
  ON public.program_template_days
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.program_templates pt
      JOIN public.workspace_members wm ON wm.workspace_id = pt.workspace_id
      WHERE pt.id = program_template_days.program_template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.program_templates pt
      JOIN public.workspace_members wm ON wm.workspace_id = pt.workspace_id
      WHERE pt.id = program_template_days.program_template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- program_templates
DROP POLICY IF EXISTS "program_templates_pt_manage" ON public.program_templates;
CREATE POLICY "program_templates_pt_manage"
  ON public.program_templates
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = program_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = program_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- progress_entries
DROP POLICY IF EXISTS "progress_entries_access" ON public.progress_entries;
CREATE POLICY "progress_entries_access"
  ON public.progress_entries
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = progress_entries.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = progress_entries.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = progress_entries.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = progress_entries.client_id
        AND c.user_id = (select auth.uid())
    )
  );

-- progress_photos
DROP POLICY IF EXISTS "progress_photos_access" ON public.progress_photos;
CREATE POLICY "progress_photos_access"
  ON public.progress_photos
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = progress_photos.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = progress_photos.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = progress_photos.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = progress_photos.client_id
        AND c.user_id = (select auth.uid())
    )
  );

-- workout_templates
DROP POLICY IF EXISTS "workout_templates_update_pt" ON public.workout_templates;
CREATE POLICY "workout_templates_update_pt"
  ON public.workout_templates
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );
