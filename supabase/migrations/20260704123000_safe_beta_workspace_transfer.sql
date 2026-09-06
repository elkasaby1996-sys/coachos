-- PR-05.5: Safe beta workspace transfer.
-- Transfer is explicit and non-destructive: the source client relationship is
-- preserved as transferred_out, while the target workspace gets its own active
-- relationship for the same client account.

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

  if v_target_client_id is not null
     and coalesce(v_target_relationship_status, 'active') = 'transferred_out' then
    raise exception
      using
        errcode = 'P0001',
        message = 'Target workspace relationship is transferred out',
        detail = 'TARGET_RELATIONSHIP_TRANSFERRED_OUT',
        hint = 'Create a new explicit transfer path before reactivating transferred-out target relationships.';
  end if;

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
    if coalesce(v_target_relationship_status, 'active') = 'removed' then
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

create or replace function public.pt_hub_approve_lead(
  p_lead_id uuid,
  p_workspace_id uuid default null,
  p_workspace_name text default null,
  p_allow_transfer boolean default false
)
returns table(
  lead_id uuid,
  status text,
  workspace_id uuid,
  client_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid;
  v_lead public.pt_hub_leads%rowtype;
  v_target_workspace_id uuid;
  v_target_client_id uuid;
  v_workspace_name text;
  v_was_converted boolean := false;
  v_transfer_requested boolean := false;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_lead_id is null then
    raise exception 'Lead is required';
  end if;

  select *
  into v_lead
  from public.pt_hub_leads lead
  where lead.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  if v_lead.user_id <> v_actor_user_id then
    raise exception 'Not allowed to update this lead';
  end if;

  if v_lead.status = 'declined' then
    raise exception 'Declined leads cannot be approved';
  end if;

  v_workspace_name := nullif(btrim(coalesce(p_workspace_name, '')), '');
  v_was_converted :=
    v_lead.status = 'converted'
    and v_lead.converted_workspace_id is not null
    and v_lead.converted_client_id is not null;

  if v_was_converted then
    if p_workspace_id is null and v_workspace_name is null then
      return query
      select
        v_lead.id,
        'converted'::text,
        v_lead.converted_workspace_id,
        v_lead.converted_client_id;
      return;
    end if;

    if p_workspace_id is not null
       and p_workspace_id = v_lead.converted_workspace_id then
      return query
      select
        v_lead.id,
        'converted'::text,
        v_lead.converted_workspace_id,
        v_lead.converted_client_id;
      return;
    end if;

    v_transfer_requested :=
      (p_workspace_id is not null and p_workspace_id <> v_lead.converted_workspace_id)
      or v_workspace_name is not null;
  end if;

  if p_workspace_id is not null then
    select workspace.id
    into v_target_workspace_id
    from public.workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_user_id = v_actor_user_id
    limit 1;

    if v_target_workspace_id is null then
      raise exception 'Workspace not found';
    end if;
  elsif v_workspace_name is not null then
    insert into public.workspaces (name, owner_user_id)
    values (v_workspace_name, v_actor_user_id)
    returning id into v_target_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_target_workspace_id, v_actor_user_id, 'pt_owner')
    on conflict on constraint workspace_members_workspace_id_user_id_key
    do update
      set role = 'pt_owner';
  else
    update public.pt_hub_leads lead
    set
      status = 'approved_pending_workspace',
      converted_at = null,
      converted_workspace_id = null,
      converted_client_id = null
    where lead.id = v_lead.id;

    return query
    select v_lead.id, 'approved_pending_workspace'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_lead.applicant_user_id is null then
    update public.pt_hub_leads lead
    set
      status = 'approved_pending_workspace',
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = null
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'approved_pending_workspace'::text,
      v_target_workspace_id,
      null::uuid;
    return;
  end if;

  if v_transfer_requested then
    if not coalesce(p_allow_transfer, false) then
      raise exception
        using
          errcode = 'P0001',
          message = 'Lead transfer requires confirmation',
          detail = 'LEAD_TRANSFER_REQUIRES_CONFIRMATION',
          hint = 'Transfer keeps previous workspace history preserved and does not copy assignments automatically.';
    end if;

    select transferred.target_client_id into v_target_client_id
    from public.pt_transfer_client_relationship(
      v_lead.converted_client_id,
      v_target_workspace_id
    ) transferred;

    perform public.ensure_workspace_client_onboarding(
      v_target_client_id,
      'converted_lead'
    );

    update public.pt_hub_leads lead
    set
      status = 'converted',
      converted_at = coalesce(lead.converted_at, now()),
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = v_target_client_id
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'converted'::text,
      v_target_workspace_id,
      v_target_client_id;
    return;
  end if;

  begin
    select c.id
    into v_target_client_id
    from public.clients c
    where c.workspace_id = v_target_workspace_id
      and c.user_id = v_lead.applicant_user_id
    limit 1
    for update;

    if v_target_client_id is not null then
      perform public.reactivate_removed_client_relationship(v_target_client_id);
    end if;

    if v_target_client_id is null
       and v_lead.converted_client_id is not null then
      select c.id
      into v_target_client_id
      from public.clients c
      where c.id = v_lead.converted_client_id
        and c.user_id = v_lead.applicant_user_id
      limit 1
      for update;

      if v_target_client_id is not null then
        perform public.reactivate_removed_client_relationship(v_target_client_id);
      end if;
    end if;

    if v_target_client_id is null then
      select c.id
      into v_target_client_id
      from public.clients c
      where c.workspace_id is null
        and c.user_id = v_lead.applicant_user_id
      order by c.created_at asc
      limit 1
      for update;

      if v_target_client_id is not null then
        perform public.reactivate_removed_client_relationship(v_target_client_id);
      end if;
    end if;

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
        phone
      )
      values (
        v_target_workspace_id,
        v_lead.applicant_user_id,
        'active',
        'active',
        'active',
        now(),
        null,
        null,
        nullif(btrim(v_lead.full_name), ''),
        nullif(btrim(v_lead.full_name), ''),
        nullif(lower(btrim(coalesce(v_lead.email, ''))), ''),
        nullif(btrim(coalesce(v_lead.phone, '')), '')
      )
      returning id into v_target_client_id;
    else
      update public.clients c
      set
        workspace_id = v_target_workspace_id,
        status = 'active',
        relationship_status = 'active',
        removed_at = null,
        removed_by_user_id = null,
        lifecycle_state = 'active',
        lifecycle_changed_at = now(),
        paused_reason = null,
        churn_reason = null,
        display_name = coalesce(
          c.display_name,
          nullif(btrim(v_lead.full_name), '')
        ),
        full_name = coalesce(
          c.full_name,
          nullif(btrim(v_lead.full_name), '')
        ),
        email = coalesce(
          c.email,
          nullif(lower(btrim(coalesce(v_lead.email, ''))), '')
        ),
        phone = coalesce(
          c.phone,
          nullif(btrim(coalesce(v_lead.phone, '')), '')
        )
      where c.id = v_target_client_id
        and coalesce(c.relationship_status, 'active') <> 'transferred_out';
    end if;

    perform public.ensure_workspace_client_onboarding(
      v_target_client_id,
      'converted_lead'
    );

    update public.pt_hub_leads lead
    set
      status = 'converted',
      converted_at = coalesce(lead.converted_at, now()),
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = v_target_client_id
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'converted'::text,
      v_target_workspace_id,
      v_target_client_id;
    return;
  exception
    when others then
      perform public.log_lead_chat_event(
        v_lead.id,
        null,
        v_actor_user_id,
        'lead_workspace_assignment_failed',
        jsonb_build_object(
          'workspace_id', v_target_workspace_id,
          'error', sqlerrm
        )
      );

      if v_was_converted then
        return query
        select
          v_lead.id,
          'converted'::text,
          v_lead.converted_workspace_id,
          v_lead.converted_client_id;
        return;
      end if;

      update public.pt_hub_leads lead
      set
        status = 'approved_pending_workspace',
        converted_workspace_id = v_target_workspace_id,
        converted_client_id = null
      where lead.id = v_lead.id;

      return query
      select
        v_lead.id,
        'approved_pending_workspace'::text,
        v_target_workspace_id,
        null::uuid;
      return;
  end;
end;
$$;

revoke all on function public.pt_transfer_client_relationship(uuid, uuid)
  from public, anon;
grant execute on function public.pt_transfer_client_relationship(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.pt_hub_approve_lead(uuid, uuid, text, boolean)
  from public, anon;
grant execute on function public.pt_hub_approve_lead(uuid, uuid, text, boolean)
  to authenticated, service_role;
