create table if not exists public.pt_packages (
  id uuid primary key default gen_random_uuid(),
  pt_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subtitle text,
  description text,
  price_label text,
  billing_cadence_label text,
  cta_label text,
  features jsonb,
  status text not null default 'draft',
  is_public boolean not null default false,
  sort_order integer not null default 0,
  currency_code text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pt_packages_status_check
    check (
      status = any (
        array[
          'draft'::text,
          'active'::text,
          'archived'::text
        ]
      )
    )
);

create index if not exists pt_packages_pt_user_id_idx
  on public.pt_packages (pt_user_id, sort_order, created_at, id);

create index if not exists pt_packages_public_selectable_idx
  on public.pt_packages (pt_user_id, sort_order, created_at, id)
  where status = 'active' and is_public = true;

drop trigger if exists set_pt_packages_updated_at on public.pt_packages;
create trigger set_pt_packages_updated_at
before update on public.pt_packages
for each row execute function public.set_updated_at();

create or replace function public.sync_pt_package_archive_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.title := nullif(btrim(coalesce(new.title, '')), '');
  if new.title is null then
    raise exception 'Package title is required';
  end if;

  if new.status = 'archived' then
    new.archived_at := coalesce(new.archived_at, now());
    new.is_public := false;
  elsif new.status in ('draft', 'active') then
    new.archived_at := null;
  end if;

  if new.sort_order is null then
    new.sort_order := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_pt_package_archive_state_trigger on public.pt_packages;
create trigger sync_pt_package_archive_state_trigger
before insert or update of title, status, is_public, archived_at, sort_order
on public.pt_packages
for each row execute function public.sync_pt_package_archive_state();

alter table public.pt_packages enable row level security;

drop policy if exists pt_packages_select_owner on public.pt_packages;
create policy pt_packages_select_owner
  on public.pt_packages
  for select
  to authenticated
  using (pt_user_id = (select auth.uid()));

drop policy if exists pt_packages_insert_owner on public.pt_packages;
create policy pt_packages_insert_owner
  on public.pt_packages
  for insert
  to authenticated
  with check (pt_user_id = (select auth.uid()));

drop policy if exists pt_packages_update_owner on public.pt_packages;
create policy pt_packages_update_owner
  on public.pt_packages
  for update
  to authenticated
  using (pt_user_id = (select auth.uid()))
  with check (pt_user_id = (select auth.uid()));

drop policy if exists pt_packages_select_public on public.pt_packages;
create policy pt_packages_select_public
  on public.pt_packages
  for select
  to anon, authenticated
  using (status = 'active' and is_public = true);

revoke all on table public.pt_packages from public;
grant select on table public.pt_packages to anon;
grant select, insert, update on table public.pt_packages to authenticated;
grant all on table public.pt_packages to service_role;

create index if not exists pt_hub_leads_package_interest_id_idx
  on public.pt_hub_leads (package_interest_id);

update public.pt_hub_leads lead
set package_interest_id = null
where lead.package_interest_id is not null
  and not exists (
    select 1
    from public.pt_packages pkg
    where pkg.id = lead.package_interest_id
  );

alter table public.pt_hub_leads
  drop constraint if exists pt_hub_leads_package_interest_id_fkey;

alter table public.pt_hub_leads
  add constraint pt_hub_leads_package_interest_id_fkey
  foreign key (package_interest_id)
  references public.pt_packages(id)
  on delete set null;

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
  v_active_lead_id uuid;
  v_package_interest_label text;
  v_selected_package record;
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

  select lead.id
  into v_active_lead_id
  from public.pt_hub_leads lead
  where lead.user_id = v_profile.user_id
    and lead.applicant_user_id = v_applicant_user_id
    and lead.status = any (
      array[
        'new'::text,
        'contacted'::text,
        'approved_pending_workspace'::text
      ]
    )
  order by lead.submitted_at desc
  limit 1
  for update;

  if v_active_lead_id is not null then
    update public.pt_hub_leads lead
    set
      full_name = v_full_name,
      email = v_email,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      goal_summary = btrim(p_goal_summary),
      training_experience = nullif(btrim(coalesce(p_training_experience, '')), ''),
      package_interest_id = p_package_interest_id,
      package_interest_label_snapshot = v_package_interest_label,
      package_interest = v_package_interest_label,
      source = 'public_profile',
      source_slug = v_profile.slug,
      submitted_at = now()
    where lead.id = v_active_lead_id;

    return v_active_lead_id;
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

create or replace function public.submit_public_pt_application(
  p_slug text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_goal_summary text,
  p_training_experience text,
  p_budget_interest text,
  p_package_interest text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.submit_public_pt_application(
    p_slug => p_slug,
    p_full_name => p_full_name,
    p_phone => p_phone,
    p_goal_summary => p_goal_summary,
    p_training_experience => p_training_experience,
    p_package_interest_id => null::uuid,
    p_package_interest_label_snapshot => nullif(btrim(coalesce(p_package_interest, '')), '')
  );
end;
$$;

revoke all on function public.submit_public_pt_application(
  text,
  text,
  text,
  text,
  text,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.submit_public_pt_application(
  text,
  text,
  text,
  text,
  text,
  uuid,
  text
) to authenticated, service_role;

revoke all on function public.submit_public_pt_application(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.submit_public_pt_application(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated, service_role;
