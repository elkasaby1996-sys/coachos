create or replace function public.pt_hub_clients_page(
  p_limit int default 25,
  p_offset int default 0,
  p_workspace_id uuid default null,
  p_search text default null,
  p_lifecycle text default null,
  p_segment text default null,
  p_relationship_scope text default 'active'
)
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  user_id uuid,
  status text,
  relationship_status text,
  lifecycle_state text,
  manual_risk_flag boolean,
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
  v_relationship_scope text := lower(nullif(trim(coalesce(p_relationship_scope, 'active')), ''));
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_relationship_scope not in ('active', 'archived') then
    v_relationship_scope := 'active';
  end if;

  if p_workspace_id is not null and not public.can_access_workspace(p_workspace_id) then
    raise exception 'Not authorized';
  end if;

  return query
  with accessible_workspaces as (
    select awr.workspace_id, awr.workspace_name
    from public.accessible_workspace_relations_for_user() awr
    where p_workspace_id is null
       or awr.workspace_id = p_workspace_id
  ),
  scoped_clients as (
    select
      c.id,
      c.workspace_id,
      aw.workspace_name,
      c.user_id,
      c.status::text as status,
      coalesce(c.relationship_status, 'active') as relationship_status,
      c.lifecycle_state,
      c.manual_risk_flag,
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
    from accessible_workspaces aw
    join public.clients c
      on c.workspace_id = aw.workspace_id
    left join lateral public.client_operational_snapshot(c.id) ops
      on true
    where (
        v_relationship_scope = 'active'
        and coalesce(c.relationship_status, 'active') = 'active'
        and c.id in (
          select aci.client_id
          from public.accessible_client_ids(aw.workspace_id) aci
        )
      )
      or (
        v_relationship_scope = 'archived'
        and coalesce(c.relationship_status, 'active') in ('removed', 'transferred_out')
        and public.can_access_client(c.id, 'clients.view')
      )
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
            sc.manual_risk_flag
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
          coalesce(sc.relationship_status, ''),
          coalesce(sc.lifecycle_state, ''),
          coalesce(sc.onboarding_status, ''),
          case when sc.manual_risk_flag then 'manual at risk' else '' end,
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
    fc.relationship_status,
    fc.lifecycle_state,
    fc.manual_risk_flag,
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

revoke all on function public.pt_hub_clients_page(integer, integer, uuid, text, text, text, text) from public, anon;
grant execute on function public.pt_hub_clients_page(integer, integer, uuid, text, text, text, text) to authenticated;
