create or replace function public.preview_workspace_team_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_token_hash text;
  v_invite public.workspace_member_invites%rowtype;
  v_workspace_name text;
  v_status text;
  v_has_client_identity boolean := false;
  v_has_pt_identity boolean := false;
begin
  if v_user_id is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  if nullif(trim(coalesce(p_token, '')), '') is null then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  select lower(email)
  into v_user_email
  from auth.users
  where id = v_user_id;

  if v_user_email is null then
    perform public.workspace_team_invite_error('UNAUTHENTICATED');
  end if;

  v_token_hash := public.hash_workspace_team_invite_token(p_token);

  select *
  into v_invite
  from public.workspace_member_invites wmi
  where wmi.token_hash = v_token_hash
  limit 1;

  if not found then
    perform public.workspace_team_invite_error('INVITE_NOT_FOUND');
  end if;

  if lower(v_invite.email) <> v_user_email then
    perform public.workspace_team_invite_error('INVITE_EMAIL_MISMATCH');
  end if;

  select exists (
    select 1
    from public.clients c
    where c.user_id = v_user_id
  )
  into v_has_client_identity;

  select exists (
    select 1
    from public.pt_profiles pp
    where pp.user_id = v_user_id
  ) or exists (
    select 1
    from public.pt_hub_profiles php
    where php.user_id = v_user_id
  ) or exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = v_user_id
      and wm.status <> 'removed'
  )
  into v_has_pt_identity;

  if v_has_client_identity and not v_has_pt_identity then
    perform public.workspace_team_invite_error('WORKSPACE_PERMISSION_DENIED');
  end if;

  select w.name
  into v_workspace_name
  from public.workspaces w
  where w.id = v_invite.workspace_id;

  v_status := case
    when v_invite.status = 'pending' and v_invite.expires_at <= now() then 'expired'
    else v_invite.status
  end;

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'workspaceId', v_invite.workspace_id,
    'workspaceName', v_workspace_name,
    'invitedEmail', v_invite.email,
    'role', v_invite.role,
    'clientAccessMode', v_invite.client_access_mode,
    'status', v_status,
    'expiresAt', v_invite.expires_at,
    'requiresAuth', true
  );
end;
$$;

revoke all on function public.preview_workspace_team_invite(text) from public, anon;
grant execute on function public.preview_workspace_team_invite(text) to authenticated;
