create or replace function public.ensure_workspace_client_onboarding(
  p_client_id uuid,
  p_source public.onboarding_source default 'direct_invite'
)
returns public.workspace_client_onboardings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_client public.clients%rowtype;
  v_row public.workspace_client_onboardings;
  v_baseline public.baseline_entries%rowtype;
  v_program public.client_programs%rowtype;
  v_checkin_submitted_at timestamptz := null;
  v_has_program boolean := false;
  v_has_checkin_setup boolean := false;
  v_legacy_status public.onboarding_status := null;
  v_started_at timestamptz := null;
  v_reviewed_at timestamptz := null;
  v_activated_at timestamptz := null;
  v_completed_at timestamptz := null;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select c.*
  into v_client
  from public.clients c
  where c.id = p_client_id
  limit 1;

  if v_client.id is null or v_client.workspace_id is null then
    raise exception 'Client not found';
  end if;

  if not (
    public.is_client_owner(p_client_id)
    or public.is_pt_workspace_member(v_client.workspace_id)
  ) then
    raise exception 'Not authorized';
  end if;

  select *
  into v_row
  from public.workspace_client_onboardings wco
  where wco.workspace_id = v_client.workspace_id
    and wco.client_id = p_client_id
  limit 1;

  if v_row.id is null then
    select *
    into v_baseline
    from public.baseline_entries be
    where be.client_id = p_client_id
      and be.status = 'submitted'
    order by coalesce(be.submitted_at, be.created_at) desc
    limit 1;

    select *
    into v_program
    from public.client_programs cp
    where cp.client_id = p_client_id
      and coalesce(cp.is_active, false) = true
    order by coalesce(cp.updated_at, cp.created_at) desc
    limit 1;

    select max(coalesce(ch.submitted_at, ch.created_at))
    into v_checkin_submitted_at
    from public.checkins ch
    where ch.client_id = p_client_id
      and ch.submitted_at is not null;

    v_has_program := v_program.id is not null;
    v_has_checkin_setup := (
      v_client.checkin_template_id is not null
      and v_client.checkin_start_date is not null
    ) or v_checkin_submitted_at is not null;

    if v_baseline.id is not null and v_has_program and v_has_checkin_setup then
      v_legacy_status := 'completed';
    elsif v_baseline.id is not null and (v_has_program or v_has_checkin_setup) then
      v_legacy_status := 'partially_activated';
    end if;

    if v_legacy_status is not null then
      v_started_at := coalesce(
        v_baseline.created_at,
        v_client.created_at,
        now()
      );
      v_reviewed_at := coalesce(
        v_program.updated_at,
        v_program.created_at,
        v_checkin_submitted_at,
        v_baseline.submitted_at,
        now()
      );
      v_activated_at := coalesce(
        v_program.created_at,
        v_checkin_submitted_at,
        v_reviewed_at
      );
      v_completed_at :=
        case
          when v_legacy_status = 'completed'
            then coalesce(v_program.updated_at, v_program.created_at, v_reviewed_at)
          else null
        end;

      insert into public.workspace_client_onboardings (
        workspace_id,
        client_id,
        source,
        status,
        initial_baseline_entry_id,
        first_program_template_id,
        first_program_applied_at,
        first_checkin_template_id,
        first_checkin_date,
        first_checkin_scheduled_at,
        started_at,
        submitted_at,
        reviewed_at,
        activated_at,
        completed_at
      )
      values (
        v_client.workspace_id,
        p_client_id,
        coalesce(p_source, 'direct_invite'),
        v_legacy_status,
        v_baseline.id,
        v_program.program_template_id,
        case
          when v_has_program
            then coalesce(v_program.updated_at, v_program.created_at, now())
          else null
        end,
        v_client.checkin_template_id,
        v_client.checkin_start_date,
        case
          when v_has_checkin_setup
            then coalesce(v_checkin_submitted_at, now())
          else null
        end,
        v_started_at,
        coalesce(v_baseline.submitted_at, v_started_at, now()),
        v_reviewed_at,
        v_activated_at,
        v_completed_at
      )
      returning *
      into v_row;
    else
      insert into public.workspace_client_onboardings (
        workspace_id,
        client_id,
        source,
        status
      )
      values (
        v_client.workspace_id,
        p_client_id,
        coalesce(p_source, 'direct_invite'),
        'invited'
      )
      returning *
      into v_row;
    end if;
  end if;

  return v_row;
end;
$$;

create or replace function public.ensure_workspace_client_onboardings(
  p_workspace_id uuid,
  p_client_ids uuid[]
)
returns setof public.workspace_client_onboardings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_client_id uuid;
  v_row public.workspace_client_onboardings;
begin
  if p_workspace_id is null then
    raise exception 'Workspace is required';
  end if;

  if not public.is_pt_workspace_member(p_workspace_id) then
    raise exception 'Not authorized';
  end if;

  if coalesce(array_length(p_client_ids, 1), 0) = 0 then
    return;
  end if;

  foreach v_client_id in array p_client_ids loop
    if exists (
      select 1
      from public.clients c
      where c.id = v_client_id
        and c.workspace_id = p_workspace_id
    ) then
      v_row := public.ensure_workspace_client_onboarding(v_client_id, 'direct_invite');
      return next v_row;
    end if;
  end loop;

  return;
end;
$$;

revoke all on function public.ensure_workspace_client_onboardings(uuid, uuid[]) from public;
grant all on function public.ensure_workspace_client_onboardings(uuid, uuid[]) to authenticated;
grant all on function public.ensure_workspace_client_onboardings(uuid, uuid[]) to service_role;
