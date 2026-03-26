-- PT Hub Phase 4: public publishing and marketplace foundations

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

CREATE OR REPLACE FUNCTION public.slugify_text(input_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT NULLIF(
    trim(
      both '-'
      from regexp_replace(
        lower(coalesce(input_text, '')),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    ),
    ''
  );
$fn$;

ALTER TABLE public.pt_hub_profiles
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS searchable_headline text,
  ADD COLUMN IF NOT EXISTS coaching_modes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS availability_modes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS location_label text,
  ADD COLUMN IF NOT EXISTS marketplace_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS testimonials jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transformations jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pt_hub_profiles_slug_format_check'
      AND conrelid = 'public.pt_hub_profiles'::regclass
  ) THEN
    ALTER TABLE public.pt_hub_profiles
      ADD CONSTRAINT pt_hub_profiles_slug_format_check
      CHECK (
        slug IS NULL
        OR btrim(slug) = ''
        OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pt_hub_profiles_coaching_modes_check'
      AND conrelid = 'public.pt_hub_profiles'::regclass
  ) THEN
    ALTER TABLE public.pt_hub_profiles
      ADD CONSTRAINT pt_hub_profiles_coaching_modes_check
      CHECK (
        coaching_modes <@ ARRAY[
          'one_on_one',
          'programming',
          'nutrition',
          'accountability'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pt_hub_profiles_availability_modes_check'
      AND conrelid = 'public.pt_hub_profiles'::regclass
  ) THEN
    ALTER TABLE public.pt_hub_profiles
      ADD CONSTRAINT pt_hub_profiles_availability_modes_check
      CHECK (
        availability_modes <@ ARRAY[
          'online',
          'in_person'
        ]::text[]
      );
  END IF;
END
$$;

UPDATE public.pt_hub_profiles
SET
  slug = COALESCE(
    slug,
    public.slugify_text(
      COALESCE(NULLIF(display_name, ''), NULLIF(full_name, ''))
    ) || '-' || left(replace(user_id::text, '-', ''), 6)
  ),
  searchable_headline = COALESCE(searchable_headline, headline)
WHERE
  slug IS NULL
  OR searchable_headline IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pt_hub_profiles_slug_uidx
  ON public.pt_hub_profiles (lower(slug))
  WHERE slug IS NOT NULL AND btrim(slug) <> '';

CREATE INDEX IF NOT EXISTS pt_hub_profiles_marketplace_idx
  ON public.pt_hub_profiles (is_published, marketplace_visible, published_at DESC);

CREATE INDEX IF NOT EXISTS pt_hub_profiles_specialties_gin_idx
  ON public.pt_hub_profiles USING gin (specialties);

CREATE INDEX IF NOT EXISTS pt_hub_profiles_coaching_modes_gin_idx
  ON public.pt_hub_profiles USING gin (coaching_modes);

ALTER TABLE public.pt_hub_leads
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_slug text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pt_hub_leads_source_check'
      AND conrelid = 'public.pt_hub_leads'::regclass
  ) THEN
    ALTER TABLE public.pt_hub_leads
      ADD CONSTRAINT pt_hub_leads_source_check
      CHECK (
        source IN (
          'manual',
          'public_profile',
          'marketplace'
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS pt_hub_leads_source_idx
  ON public.pt_hub_leads (user_id, source, submitted_at DESC);

CREATE OR REPLACE FUNCTION public.set_pt_profile_publication(p_publish boolean)
RETURNS TABLE (
  is_published boolean,
  published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.pt_hub_profiles%ROWTYPE;
  v_settings public.pt_hub_settings%ROWTYPE;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.pt_hub_profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PT Hub profile not found';
  END IF;

  SELECT *
  INTO v_settings
  FROM public.pt_hub_settings
  WHERE user_id = v_user_id;

  IF p_publish THEN
    IF coalesce(btrim(v_profile.slug), '') = '' THEN
      v_missing := array_append(v_missing, 'Public URL slug');
    END IF;

    IF coalesce(btrim(v_profile.display_name), '') = '' THEN
      v_missing := array_append(v_missing, 'Display name');
    END IF;

    IF coalesce(btrim(v_profile.headline), '') = '' THEN
      v_missing := array_append(v_missing, 'Headline');
    END IF;

    IF coalesce(btrim(v_profile.short_bio), '') = '' THEN
      v_missing := array_append(v_missing, 'Bio');
    END IF;

    IF coalesce(array_length(v_profile.specialties, 1), 0) = 0 THEN
      v_missing := array_append(v_missing, 'Specialties');
    END IF;

    IF coalesce(array_length(v_profile.certifications, 1), 0) = 0 THEN
      v_missing := array_append(v_missing, 'Certifications');
    END IF;

    IF coalesce(btrim(v_profile.coaching_style), '') = '' THEN
      v_missing := array_append(v_missing, 'Coaching style');
    END IF;

    IF coalesce(btrim(v_profile.profile_photo_url), '') = '' THEN
      v_missing := array_append(v_missing, 'Profile photo');
    END IF;

    IF coalesce(btrim(v_profile.banner_image_url), '') = '' THEN
      v_missing := array_append(v_missing, 'Banner image');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(v_profile.social_links, '[]'::jsonb)) AS item
      WHERE coalesce(btrim(item ->> 'url'), '') <> ''
    ) THEN
      v_missing := array_append(v_missing, 'At least one social link');
    END IF;

    IF coalesce(v_settings.profile_visibility, 'draft') <> 'listed' THEN
      v_missing := array_append(v_missing, 'Profile visibility must be set to Ready to list');
    END IF;

    IF coalesce(btrim(v_settings.contact_email), '') = ''
       AND coalesce(btrim(v_settings.support_email), '') = '' THEN
      v_missing := array_append(v_missing, 'Public contact path');
    END IF;

    IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
      RAISE EXCEPTION
        USING
          MESSAGE = 'Profile is not ready to publish',
          DETAIL = array_to_string(v_missing, ', ');
    END IF;

    UPDATE public.pt_hub_profiles
    SET
      is_published = true,
      published_at = COALESCE(published_at, now())
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.pt_hub_profiles
    SET
      is_published = false,
      published_at = NULL
    WHERE user_id = v_user_id;
  END IF;

  RETURN QUERY
  SELECT profile.is_published, profile.published_at
  FROM public.pt_hub_profiles profile
  WHERE profile.user_id = v_user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_pt_profile_publication(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_pt_profile_publication(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_pt_application(
  p_slug text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_goal_summary text,
  p_training_experience text,
  p_budget_interest text,
  p_package_interest text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_profile RECORD;
  v_lead_id uuid;
BEGIN
  SELECT
    profile.user_id,
    profile.slug
  INTO v_profile
  FROM public.pt_hub_profiles profile
  JOIN public.pt_hub_settings settings
    ON settings.user_id = profile.user_id
  WHERE lower(profile.slug) = lower(btrim(p_slug))
    AND profile.is_published = true
    AND settings.profile_visibility = 'listed'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published profile not found';
  END IF;

  IF coalesce(btrim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF coalesce(btrim(p_email), '') = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF coalesce(btrim(p_goal_summary), '') = '' THEN
    RAISE EXCEPTION 'Goal summary is required';
  END IF;

  INSERT INTO public.pt_hub_leads (
    user_id,
    full_name,
    email,
    phone,
    goal_summary,
    training_experience,
    budget_interest,
    package_interest,
    status,
    submitted_at,
    source,
    source_slug
  )
  VALUES (
    v_profile.user_id,
    btrim(p_full_name),
    lower(btrim(p_email)),
    NULLIF(btrim(coalesce(p_phone, '')), ''),
    btrim(p_goal_summary),
    NULLIF(btrim(coalesce(p_training_experience, '')), ''),
    NULLIF(btrim(coalesce(p_budget_interest, '')), ''),
    NULLIF(btrim(coalesce(p_package_interest, '')), ''),
    'new',
    now(),
    'public_profile',
    v_profile.slug
  )
  RETURNING id INTO v_lead_id;

  RETURN v_lead_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_public_pt_application(text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_pt_application(text, text, text, text, text, text, text, text) TO anon, authenticated;

DROP POLICY IF EXISTS "pt_hub_profiles_select_published" ON public.pt_hub_profiles;
CREATE POLICY "pt_hub_profiles_select_published"
  ON public.pt_hub_profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    is_published = true
    AND slug IS NOT NULL
    AND btrim(slug) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.pt_hub_settings settings
      WHERE settings.user_id = pt_hub_profiles.user_id
        AND settings.profile_visibility = 'listed'
    )
  );

GRANT SELECT ON TABLE public.pt_hub_profiles TO anon;
