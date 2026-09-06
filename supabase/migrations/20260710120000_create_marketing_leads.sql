create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('request_access', 'switch')),
  name text not null,
  email text not null,
  role text,
  coaching_business text,
  clients_range text,
  current_tools text,
  goal text,
  migration_notes text,
  consent boolean not null default false,
  page_path text,
  user_agent text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.marketing_leads enable row level security;

create index if not exists marketing_leads_created_at_idx
  on public.marketing_leads (created_at desc);

create index if not exists marketing_leads_type_created_at_idx
  on public.marketing_leads (type, created_at desc);

revoke all on public.marketing_leads from anon, authenticated;
