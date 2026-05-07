create or replace function public.pt_hub_client_stats()
returns table(
  total_clients integer,
  active_clients integer,
  paused_clients integer,
  at_risk_clients integer,
  onboarding_incomplete_clients integer,
  overdue_checkin_clients integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    count(*)::integer as total_clients,
    count(*) filter (
      where c.lifecycle_state in ('active', 'at_risk')
    )::integer as active_clients,
    count(*) filter (
      where c.lifecycle_state = 'paused'
    )::integer as paused_clients,
    count(*) filter (
      where c.lifecycle_state = 'at_risk'
         or coalesce(array_length(ops.risk_flags, 1), 0) > 0
    )::integer as at_risk_clients,
    count(*) filter (
      where coalesce(ops.onboarding_incomplete, false)
    )::integer as onboarding_incomplete_clients,
    count(*) filter (
      where coalesce(ops.has_overdue_checkin, false)
    )::integer as overdue_checkin_clients
  from public.clients c
  join public.workspaces w
    on w.id = c.workspace_id
  left join lateral public.client_operational_snapshot(c.id) ops
    on true
  where w.owner_user_id = v_user_id;
end;
$$;

create or replace function public.pt_hub_clients_page(
  p_limit integer default 25,
  p_offset integer default 0,
  p_workspace_id uuid default null,
  p_search text default null,
  p_lifecycle text default null,
  p_segment text default null
)
returns table(
  id uuid,
  workspace_id uuid,
  workspace_name text,
  user_id uuid,
  status text,
  lifecycle_state text,
  lifecycle_changed_at timestamptz,
  paused_reason text,
  churn_reason text,
  display_name text,
  goal text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  onboarding_status text,
  onboarding_incomplete boolean,
  last_session_at timestamptz,
  last_checkin_at timestamptz,
  last_message_at timestamptz,
  last_client_reply_at timestamptz,
  last_activity_at timestamptz,
  overdue_checkins_count integer,
  has_overdue_checkin boolean,
  risk_flags text[],
  total_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_lifecycle text := nullif(trim(coalesce(p_lifecycle, '')), '');
  v_segment text := nullif(trim(coalesce(p_segment, '')), '');
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with scoped_clients as (
    select
      c.id,
      c.workspace_id,
      w.name as workspace_name,
      c.user_id,
      c.status::text as status,
      c.lifecycle_state,
      c.lifecycle_changed_at,
      c.paused_reason,
      c.churn_reason,
      c.display_name,
      c.goal,
      c.tags,
      c.created_at,
      c.updated_at,
      ops.onboarding_status,
      ops.onboarding_incomplete,
      ops.last_session_at,
      ops.last_checkin_at,
      ops.last_message_at,
      ops.last_client_reply_at,
      ops.last_activity_at,
      ops.overdue_checkins_count,
      ops.has_overdue_checkin,
      coalesce(ops.risk_flags, '{}'::text[]) as risk_flags
    from public.clients c
    join public.workspaces w
      on w.id = c.workspace_id
    left join lateral public.client_operational_snapshot(c.id) ops
      on true
    where w.owner_user_id = v_user_id
      and (p_workspace_id is null or c.workspace_id = p_workspace_id)
  ),
  filtered_clients as (
    select *
    from scoped_clients sc
    where (v_lifecycle is null or sc.lifecycle_state = v_lifecycle)
      and (
        v_segment is null
        or (
          v_segment = 'onboarding_incomplete'
          and coalesce(sc.onboarding_incomplete, false)
        )
        or (
          v_segment = 'checkin_overdue'
          and coalesce(sc.has_overdue_checkin, false)
        )
        or (
          v_segment = 'at_risk'
          and (
            sc.lifecycle_state = 'at_risk'
            or coalesce(array_length(sc.risk_flags, 1), 0) > 0
          )
        )
        or (
          v_segment = 'paused'
          and sc.lifecycle_state = 'paused'
        )
      )
      and (
        v_search is null
        or concat_ws(
          ' ',
          coalesce(sc.display_name, ''),
          coalesce(sc.goal, ''),
          coalesce(sc.workspace_name, ''),
          coalesce(sc.lifecycle_state, ''),
          coalesce(sc.onboarding_status, ''),
          array_to_string(coalesce(sc.risk_flags, '{}'::text[]), ' ')
        ) ilike '%' || v_search || '%'
      )
  )
  select
    fc.id,
    fc.workspace_id,
    fc.workspace_name,
    fc.user_id,
    fc.status,
    fc.lifecycle_state,
    fc.lifecycle_changed_at,
    fc.paused_reason,
    fc.churn_reason,
    fc.display_name,
    fc.goal,
    fc.tags,
    fc.created_at,
    fc.updated_at,
    fc.onboarding_status,
    fc.onboarding_incomplete,
    fc.last_session_at,
    fc.last_checkin_at,
    fc.last_message_at,
    fc.last_client_reply_at,
    fc.last_activity_at,
    fc.overdue_checkins_count,
    fc.has_overdue_checkin,
    fc.risk_flags,
    count(*) over ()::integer as total_count
  from filtered_clients fc
  order by fc.created_at desc nulls last, fc.id desc
  limit greatest(coalesce(p_limit, 25), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.pt_hub_client_stats() from public;
grant execute on function public.pt_hub_client_stats() to authenticated;

revoke all on function public.pt_hub_clients_page(integer, integer, uuid, text, text, text) from public;
grant execute on function public.pt_hub_clients_page(integer, integer, uuid, text, text, text) to authenticated;
