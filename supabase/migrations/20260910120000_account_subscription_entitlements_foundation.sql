-- PR-PRICE-02. No existing domain rows are changed. All commercial writes are
-- migration-owned or go through the narrow, explicitly granted RPCs below.
create table public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  requested_plan_key text not null default 'growth' check (requested_plan_key in ('launch', 'growth', 'scale')),
  requested_plan_source text not null default 'default' check (requested_plan_source in ('default', 'signup_metadata', 'signup_rpc', 'onboarding_retry', 'legacy_backfill', 'manual')),
  requested_plan_updated_at timestamptz not null default now(),
  created_source text not null check (created_source in ('signup', 'first_workspace', 'workspace_transfer', 'legacy_backfill', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commercial_trial_policy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  status text not null check (status in ('draft', 'active', 'retired')),
  feature_plan_version_id uuid not null references public.commercial_plan_versions(id) on delete restrict,
  duration_days integer not null check (duration_days > 0),
  recovery_days integer not null check (recovery_days >= 0),
  requires_card boolean not null,
  default_requested_plan_key text not null check (default_requested_plan_key in ('launch', 'growth', 'scale')),
  max_counted_clients integer not null check (max_counted_clients > 0),
  included_coach_seats integer not null check (included_coach_seats > 0),
  max_coach_seats integer not null check (max_coach_seats >= included_coach_seats),
  max_active_workspaces integer not null check (max_active_workspaces > 0),
  max_published_packages integer check (max_published_packages is null or max_published_packages > 0),
  effective_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_policy_retirement check ((status = 'retired') = (retired_at is not null))
);
create unique index commercial_one_active_trial_policy on public.commercial_trial_policy_versions(status) where status = 'active';

create table public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  plan_version_id uuid not null references public.commercial_plan_versions(id) on delete restrict,
  trial_policy_version_id uuid references public.commercial_trial_policy_versions(id) on delete restrict,
  subscription_kind text not null check (subscription_kind in ('trial', 'paid', 'complimentary', 'custom')),
  status text not null check (status in ('trialing', 'trial_recovery', 'active', 'past_due', 'grace', 'restricted', 'canceled', 'expired')),
  source text not null check (source in ('first_workspace', 'workspace_transfer', 'legacy_beta_backfill', 'manual', 'billing_provider')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_recovery_ends_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  status_changed_at timestamptz not null default now(),
  canceled_at timestamptz,
  restricted_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (billing_account_id, id),
  constraint subscription_trial_contract check (
    (subscription_kind = 'trial' and trial_policy_version_id is not null
      and trial_started_at is not null and trial_ends_at is not null and trial_recovery_ends_at is not null
      and trial_started_at < trial_ends_at and trial_ends_at < trial_recovery_ends_at)
    or (subscription_kind <> 'trial' and trial_policy_version_id is null
      and trial_started_at is null and trial_ends_at is null and trial_recovery_ends_at is null)
  ),
  constraint subscription_trial_status check (status not in ('trialing', 'trial_recovery') or subscription_kind = 'trial'),
  constraint subscription_period_order check (current_period_ends_at > current_period_started_at),
  constraint subscription_status_timestamps check (
    (status <> 'canceled' or canceled_at is not null)
    and (status <> 'restricted' or restricted_at is not null)
    and (status <> 'expired' or expired_at is not null)
    and (canceled_at is null or canceled_at <= status_changed_at)
    and (restricted_at is null or restricted_at <= status_changed_at)
    and (expired_at is null or expired_at <= status_changed_at)
    and (canceled_at is null or canceled_at >= coalesce(trial_started_at,created_at))
    and (restricted_at is null or restricted_at >= coalesce(trial_started_at,created_at))
    and (expired_at is null or expired_at >= coalesce(trial_started_at,created_at))
    and (subscription_kind <> 'trial' or expired_at is null or expired_at >= trial_recovery_ends_at)
  )
);
create unique index account_one_current_subscription on public.account_subscriptions(billing_account_id)
  where status in ('trialing', 'trial_recovery', 'active', 'past_due', 'grace', 'restricted');
create unique index account_one_lifetime_trial on public.account_subscriptions(billing_account_id) where subscription_kind = 'trial';

create table public.account_feature_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  feature_key text not null references public.commercial_features(feature_key) on update restrict on delete restrict,
  effect text not null check (effect in ('enable', 'disable')),
  reason text not null check (btrim(reason) <> ''),
  source text not null check (btrim(source) <> ''),
  approved_by uuid references auth.users(id) on delete restrict,
  starts_at timestamptz not null default now(),
  expires_at timestamptz check (expires_at > starts_at),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index account_override_resolution on public.account_feature_entitlement_overrides(billing_account_id, feature_key) where revoked_at is null;

create table public.account_subscription_events (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  subscription_id uuid,
  event_type text not null check (btrim(event_type) <> ''),
  from_status text check (from_status in ('trialing', 'trial_recovery', 'active', 'past_due', 'grace', 'restricted', 'canceled', 'expired')),
  to_status text check (to_status in ('trialing', 'trial_recovery', 'active', 'past_due', 'grace', 'restricted', 'canceled', 'expired')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  source text not null check (btrim(source) <> ''),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  foreign key (billing_account_id, subscription_id) references public.account_subscriptions(billing_account_id, id) on delete restrict
);
create index account_events_history on public.account_subscription_events(billing_account_id, occurred_at, id);
comment on column public.account_subscription_events.metadata is 'Commercial identifiers only. Never credentials, tokens, cookies, authorization headers, health, medical, workout, nutrition or client content.';

create function public.protect_commercial_trial_policy()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Published trial policies cannot be deleted.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'retired' then raise exception 'Retired trial policies are immutable.'; end if;
    if old.status = 'active' then
      if (to_jsonb(new) - array['status','retired_at','updated_at']) is distinct from
         (to_jsonb(old) - array['status','retired_at','updated_at']) then
        raise exception 'Active trial policy contracts are immutable.';
      end if;
      if new.status not in ('active','retired') then raise exception 'Active trial policies may only retire.'; end if;
    elsif new.status not in ('draft','active') then raise exception 'Draft trial policies must activate before retirement.';
    end if;
  end if;
  perform 1 from public.commercial_plan_versions where id = new.feature_plan_version_id and status in ('active','retired') for share;
  if not found then raise exception 'Trial policy requires an immutable plan version.'; end if;
  return new;
end;
$$;
create trigger commercial_trial_policy_immutable before insert or update or delete on public.commercial_trial_policy_versions
  for each row execute function public.protect_commercial_trial_policy();

create function public.protect_account_commercial_history()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' or tg_table_name = 'account_subscription_events' then
    raise exception 'Commercial history is append-only; deletion is not permitted.';
  end if;
  if tg_table_name = 'billing_accounts' then
    if new.id <> old.id or new.owner_user_id <> old.owner_user_id then raise exception 'Billing account identity is immutable.'; end if;
  elsif tg_table_name = 'account_subscriptions' then
    if tg_op = 'UPDATE' and
      (to_jsonb(new) - array['status','status_changed_at','canceled_at','restricted_at','expired_at','current_period_started_at','current_period_ends_at','cancel_at_period_end','updated_at']) is distinct from
      (to_jsonb(old) - array['status','status_changed_at','canceled_at','restricted_at','expired_at','current_period_started_at','current_period_ends_at','cancel_at_period_end','updated_at']) then
      raise exception 'Subscription identity and trial clock are immutable.';
    end if;
    perform 1 from public.commercial_plan_versions where id = new.plan_version_id and status in ('active','retired') for share;
    if not found then raise exception 'Subscription requires an immutable plan version.'; end if;
    if new.subscription_kind = 'trial' then
      perform 1 from public.commercial_trial_policy_versions
      where id = new.trial_policy_version_id and status in ('active','retired') and feature_plan_version_id = new.plan_version_id
        and new.trial_ends_at = new.trial_started_at + make_interval(days => duration_days)
        and new.trial_recovery_ends_at = new.trial_ends_at + make_interval(days => recovery_days) for share;
      if not found then raise exception 'Trial must match its immutable policy and dates.'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger billing_account_identity before update or delete on public.billing_accounts for each row execute function public.protect_account_commercial_history();
create trigger account_subscription_history before insert or update or delete on public.account_subscriptions for each row execute function public.protect_account_commercial_history();
create trigger account_events_append_only before update or delete on public.account_subscription_events for each row execute function public.protect_account_commercial_history();
create trigger billing_accounts_updated_at before update on public.billing_accounts for each row execute function public.set_updated_at();
create trigger trial_policy_updated_at before update on public.commercial_trial_policy_versions for each row execute function public.set_updated_at();
create trigger account_subscriptions_updated_at before update on public.account_subscriptions for each row execute function public.set_updated_at();

-- Audit commercial writes regardless of which reviewed admin path made them.
create function public.audit_account_commercial_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_type text; v_subscription_id uuid; v_from text; v_to text; v_metadata jsonb := '{}'; v_account_id uuid; v_source text;
begin
  if tg_table_name = 'billing_accounts' then
    v_account_id := new.id;
    v_source := new.requested_plan_source;
    if tg_op = 'INSERT' then
      v_type := 'billing_account.created';
      v_metadata := jsonb_build_object('createdSource', new.created_source);
    elsif new.requested_plan_key is distinct from old.requested_plan_key then
      v_type := 'requested_plan.changed';
      v_metadata := jsonb_build_object('fromPlanKey',old.requested_plan_key,'toPlanKey',new.requested_plan_key);
    end if;
  elsif tg_table_name = 'account_subscriptions' then
    v_account_id := new.billing_account_id; v_subscription_id := new.id; v_source := new.source; v_to := new.status;
    if tg_op = 'INSERT' then
      v_type := case new.subscription_kind when 'trial' then 'subscription.trial_started'
        when 'complimentary' then 'subscription.complimentary_access_created' else 'subscription.created' end;
      v_metadata := jsonb_build_object('planVersionId',new.plan_version_id,'trialPolicyVersionId',new.trial_policy_version_id);
    elsif new.status is distinct from old.status then
      v_type := 'subscription.status_changed'; v_from := old.status;
    end if;
  else
    v_account_id := new.billing_account_id; v_source := new.source;
    v_metadata := jsonb_build_object('overrideId',new.id,'featureKey',new.feature_key,'effect',new.effect);
    if tg_op = 'INSERT' then v_type := 'entitlement_override.created';
    elsif new.revoked_at is distinct from old.revoked_at then v_type := 'entitlement_override.revoked'; end if;
  end if;
  if v_type is not null then
    insert into public.account_subscription_events(billing_account_id,subscription_id,event_type,from_status,to_status,actor_user_id,source,metadata)
    values(v_account_id,v_subscription_id,v_type,v_from,v_to,auth.uid(),v_source,v_metadata);
  end if;
  return new;
end;
$$;
create trigger billing_account_audit after insert or update on public.billing_accounts for each row execute function public.audit_account_commercial_change();
create trigger account_subscription_audit after insert or update on public.account_subscriptions for each row execute function public.audit_account_commercial_change();

create function public.protect_account_override()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Revoke overrides; do not delete history.'; end if;
  if old.revoked_at is not null or new.revoked_at is null or
     (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at') then
    raise exception 'Overrides are immutable except for one-way revocation.';
  end if;
  return new;
end;
$$;
create trigger account_override_immutable before update or delete on public.account_feature_entitlement_overrides for each row execute function public.protect_account_override();
create trigger account_override_audit after insert or update on public.account_feature_entitlement_overrides for each row execute function public.audit_account_commercial_change();

-- No account-id or user-id input is accepted by runtime owner RPCs.
create function public.ensure_commercial_billing_account(p_owner_user_id uuid, p_created_source text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_id uuid; v_intent text;
begin
  select id into v_id from public.billing_accounts where owner_user_id = p_owner_user_id;
  if v_id is not null then return v_id; end if;
  -- Auth metadata is used only as non-privileged plan intent, never authorization.
  select lower(btrim(raw_user_meta_data->>'requested_plan')) into v_intent from auth.users where id = p_owner_user_id;
  insert into public.billing_accounts(owner_user_id,requested_plan_key,requested_plan_source,created_source)
  values(p_owner_user_id,case when v_intent in ('launch','growth','scale') then v_intent else 'growth' end,
    case when p_created_source = 'legacy_backfill' then 'legacy_backfill'
      when v_intent in ('launch','growth','scale') then 'signup_metadata' else 'default' end,p_created_source)
  on conflict (owner_user_id) do nothing returning id into v_id;
  if v_id is null then select id into strict v_id from public.billing_accounts where owner_user_id = p_owner_user_id; end if;
  return v_id;
end;
$$;

-- Fail atomically before any owner backfill or workspace trigger installation.
do $$
declare v_growth uuid; v_scale uuid;
begin
  select id into strict v_growth from public.commercial_plan_versions where plan_key = 'growth' and version = 1 and status = 'active';
  select id into strict v_scale from public.commercial_plan_versions where plan_key = 'scale' and version = 1 and status = 'active';
  insert into public.commercial_trial_policy_versions(version,status,feature_plan_version_id,duration_days,recovery_days,requires_card,default_requested_plan_key,
    max_counted_clients,included_coach_seats,max_coach_seats,max_active_workspaces,max_published_packages,effective_at)
  values(1,'active',v_growth,14,7,false,'growth',10,2,2,1,3,'2026-09-10 12:00:00+00');
end;
$$;

-- Admin-only migration helper retained for transactional backfill verification.
-- Never invoke as an ongoing signup mechanism: workspace triggers own new access.
create function public.backfill_legacy_billing_accounts()
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_scale uuid; v_growth uuid; v_policy uuid; v_owner uuid; v_account uuid;
begin
  select id into strict v_scale from public.commercial_plan_versions where plan_key = 'scale' and version = 1 and status = 'active';
  select id into strict v_growth from public.commercial_plan_versions where plan_key = 'growth' and version = 1 and status = 'active';
  select id into strict v_policy from public.commercial_trial_policy_versions where version = 1 and status = 'active' and feature_plan_version_id = v_growth;
  for v_owner in select distinct owner_user_id from public.workspaces where owner_user_id is not null order by owner_user_id loop
    v_account := public.ensure_commercial_billing_account(v_owner,'legacy_backfill');
    perform 1 from public.billing_accounts where id = v_account for update;
    if not exists(select 1 from public.account_subscriptions where billing_account_id = v_account) then
      insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
      values(v_account,v_scale,'complimentary','active','legacy_beta_backfill');
    end if;
  end loop;
end;
$$;
select public.backfill_legacy_billing_accounts();

create function public.start_account_trial_for_owner(p_owner_user_id uuid, p_source text)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_account uuid; v_policy public.commercial_trial_policy_versions%rowtype; v_start timestamptz := transaction_timestamp();
begin
  if p_owner_user_id is null then return; end if;
  if p_source not in ('first_workspace','workspace_transfer') then raise exception 'Invalid trial source.'; end if;
  v_account := public.ensure_commercial_billing_account(p_owner_user_id,p_source);
  -- All first-access writers take the same lock. A waiting writer observes the
  -- committed history before deciding; unique indexes provide a second guard.
  perform 1 from public.billing_accounts where id = v_account for update;
  if exists(select 1 from public.account_subscriptions where billing_account_id = v_account) then return; end if;
  select * into strict v_policy from public.commercial_trial_policy_versions where version = 1 and status = 'active';
  insert into public.account_subscriptions(billing_account_id,plan_version_id,trial_policy_version_id,subscription_kind,status,source,
    trial_started_at,trial_ends_at,trial_recovery_ends_at)
  values(v_account,v_policy.feature_plan_version_id,v_policy.id,'trial','trialing',p_source,
    v_start,v_start + make_interval(days => v_policy.duration_days),v_start + make_interval(days => v_policy.duration_days + v_policy.recovery_days));
end;
$$;
create function public.workspace_start_account_trial()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then perform public.start_account_trial_for_owner(new.owner_user_id,'first_workspace');
  elsif new.owner_user_id is distinct from old.owner_user_id then perform public.start_account_trial_for_owner(new.owner_user_id,'workspace_transfer'); end if;
  return new;
end;
$$;
-- Installed only AFTER the existing-beta backfill.
create trigger workspace_account_trial after insert or update of owner_user_id on public.workspaces
  for each row execute function public.workspace_start_account_trial();

create function public.set_my_requested_paid_plan(p_plan_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid(); v_account uuid;
begin
  if v_user is null or not exists(select 1 from public.pt_profiles where user_id = v_user) then
    raise exception 'PT authentication required.' using errcode = '42501';
  end if;
  if p_plan_key is null or p_plan_key not in ('launch','growth','scale') then raise exception 'Invalid requested plan.' using errcode = '22023'; end if;
  v_account := public.ensure_commercial_billing_account(v_user,'signup');
  update public.billing_accounts set requested_plan_key = p_plan_key,requested_plan_source = 'signup_rpc',requested_plan_updated_at = now()
  where id = v_account and requested_plan_key is distinct from p_plan_key;
  return jsonb_build_object('billingAccountId',v_account,'requestedPaidPlanKey',p_plan_key);
end;
$$;

create function public.effective_account_subscription_status(p_kind text,p_status text,p_trial_end timestamptz,p_recovery_end timestamptz,p_at timestamptz default now())
returns text language sql stable set search_path = pg_catalog, public
as $$
  select case when p_status is null then 'no_subscription'
    -- Explicit cancellation/restriction/expiry is never resurrected by a clock.
    when p_kind = 'trial' and p_status in ('trialing','trial_recovery') then
      case when p_at < p_trial_end then 'trialing' when p_at < p_recovery_end then 'trial_recovery' else 'expired' end
    else p_status end;
$$;
create function public.account_subscription_access_mode(p_status text)
returns text language sql immutable set search_path = pg_catalog, public
as $$
  select case p_status when 'no_subscription' then 'onboarding'
    when 'trialing' then 'full' when 'active' then 'full' when 'past_due' then 'full'
    when 'trial_recovery' then 'existing_delivery_only' when 'grace' then 'existing_delivery_only'
    when 'restricted' then 'read_only' when 'canceled' then 'read_only' else 'none' end;
$$;

-- Internal resolver takes the future-compatible billing-account boundary.
create function public.resolve_account_entitlements(p_billing_account_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare s public.account_subscriptions%rowtype; p public.commercial_plan_versions%rowtype; t public.commercial_trial_policy_versions%rowtype;
  v_status text; v_mode text; v_label text; v_targets jsonb := '[]'; v_enabled jsonb := '[]';
begin
  select * into s from public.account_subscriptions where billing_account_id = p_billing_account_id
    order by (status in ('trialing','trial_recovery','active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  select * into p from public.commercial_plan_versions where id = s.plan_version_id;
  select * into t from public.commercial_trial_policy_versions where id = s.trial_policy_version_id;
  v_status := public.effective_account_subscription_status(s.subscription_kind,s.status,s.trial_ends_at,s.trial_recovery_ends_at);
  v_mode := public.account_subscription_access_mode(v_status);
  v_label := case v_status when 'no_subscription' then 'Trial not started' when 'trialing' then 'Growth trial'
    when 'trial_recovery' then 'Trial ended' when 'expired' then case when s.subscription_kind = 'trial' then 'Trial expired' else 'Subscription expired' end
    when 'restricted' then 'Restricted' when 'canceled' then 'Canceled' when 'grace' then 'Grace period'
    when 'past_due' then 'Past due' else case when s.subscription_kind = 'complimentary' then 'Complimentary beta access' else p.display_name end end;
  if s.id is not null then
    select coalesce(jsonb_agg(feature_key order by feature_key),'[]') into v_targets from public.commercial_plan_feature_entitlements where plan_version_id = p.id;
    select coalesce(jsonb_agg(f.feature_key order by f.feature_key),'[]') into v_enabled
    from public.commercial_features f
    where f.readiness_status = 'COMMERCIALLY_SALEABLE'
      and (exists(select 1 from public.commercial_plan_feature_entitlements e where e.plan_version_id = p.id and e.feature_key = f.feature_key)
        or exists(select 1 from public.account_feature_entitlement_overrides o where o.billing_account_id = p_billing_account_id and o.feature_key = f.feature_key
          and o.effect = 'enable' and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now()) and o.revoked_at is null))
      and not exists(select 1 from public.account_feature_entitlement_overrides o where o.billing_account_id = p_billing_account_id and o.feature_key = f.feature_key
        and o.effect = 'disable' and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now()) and o.revoked_at is null);
  end if;
  return jsonb_build_object('schemaVersion',1,
    'subscription',jsonb_build_object('id',s.id,'kind',s.subscription_kind,'storedStatus',coalesce(s.status,'no_subscription'),
      'effectiveStatus',v_status,'accessMode',v_mode,'accessLabel',v_label,'planKey',p.plan_key,'planVersion',p.version,'planDisplayName',p.display_name,
      'trialStartedAt',s.trial_started_at,'trialEndsAt',s.trial_ends_at,'trialRecoveryEndsAt',s.trial_recovery_ends_at,
      'currentPeriodStartedAt',s.current_period_started_at,'currentPeriodEndsAt',s.current_period_ends_at,'cancelAtPeriodEnd',coalesce(s.cancel_at_period_end,false)),
    'limits',jsonb_build_object(
      'countedClients',case when s.subscription_kind = 'trial' then t.max_counted_clients else p.max_counted_clients end,
      'includedCoachSeats',case when s.subscription_kind = 'trial' then t.included_coach_seats else p.included_coach_seats end,
      'maxCoachSeats',case when s.subscription_kind = 'trial' then t.max_coach_seats else p.max_coach_seats end,
      'activeWorkspaces',case when s.subscription_kind = 'trial' then t.max_active_workspaces else p.max_active_workspaces end,
      'publishedPackages',case when s.subscription_kind = 'trial' then t.max_published_packages else p.max_published_packages end),
    'targetFeatureKeys',v_targets,'enabledFeatureKeys',v_enabled,'computedAt',now());
end;
$$;

create function public.get_my_effective_account_entitlements()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid(); a public.billing_accounts%rowtype;
begin
  -- pt_profiles is the canonical identity source, including the repository's
  -- legacy workspace-profile fallback. Metadata alone never establishes PT role.
  if v_user is null or not exists(select 1 from public.pt_profiles where user_id = v_user) then
    raise exception 'PT authentication required.' using errcode = '42501';
  end if;
  select * into a from public.billing_accounts where owner_user_id = v_user;
  return public.resolve_account_entitlements(a.id) || jsonb_build_object('billingAccount',jsonb_build_object(
    'id',a.id,'ownerUserId',v_user,'requestedPaidPlanKey',coalesce(a.requested_plan_key,'growth'),'canManageBilling',true));
end;
$$;
create function public.get_workspace_effective_entitlements(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_owner uuid; v_account uuid; v_result jsonb; v_subscription jsonb;
begin
  -- Existing access helper includes role permissions and active-member status.
  -- It is intentionally VOLATILE because denied team access can write its audit.
  if auth.uid() is null or not public.can_access_workspace(p_workspace_id) then
    raise exception 'Workspace access denied.' using errcode = '42501';
  end if;
  select owner_user_id into v_owner from public.workspaces where id = p_workspace_id;
  select id into v_account from public.billing_accounts where owner_user_id = v_owner;
  v_result := public.resolve_account_entitlements(v_account); v_subscription := v_result->'subscription';
  return jsonb_build_object('schemaVersion',1,'workspaceId',p_workspace_id,'billingOwnerUserId',v_owner,
    'canManageBilling',coalesce(v_owner = auth.uid(),false),'effectiveStatus',v_subscription->'effectiveStatus',
    'accessMode',v_subscription->'accessMode','accessLabel',v_subscription->'accessLabel','planKey',v_subscription->'planKey',
    'planVersion',v_subscription->'planVersion','planDisplayName',v_subscription->'planDisplayName',
    'limits',v_result->'limits','enabledFeatureKeys',v_result->'enabledFeatureKeys','computedAt',v_result->'computedAt');
end;
$$;

create function public.reconcile_account_subscription_state(p_billing_account_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare s public.account_subscriptions%rowtype; v_transitions integer := 0;
begin
  perform 1 from public.billing_accounts where id = p_billing_account_id for update;
  select * into s from public.account_subscriptions where billing_account_id = p_billing_account_id and subscription_kind = 'trial' for update;
  if s.status = 'trialing' and now() >= s.trial_ends_at then
    update public.account_subscriptions set status = 'trial_recovery',status_changed_at = now() where id = s.id;
    s.status := 'trial_recovery'; v_transitions := v_transitions + 1;
  end if;
  if s.status = 'trial_recovery' and now() >= s.trial_recovery_ends_at then
    update public.account_subscriptions set status = 'expired',expired_at = now(),status_changed_at = now() where id = s.id;
    v_transitions := v_transitions + 1;
  end if;
  return jsonb_build_object('billingAccountId',p_billing_account_id,'transitions',v_transitions);
end;
$$;

alter table public.billing_accounts enable row level security;
alter table public.commercial_trial_policy_versions enable row level security;
alter table public.account_subscriptions enable row level security;
alter table public.account_feature_entitlement_overrides enable row level security;
alter table public.account_subscription_events enable row level security;
revoke all on table public.billing_accounts, public.commercial_trial_policy_versions, public.account_subscriptions,
  public.account_feature_entitlement_overrides, public.account_subscription_events from public, anon, authenticated, service_role;

revoke all on function public.protect_commercial_trial_policy() from public, anon, authenticated, service_role;
revoke all on function public.protect_account_commercial_history() from public, anon, authenticated, service_role;
revoke all on function public.audit_account_commercial_change() from public, anon, authenticated, service_role;
revoke all on function public.protect_account_override() from public, anon, authenticated, service_role;
revoke all on function public.ensure_commercial_billing_account(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.backfill_legacy_billing_accounts() from public, anon, authenticated, service_role;
revoke all on function public.start_account_trial_for_owner(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.workspace_start_account_trial() from public, anon, authenticated, service_role;
revoke all on function public.set_my_requested_paid_plan(text) from public, anon, authenticated, service_role;
revoke all on function public.effective_account_subscription_status(text,text,timestamptz,timestamptz,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.account_subscription_access_mode(text) from public, anon, authenticated, service_role;
revoke all on function public.resolve_account_entitlements(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_effective_account_entitlements() from public, anon, authenticated, service_role;
revoke all on function public.get_workspace_effective_entitlements(uuid) from public, anon, authenticated, service_role;
revoke all on function public.reconcile_account_subscription_state(uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_my_requested_paid_plan(text) to authenticated;
grant execute on function public.get_my_effective_account_entitlements() to authenticated;
grant execute on function public.get_workspace_effective_entitlements(uuid) to authenticated;
grant execute on function public.reconcile_account_subscription_state(uuid) to service_role;
