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
  v_feedback text := nullif(trim(p_pt_feedback), '');
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

  if p_mark_reviewed and v_feedback is null then
    raise exception 'Review notes are required before marking a check-in reviewed';
  end if;

  update public.checkins
  set pt_feedback = v_feedback,
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
