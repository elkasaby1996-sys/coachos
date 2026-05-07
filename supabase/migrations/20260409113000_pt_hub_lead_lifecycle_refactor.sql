alter table public.pt_hub_leads
  add column if not exists applicant_user_id uuid references auth.users(id) on delete set null,
  add column if not exists package_interest_id uuid,
  add column if not exists package_interest_label_snapshot text;

create index if not exists pt_hub_leads_applicant_user_id_idx
  on public.pt_hub_leads (applicant_user_id);

update public.pt_hub_leads
set package_interest_label_snapshot = coalesce(
  package_interest_label_snapshot,
  nullif(btrim(package_interest), '')
)
where package_interest_label_snapshot is null;

alter table public.pt_hub_leads
  drop constraint if exists pt_hub_leads_status_check;

update public.pt_hub_leads
set status = case
  when status = 'reviewed' then 'new'
  when status = 'consultation_booked' then 'contacted'
  when status = 'accepted' then 'converted'
  when status in ('rejected', 'archived') then 'declined'
  else status
end
where status in ('reviewed', 'consultation_booked', 'accepted', 'rejected', 'archived');

alter table public.pt_hub_leads
  drop constraint if exists pt_hub_leads_status_check;

alter table public.pt_hub_leads
  add constraint pt_hub_leads_status_check
  check (
    status = any (
      array[
        'new'::text,
        'contacted'::text,
        'approved_pending_workspace'::text,
        'converted'::text,
        'declined'::text
      ]
    )
  );

with ranked_active_duplicates as (
  select
    lead.id,
    row_number() over (
      partition by lead.user_id, lead.applicant_user_id
      order by lead.submitted_at desc, lead.created_at desc, lead.id desc
    ) as row_rank
  from public.pt_hub_leads lead
  where lead.applicant_user_id is not null
    and lead.status = any (
      array[
        'new'::text,
        'contacted'::text,
        'approved_pending_workspace'::text
      ]
    )
)
update public.pt_hub_leads lead
set status = 'declined'
from ranked_active_duplicates ranked
where lead.id = ranked.id
  and ranked.row_rank > 1;

create unique index if not exists pt_hub_leads_active_pair_uidx
  on public.pt_hub_leads (user_id, applicant_user_id)
  where applicant_user_id is not null
    and status = any (
      array[
        'new'::text,
        'contacted'::text,
        'approved_pending_workspace'::text
      ]
    );

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

  v_package_interest_label := nullif(
    btrim(coalesce(p_package_interest_label_snapshot, '')),
    ''
  );

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
      package_interest = coalesce(v_package_interest_label, lead.package_interest),
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

create or replace function public.pt_hub_approve_lead(
  p_lead_id uuid,
  p_workspace_id uuid default null,
  p_workspace_name text default null
)
returns table(
  lead_id uuid,
  status text,
  workspace_id uuid,
  client_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor_user_id uuid;
  v_lead public.pt_hub_leads%rowtype;
  v_target_workspace_id uuid;
  v_target_client_id uuid;
  v_workspace_name text;
begin
  v_actor_user_id := auth.uid();
  if v_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_lead_id is null then
    raise exception 'Lead is required';
  end if;

  select *
  into v_lead
  from public.pt_hub_leads lead
  where lead.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  if v_lead.user_id <> v_actor_user_id then
    raise exception 'Not allowed to update this lead';
  end if;

  if v_lead.status = 'declined' then
    raise exception 'Declined leads cannot be approved';
  end if;

  if v_lead.status = 'converted'
     and v_lead.converted_workspace_id is not null
     and v_lead.converted_client_id is not null then
    return query
    select
      v_lead.id,
      'converted'::text,
      v_lead.converted_workspace_id,
      v_lead.converted_client_id;
    return;
  end if;

  v_workspace_name := nullif(btrim(coalesce(p_workspace_name, '')), '');

  if p_workspace_id is not null then
    select workspace.id
    into v_target_workspace_id
    from public.workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_user_id = v_actor_user_id
    limit 1;

    if v_target_workspace_id is null then
      raise exception 'Workspace not found';
    end if;
  elsif v_workspace_name is not null then
    insert into public.workspaces (name, owner_user_id)
    values (v_workspace_name, v_actor_user_id)
    returning id into v_target_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_target_workspace_id, v_actor_user_id, 'pt_owner')
    on conflict on constraint workspace_members_pkey do update
      set role = 'pt_owner';
  else
    update public.pt_hub_leads lead
    set
      status = 'approved_pending_workspace',
      converted_at = null,
      converted_workspace_id = null,
      converted_client_id = null
    where lead.id = v_lead.id;

    return query
    select v_lead.id, 'approved_pending_workspace'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_lead.applicant_user_id is null then
    update public.pt_hub_leads lead
    set
      status = 'approved_pending_workspace',
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = null
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'approved_pending_workspace'::text,
      v_target_workspace_id,
      null::uuid;
    return;
  end if;

  begin
    select c.id
    into v_target_client_id
    from public.clients c
    where c.workspace_id = v_target_workspace_id
      and c.user_id = v_lead.applicant_user_id
    limit 1
    for update;

    if v_target_client_id is null then
      select c.id
      into v_target_client_id
      from public.clients c
      where c.workspace_id is null
        and c.user_id = v_lead.applicant_user_id
      order by c.created_at asc
      limit 1
      for update;
    end if;

    if v_target_client_id is null then
      insert into public.clients (
        workspace_id,
        user_id,
        status,
        display_name,
        full_name,
        email,
        phone
      )
      values (
        v_target_workspace_id,
        v_lead.applicant_user_id,
        'active',
        nullif(btrim(v_lead.full_name), ''),
        nullif(btrim(v_lead.full_name), ''),
        nullif(lower(btrim(coalesce(v_lead.email, ''))), ''),
        nullif(btrim(coalesce(v_lead.phone, '')), '')
      )
      returning id into v_target_client_id;
    else
      update public.clients c
      set
        workspace_id = v_target_workspace_id,
        status = 'active',
        display_name = coalesce(
          c.display_name,
          nullif(btrim(v_lead.full_name), '')
        ),
        full_name = coalesce(
          c.full_name,
          nullif(btrim(v_lead.full_name), '')
        ),
        email = coalesce(
          c.email,
          nullif(lower(btrim(coalesce(v_lead.email, ''))), '')
        ),
        phone = coalesce(
          c.phone,
          nullif(btrim(coalesce(v_lead.phone, '')), '')
        )
      where c.id = v_target_client_id;
    end if;

    perform public.ensure_workspace_client_onboarding(
      v_target_client_id,
      'converted_lead'
    );

    update public.pt_hub_leads lead
    set
      status = 'converted',
      converted_at = coalesce(lead.converted_at, now()),
      converted_workspace_id = v_target_workspace_id,
      converted_client_id = v_target_client_id
    where lead.id = v_lead.id;

    return query
    select
      v_lead.id,
      'converted'::text,
      v_target_workspace_id,
      v_target_client_id;
    return;
  exception
    when others then
      update public.pt_hub_leads lead
      set
        status = 'approved_pending_workspace',
        converted_workspace_id = v_target_workspace_id,
        converted_client_id = null
      where lead.id = v_lead.id;

      return query
      select
        v_lead.id,
        'approved_pending_workspace'::text,
        v_target_workspace_id,
        null::uuid;
      return;
  end;
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

revoke all on function public.pt_hub_approve_lead(uuid, uuid, text) from public, anon;
grant execute on function public.pt_hub_approve_lead(uuid, uuid, text) to authenticated, service_role;
