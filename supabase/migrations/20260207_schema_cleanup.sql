-- Safe schema cleanup: defaults, indexes, and updated_at triggers

-- Backfill conversations.workspace_id from clients
UPDATE public.conversations conv
SET workspace_id = c.workspace_id
FROM public.clients c
WHERE conv.client_id = c.id
  AND conv.workspace_id IS NULL;

-- Enforce NOT NULL on conversations.workspace_id only if safe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'workspace_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.conversations
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

-- Messages defaults
ALTER TABLE public.messages
  ALTER COLUMN body SET DEFAULT '';

-- Helpful indexes
CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
  ON public.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS assigned_workouts_client_date_idx
  ON public.assigned_workouts (client_id, scheduled_date);

CREATE INDEX IF NOT EXISTS checkins_client_week_idx
  ON public.checkins (client_id, week_ending_saturday);

CREATE INDEX IF NOT EXISTS checkin_questions_template_idx
  ON public.checkin_questions (template_id);

CREATE INDEX IF NOT EXISTS checkin_answers_checkin_idx
  ON public.checkin_answers (checkin_id);

CREATE INDEX IF NOT EXISTS workout_sessions_client_idx
  ON public.workout_sessions (client_id);

CREATE INDEX IF NOT EXISTS workout_set_logs_session_idx
  ON public.workout_set_logs (workout_session_id);

-- Updated_at triggers (only where updated_at column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='assigned_workout_exercises' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_assigned_workout_exercises_updated_at'
  ) THEN
    CREATE TRIGGER set_assigned_workout_exercises_updated_at
    BEFORE UPDATE ON public.assigned_workout_exercises
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='baseline_entries' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_baseline_entries_updated_at'
  ) THEN
    CREATE TRIGGER set_baseline_entries_updated_at
    BEFORE UPDATE ON public.baseline_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='baseline_marker_values' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_baseline_marker_values_updated_at'
  ) THEN
    CREATE TRIGGER set_baseline_marker_values_updated_at
    BEFORE UPDATE ON public.baseline_marker_values
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='baseline_metrics' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_baseline_metrics_updated_at'
  ) THEN
    CREATE TRIGGER set_baseline_metrics_updated_at
    BEFORE UPDATE ON public.baseline_metrics
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='coach_todos' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_coach_todos_updated_at'
  ) THEN
    CREATE TRIGGER set_coach_todos_updated_at
    BEFORE UPDATE ON public.coach_todos
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_programs' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_client_programs_updated_at'
  ) THEN
    CREATE TRIGGER set_client_programs_updated_at
    BEFORE UPDATE ON public.client_programs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workout_sessions' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_workout_sessions_updated_at'
  ) THEN
    CREATE TRIGGER set_workout_sessions_updated_at
    BEFORE UPDATE ON public.workout_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='set_clients_updated_at'
  ) THEN
    CREATE TRIGGER set_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
