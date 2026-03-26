-- Fix PT onboarding workspace creation failure:
-- 42P10 "no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Root cause:
-- - create_workspace() used `ON CONFLICT (user_id, workspace_id)` on pt_profiles.
-- - some drifted databases relied on a unique index that was later dropped.
--
-- This migration:
-- 1) deduplicates pt_profiles by (user_id, workspace_id),
-- 2) restores a unique index on (user_id, workspace_id),
-- 3) makes create_workspace() avoid ON CONFLICT for pt_profiles.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, workspace_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.pt_profiles
  WHERE user_id IS NOT NULL
    AND workspace_id IS NOT NULL
)
DELETE FROM public.pt_profiles p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pt_profiles_user_workspace_uidx
  ON public.pt_profiles (user_id, workspace_id);

CREATE OR REPLACE FUNCTION public.create_workspace(p_name text)
RETURNS TABLE (
  workspace_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_variable
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text;
  v_member_id uuid;
  v_profile_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_name := nullif(trim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Workspace name is required';
  END IF;

  INSERT INTO public.workspaces (name, owner_user_id)
  VALUES (v_name, v_user_id)
  RETURNING id INTO v_workspace_id;

  SELECT wm.id
  INTO v_member_id
  FROM public.workspace_members wm
  WHERE wm.workspace_id = v_workspace_id
    AND wm.user_id = v_user_id
  LIMIT 1
  FOR UPDATE;

  IF v_member_id IS NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace_id, v_user_id, 'pt_owner');
  ELSE
    UPDATE public.workspace_members wm
    SET role = 'pt_owner'
    WHERE wm.id = v_member_id;
  END IF;

  SELECT pp.id
  INTO v_profile_id
  FROM public.pt_profiles pp
  WHERE pp.user_id = v_user_id
    AND pp.workspace_id = v_workspace_id
  LIMIT 1
  FOR UPDATE;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.pt_profiles (user_id, workspace_id)
    VALUES (v_user_id, v_workspace_id);
  END IF;

  workspace_id := v_workspace_id;
  RETURN NEXT;
END;
$$;
