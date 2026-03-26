create or replace function public.pt_update_client_admin_fields(
  p_client_id uuid,
  p_training_type text,
  p_tags text
)
returns public.clients
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_workspace_id uuid;
begin
  select c.workspace_id
  into v_workspace_id
  from public.clients c
  where c.id = p_client_id;

  if v_workspace_id is null then
    raise exception 'client not found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text like 'pt_%'
  ) then
    raise exception 'not allowed';
  end if;

  if p_training_type is not null
     and p_training_type not in ('online', 'hybrid', 'in_person') then
    raise exception 'invalid training_type %', p_training_type;
  end if;

  update public.clients
  set
    training_type = coalesce(p_training_type, training_type),
    tags = coalesce(p_tags, tags)
  where id = p_client_id;

  return (
    select c
    from public.clients c
    where c.id = p_client_id
  );
end;
$$;

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
    if coalesce(btrim(v_profile.slug), '') = '' then
      v_missing := array_append(v_missing, 'Public URL slug');
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

    if coalesce(v_settings.profile_visibility, 'draft') <> 'listed' then
      v_missing := array_append(
        v_missing,
        'Profile visibility must be set to Ready to list'
      );
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
