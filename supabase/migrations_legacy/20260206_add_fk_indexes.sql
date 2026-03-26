-- Add indexes for unindexed foreign keys flagged by Supabase linter

-- assigned_workouts
CREATE INDEX IF NOT EXISTS assigned_workouts_program_id_idx
  ON public.assigned_workouts (program_id);
CREATE INDEX IF NOT EXISTS assigned_workouts_workout_template_id_idx
  ON public.assigned_workouts (workout_template_id);

-- baseline_entries
CREATE INDEX IF NOT EXISTS baseline_entries_workspace_id_idx
  ON public.baseline_entries (workspace_id);

-- baseline_marker_templates
CREATE INDEX IF NOT EXISTS baseline_marker_templates_workspace_id_idx
  ON public.baseline_marker_templates (workspace_id);

-- baseline_marker_values
CREATE INDEX IF NOT EXISTS baseline_marker_values_template_id_idx
  ON public.baseline_marker_values (template_id);

-- baseline_photos
CREATE INDEX IF NOT EXISTS baseline_photos_client_id_idx
  ON public.baseline_photos (client_id);

-- checkin_answers
CREATE INDEX IF NOT EXISTS checkin_answers_checkin_id_idx
  ON public.checkin_answers (checkin_id);
CREATE INDEX IF NOT EXISTS checkin_answers_question_id_idx
  ON public.checkin_answers (question_id);

-- checkin_questions
CREATE INDEX IF NOT EXISTS checkin_questions_template_id_idx
  ON public.checkin_questions (template_id);

-- checkin_templates
CREATE INDEX IF NOT EXISTS checkin_templates_workspace_id_idx
  ON public.checkin_templates (workspace_id);

-- checkins
CREATE INDEX IF NOT EXISTS checkins_template_id_idx
  ON public.checkins (template_id);

-- client_notes
CREATE INDEX IF NOT EXISTS client_notes_author_user_id_idx
  ON public.client_notes (author_user_id);
CREATE INDEX IF NOT EXISTS client_notes_client_id_idx
  ON public.client_notes (client_id);

-- client_nutrition_days
CREATE INDEX IF NOT EXISTS client_nutrition_days_source_template_id_idx
  ON public.client_nutrition_days (source_template_id);

-- client_program_assignments
CREATE INDEX IF NOT EXISTS client_program_assignments_program_id_idx
  ON public.client_program_assignments (program_id);
CREATE INDEX IF NOT EXISTS client_program_assignments_workspace_id_idx
  ON public.client_program_assignments (workspace_id);

-- client_program_overrides
CREATE INDEX IF NOT EXISTS client_program_overrides_workout_template_id_idx
  ON public.client_program_overrides (workout_template_id);

-- client_programs
CREATE INDEX IF NOT EXISTS client_programs_program_template_id_idx
  ON public.client_programs (program_template_id);

-- clients
CREATE INDEX IF NOT EXISTS clients_user_id_idx
  ON public.clients (user_id);

-- coach_activity_log
CREATE INDEX IF NOT EXISTS coach_activity_log_client_id_idx
  ON public.coach_activity_log (client_id);
CREATE INDEX IF NOT EXISTS coach_activity_log_workspace_id_idx
  ON public.coach_activity_log (workspace_id);

-- crossfit_block_movements
CREATE INDEX IF NOT EXISTS crossfit_block_movements_block_id_idx
  ON public.crossfit_block_movements (block_id);

-- crossfit_blocks
CREATE INDEX IF NOT EXISTS crossfit_blocks_workout_template_id_idx
  ON public.crossfit_blocks (workout_template_id);

-- crossfit_results
CREATE INDEX IF NOT EXISTS crossfit_results_workout_session_id_idx
  ON public.crossfit_results (workout_session_id);

-- exercises
CREATE INDEX IF NOT EXISTS exercises_workspace_id_idx
  ON public.exercises (workspace_id);

-- invites
CREATE INDEX IF NOT EXISTS invites_created_by_user_id_idx
  ON public.invites (created_by_user_id);
CREATE INDEX IF NOT EXISTS invites_workspace_id_idx
  ON public.invites (workspace_id);

-- messages
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx
  ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_sender_user_id_idx
  ON public.messages (sender_user_id);

-- nutrition_template_day_meals
CREATE INDEX IF NOT EXISTS nutrition_template_day_meals_meal_id_idx
  ON public.nutrition_template_day_meals (meal_id);

-- nutrition_templates
CREATE INDEX IF NOT EXISTS nutrition_templates_workspace_id_idx
  ON public.nutrition_templates (workspace_id);

-- program_template_days
CREATE INDEX IF NOT EXISTS program_template_days_workout_template_id_idx
  ON public.program_template_days (workout_template_id);

-- progress_photos
CREATE INDEX IF NOT EXISTS progress_photos_client_id_idx
  ON public.progress_photos (client_id);

-- workout_logs
CREATE INDEX IF NOT EXISTS workout_logs_workout_template_id_idx
  ON public.workout_logs (workout_template_id);

-- workout_template_exercises
CREATE INDEX IF NOT EXISTS workout_template_exercises_exercise_id_idx
  ON public.workout_template_exercises (exercise_id);

-- workout_template_items
CREATE INDEX IF NOT EXISTS workout_template_items_exercise_id_idx
  ON public.workout_template_items (exercise_id);
CREATE INDEX IF NOT EXISTS workout_template_items_workout_template_id_idx
  ON public.workout_template_items (workout_template_id);

-- workout_templates
CREATE INDEX IF NOT EXISTS workout_templates_workspace_id_idx
  ON public.workout_templates (workspace_id);

-- workspaces
CREATE INDEX IF NOT EXISTS workspaces_owner_user_id_idx
  ON public.workspaces (owner_user_id);
