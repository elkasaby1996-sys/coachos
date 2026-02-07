-- Phase 2: Multi-workspace hardening (columns, backfills, RLS)

-- Ensure messages.workspace_id exists and is populated
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.messages m
SET workspace_id = conv.workspace_id
FROM public.conversations conv
WHERE m.conversation_id = conv.id
  AND m.workspace_id IS NULL;

-- Ensure conversations.workspace_id is populated (safety backfill)
UPDATE public.conversations conv
SET workspace_id = c.workspace_id
FROM public.clients c
WHERE conv.client_id = c.id
  AND conv.workspace_id IS NULL;

-- Ensure future messages get workspace_id via trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_message_workspace_id'
  ) THEN
    CREATE FUNCTION public.set_message_workspace_id()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF NEW.workspace_id IS NULL THEN
        SELECT workspace_id INTO NEW.workspace_id
        FROM public.conversations
        WHERE id = NEW.conversation_id;
      END IF;
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_message_workspace_id_trigger'
  ) THEN
    CREATE TRIGGER set_message_workspace_id_trigger
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.set_message_workspace_id();
  END IF;
END $$;

-- Enforce NOT NULL where safe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'workspace_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.messages WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.messages
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

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
    SELECT 1 FROM public.conversations WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.conversations
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_templates'
      AND column_name = 'workspace_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.workout_templates WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.workout_templates
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'program_templates'
      AND column_name = 'workspace_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.program_templates WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.program_templates
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkin_templates'
      AND column_name = 'workspace_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.checkin_templates WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.checkin_templates
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exercises'
      AND column_name = 'workspace_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.exercises WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.exercises
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coach_calendar_events'
      AND column_name = 'workspace_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.coach_calendar_events WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.coach_calendar_events
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coach_todos'
      AND column_name = 'workspace_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.coach_todos WHERE workspace_id IS NULL
  ) THEN
    ALTER TABLE public.coach_todos
      ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

-- RLS: tighten workspace-scoped policies
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_access" ON public.conversations;
CREATE POLICY "conversations_access"
  ON public.conversations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = conversations.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
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
      FROM public.workspace_members wm
      WHERE wm.workspace_id = conversations.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = conversations.client_id
        AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_access" ON public.messages;
CREATE POLICY "messages_access"
  ON public.messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE conv.id = messages.conversation_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
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
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
    OR EXISTS (
      SELECT 1
      FROM public.conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = messages.conversation_id
        AND c.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "workout_templates_pt_manage" ON public.workout_templates;
CREATE POLICY "workout_templates_pt_manage"
  ON public.workout_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = workout_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

DROP POLICY IF EXISTS "program_templates_pt_manage" ON public.program_templates;
CREATE POLICY "program_templates_pt_manage"
  ON public.program_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = program_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = program_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

DROP POLICY IF EXISTS "checkin_templates_pt_manage" ON public.checkin_templates;
CREATE POLICY "checkin_templates_pt_manage"
  ON public.checkin_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = checkin_templates.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

DROP POLICY IF EXISTS "exercises_pt_manage" ON public.exercises;
CREATE POLICY "exercises_pt_manage"
  ON public.exercises
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = exercises.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = exercises.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

DROP POLICY IF EXISTS "coach_calendar_events_pt_manage" ON public.coach_calendar_events;
CREATE POLICY "coach_calendar_events_pt_manage"
  ON public.coach_calendar_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = coach_calendar_events.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = coach_calendar_events.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

DROP POLICY IF EXISTS "coach_todos_pt_manage" ON public.coach_todos;
CREATE POLICY "coach_todos_pt_manage"
  ON public.coach_todos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = coach_todos.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = coach_todos.workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );
