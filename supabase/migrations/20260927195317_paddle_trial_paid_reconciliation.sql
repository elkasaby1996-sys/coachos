-- Paddle authenticated initial purchase: eligible canonical trial conversion only.
-- No data repair, policy changes, new grants, or changes to provider proof.
begin;

create or replace function public.reconcile_paddle_initial_purchase_v1(p_subscription uuid,p_operation text default 'initial_purchase') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare facts jsonb; s public.billing_subscriptions_v2%rowtype; canonical uuid; se uuid; te uuid; payment uuid; checkout public.billing_checkouts_v2%rowtype;
 current_ids uuid[]; trial public.account_subscriptions%rowtype;
 conversion_at timestamptz:=transaction_timestamp();
begin
 perform public.billing_guard_actor();
 if p_operation is distinct from 'initial_purchase' then raise exception 'PADDLE_RECONCILIATION_OPERATION'; end if;
 facts:=public.billing_paddle_initial_proof_v1(p_subscription);
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 select * into strict checkout from public.billing_checkouts_v2 where id=(facts->>'checkoutId')::uuid;
 if checkout.status not in ('ready','completed') or
 (checkout.status='completed' and (checkout.completed_subscription_id is distinct from s.id
 or checkout.completed_at is null or s.reconciliation_status<>'processed')) then
 raise exception 'PADDLE_RECONCILIATION_CHECKOUT_STATE'; end if;
 if s.reconciliation_status='processed' then
 if s.account_subscription_id is null or not exists(select 1 from public.billing_evidence_v2 e
 where e.id=s.latest_evidence_id and e.proof_schema='paddle-initial-purchase-v1' and e.proof->'observation'=facts)
 or not exists(select 1 from public.billing_payment_applications_v2 p join public.billing_evidence_v2 e on e.id=p.evidence_id
 where p.subscription_id=s.id and p.billing_account_id=s.billing_account_id and p.provider='paddle' and p.environment='test'
 and p.checkout_id=(facts->>'checkoutId')::uuid and p.application_kind='initial_purchase'
 and e.proof_schema='paddle-initial-purchase-v1' and e.proof->'observation'=facts)
 or not exists(select 1 from public.account_subscriptions a join public.billing_canonical_origins o on o.account_subscription_id=a.id
 where a.id=s.account_subscription_id and a.billing_account_id=s.billing_account_id and a.subscription_kind='paid'
 and a.status='active' and a.plan_version_id=(facts->>'planVersionId')::uuid and o.storage_contract='billing.v2')
 or not exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id and item_role='base_plan'
 and quantity=1 and cadence='monthly' and mapping_id=(facts->>'mappingId')::uuid and evidence_id=s.latest_evidence_id)
 or (select count(*) from public.billing_subscription_items_v2 where subscription_id=s.id)<>1 then
 raise exception 'PADDLE_RECONCILIATION_RETRY_MISMATCH'; end if;
 -- Application lifecycle time, not a fabricated provider timestamp. The proof
 -- helper holds the account and checkout locks for this entire transaction.
 if checkout.status='ready' then
 update public.billing_checkouts_v2 set status='completed',completed_subscription_id=s.id,
 completed_at=clock_timestamp(),updated_at=clock_timestamp(),error_code=null where id=checkout.id;
 end if;
 return jsonb_build_object('success',true,'reused',true);
 end if;
 if s.account_subscription_id is not null then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 -- The proof helper already owns policy -> account -> shadow/checkout locks.
 -- Re-read and lock canonical authority only after that account serialization.
 select array_agg(id) into current_ids from (
 select id from public.account_subscriptions where billing_account_id=s.billing_account_id
 and status in ('trialing','trial_recovery','active','past_due','grace','restricted')
 order by id for update) current_rows;
 if cardinality(current_ids)>1 then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 if cardinality(current_ids)=1 then
 select * into strict trial from public.account_subscriptions where id=current_ids[1];
 -- Only normal RepSync trials, including their recovery window. Immutable
 -- published policy/dates remain authoritative, even after policy retirement.
 if trial.subscription_kind<>'trial' or trial.status not in ('trialing','trial_recovery')
 or trial.source not in ('first_workspace','workspace_transfer')
 or trial.canceled_at is not null or trial.expired_at is not null or trial.restricted_at is not null
 or trial.current_period_started_at is not null or trial.current_period_ends_at is not null
 or trial.cancel_at_period_end or trial.trial_started_at>conversion_at
 or public.effective_account_subscription_status(trial.subscription_kind,trial.status,
 trial.trial_ends_at,trial.trial_recovery_ends_at,conversion_at) not in ('trialing','trial_recovery')
 or (trial.status='trial_recovery' and conversion_at<trial.trial_ends_at)
 or not exists(select 1 from public.commercial_trial_policy_versions p
 where p.id=trial.trial_policy_version_id and p.status in ('active','retired')
 and p.feature_plan_version_id=trial.plan_version_id
 and trial.trial_ends_at=trial.trial_started_at+make_interval(days=>p.duration_days)
 and trial.trial_recovery_ends_at=trial.trial_ends_at+make_interval(days=>p.recovery_days))
 or exists(select 1 from public.billing_canonical_origins where account_subscription_id=trial.id)
 then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 end if;
 if exists(select 1 from public.billing_provider_subscriptions where billing_account_id=s.billing_account_id
 and provider_status not in ('expired','cancelled'))
 or exists(select 1 from public.billing_subscriptions_v2 where billing_account_id=s.billing_account_id and account_subscription_id is not null)
 then raise exception 'PADDLE_RECONCILIATION_CANONICAL_CONFLICT'; end if;
 if exists(select 1 from public.billing_payment_applications_v2 where checkout_id=(facts->>'checkoutId')::uuid
 or provider_transaction_ref=(select provider_transaction_ref from public.billing_checkouts_v2 where id=(facts->>'checkoutId')::uuid)) then
 raise exception 'PADDLE_RECONCILIATION_PAYMENT_CONSUMED'; end if;
 if exists(select 1 from public.billing_subscription_items_v2 where subscription_id=s.id) then
 raise exception 'PADDLE_RECONCILIATION_ITEMS'; end if;
 -- Terminalization and every subsequent proof/authority/audit write share this
 -- transaction. No exception handler may retain a partially converted trial.
 if trial.id is not null then
 update public.account_subscriptions set status='canceled',canceled_at=conversion_at,
 status_changed_at=conversion_at where id=trial.id;
 end if;
 se:=public.billing_paddle_initial_evidence_v1(s.id,'subscription');
 te:=public.billing_paddle_initial_evidence_v1(s.id,'transaction');
 payment:=public.billing_paddle_initial_payment_v1(s.id,te);
 -- Reuse canonical table constraints/history/audit, not LS proof semantics.
 insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
 values(s.billing_account_id,(facts->>'planVersionId')::uuid,'paid','active','billing_provider') returning id into canonical;
 perform public.billing_guard_claim_canonical(s.billing_account_id,canonical,'billing.v2');
 insert into public.billing_subscription_items_v2(subscription_id,billing_account_id,provider,environment,item_role,mapping_id,cadence,mapping_kind,quantity,evidence_id)
 values(s.id,s.billing_account_id,'paddle','test','base_plan',(facts->>'mappingId')::uuid,'monthly','plan',1,se);
 update public.billing_subscriptions_v2 set account_subscription_id=canonical,latest_evidence_id=se,
 latest_snapshot_sha256=(select normalized_sha256 from public.billing_evidence_v2 where id=se),
 last_reconciled_at=clock_timestamp(),reconciliation_status='processed',reconciliation_error_code=null,updated_at=clock_timestamp()
 where id=s.id;
 -- Existing deferred item-set constraints validate at commit. Any error rolls
 -- back evidence, application, canonical row, origin, item and link together.
 -- Application lifecycle time, not a fabricated provider timestamp. The proof
 -- helper holds the account and checkout locks for this entire transaction.
 if checkout.status='ready' then
 update public.billing_checkouts_v2 set status='completed',completed_subscription_id=s.id,
 completed_at=clock_timestamp(),updated_at=clock_timestamp(),error_code=null where id=checkout.id;
 end if;
 if trial.id is not null then
 -- Existing triggers record the trial status change and paid-row creation.
 -- This single semantic event links those two records without duplicating them.
 insert into public.account_subscription_events(billing_account_id,subscription_id,event_type,
 to_status,source,metadata,occurred_at)
 values(s.billing_account_id,canonical,'subscription.converted_to_paid','active','billing_provider',
 jsonb_build_object('previousKind','trial','previousSubscriptionId',trial.id,'checkoutAttemptId',checkout.id),conversion_at);
 end if;
 return jsonb_build_object('success',true,'reused',false);
end $$;

commit;
