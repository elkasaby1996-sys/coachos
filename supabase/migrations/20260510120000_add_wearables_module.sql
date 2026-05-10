create table if not exists public.workspace_wearable_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  allowed_providers text[] not null default array['garmin', 'whoop']::text[],
  enabled_metric_groups text[] not null default array['sleep', 'recovery', 'load_strain', 'activity', 'workouts', 'body_metrics']::text[],
  pt_visibility_mode text not null default 'summary_only',
  client_can_disconnect boolean not null default true,
  data_retention_mode text not null default 'retain_on_disconnect',
  freshness_threshold_hours integer not null default 24,
  client_consent_copy text not null default 'I consent to share wearable health and activity data with my coaching workspace for coaching context. Wearable data does not complete habits automatically.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_wearable_settings_workspace_id_key unique (workspace_id),
  constraint workspace_wearable_settings_pt_visibility_mode_check check (pt_visibility_mode in ('hidden', 'summary_only', 'full_metrics')),
  constraint workspace_wearable_settings_retention_mode_check check (data_retention_mode in ('retain_on_disconnect', 'delete_on_disconnect')),
  constraint workspace_wearable_settings_freshness_threshold_check check (freshness_threshold_hours between 1 and 720)
);

create table if not exists public.client_wearable_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,
  open_wearables_user_id text,
  open_wearables_connection_id text,
  status text not null default 'disconnected',
  consent_granted_at timestamptz,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_provider_sync_at timestamptz,
  revoked_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_wearable_connections_workspace_id_client_id_provider_key unique (workspace_id, client_id, provider),
  constraint client_wearable_connections_status_check check (status in ('disconnected', 'pending', 'connected', 'sync_failed', 'revoked'))
);

create table if not exists public.client_wearable_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,
  metric_date date not null,
  steps integer,
  active_minutes integer,
  distance_meters numeric,
  calories_active_kcal numeric,
  calories_total_kcal numeric,
  avg_heart_rate_bpm numeric,
  max_heart_rate_bpm numeric,
  resting_heart_rate_bpm numeric,
  hrv_rmssd_ms numeric,
  spo2_percent numeric,
  data_quality text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_wearable_daily_metrics_workspace_id_client_id_provider_metric_date_key unique (workspace_id, client_id, provider, metric_date)
);

create table if not exists public.client_wearable_sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,
  provider_record_id text not null,
  sleep_date date not null,
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes integer,
  sleep_score numeric,
  sleep_efficiency_percent numeric,
  awake_minutes integer,
  light_minutes integer,
  deep_minutes integer,
  rem_minutes integer,
  avg_hr_bpm numeric,
  avg_hrv_ms numeric,
  avg_spo2_percent numeric,
  respiratory_rate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_wearable_sleep_sessions_workspace_id_client_id_provider_provider_record_id_key unique (workspace_id, client_id, provider, provider_record_id)
);

create table if not exists public.client_wearable_health_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,
  provider_record_id text not null,
  score_type text not null,
  score_value numeric,
  score_unit text,
  recorded_at timestamptz not null,
  components jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_wearable_health_scores_workspace_id_client_id_provider_provider_record_id_score_type_key unique (workspace_id, client_id, provider, provider_record_id, score_type)
);

create table if not exists public.client_wearable_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,
  provider_record_id text not null,
  activity_type text not null,
  start_at timestamptz,
  end_at timestamptz,
  duration_seconds integer,
  distance_meters numeric,
  calories_kcal numeric,
  avg_hr_bpm numeric,
  max_hr_bpm numeric,
  strain_score numeric,
  source_payload_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_wearable_activities_workspace_id_client_id_provider_provider_record_id_key unique (workspace_id, client_id, provider, provider_record_id)
);

create table if not exists public.client_wearable_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  connection_id uuid references public.client_wearable_connections(id) on delete set null,
  provider text not null,
  sync_type text not null,
  window_start timestamptz,
  window_end timestamptz,
  status text not null default 'pending',
  records_imported integer not null default 0,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint client_wearable_sync_runs_status_check check (status in ('pending', 'running', 'succeeded', 'failed'))
);

create index if not exists client_wearable_connections_client_idx on public.client_wearable_connections (client_id, status);
create index if not exists client_wearable_daily_metrics_client_date_idx on public.client_wearable_daily_metrics (client_id, metric_date desc);
create index if not exists client_wearable_sleep_sessions_client_date_idx on public.client_wearable_sleep_sessions (client_id, sleep_date desc);
create index if not exists client_wearable_health_scores_client_recorded_idx on public.client_wearable_health_scores (client_id, recorded_at desc);
create index if not exists client_wearable_activities_client_start_idx on public.client_wearable_activities (client_id, start_at desc);
create index if not exists client_wearable_sync_runs_connection_idx on public.client_wearable_sync_runs (connection_id, created_at desc);

create trigger set_workspace_wearable_settings_updated_at
  before update on public.workspace_wearable_settings
  for each row execute function public.set_updated_at();

create trigger set_client_wearable_connections_updated_at
  before update on public.client_wearable_connections
  for each row execute function public.set_updated_at();

create trigger set_client_wearable_daily_metrics_updated_at
  before update on public.client_wearable_daily_metrics
  for each row execute function public.set_updated_at();

create trigger set_client_wearable_sleep_sessions_updated_at
  before update on public.client_wearable_sleep_sessions
  for each row execute function public.set_updated_at();

create trigger set_client_wearable_health_scores_updated_at
  before update on public.client_wearable_health_scores
  for each row execute function public.set_updated_at();

create trigger set_client_wearable_activities_updated_at
  before update on public.client_wearable_activities
  for each row execute function public.set_updated_at();

create or replace function public.is_own_client(p_client_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_workspace_client(p_workspace_id uuid, p_client_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.workspace_id = p_workspace_id
      and c.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.workspace_members wm
    left join public.workspace_member_client_assignments wmca
      on wmca.workspace_id = wm.workspace_id
     and wmca.member_id = wm.id
     and wmca.client_id = p_client_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and coalesce(wm.status, 'active') = 'active'
      and (
        coalesce(wm.client_access_mode, 'all_clients') = 'all_clients'
        or wmca.client_id is not null
      )
  );
$$;

create or replace function public.can_view_client_wearables(p_workspace_id uuid, p_client_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select public.is_own_client(p_client_id)
  or (
    public.can_access_workspace_client(p_workspace_id, p_client_id)
    and coalesce(
      (
        select wws.pt_visibility_mode
        from public.workspace_wearable_settings wws
        where wws.workspace_id = p_workspace_id
      ),
      'hidden'
    ) in ('summary_only', 'full_metrics')
  );
$$;

alter table public.workspace_wearable_settings enable row level security;
alter table public.client_wearable_connections enable row level security;
alter table public.client_wearable_daily_metrics enable row level security;
alter table public.client_wearable_sleep_sessions enable row level security;
alter table public.client_wearable_health_scores enable row level security;
alter table public.client_wearable_activities enable row level security;
alter table public.client_wearable_sync_runs enable row level security;

create policy workspace_wearable_settings_select_access
  on public.workspace_wearable_settings
  for select to authenticated
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_wearable_settings.workspace_id
        and w.owner_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_wearable_settings.workspace_id
        and wm.user_id = (select auth.uid())
        and coalesce(wm.status, 'active') = 'active'
    )
    or exists (
      select 1 from public.clients c
      where c.workspace_id = workspace_wearable_settings.workspace_id
        and c.user_id = (select auth.uid())
    )
  );

create policy workspace_wearable_settings_manage_access
  on public.workspace_wearable_settings
  for all to authenticated
  using (public.can_manage_workspace_team(workspace_id))
  with check (public.can_manage_workspace_team(workspace_id));

create policy client_wearable_connections_select_access
  on public.client_wearable_connections
  for select to authenticated
  using (public.can_view_client_wearables(workspace_id, client_id));

create policy client_wearable_connections_client_insert
  on public.client_wearable_connections
  for insert to authenticated
  with check (public.is_own_client(client_id));

create policy client_wearable_connections_client_update
  on public.client_wearable_connections
  for update to authenticated
  using (public.is_own_client(client_id))
  with check (public.is_own_client(client_id));

create policy client_wearable_daily_metrics_select_access
  on public.client_wearable_daily_metrics
  for select to authenticated
  using (public.can_view_client_wearables(workspace_id, client_id));

create policy client_wearable_sleep_sessions_select_access
  on public.client_wearable_sleep_sessions
  for select to authenticated
  using (public.can_view_client_wearables(workspace_id, client_id));

create policy client_wearable_health_scores_select_access
  on public.client_wearable_health_scores
  for select to authenticated
  using (public.can_view_client_wearables(workspace_id, client_id));

create policy client_wearable_activities_select_access
  on public.client_wearable_activities
  for select to authenticated
  using (public.can_view_client_wearables(workspace_id, client_id));

create policy client_wearable_sync_runs_select_access
  on public.client_wearable_sync_runs
  for select to authenticated
  using (public.can_view_client_wearables(workspace_id, client_id));

grant all on table public.workspace_wearable_settings to authenticated, service_role;
grant all on table public.client_wearable_connections to authenticated, service_role;
grant select on table public.client_wearable_daily_metrics to authenticated;
grant select on table public.client_wearable_sleep_sessions to authenticated;
grant select on table public.client_wearable_health_scores to authenticated;
grant select on table public.client_wearable_activities to authenticated;
grant select on table public.client_wearable_sync_runs to authenticated;
grant all on table public.client_wearable_daily_metrics to service_role;
grant all on table public.client_wearable_sleep_sessions to service_role;
grant all on table public.client_wearable_health_scores to service_role;
grant all on table public.client_wearable_activities to service_role;
grant all on table public.client_wearable_sync_runs to service_role;
grant execute on function public.is_own_client(uuid) to authenticated;
grant execute on function public.can_access_workspace_client(uuid, uuid) to authenticated;
grant execute on function public.can_view_client_wearables(uuid, uuid) to authenticated;
