-- PR-05.5E: Preserve universal baseline visibility across explicit workspace transfer.
-- Baseline tables are still client relationship keyed during beta, so explicit
-- transfer mirrors only universal baseline data to the active target row.

alter table public.baseline_entries
  add column if not exists universal_source_baseline_id uuid
    references public.baseline_entries(id) on delete set null;

create unique index if not exists baseline_entries_client_universal_source_uidx
  on public.baseline_entries(client_id, universal_source_baseline_id)
  where universal_source_baseline_id is not null;

create or replace function public.copy_client_universal_baseline_data(
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
  source_baseline public.baseline_entries%rowtype;
  v_canonical_baseline_id uuid;
  v_existing_target_baseline_id uuid;
  v_target_baseline_id uuid;
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

  for source_baseline in
    select be.*
    from public.baseline_entries be
    where be.client_id = p_source_client_id
    order by
      case when be.status = 'submitted' then 0 else 1 end,
      be.submitted_at desc nulls last,
      be.created_at desc
  loop
    v_canonical_baseline_id :=
      coalesce(source_baseline.universal_source_baseline_id, source_baseline.id);
    v_existing_target_baseline_id := null;
    v_target_baseline_id := null;

    select be.id
    into v_existing_target_baseline_id
    from public.baseline_entries be
    where be.client_id = p_target_client_id
      and (
        be.id = v_canonical_baseline_id
        or be.universal_source_baseline_id = v_canonical_baseline_id
      )
    order by
      case when be.id = v_canonical_baseline_id then 0 else 1 end,
      be.created_at asc
    limit 1;

    if v_existing_target_baseline_id is null
       and source_baseline.status = 'draft' then
      select be.id
      into v_existing_target_baseline_id
      from public.baseline_entries be
      where be.client_id = p_target_client_id
        and be.status = 'draft'
      order by be.created_at desc
      limit 1;
    end if;

    if v_existing_target_baseline_id is null then
      insert into public.baseline_entries (
        client_id,
        workspace_id,
        status,
        client_notes,
        coach_notes,
        submitted_at,
        created_at,
        updated_at,
        universal_source_baseline_id
      )
      values (
        p_target_client_id,
        v_target_client.workspace_id,
        source_baseline.status,
        source_baseline.client_notes,
        null,
        source_baseline.submitted_at,
        source_baseline.created_at,
        now(),
        case
          when source_baseline.client_id = p_target_client_id then null
          else v_canonical_baseline_id
        end
      )
      returning id into v_target_baseline_id;
    else
      update public.baseline_entries be
      set
        status = source_baseline.status,
        client_notes = coalesce(be.client_notes, source_baseline.client_notes),
        submitted_at = coalesce(be.submitted_at, source_baseline.submitted_at),
        universal_source_baseline_id = case
          when be.id = v_canonical_baseline_id then be.universal_source_baseline_id
          else coalesce(be.universal_source_baseline_id, v_canonical_baseline_id)
        end,
        updated_at = now()
      where be.id = v_existing_target_baseline_id
      returning be.id into v_target_baseline_id;
    end if;

    insert into public.baseline_metrics (
      baseline_id,
      weight_kg,
      height_cm,
      body_fat_pct,
      lean_mass_kg,
      waist_cm,
      chest_cm,
      hips_cm,
      thigh_cm,
      arm_cm,
      resting_hr,
      vo2max,
      created_at,
      updated_at
    )
    select
      v_target_baseline_id,
      bm.weight_kg,
      bm.height_cm,
      bm.body_fat_pct,
      bm.lean_mass_kg,
      bm.waist_cm,
      bm.chest_cm,
      bm.hips_cm,
      bm.thigh_cm,
      bm.arm_cm,
      bm.resting_hr,
      bm.vo2max,
      bm.created_at,
      now()
    from public.baseline_metrics bm
    where bm.baseline_id = source_baseline.id
    on conflict (baseline_id) do update
      set
        weight_kg = excluded.weight_kg,
        height_cm = excluded.height_cm,
        body_fat_pct = excluded.body_fat_pct,
        lean_mass_kg = excluded.lean_mass_kg,
        waist_cm = excluded.waist_cm,
        chest_cm = excluded.chest_cm,
        hips_cm = excluded.hips_cm,
        thigh_cm = excluded.thigh_cm,
        arm_cm = excluded.arm_cm,
        resting_hr = excluded.resting_hr,
        vo2max = excluded.vo2max,
        updated_at = now();

    insert into public.baseline_marker_values (
      baseline_id,
      template_id,
      value_number,
      value_text,
      created_at,
      updated_at
    )
    select
      v_target_baseline_id,
      bmv.template_id,
      bmv.value_number,
      bmv.value_text,
      bmv.created_at,
      now()
    from public.baseline_marker_values bmv
    where bmv.baseline_id = source_baseline.id
    on conflict (baseline_id, template_id) do update
      set
        value_number = excluded.value_number,
        value_text = excluded.value_text,
        updated_at = now();

    insert into public.baseline_photos (
      baseline_id,
      client_id,
      photo_type,
      url,
      created_at,
      storage_path
    )
    select
      v_target_baseline_id,
      p_target_client_id,
      bp.photo_type,
      bp.url,
      bp.created_at,
      bp.storage_path
    from public.baseline_photos bp
    where bp.baseline_id = source_baseline.id
    on conflict (baseline_id, photo_type) do update
      set
        client_id = excluded.client_id,
        url = excluded.url,
        storage_path = excluded.storage_path;

    insert into public.baseline_entry_marker_templates (
      baseline_id,
      template_id,
      created_at
    )
    select
      v_target_baseline_id,
      bemt.template_id,
      bemt.created_at
    from public.baseline_entry_marker_templates bemt
    join public.baseline_marker_templates bmt
      on bmt.id = bemt.template_id
     and bmt.workspace_id = v_target_client.workspace_id
    where bemt.baseline_id = source_baseline.id
    on conflict (baseline_id, template_id) do nothing;
  end loop;
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

revoke all on function public.copy_client_universal_baseline_data(uuid, uuid)
  from public, anon;
grant execute on function public.copy_client_universal_baseline_data(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.pt_transfer_client_relationship(uuid, uuid)
  from public, anon;
grant execute on function public.pt_transfer_client_relationship(uuid, uuid)
  to authenticated, service_role;
