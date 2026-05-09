create or replace function public.route_slugify(input_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(
    trim(both '-' from regexp_replace(
      regexp_replace(lower(trim(coalesce(input_text, ''))), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )),
    ''
  )
$$;

alter table public.pt_profiles
  add column if not exists public_slug text;

alter table public.workspaces
  add column if not exists slug text;

alter table public.clients
  add column if not exists url_key text;

do $$
declare
  profile_record record;
  workspace_record record;
  client_record record;
  base_slug text;
  candidate_slug text;
  suffix integer;
  reserved_slugs text[] := array[
    'admin', 'api', 'app', 'auth', 'login', 'logout', 'settings', 'billing',
    'support', 'help', 'new', 'edit', 'public', 'profile', 'pt-hub', 'w', 'p',
    'workspace', 'workspaces', 'client', 'clients', 'lead', 'leads'
  ];
begin
  for profile_record in
    select
      pp.id,
      coalesce(pp.display_name, ph.display_name, ph.full_name, 'coach') as source_name
    from public.pt_profiles pp
    left join public.pt_hub_profiles ph on ph.user_id = pp.user_id
    where pp.public_slug is null or btrim(pp.public_slug) = ''
    order by pp.created_at, pp.id
  loop
    base_slug := left(coalesce(public.route_slugify(profile_record.source_name), 'coach'), 56);
    if base_slug = any(reserved_slugs) then
      base_slug := left(base_slug || '-coach', 56);
    end if;
    candidate_slug := base_slug;
    suffix := 2;

    while exists (
      select 1 from public.pt_profiles p
      where lower(p.public_slug) = lower(candidate_slug)
        and p.id <> profile_record.id
    ) loop
      candidate_slug := left(base_slug, greatest(1, 56 - length('-' || suffix::text))) || '-' || suffix::text;
      suffix := suffix + 1;
    end loop;

    update public.pt_profiles
    set public_slug = candidate_slug
    where id = profile_record.id;
  end loop;

  for workspace_record in
    select id, name
    from public.workspaces
    where slug is null or btrim(slug) = ''
    order by created_at, id
  loop
    base_slug := left(coalesce(public.route_slugify(workspace_record.name), 'workspace'), 56);
    if base_slug = any(reserved_slugs) then
      base_slug := left(base_slug || '-space', 56);
    end if;
    candidate_slug := base_slug;
    suffix := 2;

    while exists (
      select 1 from public.workspaces w
      where lower(w.slug) = lower(candidate_slug)
        and w.id <> workspace_record.id
    ) loop
      candidate_slug := left(base_slug, greatest(1, 56 - length('-' || suffix::text))) || '-' || suffix::text;
      suffix := suffix + 1;
    end loop;

    update public.workspaces
    set slug = candidate_slug
    where id = workspace_record.id;
  end loop;

  for client_record in
    select id, workspace_id
    from public.clients
    where url_key is null or btrim(url_key) = ''
    order by workspace_id, created_at, id
  loop
    candidate_slug := 'c-' || lower(substr(replace(client_record.id::text, '-', ''), 1, 8));

    update public.clients
    set url_key = candidate_slug
    where id = client_record.id;
  end loop;
end $$;

alter table public.pt_profiles
  add constraint pt_profiles_public_slug_format_check
  check (
    public_slug is null
    or btrim(public_slug) = ''
    or public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

alter table public.workspaces
  add constraint workspaces_slug_format_check
  check (
    slug is null
    or btrim(slug) = ''
    or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

alter table public.clients
  add constraint clients_url_key_format_check
  check (
    url_key is null
    or btrim(url_key) = ''
    or url_key ~ '^c-[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

create unique index if not exists pt_profiles_public_slug_uidx
  on public.pt_profiles (lower(public_slug))
  where public_slug is not null and btrim(public_slug) <> '';

create unique index if not exists workspaces_slug_uidx
  on public.workspaces (lower(slug))
  where slug is not null and btrim(slug) <> '';

create unique index if not exists clients_workspace_url_key_uidx
  on public.clients (workspace_id, url_key)
  where url_key is not null and btrim(url_key) <> '';

create index if not exists workspaces_slug_lookup_idx
  on public.workspaces (slug);

create index if not exists clients_workspace_url_key_lookup_idx
  on public.clients (workspace_id, url_key);
