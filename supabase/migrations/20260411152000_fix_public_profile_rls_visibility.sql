-- Fix public PT profile visibility for anon and non-owner sessions.
-- The previous policy depended on a private settings lookup and therefore
-- blocked valid published profile pages in incognito/non-owner sessions.

drop policy if exists pt_hub_profiles_select_access on public.pt_hub_profiles;
drop policy if exists pt_hub_profiles_select_published on public.pt_hub_profiles;

create policy pt_hub_profiles_select_access
  on public.pt_hub_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      is_published = true
      and slug is not null
      and btrim(slug) <> ''
    )
  );

create policy pt_hub_profiles_select_published
  on public.pt_hub_profiles
  for select
  to anon
  using (
    is_published = true
    and slug is not null
    and btrim(slug) <> ''
  );
