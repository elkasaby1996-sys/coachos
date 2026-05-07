create or replace function public.pt_hub_approve_lead(
  p_lead_id uuid,
  p_workspace_id uuid default null,
  p_workspace_name text default null
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

    if v_target_client_id is null and v_lead.converted_client_id is not null then
      select c.id
      into v_target_client_id
      from public.clients c
      where c.id = v_lead.converted_client_id
        and c.user_id = v_lead.applicant_user_id
      limit 1
      for update;
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
    end if;

    if v_target_client_id is null then
      insert into public.clients (
        workspace_id,
        user_id,
        status,
        display_name,
        full_name,
        email,
        phone
      )
      values (
        v_target_workspace_id,
        v_lead.applicant_user_id,
        'active',
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
      where c.id = v_target_client_id;
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
