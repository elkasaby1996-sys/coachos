-- Canonicalize checkin_questions schema + RLS for PT management

ALTER TABLE public.checkin_questions
  ADD COLUMN IF NOT EXISTS question_text text,
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS position integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.checkin_questions
SET question_text = COALESCE(question_text, prompt)
WHERE question_text IS NULL
  AND prompt IS NOT NULL;

ALTER TABLE public.checkin_questions
  ALTER COLUMN type SET DEFAULT 'text';

UPDATE public.checkin_questions
SET type = 'text'
WHERE type IS NULL;

ALTER TABLE public.checkin_questions
  ALTER COLUMN prompt SET DEFAULT '';

UPDATE public.checkin_questions
SET prompt = COALESCE(prompt, question_text, '')
WHERE prompt IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_checkin_questions_updated_at'
  ) THEN
    CREATE TRIGGER set_checkin_questions_updated_at
    BEFORE UPDATE ON public.checkin_questions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS checkin_questions_template_id_idx
  ON public.checkin_questions (template_id);

ALTER TABLE public.checkin_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkin_questions_pt_manage" ON public.checkin_questions;
DROP POLICY IF EXISTS "checkin_questions_client_read" ON public.checkin_questions;

CREATE POLICY "checkin_questions_pt_manage"
  ON public.checkin_questions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.workspace_members wm ON wm.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.workspace_members wm ON wm.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND wm.user_id = (select auth.uid())
        AND wm.role::text IN ('pt_owner', 'pt_coach')
    )
  );

CREATE POLICY "checkin_questions_client_read"
  ON public.checkin_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.checkin_templates ct
      JOIN public.clients c ON c.workspace_id = ct.workspace_id
      WHERE ct.id = checkin_questions.template_id
        AND c.user_id = (select auth.uid())
    )
  );
