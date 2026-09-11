-- PR-PRICE-06: narrow owner/server reads and guarded lifecycle reconciliation.
-- No URL storage, new tables, catalogue changes or remote configuration.
begin;
create function public.get_billing_portal_subscription(p_owner uuid,p_environment text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; s uuid; b public.billing_provider_subscriptions%rowtype; local_status text;
begin
  if p_owner is null or not exists(select 1 from public.pt_profiles where user_id=p_owner and workspace_id is null) then
    raise exception 'BILLING_PORTAL_OWNER_REQUIRED' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=p_owner;
  if a is null then raise exception 'BILLING_PORTAL_SUBSCRIPTION_NOT_FOUND'; end if;
  select id,status into s,local_status from public.account_subscriptions where billing_account_id=a
    order by (status in ('trialing','trial_recovery','active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  select * into b from public.billing_provider_subscriptions where billing_account_id=a and account_subscription_id=s
    and provider='lemonsqueezy' and environment=p_environment;
  if b.id is null then raise exception 'BILLING_PORTAL_SUBSCRIPTION_NOT_FOUND'; end if;
  if b.provider_store_id is distinct from public.get_billing_provider_store(p_environment) then
    raise exception 'BILLING_PORTAL_IDENTITY_MISMATCH'; end if;
  if not exists(select 1 from public.account_subscriptions where id=s and subscription_kind='paid') or
    not exists(select 1 from public.billing_provider_customers where billing_account_id=a and provider=b.provider and environment=b.environment
      and provider_store_id=b.provider_store_id and provider_customer_id=b.provider_customer_id) then
    raise exception 'BILLING_PORTAL_IDENTITY_MISMATCH'; end if;
  return jsonb_build_object('provider',b.provider,'environment',b.environment,'store_id',b.provider_store_id,
    'customer_id',b.provider_customer_id,'subscription_id',b.provider_subscription_id,'local_subscription_id',s,'local_status',local_status);
end $$;

create function public.get_my_billing_provider_summary() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; s public.account_subscriptions%rowtype; b public.billing_provider_subscriptions%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.pt_profiles where user_id=auth.uid() and workspace_id is null) then
    raise exception 'BILLING_PORTAL_OWNER_REQUIRED' using errcode='42501'; end if;
  select id into a from public.billing_accounts where owner_user_id=auth.uid();
  select * into s from public.account_subscriptions where billing_account_id=a
    order by (status in ('trialing','trial_recovery','active','past_due','grace','restricted')) desc,created_at desc,id desc limit 1;
  select * into b from public.billing_provider_subscriptions where billing_account_id=a and account_subscription_id=s.id;
  return jsonb_build_object('linked',b.id is not null,'status',case when b.id is not null then s.status else null end,
    'cancelAtPeriodEnd',coalesce(s.cancel_at_period_end,false),'currentPeriodEndsAt',s.current_period_ends_at,
    'reconciliationStatus',b.reconciliation_status,'errorCode',case when b.reconciliation_status='manual_review' then
      case when b.reconciliation_error_code='BILLING_UNAPPROVED_PLAN_CHANGE' then 'BILLING_UNAPPROVED_PLAN_CHANGE' else 'BILLING_RECONCILIATION_MANUAL_REVIEW' end else null end,
    'revision',case when b.id is not null then b.latest_snapshot_sha256 else null end,
    'pending',exists(select 1 from public.billing_provider_webhook_deliveries d where d.provider=b.provider and d.environment=b.environment
      and d.provider_subscription_id=b.provider_subscription_id and d.processing_status in ('received','deferred','failed')));
end $$;

create function public.get_billing_reconciliation_result(p_delivery uuid) returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('processingStatus',processing_status,'code',case when last_error_code='BILLING_UNAPPROVED_PLAN_CHANGE'
    then 'BILLING_UNAPPROVED_PLAN_CHANGE' when last_error_code is not null then 'BILLING_RECONCILIATION_MANUAL_REVIEW' else null end)
    from public.billing_provider_webhook_deliveries where id=p_delivery
$$;
revoke all on function public.get_billing_portal_subscription(uuid,text),public.get_my_billing_provider_summary(),public.get_billing_reconciliation_result(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_billing_provider_summary() to authenticated;
grant execute on function public.get_billing_portal_subscription(uuid,text),public.get_billing_reconciliation_result(uuid) to service_role;

create or replace function public.reconcile_billing_provider_subscription(p_delivery uuid,p_snapshot jsonb default null)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_provider_webhook_deliveries%rowtype; b public.billing_provider_subscriptions%rowtype;
  t public.billing_checkout_attempts%rowtype; m public.billing_provider_variant_mappings%rowtype;
  a uuid; local_id uuid; old_kind text; local_status text; h text; code text; sid text; stamp timestamptz; end_at timestamptz;
  tx_at constant timestamptz:=transaction_timestamp(); cancel_pending boolean; provider_created timestamptz;
begin
  select * into strict d from public.billing_provider_webhook_deliveries where id=p_delivery for update;
  if d.processing_status in ('processed','ignored') then return 'replayed'; end if;
  update public.billing_provider_webhook_deliveries set attempt_count=attempt_count+1,last_attempt_at=now(),last_error_code=null where id=d.id;
  if d.event_name not in ('subscription_plan_changed','subscription_created','subscription_updated','subscription_cancelled','subscription_resumed','subscription_expired','subscription_paused','subscription_unpaused','subscription_payment_success','subscription_payment_failed','subscription_payment_recovered') then
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code='BILLING_WEBHOOK_UNSUPPORTED_EVENT' where id=d.id;
    return 'ignored';
  end if;
  -- Per-subscription lock followed by the same account lock used by capacity mutations.
  perform pg_advisory_xact_lock(hashtextextended('billing-subscription:'||d.environment||':'||d.provider_subscription_id,0));
  select * into b from public.billing_provider_subscriptions where provider=d.provider and environment=d.environment and provider_subscription_id=d.provider_subscription_id;
  if b.id is null and d.event_name<>'subscription_created' then
    update public.billing_provider_webhook_deliveries set processing_status='deferred',last_error_code='BILLING_RECONCILIATION_DEFERRED' where id=d.id;
    return 'deferred';
  end if;
  begin
    if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or p_snapshot - array['provider','environment','store_id','subscription_id','customer_id','order_id','order_item_id','product_id','variant_id','price_id','first_subscription_item_id','quantity','status','cancelled','renews_at','ends_at','trial_ends_at','created_at','updated_at'] <> '{}'::jsonb then raise exception 'BILLING_RECONCILIATION_FAILED'; end if;
    if p_snapshot->>'provider' is distinct from 'lemonsqueezy' or p_snapshot->>'environment' is distinct from d.environment then raise exception 'BILLING_WEBHOOK_ENVIRONMENT_MISMATCH'; end if;
    if p_snapshot->>'store_id' is distinct from public.get_billing_provider_store(d.environment) or p_snapshot->>'store_id' is distinct from d.normalized_payload->>'store_id' then raise exception 'BILLING_WEBHOOK_STORE_MISMATCH'; end if;
    sid:=p_snapshot->>'subscription_id';
    if sid is distinct from d.provider_subscription_id then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if b.id is null then
      select * into t from public.billing_checkout_attempts where id=(d.normalized_payload->>'checkout_attempt_id')::uuid;
      if t.id is null then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
      a:=t.billing_account_id;
      perform 1 from public.billing_accounts where id=a for update;
      -- Re-read under lock: checkout completion/expiry may have raced retrieval.
      select * into t from public.billing_checkout_attempts where id=t.id for update;
      if t.id is null or t.billing_account_id is distinct from (d.normalized_payload->>'billing_account_id')::uuid
        or t.plan_version_id is distinct from (d.normalized_payload->>'plan_version_id')::uuid or t.environment<>d.environment
        or t.status not in ('creating','ready','ambiguous','expired')
        or (p_snapshot->>'created_at')::timestamptz not between t.created_at and t.expected_expires_at then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
      -- Delayed linkage uses the approved attempt, never a replacement sale mapping.
      select * into m from public.billing_provider_variant_mappings where id=t.variant_mapping_id for share;
      if m.id is null or m.status not in ('active','retired') or
        (m.status='retired' and (m.retired_at is null or t.created_at>m.retired_at)) then raise exception 'BILLING_SUBSCRIPTION_VARIANT_MISMATCH'; end if;
    else
      a:=b.billing_account_id;
      perform 1 from public.billing_accounts where id=a for update;
      -- Existing obligations retain their exact immutable historical mapping.
      select * into m from public.billing_provider_variant_mappings where id=b.variant_mapping_id for share;
      if m.id is null or m.status not in ('active','retired') then raise exception 'BILLING_SUBSCRIPTION_VARIANT_MISMATCH'; end if;
    end if;
    if p_snapshot->>'customer_id' is null or exists(select 1 from public.billing_provider_customers c where c.provider=d.provider and c.environment=d.environment and
      ((c.billing_account_id=a and c.provider_customer_id<>p_snapshot->>'customer_id') or (c.provider_customer_id=p_snapshot->>'customer_id' and c.billing_account_id<>a))) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    -- Exact approved Price identity also fixes cadence: provider prices are immutable.
    -- No local plan-change operation exists in PR-PRICE-06.
    if b.id is not null and (m.provider_product_id is distinct from p_snapshot->>'product_id' or
      m.provider_variant_id is distinct from p_snapshot->>'variant_id' or m.provider_price_id is distinct from p_snapshot->>'price_id') then
      raise exception 'BILLING_UNAPPROVED_PLAN_CHANGE'; end if;
    if m.environment<>d.environment or m.provider_store_id<>p_snapshot->>'store_id' or m.provider_product_id is distinct from p_snapshot->>'product_id' then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if m.provider_variant_id is distinct from p_snapshot->>'variant_id' then raise exception 'BILLING_SUBSCRIPTION_VARIANT_MISMATCH'; end if;
    if m.provider_price_id is distinct from p_snapshot->>'price_id' then raise exception 'BILLING_SUBSCRIPTION_PRICE_MISMATCH'; end if;
    if (p_snapshot->>'quantity')::integer is distinct from 1 then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
    if p_snapshot->>'status'='on_trial' or p_snapshot->>'trial_ends_at' is not null then raise exception 'BILLING_SUBSCRIPTION_UNSUPPORTED_TRIAL'; end if;
    if p_snapshot->>'status' is null or p_snapshot->>'status' not in ('active','paused','past_due','unpaid','cancelled','expired') then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    if jsonb_typeof(p_snapshot->'cancelled') is distinct from 'boolean' or
      (p_snapshot->>'status'='cancelled' and (p_snapshot->>'cancelled')::boolean is distinct from true) or
      (p_snapshot->>'status' in ('active','paused','past_due','unpaid') and (p_snapshot->>'cancelled')::boolean is distinct from false) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    stamp:=(p_snapshot->>'updated_at')::timestamptz;
    if stamp is null then raise exception 'BILLING_RECONCILIATION_FAILED'; end if;
    if b.id is not null then
      if (b.provider_customer_id,b.provider_order_id,b.provider_order_item_id,b.first_subscription_item_id,b.provider_created_at) is distinct from
        (p_snapshot->>'customer_id',p_snapshot->>'order_id',p_snapshot->>'order_item_id',p_snapshot->>'first_subscription_item_id',(p_snapshot->>'created_at')::timestamptz) then raise exception 'BILLING_SUBSCRIPTION_IDENTITY_MISMATCH'; end if;
      if stamp<b.provider_updated_at then
        update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code='BILLING_RECONCILIATION_STALE' where id=d.id;
        return 'ignored';
      end if;
    end if;
    h:=encode(extensions.digest(p_snapshot::text,'sha256'),'hex');
    if b.id is not null and stamp=b.provider_updated_at and h<>b.latest_snapshot_sha256 then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    end_at:=(case when p_snapshot->>'status' in ('cancelled','expired') then p_snapshot->>'ends_at' else p_snapshot->>'renews_at' end)::timestamptz;
    provider_created:=(p_snapshot->>'created_at')::timestamptz;
    if provider_created is null or (b.id is null and end_at is not null and end_at<=provider_created) or
      (p_snapshot->>'status' in ('active','past_due','cancelled','expired') and end_at is null) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
    local_status:=case p_snapshot->>'status' when 'past_due' then 'past_due' when 'unpaid' then 'grace' when 'expired' then 'expired'
      when 'cancelled' then case when end_at>tx_at then 'active' else 'expired' end else 'active' end;
    cancel_pending:=p_snapshot->>'status'='cancelled' and end_at>tx_at;
    if b.id is null then
      if exists(select 1 from public.account_subscriptions where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted') and subscription_kind not in ('trial','complimentary')) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
      select subscription_kind into old_kind from public.account_subscriptions where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted');
      -- Cancellation terminalizes early trial access without rewriting immutable trial dates.
      update public.account_subscriptions set status='canceled',canceled_at=now(),status_changed_at=now() where billing_account_id=a and status in ('trialing','trial_recovery','active','past_due','grace','restricted');
      insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at,cancel_at_period_end,expired_at)
        values(a,m.plan_version_id,'paid',local_status,'billing_provider',provider_created,end_at,cancel_pending,
          case when local_status='expired' then tx_at else null end) returning id into local_id;
      insert into public.billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id)
        values(a,d.provider,d.environment,m.provider_store_id,p_snapshot->>'customer_id') on conflict(billing_account_id,provider,environment) do update set last_seen_at=now(),updated_at=now();
      insert into public.billing_provider_subscriptions(billing_account_id,account_subscription_id,variant_mapping_id,provider,environment,provider_store_id,provider_customer_id,provider_subscription_id,provider_order_id,provider_order_item_id,provider_product_id,provider_variant_id,provider_price_id,first_subscription_item_id,quantity,provider_status,provider_cancelled,provider_renews_at,provider_ends_at,provider_trial_ends_at,provider_created_at,provider_updated_at,latest_snapshot_sha256,last_reconciled_at,reconciliation_status)
        values(a,local_id,m.id,d.provider,d.environment,m.provider_store_id,p_snapshot->>'customer_id',sid,p_snapshot->>'order_id',p_snapshot->>'order_item_id',m.provider_product_id,m.provider_variant_id,m.provider_price_id,p_snapshot->>'first_subscription_item_id',1,p_snapshot->>'status',(p_snapshot->>'cancelled')::boolean,
          (p_snapshot->>'renews_at')::timestamptz,(p_snapshot->>'ends_at')::timestamptz,null,provider_created,stamp,h,tx_at,'processed');
      update public.billing_checkout_attempts set status='completed',completed_at=now(),expired_at=null,error_code=null,provider_checkout_url=null,completed_provider_subscription_id=sid,updated_at=now() where id=t.id;
      -- A delayed creation delivery may arrive after another Checkout was opened.
      update public.billing_checkout_attempts set status='expired',expired_at=now(),provider_checkout_url=null,error_code='BILLING_CHECKOUT_EXPIRED',updated_at=now()
        where billing_account_id=a and id<>t.id and status in ('creating','ready','ambiguous');
    else
      local_id:=b.account_subscription_id;
      if exists(select 1 from public.account_subscriptions where billing_account_id=a and id<>local_id and status in ('trialing','trial_recovery','active','past_due','grace','restricted')) then raise exception 'BILLING_RECONCILIATION_MANUAL_REVIEW'; end if;
      if b.latest_snapshot_sha256<>h or exists(select 1 from public.account_subscriptions where id=local_id and
        (status is distinct from local_status or current_period_ends_at is distinct from end_at or cancel_at_period_end is distinct from cancel_pending)) then
        update public.account_subscriptions set status=local_status,status_changed_at=now(),
          expired_at=case when local_status='expired' then now() else null end,
          current_period_ends_at=end_at,cancel_at_period_end=cancel_pending where id=local_id;
        update public.billing_provider_subscriptions set provider_status=p_snapshot->>'status',provider_cancelled=(p_snapshot->>'cancelled')::boolean,
          provider_renews_at=(p_snapshot->>'renews_at')::timestamptz,provider_ends_at=(p_snapshot->>'ends_at')::timestamptz,
          provider_updated_at=stamp,latest_snapshot_sha256=h,last_reconciled_at=now(),reconciliation_status='processed',reconciliation_error_code=null,updated_at=now() where id=b.id;
      end if;
      -- Health is independent of business changes. All validation and stale/equal
      -- timestamp guards have passed; do not write the local row or an event here.
      update public.billing_provider_subscriptions set reconciliation_status='processed',reconciliation_error_code=null,
        last_reconciled_at=tx_at,updated_at=tx_at where id=b.id;
    end if;
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code=null
      where provider=d.provider and environment=d.environment and provider_subscription_id=sid and processing_status='deferred' and id<>d.id;
    update public.billing_provider_webhook_deliveries set processing_status='processed',processed_at=now(),last_error_code=null where id=d.id;
    if b.id is null then
      insert into public.account_subscription_events(billing_account_id,subscription_id,event_type,to_status,source,metadata)
        values(a,local_id,'subscription.converted_to_paid',local_status,'billing_provider',jsonb_build_object('previousKind',old_kind,'checkoutAttemptId',t.id));
    end if;
    return 'processed';
  exception when others then
    code:=sqlerrm;
    if code not in ('BILLING_UNAPPROVED_PLAN_CHANGE','BILLING_WEBHOOK_ENVIRONMENT_MISMATCH','BILLING_WEBHOOK_STORE_MISMATCH','BILLING_SUBSCRIPTION_IDENTITY_MISMATCH','BILLING_SUBSCRIPTION_VARIANT_MISMATCH','BILLING_SUBSCRIPTION_PRICE_MISMATCH','BILLING_SUBSCRIPTION_UNSUPPORTED_TRIAL','BILLING_RECONCILIATION_MANUAL_REVIEW') then
      update public.billing_provider_webhook_deliveries set processing_status='failed',last_error_code='BILLING_RECONCILIATION_FAILED' where id=d.id;
      return 'failed';
    end if;
    -- All activation writes above roll back together before review metadata is saved.
    update public.billing_provider_subscriptions set reconciliation_status='manual_review',reconciliation_error_code=code where id=b.id;
    update public.billing_provider_webhook_deliveries set processing_status='ignored',processed_at=now(),last_error_code=code where id=d.id;
    return 'ignored';
  end;
end $$;

commit;
