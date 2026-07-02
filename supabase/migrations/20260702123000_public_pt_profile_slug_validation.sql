-- Harden public PT profile slug validation and availability checks.

alter table public.pt_hub_profiles
  drop constraint if exists pt_hub_profiles_slug_format_check;

alter table public.pt_hub_profiles
  add constraint pt_hub_profiles_slug_format_check
  check (
    slug is null
    or btrim(slug) = ''
    or (
      slug = lower(btrim(slug))
      and length(slug) between 3 and 40
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and slug <> all (
        array[
          'admin',
          'api',
          'app',
          'login',
          'signup',
          'settings',
          'billing',
          'support',
          'help',
          'coach',
          'coaches',
          'pt',
          'profile',
          'marketplace',
          'dashboard',
          'workspaces',
          'clients',
          'messages',
          'terms',
          'privacy'
        ]::text[]
      )
    )
  ) not valid;

create unique index if not exists pt_hub_profiles_slug_uidx
  on public.pt_hub_profiles (lower(slug))
  where slug is not null and btrim(slug) <> '';

create or replace function public.check_pt_profile_slug_availability(p_slug text)
returns table (
  slug text,
  available boolean,
  reason text,
  message text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_slug text := btrim(coalesce(p_slug, ''));
  v_reserved_slugs constant text[] := array[
    'admin',
    'api',
    'app',
    'login',
    'signup',
    'settings',
    'billing',
    'support',
    'help',
    'coach',
    'coaches',
    'pt',
    'profile',
    'marketplace',
    'dashboard',
    'workspaces',
    'clients',
    'messages',
    'terms',
    'privacy'
  ];
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_slug = '' then
    return query select v_slug, false, 'required', 'Public slug is required.';
    return;
  end if;

  if length(v_slug) < 3 then
    return query select v_slug, false, 'invalid', 'Public slug must be at least 3 characters.';
    return;
  end if;

  if length(v_slug) > 40 then
    return query select v_slug, false, 'invalid', 'Public slug must be 40 characters or fewer.';
    return;
  end if;

  if v_slug <> lower(v_slug) or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    return query select v_slug, false, 'invalid', 'Use lowercase letters, numbers, and single hyphens only.';
    return;
  end if;

  if v_slug = any (v_reserved_slugs) then
    return query select v_slug, false, 'reserved', 'This public slug is reserved.';
    return;
  end if;

  if exists (
    select 1
    from public.pt_hub_profiles profile
    where lower(profile.slug) = v_slug
      and profile.user_id <> v_user_id
  ) then
    return query select v_slug, false, 'taken', 'This public slug is already in use.';
    return;
  end if;

  return query select v_slug, true, 'available', null::text;
end;
$$;

revoke all on function public.check_pt_profile_slug_availability(text) from public;
grant execute on function public.check_pt_profile_slug_availability(text) to authenticated;

create or replace function public.set_pt_profile_publication(p_publish boolean)
returns table (
  is_published boolean,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.pt_hub_profiles%rowtype;
  v_settings public.pt_hub_settings%rowtype;
  v_missing text[] := array[]::text[];
  v_slug text;
  v_reserved_slugs constant text[] := array[
    'admin',
    'api',
    'app',
    'login',
    'signup',
    'settings',
    'billing',
    'support',
    'help',
    'coach',
    'coaches',
    'pt',
    'profile',
    'marketplace',
    'dashboard',
    'workspaces',
    'clients',
    'messages',
    'terms',
    'privacy'
  ];
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_profile
  from public.pt_hub_profiles
  where user_id = v_user_id;

  if not found then
    raise exception 'PT Hub profile not found';
  end if;

  select *
  into v_settings
  from public.pt_hub_settings
  where user_id = v_user_id;

  if p_publish then
    v_slug := btrim(coalesce(v_profile.slug, ''));

    if v_slug = '' then
      v_missing := array_append(v_missing, 'Public URL slug');
    elsif length(v_slug) < 3
       or length(v_slug) > 40
       or v_slug <> lower(v_slug)
       or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       or v_slug = any (v_reserved_slugs) then
      v_missing := array_append(v_missing, 'Valid public URL slug');
    elsif exists (
      select 1
      from public.pt_hub_profiles profile
      where lower(profile.slug) = v_slug
        and profile.user_id <> v_user_id
    ) then
      v_missing := array_append(v_missing, 'Public URL slug is already taken');
    end if;

    if coalesce(btrim(v_profile.display_name), '') = '' then
      v_missing := array_append(v_missing, 'Display name');
    end if;

    if coalesce(btrim(v_profile.headline), '') = '' then
      v_missing := array_append(v_missing, 'Headline');
    end if;

    if coalesce(btrim(v_profile.short_bio), '') = '' then
      v_missing := array_append(v_missing, 'Bio');
    end if;

    if coalesce(array_length(v_profile.specialties, 1), 0) = 0 then
      v_missing := array_append(v_missing, 'Specialties');
    end if;

    if coalesce(array_length(v_profile.certifications, 1), 0) = 0 then
      v_missing := array_append(v_missing, 'Certifications');
    end if;

    if coalesce(btrim(v_profile.coaching_style), '') = '' then
      v_missing := array_append(v_missing, 'Coaching style');
    end if;

    if coalesce(btrim(v_profile.profile_photo_url), '') = '' then
      v_missing := array_append(v_missing, 'Profile photo');
    end if;

    if coalesce(btrim(v_profile.banner_image_url), '') = '' then
      v_missing := array_append(v_missing, 'Banner image');
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(coalesce(v_profile.social_links, '[]'::jsonb)) as item
      where coalesce(btrim(item ->> 'url'), '') <> ''
    ) then
      v_missing := array_append(v_missing, 'At least one social link');
    end if;

    if coalesce(btrim(v_settings.contact_email), '') = ''
       and coalesce(btrim(v_settings.support_email), '') = '' then
      v_missing := array_append(v_missing, 'Public contact path');
    end if;

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception
        using
          message = 'Profile is not ready to publish',
          detail = array_to_string(v_missing, ', ');
    end if;

    update public.pt_hub_profiles profile
    set
      is_published = true,
      published_at = coalesce(profile.published_at, now())
    where profile.user_id = v_user_id;
  else
    update public.pt_hub_profiles profile
    set
      is_published = false,
      published_at = null
    where profile.user_id = v_user_id;
  end if;

  return query
  select profile.is_published, profile.published_at
  from public.pt_hub_profiles profile
  where profile.user_id = v_user_id;
end;
$$;

revoke all on function public.set_pt_profile_publication(boolean) from public;
grant execute on function public.set_pt_profile_publication(boolean) to authenticated;
