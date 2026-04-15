alter table public.baseline_marker_templates
  add column if not exists owner_user_id uuid;

update public.baseline_marker_templates bmt
set owner_user_id = w.owner_user_id
from public.workspaces w
where w.id = bmt.workspace_id
  and bmt.owner_user_id is null;

create index if not exists baseline_marker_templates_owner_user_id_idx
  on public.baseline_marker_templates(owner_user_id);

drop trigger if exists validate_baseline_entry_marker_template_match
  on public.baseline_entry_marker_templates;

drop trigger if exists validate_performance_marker_assignment_match
  on public.baseline_entry_marker_templates;

drop function if exists public.validate_baseline_entry_marker_template_match();

create or replace function public.validate_performance_marker_assignment_match()
returns trigger
language plpgsql
as $$
declare
  v_baseline_workspace_id uuid;
  v_baseline_owner_user_id uuid;
  v_template_owner_user_id uuid;
begin
  select
    be.workspace_id,
    w.owner_user_id
  into
    v_baseline_workspace_id,
    v_baseline_owner_user_id
  from public.baseline_entries be
  join public.workspaces w
    on w.id = be.workspace_id
  where be.id = new.baseline_id;

  select
    coalesce(bmt.owner_user_id, w.owner_user_id)
  into v_template_owner_user_id
  from public.baseline_marker_templates bmt
  left join public.workspaces w
    on w.id = bmt.workspace_id
  where bmt.id = new.template_id;

  if v_baseline_workspace_id is null
    or v_baseline_owner_user_id is null
    or v_template_owner_user_id is null then
    raise exception
      'Performance marker assignment is missing a valid baseline or performance marker.';
  end if;

  if v_baseline_owner_user_id <> v_template_owner_user_id then
    raise exception
      'Performance marker assignments must stay inside the same PT marker library.';
  end if;

  return new;
end;
$$;

create trigger validate_performance_marker_assignment_match
before insert or update on public.baseline_entry_marker_templates
for each row
execute function public.validate_performance_marker_assignment_match();

drop policy if exists baseline_marker_templates_select_access
  on public.baseline_marker_templates;
create policy baseline_marker_templates_select_access
on public.baseline_marker_templates
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    join public.workspaces w
      on w.id = c.workspace_id
    where c.user_id = auth.uid()
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
  or exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w
      on w.id = wm.workspace_id
    where wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
);

drop policy if exists baseline_marker_templates_insert_pt
  on public.baseline_marker_templates;
create policy baseline_marker_templates_insert_pt
on public.baseline_marker_templates
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w
      on w.id = wm.workspace_id
    where wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
);

drop policy if exists baseline_marker_templates_update_pt
  on public.baseline_marker_templates;
create policy baseline_marker_templates_update_pt
on public.baseline_marker_templates
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w
      on w.id = wm.workspace_id
    where wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w
      on w.id = wm.workspace_id
    where wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
);

drop policy if exists baseline_marker_templates_delete_pt
  on public.baseline_marker_templates;
create policy baseline_marker_templates_delete_pt
on public.baseline_marker_templates
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    join public.workspaces w
      on w.id = wm.workspace_id
    where wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
      and w.owner_user_id = baseline_marker_templates.owner_user_id
  )
);

create or replace function public.pt_assign_performance_markers(
  p_client_id uuid,
  p_performance_marker_ids uuid[] default '{}'::uuid[],
  p_workspace_id uuid default null
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
  v_workspace_owner_user_id uuid;
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

  if p_workspace_id is not null then
    if not public.is_pt_workspace_member(p_workspace_id) then
      raise exception 'Client not found in this workspace.';
    end if;

    v_workspace_id := p_workspace_id;

    select wco.*
    into v_onboarding
    from public.workspace_client_onboardings wco
    where wco.workspace_id = v_workspace_id
      and wco.client_id = p_client_id
    limit 1;
  else
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
  end if;

  if v_workspace_id is null then
    raise exception 'Client not found in this workspace.';
  end if;

  if not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Not authorized';
  end if;

  select w.owner_user_id
  into v_workspace_owner_user_id
  from public.workspaces w
  where w.id = v_workspace_id;

  if v_workspace_owner_user_id is null then
    raise exception 'Workspace owner not found.';
  end if;

  if v_client_workspace_id is not null
    and v_client_workspace_id <> v_workspace_id
    and v_onboarding.id is null then
    raise exception 'Client not found in this workspace.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_performance_marker_ids, '{}'::uuid[])) as selected_ids(template_id)
    left join public.baseline_marker_templates bmt
      on bmt.id = selected_ids.template_id
    left join public.workspaces w
      on w.id = bmt.workspace_id
    where coalesce(bmt.owner_user_id, w.owner_user_id) is distinct from v_workspace_owner_user_id
       or bmt.id is null
  ) then
    raise exception 'One or more performance markers were not found in this PT marker library.';
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
    and not (bet.template_id = any(coalesce(p_performance_marker_ids, '{}'::uuid[])));

  insert into public.baseline_entry_marker_templates (baseline_id, template_id)
  select
    v_draft.id,
    selected_ids.template_id
  from unnest(coalesce(p_performance_marker_ids, '{}'::uuid[])) as selected_ids(template_id)
  on conflict on constraint baseline_entry_marker_templates_pkey do nothing;

  onboarding_id := v_onboarding.id;
  baseline_id := v_draft.id;
  assigned_marker_count := coalesce(array_length(coalesce(p_performance_marker_ids, '{}'::uuid[]), 1), 0);
  return next;
end;
$$;

create or replace function public.pt_assign_baseline_markers(
  p_client_id uuid,
  p_template_ids uuid[] default '{}'::uuid[],
  p_workspace_id uuid default null
)
returns table(
  onboarding_id uuid,
  baseline_id uuid,
  assigned_marker_count integer
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select *
  from public.pt_assign_performance_markers(
    p_client_id,
    p_template_ids,
    p_workspace_id
  );
$$;

revoke all on function public.pt_assign_performance_markers(uuid, uuid[], uuid) from public;
grant all on function public.pt_assign_performance_markers(uuid, uuid[], uuid) to authenticated;
grant all on function public.pt_assign_performance_markers(uuid, uuid[], uuid) to service_role;

revoke all on function public.pt_assign_baseline_markers(uuid, uuid[], uuid) from public;
grant all on function public.pt_assign_baseline_markers(uuid, uuid[], uuid) to authenticated;
grant all on function public.pt_assign_baseline_markers(uuid, uuid[], uuid) to service_role;

notify pgrst, 'reload schema';
