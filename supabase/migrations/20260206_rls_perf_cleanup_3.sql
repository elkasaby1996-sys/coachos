-- Consolidate remaining SELECT/UPDATE policies to remove multiple permissive warnings

-- assigned_workout_exercises
DROP POLICY IF EXISTS "awe_client_read" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "awe_client_update" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "awe_pt_manage" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "awe_select_access" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "awe_update_access" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "awe_insert_pt" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "awe_delete_pt" ON public.assigned_workout_exercises;

CREATE POLICY "awe_select_access"
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
    OR EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE aw.id = assigned_workout_exercises.assigned_workout_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "awe_update_access"
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
    OR EXISTS (
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
      WHERE aw.id = assigned_workout_exercises.assigned_workout_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM assigned_workouts aw
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE aw.id = assigned_workout_exercises.assigned_workout_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "awe_insert_pt"
  ON public.assigned_workout_exercises
  FOR INSERT
  TO public
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

CREATE POLICY "awe_delete_pt"
  ON public.assigned_workout_exercises
  FOR DELETE
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
  );

-- exercises
DROP POLICY IF EXISTS "exercises_client_read" ON public.exercises;
DROP POLICY IF EXISTS "exercises_pt_manage" ON public.exercises;
DROP POLICY IF EXISTS "exercises_select_access" ON public.exercises;
DROP POLICY IF EXISTS "exercises_insert_pt" ON public.exercises;
DROP POLICY IF EXISTS "exercises_update_pt" ON public.exercises;
DROP POLICY IF EXISTS "exercises_delete_pt" ON public.exercises;

CREATE POLICY "exercises_select_access"
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
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = exercises.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "exercises_insert_pt"
  ON public.exercises
  FOR INSERT
  TO public
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

CREATE POLICY "exercises_update_pt"
  ON public.exercises
  FOR UPDATE
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

CREATE POLICY "exercises_delete_pt"
  ON public.exercises
  FOR DELETE
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
  );

-- workout_templates
DROP POLICY IF EXISTS "workout_templates_client_read" ON public.workout_templates;
DROP POLICY IF EXISTS "workout_templates_pt_manage" ON public.workout_templates;
DROP POLICY IF EXISTS "workout_templates_select_access" ON public.workout_templates;
DROP POLICY IF EXISTS "workout_templates_insert_pt" ON public.workout_templates;
DROP POLICY IF EXISTS "workout_templates_update_pt" ON public.workout_templates;
DROP POLICY IF EXISTS "workout_templates_delete_pt" ON public.workout_templates;

CREATE POLICY "workout_templates_select_access"
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
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "workout_templates_insert_pt"
  ON public.workout_templates
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "workout_templates_update_pt"
  ON public.workout_templates
  FOR UPDATE
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
  WITH CHECK (true);

CREATE POLICY "workout_templates_delete_pt"
  ON public.workout_templates
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- habit_logs
DROP POLICY IF EXISTS "habit_logs_client_select" ON public.habit_logs;
DROP POLICY IF EXISTS "habit_logs_pt_select" ON public.habit_logs;
DROP POLICY IF EXISTS "habit_logs_select_access" ON public.habit_logs;

CREATE POLICY "habit_logs_select_access"
  ON public.habit_logs
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = habit_logs.client_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = habit_logs.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- coach_activity_log
DROP POLICY IF EXISTS "coach_activity_log_client_read" ON public.coach_activity_log;
DROP POLICY IF EXISTS "coach_activity_log_pt_read" ON public.coach_activity_log;
DROP POLICY IF EXISTS "coach_activity_log_select_access" ON public.coach_activity_log;

CREATE POLICY "coach_activity_log_select_access"
  ON public.coach_activity_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = coach_activity_log.client_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = coach_activity_log.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- baseline_marker_templates
DROP POLICY IF EXISTS "baseline_marker_templates_select" ON public.baseline_marker_templates;
DROP POLICY IF EXISTS "baseline_marker_templates_pt_manage" ON public.baseline_marker_templates;
DROP POLICY IF EXISTS "baseline_marker_templates_select_access" ON public.baseline_marker_templates;
DROP POLICY IF EXISTS "baseline_marker_templates_insert_pt" ON public.baseline_marker_templates;
DROP POLICY IF EXISTS "baseline_marker_templates_update_pt" ON public.baseline_marker_templates;
DROP POLICY IF EXISTS "baseline_marker_templates_delete_pt" ON public.baseline_marker_templates;

CREATE POLICY "baseline_marker_templates_select_access"
  ON public.baseline_marker_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.workspace_id = baseline_marker_templates.workspace_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = baseline_marker_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "baseline_marker_templates_insert_pt"
  ON public.baseline_marker_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = baseline_marker_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "baseline_marker_templates_update_pt"
  ON public.baseline_marker_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = baseline_marker_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (true);

CREATE POLICY "baseline_marker_templates_delete_pt"
  ON public.baseline_marker_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = baseline_marker_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- baseline_metrics
DROP POLICY IF EXISTS "baseline_metrics_select" ON public.baseline_metrics;
DROP POLICY IF EXISTS "baseline_metrics_write" ON public.baseline_metrics;
DROP POLICY IF EXISTS "baseline_metrics_select_access" ON public.baseline_metrics;
DROP POLICY IF EXISTS "baseline_metrics_insert_access" ON public.baseline_metrics;
DROP POLICY IF EXISTS "baseline_metrics_update_access" ON public.baseline_metrics;
DROP POLICY IF EXISTS "baseline_metrics_delete_access" ON public.baseline_metrics;

CREATE POLICY "baseline_metrics_select_access"
  ON public.baseline_metrics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM baseline_entries be
      JOIN clients c ON c.id = be.client_id
      WHERE be.id = baseline_metrics.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  );

CREATE POLICY "baseline_metrics_insert_access"
  ON public.baseline_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM baseline_entries be
      JOIN clients c ON c.id = be.client_id
      WHERE be.id = baseline_metrics.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  );

CREATE POLICY "baseline_metrics_update_access"
  ON public.baseline_metrics
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM baseline_entries be
      JOIN clients c ON c.id = be.client_id
      WHERE be.id = baseline_metrics.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  )
  WITH CHECK (true);

CREATE POLICY "baseline_metrics_delete_access"
  ON public.baseline_metrics
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM baseline_entries be
      JOIN clients c ON c.id = be.client_id
      WHERE be.id = baseline_metrics.baseline_id
        AND (
          c.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = be.workspace_id
              AND wm.user_id = (select auth.uid())
              AND wm.role::text LIKE 'pt_%'
          )
        )
    )
  );

-- client_programs
DROP POLICY IF EXISTS "client_programs_select_own" ON public.client_programs;
DROP POLICY IF EXISTS "client_programs_pt_manage" ON public.client_programs;
DROP POLICY IF EXISTS "client_programs_select_access" ON public.client_programs;
DROP POLICY IF EXISTS "client_programs_insert_pt" ON public.client_programs;
DROP POLICY IF EXISTS "client_programs_update_pt" ON public.client_programs;
DROP POLICY IF EXISTS "client_programs_delete_pt" ON public.client_programs;

CREATE POLICY "client_programs_select_access"
  ON public.client_programs
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = client_programs.client_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = client_programs.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "client_programs_insert_pt"
  ON public.client_programs
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = client_programs.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "client_programs_update_pt"
  ON public.client_programs
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = client_programs.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (true);

CREATE POLICY "client_programs_delete_pt"
  ON public.client_programs
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = client_programs.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- client_program_overrides
DROP POLICY IF EXISTS "client_program_overrides_select_own" ON public.client_program_overrides;
DROP POLICY IF EXISTS "client_program_overrides_pt_manage" ON public.client_program_overrides;
DROP POLICY IF EXISTS "client_program_overrides_select_access" ON public.client_program_overrides;
DROP POLICY IF EXISTS "client_program_overrides_insert_pt" ON public.client_program_overrides;
DROP POLICY IF EXISTS "client_program_overrides_update_pt" ON public.client_program_overrides;
DROP POLICY IF EXISTS "client_program_overrides_delete_pt" ON public.client_program_overrides;

CREATE POLICY "client_program_overrides_select_access"
  ON public.client_program_overrides
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM client_programs cp
      JOIN clients c ON c.id = cp.client_id
      WHERE cp.id = client_program_overrides.client_program_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM client_programs cp
      JOIN clients c ON c.id = cp.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE cp.id = client_program_overrides.client_program_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "client_program_overrides_insert_pt"
  ON public.client_program_overrides
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM client_programs cp
      JOIN clients c ON c.id = cp.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE cp.id = client_program_overrides.client_program_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "client_program_overrides_update_pt"
  ON public.client_program_overrides
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM client_programs cp
      JOIN clients c ON c.id = cp.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE cp.id = client_program_overrides.client_program_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (true);

CREATE POLICY "client_program_overrides_delete_pt"
  ON public.client_program_overrides
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM client_programs cp
      JOIN clients c ON c.id = cp.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE cp.id = client_program_overrides.client_program_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- client_program_assignments
DROP POLICY IF EXISTS "client_program_assignments_select_own" ON public.client_program_assignments;
DROP POLICY IF EXISTS "client_program_assignments_pt_manage" ON public.client_program_assignments;
DROP POLICY IF EXISTS "client_program_assignments_select_access" ON public.client_program_assignments;
DROP POLICY IF EXISTS "client_program_assignments_insert_pt" ON public.client_program_assignments;
DROP POLICY IF EXISTS "client_program_assignments_update_pt" ON public.client_program_assignments;
DROP POLICY IF EXISTS "client_program_assignments_delete_pt" ON public.client_program_assignments;

CREATE POLICY "client_program_assignments_select_access"
  ON public.client_program_assignments
  FOR SELECT
  TO public
  USING (
    (
      is_active = true
      AND EXISTS (
        SELECT 1
        FROM clients c
        WHERE c.id = client_program_assignments.client_id
          AND c.user_id = (select auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = client_program_assignments.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "client_program_assignments_insert_pt"
  ON public.client_program_assignments
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = client_program_assignments.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "client_program_assignments_update_pt"
  ON public.client_program_assignments
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = client_program_assignments.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (true);

CREATE POLICY "client_program_assignments_delete_pt"
  ON public.client_program_assignments
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = client_program_assignments.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- invites
DROP POLICY IF EXISTS "invites_select_by_code" ON public.invites;
DROP POLICY IF EXISTS "invites_pt_manage" ON public.invites;
DROP POLICY IF EXISTS "invites_select_access" ON public.invites;
DROP POLICY IF EXISTS "invites_insert_pt" ON public.invites;
DROP POLICY IF EXISTS "invites_update_pt" ON public.invites;
DROP POLICY IF EXISTS "invites_delete_pt" ON public.invites;

CREATE POLICY "invites_select_access"
  ON public.invites
  FOR SELECT
  TO authenticated
  USING (
    code IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "invites_insert_pt"
  ON public.invites
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

CREATE POLICY "invites_update_pt"
  ON public.invites
  FOR UPDATE
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
  WITH CHECK (true);

CREATE POLICY "invites_delete_pt"
  ON public.invites
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- duplicate index cleanup
DROP INDEX IF EXISTS public.workout_sessions_assigned_workout_id_idx;
