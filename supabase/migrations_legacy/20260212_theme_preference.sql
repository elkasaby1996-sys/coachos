-- Persisted appearance preferences for PT users

alter table public.workspace_members
  add column if not exists theme_preference text not null default 'system';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_members_theme_preference_check'
      and conrelid = 'public.workspace_members'::regclass
  ) then
    alter table public.workspace_members
      add constraint workspace_members_theme_preference_check
      check (theme_preference in ('system', 'dark', 'light'));
  end if;
end $$;

alter table public.workspace_members
  add column if not exists compact_density boolean not null default false;

create or replace function public.set_my_appearance_preferences(
  p_theme_preference text default null,
  p_compact_density boolean default null
)
returns table (
  theme_preference text,
  compact_density boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_theme_preference is not null
     and p_theme_preference not in ('system', 'dark', 'light') then
    raise exception 'Invalid theme preference';
  end if;

  update public.workspace_members wm
  set
    theme_preference = coalesce(p_theme_preference, wm.theme_preference),
    compact_density = coalesce(p_compact_density, wm.compact_density)
  where wm.user_id = v_user_id
    and wm.role::text like 'pt_%';

  return query
  select wm.theme_preference, wm.compact_density
  from public.workspace_members wm
  where wm.user_id = v_user_id
    and wm.role::text like 'pt_%'
  order by wm.role
  limit 1;
end;
$$;

revoke all on function public.set_my_appearance_preferences(text, boolean) from public;
grant execute on function public.set_my_appearance_preferences(text, boolean) to authenticated;
