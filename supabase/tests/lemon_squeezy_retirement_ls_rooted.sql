-- PAY-03B LS-rooted boundary: synthetic local rollback-only corruption probes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.ls_probe(mutation text) returns jsonb language plpgsql as $$
declare report jsonb;
begin
 begin
  execute mutation;
  report:=inspect_lemon_squeezy_retirement_disposition_v1(clock_timestamp());
  raise exception using errcode='ZX001',message='rollback LS-rooted probe';
 exception when sqlstate 'ZX001' then return report;
 end;
end $$;
create function pg_temp.ls_unknown(report jsonb) returns boolean language sql as $$
 select report->>'safeToRetire'='false' and (report#>>'{blockers,unknownStates}')::bigint>0
$$;
create function pg_temp.ls_corrupt(relation text,assignment text,condition text default 'true') returns void language plpgsql as $$
declare c record;
begin
 if relation not in ('billing_provider_customers','billing_provider_variant_mappings','billing_quantity_price_contracts',
 'billing_provider_subscriptions','billing_checkout_attempts','billing_plan_change_operations','billing_plan_change_events',
 'billing_seat_quantity_operations','billing_seat_quantity_events','billing_provider_webhook_deliveries',
 'billing_subscriptions_v2','billing_checkouts_v2','billing_operations_v2') then raise exception 'fixture relation denied'; end if;
 for c in select conname from pg_constraint where conrelid=('public.'||relation)::regclass and contype='c' loop
  execute format('alter table public.%I drop constraint %I',relation,c.conname);
 end loop;
 execute format('update public.%I set %s where %s',relation,assignment,condition);
end $$;
-- No physical LS table or servicing fixture exists in this population.
savepoint before_ls;
\ir fixtures/lemon_squeezy_retirement_history.psql
select is(pg_temp.retirement_report()->>'safeToRetire','true','LS-rooted terminal writer history passes');
-- CHRONOLOGY-CLOSE: exact audit/milestone pairs, preserving transaction clocks.
set constraints all immediate;set constraints all deferred;
select ok((select (to_jsonb(o)->>field)::timestamptz=o.requested_at
 and (to_jsonb(o)->>field)::timestamptz<o.provider_requested_at
 from billing_plan_change_operations o where status='completed') and pg_temp.retirement_report()->>'safeToRetire'='true',
 'plan same-transaction milestone legitimately precedes dispatch clock: '||field)
from unnest(array['provider_applied_at','payment_confirmed_at','completed_at']) field;
select ok((select (to_jsonb(o)->>field)::timestamptz=o.requested_at
 and (to_jsonb(o)->>field)::timestamptz<o.provider_requested_at
 from billing_seat_quantity_operations o where status='completed') and pg_temp.retirement_report()->>'safeToRetire'='true',
 'seat same-transaction milestone legitimately precedes dispatch clock: '||field)
from unnest(array['provider_applied_at','payment_confirmed_at','completed_at']) field;
select ok((select e.occurred_at=(to_jsonb(o)->>milestone)::timestamptz and e.occurred_at<o.provider_requested_at
 from billing_plan_change_events e join billing_plan_change_operations o on o.id=e.operation_id where e.event_type=event)
 and pg_temp.retirement_report()->>'safeToRetire'='true','plan audit preserves its writer transaction clock: '||event)
from (values ('billing.plan_change_requested','requested_at'),('billing.plan_change_awaiting_payment','provider_applied_at'),
 ('billing.plan_change_provider_applied','provider_applied_at'),('billing.plan_change_completed','completed_at')) cases(event,milestone);
select ok((select e.occurred_at=(to_jsonb(o)->>milestone)::timestamptz and e.occurred_at<o.provider_requested_at
 from billing_seat_quantity_events e join billing_seat_quantity_operations o on o.id=e.operation_id where e.event_type=event)
 and pg_temp.retirement_report()->>'safeToRetire'='true','seat audit preserves its writer transaction clock: '||event)
from (values ('billing.seat_provider_pending','requested_at'),('billing.seat_awaiting_payment','provider_applied_at'),
 ('billing.seat_completed','completed_at')) cases(event,milestone);
select ok(pg_temp.ls_unknown(pg_temp.ls_probe('set local session_replication_role=replica;'||mutation)),name)
from (values
 ('pre_request_billing_plan_change_operations_provider_applied_at','select pg_temp.ls_corrupt(''billing_plan_change_operations'',''provider_applied_at=provider_requested_at-interval ''''1 day'''''',''true'');'),
 ('pre_request_billing_plan_change_operations_payment_confirmed_at','select pg_temp.ls_corrupt(''billing_plan_change_operations'',''payment_confirmed_at=provider_requested_at-interval ''''1 day'''''',''true'');'),
 ('pre_request_billing_plan_change_operations_completed_at','select pg_temp.ls_corrupt(''billing_plan_change_operations'',''completed_at=provider_requested_at-interval ''''1 day'''''',''true'');'),
 ('pre_request_billing_seat_quantity_operations_provider_applied_at','select pg_temp.ls_corrupt(''billing_seat_quantity_operations'',''provider_applied_at=provider_requested_at-interval ''''1 day'''''',''true'');'),
 ('pre_request_billing_seat_quantity_operations_payment_confirmed_at','select pg_temp.ls_corrupt(''billing_seat_quantity_operations'',''payment_confirmed_at=provider_requested_at-interval ''''1 day'''''',''true'');'),
 ('pre_request_billing_seat_quantity_operations_completed_at','select pg_temp.ls_corrupt(''billing_seat_quantity_operations'',''completed_at=provider_requested_at-interval ''''1 day'''''',''true'');'),
 ('audit_before_request_billing.plan_change_requested','select pg_temp.ls_corrupt(''billing_plan_change_events'',''occurred_at=''''1900-01-01Z'''''',''event_type=''''billing.plan_change_requested'''''');'),
 ('audit_before_request_billing.plan_change_awaiting_payment','select pg_temp.ls_corrupt(''billing_plan_change_events'',''occurred_at=''''1900-01-01Z'''''',''event_type=''''billing.plan_change_awaiting_payment'''''');'),
 ('audit_before_request_billing.plan_change_provider_applied','select pg_temp.ls_corrupt(''billing_plan_change_events'',''occurred_at=''''1900-01-01Z'''''',''event_type=''''billing.plan_change_provider_applied'''''');'),
 ('audit_before_request_billing.plan_change_completed','select pg_temp.ls_corrupt(''billing_plan_change_events'',''occurred_at=''''1900-01-01Z'''''',''event_type=''''billing.plan_change_completed'''''');'),
 ('audit_before_request_billing.seat_provider_pending','select pg_temp.ls_corrupt(''billing_seat_quantity_events'',''occurred_at=''''1900-01-01Z'''''',''event_type=''''billing.seat_provider_pending'''''');'),
 ('audit_before_request_billing.seat_awaiting_payment','select pg_temp.ls_corrupt(''billing_seat_quantity_events'',''occurred_at=''''1900-01-01Z'''''',''event_type=''''billing.seat_awaiting_payment'''''');'),
 ('audit_before_request_billing.seat_completed','select pg_temp.ls_corrupt(''billing_seat_quantity_events'',''occurred_at=''''1900-01-01Z'''''',''event_type=''''billing.seat_completed'''''');')) cases(name,mutation);
select is(pg_temp.ls_probe($m$
 set local session_replication_role=replica;
 update billing_plan_change_operations set provider_applied_at=requested_at-interval '1 second',payment_confirmed_at=requested_at-interval '1 second',completed_at=requested_at-interval '1 second' where status='completed';
 update billing_plan_change_events e set occurred_at=o.completed_at from billing_plan_change_operations o where o.id=e.operation_id and e.event_type<>'billing.plan_change_requested';
$m$),pg_temp.retirement_report(),'plan application transaction may start before admission when every retained pair agrees');
select is(pg_temp.ls_probe($m$
 set local session_replication_role=replica;
 update billing_seat_quantity_operations set provider_applied_at=requested_at-interval '1 second',payment_confirmed_at=requested_at-interval '1 second',completed_at=requested_at-interval '1 second' where status='completed';
 update billing_seat_quantity_events e set occurred_at=o.completed_at from billing_seat_quantity_operations o where o.id=e.operation_id and e.event_type<>'billing.seat_provider_pending';
$m$),pg_temp.retirement_report(),'seat application transaction may start before admission when every retained pair agrees');

-- LS-ROOTED-R1: writer-generated controls and rollback-only false-safe probes.
savepoint native_writer_controls;
create temp table native_controls(name text primary key,u uuid);
insert into native_controls values
 ('combo',pg_temp.coach('growth')),('seat_cancel',pg_temp.coach('growth')),
 ('plan_cancel',pg_temp.coach('scale')),('seat_due',pg_temp.coach('growth')),
 ('plan_due',pg_temp.coach('scale')),('checkout_failed',pg_temp.coach('growth')),
 ('seat_cap',pg_temp.coach('growth'));
select pg_temp.buy(u,1) from native_controls where name='combo';
select begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.seat_snapshot(u,2)) from native_controls where name='combo';
select finish_billing_plan_change(u,'test',pg_temp.seat_snapshot(u,2,1,'scale'),pg_temp.invoice(u)) from native_controls where name='combo';
select pg_temp.retirement_close(u) from native_controls where name='combo';
select pg_temp.buy(u,1) from native_controls where name in ('seat_cancel','seat_due');
select begin_billing_seat_quantity(u,'test',0,gen_random_uuid(),pg_temp.seat_snapshot(u,2)) from native_controls where name in ('seat_cancel','seat_due');
select finish_billing_plan_change(u,'test',pg_temp.seat_snapshot(u,1),null) from native_controls where name in ('seat_cancel','seat_due');
select begin_billing_plan_change(u,'test','growth','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from native_controls where name in ('plan_cancel','plan_due');
select finish_billing_plan_change(u,'test',pg_temp.snapshot(u,'growth'),null) from native_controls where name in ('plan_cancel','plan_due');
select is(pg_temp.retirement_report()#>>'{blockers,unknownStates}','0','future scheduled plan/seat paths retain valid evidence');
select is(pg_temp.retirement_report()#>>'{blockers,planOperations}','2','future plan downgrades remain open');
select is(pg_temp.retirement_report()#>>'{blockers,seatOperations}','2','future seat reductions remain open');
select begin_cancel_billing_seat_quantity(u,'test',(select id from billing_seat_quantity_operations where created_by_user_id=u and status='scheduled')) from native_controls where name='seat_cancel';
select finish_billing_plan_change(u,'test',pg_temp.seat_snapshot(u,2),null) from native_controls where name='seat_cancel';
select begin_cancel_billing_plan_change(u,'test',(select operation_id from billing_plan_change_operations where created_by_user_id=u)) from native_controls where name='plan_cancel';
select finish_billing_plan_change(u,'test',pg_temp.snapshot(u,'scale'),null) from native_controls where name='plan_cancel';
-- Bridge the synthetic clock to a historical due date, then use the completion
-- writer unchanged. The probes below modify only the resulting retained evidence.
set constraints all immediate;set constraints all deferred;
set local session_replication_role=replica;
update billing_seat_quantity_operations set effective_at=now()-interval '1 second'
 where created_by_user_id=(select u from native_controls where name='seat_due') and direction='reduction';
update billing_plan_change_operations set effective_at=now()-interval '1 second'
 where created_by_user_id=(select u from native_controls where name='plan_due');
set local session_replication_role=origin;
select finish_billing_plan_change(u,'test',pg_temp.seat_snapshot(u,1),null) from native_controls where name='seat_due';
select finish_billing_plan_change(u,'test',pg_temp.snapshot(u,'growth'),null) from native_controls where name='plan_due';
select pg_temp.buy(u,3) from native_controls where name='seat_cap';
select pg_temp.retirement_close(u) from native_controls;
select set_config('request.jwt.claim.sub',u::text,true) from native_controls where name='checkout_failed';
select begin_my_billing_checkout_attempt('growth','monthly',gen_random_uuid(),'test');
select set_config('request.jwt.claim.sub','',true);
select fail_billing_checkout_attempt(id,'test',creation_lease_expires_at,false,'BILLING_CHECKOUT_CREATION_FAILED')
 from billing_checkout_attempts where created_by_user_id=(select u from native_controls where name='checkout_failed');
select is((select status from billing_checkout_attempts where created_by_user_id=(select u from native_controls where name='checkout_failed')),'failed','no-dispatch checkout uses installed failure writer');
select is((select count(*)::int from billing_seat_quantity_operations where status='completed' and direction='reduction'),1,'due seat reduction completes through installed writer');
select is((select count(*)::int from billing_plan_change_operations where status='completed' and effective_timing='period_end'),1,'due plan downgrade completes through installed writer');
select is((select count(*)::int from billing_seat_quantity_operations where status='canceled' and effective_at>clock_timestamp()),1,'legitimate canceled seat retains future effective date');
select is((select count(*)::int from billing_plan_change_operations where status='canceled' and effective_at>clock_timestamp()),1,'legitimate canceled plan retains future effective date');
select is(pg_temp.retirement_report()->>'safeToRetire','true','native cancellation, due completion, exact seat cap and no-dispatch failure controls are safe');
set constraints all immediate;set constraints all deferred;
select is(pg_temp.ls_probe($m$
 set local session_replication_role=replica;
 update billing_seat_quantity_operations s set operation_id=p.operation_id from billing_plan_change_operations p
 where s.billing_account_id=p.billing_account_id and s.created_by_user_id=(select u from native_controls where name='combo');
$m$)#>>'{blockers,canonicalConflicts}','1','completed native plan/seat operation-key collision blocks retirement');
select is(pg_temp.ls_probe($m$
 set local session_replication_role=replica;
 update billing_seat_quantity_operations set operation_id=(select operation_id from billing_plan_change_operations where created_by_user_id=(select u from native_controls where name='combo'))
 where created_by_user_id=(select u from native_controls where name='seat_cap');
$m$),pg_temp.retirement_report(),'same native key on different accounts remains valid');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format($m$
 set local session_replication_role=replica;
 delete from %I e using %I o where e.operation_id=o.id and o.status=%L and e.event_type=%L;
$m$,events,operations,state,witness))),'mandatory native transition survives terminal history: '||witness||' / '||state)
from (values
 ('billing_seat_quantity_events','billing_seat_quantity_operations','completed','billing.seat_provider_pending'),
 ('billing_seat_quantity_events','billing_seat_quantity_operations','completed','billing.seat_awaiting_payment'),
 ('billing_seat_quantity_events','billing_seat_quantity_operations','completed','billing.seat_scheduled'),
 ('billing_seat_quantity_events','billing_seat_quantity_operations','canceled','billing.seat_provider_pending'),
 ('billing_seat_quantity_events','billing_seat_quantity_operations','canceled','billing.seat_scheduled'),
 ('billing_seat_quantity_events','billing_seat_quantity_operations','canceled','billing.seat_cancel_pending'),
 ('billing_seat_quantity_events','billing_seat_quantity_operations','canceled','billing.seat_canceled'),
 ('billing_plan_change_events','billing_plan_change_operations','completed','billing.plan_change_awaiting_payment'),
 ('billing_plan_change_events','billing_plan_change_operations','completed','billing.plan_change_scheduled'),
 ('billing_plan_change_events','billing_plan_change_operations','canceled','billing.plan_change_scheduled'),
 ('billing_plan_change_events','billing_plan_change_operations','canceled','billing.plan_change_cancel_requested'),
 ('billing_plan_change_events','billing_plan_change_operations','canceled','billing.plan_change_canceled')
) cases(events,operations,state,witness);
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format($m$
 set local session_replication_role=replica;
 update %I set effective_at=clock_timestamp()+interval '30 days' where status='completed' and effective_timing='period_end';
$m$,relation))),'completed period-end operation requires due effective date: '||relation)
from unnest(array['billing_plan_change_operations','billing_seat_quantity_operations']) relation;
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format($m$
 set local session_replication_role=replica;
 update billing_seat_quantity_operations set cancel_requested_at=%s where status='canceled';
$m$,value))),'canceled seat requires finite request at inspection cutoff: '||value)
from unnest(array['null','''infinity''','clock_timestamp()+interval ''30 days''']) value;
select is(pg_temp.ls_probe($m$
 set local session_replication_role=replica;
 update billing_seat_quantity_operations set provider_snapshot_sha256=null,provider_updated_at=null where status='canceled';
$m$),pg_temp.retirement_report(),'historical seat cancellation does not require a newly retained provider snapshot/revision');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format($m$
 set local session_replication_role=replica;
 select pg_temp.ls_corrupt('billing_checkout_attempts',%L,'status=''failed''');
$m$,assignment))),'failed checkout retains coherent terminal/result evidence: '||assignment)
from unnest(array[
 'completed_provider_subscription_id=''99007766''',
 'completed_provider_subscription_id=(select provider_subscription_id from billing_provider_subscriptions limit 1)',
 'completed_at=clock_timestamp()', 'expired_at=clock_timestamp()', 'failed_at=null',
 'provider_checkout_url=''https://fixture.lemonsqueezy.com/checkout/fixture'''
]) assignment;
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format($m$
 set local session_replication_role=replica;
 update billing_provider_subscriptions set quantity=1+%s,approved_additional_coach_seats=%s
 where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from native_controls where name='seat_cap'));
 update billing_seat_quantity_operations set target_quantity=1+%s,target_additional_seats=%s
 where created_by_user_id=(select u from native_controls where name='seat_cap');
$m$,quantity,quantity,quantity,quantity))),'completed seat approval exceeds historical plan bound: '||quantity)
from unnest(array[4,99]) quantity;
select is(pg_temp.retirement_report()->>'safeToRetire','true','native regression probes roll back every mutation');
rollback to native_writer_controls;
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format('set local session_replication_role=replica;select pg_temp.ls_corrupt(%L,%L)',relation,assignment))),
 'unconditional physical root: '||relation||' / '||assignment) from (values
 ('billing_provider_customers','provider=''other'''),('billing_provider_customers','environment=''other'''),
 ('billing_provider_variant_mappings','provider=''other'''),('billing_provider_variant_mappings','environment=''other'''),('billing_provider_variant_mappings','status=''other'''),
 ('billing_quantity_price_contracts','status=''other'''),('billing_quantity_price_contracts','base_quantity=7'),
 ('billing_provider_subscriptions','provider=''other'''),('billing_provider_subscriptions','environment=''other'''),('billing_provider_subscriptions','provider_status=''other'''),
 ('billing_checkout_attempts','provider=''other'''),('billing_checkout_attempts','environment=''other'''),('billing_checkout_attempts','status=''other'''),
 ('billing_plan_change_operations','status=''other'''),('billing_plan_change_operations','source_cadence=''other'''),
 ('billing_plan_change_events','event_type=''other/''||id::text'),('billing_seat_quantity_operations','status=''other'''),
 ('billing_seat_quantity_operations','direction=''other'''),('billing_seat_quantity_events','event_type=''other/''||id::text'),
 ('billing_provider_webhook_deliveries','provider=''other'''),('billing_provider_webhook_deliveries','environment=''other'''),
 ('billing_provider_webhook_deliveries','processing_status=''other''')
) cases(relation,assignment);
select ok(pg_temp.ls_unknown(pg_temp.ls_probe('set local session_replication_role=replica;'||mutation)),
 'native safe-integer identifier domain: '||label) from (values
 ('customer','update billing_provider_customers set provider_customer_id=''9007199254740992'' where id=(select id from billing_provider_customers limit 1)'),
 ('mapping','update billing_provider_variant_mappings set provider_variant_id=''9007199254740992'' where id=(select id from billing_provider_variant_mappings limit 1)'),
 ('subscription','update billing_provider_subscriptions set provider_subscription_id=''9007199254740992'' where id=(select id from billing_provider_subscriptions limit 1)'),
 ('invoice','update billing_provider_webhook_deliveries set object_id=''9007199254740992'' where id=(select delivery from retirement_anchor)')
) cases(label,mutation);

-- V2R1-7: types, closed keys, historical mapping and both installed shapes.
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format($m$
 update billing_provider_webhook_deliveries set normalized_payload=jsonb_set(normalized_payload,array[%L],%L::jsonb)
 where id=(select delivery from retirement_anchor);
$m$,field,value))),'lifecycle rejects '||field||'='||value)
from unnest(array['product_id','variant_id','store_id','subscription_id','customer_id']) field
cross join unnest(array['[]','{}','null','7','true','""','"9007199254740992"']) value;
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format($m$
 update billing_provider_webhook_deliveries set normalized_payload=normalized_payload-%L where id=(select delivery from retirement_anchor);
$m$,field))),'lifecycle requires '||field) from unnest(array['store_id','test_mode','subscription_id','customer_id','created_at','updated_at','product_id','variant_id']) field;
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format($m$
 update billing_provider_webhook_deliveries set normalized_payload=jsonb_set(normalized_payload,array[%L],%L::jsonb)
 where id=(select delivery from retirement_anchor);
$m$,field,value))),'lifecycle rejects unlisted/wrong typed field '||field||'='||value)
from (values ('status','[]'),('price_id','"7"'),('billing_reason','"renewal"'),('test_mode','"true"'),
 ('billing_account_id','null'),('checkout_attempt_id','[]'),('plan_version_id','7'),('created_at','[]'),('updated_at','{}'),
 ('product_id','"999999"'),('variant_id','"999999"'),('plan_version_id','"11111111-1111-4111-8111-111111111111"')) cases(field,value);
select is(pg_temp.ls_probe(format($m$
 update billing_provider_webhook_deliveries set event_name=%L,delivery_fingerprint=encode(extensions.digest(environment||chr(10)||%L||chr(10)||payload_sha256,'sha256'),'hex')
 where id=(select delivery from retirement_anchor);
$m$,event,event))->>'safeToRetire','true','valid full lifecycle shape: '||event)
from unnest(array['subscription_plan_changed','subscription_created','subscription_updated','subscription_cancelled','subscription_resumed','subscription_expired','subscription_paused','subscription_unpaused']) event;
select is(pg_temp.ls_probe($m$
 update billing_provider_webhook_deliveries set event_name='subscription_updated',normalized_payload=normalized_payload-array['product_id','variant_id'],
 delivery_fingerprint=encode(extensions.digest(environment||chr(10)||'subscription_updated'||chr(10)||payload_sha256,'sha256'),'hex') where id=(select delivery from retirement_anchor);
$m$)->>'safeToRetire','true','reduced API-compatible subscription_updated is valid context');
select is(pg_temp.ls_probe($m$
 update billing_provider_webhook_deliveries d set normalized_payload=normalized_payload||jsonb_build_object(
 'billing_account_id',upper(b.billing_account_id::text),'plan_version_id',upper(m.plan_version_id::text),'checkout_attempt_id',upper(c.id::text))
 from billing_provider_subscriptions b join billing_provider_variant_mappings m on m.id=b.variant_mapping_id
 join billing_checkout_attempts c on c.billing_account_id=b.billing_account_id
 where d.id=(select delivery from retirement_anchor) and b.provider_subscription_id=d.provider_subscription_id;
$m$)->>'safeToRetire','true','typed uppercase UUID custom scope matches the actual historical account/plan/checkout');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe($m$
 update billing_provider_webhook_deliveries d set normalized_payload=jsonb_set(normalized_payload,'{plan_version_id}',
 to_jsonb((select id::text from commercial_plan_versions where plan_key='launch' and status='active')))
 where id=(select delivery from retirement_anchor);
$m$)),'another valid plan mapping is not the subscription historical custom scope');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe($m$
 update billing_provider_webhook_deliveries set normalized_payload=normalized_payload-array['product_id','variant_id'] where id=(select delivery from retirement_anchor);
$m$)),'reduced shape cannot impersonate subscription_expired');
select is(pg_temp.ls_probe($m$
 update billing_provider_webhook_deliveries set event_name='subscription_updated',normalized_payload=normalized_payload-array['product_id','variant_id'],
 delivery_fingerprint=encode(extensions.digest(environment||chr(10)||'subscription_updated'||chr(10)||payload_sha256,'sha256'),'hex') where id=(select delivery from retirement_anchor);
 set local session_replication_role=replica;
 update billing_provider_subscriptions set provider_status='active',provider_ends_at=null;
$m$)->>'safeToRetire','false','valid reduced context supplies no terminal authority');

-- V2R1-8: parent/source corruption cannot erase selected shared or native audits.
select ok(pg_temp.ls_unknown(pg_temp.ls_probe('set local session_replication_role=replica;'||mutation)),
 'audit relation remains inventoried: '||label) from (values
 ('plan orphan','update billing_plan_change_events set operation_id=gen_random_uuid()'),
 ('seat orphan','update billing_seat_quantity_events set operation_id=gen_random_uuid()'),
 ('null shared parent','update account_subscription_events set subscription_id=null where source=''billing_provider'''),
 ('lost shared parent and source','update account_subscription_events set subscription_id=null,source=''corrupt'' where source=''billing_provider'''),
 ('created plan metadata','update account_subscription_events set metadata=jsonb_set(metadata,''{planVersionId}'',to_jsonb(gen_random_uuid()::text)) where event_type=''subscription.created'' and source=''billing_provider'''),
 ('supersession operation','update account_subscription_events set metadata=''{}'' where event_type=''subscription.plan_superseded'''),
 ('required provider-applied audit','delete from billing_plan_change_events where event_type=''billing.plan_change_provider_applied'''),
 ('historical to_status','alter table account_subscription_events drop constraint account_subscription_events_to_status_check;update account_subscription_events set to_status=''nonsense'' where source=''billing_provider''')
) cases(label,mutation);
select is(pg_temp.retirement_report()->>'safeToRetire','true','historical event to_status can differ from current terminal status');

select ok(pg_temp.ls_unknown(pg_temp.ls_probe('set local session_replication_role=replica;'||mutation)),
 'native completed mutation needs its retained proof: '||label) from (values
 ('plan snapshot','update billing_plan_change_operations set provider_snapshot_sha256=null'),
 ('plan revision','update billing_plan_change_operations set provider_updated_at=null'),
 ('plan request','update billing_plan_change_operations set provider_requested_at=null'),
 ('seat snapshot','update billing_seat_quantity_operations set provider_snapshot_sha256=null'),
 ('seat revision','update billing_seat_quantity_operations set provider_updated_at=null')
) cases(label,mutation);

-- V2R1-9: no plan arithmetic exception or Paddle seat inference.
select ok(pg_temp.ls_unknown(pg_temp.ls_probe(format('set local session_replication_role=replica;update billing_provider_subscriptions set quantity=100,approved_additional_coach_seats=%s',approved))),
 'terminal quantity 100 contradicts approval '||approved) from unnest(array[0,1]) approved;
select ok(pg_temp.ls_unknown(pg_temp.ls_probe('set local session_replication_role=replica;delete from billing_seat_quantity_operations;delete from billing_seat_quantity_events;')),
 'surviving approved seats require native approval history');
select is(pg_temp.ls_probe($m$
 select pg_temp.coach('growth') u into temp table q_actor;
 select begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from q_actor;
 select finish_billing_plan_change(u,'test',pg_temp.seat_snapshot(u,2),pg_temp.invoice(u,'updated','pending')) from q_actor;
$m$)#>>'{blockers,unknownStates}','0','one genuine in-flight seat transition explains observed target quantity');
select is(pg_temp.ls_probe($m$
 select pg_temp.coach('growth') u into temp table q_actor;
 select begin_billing_seat_quantity(u,'test',1,gen_random_uuid(),pg_temp.seat_snapshot(u,1)) from q_actor;
 select finish_billing_plan_change(u,'test',pg_temp.seat_snapshot(u,2),pg_temp.invoice(u,'updated','pending')) from q_actor;
$m$)->>'safeToRetire','false','explained open seat transition still blocks retirement');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe($m$
 select pg_temp.coach('growth') u into temp table q_actor;
 select begin_billing_plan_change(u,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from q_actor;
 set local session_replication_role=replica;
 update billing_provider_subscriptions set quantity=100 where billing_account_id=(select id from billing_accounts where owner_user_id=(select u from q_actor));
$m$)),'open plan change cannot explain quantity arithmetic drift');
select is(pg_temp.ls_probe($m$
 select pg_temp.coach('launch') u into temp table null_start_actor;
 select begin_billing_plan_change(u,'test','growth','monthly',gen_random_uuid(),pg_temp.snapshot(u)) from null_start_actor;
 select finish_billing_plan_change(u,'test',pg_temp.snapshot(u,'growth','monthly','expired')||jsonb_build_object('ends_at',now()-interval '1 second'),pg_temp.invoice(u)) from null_start_actor;
$m$)->>'safeToRetire','true','installed expired successor writer permits null canonical period start');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe('set local session_replication_role=replica;update account_subscriptions set current_period_started_at=null where id=(select account_subscription_id from billing_provider_subscriptions where billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name=''terminal-checkout'')));')),
 'null period start without writer lineage does not close LS');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe('set local session_replication_role=replica;update billing_canonical_origins set storage_contract=''billing.v2'';')),
 'origin relabeling cannot hide independent native LS anchors');

-- Build real Paddle writer history; none of its financial graph closes LS.
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_cross_ledger_helpers.psql
\ir fixtures/paddle_webhook_fixture.psql
\ir fixtures/paddle_auto_reconciliation_fixture.psql
\ir fixtures/paddle_lifecycle_fixture.psql
\ir fixtures/paddle_plan_change_fixture.psql
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
select pg_temp.plan_owner() u into temp table ls_paddle_actor;
select pg_temp.plan_begin(u) from ls_paddle_actor;
select pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'upgrade')) from ls_paddle_actor;
select pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'paid','transaction.completed')) from ls_paddle_actor;
create temp table ls_financial_mutations(label text,mutation text);
insert into ls_financial_mutations values
 ('payment applications removed','delete from billing_payment_applications_v2'),
 ('payment identity corrupted','update billing_payment_applications_v2 set subscription_id=gen_random_uuid()'),
 ('financial evidence removed','delete from billing_evidence_v2'),
 ('financial evidence corrupted','update billing_evidence_v2 set normalized_sha256=repeat(''e'',64)'),
 ('operation audit orphan','update billing_operation_events_v2 set operation_id=gen_random_uuid()'),
 ('operation audit removed','delete from billing_operation_events_v2'),
 ('items removed','delete from billing_subscription_items_v2'),
 ('item mapping corrupted','update billing_subscription_items_v2 set mapping_id=gen_random_uuid()'),
 ('catalogue amount corrupted','update billing_catalogue_evidence_v1 set proof=jsonb_set(proof,''{catalogue,unitAmountMinor}'',''999999''),normalized_sha256=encode(extensions.digest(jsonb_set(proof,''{catalogue,unitAmountMinor}'',''999999'')::text,''sha256''),''hex'')'),
 ('catalogue proof removed','delete from billing_catalogue_evidence_v1');
select is(pg_temp.ls_probe('set local session_replication_role=replica;'||mutation),pg_temp.retirement_report(),
 'Paddle invariance / terminal LS other account / '||label) from ls_financial_mutations;

-- Same-account current Paddle ownership and native terminal LS can coexist.
savepoint different_account;
set local session_replication_role=replica;
update account_subscriptions set billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout'))
 where id in (select account_subscription_id from billing_canonical_origins where storage_contract='billing.v2');
update billing_canonical_origins set billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout')) where storage_contract='billing.v2';
update billing_subscriptions_v2 set billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout'));
update billing_operations_v2 set billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout'));
update billing_checkouts_v2 set billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout'));
update account_subscription_events set billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout'))
 where subscription_id in (select account_subscription_id from billing_canonical_origins where storage_contract='billing.v2');
select is(pg_temp.retirement_report()->>'safeToRetire','true','terminal native LS plus current Paddle on same account passes');
select is(pg_temp.ls_probe('set local session_replication_role=replica;'||mutation),pg_temp.retirement_report(),
 'Paddle invariance / terminal LS same account / '||label) from ls_financial_mutations;
select is(pg_temp.ls_probe('select pg_temp.ls_corrupt(''billing_operations_v2'',''status=''''provider_pending'''''');')->>'safeToRetire','true',
 'lone open Paddle operation beside closed LS is outside servicing authority');

select ok((pg_temp.ls_probe($m$
 update billing_subscriptions_v2 set account_subscription_id=(select account_subscription_id from billing_provider_subscriptions where billing_account_id=billing_subscriptions_v2.billing_account_id);
$m$)#>>'{blockers,canonicalConflicts}')::bigint>0,'same canonical claimed by both physical ledgers blocks');
select ok((pg_temp.ls_probe($m$
 drop index account_one_current_subscription;
 update account_subscriptions set status='active' where id=(select account_subscription_id from billing_provider_subscriptions where billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout')));
$m$)#>>'{blockers,canonicalConflicts}')::bigint>1,'simultaneous current LS and Paddle claims block without payment certification');
select ok((pg_temp.ls_probe($m$
 update billing_checkouts_v2 set operation_id=(select operation_id from billing_checkout_attempts limit 1);
$m$)#>>'{blockers,canonicalConflicts}')::bigint>0,'cross-ledger checkout operation-key reuse blocks even terminal rows');
select ok((pg_temp.ls_probe($m$
 select pg_temp.ls_corrupt('billing_checkout_attempts','status=''ready''');
 select pg_temp.ls_corrupt('billing_checkouts_v2','status=''ready''');
$m$)#>>'{blockers,canonicalConflicts}')::bigint>0,'simultaneous open checkout claims block');
select ok((pg_temp.ls_probe($m$
 update billing_operations_v2 set billing_account_id=(select billing_account_id from billing_plan_change_operations limit 1),
 operation_id=(select operation_id from billing_plan_change_operations limit 1);
$m$)#>>'{blockers,canonicalConflicts}')::bigint>0,'LS-plan/v2 operation-key collision remains visible across terminal history');
select ok((pg_temp.ls_probe($m$
 update billing_operations_v2 set billing_account_id=(select billing_account_id from billing_seat_quantity_operations limit 1),
 operation_id=(select operation_id from billing_seat_quantity_operations limit 1);
$m$)#>>'{blockers,canonicalConflicts}')::bigint>0,'LS-seat/v2 operation-key collision remains visible across terminal history');
select ok((pg_temp.ls_probe($m$
 select pg_temp.ls_corrupt('billing_plan_change_operations','status=''provider_pending'',completed_at=null');
 select pg_temp.ls_corrupt('billing_operations_v2','status=''provider_pending''');
 update billing_operations_v2 set billing_account_id=(select billing_account_id from billing_plan_change_operations limit 1);
$m$)#>>'{blockers,canonicalConflicts}')::bigint>0,'conflicting nonterminal operations use the existing account-level guard rule');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe($m$
 select pg_temp.ls_corrupt('billing_plan_change_operations','status=''provider_pending'',completed_at=null');
 select pg_temp.ls_corrupt('billing_operations_v2','status=''unknown''');
 update billing_operations_v2 set billing_account_id=(select billing_account_id from billing_plan_change_operations limit 1);
$m$)),'malformed relevant operation header cannot suppress conflict uncertainty');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe($m$
 select pg_temp.retirement_invoice(id,'subscription_payment_failed','993777','pending') from actors where name='terminal-checkout';
 update billing_provider_subscriptions set quantity=100 where billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout'));
$m$)),'Paddle evidence cannot hide terminal LS quantity corruption');
select is(pg_temp.ls_probe($m$
 select pg_temp.retirement_invoice(id,'subscription_payment_failed','993777','pending') from actors where name='terminal-checkout';
$m$)#>>'{blockers,paymentObligations}','1','same-account Paddle payments cannot discharge LS invoice debt');
select ok(pg_temp.ls_unknown(pg_temp.ls_probe($m$
 update account_subscriptions set status='superseded',superseded_at=now(),superseded_by_subscription_id=(select account_subscription_id from billing_subscriptions_v2 where shadow_status='current')
 where id=(select account_subscription_id from billing_provider_subscriptions where billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout')));
 update billing_provider_subscriptions set provider_status='active',provider_ends_at=null where billing_account_id=(select id from billing_accounts where owner_user_id=(select id from actors where name='terminal-checkout'));
$m$)),'cross-provider succession cannot supply missing native LS closure');
rollback to different_account;
select ok(pg_temp.ls_unknown(pg_temp.ls_probe('set local session_replication_role=replica;delete from billing_operations_v2;')),
 'historical v2 canonical needs its own physical operation-source witness');
select is(pg_temp.ls_probe($m$
 set local session_replication_role=replica;
 insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at,expired_at)
 select billing_account_id,plan_version_id,'paid','expired','manual',now()-interval '1 day',now()-interval '1 second',now()
 from account_subscriptions where id=(select account_subscription_id from billing_subscriptions_v2 where shadow_status='current');
 update account_subscriptions set superseded_by_subscription_id=(select id from account_subscriptions where source='manual' order by created_at desc limit 1)
 where id in(select source_account_subscription_id from billing_operations_v2);
$m$),pg_temp.retirement_report(),'pure-v2 successor corruption cannot import unrelated manual history into LS scope');
select ok((pg_temp.ls_probe($m$
 set local session_replication_role=replica;
 update account_subscriptions set superseded_by_subscription_id=(select account_subscription_id from billing_provider_subscriptions limit 1)
 where id in(select source_account_subscription_id from billing_operations_v2);
$m$)#>>'{blockers,canonicalConflicts}')::bigint>0,'incoming cross-origin successor reference to LS is independently inspected');
select is(pg_temp.ls_probe('set local session_replication_role=replica;update account_subscriptions set superseded_by_subscription_id=null where id in(select source_account_subscription_id from billing_operations_v2);')->>'safeToRetire','true',
 'pure-v2 successor path is not financial or LS closure authority');

-- Zero LS roots: independent Paddle corruption must give exactly the same report.
rollback to before_ls;
\ir fixtures/billing_catalogue_fixture.psql
\ir fixtures/billing_cross_ledger_helpers.psql
\ir fixtures/paddle_webhook_fixture.psql
\ir fixtures/paddle_auto_reconciliation_fixture.psql
\ir fixtures/paddle_lifecycle_fixture.psql
\ir fixtures/paddle_plan_change_fixture.psql
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
select pg_temp.plan_owner() u into temp table pure_paddle_actor;
select pg_temp.plan_begin(u) from pure_paddle_actor;
select pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'upgrade')) from pure_paddle_actor;
select pg_temp.lifecycle_dispatch(pg_temp.plan_observation(u,'paid','transaction.completed')) from pure_paddle_actor;
select is((select count(*)::integer from billing_provider_subscriptions),0,'invariance control has zero LS subscriptions');
select is(inspect_lemon_squeezy_retirement_disposition_v1(clock_timestamp())->>'safeToRetire','true','pure Paddle structural history passes');
select is(pg_temp.ls_probe('set local session_replication_role=replica;'||mutation),inspect_lemon_squeezy_retirement_disposition_v1(clock_timestamp()),
 'Paddle invariance / zero LS roots / '||label) from (values
 ('payment applications','delete from billing_payment_applications_v2'),
 ('financial evidence','delete from billing_evidence_v2'),
 ('orphan operation audit','update billing_operation_events_v2 set operation_id=gen_random_uuid()'),
 ('items','delete from billing_subscription_items_v2'),
 ('catalogue amounts','update billing_catalogue_evidence_v1 set proof=jsonb_set(proof,''{catalogue,unitAmountMinor}'',''999999''),normalized_sha256=encode(extensions.digest(jsonb_set(proof,''{catalogue,unitAmountMinor}'',''999999'')::text,''sha256''),''hex'')')
) cases(label,mutation);
select ok(pg_get_functiondef('inspect_lemon_squeezy_retirement_disposition_v1(timestamptz)'::regprocedure) !~
 'billing_(payment_applications_v2|evidence_v2|subscription_items_v2|catalogue_evidence_v1|operation_events_v2|guard_)',
 'inspector has no Paddle financial/audit graph or mutation guard dependency');
select * from finish();
rollback;
