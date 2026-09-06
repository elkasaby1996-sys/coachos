alter table public.marketing_leads
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists business_name text,
  add column if not exists coaching_model text,
  add column if not exists current_platform text,
  add column if not exists primary_reason text,
  add column if not exists message text,
  add column if not exists switching_timeline text,
  add column if not exists team_size text,
  add column if not exists data_to_move text,
  add column if not exists migration_concerns text;

create index if not exists marketing_leads_email_created_at_idx
  on public.marketing_leads (lower(email), created_at desc);
