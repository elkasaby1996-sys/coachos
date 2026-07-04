-- PR-05.4: Same-workspace re-add should reactivate a removed relationship
-- instead of creating a duplicate client row. transferred_out remains reserved
-- for the explicit transfer flow.

create or replace function public.reactivate_removed_client_relationship(
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_relationship_status text;
begin
  if p_client_id is null then
    raise exception 'Client relationship is required';
  end if;

  select c.relationship_status
  into v_relationship_status
  from public.clients c
  where c.id = p_client_id
  for update;

  if not found then
    raise exception 'Client relationship not found';
  end if;

  if coalesce(v_relationship_status, 'active') = 'transferred_out' then
    raise exception
      using
        errcode = 'P0001',
        message = 'Transferred client relationships require the transfer flow',
        detail = 'CLIENT_RELATIONSHIP_TRANSFERRED_OUT',
        hint = 'Use the dedicated transfer flow to reactivate a transferred client relationship.';
  end if;

  update public.clients c
  set
    relationship_status = 'active',
    removed_at = null,
    removed_by_user_id = null,
    updated_at = now()
  where c.id = p_client_id
    and coalesce(c.relationship_status, 'active') <> 'active';

  return p_client_id;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_invite public.invites%rowtype;
  v_client_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select i.*
  into v_invite
  from public.invites i
  where i.token = p_token
     or i.code = p_token
  order by i.created_at desc
  limit 1
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if v_invite.role is distinct from 'client' then
    raise exception 'Invite role not supported';
  end if;

  if v_invite.used_at is not null then
    raise exception 'Invite already used';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_invite.max_uses is not null and coalesce(v_invite.uses, 0) >= v_invite.max_uses then
    raise exception 'Invite max uses reached';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_invite.workspace_id
    and c.user_id = v_user_id
  limit 1
  for update;

  if v_client_id is not null then
    perform public.reactivate_removed_client_relationship(v_client_id);
  end if;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = v_user_id
    limit 1
    for update;
  end if;

  if v_client_id is null then
    insert into public.clients (
      workspace_id,
      user_id,
      status,
      relationship_status,
      display_name
    )
    values (v_invite.workspace_id, v_user_id, 'active', 'active', null)
    returning id into v_client_id;
  else
    update public.clients c
    set
      workspace_id = v_invite.workspace_id,
      status = 'active',
      user_id = v_user_id,
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null
    where c.id = v_client_id
      and coalesce(c.relationship_status, 'active') <> 'transferred_out'
    returning id into v_client_id;
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set
    used_at = now(),
    uses = coalesce(uses, 0) + 1
  where id = v_invite.id;

  workspace_id := v_invite.workspace_id;
  client_id := v_client_id;
  return next;
end;
$$;

create or replace function public.accept_invite(
  p_code text,
  p_display_name text default null
)
returns table(workspace_id uuid, client_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $$
declare
  v_inv public.invites%rowtype;
  v_client_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite';
  end if;

  select *
  into v_inv
  from public.invites
  where code = p_code
  for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Invite expired';
  end if;

  if v_inv.uses >= v_inv.max_uses then
    raise exception 'Invite already used';
  end if;

  select c.id
  into v_client_id
  from public.clients c
  where c.workspace_id = v_inv.workspace_id
    and c.user_id = auth.uid()
  limit 1
  for update;

  if v_client_id is not null then
    perform public.reactivate_removed_client_relationship(v_client_id);
  end if;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where c.workspace_id is null
      and c.user_id = auth.uid()
    limit 1
    for update;
  end if;

  if v_client_id is null then
    v_name := coalesce(
      nullif(trim(p_display_name), ''),
      split_part((auth.jwt() ->> 'email'), '@', 1),
      'Client'
    );

    insert into public.clients (
      workspace_id,
      user_id,
      display_name,
      full_name,
      status,
      relationship_status
    )
    values (v_inv.workspace_id, auth.uid(), v_name, v_name, 'active', 'active')
    returning id into v_client_id;
  else
    update public.clients
    set
      workspace_id = v_inv.workspace_id,
      status = 'active',
      relationship_status = 'active',
      removed_at = null,
      removed_by_user_id = null,
      display_name = coalesce(display_name, nullif(trim(p_display_name), '')),
      full_name = coalesce(full_name, nullif(trim(p_display_name), ''))
    where id = v_client_id
      and coalesce(relationship_status, 'active') <> 'transferred_out';
  end if;

  perform public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');

  update public.invites
  set uses = uses + 1
  where id = v_inv.id;

  return query select v_inv.workspace_id, v_client_id;
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

    if v_transfer_requested then
      raise exception
        using
          errcode = 'P0001',
          message = 'Lead transfer is disabled during beta',
          detail = 'LEAD_TRANSFER_DISABLED_FOR_BETA',
          hint = 'Client history and assignments must be preserved. Re-add or transfer continuity will be handled by a dedicated flow.';
    end if;
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

    if v_was_converted
       and v_lead.converted_client_id is not null
       and v_lead.converted_client_id <> v_target_client_id then
      begin
        update public.clients c
        set workspace_id = null
        where c.id = v_lead.converted_client_id
          and c.user_id = v_lead.applicant_user_id;
      exception
        when unique_violation then
          raise exception
            using
              errcode = 'P0001',
              message = 'Client relationship cannot be reassigned safely',
              detail = 'CLIENT_CONTINUITY_REASSIGNMENT_CONFLICT',
              hint = 'Existing client history must be preserved. Use a dedicated reactivation or transfer flow.';
      end;
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

revoke all on function public.reactivate_removed_client_relationship(uuid) from public, anon;
grant execute on function public.reactivate_removed_client_relationship(uuid) to authenticated, service_role;
grant execute on function public.accept_invite(text) to anon, authenticated, service_role;
grant execute on function public.accept_invite(text, text) to anon, authenticated, service_role;
revoke all on function public.pt_hub_approve_lead(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.pt_hub_approve_lead(uuid, uuid, text, boolean) to authenticated, service_role;
