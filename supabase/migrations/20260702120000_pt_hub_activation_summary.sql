create or replace function public.pt_hub_activation_summary(
  p_workspace_id uuid default null
)
returns table (
  workspace_exists boolean,
  activation_workspace_id uuid,
  activation_workspace_slug text,
  has_first_client boolean,
  first_client_id uuid,
  has_workout_assigned boolean,
  has_nutrition_assigned boolean,
  has_checkin_assigned boolean,
  has_co_coach_invited_or_active boolean,
  client_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid;
  v_activation_workspace_id uuid;
  v_activation_workspace_slug text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  with eligible_workspaces as (
    select
      w.id,
      w.slug,
      w.created_at,
      true as is_owned,
      'owner'::text as role
    from public.workspaces w
    where w.owner_user_id = v_user_id

    union

    select
      w.id,
      w.slug,
      w.created_at,
      false as is_owned,
      public.normalize_workspace_role(wm.role::text) as role
    from public.workspace_members wm
    join public.workspaces w
      on w.id = wm.workspace_id
    where wm.user_id = v_user_id
      and coalesce(wm.status, 'active') = 'active'
      and public.normalize_workspace_role(wm.role::text) in (
        'owner',
        'admin',
        'coach',
        'assistant_coach'
      )
  )
  select ew.id, ew.slug
  into v_activation_workspace_id, v_activation_workspace_slug
  from eligible_workspaces ew
  where p_workspace_id is null or ew.id = p_workspace_id
  order by
    case when p_workspace_id is not null and ew.id = p_workspace_id then 0 else 1 end,
    case when ew.is_owned then 0 else 1 end,
    ew.created_at asc nulls last,
    ew.id asc
  limit 1;

  if p_workspace_id is not null and v_activation_workspace_id is null then
    raise exception 'Not authorized';
  end if;

  if v_activation_workspace_id is null then
    return query
    select
      false,
      null::uuid,
      null::text,
      false,
      null::uuid,
      false,
      false,
      false,
      false,
      0;
    return;
  end if;

  return query
  with scoped_clients as (
    select c.id, c.created_at
    from public.clients c
    where c.workspace_id = v_activation_workspace_id
    order by c.created_at asc nulls last, c.id asc
  ),
  first_client as (
    select sc.id
    from scoped_clients sc
    order by sc.created_at asc nulls last, sc.id asc
    limit 1
  )
  select
    true as workspace_exists,
    v_activation_workspace_id as activation_workspace_id,
    v_activation_workspace_slug as activation_workspace_slug,
    exists(select 1 from scoped_clients) as has_first_client,
    (select fc.id from first_client fc) as first_client_id,
    exists (
      select 1
      from public.assigned_workouts aw
      join public.clients c
        on c.id = aw.client_id
      where c.workspace_id = v_activation_workspace_id
      limit 1
    ) as has_workout_assigned,
    exists (
      select 1
      from public.assigned_nutrition_plans anp
      join public.clients c
        on c.id = anp.client_id
      where c.workspace_id = v_activation_workspace_id
      limit 1
    ) as has_nutrition_assigned,
    exists (
      select 1
      from public.clients c
      where c.workspace_id = v_activation_workspace_id
        and c.checkin_template_id is not null
      limit 1
    ) or exists (
      select 1
      from public.workspace_client_onboardings wco
      where wco.workspace_id = v_activation_workspace_id
        and wco.first_checkin_template_id is not null
      limit 1
    ) or exists (
      select 1
      from public.checkins ci
      join public.clients c
        on c.id = ci.client_id
      where c.workspace_id = v_activation_workspace_id
      limit 1
    ) as has_checkin_assigned,
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = v_activation_workspace_id
        and coalesce(wm.status, 'active') = 'active'
        and wm.user_id <> v_user_id
        and public.normalize_workspace_role(wm.role::text) in (
          'admin',
          'coach',
          'assistant_coach'
        )
      limit 1
    ) or exists (
      select 1
      from public.workspace_member_invites wmi
      where wmi.workspace_id = v_activation_workspace_id
        and wmi.status = 'pending'
        and wmi.expires_at > now()
        and wmi.role in ('admin', 'coach', 'assistant_coach')
      limit 1
    ) as has_co_coach_invited_or_active,
    (select count(*)::integer from scoped_clients) as client_count;
end;
$$;

revoke all on function public.pt_hub_activation_summary(uuid) from public;
grant execute on function public.pt_hub_activation_summary(uuid) to authenticated;
