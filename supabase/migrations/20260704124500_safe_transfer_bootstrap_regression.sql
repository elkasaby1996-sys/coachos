-- PR-05.5B: Fix safe transfer bootstrap regression and transfer-back.
-- Explicit transfer may reactivate a transferred_out row when that row belongs
-- to the selected target workspace. Generic invite reactivation remains blocked
-- by reactivate_removed_client_relationship.

create or replace function public.pt_transfer_client_relationship(
  p_source_client_id uuid,
  p_target_workspace_id uuid
)
returns table (
  source_client_id uuid,
  target_client_id uuid,
  source_workspace_id uuid,
  target_workspace_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_source public.clients%rowtype;
  v_source_context record;
  v_target_context record;
  v_has_source_context boolean := false;
  v_has_target_context boolean := false;
  v_target_client_id uuid;
  v_target_relationship_status text;
begin
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_source_client_id is null then
    raise exception 'Source client relationship is required';
  end if;

  if p_target_workspace_id is null then
    raise exception 'Target workspace is required';
  end if;

  select c.*
  into v_source
  from public.clients c
  where c.id = p_source_client_id
  for update;

  if not found or v_source.workspace_id is null then
    raise exception 'Source client relationship not found';
  end if;

  if v_source.workspace_id = p_target_workspace_id then
    raise exception
      using
        errcode = 'P0001',
        message = 'Source and target workspaces must be different',
        detail = 'CLIENT_TRANSFER_SAME_WORKSPACE';
  end if;

  if coalesce(v_source.relationship_status, 'active') <> 'active' then
    raise exception
      using
        errcode = 'P0001',
        message = 'Only active client relationships can be transferred',
        detail = 'SOURCE_RELATIONSHIP_NOT_ACTIVE';
  end if;

  select *
  into v_source_context
  from public.workspace_access_context(v_source.workspace_id)
  limit 1;
  v_has_source_context := found;

  select *
  into v_target_context
  from public.workspace_access_context(p_target_workspace_id)
  limit 1;
  v_has_target_context := found;

  if not v_has_source_context
     or not v_has_target_context
     or v_source_context.role not in ('owner', 'admin')
     or v_target_context.role not in ('owner', 'admin') then
    raise exception
      using
        errcode = 'P0001',
        message = 'Not authorized to transfer this client relationship',
        detail = 'CLIENT_TRANSFER_PERMISSION_DENIED',
        hint = 'Transfer requires owner or admin access to both source and target workspaces.';
  end if;

  select c.id, c.relationship_status
  into v_target_client_id, v_target_relationship_status
  from public.clients c
  where c.workspace_id = p_target_workspace_id
    and c.user_id = v_source.user_id
  order by
    case coalesce(c.relationship_status, 'active')
      when 'active' then 0
      when 'removed' then 1
      when 'transferred_out' then 2
      else 3
    end,
    c.created_at asc
  limit 1
  for update;

  if v_target_client_id is null then
    insert into public.clients (
      workspace_id,
      user_id,
      status,
      relationship_status,
      lifecycle_state,
      lifecycle_changed_at,
      paused_reason,
      churn_reason,
      display_name,
      full_name,
      email,
      phone,
      account_onboarding_completed_at,
      avatar_url,
      photo_url
    )
    values (
      p_target_workspace_id,
      v_source.user_id,
      'active',
      'active',
      'active',
      now(),
      null,
      null,
      v_source.display_name,
      v_source.full_name,
      v_source.email,
      v_source.phone,
      v_source.account_onboarding_completed_at,
      v_source.avatar_url,
      v_source.photo_url
    )
    returning id into v_target_client_id;
  else
    if coalesce(v_target_relationship_status, 'active') = 'transferred_out' then
      -- Explicit transfer may reactivate the selected target relationship.
      null;
    elsif coalesce(v_target_relationship_status, 'active') = 'removed' then
      perform public.reactivate_removed_client_relationship(v_target_client_id);
    end if;

    update public.clients c
    set
      status = 'active',
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null,
      lifecycle_state = 'active',
      lifecycle_changed_at = now(),
      paused_reason = null,
      churn_reason = null,
      display_name = coalesce(c.display_name, v_source.display_name),
      full_name = coalesce(c.full_name, v_source.full_name),
      email = coalesce(c.email, v_source.email),
      phone = coalesce(c.phone, v_source.phone),
      account_onboarding_completed_at = coalesce(
        c.account_onboarding_completed_at,
        v_source.account_onboarding_completed_at
      ),
      avatar_url = coalesce(c.avatar_url, v_source.avatar_url),
      photo_url = coalesce(c.photo_url, v_source.photo_url),
      updated_at = now()
    where c.id = v_target_client_id;
  end if;

  update public.clients c
  set
    relationship_status = 'transferred_out',
    removed_at = coalesce(c.removed_at, now()),
    removed_by_user_id = coalesce(c.removed_by_user_id, v_actor_user_id),
    updated_at = now()
  where c.id = v_source.id;

  perform public.sync_client_account_profile_fields(v_target_client_id);

  return query
  select
    v_source.id,
    v_target_client_id,
    v_source.workspace_id,
    p_target_workspace_id;
end;
$$;

revoke all on function public.pt_transfer_client_relationship(uuid, uuid)
  from public, anon;
grant execute on function public.pt_transfer_client_relationship(uuid, uuid)
  to authenticated, service_role;
