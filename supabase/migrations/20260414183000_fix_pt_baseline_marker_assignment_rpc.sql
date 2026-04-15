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
  v_onboarding public.workspace_client_onboardings;
  v_draft public.baseline_entries;
  v_now timestamptz := now();
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Not authorized';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_template_ids, '{}'::uuid[])) as template_id
    left join public.baseline_marker_templates bmt
      on bmt.id = template_id
     and bmt.workspace_id = v_workspace_id
    where bmt.id is null
  ) then
    raise exception 'One or more performance markers were not found in this workspace.';
  end if;

  v_onboarding := public.ensure_workspace_client_onboarding(
    p_client_id,
    'direct_invite'
  );

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
    started_at = coalesce(started_at, v_now)
  where id = v_onboarding.id
  returning *
  into v_onboarding;

  delete from public.baseline_entry_marker_templates bet
  where bet.baseline_id = v_draft.id
    and not (bet.template_id = any(coalesce(p_template_ids, '{}'::uuid[])));

  insert into public.baseline_entry_marker_templates (baseline_id, template_id)
  select
    v_draft.id,
    marker_template_id
  from unnest(coalesce(p_template_ids, '{}'::uuid[])) as selected_ids(marker_template_id)
  on conflict on constraint baseline_entry_marker_templates_pkey do nothing;

  onboarding_id := v_onboarding.id;
  baseline_id := v_draft.id;
  assigned_marker_count := coalesce(array_length(coalesce(p_template_ids, '{}'::uuid[]), 1), 0);
  return next;
end;
$$;

revoke all on function public.pt_assign_baseline_markers(uuid, uuid[]) from public;
grant all on function public.pt_assign_baseline_markers(uuid, uuid[]) to authenticated;
grant all on function public.pt_assign_baseline_markers(uuid, uuid[]) to service_role;
