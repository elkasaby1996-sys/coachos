-- Recreate view without SECURITY DEFINER
DROP VIEW IF EXISTS public.v_workspace_pt_members;

CREATE VIEW public.v_workspace_pt_members AS
SELECT
  wm.workspace_id,
  wm.user_id,
  wm.role
FROM public.workspace_members wm;
