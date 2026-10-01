-- Shared canonical eligibility for service preparation and reference-free owner UI.
-- No data population, historical evidence rewrite or financial-authority change.
-- The existing projection is still private. Permit its invocation from the
-- owned safe-state boundary without duplicating any recovery accounting.
do $$
declare definition text; original text := 'perform public.billing_guard_actor(); select * into a from public.account_subscriptions where id=p_canonical;';
begin
 definition:=pg_get_functiondef('public.billing_paddle_recovery_candidate_v1(uuid)'::regprocedure);
 if position(original in definition)=0 then raise exception 'BILLING_PAYMENT_METHOD_STATE_SCHEMA_DRIFT';end if;
 execute replace(definition,original,
  'select * into a from public.account_subscriptions where id=p_canonical; perform public.billing_guard_actor(a.billing_account_id,true);');
end $$;

create function public.billing_payment_method_context_authority_v1(p_owner uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.billing_accounts%rowtype;a public.account_subscriptions%rowtype;s public.billing_subscriptions_v2%rowtype;
 c public.billing_customers_v2%rowtype; base public.billing_price_mappings%rowtype; seat public.billing_price_mappings%rowtype;
 n integer; obligation jsonb; items jsonb; snapshot jsonb; result jsonb; context_status text; reconciliation_enabled boolean;
 resource_revision text;
begin
 select paddle_reconciliation_enabled into reconciliation_enabled from public.billing_runtime_policy where id=1 for share;
 if reconciliation_enabled is distinct from true then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 select * into b from public.billing_accounts where owner_user_id=p_owner;
 if b.id is null then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
 perform public.billing_guard_actor(b.id,true);
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
  obligation:=public.billing_paddle_recovery_candidate_v1(a.id);
  if obligation->>'available'<>'true' then raise exception 'BILLING_PAYMENT_METHOD_UNAVAILABLE';end if;
  context_status:='settle_existing_balance';
 else
  obligation:=public.billing_paddle_recovery_candidate_v1(a.id);
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

revoke all on function public.billing_payment_method_context_authority_v1(uuid) from public,anon,authenticated,service_role;

create or replace function public.resolve_owned_billing_payment_method_context_v1(p_owner uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.billing_guard_actor();
 return public.billing_payment_method_context_authority_v1(p_owner);
end $$;

create or replace function public.get_my_billing_payment_method_state_v1() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); ctx jsonb;
begin
 if owner_id is null then raise exception 'BILLING_PAYMENT_METHOD_OWNER_REQUIRED' using errcode='42501';end if;
 begin
  ctx:=public.billing_payment_method_context_authority_v1(owner_id);
  -- A known dispatch fence or stale resumable reservation cannot be advertised
  -- as a new action. This is a read-only counterpart to preparation's fences.
  if exists(select 1 from public.billing_payment_method_preparations_v2 p
    where p.billing_account_id=(ctx->>'accountId')::uuid and (
      p.status='ambiguous'
      or (p.canonical_subscription_id=(ctx->>'canonicalId')::uuid and (
        (p.status='creating' and p.dispatch_token_sha256 is not null)
        or (p.authority_revision is distinct from ctx->>'authorityRevision' and (
          p.status='ready' or (p.status='creating' and p.creation_lease_expires_at>clock_timestamp())))))))
  then return jsonb_build_object('available',false,'reason','not_available','maySettleExistingBalance',false);end if;
  return jsonb_build_object('available',true,'status',ctx->>'canonicalStatus',
   'maySettleExistingBalance',ctx->>'mode'='settle_existing_balance');
 exception when raise_exception or invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('available',false,'reason','not_available','maySettleExistingBalance',false);
 end;
end $$;
revoke all on function public.get_my_billing_payment_method_state_v1() from public,anon;
grant execute on function public.get_my_billing_payment_method_state_v1() to authenticated;
revoke all on function public.resolve_owned_billing_payment_method_context_v1(uuid) from public,anon,authenticated;
grant execute on function public.resolve_owned_billing_payment_method_context_v1(uuid) to service_role;
