-- PR-05.5F: Preserve universal client onboarding/intake answers across explicit
-- workspace transfer without copying workspace delivery or coach review state.
-- During beta the intake answer JSON lives on workspace_client_onboardings, so
-- transfer seeds the target workspace row with only client-authored universal
-- sections. The row itself remains scoped to the target workspace/client pair.

create or replace function public.copy_client_universal_onboarding_data(
  p_source_client_id uuid,
  p_target_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_client public.clients%rowtype;
  v_target_client public.clients%rowtype;
  source_onboarding public.workspace_client_onboardings%rowtype;
  v_target_status public.onboarding_status := 'invited';
  v_target_initial_baseline_id uuid := null;
begin
  if p_source_client_id is null or p_target_client_id is null then
    return;
  end if;

  select *
  into v_source_client
  from public.clients
  where id = p_source_client_id;

  select *
  into v_target_client
  from public.clients
  where id = p_target_client_id;

  if v_source_client.id is null
     or v_target_client.id is null
     or v_source_client.user_id is null
     or v_target_client.user_id is null
     or v_source_client.user_id <> v_target_client.user_id
     or v_target_client.workspace_id is null then
    return;
  end if;

  select *
  into source_onboarding
  from public.workspace_client_onboardings wco
  where wco.client_id = p_source_client_id
    and (
      wco.basics <> '{}'::jsonb
      or wco.goals <> '{}'::jsonb
      or wco.training_history <> '{}'::jsonb
      or wco.injuries_limitations <> '{}'::jsonb
      or wco.nutrition_lifestyle <> '{}'::jsonb
      or wco.step_state <> '{}'::jsonb
      or wco.submitted_at is not null
    )
  order by
    case
      when wco.submitted_at is not null then 0
      when wco.status in ('review_needed', 'submitted', 'partially_activated', 'completed') then 1
      when wco.status = 'in_progress' then 2
      else 3
    end,
    wco.last_saved_at desc nulls last,
    wco.updated_at desc nulls last,
    wco.created_at desc
  limit 1;

  if source_onboarding.id is null then
    return;
  end if;

  v_target_status :=
    case
      when source_onboarding.submitted_at is not null
        or source_onboarding.status in (
          'review_needed',
          'submitted',
          'partially_activated',
          'completed'
        )
        then 'review_needed'::public.onboarding_status
      when source_onboarding.status = 'in_progress'
        then 'in_progress'::public.onboarding_status
      else 'invited'::public.onboarding_status
    end;

  if source_onboarding.initial_baseline_entry_id is not null then
    select target_baseline.id
    into v_target_initial_baseline_id
    from public.baseline_entries source_baseline
    join public.baseline_entries target_baseline
      on target_baseline.client_id = p_target_client_id
     and (
       target_baseline.id = coalesce(
         source_baseline.universal_source_baseline_id,
         source_baseline.id
       )
       or target_baseline.universal_source_baseline_id = coalesce(
         source_baseline.universal_source_baseline_id,
         source_baseline.id
       )
     )
    where source_baseline.id = source_onboarding.initial_baseline_entry_id
    order by target_baseline.created_at asc
    limit 1;
  end if;

  if v_target_initial_baseline_id is null then
    select be.id
    into v_target_initial_baseline_id
    from public.baseline_entries be
    where be.client_id = p_target_client_id
      and be.status = 'submitted'
    order by coalesce(be.submitted_at, be.created_at) desc
    limit 1;
  end if;

  insert into public.workspace_client_onboardings (
    workspace_id,
    client_id,
    source,
    status,
    basics,
    goals,
    training_history,
    injuries_limitations,
    nutrition_lifestyle,
    step_state,
    initial_baseline_entry_id,
    started_at,
    last_saved_at,
    submitted_at
  )
  values (
    v_target_client.workspace_id,
    p_target_client_id,
    'direct_invite',
    v_target_status,
    coalesce(nullif(source_onboarding.basics, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(source_onboarding.goals, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(source_onboarding.training_history, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(source_onboarding.injuries_limitations, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(source_onboarding.nutrition_lifestyle, '{}'::jsonb), '{}'::jsonb),
    coalesce(nullif(source_onboarding.step_state, '{}'::jsonb), '{}'::jsonb),
    v_target_initial_baseline_id,
    coalesce(source_onboarding.started_at, now()),
    coalesce(source_onboarding.last_saved_at, source_onboarding.updated_at, now()),
    source_onboarding.submitted_at
  )
  on conflict (workspace_id, client_id) do update
    set
      basics = case
        when excluded.basics <> '{}'::jsonb then excluded.basics
        else workspace_client_onboardings.basics
      end,
      goals = case
        when excluded.goals <> '{}'::jsonb then excluded.goals
        else workspace_client_onboardings.goals
      end,
      training_history = case
        when excluded.training_history <> '{}'::jsonb then excluded.training_history
        else workspace_client_onboardings.training_history
      end,
      injuries_limitations = case
        when excluded.injuries_limitations <> '{}'::jsonb then excluded.injuries_limitations
        else workspace_client_onboardings.injuries_limitations
      end,
      nutrition_lifestyle = case
        when excluded.nutrition_lifestyle <> '{}'::jsonb then excluded.nutrition_lifestyle
        else workspace_client_onboardings.nutrition_lifestyle
      end,
      step_state = case
        when excluded.step_state <> '{}'::jsonb then excluded.step_state
        else workspace_client_onboardings.step_state
      end,
      initial_baseline_entry_id = coalesce(
        workspace_client_onboardings.initial_baseline_entry_id,
        excluded.initial_baseline_entry_id
      ),
      status = case
        when workspace_client_onboardings.status in (
          'review_needed',
          'submitted',
          'partially_activated',
          'completed'
        ) then workspace_client_onboardings.status
        when excluded.status in ('review_needed', 'submitted', 'partially_activated', 'completed')
          then excluded.status
        when workspace_client_onboardings.status = 'in_progress'
          then workspace_client_onboardings.status
        else excluded.status
      end,
      started_at = coalesce(
        workspace_client_onboardings.started_at,
        excluded.started_at
      ),
      submitted_at = coalesce(
        workspace_client_onboardings.submitted_at,
        excluded.submitted_at
      ),
      last_saved_at = greatest(
        workspace_client_onboardings.last_saved_at,
        excluded.last_saved_at
      );
end;
$$;

create or replace function public.pt_transfer_client_relationship(
  p_source_client_id uuid,
  p_target_workspace_id uuid
)
returns table (
  source_client_id uuid,
  target_client_id uuid,
  source_workspace_id uuid,
  target_workspace_id uuid,
  target_client_url_key text,
  target_workspace_slug text
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
  v_target_client_url_key text;
  v_target_workspace_slug text;
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

  select w.slug
  into v_target_workspace_slug
  from public.workspaces w
  where w.id = p_target_workspace_id;

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
    url_key = coalesce(
      nullif(btrim(c.url_key), ''),
      'c-' || lower(substr(replace(v_target_client_id::text, '-', ''), 1, 8))
    ),
    updated_at = now()
  where c.id = v_target_client_id
    returning c.url_key into v_target_client_url_key;

  update public.clients c
  set
    relationship_status = 'transferred_out',
    removed_at = coalesce(c.removed_at, now()),
    removed_by_user_id = coalesce(c.removed_by_user_id, v_actor_user_id),
    updated_at = now()
  where c.id = v_source.id;

  perform public.sync_client_account_profile_fields(v_target_client_id);
  perform public.copy_client_universal_baseline_data(v_source.id, v_target_client_id);
  perform public.copy_client_universal_onboarding_data(v_source.id, v_target_client_id);

  return query
  select
    v_source.id,
    v_target_client_id,
    v_source.workspace_id,
    p_target_workspace_id,
    v_target_client_url_key,
    v_target_workspace_slug;
end;
$$;

revoke all on function public.copy_client_universal_onboarding_data(uuid, uuid)
  from public, anon;
grant execute on function public.copy_client_universal_onboarding_data(uuid, uuid)
  to service_role;

revoke all on function public.pt_transfer_client_relationship(uuid, uuid)
  from public, anon;
grant execute on function public.pt_transfer_client_relationship(uuid, uuid)
  to authenticated, service_role;
