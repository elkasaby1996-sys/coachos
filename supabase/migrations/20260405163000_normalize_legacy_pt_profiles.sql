alter table public.pt_profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists avatar_url text,
  add column if not exists coach_business_name text,
  add column if not exists headline text,
  add column if not exists bio text,
  add column if not exists location_country text,
  add column if not exists location_city text,
  add column if not exists languages text[] not null default '{}'::text[],
  add column if not exists specialties text[] not null default '{}'::text[],
  add column if not exists starting_price numeric,
  add column if not exists onboarding_completed_at timestamptz;

update public.pt_profiles
set
  full_name = coalesce(full_name, display_name)
where full_name is null
  and display_name is not null;

with duplicate_null_rows as (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id
        order by coalesce(updated_at, created_at) desc, created_at desc, id desc
      ) as row_num
    from public.pt_profiles
    where workspace_id is null
  ) ranked
  where ranked.row_num > 1
)
delete from public.pt_profiles p
using duplicate_null_rows d
where p.id = d.id;

create unique index if not exists pt_profiles_canonical_user_uidx
on public.pt_profiles (user_id)
where workspace_id is null;

create or replace function public.create_workspace(p_name text)
returns table(workspace_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_variable
declare
  v_user_id uuid;
  v_workspace_id uuid;
  v_name text;
  v_member_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Workspace name is required';
  end if;

  insert into public.workspaces (name, owner_user_id)
  values (v_name, v_user_id)
  returning id into v_workspace_id;

  select wm.id
  into v_member_id
  from public.workspace_members wm
  where wm.workspace_id = v_workspace_id
    and wm.user_id = v_user_id
  limit 1
  for update;

  if v_member_id is null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, v_user_id, 'pt_owner');
  else
    update public.workspace_members wm
    set role = 'pt_owner'
    where wm.id = v_member_id;
  end if;

  workspace_id := v_workspace_id;
  return next;
end;
$$;
