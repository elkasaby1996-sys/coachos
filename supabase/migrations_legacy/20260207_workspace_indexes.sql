-- Workspace scale indexes

CREATE INDEX IF NOT EXISTS clients_workspace_created_at_idx
  ON public.clients (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workout_templates_workspace_created_at_idx
  ON public.workout_templates (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS program_templates_workspace_created_at_idx
  ON public.program_templates (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS checkin_templates_workspace_created_at_idx
  ON public.checkin_templates (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS exercises_workspace_created_at_idx
  ON public.exercises (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversations_workspace_last_message_idx
  ON public.conversations (workspace_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS coach_calendar_events_workspace_starts_at_idx
  ON public.coach_calendar_events (workspace_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS coach_todos_workspace_created_at_idx
  ON public.coach_todos (workspace_id, created_at DESC);
