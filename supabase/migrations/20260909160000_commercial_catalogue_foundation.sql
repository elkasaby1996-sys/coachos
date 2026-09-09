-- PR-PRICE-01: migration-owned catalogue, independent of account billing.
create table public.commercial_features (
  feature_key text primary key,
  domain text not null check (domain in ('core', 'acquisition', 'workspace', 'team', 'analytics', 'automation', 'integration', 'commercial', 'support')),
  display_name text not null check (btrim(display_name) <> ''),
  description text,
  readiness_status text not null default 'DRAFT' check (readiness_status in ('DRAFT', 'IMPLEMENTED', 'E2E_PROVEN', 'PRODUCTION_HARDENED', 'COMMERCIALLY_SALEABLE', 'RETIRED')),
  visibility text not null default 'internal' check (visibility in ('internal', 'beta', 'public')),
  marketing_label text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_feature_key_syntax check (feature_key ~ '^[a-z]+\.[a-z][a-z0-9]*(_[a-z0-9]+)*$'),
  constraint commercial_feature_key_domain check (split_part(feature_key, '.', 1) = domain)
);

create table public.commercial_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null check (plan_key in ('launch', 'growth', 'scale', 'custom')),
  version integer not null check (version > 0),
  display_name text not null check (btrim(display_name) <> ''),
  status text not null check (status in ('draft', 'active', 'retired')),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  monthly_price_minor integer not null check (monthly_price_minor >= 0),
  annual_price_minor integer not null check (annual_price_minor >= 0),
  max_counted_clients integer not null check (max_counted_clients > 0),
  included_coach_seats integer not null check (included_coach_seats > 0),
  max_coach_seats integer not null check (max_coach_seats >= included_coach_seats),
  max_active_workspaces integer not null check (max_active_workspaces > 0),
  max_published_packages integer check (max_published_packages is null or max_published_packages > 0),
  is_public boolean not null default false,
  is_most_popular boolean not null default false,
  sort_order integer not null check (sort_order >= 0),
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_key, version),
  constraint commercial_public_prices check (not is_public or (monthly_price_minor > 0 and annual_price_minor > 0)),
  constraint commercial_public_active check (not is_public or status = 'active'),
  constraint commercial_popular_public check (not is_most_popular or is_public),
  constraint commercial_retirement_timestamp check ((status = 'retired') = (retired_at is not null)),
  constraint commercial_custom_private check (plan_key <> 'custom' or not is_public)
);

create unique index commercial_one_active_version on public.commercial_plan_versions (plan_key) where status = 'active';
create unique index commercial_one_most_popular on public.commercial_plan_versions (is_most_popular) where status = 'active' and is_public and is_most_popular;
create unique index commercial_public_sort_order on public.commercial_plan_versions (sort_order) where status = 'active' and is_public;

create table public.commercial_plan_feature_entitlements (
  plan_version_id uuid not null references public.commercial_plan_versions(id) on delete restrict,
  feature_key text not null references public.commercial_features(feature_key) on update restrict on delete restrict,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  primary key (plan_version_id, feature_key)
);

create function public.protect_commercial_feature()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Commercial features cannot be deleted.';
  end if;
  if new.feature_key is distinct from old.feature_key then
    raise exception 'Commercial feature keys are immutable.';
  end if;
  return new;
end;
$$;

create function public.protect_commercial_plan_version()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Commercial plan versions cannot be deleted.';
  end if;
  if old.status = 'retired' then
    raise exception 'Retired commercial plan versions are immutable.';
  end if;
  if old.status = 'active' then
    -- Compare the whole row, including future columns, except retirement metadata.
    if (to_jsonb(new) - array['status', 'is_public', 'is_most_popular', 'retired_at', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['status', 'is_public', 'is_most_popular', 'retired_at', 'updated_at']) then
      raise exception 'Active commercial plan contracts are immutable.';
    end if;
    if new.status = 'retired' then
      if new.is_public or new.is_most_popular or new.retired_at is null then
        raise exception 'Retirement requires private, non-popular status and retired_at.';
      end if;
    elsif (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'Active commercial plans may only transition to retired.';
    end if;
  elsif new.status not in ('draft', 'active') then
    raise exception 'Draft commercial plans may only transition to active.';
  end if;
  return new;
end;
$$;

create function public.protect_commercial_entitlement()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
  v_plan record;
begin
  if tg_op <> 'INSERT' then v_old_id := old.plan_version_id; end if;
  if tg_op <> 'DELETE' then v_new_id := new.plan_version_id; end if;
  -- Lock both parents on a move. Activation and mapping edits must serialize.
  for v_plan in
    select id, status from public.commercial_plan_versions
    where id in (v_old_id, v_new_id) order by id for update
  loop
    if v_plan.status <> 'draft' then
      raise exception 'Commercial entitlements may only change while the plan is draft.';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.protect_commercial_feature() from public, anon, authenticated, service_role;
revoke all on function public.protect_commercial_plan_version() from public, anon, authenticated, service_role;
revoke all on function public.protect_commercial_entitlement() from public, anon, authenticated, service_role;

create trigger commercial_feature_immutable before update or delete on public.commercial_features
  for each row execute function public.protect_commercial_feature();
create trigger commercial_plan_version_immutable before update or delete on public.commercial_plan_versions
  for each row execute function public.protect_commercial_plan_version();
create trigger commercial_entitlement_immutable before insert or update or delete on public.commercial_plan_feature_entitlements
  for each row execute function public.protect_commercial_entitlement();
create trigger commercial_features_updated_at before update on public.commercial_features
  for each row execute function public.set_updated_at();
create trigger commercial_plan_versions_updated_at before update on public.commercial_plan_versions
  for each row execute function public.set_updated_at();

alter table public.commercial_features enable row level security;
alter table public.commercial_plan_versions enable row level security;
alter table public.commercial_plan_feature_entitlements enable row level security;
revoke all on table public.commercial_features, public.commercial_plan_versions, public.commercial_plan_feature_entitlements from public, anon, authenticated, service_role;

create function public.get_public_commercial_catalogue()
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('schemaVersion', 1, 'plans', coalesce(jsonb_agg(
    jsonb_build_object(
      'planKey', p.plan_key, 'planVersion', p.version, 'displayName', p.display_name,
      'currencyCode', p.currency_code, 'monthlyPriceMinor', p.monthly_price_minor,
      'annualPriceMinor', p.annual_price_minor,
      'capacities', jsonb_build_object(
        'countedClients', p.max_counted_clients, 'includedCoachSeats', p.included_coach_seats,
        'maxCoachSeats', p.max_coach_seats, 'activeWorkspaces', p.max_active_workspaces,
        'publishedPackages', p.max_published_packages
      ),
      'isMostPopular', p.is_most_popular,
      'features', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'featureKey', f.feature_key, 'displayName', f.display_name, 'marketingLabel', f.marketing_label
        ) order by f.sort_order, f.feature_key), '[]'::jsonb)
        from public.commercial_plan_feature_entitlements e
        join public.commercial_features f on f.feature_key = e.feature_key
        where e.plan_version_id = p.id and f.visibility = 'public'
          and f.readiness_status = 'COMMERCIALLY_SALEABLE'
      )
    ) order by p.sort_order, p.plan_key, p.version
  ), '[]'::jsonb))
  from public.commercial_plan_versions p
  where p.status = 'active' and p.is_public = true;
$$;
revoke all on function public.get_public_commercial_catalogue() from public, anon, authenticated, service_role;
grant execute on function public.get_public_commercial_catalogue() to anon, authenticated, service_role;

comment on column public.pt_hub_settings.subscription_plan is 'Non-authoritative compatibility/display string; not a paid subscription or canonical billing contract.';
comment on column public.pt_hub_settings.subscription_status is 'Non-authoritative compatibility/display string; does not enforce a trial or subscription lifecycle.';
comment on table public.commercial_plan_versions is 'Migration-managed versioned contracts. Retire active versions; never rewrite them. No account subscription state.';

-- Readiness evidence is recorded per feature in docs/commercial-catalogue.md.
insert into public.commercial_features (feature_key, domain, display_name, readiness_status, visibility, sort_order)
values
  ('core.client_management', 'core', 'Client management', 'IMPLEMENTED', 'internal', 10),
  ('core.client_onboarding', 'core', 'Client onboarding', 'IMPLEMENTED', 'internal', 20),
  ('core.workout_delivery', 'core', 'Workout delivery', 'DRAFT', 'internal', 30),
  ('core.program_delivery', 'core', 'Program delivery', 'DRAFT', 'internal', 40),
  ('core.exercise_library', 'core', 'Exercise library', 'IMPLEMENTED', 'internal', 50),
  ('core.custom_exercises', 'core', 'Custom exercises', 'DRAFT', 'internal', 60),
  ('core.nutrition_delivery', 'core', 'Nutrition delivery', 'IMPLEMENTED', 'internal', 70),
  ('core.habit_tracking', 'core', 'Habit tracking', 'DRAFT', 'internal', 80),
  ('core.checkins', 'core', 'Checkins', 'DRAFT', 'internal', 90),
  ('core.messaging', 'core', 'Messaging', 'IMPLEMENTED', 'internal', 100),
  ('core.progress_tracking', 'core', 'Progress tracking', 'DRAFT', 'internal', 110),
  ('core.lifecycle_management', 'core', 'Lifecycle management', 'DRAFT', 'internal', 120),
  ('core.risk_indicators', 'core', 'Risk indicators', 'DRAFT', 'internal', 130),
  ('core.data_export', 'core', 'Data export', 'DRAFT', 'internal', 140),
  ('acquisition.public_profile', 'acquisition', 'Public profile', 'IMPLEMENTED', 'internal', 150),
  ('acquisition.marketplace_eligibility', 'acquisition', 'Marketplace eligibility', 'DRAFT', 'internal', 160),
  ('acquisition.public_application', 'acquisition', 'Public application', 'DRAFT', 'internal', 170),
  ('acquisition.lead_pipeline', 'acquisition', 'Lead pipeline', 'IMPLEMENTED', 'internal', 180),
  ('acquisition.lead_chat', 'acquisition', 'Lead chat', 'IMPLEMENTED', 'internal', 190),
  ('acquisition.lead_source_reporting', 'acquisition', 'Lead source reporting', 'IMPLEMENTED', 'internal', 200),
  ('acquisition.conversion_reporting', 'acquisition', 'Conversion reporting', 'IMPLEMENTED', 'internal', 210),
  ('acquisition.package_reporting', 'acquisition', 'Package reporting', 'IMPLEMENTED', 'internal', 220),
  ('acquisition.team_lead_routing', 'acquisition', 'Team lead routing', 'DRAFT', 'internal', 230),
  ('workspace.basic_identity', 'workspace', 'Basic identity', 'IMPLEMENTED', 'internal', 240),
  ('workspace.custom_logo', 'workspace', 'Custom logo', 'DRAFT', 'internal', 250),
  ('workspace.custom_accent', 'workspace', 'Custom accent', 'DRAFT', 'internal', 260),
  ('workspace.custom_welcome_content', 'workspace', 'Custom welcome content', 'DRAFT', 'internal', 270),
  ('workspace.custom_invite_identity', 'workspace', 'Custom invite identity', 'DRAFT', 'internal', 280),
  ('workspace.multiple_workspaces', 'workspace', 'Multiple workspaces', 'IMPLEMENTED', 'internal', 290),
  ('workspace.cross_workspace_admin', 'workspace', 'Cross workspace admin', 'DRAFT', 'internal', 300),
  ('team.assigned_client_access', 'team', 'Assigned client access', 'IMPLEMENTED', 'internal', 310),
  ('team.additional_seats', 'team', 'Additional seats', 'DRAFT', 'internal', 320),
  ('team.standard_roles', 'team', 'Standard roles', 'IMPLEMENTED', 'internal', 330),
  ('team.custom_permissions', 'team', 'Custom permissions', 'DRAFT', 'internal', 340),
  ('team.audit_history', 'team', 'Audit history', 'DRAFT', 'internal', 350),
  ('team.workload_reporting', 'team', 'Workload reporting', 'DRAFT', 'internal', 360),
  ('team.cross_workspace_access', 'team', 'Cross workspace access', 'DRAFT', 'internal', 370),
  ('analytics.basic_dashboard', 'analytics', 'Basic dashboard', 'IMPLEMENTED', 'internal', 380),
  ('analytics.client_progress', 'analytics', 'Client progress', 'DRAFT', 'internal', 390),
  ('analytics.advanced_filters', 'analytics', 'Advanced filters', 'DRAFT', 'internal', 400),
  ('analytics.saved_segments', 'analytics', 'Saved segments', 'DRAFT', 'internal', 410),
  ('analytics.retention', 'analytics', 'Retention', 'DRAFT', 'internal', 420),
  ('analytics.multi_workspace', 'analytics', 'Multi workspace', 'DRAFT', 'internal', 430),
  ('analytics.team_performance', 'analytics', 'Team performance', 'DRAFT', 'internal', 440),
  ('analytics.scheduled_reports', 'analytics', 'Scheduled reports', 'DRAFT', 'internal', 450),
  ('automation.transactional_notifications', 'automation', 'Transactional notifications', 'DRAFT', 'internal', 460),
  ('automation.standard_templates', 'automation', 'Standard templates', 'DRAFT', 'internal', 470),
  ('automation.conditional_rules', 'automation', 'Conditional rules', 'DRAFT', 'internal', 480),
  ('automation.multi_step', 'automation', 'Multi step', 'DRAFT', 'internal', 490),
  ('automation.cross_workspace', 'automation', 'Cross workspace', 'DRAFT', 'internal', 500),
  ('automation.execution_history', 'automation', 'Execution history', 'DRAFT', 'internal', 510),
  ('integration.wearables', 'integration', 'Wearables', 'DRAFT', 'internal', 520),
  ('integration.calendar', 'integration', 'Calendar', 'DRAFT', 'internal', 530),
  ('integration.meeting_provider', 'integration', 'Meeting provider', 'DRAFT', 'internal', 540),
  ('integration.zapier_make', 'integration', 'Zapier make', 'DRAFT', 'internal', 550),
  ('integration.api', 'integration', 'Api', 'DRAFT', 'internal', 560),
  ('integration.webhooks', 'integration', 'Webhooks', 'DRAFT', 'internal', 570),
  ('commercial.published_packages', 'commercial', 'Published packages', 'DRAFT', 'internal', 580),
  ('commercial.client_payments', 'commercial', 'Client payments', 'DRAFT', 'internal', 590),
  ('commercial.revenue_reporting', 'commercial', 'Revenue reporting', 'DRAFT', 'internal', 600),
  ('support.standard', 'support', 'Standard', 'DRAFT', 'internal', 610),
  ('support.priority', 'support', 'Priority', 'DRAFT', 'internal', 620),
  ('support.migration_assistance', 'support', 'Migration assistance', 'DRAFT', 'internal', 630);

-- Always seed drafts, attach mappings, then activate through the protection triggers.
insert into public.commercial_plan_versions (
  plan_key, version, display_name, status, currency_code, monthly_price_minor, annual_price_minor,
  max_counted_clients, included_coach_seats, max_coach_seats, max_active_workspaces,
  max_published_packages, is_public, is_most_popular, sort_order, effective_at
) values
  ('launch', 1, 'Launch', 'draft', 'USD', 1900, 19000, 10, 1, 2, 1, 3, false, false, 10, '2026-09-09 16:00:00+00'),
  ('growth', 1, 'Growth', 'draft', 'USD', 5900, 59000, 50, 2, 5, 3, null, false, false, 20, '2026-09-09 16:00:00+00'),
  ('scale', 1, 'Scale', 'draft', 'USD', 11900, 119000, 100, 5, 10, 5, null, false, false, 30, '2026-09-09 16:00:00+00');

insert into public.commercial_plan_feature_entitlements (plan_version_id, feature_key)
select p.id, mapping.feature_key
from public.commercial_plan_versions p
join (values
  ('core.client_management', 10),
  ('core.client_onboarding', 10),
  ('core.workout_delivery', 10),
  ('core.program_delivery', 10),
  ('core.exercise_library', 10),
  ('core.custom_exercises', 10),
  ('core.nutrition_delivery', 10),
  ('core.habit_tracking', 10),
  ('core.checkins', 10),
  ('core.messaging', 10),
  ('core.progress_tracking', 10),
  ('core.lifecycle_management', 10),
  ('core.risk_indicators', 10),
  ('core.data_export', 10),
  ('acquisition.public_profile', 10),
  ('acquisition.marketplace_eligibility', 10),
  ('acquisition.public_application', 10),
  ('acquisition.lead_pipeline', 10),
  ('acquisition.lead_chat', 10),
  ('workspace.basic_identity', 10),
  ('team.assigned_client_access', 10),
  ('team.additional_seats', 10),
  ('analytics.basic_dashboard', 10),
  ('analytics.client_progress', 10),
  ('automation.transactional_notifications', 10),
  ('integration.wearables', 10),
  ('commercial.published_packages', 10),
  ('commercial.client_payments', 10),
  ('support.standard', 10),
  ('acquisition.lead_source_reporting', 20),
  ('acquisition.conversion_reporting', 20),
  ('acquisition.package_reporting', 20),
  ('workspace.custom_logo', 20),
  ('workspace.custom_accent', 20),
  ('workspace.custom_welcome_content', 20),
  ('workspace.custom_invite_identity', 20),
  ('workspace.multiple_workspaces', 20),
  ('team.standard_roles', 20),
  ('analytics.advanced_filters', 20),
  ('analytics.saved_segments', 20),
  ('analytics.retention', 20),
  ('automation.standard_templates', 20),
  ('automation.execution_history', 20),
  ('integration.calendar', 20),
  ('integration.meeting_provider', 20),
  ('commercial.revenue_reporting', 20),
  ('support.priority', 20),
  ('acquisition.team_lead_routing', 30),
  ('workspace.cross_workspace_admin', 30),
  ('team.custom_permissions', 30),
  ('team.audit_history', 30),
  ('team.workload_reporting', 30),
  ('team.cross_workspace_access', 30),
  ('analytics.multi_workspace', 30),
  ('analytics.team_performance', 30),
  ('analytics.scheduled_reports', 30),
  ('automation.conditional_rules', 30),
  ('automation.multi_step', 30),
  ('automation.cross_workspace', 30),
  ('integration.zapier_make', 30),
  ('integration.api', 30),
  ('integration.webhooks', 30),
  ('support.migration_assistance', 30)
) as mapping(feature_key, minimum_sort_order) on p.sort_order >= mapping.minimum_sort_order
where p.version = 1 and p.status = 'draft' and p.plan_key in ('launch', 'growth', 'scale');

update public.commercial_plan_versions
set status = 'active', is_public = true, is_most_popular = (plan_key = 'growth')
where version = 1 and status = 'draft' and plan_key in ('launch', 'growth', 'scale');
