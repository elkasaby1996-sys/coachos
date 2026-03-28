create or replace function public.review_workspace_client_onboarding(
  p_client_id uuid,
  p_coach_review_notes text default null
)
returns public.workspace_client_onboardings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.workspace_client_onboardings;
  v_next_status public.onboarding_status;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select *
  into v_row
  from public.workspace_client_onboardings wco
  where wco.client_id = p_client_id
  limit 1
  for update;

  if v_row.id is null then
    raise exception 'Onboarding row not found';
  end if;

  if not public.is_pt_workspace_member(v_row.workspace_id) then
    raise exception 'Not authorized';
  end if;

  v_next_status :=
    case
      when v_row.completed_at is not null then 'completed'::public.onboarding_status
      when v_row.activated_at is not null
        or v_row.status = 'partially_activated'::public.onboarding_status
        then 'partially_activated'::public.onboarding_status
      else 'submitted'::public.onboarding_status
    end;

  update public.workspace_client_onboardings
  set
    coach_review_notes = coalesce(p_coach_review_notes, coach_review_notes),
    reviewed_at = now(),
    reviewed_by_user_id = auth.uid(),
    status = v_next_status
  where id = v_row.id
  returning *
  into v_row;

  return v_row;
end;
$$;

create or replace function public.partially_activate_workspace_client_onboarding(
  p_client_id uuid,
  p_coach_review_notes text default null
)
returns public.workspace_client_onboardings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_row public.workspace_client_onboardings;
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  select *
  into v_row
  from public.workspace_client_onboardings wco
  where wco.client_id = p_client_id
  limit 1
  for update;

  if v_row.id is null then
    raise exception 'Onboarding row not found';
  end if;

  if not public.is_pt_workspace_member(v_row.workspace_id) then
    raise exception 'Not authorized';
  end if;

  if v_row.completed_at is not null then
    raise exception 'Onboarding is already completed';
  end if;

  update public.workspace_client_onboardings
  set
    coach_review_notes = coalesce(p_coach_review_notes, coach_review_notes),
    reviewed_at = coalesce(reviewed_at, now()),
    reviewed_by_user_id = auth.uid(),
    activated_at = coalesce(activated_at, now()),
    status = 'partially_activated'
  where id = v_row.id
  returning *
  into v_row;

  return v_row;
end;
$$;

revoke all on function public.partially_activate_workspace_client_onboarding(uuid, text) from public;
grant all on function public.partially_activate_workspace_client_onboarding(uuid, text) to authenticated;
grant all on function public.partially_activate_workspace_client_onboarding(uuid, text) to service_role;
