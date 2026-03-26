-- Follow-up RLS cleanup: remaining initplan warnings + duplicate permissive policies
-- - Replace auth.uid() with (select auth.uid())
-- - Consolidate redundant policies
-- - Drop remaining duplicate/legacy policies

-- === Drop legacy/duplicate policies from earlier tables ===
DROP POLICY IF EXISTS "assigned_workout_exercises_client_read" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "assigned_workout_exercises_client_update" ON public.assigned_workout_exercises;
DROP POLICY IF EXISTS "assigned_workout_exercises_pt_access" ON public.assigned_workout_exercises;

DROP POLICY IF EXISTS "assigned_workouts_client_read" ON public.assigned_workouts;
DROP POLICY IF EXISTS "assigned_workouts_client_update" ON public.assigned_workouts;
DROP POLICY IF EXISTS "assigned_workouts_pt_access" ON public.assigned_workouts;

DROP POLICY IF EXISTS "workout_sessions_client_access" ON public.workout_sessions;
DROP POLICY IF EXISTS "workout_sessions_pt_access" ON public.workout_sessions;
DROP POLICY IF EXISTS "workout_sessions_client_write" ON public.workout_sessions;
DROP POLICY IF EXISTS "workout_sessions_client_update" ON public.workout_sessions;

DROP POLICY IF EXISTS "set_logs_client_read" ON public.workout_set_logs;
DROP POLICY IF EXISTS "set_logs_client_write" ON public.workout_set_logs;
DROP POLICY IF EXISTS "set_logs_pt_read" ON public.workout_set_logs;

-- === crossfit_results ===
DROP POLICY IF EXISTS "crossfit results pt + client access" ON public.crossfit_results;
CREATE POLICY "crossfit_results_access"
  ON public.crossfit_results
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ws.id = crossfit_results.workout_session_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM workout_sessions ws
      JOIN assigned_workouts aw ON aw.id = ws.assigned_workout_id
      JOIN clients c ON c.id = aw.client_id
      WHERE ws.id = crossfit_results.workout_session_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (true);

-- === progress_entries ===
DROP POLICY IF EXISTS "progress pt + client access" ON public.progress_entries;
CREATE POLICY "progress_entries_access"
  ON public.progress_entries
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = progress_entries.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = progress_entries.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (true);

-- === progress_photos ===
DROP POLICY IF EXISTS "progress photos pt + client access" ON public.progress_photos;
CREATE POLICY "progress_photos_access"
  ON public.progress_photos
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = progress_photos.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = progress_photos.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (true);

-- === checkins ===
DROP POLICY IF EXISTS "checkins pt + client access" ON public.checkins;
DROP POLICY IF EXISTS "clients_insert_own_checkins" ON public.checkins;
DROP POLICY IF EXISTS "clients_select_own_checkins" ON public.checkins;
DROP POLICY IF EXISTS "clients_update_own_checkins" ON public.checkins;
DROP POLICY IF EXISTS "pt_select_workspace_checkins" ON public.checkins;
DROP POLICY IF EXISTS "pt_update_workspace_checkins" ON public.checkins;

CREATE POLICY "checkins_access"
  ON public.checkins
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = checkins.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = checkins.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = checkins.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = checkins.client_id
        AND c.user_id = (select auth.uid())
    )
  );

-- === checkin_templates ===
DROP POLICY IF EXISTS "checkin templates pt members only" ON public.checkin_templates;
CREATE POLICY "checkin_templates_pt_only"
  ON public.checkin_templates
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
    )
  );

-- === conversations ===
DROP POLICY IF EXISTS "conversations pt + client access" ON public.conversations;
CREATE POLICY "conversations_access"
  ON public.conversations
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = conversations.client_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = conversations.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (true);

-- === messages ===
DROP POLICY IF EXISTS "messages pt + client access" ON public.messages;
CREATE POLICY "messages_access"
  ON public.messages
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM conversations conv
      JOIN clients c ON c.id = conv.client_id
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE conv.id = messages.conversation_id
        AND wm.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM conversations conv
      JOIN clients c ON c.id = conv.client_id
      WHERE conv.id = messages.conversation_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (true);

-- === clients ===
DROP POLICY IF EXISTS "clients_select_own" ON public.clients;
DROP POLICY IF EXISTS "clients_select_own_profile" ON public.clients;
DROP POLICY IF EXISTS "clients_select_pt_workspace" ON public.clients;
DROP POLICY IF EXISTS "pt_select_clients_in_workspace" ON public.clients;
DROP POLICY IF EXISTS "pt_select_workspace_clients" ON public.clients;

DROP POLICY IF EXISTS "clients_insert_self" ON public.clients;
DROP POLICY IF EXISTS "clients_update_own" ON public.clients;

CREATE POLICY "clients_select_access"
  ON public.clients
  FOR SELECT
  TO public
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = clients.workspace_id
        AND wm.user_id = (select auth.uid())
    )
    OR is_workspace_member(clients.workspace_id)
  );

CREATE POLICY "clients_insert_self"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "clients_update_own"
  ON public.clients
  FOR UPDATE
  TO public
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- === client_targets ===
DROP POLICY IF EXISTS "clients_select_own_client_targets" ON public.client_targets;
DROP POLICY IF EXISTS "clients_update_own_client_targets" ON public.client_targets;
CREATE POLICY "client_targets_select_own"
  ON public.client_targets
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = client_targets.client_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "client_targets_update_own"
  ON public.client_targets
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = client_targets.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = client_targets.client_id
        AND c.user_id = (select auth.uid())
    )
  );

-- === workout_logs ===
DROP POLICY IF EXISTS "clients_select_own_workout_logs" ON public.workout_logs;
DROP POLICY IF EXISTS "clients_insert_own_workout_logs" ON public.workout_logs;
DROP POLICY IF EXISTS "clients_update_own_workout_logs" ON public.workout_logs;
CREATE POLICY "workout_logs_select_own"
  ON public.workout_logs
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = workout_logs.client_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "workout_logs_insert_own"
  ON public.workout_logs
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = workout_logs.client_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "workout_logs_update_own"
  ON public.workout_logs
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = workout_logs.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = workout_logs.client_id
        AND c.user_id = (select auth.uid())
    )
  );

-- === workout_log_items ===
DROP POLICY IF EXISTS "clients_select_own_workout_log_items" ON public.workout_log_items;
DROP POLICY IF EXISTS "clients_insert_own_workout_log_items" ON public.workout_log_items;
DROP POLICY IF EXISTS "clients_update_own_workout_log_items" ON public.workout_log_items;
CREATE POLICY "workout_log_items_select_own"
  ON public.workout_log_items
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workout_logs wl
      JOIN clients c ON c.id = wl.client_id
      WHERE wl.id = workout_log_items.workout_log_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "workout_log_items_insert_own"
  ON public.workout_log_items
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workout_logs wl
      JOIN clients c ON c.id = wl.client_id
      WHERE wl.id = workout_log_items.workout_log_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "workout_log_items_update_own"
  ON public.workout_log_items
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workout_logs wl
      JOIN clients c ON c.id = wl.client_id
      WHERE wl.id = workout_log_items.workout_log_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workout_logs wl
      JOIN clients c ON c.id = wl.client_id
      WHERE wl.id = workout_log_items.workout_log_id
        AND c.user_id = (select auth.uid())
    )
  );

-- === baseline tables ===
DROP POLICY IF EXISTS "baseline_photos_rw" ON public.baseline_photos;
CREATE POLICY "baseline_photos_rw"
  ON public.baseline_photos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM baseline_entries be
      JOIN clients c ON c.id = be.client_id
      WHERE be.id = baseline_photos.baseline_id
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

DROP POLICY IF EXISTS "baseline_marker_values_rw" ON public.baseline_marker_values;
CREATE POLICY "baseline_marker_values_rw"
  ON public.baseline_marker_values
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM baseline_entries be
      JOIN clients c ON c.id = be.client_id
      WHERE be.id = baseline_marker_values.baseline_id
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

DROP POLICY IF EXISTS "baseline_entries_select" ON public.baseline_entries;
DROP POLICY IF EXISTS "baseline_entries_insert" ON public.baseline_entries;
DROP POLICY IF EXISTS "baseline_entries_update" ON public.baseline_entries;
CREATE POLICY "baseline_entries_select"
  ON public.baseline_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = baseline_entries.client_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = baseline_entries.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );
CREATE POLICY "baseline_entries_insert"
  ON public.baseline_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = baseline_entries.client_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = baseline_entries.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );
CREATE POLICY "baseline_entries_update"
  ON public.baseline_entries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = baseline_entries.client_id
        AND c.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = baseline_entries.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "baseline_metrics_select" ON public.baseline_metrics;
DROP POLICY IF EXISTS "baseline_metrics_write" ON public.baseline_metrics;
CREATE POLICY "baseline_metrics_select"
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
CREATE POLICY "baseline_metrics_write"
  ON public.baseline_metrics
  FOR ALL
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

DROP POLICY IF EXISTS "clients_can_read_templates_in_their_workspace" ON public.baseline_marker_templates;
DROP POLICY IF EXISTS "pt_can_read_templates_in_workspace" ON public.baseline_marker_templates;
DROP POLICY IF EXISTS "pt_manage_marker_templates" ON public.baseline_marker_templates;
CREATE POLICY "baseline_marker_templates_select"
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
CREATE POLICY "baseline_marker_templates_pt_manage"
  ON public.baseline_marker_templates
  FOR ALL
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

-- === coach_todos ===
DROP POLICY IF EXISTS "coach_todos_select_own" ON public.coach_todos;
DROP POLICY IF EXISTS "coach_todos_insert_own" ON public.coach_todos;
DROP POLICY IF EXISTS "coach_todos_update_own" ON public.coach_todos;
DROP POLICY IF EXISTS "coach_todos_delete_own" ON public.coach_todos;
CREATE POLICY "coach_todos_select_own"
  ON public.coach_todos
  FOR SELECT
  TO public
  USING (coach_id = (select auth.uid()));
CREATE POLICY "coach_todos_insert_own"
  ON public.coach_todos
  FOR INSERT
  TO public
  WITH CHECK (coach_id = (select auth.uid()));
CREATE POLICY "coach_todos_update_own"
  ON public.coach_todos
  FOR UPDATE
  TO public
  USING (coach_id = (select auth.uid()))
  WITH CHECK (coach_id = (select auth.uid()));
CREATE POLICY "coach_todos_delete_own"
  ON public.coach_todos
  FOR DELETE
  TO public
  USING (coach_id = (select auth.uid()));

-- === coach_activity_log ===
DROP POLICY IF EXISTS "pt_read_activity_log" ON public.coach_activity_log;
DROP POLICY IF EXISTS "pt_write_activity_log" ON public.coach_activity_log;
DROP POLICY IF EXISTS "client_read_own_activity_log" ON public.coach_activity_log;
CREATE POLICY "coach_activity_log_pt_read"
  ON public.coach_activity_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = coach_activity_log.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );
CREATE POLICY "coach_activity_log_pt_write"
  ON public.coach_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = coach_activity_log.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );
CREATE POLICY "coach_activity_log_client_read"
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
  );

-- === habit_logs ===
DROP POLICY IF EXISTS "habit_logs_client_select" ON public.habit_logs;
DROP POLICY IF EXISTS "habit_logs_client_insert" ON public.habit_logs;
DROP POLICY IF EXISTS "habit_logs_client_update" ON public.habit_logs;
DROP POLICY IF EXISTS "habit_logs_pt_select" ON public.habit_logs;
DROP POLICY IF EXISTS "pt_select_workspace_habit_logs" ON public.habit_logs;
CREATE POLICY "habit_logs_client_select"
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
  );
CREATE POLICY "habit_logs_client_insert"
  ON public.habit_logs
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = habit_logs.client_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "habit_logs_client_update"
  ON public.habit_logs
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = habit_logs.client_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = habit_logs.client_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "habit_logs_pt_select"
  ON public.habit_logs
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = habit_logs.client_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  );

-- === dismissed_reminders ===
DROP POLICY IF EXISTS "clients_select_own_dismissed_reminders" ON public.dismissed_reminders;
DROP POLICY IF EXISTS "clients_insert_own_dismissed_reminders" ON public.dismissed_reminders;
CREATE POLICY "dismissed_reminders_select_own"
  ON public.dismissed_reminders
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = dismissed_reminders.client_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "dismissed_reminders_insert_own"
  ON public.dismissed_reminders
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = dismissed_reminders.client_id
        AND c.user_id = (select auth.uid())
    )
  );

-- === program_templates / days ===
DROP POLICY IF EXISTS "pt_manage_program_templates" ON public.program_templates;
CREATE POLICY "program_templates_pt_manage"
  ON public.program_templates
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      WHERE wm.workspace_id = program_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "pt_manage_program_template_days" ON public.program_template_days;
CREATE POLICY "program_template_days_pt_manage"
  ON public.program_template_days
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM program_templates pt
      JOIN workspace_members wm ON wm.workspace_id = pt.workspace_id
      WHERE pt.id = program_template_days.program_template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text LIKE 'pt_%'
    )
  )
  WITH CHECK (true);

-- === client_programs / overrides / assignments ===
DROP POLICY IF EXISTS "pt_manage_client_programs" ON public.client_programs;
DROP POLICY IF EXISTS "client_select_own_programs" ON public.client_programs;
CREATE POLICY "client_programs_select_own"
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
  );
CREATE POLICY "client_programs_pt_manage"
  ON public.client_programs
  FOR ALL
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

DROP POLICY IF EXISTS "pt_manage_client_program_overrides" ON public.client_program_overrides;
DROP POLICY IF EXISTS "client_select_own_program_overrides" ON public.client_program_overrides;
CREATE POLICY "client_program_overrides_select_own"
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
  );
CREATE POLICY "client_program_overrides_pt_manage"
  ON public.client_program_overrides
  FOR ALL
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

DROP POLICY IF EXISTS "pt_manage_client_program_assignments" ON public.client_program_assignments;
DROP POLICY IF EXISTS "client_select_own_program_assignment" ON public.client_program_assignments;
CREATE POLICY "client_program_assignments_select_own"
  ON public.client_program_assignments
  FOR SELECT
  TO public
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = client_program_assignments.client_id
        AND c.user_id = (select auth.uid())
    )
  );
CREATE POLICY "client_program_assignments_pt_manage"
  ON public.client_program_assignments
  FOR ALL
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

-- === invites (remove overlapping select) ===
DROP POLICY IF EXISTS "invites_pt_manage" ON public.invites;
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
  WITH CHECK (true);

-- === duplicate index cleanup ===
DROP INDEX IF EXISTS public.idx_workout_sessions_assigned_workout_id;
