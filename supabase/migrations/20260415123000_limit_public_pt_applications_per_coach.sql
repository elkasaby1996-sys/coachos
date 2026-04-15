create or replace function public.submit_public_pt_application(
  p_slug text,
  p_full_name text,
  p_phone text,
  p_goal_summary text,
  p_training_experience text,
  p_package_interest_id uuid default null,
  p_package_interest_label_snapshot text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile record;
  v_lead_id uuid;
  v_slug text;
  v_applicant_user_id uuid;
  v_email text;
  v_full_name text;
  v_package_interest_label text;
  v_selected_package record;
  v_latest_lead record;
begin
  v_applicant_user_id := auth.uid();
  if v_applicant_user_id is null then
    raise exception 'Sign in is required before applying.';
  end if;

  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug = '' then
    raise exception 'Profile slug is required';
  end if;

  select
    profile.user_id,
    profile.slug
  into v_profile
  from public.pt_hub_profiles profile
  join public.pt_hub_settings settings
    on settings.user_id = profile.user_id
  where lower(profile.slug) = v_slug
    and profile.is_published = true
    and settings.profile_visibility = 'listed'
  limit 1;

  if not found then
    raise exception 'Published profile not found';
  end if;

  if v_profile.user_id = v_applicant_user_id then
    raise exception 'You cannot apply to your own public profile.';
  end if;

  v_email := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  if v_email is null then
    raise exception 'Your account email is missing.';
  end if;

  v_full_name := coalesce(
    nullif(btrim(coalesce(p_full_name, '')), ''),
    nullif(
      btrim(
        coalesce(
          auth.jwt() -> 'user_metadata' ->> 'full_name',
          auth.jwt() -> 'user_metadata' ->> 'name',
          ''
        )
      ),
      ''
    )
  );

  if v_full_name is null then
    raise exception 'Full name is required';
  end if;

  if coalesce(btrim(p_goal_summary), '') = '' then
    raise exception 'Goal summary is required';
  end if;

  perform public.enforce_rate_limit(
    'public_pt_application_burst',
    1,
    300,
    v_applicant_user_id,
    null,
    public.hash_rate_limit_key(v_slug),
    'You recently submitted an application. Please wait a few minutes before trying again.'
  );

  perform public.enforce_rate_limit(
    'public_pt_application_hourly',
    3,
    3600,
    v_applicant_user_id,
    null,
    null,
    'Too many applications were submitted from this account recently. Please try again later.'
  );

  if p_package_interest_id is not null then
    select
      pkg.id,
      pkg.title
    into v_selected_package
    from public.pt_packages pkg
    where pkg.id = p_package_interest_id
      and pkg.pt_user_id = v_profile.user_id
      and pkg.status = 'active'
      and pkg.is_public = true
    limit 1;

    if not found then
      raise exception 'Selected package is no longer available.';
    end if;

    v_package_interest_label := nullif(
      btrim(coalesce(v_selected_package.title, '')),
      ''
    );

    if v_package_interest_label is null then
      raise exception 'Selected package is no longer available.';
    end if;
  else
    v_package_interest_label := nullif(
      btrim(coalesce(p_package_interest_label_snapshot, '')),
      ''
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    hashtextextended(
      format(
        'public_pt_application:%s:%s',
        v_profile.user_id::text,
        v_applicant_user_id::text
      ),
      0
    )
  );

  select
    lead.id,
    lead.status
  into v_latest_lead
  from public.pt_hub_leads lead
  where lead.user_id = v_profile.user_id
    and lead.applicant_user_id = v_applicant_user_id
  order by lead.submitted_at desc nulls last, lead.id desc
  limit 1
  for update;

  if v_latest_lead.id is not null
     and coalesce(v_latest_lead.status, 'new') <> 'declined' then
    raise exception 'You already have an application with this coach. You can apply again only if they decline it.';
  end if;

  insert into public.pt_hub_leads (
    user_id,
    applicant_user_id,
    full_name,
    email,
    phone,
    goal_summary,
    training_experience,
    budget_interest,
    package_interest,
    package_interest_id,
    package_interest_label_snapshot,
    status,
    submitted_at,
    source,
    source_slug
  )
  values (
    v_profile.user_id,
    v_applicant_user_id,
    v_full_name,
    v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_goal_summary),
    nullif(btrim(coalesce(p_training_experience, '')), ''),
    null,
    v_package_interest_label,
    p_package_interest_id,
    v_package_interest_label,
    'new',
    now(),
    'public_profile',
    v_profile.slug
  )
  returning id into v_lead_id;

  return v_lead_id;
end;
$$;
