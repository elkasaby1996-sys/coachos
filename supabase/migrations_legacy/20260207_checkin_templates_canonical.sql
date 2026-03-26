-- Canonicalize checkin_templates schema + RLS for PT management

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkin_templates'
      AND column_name = 'title'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkin_templates'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE public.checkin_templates RENAME COLUMN title TO name;
  END IF;
END $$;

ALTER TABLE public.checkin_templates
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Untitled template',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_checkin_templates_updated_at'
  ) THEN
    CREATE TRIGGER set_checkin_templates_updated_at
    BEFORE UPDATE ON public.checkin_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS checkin_templates_workspace_id_idx
  ON public.checkin_templates (workspace_id);

CREATE INDEX IF NOT EXISTS checkin_templates_created_at_idx
  ON public.checkin_templates (created_at DESC);

ALTER TABLE public.checkin_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkin_templates_pt_only" ON public.checkin_templates;
DROP POLICY IF EXISTS "checkin_templates_pt_manage" ON public.checkin_templates;
DROP POLICY IF EXISTS "checkin_templates_client_read" ON public.checkin_templates;

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

CREATE POLICY "checkin_templates_client_read"
  ON public.checkin_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.workspace_id = checkin_templates.workspace_id
        AND c.user_id = (select auth.uid())
    )
  );
