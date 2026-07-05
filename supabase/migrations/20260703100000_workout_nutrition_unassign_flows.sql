-- PR-04.3: explicit unassign flow for coach-assigned nutrition snapshots.
-- Assignment snapshots and source templates are preserved; the current plan is
-- made non-active so client and coach current-plan queries no longer show it.

create or replace function public.unassign_client_nutrition_plan(
  p_client_id uuid,
  p_assigned_plan_id uuid
)
returns table(
  assigned_plan_id uuid,
  plans_cancelled integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_client_id is null or p_assigned_plan_id is null then
    raise exception 'client and assigned_plan are required';
  end if;

  if not public.can_write_client_delivery(p_client_id) then
    raise exception 'Not authorized';
  end if;

  return query
  with cancelled as (
    update public.assigned_nutrition_plans ap
    set
      status = 'cancelled',
      updated_at = now()
    where ap.id = p_assigned_plan_id
      and ap.client_id = p_client_id
      and ap.status = 'active'
      and exists (
        select 1
        from public.nutrition_templates nt
        where nt.id = ap.nutrition_template_id
          and nt.workspace_id is not null
          and nt.owner_client_id is null
      )
    returning ap.id
  )
  select cancelled.id, 1::integer
  from cancelled
  union all
  select null::uuid, 0::integer where not exists (
    select 1 from cancelled
  );
end;
$$;

grant execute on function public.unassign_client_nutrition_plan(uuid, uuid) to authenticated;
