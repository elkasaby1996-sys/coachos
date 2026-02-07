-- Coach calendar events for check-in scheduling

CREATE TABLE IF NOT EXISTS public.coach_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_coach_calendar_events_updated_at'
  ) THEN
    CREATE TRIGGER set_coach_calendar_events_updated_at
    BEFORE UPDATE ON public.coach_calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS coach_calendar_events_workspace_id_idx
  ON public.coach_calendar_events (workspace_id);

CREATE INDEX IF NOT EXISTS coach_calendar_events_starts_at_idx
  ON public.coach_calendar_events (starts_at);

ALTER TABLE public.coach_calendar_events ENABLE ROW LEVEL SECURITY;

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
