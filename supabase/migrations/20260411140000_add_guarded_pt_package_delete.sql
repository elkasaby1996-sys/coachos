create or replace function public.delete_pt_package_guarded(
  p_package_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_user_id uuid;
  v_package record;
  v_reference_count bigint;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not allowed to delete this package.'
      using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  select
    pkg.id,
    pkg.pt_user_id
  into v_package
  from public.pt_packages pkg
  where pkg.id = p_package_id
  limit 1;

  if not found then
    raise exception 'Package not found.'
      using errcode = 'P0001', detail = 'PACKAGE_NOT_FOUND';
  end if;

  if v_package.pt_user_id <> v_actor_user_id then
    raise exception 'Not allowed to delete this package.'
      using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  select count(*)
  into v_reference_count
  from public.pt_hub_leads lead
  where lead.package_interest_id = v_package.id;

  if v_reference_count > 0 then
    raise exception 'Package is referenced by existing leads. Archive it instead.'
      using errcode = 'P0001', detail = 'PACKAGE_DELETE_BLOCKED_REFERENCED';
  end if;

  delete from public.pt_packages pkg
  where pkg.id = v_package.id
    and pkg.pt_user_id = v_actor_user_id;

  return v_package.id;
end;
$$;

revoke all on function public.delete_pt_package_guarded(uuid)
from public, anon, authenticated;

grant execute on function public.delete_pt_package_guarded(uuid)
to authenticated, service_role;
