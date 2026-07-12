alter table public.marketing_leads
  add column if not exists form_type text,
  add column if not exists active_clients_range text,
  add column if not exists current_platform_other text,
  add column if not exists team_size_range text,
  add column if not exists migration_needs text[],
  add column if not exists consent_at timestamptz,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists status text not null default 'new';

update public.marketing_leads
set
  form_type = coalesce(form_type, type),
  active_clients_range = coalesce(active_clients_range, clients_range),
  team_size_range = coalesce(team_size_range, team_size),
  consent_at = coalesce(consent_at, created_at)
where form_type is null
   or active_clients_range is null
   or team_size_range is null
   or consent_at is null;

alter table public.marketing_leads
  alter column form_type set default 'request_access',
  alter column consent_at set default now();

alter table public.marketing_leads
  drop constraint if exists marketing_leads_status_check,
  add constraint marketing_leads_status_check
    check (status in ('new', 'contacted', 'qualified', 'closed', 'spam'));

alter table public.marketing_leads
  drop constraint if exists marketing_leads_form_type_check,
  add constraint marketing_leads_form_type_check
    check (form_type in ('request_access', 'switch'));

create index if not exists marketing_leads_status_created_at_idx
  on public.marketing_leads (status, created_at desc);

create index if not exists marketing_leads_platform_created_at_idx
  on public.marketing_leads (current_platform, created_at desc)
  where current_platform is not null;

revoke all on public.marketing_leads from anon, authenticated;
