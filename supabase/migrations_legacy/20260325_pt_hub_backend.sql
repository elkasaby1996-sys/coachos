-- PT Hub backend contract
-- - dedicated business-layer profile/settings tables
-- - RLS for self-service trainer access
-- - legacy display_name sync to existing pt_profiles rows

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

CREATE TABLE IF NOT EXISTS public.pt_hub_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text,
  display_name text,
  headline text,
  short_bio text,
  specialties text[] NOT NULL DEFAULT '{}'::text[],
  certifications text[] NOT NULL DEFAULT '{}'::text[],
  coaching_style text,
  profile_photo_url text,
  banner_image_url text,
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pt_hub_profiles_user_id_uidx
  ON public.pt_hub_profiles (user_id);

CREATE TABLE IF NOT EXISTS public.pt_hub_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_email text,
  support_email text,
  phone text,
  timezone text,
  city text,
  client_alerts boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT true,
  product_updates boolean NOT NULL DEFAULT false,
  profile_visibility text NOT NULL DEFAULT 'draft',
  subscription_plan text,
  subscription_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pt_hub_settings_user_id_uidx
  ON public.pt_hub_settings (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pt_hub_settings_profile_visibility_check'
      AND conrelid = 'public.pt_hub_settings'::regclass
  ) THEN
    ALTER TABLE public.pt_hub_settings
      ADD CONSTRAINT pt_hub_settings_profile_visibility_check
      CHECK (profile_visibility IN ('draft', 'private', 'listed'));
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.pt_profiles') IS NOT NULL THEN
    INSERT INTO public.pt_hub_profiles (
      user_id,
      display_name,
      created_at,
      updated_at
    )
    SELECT DISTINCT ON (pp.user_id)
      pp.user_id,
      NULLIF(trim(pp.display_name), ''),
      COALESCE(pp.created_at, now()),
      COALESCE(pp.updated_at, pp.created_at, now())
    FROM public.pt_profiles pp
    WHERE pp.user_id IS NOT NULL
    ORDER BY
      pp.user_id,
      pp.updated_at DESC NULLS LAST,
      pp.created_at DESC NULLS LAST
    ON CONFLICT (user_id) DO UPDATE
    SET display_name = COALESCE(public.pt_hub_profiles.display_name, EXCLUDED.display_name);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_pt_hub_profiles_updated_at'
  ) THEN
    CREATE TRIGGER set_pt_hub_profiles_updated_at
    BEFORE UPDATE ON public.pt_hub_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_pt_hub_settings_updated_at'
  ) THEN
    CREATE TRIGGER set_pt_hub_settings_updated_at
    BEFORE UPDATE ON public.pt_hub_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_pt_hub_display_name_to_pt_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  UPDATE public.pt_profiles
  SET
    display_name = NEW.display_name,
    updated_at = now()
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sync_pt_hub_display_name_to_pt_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_pt_hub_display_name_to_pt_profiles() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sync_pt_hub_display_name_to_pt_profiles'
  ) THEN
    CREATE TRIGGER sync_pt_hub_display_name_to_pt_profiles
    AFTER INSERT OR UPDATE OF display_name ON public.pt_hub_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_pt_hub_display_name_to_pt_profiles();
  END IF;
END
$$;

ALTER TABLE public.pt_hub_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_hub_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pt_hub_profiles_select_own" ON public.pt_hub_profiles;
CREATE POLICY "pt_hub_profiles_select_own"
  ON public.pt_hub_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "pt_hub_profiles_insert_own" ON public.pt_hub_profiles;
CREATE POLICY "pt_hub_profiles_insert_own"
  ON public.pt_hub_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "pt_hub_profiles_update_own" ON public.pt_hub_profiles;
CREATE POLICY "pt_hub_profiles_update_own"
  ON public.pt_hub_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "pt_hub_settings_select_own" ON public.pt_hub_settings;
CREATE POLICY "pt_hub_settings_select_own"
  ON public.pt_hub_settings
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "pt_hub_settings_insert_own" ON public.pt_hub_settings;
CREATE POLICY "pt_hub_settings_insert_own"
  ON public.pt_hub_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "pt_hub_settings_update_own" ON public.pt_hub_settings;
CREATE POLICY "pt_hub_settings_update_own"
  ON public.pt_hub_settings
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

REVOKE ALL ON TABLE public.pt_hub_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.pt_hub_settings FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON TABLE public.pt_hub_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pt_hub_settings TO authenticated;
