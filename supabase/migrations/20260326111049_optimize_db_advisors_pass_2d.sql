-- Pass 2D: finish the remaining permissive-policy cleanup.
--
-- - Remove dead legacy false/false policies from archive-only tables
-- - Consolidate PT Hub profile read access so authenticated users use a single
--   SELECT policy for own-or-published access while anon keeps published-only
--   access

drop policy if exists client_read_own on public._archive_workout_log_items;
drop policy if exists trainer_isolation on public._archive_workout_log_items;

drop policy if exists client_read_own on public._archive_workout_template_items;
drop policy if exists trainer_isolation on public._archive_workout_template_items;

drop policy if exists pt_hub_profiles_select_own on public.pt_hub_profiles;
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
      and exists (
        select 1
        from public.pt_hub_settings settings
        where settings.user_id = pt_hub_profiles.user_id
          and settings.profile_visibility = 'listed'
      )
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
    and exists (
      select 1
      from public.pt_hub_settings settings
      where settings.user_id = pt_hub_profiles.user_id
        and settings.profile_visibility = 'listed'
    )
  );
