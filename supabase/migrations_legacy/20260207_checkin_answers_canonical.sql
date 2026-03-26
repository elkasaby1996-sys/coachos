-- Canonicalize checkin_answers schema + constraints + RLS

ALTER TABLE public.checkin_answers
  ADD COLUMN IF NOT EXISTS value_text text,
  ADD COLUMN IF NOT EXISTS value_number numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_checkin_answers_updated_at'
  ) THEN
    CREATE TRIGGER set_checkin_answers_updated_at
    BEFORE UPDATE ON public.checkin_answers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'checkin_answers_checkin_id_question_id_key'
  ) THEN
    ALTER TABLE public.checkin_answers
      ADD CONSTRAINT checkin_answers_checkin_id_question_id_key
      UNIQUE (checkin_id, question_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS checkin_answers_checkin_id_idx
  ON public.checkin_answers (checkin_id);

ALTER TABLE public.checkin_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkin_answers_pt_manage" ON public.checkin_answers;
DROP POLICY IF EXISTS "checkin_answers_client_rw" ON public.checkin_answers;

CREATE POLICY "checkin_answers_pt_manage"
  ON public.checkin_answers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checkins ci
      JOIN public.clients c ON c.id = ci.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ci.id = checkin_answers.checkin_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checkins ci
      JOIN public.clients c ON c.id = ci.client_id
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE ci.id = checkin_answers.checkin_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

CREATE POLICY "checkin_answers_client_rw"
  ON public.checkin_answers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checkins ci
      JOIN public.clients c ON c.id = ci.client_id
      WHERE ci.id = checkin_answers.checkin_id
        AND c.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checkins ci
      JOIN public.clients c ON c.id = ci.client_id
      WHERE ci.id = checkin_answers.checkin_id
        AND c.user_id = (select auth.uid())
    )
  );
