create or replace function public.client_visible_performance_markers(
  p_workspace_id uuid default null
)
returns table(
  id uuid,
  name text,
  unit_label text,
  value_type text,
  sort_order integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.user_id = v_actor_user_id
    and (
      p_workspace_id is null
      or c.workspace_id = p_workspace_id
    )
  order by
    case
      when p_workspace_id is not null and c.workspace_id = p_workspace_id then 0
      when c.workspace_id is not null then 1
      else 2
    end,
    c.created_at asc
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select
    bmt.id,
    bmt.name,
    bmt.unit_label,
    bmt.value_type::text,
    bmt.sort_order,
    bmt.created_at
  from public.baseline_marker_templates bmt
  where bmt.workspace_id = v_workspace_id
    and coalesce(bmt.is_active, true) = true
  order by
    bmt.sort_order asc nulls last,
    bmt.created_at asc;
end;
$$;

revoke all on function public.client_visible_performance_markers(uuid) from public;
grant execute on function public.client_visible_performance_markers(uuid) to authenticated;
grant execute on function public.client_visible_performance_markers(uuid) to service_role;

notify pgrst, 'reload schema';
