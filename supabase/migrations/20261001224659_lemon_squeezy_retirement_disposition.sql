-- PAY-03B pre-launch database authority retirement.
-- Undeployed migration 185 is intentionally replaced in place. 1-184 are immutable.
-- No table/data/identity cleanup and no retained-state forensic classifier.
-- Native LS bodies remain owner-only historical internals; application roles
-- cannot execute them, and the shared definer paths below no longer call them.
begin;

revoke all on function
  public.begin_my_billing_checkout_attempt(text,text,uuid,text),
  public.get_my_billing_checkout_state(uuid),
  public.expire_stale_billing_checkout_attempts(uuid),
  public.get_billing_checkout_operation(uuid,uuid,text),
  public.complete_billing_checkout_attempt(uuid,text,timestamptz,text,text,timestamptz),
  public.fail_billing_checkout_attempt(uuid,text,timestamptz,boolean,text),
  public.get_billing_provider_store(text),
  public.record_billing_webhook_delivery(text,text,text,text,text,text,jsonb),
  public.fail_billing_webhook_delivery(uuid),
  public.reconcile_billing_provider_subscription(uuid,jsonb),
  public.get_billing_reconciliation_result(uuid),
  public.get_billing_portal_subscription(uuid,text),
  public.get_my_billing_provider_summary(),
  public.billing_plan_change_context(uuid,text),
  public.preview_billing_plan_change(uuid,text,text,text,jsonb),
  public.begin_billing_plan_change(uuid,text,text,text,uuid,jsonb),
  public.fail_billing_plan_change(uuid,uuid,boolean),
  public.begin_cancel_billing_plan_change(uuid,text,uuid),
  public.finish_billing_plan_change(uuid,text,jsonb,jsonb),
  public.apply_verified_billing_plan_change(uuid,jsonb,text,jsonb),
  public.get_my_legacy_billing_plan_change_state(),
  public.billing_seat_quantity_context(uuid,text),
  public.preview_billing_seat_quantity(uuid,text,integer,jsonb),
  public.begin_billing_seat_quantity(uuid,text,integer,uuid,jsonb),
  public.begin_cancel_billing_seat_quantity(uuid,text,uuid),
  public.fail_billing_seat_quantity(uuid,uuid,boolean),
  public.apply_verified_billing_seat_quantity(uuid,jsonb,text,jsonb),
  public.get_my_legacy_billing_seat_quantity_state()
from public, anon, authenticated, service_role;


-- Preserve account locks and Paddle cleanup; retained LS rows are not housekeeping targets.
CREATE OR REPLACE FUNCTION public.billing_guard_expire_checkouts(p_account uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if p_account is null then return; end if;
  perform public.billing_guard_lock(p_account);
  -- Account first. NOWAIT also protects against unsupported row-first writers.
  perform 1 from public.billing_checkouts_v2 where billing_account_id=p_account
    and status in ('creating','ready','ambiguous') order by id for update nowait;
  update public.billing_checkouts_v2 set status='expired',expired_at=now(),error_code='BILLING_CHECKOUT_EXPIRED',updated_at=now()
    where billing_account_id=p_account and status in ('creating','ready','ambiguous') and expected_expires_at<=now();
  update public.billing_checkouts_v2 set status='ambiguous',error_code='BILLING_CHECKOUT_CREATION_AMBIGUOUS',updated_at=now()
    where billing_account_id=p_account and status='creating' and creation_lease_expires_at<=now();
end $function$;

-- Preserve generic trial/complimentary and Paddle read-time entitlement contracts.
CREATE OR REPLACE FUNCTION public.resolve_account_entitlements(p_billing_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare s public.account_subscriptions%rowtype; p public.commercial_plan_versions%rowtype; t public.commercial_trial_policy_versions%rowtype;
  v_paid_unavailable boolean := false;
  v_status text; v_mode text; v_label text; v_targets jsonb := '[]'; v_enabled jsonb := '[]';
begin
  select * into s from public.account_subscriptions where billing_account_id = p_billing_account_id and status<>'superseded'
    order by (status in ('trialing','trial_recovery','active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  -- Paid authority must have a current Paddle link and its canonical origin.
  -- An LS origin/link is conflicting history, never an executable entitlement.
  if s.subscription_kind='paid' then
    v_paid_unavailable := not exists (
      select 1 from public.billing_subscriptions_v2 b
      join public.billing_canonical_origins o on o.account_subscription_id=b.account_subscription_id
        and o.billing_account_id=b.billing_account_id and o.storage_contract='billing.v2'
      where b.billing_account_id=p_billing_account_id and b.account_subscription_id=s.id
        and b.provider='paddle' and b.shadow_status='current'
    ) or exists (select 1 from public.billing_provider_subscriptions b where b.account_subscription_id=s.id);
  end if;
  select * into p from public.commercial_plan_versions where id = s.plan_version_id;
  -- Read-time target resolution avoids dependence on a punctual renewal webhook.
  if s.subscription_kind='paid' and not v_paid_unavailable and not s.cancel_at_period_end and s.status not in ('canceled','superseded') then
    select cp.* into p from public.commercial_plan_versions cp
    where cp.id=coalesce(public.billing_paddle_scheduled_plan_v1(s.id,now()),s.plan_version_id);
  end if;
  select * into t from public.commercial_trial_policy_versions where id = s.trial_policy_version_id;
  v_status := public.effective_account_subscription_status(s.subscription_kind,s.status,s.trial_ends_at,s.trial_recovery_ends_at);
  if s.subscription_kind='paid' and s.cancel_at_period_end and s.current_period_ends_at<=now() then v_status:='expired'; end if;
  v_mode := public.account_subscription_access_mode(v_status);
  v_label := case v_status when 'no_subscription' then 'Trial not started' when 'trialing' then 'Growth trial'
    when 'trial_recovery' then 'Trial ended' when 'expired' then case when s.subscription_kind = 'trial' then 'Trial expired' else 'Subscription expired' end
    when 'restricted' then 'Restricted' when 'canceled' then 'Canceled' when 'grace' then 'Grace period'
    when 'past_due' then 'Past due' else case when s.subscription_kind = 'complimentary' then 'Complimentary beta access' else p.display_name end end;
  if v_paid_unavailable then
    v_status := 'restricted'; v_mode := 'read_only'; v_label := 'Billing provider unavailable';
  end if;
  if s.id is not null and not v_paid_unavailable then
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
  return jsonb_build_object('schemaVersion',1,'billingUnavailable',v_paid_unavailable,
    'subscription',jsonb_build_object('id',s.id,'kind',s.subscription_kind,'storedStatus',coalesce(s.status,'no_subscription'),
      'effectiveStatus',v_status,'accessMode',v_mode,'accessLabel',v_label,'planKey',p.plan_key,'planVersion',p.version,'planDisplayName',p.display_name,
      'trialStartedAt',s.trial_started_at,'trialEndsAt',s.trial_ends_at,'trialRecoveryEndsAt',s.trial_recovery_ends_at,
      'currentPeriodStartedAt',s.current_period_started_at,'currentPeriodEndsAt',s.current_period_ends_at,'cancelAtPeriodEnd',coalesce(s.cancel_at_period_end,false)),
    'limits',jsonb_build_object(
      'countedClients',case when v_paid_unavailable then 0 when s.subscription_kind = 'trial' then t.max_counted_clients else p.max_counted_clients end,
      'includedCoachSeats',case when v_paid_unavailable then 0 when s.subscription_kind = 'trial' then t.included_coach_seats else p.included_coach_seats end,
      'maxCoachSeats',case when v_paid_unavailable then 0 when s.subscription_kind = 'trial' then t.max_coach_seats else p.max_coach_seats end,
      'activeWorkspaces',case when v_paid_unavailable then 0 when s.subscription_kind = 'trial' then t.max_active_workspaces else p.max_active_workspaces end,
      'publishedPackages',case when v_paid_unavailable then 0 when s.subscription_kind = 'trial' then t.max_published_packages else p.max_published_packages end),
    'targetFeatureKeys',v_targets,'enabledFeatureKeys',v_enabled,'computedAt',now());
end;
$function$;

-- Historical helper name retained for compatibility, not LS-paid servicing.
create or replace function public.billing_legacy_seat_effective_limit(p_account uuid,p_growth boolean default false)
returns integer language sql stable security definer set search_path=pg_catalog,public as $$
  select case when e#>>'{subscription,kind}'='paid' then 0 else (e#>>'{limits,maxCoachSeats}')::integer end
  from (select public.resolve_account_entitlements(p_account) e) q
$$;

CREATE OR REPLACE FUNCTION public.billing_seat_effective_limit(p_account uuid, p_growth boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare e jsonb:=public.resolve_account_entitlements(p_account);s public.billing_subscriptions_v2%rowtype;o public.billing_operations_v2%rowtype;n integer;begin
 select * into s from public.billing_subscriptions_v2 where billing_account_id=p_account and provider='paddle' and shadow_status='current' and account_subscription_id=(e#>>'{subscription,id}')::uuid;
 if s.id is null then return (e#>>'{limits,maxCoachSeats}')::integer;end if;
 n:=s.approved_additional_coach_seats;
 if p_growth then
  select * into o from public.billing_operations_v2 where subscription_id=s.id and operation_kind='seat_quantity' and effective_timing='period_end' and status not in ('completed','canceled','failed');
  if o.id is not null then n:=least(n,o.target_additional_seats);end if;
 end if;
 return least((e#>>'{limits,maxCoachSeats}')::integer,(e#>>'{limits,includedCoachSeats}')::integer+n);
end $function$;

-- No LS scheduled operation is capacity authority. Paddle scheduled seat
-- fencing stays in billing_seat_effective_limit; Paddle plan proof is unchanged.
create or replace function public.billing_plan_change_capacity_limit(p_account uuid,p_dimension text,p_current integer)
returns integer language sql stable security definer set search_path=pg_catalog,public as $$ select p_current $$;

-- Shared Paddle plan preflight must not derive seat allowance from LS history.
CREATE OR REPLACE FUNCTION public.billing_plan_change_preflight(p_owner uuid, p_account uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare c jsonb:=public.resolve_account_capacity(p_owner,p_account); p public.commercial_plan_versions%rowtype; d jsonb; lim integer; blockers jsonb:='[]'; route text; remedy text;
begin
  select * into strict p from public.commercial_plan_versions where id=p_target;
  for d in select value from jsonb_array_elements(c->'dimensions') loop
    lim:=case d->>'key' when 'counted_clients' then p.max_counted_clients when 'coach_seats' then least(p.max_coach_seats,p.included_coach_seats+coalesce((select approved_additional_coach_seats from public.billing_subscriptions_v2 where billing_account_id=p_account and provider='paddle' and shadow_status='current' and account_subscription_id=(c#>>'{subscription,id}')::uuid),0)) when 'active_workspaces' then p.max_active_workspaces when 'published_packages' then p.max_published_packages end;
    route:=case d->>'key' when 'counted_clients' then '/pt-hub/clients' when 'coach_seats' then '/pt-hub/workspaces' when 'active_workspaces' then '/pt-hub/workspaces' else '/pt-hub/packages' end;
    remedy:=case d->>'key' when 'counted_clients' then 'Review counted clients and finish or end relationships you no longer deliver.' when 'coach_seats' then 'Review active staff and pending invitations.' when 'active_workspaces' then 'Review workspace ownership before changing plans.' else 'Review which packages need to remain published.' end;
    if (lim is not null and (d->>'committed')::integer>lim) or coalesce((d->>'dataQualityIssue')::boolean,false) then
      blockers:=blockers||jsonb_build_array(jsonb_build_object('dimension',d->>'key','committed',(d->>'committed')::integer,'targetLimit',lim,'overBy',greatest(0,(d->>'committed')::integer-lim),'managementRoute',route,'remediation',remedy));
    end if;
  end loop;
  return jsonb_build_object('blockers',blockers,'snapshot',jsonb_build_object('dimensions',c->'dimensions','hasAnyDataQualityIssue',c->'hasAnyDataQualityIssue'));
end $function$;

-- Missing/unsupported paid authority returns unavailable; no private-reader bypass.
CREATE OR REPLACE FUNCTION public.get_my_billing_plan_change_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare s public.billing_subscriptions_v2%rowtype;a public.account_subscriptions%rowtype;o public.billing_operations_v2%rowtype;m public.billing_price_mappings%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null) then raise exception 'BILLING_PLAN_CHANGE_OWNER_REQUIRED' using errcode='42501';end if;
 select b.* into s from public.billing_subscriptions_v2 b join public.billing_accounts account on account.id=b.billing_account_id
 where account.owner_user_id=auth.uid() and b.provider='paddle' and b.shadow_status='current' and b.account_subscription_id is not null;
 if s.id is null or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=s.account_subscription_id and billing_account_id=s.billing_account_id and storage_contract='billing.v2')
 or coalesce((public.resolve_account_entitlements(s.billing_account_id)->>'billingUnavailable')::boolean,false) then
   return jsonb_build_object('provider',null,'linked',false,'eligible',false,'cadence',null,'operation',null);
 end if;
 select * into a from public.account_subscriptions where id=s.account_subscription_id;
 select * into m from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(s.id);
 select * into o from public.billing_operations_v2 where subscription_id=s.id order by (status not in ('completed','canceled','failed')) desc,provider_requested_at desc,id desc limit 1;
 return jsonb_build_object('provider','paddle','linked',true,'cadence',m.cadence,'eligible',s.environment='test' and
 (select paddle_reconciliation_enabled and entitlement_environment='test' from public.billing_runtime_policy where id=1)
 and s.provider_status='active' and s.reconciliation_status='processed' and s.approved_additional_coach_seats=0 and a.status='active' and not a.cancel_at_period_end
 and s.scheduled_cancel_at is null and (o.id is null or o.status in ('completed','failed','canceled')),
 'operation',case when o.id is null then null else jsonb_build_object('operationId',o.operation_id,'status',o.status,'targetPlanKey',(select canonical_key from public.billing_price_mappings where id=o.target_base_mapping_id),
 'targetCadence',o.target_cadence,'effectiveAt',o.effective_at,'effectiveTiming',o.effective_timing,'errorCode',o.error_code) end);
end $function$;

CREATE OR REPLACE FUNCTION public.get_my_billing_seat_quantity_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare s public.billing_subscriptions_v2%rowtype;m public.billing_price_mappings%rowtype;p public.commercial_plan_versions%rowtype;o public.billing_operations_v2%rowtype;d jsonb;unit integer;begin
 if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null) then raise exception 'BILLING_SEAT_QUANTITY_OWNER_REQUIRED' using errcode='42501';end if;
 select bs.* into s from public.billing_subscriptions_v2 bs join public.billing_accounts a on a.id=bs.billing_account_id where a.owner_user_id=auth.uid() and bs.provider='paddle' and bs.shadow_status='current' and bs.account_subscription_id is not null;
 if s.id is null or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=s.account_subscription_id and billing_account_id=s.billing_account_id and storage_contract='billing.v2')
 or coalesce((public.resolve_account_entitlements(s.billing_account_id)->>'billingUnavailable')::boolean,false) then
   return jsonb_build_object('available',false,'provider',null,'summary',null,'operation',null);
 end if;
 select * into m from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(s.id);
 select * into p from public.commercial_plan_versions where id=m.plan_version_id;
 select * into o from public.billing_operations_v2 where subscription_id=s.id and operation_kind='seat_quantity' order by provider_requested_at desc nulls last,id desc limit 1;
 select value into d from jsonb_array_elements(public.resolve_account_capacity(auth.uid(),s.billing_account_id)->'dimensions') where value->>'key'='coach_seats';
 unit:=case m.cadence when 'monthly' then 1200 else 12000 end;
 return jsonb_build_object('available',true,'provider','paddle','canCancel',false,
 'blockingOperation',case when exists(select 1 from public.billing_operations_v2 where subscription_id=s.id and operation_kind='plan_change' and status not in ('completed','canceled','failed')) then 'plan_change' end,
 'summary',jsonb_build_object('planKey',p.plan_key,'cadence',m.cadence,'includedSeats',p.included_coach_seats,'currentAdditionalSeats',s.approved_additional_coach_seats,
 'maximumSeats',p.max_coach_seats,'maximumAdditionalSeats',p.max_coach_seats-p.included_coach_seats,'currentEffectiveLimit',public.billing_seat_effective_limit(s.billing_account_id),
 'growthLimit',public.billing_seat_effective_limit(s.billing_account_id,true),'actual',d->'actual','pending',d->'pending','reserved',d->'reserved','committed',d->'committed',
 'unitPriceMinor',unit,'currentTotalMinor',m.unit_amount_minor+unit*s.approved_additional_coach_seats,'manualReview',s.reconciliation_status='manual_review' or coalesce(o.status='manual_review',false)),
 'operation',case when o.id is null then null else jsonb_build_object('id',o.operation_id,'status',o.status,'direction',case when o.effective_timing='immediate' then 'increase' else 'reduction' end,
 'targetAdditionalSeats',o.target_additional_seats,'effectiveAt',o.effective_at,'errorCode',o.error_code) end);
end $function$;

-- CREATE OR REPLACE preserves existing ownership and ACLs. No new public
-- helpers, granted wrappers, tables or data writes are installed by this migration.
commit;
