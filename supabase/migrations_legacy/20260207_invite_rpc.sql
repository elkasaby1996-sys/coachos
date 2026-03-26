-- Secure invite lookup + consume RPC for join flow

CREATE OR REPLACE FUNCTION public.get_invite_by_code(p_code text)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  role text,
  code text,
  expires_at timestamptz,
  max_uses int,
  uses int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
  SELECT i.id, i.workspace_id, i.role::text, i.code, i.expires_at, i.max_uses, i.uses
  FROM public.invites i
  WHERE i.code = p_code
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.consume_invite(p_code text)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  role text,
  code text,
  expires_at timestamptz,
  max_uses int,
  uses int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
BEGIN
  RETURN QUERY
  UPDATE public.invites i
  SET uses = COALESCE(i.uses, 0) + 1
  WHERE i.code = p_code
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (i.max_uses IS NULL OR COALESCE(i.uses, 0) < i.max_uses)
  RETURNING i.id, i.workspace_id, i.role::text, i.code, i.expires_at, i.max_uses, i.uses;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_invite_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invite(text) TO authenticated;
