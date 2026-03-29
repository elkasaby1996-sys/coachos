alter table public.checkins
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_user_id uuid references auth.users(id) on delete set null;

update public.checkins
set reviewed_at = coalesce(reviewed_at, submitted_at, created_at, now())
where reviewed_at is null
  and submitted_at is not null
  and nullif(btrim(coalesce(pt_feedback, '')), '') is not null;

create or replace function public.enforce_checkin_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  if new.week_ending_saturday is not null then
    new.week_ending_saturday := public.normalize_checkin_due_date(new.week_ending_saturday);
  end if;

  if (new.reviewed_at is null) <> (new.reviewed_by_user_id is null) then
    raise exception 'Review metadata must be set together';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = coalesce(new.client_id, old.client_id);

  if tg_op = 'INSERT' then
    if (
      new.pt_feedback is not null
      or new.reviewed_at is not null
      or new.reviewed_by_user_id is not null
    ) and not public.is_pt_workspace_member(v_workspace_id) then
      raise exception 'Only PT workspace members can write check-in review metadata';
    end if;

    if new.submitted_at is null and (
      new.reviewed_at is not null
      or new.reviewed_by_user_id is not null
    ) then
      raise exception 'Check-ins cannot be reviewed before submission';
    end if;

    if new.submitted_at is not null then
      perform public.validate_checkin_submission_requirements(new.id);
    end if;

    return new;
  end if;

  if old.submitted_at is not null then
    if new.client_id is distinct from old.client_id
       or new.template_id is distinct from old.template_id
       or new.week_ending_saturday is distinct from old.week_ending_saturday
       or new.submitted_at is distinct from old.submitted_at
       or new.created_at is distinct from old.created_at then
      raise exception 'Submitted check-ins are immutable';
    end if;

    if (
      new.pt_feedback is distinct from old.pt_feedback
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
    ) and not public.is_pt_workspace_member(v_workspace_id) then
      raise exception 'Only PT workspace members can review submitted check-ins';
    end if;

    if old.reviewed_at is not null and new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Reviewed check-ins cannot be unreviewed or re-timestamped';
    end if;

    if old.reviewed_by_user_id is not null
       and new.reviewed_by_user_id is distinct from old.reviewed_by_user_id then
      raise exception 'Reviewed check-ins cannot change reviewer metadata';
    end if;

    return new;
  end if;

  if (
    new.pt_feedback is distinct from old.pt_feedback
    or new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
  ) and not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Only PT workspace members can write coach review metadata';
  end if;

  if old.submitted_at is null and new.submitted_at is not null then
    perform public.validate_checkin_submission_requirements(new.id);
  end if;

  if new.submitted_at is null and (
    new.reviewed_at is not null
    or new.reviewed_by_user_id is not null
  ) then
    raise exception 'Check-ins cannot be reviewed before submission';
  end if;

  return new;
end;
$$;

drop function if exists public.review_checkin(uuid, text);

create or replace function public.review_checkin(
  p_checkin_id uuid,
  p_pt_feedback text default null,
  p_mark_reviewed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_submitted_at timestamptz;
begin
  select c.workspace_id, ci.submitted_at
  into v_workspace_id, v_submitted_at
  from public.checkins ci
  join public.clients c on c.id = ci.client_id
  where ci.id = p_checkin_id;

  if v_workspace_id is null then
    raise exception 'Check-in not found';
  end if;

  if not public.is_pt_workspace_member(v_workspace_id) then
    raise exception 'Not authorized';
  end if;

  if v_submitted_at is null then
    raise exception 'Check-in must be submitted before review';
  end if;

  update public.checkins
  set pt_feedback = nullif(trim(p_pt_feedback), ''),
      reviewed_at = case
        when p_mark_reviewed then coalesce(reviewed_at, now())
        else reviewed_at
      end,
      reviewed_by_user_id = case
        when p_mark_reviewed then coalesce(reviewed_by_user_id, auth.uid())
        else reviewed_by_user_id
      end
  where id = p_checkin_id;
end;
$$;

revoke all on function public.review_checkin(uuid, text, boolean) from public;
grant execute on function public.review_checkin(uuid, text, boolean) to authenticated;
