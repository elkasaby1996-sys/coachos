-- RLS security hardening

-- 1) Fix invites leak: only PTs in workspace can read invites
DROP POLICY IF EXISTS "invites_select_access" ON public.invites;
CREATE POLICY "invites_select_access"
  ON public.invites
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = invites.workspace_id
        AND wm.user_id = (select auth.uid())
        AND (wm.role)::text ~~ 'pt_%'::text
    )
  );

-- 2) Tighten roles from public -> authenticated where policies depend on auth.uid()
-- assigned_workouts
ALTER POLICY "assigned_workouts_select" ON public.assigned_workouts TO authenticated;
ALTER POLICY "assigned_workouts_insert_pt" ON public.assigned_workouts TO authenticated;
ALTER POLICY "assigned_workouts_update" ON public.assigned_workouts TO authenticated;
ALTER POLICY "assigned_workouts_delete_pt" ON public.assigned_workouts TO authenticated;

-- assigned_workout_exercises
ALTER POLICY "awe_select_access" ON public.assigned_workout_exercises TO authenticated;
ALTER POLICY "awe_insert_pt" ON public.assigned_workout_exercises TO authenticated;
ALTER POLICY "awe_update_access" ON public.assigned_workout_exercises TO authenticated;
ALTER POLICY "awe_delete_pt" ON public.assigned_workout_exercises TO authenticated;

-- checkins + checkin_photos
ALTER POLICY "checkins_access" ON public.checkins TO authenticated;
ALTER POLICY "checkin_photos_access" ON public.checkin_photos TO authenticated;

-- client_programs + client_program_overrides + client_program_assignments
ALTER POLICY "client_programs_select_access" ON public.client_programs TO authenticated;
ALTER POLICY "client_programs_insert_pt" ON public.client_programs TO authenticated;
ALTER POLICY "client_programs_update_pt" ON public.client_programs TO authenticated;
ALTER POLICY "client_programs_delete_pt" ON public.client_programs TO authenticated;

ALTER POLICY "client_program_overrides_select_access" ON public.client_program_overrides TO authenticated;
ALTER POLICY "client_program_overrides_insert_pt" ON public.client_program_overrides TO authenticated;
ALTER POLICY "client_program_overrides_update_pt" ON public.client_program_overrides TO authenticated;
ALTER POLICY "client_program_overrides_delete_pt" ON public.client_program_overrides TO authenticated;

ALTER POLICY "client_program_assignments_select_access" ON public.client_program_assignments TO authenticated;
ALTER POLICY "client_program_assignments_insert_pt" ON public.client_program_assignments TO authenticated;
ALTER POLICY "client_program_assignments_update_pt" ON public.client_program_assignments TO authenticated;
ALTER POLICY "client_program_assignments_delete_pt" ON public.client_program_assignments TO authenticated;

-- client_targets
ALTER POLICY "client_targets_select_own" ON public.client_targets TO authenticated;
ALTER POLICY "client_targets_update_own" ON public.client_targets TO authenticated;

-- clients
ALTER POLICY "clients_select_access" ON public.clients TO authenticated;
ALTER POLICY "clients_select_own_profile" ON public.clients TO authenticated;
ALTER POLICY "clients_update_own" ON public.clients TO authenticated;
ALTER POLICY "clients_insert_self" ON public.clients TO authenticated;
ALTER POLICY "pt_update_client_checkin_template" ON public.clients TO authenticated;

-- coach_todos
ALTER POLICY "coach_todos_select_own" ON public.coach_todos TO authenticated;
ALTER POLICY "coach_todos_insert_own" ON public.coach_todos TO authenticated;
ALTER POLICY "coach_todos_update_own" ON public.coach_todos TO authenticated;
ALTER POLICY "coach_todos_delete_own" ON public.coach_todos TO authenticated;

-- dismissed_reminders + habit_logs
ALTER POLICY "dismissed_reminders_select_own" ON public.dismissed_reminders TO authenticated;
ALTER POLICY "dismissed_reminders_insert_own" ON public.dismissed_reminders TO authenticated;
ALTER POLICY "habit_logs_select_access" ON public.habit_logs TO authenticated;
ALTER POLICY "habit_logs_client_insert" ON public.habit_logs TO authenticated;
ALTER POLICY "habit_logs_client_update" ON public.habit_logs TO authenticated;

-- exercises
ALTER POLICY "exercises_select_access" ON public.exercises TO authenticated;
ALTER POLICY "exercises_insert_pt" ON public.exercises TO authenticated;
ALTER POLICY "exercises_update_pt" ON public.exercises TO authenticated;
ALTER POLICY "exercises_delete_pt" ON public.exercises TO authenticated;

-- workout_templates + workout_template_exercises
ALTER POLICY "workout_templates_select_access" ON public.workout_templates TO authenticated;
ALTER POLICY "workout_templates_insert_pt" ON public.workout_templates TO authenticated;
ALTER POLICY "workout_templates_update_pt" ON public.workout_templates TO authenticated;
ALTER POLICY "workout_templates_delete_pt" ON public.workout_templates TO authenticated;

ALTER POLICY "workout_template_exercises_pt_manage" ON public.workout_template_exercises TO authenticated;

-- workout_sessions + workout_set_logs
ALTER POLICY "workout_sessions_select" ON public.workout_sessions TO authenticated;
ALTER POLICY "workout_sessions_insert_client" ON public.workout_sessions TO authenticated;
ALTER POLICY "workout_sessions_update" ON public.workout_sessions TO authenticated;
ALTER POLICY "workout_sessions_delete_pt" ON public.workout_sessions TO authenticated;

ALTER POLICY "workout_set_logs_select" ON public.workout_set_logs TO authenticated;
ALTER POLICY "workout_set_logs_insert_client" ON public.workout_set_logs TO authenticated;
ALTER POLICY "workout_set_logs_update" ON public.workout_set_logs TO authenticated;
ALTER POLICY "workout_set_logs_delete_pt" ON public.workout_set_logs TO authenticated;

-- workspace_members + workspaces
ALTER POLICY "workspace_members_select_own" ON public.workspace_members TO authenticated;
ALTER POLICY "workspaces_member_read" ON public.workspaces TO authenticated;
ALTER POLICY "pt_update_workspace_defaults" ON public.workspaces TO authenticated;

-- 3) Keep workout_logs (do not drop). Ensure no open access beyond authenticated.
ALTER POLICY "workout_logs_select_own" ON public.workout_logs TO authenticated;
ALTER POLICY "workout_logs_insert_own" ON public.workout_logs TO authenticated;
ALTER POLICY "workout_logs_update_own" ON public.workout_logs TO authenticated;
