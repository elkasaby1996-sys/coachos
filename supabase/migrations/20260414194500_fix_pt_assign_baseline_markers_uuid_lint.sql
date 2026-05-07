create or replace function public.pt_assign_baseline_markers(
  p_client_id uuid,
  p_template_ids uuid[] default '{}'::uuid[]
)
returns table(
  onboarding_id uuid,
  baseline_id uuid,
  assigned_marker_count integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_workspace_id uuid;
  v_client_workspace_id uuid;
  v_onboarding public.workspace_client_onboardings;
  v_draft public.baseline_entries;
  v_now timestamptz := now();
  v_pt_workspace_count integer := 0;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select c.workspace_id
  into v_client_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if not found then
    raise exception 'Client not found';
  end if;

  select wco.*
  into v_onboarding
  from public.workspace_client_onboardings wco
  join public.workspace_members wm
    on wm.workspace_id = wco.workspace_id
  where wco.client_id = p_client_id
    and wm.user_id = auth.uid()
    and wm.role::text like 'pt_%'
  order by
    case
      when v_client_workspace_id is not null
       and wco.workspace_id = v_client_workspace_id then 0
      else 1
    end,
    wco.updated_at desc
  limit 1;

  if v_onboarding.id is not null then
    v_workspace_id := v_onboarding.workspace_id;
  elsif v_client_workspace_id is not null
    and public.is_pt_workspace_member(v_client_workspace_id) then
    v_workspace_id := v_client_workspace_id;
  else
    select count(*)
    into v_pt_workspace_count
    from public.workspace_members wm
    where wm.user_id = auth.uid()
      and wm.role::text like 'pt_%';

    if v_pt_workspace_count <> 1 then
      raise exception 'Client not found in this workspace.';
    end if;

    select wm.workspace_id
    into v_workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
    limit 1;
  end if;

  if v_workspace_id is null then
    raise exception 'Client not found in this workspace.';
  end if;

  if not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Not authorized';
  end if;

  if v_client_workspace_id is not null
    and v_client_workspace_id <> v_workspace_id
    and v_onboarding.id is null then
    raise exception 'Client not found in this workspace.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_template_ids, '{}'::uuid[])) as selected_ids(template_id)
    left join public.baseline_marker_templates bmt
      on bmt.id = selected_ids.template_id
     and bmt.workspace_id = v_workspace_id
    where bmt.id is null
  ) then
    raise exception 'One or more performance markers were not found in this workspace.';
  end if;

  if v_onboarding.id is null then
    select *
    into v_onboarding
    from public.workspace_client_onboardings wco
    where wco.workspace_id = v_workspace_id
      and wco.client_id = p_client_id
    limit 1;
  end if;

  if v_onboarding.id is null then
    insert into public.workspace_client_onboardings (
      workspace_id,
      client_id,
      source,
      status
    )
    values (
      v_workspace_id,
      p_client_id,
      'direct_invite',
      'invited'
    )
    returning *
    into v_onboarding;
  end if;

  if v_onboarding.initial_baseline_entry_id is not null then
    select *
    into v_draft
    from public.baseline_entries be
    where be.id = v_onboarding.initial_baseline_entry_id
      and be.client_id = p_client_id
      and be.status = 'draft'
    limit 1;
  end if;

  if v_draft.id is null then
    select *
    into v_draft
    from public.baseline_entries be
    where be.client_id = p_client_id
      and be.workspace_id = v_workspace_id
      and be.status = 'draft'
    order by be.created_at desc
    limit 1;
  end if;

  if v_draft.id is null then
    insert into public.baseline_entries (
      client_id,
      workspace_id,
      status,
      created_at
    )
    values (
      p_client_id,
      v_workspace_id,
      'draft',
      v_now
    )
    returning *
    into v_draft;
  end if;

  update public.workspace_client_onboardings
  set
    initial_baseline_entry_id = v_draft.id,
    status = case
      when status = 'invited' then 'in_progress'::public.onboarding_status
      else status
    end,
    started_at = coalesce(started_at, v_now),
    last_saved_at = v_now,
    updated_at = v_now
  where id = v_onboarding.id
  returning *
  into v_onboarding;

  delete from public.baseline_entry_marker_templates bet
  where bet.baseline_id = v_draft.id
    and not (bet.template_id = any(coalesce(p_template_ids, '{}'::uuid[])));

  insert into public.baseline_entry_marker_templates (baseline_id, template_id)
  select
    v_draft.id,
    selected_ids.template_id
  from unnest(coalesce(p_template_ids, '{}'::uuid[])) as selected_ids(template_id)
  on conflict on constraint baseline_entry_marker_templates_pkey do nothing;

  onboarding_id := v_onboarding.id;
  baseline_id := v_draft.id;
  assigned_marker_count := coalesce(array_length(coalesce(p_template_ids, '{}'::uuid[]), 1), 0);
  return next;
end;
$$;
