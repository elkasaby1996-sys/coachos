-- Backfill schema drift for workspace appearance + updated_at triggers

-- Ensure trigger helper exists
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

-- Ensure RPC exists for theme provider
CREATE OR REPLACE FUNCTION public.set_my_appearance_preferences(
  p_theme_preference text DEFAULT null,
  p_compact_density boolean DEFAULT null
)
RETURNS TABLE (
  theme_preference text,
  compact_density boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_theme_preference IS NOT NULL
     AND p_theme_preference NOT IN ('system', 'dark', 'light') THEN
    RAISE EXCEPTION 'Invalid theme preference';
  END IF;

  UPDATE public.workspace_members wm
  SET
    theme_preference = coalesce(p_theme_preference, wm.theme_preference),
    compact_density = coalesce(p_compact_density, wm.compact_density)
  WHERE wm.user_id = v_user_id
    AND wm.role::text LIKE 'pt_%';

  RETURN QUERY
  SELECT wm.theme_preference, wm.compact_density
  FROM public.workspace_members wm
  WHERE wm.user_id = v_user_id
    AND wm.role::text LIKE 'pt_%'
  ORDER BY wm.role
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_appearance_preferences(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_my_appearance_preferences(text, boolean) TO authenticated;

-- Ensure updated_at exists on trigger-target tables
ALTER TABLE IF EXISTS public.workspaces
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS public.pt_profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS public.workspace_members
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure appearance preference columns exist for app queries
ALTER TABLE IF EXISTS public.workspace_members
  ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'system';

ALTER TABLE IF EXISTS public.workspace_members
  ADD COLUMN IF NOT EXISTS compact_density boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF to_regclass('public.workspace_members') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'workspace_members_theme_preference_check'
         AND conrelid = 'public.workspace_members'::regclass
     ) THEN
    ALTER TABLE public.workspace_members
      ADD CONSTRAINT workspace_members_theme_preference_check
      CHECK (theme_preference IN ('system', 'dark', 'light'));
  END IF;
END
$$;

-- Ensure updated_at triggers are present (safe/idempotent)
DO $$
BEGIN
  IF to_regclass('public.workspaces') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_workspaces_updated_at') THEN
    CREATE TRIGGER set_workspaces_updated_at
    BEFORE UPDATE ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF to_regclass('public.clients') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_clients_updated_at') THEN
    CREATE TRIGGER set_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF to_regclass('public.pt_profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_pt_profiles_updated_at') THEN
    CREATE TRIGGER set_pt_profiles_updated_at
    BEFORE UPDATE ON public.pt_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF to_regclass('public.workspace_members') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_workspace_members_updated_at') THEN
    CREATE TRIGGER set_workspace_members_updated_at
    BEFORE UPDATE ON public.workspace_members
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;
