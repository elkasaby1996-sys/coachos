begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_v2_legacy_seed.psql
\ir fixtures/billing_cross_ledger_helpers.psql
\ir fixtures/paddle_webhook_fixture.psql
\ir fixtures/paddle_auto_reconciliation_fixture.psql
\ir fixtures/paddle_lifecycle_fixture.psql
\ir fixtures/paddle_plan_change_fixture.psql
\ir fixtures/paddle_seat_fixture.psql
\ir fixtures/paddle_initial_period_fixture.psql
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
create temp table freshness_cases(label text,u uuid,snapshot jsonb,before_state jsonb);
insert into freshness_cases(label,u) values ('historical',pg_temp.period_owner()),('revision',pg_temp.plan_owner()),
 ('pending',pg_temp.period_owner()),('manual',pg_temp.period_owner()),('race',pg_temp.plan_owner());
update freshness_cases set snapshot=pg_temp.paddle_seat_snapshot(u,1),before_state=pg_temp.period_snapshot(u);
select is(paddle_seat_quantity_context_v1(u,1)->'resourceUpdatedAt','null'::jsonb,'historical consumed initial evidence has explicit null resource revision') from freshness_cases where label='historical';
select ok((paddle_seat_quantity_context_v1(u,1)->>'resourceUpdatedAt')::timestamptz is not null,'applied lifecycle observation supplies comparable resource revision') from freshness_cases where label='revision';
select is(billing_paddle_seat_timestamp_key_v1(paddle_seat_quantity_context_v1(u,1)->'resourceUpdatedAt')::numeric,
 (select max(billing_paddle_seat_timestamp_key_v1(o.observation->'updatedAt')::numeric) from billing_paddle_event_observations o
 join billing_evidence_v2 e on e.event_id=o.event_id where e.subscription_id=pg_temp.period_subscription(u)
 and e.proof_kind='subscription'),'resource watermark comes from consumed subscription evidence') from freshness_cases where label='revision';
update freshness_cases set snapshot=jsonb_set(snapshot,'{updatedAt}',to_jsonb(to_char(((snapshot->>'updatedAt')::timestamptz-interval '1 second') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))) where label in ('historical','revision');
select is(preview_paddle_seat_quantity_v1(u,1,snapshot)->>'eligible','true','event occurrence later than GET resource timestamp is not false staleness') from freshness_cases where label='historical';
select throws_ok($$select preview_paddle_seat_quantity_v1(u,1,snapshot) from freshness_cases where label='revision'$$,'P0001','BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT','actual older resource snapshot rejected');
select throws_ok($$select begin_paddle_seat_quantity_v1(u,1,gen_random_uuid(),snapshot) from freshness_cases where label='revision'$$,'P0001','BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT','durable begin rechecks comparable revision');
select throws_ok($$select preview_paddle_seat_quantity_v1(u,1,snapshot-'updatedAt') from freshness_cases where label='historical'$$,'P0001','BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT','missing GET revision rejected even in historical fallback');
select throws_ok($$select preview_paddle_seat_quantity_v1(u,1,jsonb_set(snapshot,'{updatedAt}','"not-a-timestamp"')) from freshness_cases where label='historical'$$,'P0001','PADDLE_LIFECYCLE_TIMESTAMP','malformed GET revision rejected even in historical fallback');
select throws_ok($$select preview_paddle_seat_quantity_v1(u,1,jsonb_set(snapshot,'{updatedAt}','"infinity"')) from freshness_cases where label='historical'$$,'P0001','PADDLE_LIFECYCLE_TIMESTAMP','nonfinite GET revision rejected');
select is(pg_temp.period_snapshot(u),before_state,'context and preview preserve historical initial proof/payment/period bytes') from freshness_cases where label='historical';

-- These are authenticated retained events through the real ingress, with no
-- reconciliation application. Neither a present nor absent watermark bypasses them.
do $$ declare r record;o jsonb; begin
 for r in select * from freshness_cases where label in ('pending','manual','race') loop
  o:=pg_temp.lifecycle_observation(r.u,'unresolved-'||r.label,'subscription.updated','active',
   to_char((clock_timestamp()+interval '10 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   '2026-09-20T00:00:00Z','2026-10-20T00:00:00Z');
  perform pg_temp.webhook_ingest(o);
  if r.label='manual' then
   update billing_webhook_events_v2 set processing_status='manual_review'
    where provider_event_ref=o->>'eventRef';
  end if;
 end loop;
end $$;
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from freshness_cases where label='pending'$$,'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED','unresolved update blocks historical fallback');
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from freshness_cases where label='manual'$$,'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNVERIFIED','manual-review update blocks historical fallback');
select throws_ok($$select begin_paddle_seat_quantity_v1(u,1,gen_random_uuid(),snapshot) from freshness_cases where label='race'$$,'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED','new observation after GET blocks operation creation under the account lock');
select is((select count(*) from billing_operations_v2 where operation_kind='seat_quantity'),0::bigint,'no durable seat operation on freshness failure');
select is((select count(*) from billing_payment_applications_v2 where application_kind='seat_increase'),0::bigint,'no seat payment authority introduced');
select ok(not has_function_privilege('service_role','billing_paddle_seat_resource_updated_at_v1(uuid)','execute'),'derived helper is private to the context authority');
select ok(not has_function_privilege('authenticated','billing_paddle_seat_resource_updated_at_v1(uuid)','execute'),'owner cannot bypass context checks');

-- Reproduce the two immutable histories independently found by CODEX-64.
-- Both are permitted by the existing initial-period authority, and neither
-- becomes a current resource revision merely because it was retained.
create temp table old_seat_history(label text primary key,u uuid,event_id uuid,snapshot jsonb,retained jsonb);
insert into old_seat_history(label,u) values
 ('ingress-stale',pg_temp.period_pending_owner()),
 ('linked-old',pg_temp.period_owner(null,true)),
 ('stale-pending',pg_temp.period_pending_owner()),
 ('stale-manual',pg_temp.period_pending_owner()),
 ('stale-newer',pg_temp.period_pending_owner()),
 ('old-equal',pg_temp.period_owner(null,true)),
 ('stale-unverified',pg_temp.period_pending_owner());
update old_seat_history c set event_id=pg_temp.lifecycle_ingest(
 pg_temp.lifecycle_observation(c.u,'seat-old-'||c.label,'subscription.updated','canceled',
 '2026-09-20T09:59:59Z','2026-08-20T00:00:00Z','2026-09-20T00:00:00Z'));
select is(o.disposition,case when c.label in ('linked-old','old-equal') then 'correlated' else 'stale' end,
 c.label||' retains the expected ingress disposition')
from old_seat_history c join billing_paddle_event_observations o on o.event_id=c.event_id;
select is(pg_temp.auto_dispatch(u,'subscription.created'),'applied',label||' initial purchase remains valid')
from old_seat_history where label not in ('linked-old','old-equal');
select is(bootstrap_paddle_initial_period_v1(pg_temp.period_subscription(u))->>'status',
 case when label in ('linked-old','old-equal') then 'applied' else 'reused' end,
 label||' period bootstrap accepts old audit history') from old_seat_history;
update old_seat_history c set snapshot=pg_temp.paddle_seat_snapshot(c.u,1),
 retained=to_jsonb(o) from billing_paddle_event_observations o where o.event_id=c.event_id;
select is(paddle_seat_quantity_context_v1(u,1)->'resourceUpdatedAt','null'::jsonb,
 label||' old audit history is not a resource watermark')
from old_seat_history where label in ('ingress-stale','linked-old');
select is(preview_paddle_seat_quantity_v1(u,1,snapshot)->>'eligible','true',
 label||' old audit history permits eligible preview')
from old_seat_history where label in ('ingress-stale','linked-old');
select is(to_jsonb(o),c.retained,label||' stale observation remains physically unchanged')
from old_seat_history c join billing_paddle_event_observations o on o.event_id=c.event_id
where c.label in ('ingress-stale','linked-old');

-- A later applied lifecycle revision can also supersede an old correlated
-- audit row. The old row contributes no resource authority of its own.
create temp table later_applied_history as select pg_temp.plan_owner() u;
alter table later_applied_history add column old_event_id uuid;
update later_applied_history c set old_event_id=pg_temp.lifecycle_ingest(
 pg_temp.lifecycle_observation(c.u,'seat-old-after-lifecycle','subscription.updated','canceled',
 '2026-09-20T09:59:59Z','2026-08-20T00:00:00Z','2026-09-20T00:00:00Z'));
select is(o.disposition,'correlated','linked ingress retains old history after applied lifecycle')
from later_applied_history c join billing_paddle_event_observations o on o.event_id=c.old_event_id;
select ok((paddle_seat_quantity_context_v1(u,1)->>'resourceUpdatedAt')::timestamptz>
 (select (o.observation->>'updatedAt')::timestamptz from billing_paddle_event_observations o where o.event_id=c.old_event_id),
 'later applied revision remains the resource watermark') from later_applied_history c;
select is(preview_paddle_seat_quantity_v1(u,1,pg_temp.paddle_seat_snapshot(u,1))->>'eligible','true',
 'later applied provider state safely supersedes old audit observation') from later_applied_history;
select is((select count(*) from billing_evidence_v2 e
 where e.subscription_id=pg_temp.period_subscription(u)
 and e.proof_schema='paddle-subscription-lifecycle-v1' and e.proof_kind='subscription'),1::bigint,
 'later accepted state has an applied lifecycle subscription proof') from later_applied_history;

-- An old row never masks genuinely new, ambiguous, or unverifiable knowledge.
do $$ declare c record; o jsonb; begin
 for c in select * from old_seat_history where label in ('stale-pending','stale-manual','stale-newer') loop
  o:=pg_temp.lifecycle_observation(c.u,'seat-block-'||c.label,'subscription.updated','active',
   to_char((clock_timestamp()+interval '10 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   '2026-09-20T00:00:00Z','2026-10-20T00:00:00Z');
  perform pg_temp.webhook_ingest(o);
  if c.label='stale-manual' then
   update billing_webhook_events_v2 set processing_status='manual_review'
    where provider_event_ref=o->>'eventRef';
  end if;
 end loop;
 o:=pg_temp.lifecycle_observation((select u from old_seat_history where label='old-equal'),
  'seat-equal-conflict','subscription.updated','active','2026-09-20T09:59:59Z',
  '2026-08-20T00:00:00Z','2026-09-20T00:00:00Z');
 perform pg_temp.webhook_ingest(o);
end $$;
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from old_seat_history where label='stale-pending'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED','old stale plus new unresolved observation blocks');
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from old_seat_history where label='stale-manual'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNVERIFIED','old stale plus manual-review observation blocks');
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from old_seat_history where label='stale-newer'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED','old stale plus newer unapplied revision blocks');
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from old_seat_history where label='old-equal'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED','equal-clock conflicting old observations block');
-- The fixture removes a delivery with its immutable-history trigger temporarily
-- disabled inside this rolled-back transaction; production cannot do this.
alter table billing_paddle_event_deliveries disable trigger paddle_delivery_history;
delete from billing_paddle_event_deliveries where event_id=(select event_id from old_seat_history where label='stale-unverified');
alter table billing_paddle_event_deliveries enable trigger paddle_delivery_history;
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from old_seat_history where label='stale-unverified'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNVERIFIED','stale label without authenticated delivery cannot be skipped');
select throws_ok($$select begin_paddle_seat_quantity_v1(u,1,gen_random_uuid(),snapshot)
 from old_seat_history where label='stale-pending'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED','intervening new event blocks durable begin despite old stale history');
select is((select count(*) from billing_operations_v2 where operation_kind='seat_quantity'),0::bigint,
 'mixed-history failures create no seat operation');

-- Two signed subscription updates can claim the same resource revision even
-- when their webhook envelopes have different occurrence times. Neither event
-- clock may choose a winner for contradictory resource state.
create temp table resource_revision_cases(
 label text primary key,u uuid,snapshot jsonb,first_observation jsonb,second_observation jsonb,
 first_event_id uuid,second_event_id uuid);
insert into resource_revision_cases(label,u)
select label,pg_temp.period_owner() from unnest(array[
 'status','past-due','items-quantity','items-price','items-product','period',
 'next-billed','schedule-presence','schedule-action','schedule-effective',
 'canceled-at','paused-at','plan-marker','seat-marker','missing-state',
 'equivalent']) label;
update resource_revision_cases set snapshot=pg_temp.paddle_seat_snapshot(u,1);
do $$ declare c record; first_payload jsonb; second_payload jsonb;
begin
 for c in select * from resource_revision_cases loop
  first_payload:=pg_temp.lifecycle_observation(c.u,'revision-a-'||c.label,
   'subscription.updated','active','2026-09-20T09:59:58Z',
   '2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
   ||jsonb_build_object('updatedAt','2026-09-20T09:59:57Z');
  second_payload:=first_payload||jsonb_build_object(
   'eventRef','synthetic/lifecycle/revision-b-'||c.label||'/'||c.u,
   'notificationRef','synthetic/lifecycle/revision-b-'||c.label||'/'||c.u,
   'occurredAt','2026-09-20T09:59:59Z');
  case c.label
   when 'status' then second_payload:=jsonb_set(second_payload,'{status}','"canceled"');
   when 'past-due' then second_payload:=jsonb_set(second_payload,'{status}','"past_due"');
   when 'items-quantity' then second_payload:=jsonb_set(second_payload,'{items,0,quantity}','2');
   when 'items-price' then second_payload:=jsonb_set(second_payload,'{items,0,priceRef}','"synthetic/price/alternate"');
   when 'items-product' then second_payload:=jsonb_set(second_payload,'{items,0,productRef}','"synthetic/product/alternate"');
   when 'period' then second_payload:=jsonb_set(second_payload,'{currentBillingPeriod,endsAt}','"2026-10-21T00:00:00Z"');
   when 'next-billed' then second_payload:=jsonb_set(second_payload,'{nextBilledAt}','"2026-10-21T00:00:00Z"');
   when 'schedule-presence' then second_payload:=jsonb_set(second_payload,'{scheduledChange}',
    '{"action":"cancel","effectiveAt":"2026-10-20T00:00:00Z"}'::jsonb);
   when 'schedule-action' then
    first_payload:=jsonb_set(first_payload,'{scheduledChange}',
     '{"action":"cancel","effectiveAt":"2026-10-20T00:00:00Z"}'::jsonb);
    second_payload:=jsonb_set(second_payload,'{scheduledChange}',
     '{"action":"pause","effectiveAt":"2026-10-20T00:00:00Z"}'::jsonb);
   when 'schedule-effective' then
    first_payload:=jsonb_set(first_payload,'{scheduledChange}',
     '{"action":"cancel","effectiveAt":"2026-10-20T00:00:00Z"}'::jsonb);
    second_payload:=jsonb_set(second_payload,'{scheduledChange}',
     '{"action":"cancel","effectiveAt":"2026-10-21T00:00:00Z"}'::jsonb);
   when 'canceled-at' then second_payload:=jsonb_set(second_payload,'{canceledAt}','"2026-09-20T09:59:57Z"');
   when 'paused-at' then second_payload:=jsonb_set(second_payload,'{pausedAt}','"2026-09-20T09:59:57Z"');
   when 'plan-marker' then
    first_payload:=first_payload||jsonb_build_object('planChangeOperationId',gen_random_uuid());
    second_payload:=second_payload||jsonb_build_object('planChangeOperationId',gen_random_uuid());
   when 'seat-marker' then
    first_payload:=first_payload||jsonb_build_object('seatQuantityOperationId',gen_random_uuid());
    second_payload:=second_payload||jsonb_build_object('seatQuantityOperationId',gen_random_uuid());
   when 'missing-state' then second_payload:=second_payload-'scheduledChange';
   else null;
  end case;
  update resource_revision_cases set first_observation=first_payload,
   second_observation=second_payload where label=c.label;
 end loop;
end $$;
select is(public.billing_paddle_seat_resource_state_v1(first_observation),
 public.billing_paddle_seat_resource_state_v1(second_observation),
 'eventRef and occurredAt differences do not change a resource-state projection')
from resource_revision_cases where label='equivalent';
select ok(public.billing_paddle_seat_resource_state_v1(first_observation)
 is distinct from public.billing_paddle_seat_resource_state_v1(second_observation),
 label||' changes the resource-state projection')
from resource_revision_cases where label<>'equivalent';
select ok(not has_function_privilege('authenticated','billing_paddle_seat_resource_state_v1(jsonb)','execute'),
 'private resource-state projection is not an owner RPC');
update resource_revision_cases c set first_event_id=pg_temp.lifecycle_ingest(c.first_observation),
 second_event_id=pg_temp.lifecycle_ingest(c.second_observation);
select is((select count(*) from billing_paddle_event_observations o
 where o.event_id in (c.first_event_id,c.second_event_id)),2::bigint,
 label||' retains both authenticated conflicting or equivalent observations')
from resource_revision_cases c;
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from resource_revision_cases where label='status'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',
 'CODEX-66 active/canceled equal-resource conflict blocks seat context');
select throws_ok($$select preview_paddle_seat_quantity_v1(u,1,snapshot)
 from resource_revision_cases where label='status'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',
 'CODEX-66 conflict blocks preview');
select throws_ok($$select begin_paddle_seat_quantity_v1(u,1,gen_random_uuid(),snapshot)
 from resource_revision_cases where label='status'$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',
 'CODEX-66 conflict blocks durable begin');
select is((select count(*) from billing_operations_v2 where operation_kind='seat_quantity'),0::bigint,
 'CODEX-66 conflict creates no durable seat operation');
select throws_ok(format('select paddle_seat_quantity_context_v1(%L::uuid,1)',u),
 'P0001',case when label in ('items-quantity','items-price','items-product')
 then 'BILLING_SEAT_QUANTITY_RESOURCE_UNVERIFIED'
 else 'BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED' end,
 label||' equal-resource conflict blocks seat context')
from resource_revision_cases where label not in ('status','equivalent');
select is(paddle_seat_quantity_context_v1(u,1)->'resourceUpdatedAt','null'::jsonb,
 'equivalent event metadata variations retain guarded historical null watermark')
from resource_revision_cases where label='equivalent';
select is(preview_paddle_seat_quantity_v1(u,1,snapshot)->>'eligible',
 'true','equivalent resource state remains eligible')
from resource_revision_cases where label='equivalent';

-- A later accepted lifecycle resource revision cannot hide a conflict between
-- older observations that claim a single earlier resource revision.
create temp table accepted_revision_conflict as select pg_temp.plan_owner() u;
do $$ declare u uuid; first_observation jsonb; second_observation jsonb;
begin
 select c.u into u from accepted_revision_conflict c;
 first_observation:=pg_temp.lifecycle_observation(u,'revision-accepted-a',
  'subscription.updated','active','2026-09-20T09:59:58Z',
  '2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
  ||jsonb_build_object('updatedAt','2026-09-20T09:59:57Z');
 second_observation:=first_observation||jsonb_build_object(
  'eventRef','synthetic/lifecycle/revision-accepted-b/'||u,
  'notificationRef','synthetic/lifecycle/revision-accepted-b/'||u,
  'occurredAt','2026-09-20T09:59:59Z','status','canceled');
 perform pg_temp.lifecycle_ingest(first_observation);
 perform pg_temp.lifecycle_ingest(second_observation);
end $$;
select throws_ok($$select paddle_seat_quantity_context_v1(u,1) from accepted_revision_conflict$$,
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',
 'later applied resource watermark does not suppress an older equal-revision conflict');

-- Distinct clock domains cannot compensate for one another. Both independent
-- supersession orderings must be strict when an accepted resource revision exists.
create temp table crossed_clock_cases(label text primary key,u uuid);
insert into crossed_clock_cases(label,u) values
 ('older-event-newer-resource',pg_temp.period_owner()),
 ('newer-event-older-resource',pg_temp.period_owner());
do $$ declare c record; accepted jsonb; older jsonb;
begin
 for c in select * from crossed_clock_cases loop
  accepted:=pg_temp.lifecycle_observation(c.u,'crossed-accepted-'||c.label,
   'subscription.updated','active','2026-09-21T10:00:10Z',
   '2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
   ||jsonb_build_object('updatedAt','2026-09-21T10:00:00Z');
  if pg_temp.lifecycle_dispatch(accepted)<>'applied' then raise exception 'CROSSED_CLOCK_ACCEPTED_SETUP'; end if;
  older:=pg_temp.lifecycle_observation(c.u,'crossed-old-'||c.label,
   'subscription.updated','active',
   case c.label when 'older-event-newer-resource' then '2026-09-21T10:00:05Z'
    else '2026-09-21T10:00:11Z' end,
   '2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
   ||jsonb_build_object('updatedAt',
    case c.label when 'older-event-newer-resource' then '2026-09-21T10:00:01Z'
     else '2026-09-21T09:59:59Z' end);
  perform pg_temp.lifecycle_ingest(older);
 end loop;
end $$;
select throws_ok(format('select paddle_seat_quantity_context_v1(%L::uuid,1)',u),
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',
 label||' remains unresolved despite the other clock ordering')
from crossed_clock_cases;

-- Canonical comparison preserves every resource fact, item multiplicity and
-- missing/null while ignoring item position and RFC3339 serialization.
create temp table semantic_projection_cases(label text primary key,first_state jsonb,second_state jsonb,equivalent boolean);
do $$ declare u uuid:=pg_temp.period_owner(); a jsonb; scheduled jsonb; begin
 a:=pg_temp.lifecycle_observation(u,'semantic-projection','subscription.updated','active',
  '2026-09-20T09:59:58Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
  ||jsonb_build_object('updatedAt','2026-09-20T09:59:57.100Z');
 insert into semantic_projection_cases values
  ('revision-offset',a,jsonb_set(a,'{updatedAt}','"2026-09-20T12:59:57.100+03:00"'),true),
  ('revision-fraction',a,jsonb_set(a,'{updatedAt}','"2026-09-20T09:59:57.1Z"'),true),
  ('period-start-offset',a,jsonb_set(a,'{currentBillingPeriod,startsAt}','"2026-09-20T03:00:00+03:00"'),true),
  ('period-end-offset',a,jsonb_set(a,'{currentBillingPeriod,endsAt}','"2026-10-20T03:00:00+03:00"'),true),
  ('next-billed-offset',a,jsonb_set(a,'{nextBilledAt}','"2026-10-20T03:00:00+03:00"'),true),
  ('revision-different-instant',a,jsonb_set(a,'{updatedAt}','"2026-09-20T09:59:57.100000001Z"'),false),
  ('period-different-instant',a,jsonb_set(a,'{currentBillingPeriod,endsAt}','"2026-10-20T00:00:01Z"'),false),
  ('next-billed-different-instant',a,jsonb_set(a,'{nextBilledAt}','"2026-10-20T00:00:01Z"'),false),
  ('missing-vs-null',a-'scheduledChange',a,false),
  ('null-vs-timestamp',a,jsonb_set(a,'{pausedAt}','"2026-09-20T09:59:57Z"'),false),
  ('item-quantity',a,jsonb_set(a,'{items,0,quantity}','2'),false),
  ('item-price',a,jsonb_set(a,'{items,0,priceRef}','"synthetic/price/alternate"'),false),
  ('item-product',a,jsonb_set(a,'{items,0,productRef}','"synthetic/product/alternate"'),false),
  ('item-status',a,jsonb_set(a,'{items,0,status}','"inactive"'),false),
  ('item-amount',a,jsonb_set(a,'{items,0,unitPrice,amount}','"6000"'),false),
  ('item-currency',a,jsonb_set(a,'{items,0,unitPrice,currency}','"EUR"'),false),
  ('item-multiplicity',a,jsonb_set(a,'{items}',(a->'items')||(a->'items')),false);
 scheduled:=jsonb_set(a,'{scheduledChange}',
  '{"action":"cancel","effectiveAt":"2026-10-20T00:00:00.100Z"}'::jsonb);
 insert into semantic_projection_cases values
  ('scheduled-offset',scheduled,
   jsonb_set(scheduled,'{scheduledChange,effectiveAt}','"2026-10-20T03:00:00.100+03:00"'),true),
  ('scheduled-different-instant',scheduled,
   jsonb_set(scheduled,'{scheduledChange,effectiveAt}','"2026-10-20T00:00:00.101Z"'),false),
  ('canceled-offset',jsonb_set(a,'{canceledAt}','"2026-09-20T09:59:57.1Z"'),
   jsonb_set(a,'{canceledAt}','"2026-09-20T12:59:57.100+03:00"'),true),
  ('paused-offset',jsonb_set(a,'{pausedAt}','"2026-09-20T09:59:57.1Z"'),
   jsonb_set(a,'{pausedAt}','"2026-09-20T12:59:57.100+03:00"'),true),
  ('canceled-missing-vs-null',a-'canceledAt',a,false),
  ('period-null-vs-value',jsonb_set(a,'{currentBillingPeriod}','null'::jsonb),a,false);
end $$;
select is(billing_paddle_seat_resource_state_v1(first_state),
 billing_paddle_seat_resource_state_v1(second_state),
 label||' compares equal as one resource state')
from semantic_projection_cases where equivalent;
select ok(billing_paddle_seat_resource_state_v1(first_state)
 is distinct from billing_paddle_seat_resource_state_v1(second_state),
 label||' remains a distinct resource state')
from semantic_projection_cases where not equivalent;
select is(billing_paddle_seat_timestamp_key_v1('"2026-09-29T10:00:00Z"'::jsonb),
 billing_paddle_seat_timestamp_key_v1('"2026-09-29T13:00:00+03:00"'::jsonb),
 'UTC normalization is independent of timezone spelling');
select is(billing_paddle_seat_timestamp_key_v1('"2026-09-29T10:00:00.000000001Z"'::jsonb),
 billing_paddle_seat_timestamp_key_v1('"2026-09-29T13:00:00.000000001+03:00"'::jsonb),
 'offset normalization preserves a nanosecond');
select isnt(billing_paddle_seat_timestamp_key_v1('"2026-09-29T10:00:00.000000001Z"'::jsonb),
 billing_paddle_seat_timestamp_key_v1('"2026-09-29T10:00:00.000000002Z"'::jsonb),
 'different nanoseconds remain distinct');
set local timezone='Pacific/Auckland';
select is(billing_paddle_seat_timestamp_key_v1('"2026-09-29T10:00:00.1Z"'::jsonb),
 billing_paddle_seat_timestamp_key_v1('"2026-09-29T13:00:00.100+03:00"'::jsonb),
 'timestamp key is independent of session timezone');
set local timezone='UTC';
select throws_ok($$select billing_paddle_seat_timestamp_key_v1('"2026-02-30T00:00:00Z"'::jsonb)$$,
 'P0001','PADDLE_LIFECYCLE_TIMESTAMP','invalid calendar date remains rejected');
select ok(not has_function_privilege('authenticated','billing_paddle_seat_timestamp_key_v1(jsonb)','execute'),
 'timestamp projection helper is not an owner RPC');

-- Both findings are exercised through authenticated retained ingress and the
-- actual seat context/preview functions, not just the projection helper.
create temp table semantic_ingress_cases(label text primary key,u uuid,target integer,snapshot jsonb,a jsonb,b jsonb);
do $$ declare u uuid; snap jsonb; a jsonb; b jsonb; accepted jsonb; stamp timestamptz; begin
 u:=pg_temp.period_owner();
 snap:=pg_temp.paddle_seat_snapshot(u,1);
 a:=pg_temp.lifecycle_observation(u,'semantic-timestamp-a','subscription.updated','active',
  '2026-09-20T09:59:58Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
  ||jsonb_build_object('updatedAt','2026-09-20T09:59:57.100Z');
 b:=a||jsonb_build_object('eventRef','synthetic/semantic/timestamp-b',
  'notificationRef','synthetic/semantic/timestamp-b','occurredAt','2026-09-20T09:59:59Z',
  'updatedAt','2026-09-20T12:59:57.100+03:00',
  'currentBillingPeriod',jsonb_build_object('startsAt','2026-09-20T03:00:00+03:00',
   'endsAt','2026-10-20T03:00:00+03:00'),
  'nextBilledAt','2026-10-20T03:00:00+03:00');
 perform pg_temp.webhook_ingest(a);
 perform pg_temp.webhook_ingest(b);
 insert into semantic_ingress_cases values ('timestamp-spelling',u,1,snap,a,b);

 u:=pg_temp.plan_owner();
 if pg_temp.paddle_seat_buy(u,1)<>'applied' then raise exception 'SEMANTIC_SEAT_SETUP';end if;
 snap:=pg_temp.paddle_seat_snapshot(u,2);
 select o.observation into accepted from billing_subscriptions_v2 s
  join billing_evidence_v2 e on e.id=s.latest_evidence_id
  join billing_paddle_event_observations o on o.event_id=e.event_id
  where s.id=pg_temp.period_subscription(u);
 stamp:=(accepted->>'updatedAt')::timestamptz;
 a:=accepted||jsonb_build_object('eventRef','synthetic/semantic/order-a',
  'notificationRef','synthetic/semantic/order-a',
  'updatedAt',to_char((stamp-interval '3 microseconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'occurredAt',to_char((stamp-interval '2 microseconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 b:=a||jsonb_build_object('eventRef','synthetic/semantic/order-b',
  'notificationRef','synthetic/semantic/order-b',
  'occurredAt',to_char((stamp-interval '1 microsecond') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'items',jsonb_build_array(a->'items'->1,a->'items'->0));
 perform pg_temp.webhook_ingest(a);
 perform pg_temp.webhook_ingest(b);
 insert into semantic_ingress_cases values ('item-order',u,2,snap,a,b);
end $$;
select is(billing_paddle_seat_resource_state_v1(a),billing_paddle_seat_resource_state_v1(b),
 label||' signed observations project to equivalent resource state') from semantic_ingress_cases;
select is((select count(*) from billing_paddle_event_observations o
 where o.observation->>'eventRef' in (c.a->>'eventRef',c.b->>'eventRef')
 and o.disposition='correlated'),2::bigint,
 label||' retains both authenticated correlated observations') from semantic_ingress_cases c;
select ok(jsonb_array_length(a->'items')=2,'base and seat addon are both retained before reordering')
 from semantic_ingress_cases where label='item-order';
select ok(paddle_seat_quantity_context_v1(u,target) ? 'resourceUpdatedAt',
 label||' remains eligible for seat context') from semantic_ingress_cases;
select is(preview_paddle_seat_quantity_v1(u,target,snapshot)->>'eligible','true',
 label||' remains eligible for seat preview') from semantic_ingress_cases;

-- A conflicting second observation visible after the captured context must
-- still be rejected by begin before it inserts a provider_pending operation.
create temp table semantic_intervening as select pg_temp.period_owner() u;
alter table semantic_intervening add column snapshot jsonb;
update semantic_intervening set snapshot=pg_temp.paddle_seat_snapshot(u,1);
do $$ declare u uuid; a jsonb; b jsonb; begin
 select c.u into u from semantic_intervening c;
 a:=pg_temp.lifecycle_observation(u,'semantic-intervening-a','subscription.updated','active',
  '2026-09-20T09:59:58Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
  ||jsonb_build_object('updatedAt','2026-09-20T09:59:57Z');
 perform pg_temp.webhook_ingest(a);
 perform paddle_seat_quantity_context_v1(u,1);
 b:=a||jsonb_build_object('eventRef','synthetic/semantic/intervening-b',
  'notificationRef','synthetic/semantic/intervening-b',
  'occurredAt','2026-09-20T09:59:59Z','status','canceled');
 perform pg_temp.webhook_ingest(b);
end $$;
select throws_ok($$select begin_paddle_seat_quantity_v1(u,1,gen_random_uuid(),snapshot)
 from semantic_intervening$$,'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',
 'begin rechecks an intervening genuine equal-revision contradiction');
select is((select count(*) from billing_operations_v2 where operation_kind='seat_quantity'
 and status='provider_pending'),0::bigint,'intervening contradiction creates no durable seat operation');
-- CODEX-71: same golden vectors as the transport comparator tests.
create temp table exact_revision_vectors(label text,authority text,snapshot text,ordering integer);
insert into exact_revision_vectors values
 ('offset-positive','2026-09-29T10:00:00Z','2026-09-29T13:00:00+03:00',0),
 ('offset-negative','2026-09-29T10:00:00Z','2026-09-29T05:00:00-05:00',0),
 ('fraction-spelling','2026-09-29T10:00:00.1Z','2026-09-29T10:00:00.100000000Z',0),
 ('stale-99ns','2026-09-29T10:00:00.123456799Z','2026-09-29T10:00:00.123456700Z',-1),
 ('exact-current','2026-09-29T10:00:00.123456799Z','2026-09-29T10:00:00.123456799Z',0),
 ('newer-1ns','2026-09-29T10:00:00.123456799Z','2026-09-29T10:00:00.123456800Z',1),
 ('rounding-boundary','2026-09-29T10:00:00.123999999Z','2026-09-29T10:00:00.123999999Z',0),
 ('offset-rollover','2026-09-29T23:00:00.123456789Z','2026-09-30T02:00:00.123456789+03:00',0),
 ('negative-rollover','2026-09-29T00:00:00.123456789Z','2026-09-28T19:00:00.123456789-05:00',0),
 ('stale-sub-millisecond','2026-09-29T10:00:00.123900Z','2026-09-29T10:00:00.123800Z',-1),
 ('pre-epoch','1960-01-01T00:00:00.123456789Z','1959-12-31T19:00:00.123456789-05:00',0),
 ('fraction-1','2026-09-29T10:00:00.1Z','2026-09-29T13:00:00.100000000+03:00',0),
 ('fraction-2','2026-09-29T10:00:00.12Z','2026-09-29T13:00:00.120000000+03:00',0),
 ('fraction-3','2026-09-29T10:00:00.123Z','2026-09-29T13:00:00.123000000+03:00',0),
 ('fraction-4','2026-09-29T10:00:00.1234Z','2026-09-29T13:00:00.123400000+03:00',0),
 ('fraction-5','2026-09-29T10:00:00.12345Z','2026-09-29T13:00:00.123450000+03:00',0),
 ('fraction-6','2026-09-29T10:00:00.123456Z','2026-09-29T13:00:00.123456000+03:00',0),
 ('fraction-7','2026-09-29T10:00:00.1234567Z','2026-09-29T13:00:00.123456700+03:00',0),
 ('fraction-8','2026-09-29T10:00:00.12345678Z','2026-09-29T13:00:00.123456780+03:00',0),
 ('fraction-9','2026-09-29T10:00:00.123456789Z','2026-09-29T13:00:00.123456789+03:00',0);
select is(sign(billing_paddle_seat_timestamp_key_v1(to_jsonb(snapshot))::numeric
 -billing_paddle_seat_timestamp_key_v1(to_jsonb(authority))::numeric)::integer,
 ordering,label||' exact SQL ordering matches transport golden vector')
from exact_revision_vectors;

-- Equal-event semantics must agree with the equal-resource projection.
create temp table equal_event_cases(label text primary key,u uuid,target integer,snapshot jsonb,
 a jsonb,b jsonb,expected_error text,retained jsonb);
do $$declare label text;u uuid;a jsonb;b jsonb;target integer;sn jsonb;err text;
begin
 foreach label in array array['metadata','timestamp-spelling','item-order',
 'status','period','schedule','items','operation-marker','different-revision'] loop
  target:=1;err:=null;
  if label='item-order' then
   select c.u,c.target,c.snapshot,c.a,c.b into u,target,sn,a,b
    from semantic_ingress_cases c where c.label='item-order';
   a:=a||jsonb_build_object('eventRef','synthetic/equal/order-a','notificationRef','synthetic/equal/order-a');
   b:=b||jsonb_build_object('eventRef','synthetic/equal/order-b','notificationRef','synthetic/equal/order-b',
    'occurredAt',a->>'occurredAt');
  else
   u:=pg_temp.period_owner();sn:=pg_temp.paddle_seat_snapshot(u,1);
   a:=pg_temp.lifecycle_observation(u,'equal-a-'||label,'subscription.updated','active',
    '2026-09-20T09:59:58Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
    ||jsonb_build_object('updatedAt','2026-09-20T09:59:57Z');
   b:=a||jsonb_build_object('eventRef','synthetic/equal/b/'||label,'notificationRef','synthetic/equal/b/'||label);
   if label='timestamp-spelling' then
    b:=b||jsonb_build_object('updatedAt','2026-09-20T12:59:57.000+03:00',
     'currentBillingPeriod',jsonb_build_object('startsAt','2026-09-20T03:00:00+03:00','endsAt','2026-10-20T03:00:00+03:00'),
     'nextBilledAt','2026-10-20T03:00:00+03:00');
   elsif label<>'metadata' then
    -- Different exact revisions ensure these negatives exercise the equal-event
    -- guard itself, not only the equal-resource-revision collision map.
    b:=b||jsonb_build_object('updatedAt','2026-09-20T09:59:57.000000001Z');
    err:='BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED';
    case label
     when 'status' then b:=jsonb_set(b,'{status}','"canceled"');
     when 'period' then b:=jsonb_set(b,'{currentBillingPeriod,endsAt}','"2026-10-21T00:00:00Z"');
     when 'schedule' then b:=jsonb_set(b,'{scheduledChange}','{"action":"cancel","effectiveAt":"2026-10-20T00:00:00Z"}');
     -- Depending on scan order, either signed-fact verification or semantic
     -- conflict detection sees this invalid quantity first. Both must reject.
     when 'items' then b:=jsonb_set(b,'{items,0,quantity}','2');err:='BILLING_SEAT_QUANTITY_RESOURCE_(UNVERIFIED|UNRESOLVED)';
     when 'operation-marker' then b:=b||jsonb_build_object('seatQuantityOperationId',gen_random_uuid());
     else null;
    end case;
   end if;
  end if;
  perform pg_temp.webhook_ingest(a);perform pg_temp.webhook_ingest(b);
  insert into equal_event_cases values(label,u,target,sn,a,b,err,
   (select jsonb_agg(to_jsonb(o) order by o.event_id) from billing_paddle_event_observations o
    where o.observation->>'eventRef' in (a->>'eventRef',b->>'eventRef')));
 end loop;
end$$;
select is(billing_paddle_seat_resource_state_v1(a),billing_paddle_seat_resource_state_v1(b),
 label||' equal-event positive has the same semantic resource state')
from equal_event_cases where expected_error is null;
select ok(paddle_seat_quantity_context_v1(u,target) ? 'resourceUpdatedAt',
 label||' equal-event equivalent state allows context') from equal_event_cases where expected_error is null;
select is(preview_paddle_seat_quantity_v1(u,target,snapshot)->>'eligible','true',
 label||' equal-event equivalent state allows preview') from equal_event_cases where expected_error is null;
select is(begin_paddle_seat_quantity_v1(u,target,gen_random_uuid(),snapshot)->>'dispatch','true',
 label||' equal-event equivalent state allows durable begin') from equal_event_cases where expected_error is null;
select throws_matching(format('select paddle_seat_quantity_context_v1(%L::uuid,%s)',u,target),
 '^'||expected_error||'$',label||' equal-event conflict blocks context')
from equal_event_cases where expected_error is not null;
select throws_matching(format('select preview_paddle_seat_quantity_v1(%L::uuid,%s,%L::jsonb)',u,target,snapshot),
 '^'||expected_error||'$',label||' equal-event conflict blocks preview')
from equal_event_cases where expected_error is not null;
select throws_matching(format('select begin_paddle_seat_quantity_v1(%L::uuid,%s,gen_random_uuid(),%L::jsonb)',u,target,snapshot),
 '^'||expected_error||'$',label||' equal-event conflict blocks begin')
from equal_event_cases where expected_error is not null;
select is((select count(*) from billing_operations_v2 o where o.subscription_id=pg_temp.period_subscription(c.u)
 and o.operation_kind='seat_quantity'),0::bigint,label||' blocked equal-event case creates zero operations')
from equal_event_cases c where expected_error is not null;
select is((select jsonb_agg(to_jsonb(o) order by o.event_id) from billing_paddle_event_observations o
 where o.observation->>'eventRef' in (c.a->>'eventRef',c.b->>'eventRef')),retained,
 label||' retains identical historical observation bytes') from equal_event_cases c;

-- Actual authenticated applied authority -> context JSON -> preview -> begin.
-- Values match transport golden cases; fractional spellings must survive SQL.
create temp table exact_freshness_cases(label text primary key,u uuid,authority text,snapshot jsonb,allowed boolean);
do $$declare c record;u uuid;a jsonb;sn jsonb;authority text;snapshot_revision text;
begin
 for c in select * from exact_revision_vectors where label in
  ('stale-99ns','exact-current','newer-1ns','rounding-boundary','fraction-spelling','offset-positive',
   'offset-negative','stale-sub-millisecond') loop
  u:=pg_temp.period_owner();
  authority:=replace(c.authority,'2026-09-29','2026-09-21');
  snapshot_revision:=replace(c.snapshot,'2026-09-29','2026-09-21');
  a:=pg_temp.lifecycle_observation(u,'exact-authority-'||c.label,'subscription.updated','active',
   '2026-09-21T10:00:01Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
   ||jsonb_build_object('updatedAt',authority);
  if pg_temp.lifecycle_dispatch(a)<>'applied' then raise exception 'EXACT_AUTHORITY_SETUP';end if;
  sn:=pg_temp.paddle_seat_snapshot(u,1)||jsonb_build_object('updatedAt',snapshot_revision);
  insert into exact_freshness_cases values(c.label,u,authority,sn,c.ordering>=0);
 end loop;
end$$;
select is(paddle_seat_quantity_context_v1(u,1)->>'resourceUpdatedAt',authority,
 label||' context preserves the exact retained authority string') from exact_freshness_cases;
select is(preview_paddle_seat_quantity_v1(u,1,snapshot)->>'eligible','true',
 label||' exact current/newer snapshot passes preview') from exact_freshness_cases where allowed;
select is(begin_paddle_seat_quantity_v1(u,1,gen_random_uuid(),snapshot)->>'dispatch','true',
 label||' exact current/newer snapshot passes begin') from exact_freshness_cases where allowed;
select throws_ok(format('select preview_paddle_seat_quantity_v1(%L::uuid,1,%L::jsonb)',u,snapshot),
 'P0001','BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT',label||' exact stale snapshot denied by preview')
from exact_freshness_cases where not allowed;
select throws_ok(format('select begin_paddle_seat_quantity_v1(%L::uuid,1,gen_random_uuid(),%L::jsonb)',u,snapshot),
 'P0001','BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT',label||' exact stale snapshot denied by begin')
from exact_freshness_cases where not allowed;
select is((select count(*) from billing_operations_v2 o where o.subscription_id=pg_temp.period_subscription(c.u)
 and o.operation_kind='seat_quantity'),0::bigint,label||' exact stale case creates zero durable operations')
from exact_freshness_cases c where not allowed;
-- The aggregation selects exact instants, never lexical RFC3339 order.
create temp table exact_max_case as select pg_temp.period_owner() u;
do $$declare u uuid;a jsonb;b jsonb;begin
 select c.u into u from exact_max_case c;
 a:=pg_temp.lifecycle_observation(u,'maximum-a','subscription.updated','active',
  '2026-09-21T10:00:01Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
  ||jsonb_build_object('updatedAt','2026-09-21T10:00:00.123456789Z');
 b:=a||jsonb_build_object('eventRef','synthetic/maximum-b','notificationRef','synthetic/maximum-b',
  'occurredAt','2026-09-21T10:00:02Z','updatedAt','2026-09-21T05:00:00.123457789-05:00');
 if pg_temp.lifecycle_dispatch(a)<>'applied' or pg_temp.lifecycle_dispatch(b)<>'applied'
 then raise exception 'EXACT_MAXIMUM_SETUP';end if;
end$$;
select is(paddle_seat_quantity_context_v1(u,1)->>'resourceUpdatedAt',
 '2026-09-21T05:00:00.123457789-05:00','maximum authority is exact and independent of raw lexical order')
from exact_max_case;

-- Nanosecond ordering also governs supersession of unapplied audit history.
create temp table exact_audit_cases(label text,u uuid,retained jsonb);
do $$declare label text;u uuid;a jsonb;audit jsonb;begin
 foreach label in array array['older-99ns','newer-1ns'] loop
  u:=pg_temp.period_owner();
  a:=pg_temp.lifecycle_observation(u,'audit-authority-'||label,'subscription.updated','active',
   '2026-09-21T10:00:01Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
   ||jsonb_build_object('updatedAt','2026-09-21T10:00:00.123456799Z');
  if pg_temp.lifecycle_dispatch(a)<>'applied' then raise exception 'EXACT_AUDIT_SETUP';end if;
  audit:=a||jsonb_build_object('eventRef','synthetic/exact-audit/'||label,
   'notificationRef','synthetic/exact-audit/'||label,'occurredAt','2026-09-21T10:00:00.9Z',
   'updatedAt',case label when 'older-99ns' then '2026-09-21T10:00:00.123456700Z'
    else '2026-09-21T10:00:00.123456800Z' end);
  perform pg_temp.webhook_ingest(audit);
  insert into exact_audit_cases values(label,u,(select to_jsonb(o) from billing_paddle_event_observations o
   where o.observation->>'eventRef'=audit->>'eventRef'));
 end loop;
end$$;
select is(paddle_seat_quantity_context_v1(u,1)->>'resourceUpdatedAt','2026-09-21T10:00:00.123456799Z',
 '99 ns older audit row is superseded without lowering exact applied authority')
from exact_audit_cases where label='older-99ns';
select throws_ok(format('select paddle_seat_quantity_context_v1(%L::uuid,1)',u),'P0001',
 'BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED','1 ns newer unapplied resource remains unresolved')
from exact_audit_cases where label='newer-1ns';
select is((select to_jsonb(o) from billing_paddle_event_observations o
 where o.observation->>'eventRef'=c.retained#>>'{observation,eventRef}'),retained,
 label||' exact audit observation remains physically unchanged') from exact_audit_cases c;

-- CODEX-72: applied authority is not exempt from semantic contradictions.
-- The status reproduction and TOCTOU use the real lifecycle dispatcher.
-- Other historical proof-pair fixtures call the production evidence writer
-- before advancing the shadow. Its facts/provenance/INSERT guards all run.
-- This models two accepted proofs without disabling any trigger or inventing
-- a proof JSON shape; the authority helper's actual applied predicate is tested.
create temp table applied_event_cases(
 label text primary key,u uuid,target integer,snapshot jsonb,a jsonb,b jsonb,
 expected_applied integer,allowed boolean,retained jsonb,before_ops bigint);
do $$declare label text;u uuid;a jsonb;b jsonb;newer jsonb;sn jsonb;target integer;
 aid uuid;bid uuid;expected_applied integer;allowed boolean;stamp timestamptz;begin
 foreach label in array array['status-dispatched','period','items','schedule','seat-marker','plan-marker',
  'applied-unapplied','unapplied-unapplied','resource-applied-applied','resource-applied-unapplied',
  'three-applied','equivalent','equivalent-items','legitimate-transition','toctou'] loop
  u:=pg_temp.period_owner();target:=1;expected_applied:=2;
  allowed:=label in ('equivalent','equivalent-items','legitimate-transition');
  sn:=pg_temp.paddle_seat_snapshot(u,target);
  a:=pg_temp.lifecycle_observation(u,'applied-a-'||label,'subscription.updated',
   case when label in ('status-dispatched','three-applied','toctou','legitimate-transition') then 'past_due'
    when label='items' then 'canceled' else 'active' end,
   '2026-09-21T10:00:10Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z')
   ||jsonb_build_object('updatedAt','2026-09-21T10:00:00Z');
  if label='items' then a:=a||jsonb_build_object('canceledAt','2026-09-21T10:00:00Z');end if;
  b:=a||jsonb_build_object('eventRef','synthetic/applied-b/'||label||'/'||u,
   'notificationRef','synthetic/applied-b/'||label||'/'||u,'updatedAt','2026-09-21T10:00:01Z');
  case label
   when 'period' then b:=jsonb_set(b,'{currentBillingPeriod,endsAt}','"2026-10-20T00:00:00.000000001Z"');
   when 'items' then b:=jsonb_set(b,'{items,0,status}','"active"');
   when 'schedule' then a:=jsonb_set(a,'{scheduledChange}','{"action":"cancel","effectiveAt":"2026-10-20T00:00:00Z"}');
   when 'seat-marker' then b:=b||jsonb_build_object('seatQuantityOperationId',gen_random_uuid());
   when 'plan-marker' then b:=b||jsonb_build_object('planChangeOperationId',gen_random_uuid());
   when 'equivalent' then
    b:=b||jsonb_build_object('occurredAt','2026-09-21T13:00:10.000000000+03:00',
     'updatedAt','2026-09-21T13:00:00.000000000+03:00',
     'currentBillingPeriod',jsonb_build_object('startsAt','2026-09-20T03:00:00+03:00','endsAt','2026-10-20T03:00:00+03:00'),
     'nextBilledAt','2026-10-20T03:00:00+03:00');
   when 'equivalent-items' then
    if pg_temp.paddle_seat_buy(u,1)<>'applied' then raise exception 'APPLIED_ITEM_SETUP';end if;
    target:=2;sn:=pg_temp.paddle_seat_snapshot(u,target);
    select o.observation into a from billing_subscriptions_v2 s join billing_evidence_v2 e on e.id=s.latest_evidence_id
     join billing_paddle_event_observations o on o.event_id=e.event_id where s.id=pg_temp.period_subscription(u);
    stamp:=(a->>'updatedAt')::timestamptz+interval '1 second';
    a:=a||jsonb_build_object('eventRef','synthetic/applied-items-a/'||u,'notificationRef','synthetic/applied-items-a/'||u,
     'updatedAt',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
     'occurredAt',to_char((stamp+interval '1 second') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
    b:=a||jsonb_build_object('eventRef','synthetic/applied-items-b/'||u,'notificationRef','synthetic/applied-items-b/'||u,
     'updatedAt',to_char((stamp+interval '3 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"000+03:00"'),
     'items',jsonb_build_array(a->'items'->1,a->'items'->0));
   else null;
  end case;
  if label in ('status-dispatched','three-applied','toctou','legitimate-transition') then
   b:=b||jsonb_build_object('status','active','nextBilledAt','2026-10-20T00:00:00Z');
   if label='legitimate-transition' then b:=b||jsonb_build_object('occurredAt','2026-09-21T10:00:11Z');end if;
   if pg_temp.lifecycle_dispatch(a)<>'applied' or pg_temp.lifecycle_dispatch(b)<>'applied'
    then raise exception 'APPLIED_DISPATCH_SETUP';end if;
   if label='three-applied' then
    newer:=b||jsonb_build_object('eventRef','synthetic/newer-applied/'||u,'notificationRef','synthetic/newer-applied/'||u,
     'occurredAt','2026-09-21T10:00:12Z','updatedAt','2026-09-21T10:00:02Z');
    if pg_temp.lifecycle_dispatch(newer)<>'applied' then raise exception 'THIRD_APPLIED_SETUP';end if;
   end if;
  else
   if label in ('applied-unapplied','unapplied-unapplied','resource-applied-applied','resource-applied-unapplied') then
    b:=b||jsonb_build_object('status','past_due','nextBilledAt',null);
    if label like 'resource-%' then b:=b||jsonb_build_object('updatedAt',a->'updatedAt','occurredAt','2026-09-21T10:00:11Z');end if;
   end if;
   aid:=pg_temp.lifecycle_ingest(a);bid:=pg_temp.lifecycle_ingest(b);
   if label<>'unapplied-unapplied' then perform billing_paddle_lifecycle_evidence_v1(aid,null,'subscription');end if;
   if label in ('applied-unapplied','resource-applied-unapplied') then expected_applied:=1;
   elsif label='unapplied-unapplied' then expected_applied:=0;
   else perform billing_paddle_lifecycle_evidence_v1(bid,null,'subscription');end if;
  end if;
  -- Keep the pre-ingress snapshot for TOCTOU; other cases use the captured
  -- identity/period with a current revision, without calling the guarded context.
  if label<>'toctou' then sn:=sn||jsonb_build_object('updatedAt',case when label='three-applied' then newer->'updatedAt' else b->'updatedAt' end);end if;
  insert into applied_event_cases values(label,u,target,sn,a,b,expected_applied,allowed,
   (select jsonb_agg(to_jsonb(o) order by o.event_id) from billing_paddle_event_observations o
    where o.observation->>'subscriptionRef'=a->>'subscriptionRef'),
   (select count(*) from billing_operations_v2 where subscription_id=pg_temp.period_subscription(u) and operation_kind='seat_quantity'));
 end loop;
end$$;
select is((select count(*)::integer from billing_evidence_v2 e join billing_paddle_event_observations o on o.event_id=e.event_id
 where e.proof_kind='subscription' and o.observation->>'eventRef' in (c.a->>'eventRef',c.b->>'eventRef')),
 expected_applied,label||' has the intended real applied-proof classification') from applied_event_cases c;
select ok(billing_paddle_seat_resource_state_v1(a)=billing_paddle_seat_resource_state_v1(b),
 label||' applied pair is semantically equivalent') from applied_event_cases where label like 'equivalent%';
select ok(billing_paddle_seat_resource_state_v1(a)<>billing_paddle_seat_resource_state_v1(b),
 label||' negative pair is semantically conflicting') from applied_event_cases where not allowed;
select throws_ok(format('select paddle_seat_quantity_context_v1(%L::uuid,%s)',u,target),
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',label||' applied-history conflict denies context')
 from applied_event_cases where not allowed;
select throws_ok(format('select preview_paddle_seat_quantity_v1(%L::uuid,%s,%L::jsonb)',u,target,snapshot),
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',label||' applied-history conflict denies preview')
 from applied_event_cases where not allowed;
select throws_ok(format('select begin_paddle_seat_quantity_v1(%L::uuid,%s,gen_random_uuid(),%L::jsonb)',u,target,snapshot),
 'P0001','BILLING_SEAT_QUANTITY_RESOURCE_UNRESOLVED',label||' applied-history conflict denies begin')
 from applied_event_cases where not allowed;
select is((select count(*) from billing_operations_v2 where subscription_id=pg_temp.period_subscription(c.u) and operation_kind='seat_quantity'),
 0::bigint,label||' conflict creates zero durable seat operations') from applied_event_cases c where not allowed;
select ok(paddle_seat_quantity_context_v1(u,target) ? 'resourceUpdatedAt',label||' permits context')
 from applied_event_cases where allowed;
select is(preview_paddle_seat_quantity_v1(u,target,snapshot)->>'eligible','true',label||' permits preview')
 from applied_event_cases where allowed;
select is(begin_paddle_seat_quantity_v1(u,target,gen_random_uuid(),snapshot)->>'dispatch','true',label||' permits begin')
 from applied_event_cases where allowed;
select is((select jsonb_agg(to_jsonb(o) order by o.event_id) from billing_paddle_event_observations o
 where o.observation->>'subscriptionRef'=c.a->>'subscriptionRef'),retained,label||' retains historical observation bytes')
 from applied_event_cases c;

select * from finish();
rollback;
