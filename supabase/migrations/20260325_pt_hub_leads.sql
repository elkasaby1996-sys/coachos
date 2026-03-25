-- PT Hub Phase 2: leads / applications CRM

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.pt_hub_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  goal_summary text NOT NULL,
  training_experience text,
  budget_interest text,
  package_interest text,
  status text NOT NULL DEFAULT 'new',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz,
  converted_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  converted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pt_hub_leads_user_id_idx
  ON public.pt_hub_leads (user_id);

CREATE INDEX IF NOT EXISTS pt_hub_leads_status_idx
  ON public.pt_hub_leads (user_id, status);

CREATE INDEX IF NOT EXISTS pt_hub_leads_submitted_at_idx
  ON public.pt_hub_leads (user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.pt_hub_lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.pt_hub_leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pt_hub_lead_notes_lead_id_idx
  ON public.pt_hub_lead_notes (lead_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pt_hub_leads_status_check'
      AND conrelid = 'public.pt_hub_leads'::regclass
  ) THEN
    ALTER TABLE public.pt_hub_leads
      ADD CONSTRAINT pt_hub_leads_status_check
      CHECK (
        status IN (
          'new',
          'reviewed',
          'contacted',
          'consultation_booked',
          'accepted',
          'rejected',
          'archived'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_pt_hub_leads_updated_at'
  ) THEN
    CREATE TRIGGER set_pt_hub_leads_updated_at
    BEFORE UPDATE ON public.pt_hub_leads
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

ALTER TABLE public.pt_hub_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_hub_lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pt_hub_leads_select_own" ON public.pt_hub_leads;
CREATE POLICY "pt_hub_leads_select_own"
  ON public.pt_hub_leads
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "pt_hub_leads_insert_own" ON public.pt_hub_leads;
CREATE POLICY "pt_hub_leads_insert_own"
  ON public.pt_hub_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "pt_hub_leads_update_own" ON public.pt_hub_leads;
CREATE POLICY "pt_hub_leads_update_own"
  ON public.pt_hub_leads
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "pt_hub_lead_notes_select_own" ON public.pt_hub_lead_notes;
CREATE POLICY "pt_hub_lead_notes_select_own"
  ON public.pt_hub_lead_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pt_hub_leads lead
      WHERE lead.id = pt_hub_lead_notes.lead_id
        AND lead.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "pt_hub_lead_notes_insert_own" ON public.pt_hub_lead_notes;
CREATE POLICY "pt_hub_lead_notes_insert_own"
  ON public.pt_hub_lead_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.pt_hub_leads lead
      WHERE lead.id = pt_hub_lead_notes.lead_id
        AND lead.user_id = (select auth.uid())
    )
  );

REVOKE ALL ON TABLE public.pt_hub_leads FROM PUBLIC;
REVOKE ALL ON TABLE public.pt_hub_lead_notes FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON TABLE public.pt_hub_leads TO authenticated;
GRANT SELECT, INSERT ON TABLE public.pt_hub_lead_notes TO authenticated;
