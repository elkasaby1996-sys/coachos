begin;

-- Evidence and narrow labels: docs/commercial-readiness-audit.md.
update public.commercial_features set readiness_status = 'COMMERCIALLY_SALEABLE',
  visibility = 'public', marketing_label = case feature_key
    when 'core.client_management' then 'Browse and filter your coaching clients'
    when 'core.lifecycle_management' then 'Manage client lifecycle states'
  end
where feature_key in ('core.client_management', 'core.lifecycle_management');

create function public.get_public_commercial_catalogue_v2()
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'schemaVersion', 2,
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
      'planKey', p.plan_key, 'planVersion', p.version, 'displayName', p.display_name,
      'currencyCode', p.currency_code, 'monthlyPriceMinor', p.monthly_price_minor,
      'annualPriceMinor', p.annual_price_minor,
      'capacities', jsonb_build_object('countedClients', p.max_counted_clients,
        'includedCoachSeats', p.included_coach_seats, 'maxCoachSeats', p.max_coach_seats,
        'activeWorkspaces', p.max_active_workspaces, 'publishedPackages', p.max_published_packages),
      'isMostPopular', p.is_most_popular,
      'features', (select coalesce(jsonb_agg(jsonb_build_object(
        'featureKey', f.feature_key, 'domain', f.domain, 'displayName', f.display_name,
        'marketingLabel', f.marketing_label) order by f.sort_order, f.feature_key), '[]'::jsonb)
        from public.commercial_plan_feature_entitlements e
        join public.commercial_features f on f.feature_key = e.feature_key
        where e.plan_version_id = p.id and f.visibility = 'public'
          and f.readiness_status = 'COMMERCIALLY_SALEABLE'
          and nullif(btrim(f.marketing_label), '') is not null)
      ) order by p.sort_order, p.plan_key, p.version), '[]'::jsonb)
      from public.commercial_plan_versions p
      where p.status = 'active' and p.is_public and p.plan_key <> 'custom'),
    'trial', (select jsonb_build_object('durationDays', t.duration_days,
      'cardRequired', t.requires_card, 'experiencePlanKey', p.plan_key,
      'capacities', jsonb_build_object('countedClients', t.max_counted_clients,
        'coachSeats', t.included_coach_seats, 'activeWorkspaces', t.max_active_workspaces,
        'publishedPackages', t.max_published_packages))
      from public.commercial_trial_policy_versions t
      join public.commercial_plan_versions p on p.id = t.feature_plan_version_id
      where t.version = 1 and t.status = 'active'),
    -- No add-on has real-provider publication approval. Never infer it from mappings.
    'addons', '[]'::jsonb
  );
$$;
revoke all on function public.get_public_commercial_catalogue_v2() from public, anon, authenticated, service_role;
grant execute on function public.get_public_commercial_catalogue_v2() to anon, authenticated, service_role;
comment on function public.get_public_commercial_catalogue_v2() is 'Public prospect-safe v2 projection. Publication approval is independent of plan membership and provider mapping activation.';
commit;
