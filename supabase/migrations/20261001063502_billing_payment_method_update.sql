-- PAY-02B R2A2: provider-dispatch state only. No debt or payment authority.
begin;

create table public.billing_payment_method_preparations_v2 (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on update restrict on delete restrict,
  canonical_subscription_id uuid not null,
  subscription_id uuid not null,
  customer_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  provider text not null check (provider='paddle'),
  environment text not null check (environment='test'),
  provider_subscription_ref public.billing_v2_ref not null,
  provider_customer_ref public.billing_v2_ref not null,
  mode text not null check (mode in ('update_only','settle_existing_balance')),
  authority_revision public.billing_v2_sha256 not null,
  authority_snapshot jsonb not null,
  expected_obligation_transaction_ref public.billing_v2_ref,
  obligation_authority_revision public.billing_v2_sha256,
  dispatch_token_sha256 public.billing_v2_sha256,
  provider_requested_at timestamptz,
  creation_lease_expires_at timestamptz not null,
  provider_transaction_ref public.billing_v2_ref,
  validator_version text,
  normalized_result_sha256 public.billing_v2_sha256,
  status text not null default 'creating' check(status in ('creating','ready','ambiguous','completed','failed','canceled')),
  error_code text check(error_code in ('configuration','provider_rejected','provider_ambiguous','authority_changed','validation_failed','lease_expired','inspection_failed')),
  ready_at timestamptz,
  ambiguous_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  terminal_event_id uuid references public.billing_webhook_events_v2(id) on update restrict on delete restrict,
  completion_application_id uuid references public.billing_payment_applications_v2(id) on update restrict on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(billing_account_id,canonical_subscription_id) references public.account_subscriptions(billing_account_id,id) on update restrict on delete restrict,
  foreign key(subscription_id,billing_account_id,provider,environment) references public.billing_subscriptions_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  foreign key(customer_id,billing_account_id,provider,environment) references public.billing_customers_v2(id,billing_account_id,provider,environment) on update restrict on delete restrict,
  check ((mode='update_only' and expected_obligation_transaction_ref is null and obligation_authority_revision is null)
      or (mode='settle_existing_balance' and expected_obligation_transaction_ref is not null and obligation_authority_revision is not null)),
  check ((dispatch_token_sha256 is null)=(provider_requested_at is null)),
  check ((provider_transaction_ref is null and validator_version is null and normalized_result_sha256 is null and ready_at is null)
      or (provider_transaction_ref is not null and validator_version is not null and normalized_result_sha256 is not null and ready_at is not null)),
  check ((status='ready')=(ready_at is not null and completed_at is null and failed_at is null and canceled_at is null and ambiguous_at is null)),
  check ((status='ambiguous')=(ambiguous_at is not null and completed_at is null and failed_at is null and canceled_at is null)),
  check ((status='completed')=(completed_at is not null)),
  check ((status='failed')=(failed_at is not null)),
  check ((status='canceled')=(canceled_at is not null)),
  check (status not in ('ready','completed') or provider_transaction_ref is not null),
  check (status<>'completed' or terminal_event_id is not null),
  check (mode='settle_existing_balance' or completion_application_id is null),
  check (creation_lease_expires_at>created_at)
);
create unique index billing_payment_method_one_open_v2 on public.billing_payment_method_preparations_v2(canonical_subscription_id)
 where status in ('creating','ready','ambiguous');
create unique index billing_payment_method_one_result_v2 on public.billing_payment_method_preparations_v2(provider,environment,provider_transaction_ref)
 where provider_transaction_ref is not null;
create unique index billing_payment_method_one_claimed_debt_v2 on public.billing_payment_method_preparations_v2(provider,environment,expected_obligation_transaction_ref)
 where expected_obligation_transaction_ref is not null and provider_requested_at is not null;
create index billing_payment_method_account_status_v2 on public.billing_payment_method_preparations_v2(billing_account_id,status);
alter table public.billing_payment_method_preparations_v2 enable row level security;
revoke all on public.billing_payment_method_preparations_v2 from public,anon,authenticated,service_role;

-- The only mutable fields are state transitions and their exact milestones.
create function public.billing_payment_method_preparation_guard_v1() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  perform public.billing_guard_actor();
  if tg_op='DELETE' then raise exception 'BILLING_PAYMENT_METHOD_IMMUTABLE';end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new)-array['dispatch_token_sha256','provider_requested_at','provider_transaction_ref','validator_version','normalized_result_sha256',
       'status','error_code','ready_at','ambiguous_at','completed_at','failed_at','canceled_at','terminal_event_id','completion_application_id','updated_at'])
       is distinct from
       (to_jsonb(old)-array['dispatch_token_sha256','provider_requested_at','provider_transaction_ref','validator_version','normalized_result_sha256',
       'status','error_code','ready_at','ambiguous_at','completed_at','failed_at','canceled_at','terminal_event_id','completion_application_id','updated_at'])
    or (old.dispatch_token_sha256 is not null and (new.dispatch_token_sha256,new.provider_requested_at) is distinct from (old.dispatch_token_sha256,old.provider_requested_at))
    or (old.provider_transaction_ref is not null and (new.provider_transaction_ref,new.validator_version,new.normalized_result_sha256,new.ready_at) is distinct from (old.provider_transaction_ref,old.validator_version,old.normalized_result_sha256,old.ready_at))
    or (old.status in ('completed','failed','canceled') and to_jsonb(new)-'updated_at' is distinct from to_jsonb(old)-'updated_at')
    or (old.status='ambiguous' and new.status not in ('ambiguous','ready','completed'))
    or (old.status='ready' and new.status not in ('ready','completed','failed','canceled'))
    or (old.status='creating' and new.status not in ('creating','ready','ambiguous','failed'))
    then raise exception 'BILLING_PAYMENT_METHOD_IMMUTABLE';end if;
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end $$;
create trigger billing_payment_method_preparation_guard before update or delete on public.billing_payment_method_preparations_v2
 for each row execute function public.billing_payment_method_preparation_guard_v1();
create trigger billing_payment_method_preparation_no_truncate before truncate on public.billing_payment_method_preparations_v2
 for each statement execute function public.billing_v2_protect_history();

-- Service-only identity. Current canonical state is read under the account lock.
-- No browser-supplied account, provider, subscription, customer or transaction.
create function public.resolve_owned_billing_payment_method_context_v1(p_owner uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.billing_accounts%rowtype;a public.account_subscriptions%rowtype;s public.billing_subscriptions_v2%rowtype;
 c public.billing_customers_v2%rowtype; base public.billing_price_mappings%rowtype; seat public.billing_price_mappings%rowtype;
 n integer; obligation jsonb; items jsonb; snapshot jsonb; result jsonb; context_status text; reconciliation_enabled boolean;
 resource_revision text;
begin
 perform public.billing_guard_actor();
 select paddle_reconciliation_enabled into reconciliation_enabled from public.billing_runtime_policy where id=1 for share;
 if reconciliation_enabled is distinct from true then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 select * into b from public.billing_accounts where owner_user_id=p_owner;
 if b.id is null then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 perform public.billing_guard_lock(b.id,'test');
 select count(*),min(id::text)::uuid into n,a.id from public.account_subscriptions where billing_account_id=b.id and status in ('active','past_due');
 if n<>1 then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 select * into a from public.account_subscriptions where id=a.id;
 if a.subscription_kind<>'paid' or a.source<>'billing_provider' or a.cancel_at_period_end
 or a.current_period_started_at is null or a.current_period_ends_at is null
 or not exists(select 1 from public.billing_canonical_origins where account_subscription_id=a.id and billing_account_id=b.id and storage_contract='billing.v2')
 or exists(select 1 from public.account_subscriptions where billing_account_id=b.id and id<>a.id and status in ('active','past_due','trialing','trial_recovery','grace','restricted'))
 or exists(select 1 from public.billing_provider_subscriptions where billing_account_id=b.id and provider_status not in ('expired','cancelled'))
 then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 select count(*) into n from public.billing_subscriptions_v2 where billing_account_id=b.id and account_subscription_id=a.id and shadow_status='current';
 if n<>1 then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 select * into s from public.billing_subscriptions_v2 where billing_account_id=b.id and account_subscription_id=a.id and shadow_status='current';
 select * into c from public.billing_customers_v2 where id=s.customer_id;
 if s.provider<>'paddle' or s.environment<>'test' or s.reconciliation_status<>'processed' or s.provider_status<>a.status
 or s.scheduled_cancel_at is not null or s.current_period_started_at is distinct from a.current_period_started_at
 or s.current_period_ends_at is distinct from a.current_period_ends_at
 or c.id is null or c.billing_account_id<>b.id or c.provider<>s.provider or c.environment<>s.environment
 or c.identity_status<>'current' or c.identity_source<>'verified_provider_event'
 or not exists(select 1 from public.billing_evidence_v2 e join public.billing_webhook_events_v2 w on w.id=e.event_id
   where e.id=s.latest_evidence_id and e.subscription_id=s.id and e.proof_kind='subscription' and e.provider=s.provider and e.environment=s.environment
   and e.normalized_sha256=encode(extensions.digest(e.proof::text,'sha256'),'hex') and w.processing_status='processed')
 or exists(select 1 from public.billing_operations_v2 where billing_account_id=b.id and status not in ('completed','canceled','failed'))
 or exists(select 1 from public.billing_seat_quantity_operations where billing_account_id=b.id and status not in ('completed','canceled','failed'))
 or exists(select 1 from public.billing_checkouts_v2 where billing_account_id=b.id and status in ('creating','ready','ambiguous'))
 then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 select * into base from public.billing_price_mappings where id=public.billing_paddle_current_mapping_v1(s.id);
 if base.id is null or base.status<>'active' or base.verified_at is null or base.plan_version_id<>a.plan_version_id
 or base.provider<>s.provider or base.environment<>s.environment or base.provider_product_ref is null or base.currency_code<>'USD'
 then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 items:=jsonb_build_array(jsonb_build_object('priceRef',base.provider_price_ref,'productRef',base.provider_product_ref,'quantity',1,'amount',base.unit_amount_minor::text));
 if s.approved_additional_coach_seats>0 then
  select * into seat from public.billing_price_mappings where id=public.billing_paddle_current_seat_mapping_v1(s.id);
  if seat.id is null or seat.status<>'active' or seat.verified_at is null or seat.provider<>s.provider or seat.environment<>s.environment
  or seat.provider_product_ref is null or seat.currency_code<>'USD' or seat.cadence<>base.cadence
  then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
  items:=items||jsonb_build_array(jsonb_build_object('priceRef',seat.provider_price_ref,'productRef',seat.provider_product_ref,
   'quantity',s.approved_additional_coach_seats,'amount',seat.unit_amount_minor::text));
 end if;
 if a.status='past_due' then
  obligation:=public.resolve_billing_outstanding_obligation_v1(a.id);
  if obligation->>'available'<>'true' then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
  context_status:='settle_existing_balance';
 else
  obligation:=public.resolve_billing_outstanding_obligation_v1(a.id);
  if obligation->>'reason' not in ('none','consumed') or public.billing_paddle_recovery_unresolved_v1(s.id) then
   raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
  -- The debt projection has no subscription-history scan when no debt exists.
  -- Reuse the applied-resource authority, including its global contradiction
  -- and superseded-history checks, at every resolver-backed boundary.
  begin
   resource_revision:=public.billing_paddle_seat_resource_updated_at_v1(s.id);
  exception when raise_exception or invalid_text_representation or numeric_value_out_of_range then
   raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';
  end;
  context_status:='update_only';
 end if;
  -- Equivalent maximum observations may return different retained spellings;
  -- bind only the existing canonical exact UTC instant into authority.
  snapshot:=jsonb_build_object('schema','billing-payment-method-authority-v1','accountId',b.id,'canonicalId',a.id,'subscriptionId',s.id,
  'customerId',c.id,'provider',s.provider,'environment',s.environment,'subscriptionRef',s.provider_subscription_ref,'customerRef',c.provider_customer_ref,
  'mode',context_status,'canonicalStatus',a.status,'canonicalPeriodStart',a.current_period_started_at,'canonicalPeriodEnd',a.current_period_ends_at,
  'subscriptionEvidenceId',s.latest_evidence_id,'subscriptionEvidenceDigest',s.latest_snapshot_sha256,'approvedSeats',s.approved_additional_coach_seats,
  'baseMappingId',base.id,'seatMappingId',seat.id,'items',items,
  'resourceRevisionKey',public.billing_paddle_seat_timestamp_key_v1(to_jsonb(resource_revision)),
  'obligationRef',case when context_status='settle_existing_balance' then obligation#>'{obligation,providerTransactionReference}' else 'null'::jsonb end,
  'obligationRevision',case when context_status='settle_existing_balance' then obligation#>'{obligation,authorityRevision}' else 'null'::jsonb end);
 result:=snapshot||jsonb_build_object('authorityRevision',encode(extensions.digest(snapshot::text,'sha256'),'hex'));
 if context_status='settle_existing_balance' then result:=result||jsonb_build_object('obligation',obligation->'obligation');end if;
 return result;
end $$;

-- Safe authenticated UI projection has no private references or continuation.
create function public.get_my_billing_payment_method_state_v1() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); state jsonb;
begin
 if owner_id is null then raise exception 'BILLING_PAYMENT_METHOD_OWNER_REQUIRED' using errcode='42501';end if;
 begin
  -- Service identity resolver stays private; authenticated projection performs
  -- only a reference-free eligibility check over owned canonical status.
  select jsonb_build_object('available',true,'status',a.status,'maySettleExistingBalance',a.status='past_due') into state
  from public.billing_accounts b join public.account_subscriptions a on a.billing_account_id=b.id
  where b.owner_user_id=owner_id and a.subscription_kind='paid' and a.status in ('active','past_due')
  and exists(select 1 from public.billing_runtime_policy where id=1 and paddle_reconciliation_enabled)
  and exists(select 1 from public.billing_canonical_origins o where o.account_subscription_id=a.id and o.storage_contract='billing.v2')
  and exists(select 1 from public.billing_subscriptions_v2 s where s.account_subscription_id=a.id and s.shadow_status='current' and s.provider='paddle' and s.environment='test');
  return coalesce(state,jsonb_build_object('available',false,'reason','not_available','maySettleExistingBalance',false));
 end;
end $$;

create function public.begin_billing_payment_method_preparation_v1(p_owner uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; b uuid; row public.billing_payment_method_preparations_v2%rowtype; canonical uuid;
begin
 perform public.billing_guard_actor();
 ctx:=public.resolve_owned_billing_payment_method_context_v1(p_owner);
 b:=(ctx->>'accountId')::uuid;canonical:=(ctx->>'canonicalId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('paddle-ingress-test-v1',0));
 if exists(select 1 from public.billing_payment_method_preparations_v2
   where billing_account_id=b and status='ambiguous') then
   raise exception 'BILLING_PAYMENT_METHOD_AMBIGUOUS';end if;
 select * into row from public.billing_payment_method_preparations_v2
  where canonical_subscription_id=canonical and status in ('creating','ready','ambiguous') for update;
 if row.id is not null then
  if row.status='creating' and row.dispatch_token_sha256 is null and row.creation_lease_expires_at<=clock_timestamp() then
   update public.billing_payment_method_preparations_v2 set status='failed',failed_at=clock_timestamp(),error_code='lease_expired' where id=row.id;
  elsif row.status='creating' and row.dispatch_token_sha256 is not null and row.creation_lease_expires_at<=clock_timestamp() then
   update public.billing_payment_method_preparations_v2 set status='ambiguous',ambiguous_at=clock_timestamp(),error_code='provider_ambiguous' where id=row.id;
   return jsonb_build_object('preparationId',row.id,'status','ambiguous','mode',row.mode,'context',ctx,'claimed',true);
  else
   if row.authority_revision is distinct from ctx->>'authorityRevision' then raise exception 'BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED';end if;
   return jsonb_build_object('preparationId',row.id,'status',row.status,'mode',row.mode,'context',ctx,
     'transactionRef',row.provider_transaction_ref,'claimed',row.provider_requested_at is not null);
  end if;
 end if;
 insert into public.billing_payment_method_preparations_v2
  (billing_account_id,canonical_subscription_id,subscription_id,customer_id,created_by_user_id,provider,environment,
   provider_subscription_ref,provider_customer_ref,mode,authority_revision,authority_snapshot,
   expected_obligation_transaction_ref,obligation_authority_revision,creation_lease_expires_at)
 values(b,canonical,(ctx->>'subscriptionId')::uuid,(ctx->>'customerId')::uuid,p_owner,ctx->>'provider',ctx->>'environment',
  ctx->>'subscriptionRef',ctx->>'customerRef',ctx->>'mode',ctx->>'authorityRevision',ctx-'obligation',
  ctx->>'obligationRef',ctx->>'obligationRevision',clock_timestamp()+interval '90 seconds') returning * into row;
 return jsonb_build_object('preparationId',row.id,'status',row.status,'mode',row.mode,'context',ctx,'transactionRef',null,'claimed',false);
end $$;

create function public.claim_billing_payment_method_dispatch_v1(p_owner uuid,p_preparation uuid,p_token_sha256 text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; row public.billing_payment_method_preparations_v2%rowtype;
begin
 perform public.billing_guard_actor();
 ctx:=public.resolve_owned_billing_payment_method_context_v1(p_owner);
 if p_token_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('paddle-ingress-test-v1',0));
 select * into row from public.billing_payment_method_preparations_v2 where id=p_preparation for update;
 if row.id is null or row.created_by_user_id<>p_owner or row.canonical_subscription_id<>(ctx->>'canonicalId')::uuid
 or row.authority_revision<>ctx->>'authorityRevision' or row.status<>'creating' or row.dispatch_token_sha256 is not null
 then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 if row.creation_lease_expires_at<=clock_timestamp() then
  update public.billing_payment_method_preparations_v2 set status='failed',failed_at=clock_timestamp(),error_code='lease_expired' where id=row.id;
  return jsonb_build_object('dispatch',false,'status','failed');
 end if;
 update public.billing_payment_method_preparations_v2 set dispatch_token_sha256=p_token_sha256,provider_requested_at=clock_timestamp()
  where id=row.id;
 return jsonb_build_object('dispatch',true,'status','creating','context',ctx);
end $$;

create function public.fail_billing_payment_method_preparation_v1(p_preparation uuid,p_token_sha256 text,p_error_code text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare row public.billing_payment_method_preparations_v2%rowtype;
begin
 perform public.billing_guard_actor();
 select * into row from public.billing_payment_method_preparations_v2 where id=p_preparation;
 if row.id is null then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 perform public.billing_guard_lock(row.billing_account_id,'test');
 select * into row from public.billing_payment_method_preparations_v2 where id=p_preparation for update;
 if row.status not in ('creating','ambiguous') or p_error_code not in ('configuration','provider_rejected','provider_ambiguous','authority_changed','validation_failed')
 or (row.dispatch_token_sha256 is not null and row.dispatch_token_sha256 is distinct from p_token_sha256)
 then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 if row.dispatch_token_sha256 is null then
  update public.billing_payment_method_preparations_v2 set status='failed',failed_at=clock_timestamp(),error_code=p_error_code where id=row.id;
  return jsonb_build_object('status','failed');
 end if;
 if row.status='creating' then
  update public.billing_payment_method_preparations_v2 set status='ambiguous',ambiguous_at=clock_timestamp(),error_code='provider_ambiguous' where id=row.id;
 end if;
 return jsonb_build_object('status','ambiguous');
end $$;

create function public.record_billing_payment_method_preparation_result_v1(
 p_owner uuid,p_preparation uuid,p_token_sha256 text,p_transaction_ref text,p_validator_version text,p_result_sha256 text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; row public.billing_payment_method_preparations_v2%rowtype; ev uuid; settled boolean:=false;
begin
 perform public.billing_guard_actor();
 if p_result_sha256 !~ '^[0-9a-f]{64}$' or p_validator_version<>'paddle-payment-method-transaction-v1'
 or p_transaction_ref !~ '^txn_[a-z0-9]{26}$' then raise exception 'BILLING_PAYMENT_METHOD_RESULT_INVALID';end if;
 select * into row from public.billing_payment_method_preparations_v2 where id=p_preparation;
 if row.id is null then raise exception 'BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED';end if;
 perform public.billing_guard_lock(row.billing_account_id,'test');
 perform pg_advisory_xact_lock(hashtextextended('paddle-ingress-test-v1',0));
 begin
  ctx:=public.resolve_owned_billing_payment_method_context_v1(p_owner);
 exception when raise_exception then ctx:=null;
 end;
 select * into row from public.billing_payment_method_preparations_v2 where id=p_preparation for update;
 if row.id is null or row.created_by_user_id<>p_owner or row.dispatch_token_sha256 is distinct from p_token_sha256
 or row.status not in ('creating','ambiguous') or row.provider_transaction_ref is not null
 or (row.mode='settle_existing_balance' and row.expected_obligation_transaction_ref<>p_transaction_ref)
 then raise exception 'BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED';end if;
 if ctx is null or row.authority_revision is distinct from ctx->>'authorityRevision'
 or row.canonical_subscription_id is distinct from (ctx->>'canonicalId')::uuid then
  -- Only an already authenticated, uniquely consumed renewal can explain a
  -- past-due authority transition before the original provider response.
  settled:=row.mode='settle_existing_balance' and exists(
    select 1 from public.billing_accounts b join public.account_subscriptions a on a.billing_account_id=b.id
    join public.billing_canonical_origins origin on origin.account_subscription_id=a.id and origin.billing_account_id=b.id
    join public.billing_subscriptions_v2 s on s.account_subscription_id=a.id and s.billing_account_id=b.id
    join public.billing_customers_v2 c on c.id=s.customer_id and c.billing_account_id=b.id
    join public.billing_payment_applications_v2 app on app.subscription_id=s.id and app.billing_account_id=b.id
    where b.id=row.billing_account_id and b.owner_user_id=p_owner and a.id=row.canonical_subscription_id
    and a.subscription_kind='paid' and a.status='active' and origin.storage_contract='billing.v2'
    and s.id=row.subscription_id and s.shadow_status='current' and s.reconciliation_status='processed'
    and s.provider=row.provider and s.environment=row.environment and s.provider_subscription_ref=row.provider_subscription_ref
    and c.id=row.customer_id and c.identity_status='current' and c.provider_customer_ref=row.provider_customer_ref
    and app.application_kind='renewal' and app.provider=row.provider and app.environment=row.environment
    and app.provider_transaction_ref=p_transaction_ref);
  if not settled then raise exception 'BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED';end if;
 end if;
 update public.billing_payment_method_preparations_v2 set status='ready',provider_transaction_ref=p_transaction_ref,
  validator_version=p_validator_version,normalized_result_sha256=p_result_sha256,ready_at=clock_timestamp(),
  ambiguous_at=null,error_code=null where id=row.id;
 -- A signed event may have arrived before the original claimed response was stored.
 for ev in select e.id from public.billing_webhook_events_v2 e join public.billing_paddle_event_observations o on o.event_id=e.id
  where e.provider='paddle' and e.environment='test' and e.provider_event_name='transaction.completed'
   and o.observation->>'transactionRef'=p_transaction_ref order by e.id loop
  perform public.reconcile_billing_payment_method_preparation_v1(ev);
 end loop;
 if settled and (select status from public.billing_payment_method_preparations_v2 where id=row.id)<>'completed' then
  raise exception 'BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED';end if;
 return jsonb_build_object('status',(select status from public.billing_payment_method_preparations_v2 where id=row.id));
end $$;

create function public.authorize_billing_payment_method_continuation_v1(p_owner uuid,p_preparation uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx jsonb; row public.billing_payment_method_preparations_v2%rowtype;
begin
 perform public.billing_guard_actor();ctx:=public.resolve_owned_billing_payment_method_context_v1(p_owner);
 select * into row from public.billing_payment_method_preparations_v2 where id=p_preparation;
 if row.id is null or row.created_by_user_id<>p_owner or row.status<>'ready'
 or row.authority_revision<>ctx->>'authorityRevision' or row.canonical_subscription_id<>(ctx->>'canonicalId')::uuid
 or row.provider_subscription_ref<>ctx->>'subscriptionRef' or row.provider_customer_ref<>ctx->>'customerRef'
 or row.provider_transaction_ref is null or row.validator_version<>'paddle-payment-method-transaction-v1'
 then raise exception 'BILLING_PAYMENT_METHOD_AUTHORITY_CHANGED';end if;
 return jsonb_build_object('status','ready','transactionRef',row.provider_transaction_ref,'context',ctx);
end $$;

-- Completion does not create any financial authority. Existing recovery
-- reconciliation must have created the unique renewal application first.
create function public.reconcile_billing_payment_method_preparation_v1(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o jsonb; row public.billing_payment_method_preparations_v2%rowtype; app uuid; n integer; tx_event uuid; outcome jsonb;
begin
 perform public.billing_guard_actor();
 select observation into o from public.billing_paddle_event_observations where event_id=p_event;
 if o is null then return jsonb_build_object('status','not_applicable');end if;
 if o->>'kind'='subscription.updated' then
  if o->>'status'<>'active' then return jsonb_build_object('status','not_applicable');end if;
  -- The commercial reconciler already applied the signed renewal, if valid.
  -- This event only wakes the exact retained completed transaction; it is
  -- never used as payment proof or stored as the terminal event.
  perform public.billing_paddle_recovery_event_v1(p_event);
  for tx_event in
   select e.id from public.billing_webhook_events_v2 e
   join public.billing_paddle_event_observations t on t.event_id=e.id
   where e.provider='paddle' and e.environment='test' and e.provider_event_name='transaction.completed'
    and t.observation->>'kind'='transaction.completed'
    and t.observation->>'subscriptionRef'=o->>'subscriptionRef'
    and t.observation->>'customerRef'=o->>'customerRef'
    and exists(select 1 from public.billing_payment_method_preparations_v2 p
      where p.provider='paddle' and p.environment='test' and p.mode='settle_existing_balance'
       and p.status in ('ready','ambiguous') and p.provider_subscription_ref=o->>'subscriptionRef'
       and p.provider_customer_ref=o->>'customerRef'
       and p.provider_transaction_ref=t.observation->>'transactionRef'
       and p.expected_obligation_transaction_ref=p.provider_transaction_ref)
   order by e.occurred_at,e.id
  loop
   outcome:=public.reconcile_billing_payment_method_preparation_v1(tx_event);
   if outcome->>'status'='completed' then return outcome;end if;
  end loop;
  return jsonb_build_object('status','not_applicable');
 end if;
 if o->>'kind'<>'transaction.completed' then return jsonb_build_object('status','not_applicable');end if;
 select * into row from public.billing_payment_method_preparations_v2
  where provider='paddle' and environment='test' and provider_transaction_ref=o->>'transactionRef';
 if row.id is null then return jsonb_build_object('status','not_applicable');end if;
 perform public.billing_guard_lock(row.billing_account_id,'test');
 perform pg_advisory_xact_lock(hashtextextended('paddle-ingress-test-v1',0));
 select * into row from public.billing_payment_method_preparations_v2 where id=row.id for update;
 if row.status='completed' and row.terminal_event_id=p_event then return jsonb_build_object('status','reused');end if;
 if row.status not in ('ready','ambiguous') then return jsonb_build_object('status','pending');end if;
 perform public.billing_paddle_recovery_event_v1(p_event);
 if o->>'subscriptionRef' is distinct from row.provider_subscription_ref or o->>'customerRef' is distinct from row.provider_customer_ref
 then raise exception 'BILLING_PAYMENT_METHOD_EVENT_CONFLICT';end if;
 if row.mode='update_only' then
  if o->>'origin' is distinct from 'subscription_payment_method_change' or o#>>'{financial,collectionMode}' is distinct from 'automatic'
   or o#>>'{financial,totals,grandTotal}' is distinct from '0' or o#>>'{financial,totals,balance}' is distinct from '0'
   or o#>>'{financial,totals,subtotal}' is distinct from '0' or o#>>'{financial,totals,total}' is distinct from '0'
   or o#>>'{financial,totals,tax}' is distinct from '0' or o#>>'{financial,totals,discount}' is distinct from '0'
   or o#>>'{financial,totals,credit}' is distinct from '0' or o#>>'{financial,totals,creditToBalance}' is distinct from '0'
   or o#>>'{financial,captured}' is distinct from '0' or o->>'currency' is distinct from 'USD'
   or jsonb_typeof(o#>'{financial,payments}') is distinct from 'array'
   or jsonb_array_length(o#>'{financial,payments}')<>0
   or not public.billing_paddle_seat_lifecycle_items_v1(row.subscription_id,o,o)
   or exists(select 1 from public.billing_payment_applications_v2 where provider='paddle' and environment='test' and provider_transaction_ref=row.provider_transaction_ref)
  then raise exception 'BILLING_PAYMENT_METHOD_EVENT_CONFLICT';end if;
 else
  if o->>'origin'<>'subscription_recurring' or row.expected_obligation_transaction_ref<>row.provider_transaction_ref then
   raise exception 'BILLING_PAYMENT_METHOD_EVENT_CONFLICT';end if;
  select count(*),min(id::text)::uuid into n,app from public.billing_payment_applications_v2
   where provider='paddle' and environment='test' and provider_transaction_ref=row.provider_transaction_ref
    and billing_account_id=row.billing_account_id and subscription_id=row.subscription_id and application_kind='renewal';
  if n<>1 then return jsonb_build_object('status','pending');end if;
 end if;
 update public.billing_payment_method_preparations_v2 set status='completed',completed_at=clock_timestamp(),terminal_event_id=p_event,
  completion_application_id=app where id=row.id;
 return jsonb_build_object('status','completed');
end $$;

do $$declare r record;begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
   ('billing_payment_method_preparation_guard_v1','resolve_owned_billing_payment_method_context_v1',
    'get_my_billing_payment_method_state_v1','begin_billing_payment_method_preparation_v1',
    'claim_billing_payment_method_dispatch_v1','record_billing_payment_method_preparation_result_v1',
    'fail_billing_payment_method_preparation_v1','authorize_billing_payment_method_continuation_v1',
    'reconcile_billing_payment_method_preparation_v1') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 end loop;
end $$;
grant execute on function public.get_my_billing_payment_method_state_v1() to authenticated;
grant execute on function public.resolve_owned_billing_payment_method_context_v1(uuid),
 public.begin_billing_payment_method_preparation_v1(uuid),
 public.claim_billing_payment_method_dispatch_v1(uuid,uuid,text),
 public.record_billing_payment_method_preparation_result_v1(uuid,uuid,text,text,text,text),
 public.fail_billing_payment_method_preparation_v1(uuid,text,text),
 public.authorize_billing_payment_method_continuation_v1(uuid,uuid),
 public.reconcile_billing_payment_method_preparation_v1(uuid) to service_role;
commit;
