-- Derive resource revisions without rewriting event watermarks or evidence.
begin;

-- Keep the full precision (up to nine fractional digits) accepted by ingress.
-- timestamptz validates the value and its offset, but stores only microseconds;
-- the fractional digits are therefore added to the exact UTC second separately.
create function public.billing_paddle_seat_timestamp_key_v1(p_value jsonb)
returns text language plpgsql stable strict set search_path=pg_catalog,public as $$
declare spelling text; whole_second text; fraction text;
begin
 perform public.billing_paddle_timestamp_v1(p_value);
 spelling:=p_value#>>'{}';
 fraction:=substring(spelling from '\.([0-9]{1,9})(Z|[+-][0-9]{2}:[0-9]{2})$');
 whole_second:=regexp_replace(spelling,'\.[0-9]{1,9}(Z|[+-][0-9]{2}:[0-9]{2})$','\1');
 return (extract(epoch from whole_second::timestamptz)*1000000000
  +coalesce(rpad(fraction,9,'0')::numeric,0))::text;
end $$;
revoke all on function public.billing_paddle_seat_timestamp_key_v1(jsonb)
 from public,anon,authenticated,service_role;

-- Ingress retains a closed subscription shape. Event identity and occurrence
-- describe delivery. Normalize only the known resource timestamp paths and
-- item order; preserve every other field, item multiplicity and missing/null.
create function public.billing_paddle_seat_resource_state_v1(p_observation jsonb)
returns jsonb language plpgsql stable strict set search_path=pg_catalog,public as $$
declare state jsonb; field text; nested jsonb; canonical_items jsonb;
begin
 state:=p_observation-array['eventRef','notificationRef','occurredAt','eventType','kind'];
 foreach field in array array['updatedAt','nextBilledAt','canceledAt','pausedAt'] loop
  if state ? field and state->field<>'null'::jsonb then
   state:=jsonb_set(state,array[field],to_jsonb(public.billing_paddle_seat_timestamp_key_v1(state->field)));
  end if;
 end loop;
 foreach field in array array['currentBillingPeriod','scheduledChange'] loop
  if state ? field and state->field<>'null'::jsonb then
   nested:=state->field;
   if field='currentBillingPeriod' then
    if nested ? 'startsAt' and nested->'startsAt'<>'null'::jsonb then
     nested:=jsonb_set(nested,'{startsAt}',to_jsonb(public.billing_paddle_seat_timestamp_key_v1(nested->'startsAt')));
    end if;
    if nested ? 'endsAt' and nested->'endsAt'<>'null'::jsonb then
     nested:=jsonb_set(nested,'{endsAt}',to_jsonb(public.billing_paddle_seat_timestamp_key_v1(nested->'endsAt')));
    end if;
   elsif nested ? 'effectiveAt' and nested->'effectiveAt'<>'null'::jsonb then
    nested:=jsonb_set(nested,'{effectiveAt}',to_jsonb(public.billing_paddle_seat_timestamp_key_v1(nested->'effectiveAt')));
   end if;
   state:=jsonb_set(state,array[field],nested);
  end if;
 end loop;
 if jsonb_typeof(state->'items')='array' then
  select coalesce(jsonb_agg(item order by item::text collate "C"),'[]'::jsonb)
   into canonical_items from jsonb_array_elements(state->'items') as i(item);
  state:=jsonb_set(state,'{items}',canonical_items);
 end if;
 return state;
end
$$;
revoke all on function public.billing_paddle_seat_resource_state_v1(jsonb)
 from public,anon,authenticated,service_role;

create function public.billing_paddle_seat_resource_updated_at_v1(p_subscription uuid)
returns text language plpgsql set search_path=pg_catalog,public as $$
declare s public.billing_subscriptions_v2%rowtype; r record; current_evidence public.billing_evidence_v2%rowtype;
 current_observation jsonb; current_occurred numeric; current_revision numeric;
 observed numeric; revision numeric; watermark numeric; watermark_spelling text; observations integer:=0;
 applied boolean; revision_key text; occurrence_key text; resource_state jsonb;
 states_by_revision jsonb:='{}'::jsonb; states_by_occurrence jsonb:='{}'::jsonb;
begin
 select * into s from public.billing_subscriptions_v2 where id=p_subscription;
 if s.id is null or s.provider<>'paddle' or s.environment<>'test'
 or s.shadow_status<>'current' or s.reconciliation_status<>'processed' then
 raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_AUTHORITY'; end if;
 select * into current_evidence from public.billing_evidence_v2 where id=s.latest_evidence_id
 and subscription_id=s.id and proof_kind='subscription' and provider='paddle' and environment='test'
 and source_kind='webhook' and proof_schema in ('paddle-initial-purchase-v1',
 'paddle-subscription-lifecycle-v1','paddle-plan-change-v1','paddle-seat-quantity-v1');
 if current_evidence.id is null then raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_AUTHORITY'; end if;
 perform public.billing_paddle_reconciliation_event_v1(current_evidence.event_id);
 select observation into current_observation from public.billing_paddle_event_observations
 where event_id=current_evidence.event_id;
 current_occurred:=public.billing_paddle_seat_timestamp_key_v1(current_observation->'occurredAt')::numeric;
 if current_observation ? 'updatedAt' then
  current_revision:=public.billing_paddle_seat_timestamp_key_v1(current_observation->'updatedAt')::numeric;
 elsif current_evidence.proof_schema<>'paddle-initial-purchase-v1'
 or current_observation->>'kind'<>'subscription.created' then
  raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_AUTHORITY'; end if;
 for r in select o.* from public.billing_paddle_event_observations o
 where o.observation->>'subscriptionRef'=s.provider_subscription_ref
 and o.observation->>'kind' like 'subscription.%' loop
  observations:=observations+1;
  -- The ordinary reconciliation helper requires disposition=correlated.
  -- Validate the same signed delivery for stale audit rows without granting
  -- them applied authority merely because they were retained.
  if r.observation_sha256 is distinct from encode(extensions.digest(r.observation::text,'sha256'),'hex')
  or r.observation->>'customerRef' is distinct from
   (select provider_customer_ref from public.billing_customers_v2 where id=s.customer_id
    and identity_status='current' and identity_source='verified_provider_event')
  or not exists(select 1 from public.billing_webhook_events_v2 be
   join public.billing_paddle_event_deliveries d on d.event_id=be.id
   join public.billing_verified_evidence_v2 v on v.id=d.verified_evidence_id
   where be.id=r.event_id and be.provider='paddle' and be.environment='test'
   and be.processing_status not in ('manual_review','failed')
   and v.provider=be.provider and v.environment=be.environment
   and v.proof_kind='event' and v.source_kind='webhook'
   and v.proof_schema='billing-proof-v2' and v.validator_version='paddle-contract-v1'
   and v.evidence_class='authenticated_provider' and not v.payment_authority
   and v.provider_event_ref=be.provider_event_ref and v.provider_notification_ref=d.notification_ref
   and v.raw_payload_sha256=d.raw_payload_sha256 and v.provider_resource_ref=be.resource_ref
   and v.proof#>>'{eventEvidence,eventName}'=be.provider_event_name
   and v.proof#>>'{eventEvidence,resourceType}'=be.resource_type
   and v.proof#>>'{identity,customerRef}'=r.observation->>'customerRef'
   and v.proof#>>'{identity,subscriptionRef}'=r.observation->>'subscriptionRef'
   and be.subscription_ref=r.observation->>'subscriptionRef'
   and be.customer_ref=r.observation->>'customerRef'
   and be.provider_event_ref=r.observation->>'eventRef'
   and be.provider_event_name=r.observation->>'kind'
   and be.occurred_at=(r.observation->>'occurredAt')::timestamptz
   and date_trunc('milliseconds',be.occurred_at)=(v.proof#>>'{eventEvidence,occurredAt}')::timestamptz)
  then raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_UNVERIFIED'; end if;
  -- Contradictions veto every authority class, including applied evidence.
  -- No watermark or supersession decision can hide an inconsistent pair.
  resource_state:=public.billing_paddle_seat_resource_state_v1(r.observation);
  occurrence_key:=public.billing_paddle_seat_timestamp_key_v1(r.observation->'occurredAt');
  if states_by_occurrence ? occurrence_key
   and states_by_occurrence->occurrence_key is distinct from resource_state then
   raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED'; end if;
  states_by_occurrence:=jsonb_set(states_by_occurrence,array[occurrence_key],resource_state,true);
  if r.observation ? 'updatedAt' then
   revision_key:=public.billing_paddle_seat_timestamp_key_v1(r.observation->'updatedAt');
   if states_by_revision ? revision_key
    and states_by_revision->revision_key is distinct from resource_state then
    raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED'; end if;
   states_by_revision:=jsonb_set(states_by_revision,array[revision_key],resource_state,true);
  end if;
  select exists(select 1 from public.billing_evidence_v2 e where e.subscription_id=s.id
   and e.event_id=r.event_id and e.proof_kind='subscription' and e.provider='paddle'
   and e.environment='test' and e.source_kind='webhook'
   and e.proof_schema in ('paddle-initial-purchase-v1','paddle-subscription-lifecycle-v1',
    'paddle-plan-change-v1','paddle-seat-quantity-v1')) into applied;
  if applied then
   perform public.billing_paddle_reconciliation_event_v1(r.event_id);
  elsif r.disposition in ('stale','correlated')
   and r.observation->>'kind'='subscription.updated'
   and jsonb_typeof(r.observation->'updatedAt')='string'
   and jsonb_typeof(r.observation->'occurredAt')='string' then
   observed:=public.billing_paddle_seat_timestamp_key_v1(r.observation->'occurredAt')::numeric;
   revision:=revision_key::numeric;
   -- Compare envelope clocks to envelope clocks and resource clocks to
   -- resource clocks. The same-event causal bound is an existing contract.
   if observed>=current_occurred or revision>observed
   or (current_revision is not null and revision>=current_revision)
   then raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED'; end if;
   continue; -- Proven superseded audit history stays immutable, not authoritative.
  else
   raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED'; end if;
  if not (r.observation ? 'updatedAt') then
   -- Only consumed historical initial subscription.created evidence may lack
   -- a resource revision. Never manufacture one from occurredAt.
   if r.observation->>'kind'<>'subscription.created' or not exists(
    select 1 from public.billing_evidence_v2 e where e.subscription_id=s.id
    and e.event_id=r.event_id and e.proof_kind='subscription'
    and e.proof_schema='paddle-initial-purchase-v1') then
    raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_AUTHORITY'; end if;
  else
   revision:=revision_key::numeric;
   if revision>public.billing_paddle_seat_timestamp_key_v1(r.observation->'occurredAt')::numeric then
    raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_AUTHORITY'; end if;
   -- Compare exact instants but serialize the winning retained RFC3339 string.
   -- No timestamptz round trip and no lexical MAX over offset spellings.
   if watermark is null or revision>watermark then
    watermark:=revision;
    watermark_spelling:=r.observation->>'updatedAt';
   end if;
  end if;
 end loop;
 if observations=0 then raise exception 'BILLING_SEAT_QUANTITY_RESOURCE_AUTHORITY'; end if;
 return watermark_spelling;
end $$;
revoke all on function public.billing_paddle_seat_resource_updated_at_v1(uuid)
 from public,anon,authenticated,service_role;

-- Preserve the existing context fields, ACL and eligibility checks. The new
-- field is mandatory (explicit JSON null for the guarded historical case).
do $$ declare body text; needle text;
begin
 body:=pg_get_functiondef('public.paddle_seat_quantity_context_v1(uuid,integer)'::regprocedure);
 needle:='''providerUpdatedAt'',s.provider_updated_at)';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then
  raise exception 'SEAT_CONTEXT_DEFINITION_DRIFT'; end if;
 execute replace(body,needle,'''providerUpdatedAt'',s.provider_updated_at,''resourceUpdatedAt'',public.billing_paddle_seat_resource_updated_at_v1(s.id))');
 body:=pg_get_functiondef('public.preview_paddle_seat_quantity_v1(uuid,integer,jsonb)'::regprocedure);
 needle:='(p_snapshot->>''updatedAt'')::timestamptz<(c->>''providerUpdatedAt'')::timestamptz';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then
  raise exception 'SEAT_PREVIEW_DEFINITION_DRIFT'; end if;
 -- begin calls this validator again under the account lock after GET. A new
 -- observation between GET and begin therefore vetoes durable dispatch.
 body:=replace(body,needle,'public.billing_paddle_seat_timestamp_key_v1(p_snapshot->''updatedAt'')::numeric<public.billing_paddle_seat_timestamp_key_v1(to_jsonb(c->>''resourceUpdatedAt''))::numeric');
 -- Validation must run even when a null historical watermark lets the planner
 -- short-circuit the comparison. Missing updatedAt still hits the original guard.
 needle:='c:=public.paddle_seat_quantity_context_v1(p_owner,p_target);';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then
  raise exception 'SEAT_PREVIEW_VALIDATION_DEFINITION_DRIFT'; end if;
 execute replace(body,needle,needle||'perform public.billing_paddle_seat_timestamp_key_v1(p_snapshot->''updatedAt'');');
end $$;
commit;
