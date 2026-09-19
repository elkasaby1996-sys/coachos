begin;
select no_plan();
set local client_min_messages=warning;
\ir fixtures/billing_v2_legacy_seed.psql

-- All references below are synthetic opaque values. Helpers run only inside
-- this rolled-back test transaction, never as application RPCs.
create function pg_temp.put(t text, j jsonb) returns uuid language plpgsql as $$
declare cols text; result uuid;
begin
  select string_agg(quote_ident(key),',' order by key) into cols from jsonb_object_keys(j) key;
  execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) returning id',t,cols,cols,t) into result using j;
  set constraints all immediate;
  set constraints all deferred;
  return result;
end $$;
create function pg_temp.sha(j jsonb) returns text language sql immutable as $$
  select encode(extensions.digest(j::text,'sha256'),'hex')
$$;
create function pg_temp.reject(t text,j jsonb,code text,label text) returns text language sql as $$
  select throws_ok(format('select pg_temp.put(%L,%L::jsonb)',t,j),code,null,label)
$$;
create function pg_temp.run(q text) returns void language plpgsql as $$
begin execute q; set constraints all immediate; set constraints all deferred; end $$;

create temp table surfaces(name text primary key);
insert into surfaces values ('billing_runtime_policy'),('billing_price_mappings'),('billing_customers_v2'),
 ('billing_subscriptions_v2'),('billing_subscription_items_v2'),('billing_checkouts_v2'),('billing_operations_v2'),
 ('billing_operation_events_v2'),('billing_webhook_events_v2'),('billing_evidence_v2'),('billing_payment_applications_v2');
select has_table('public',name,name||' exists') from surfaces;
select ok(c.relrowsecurity,name||' has RLS') from surfaces join pg_class c on c.oid=('public.'||name)::regclass;
select has_pk('public',name,name||' has PK') from surfaces;
select ok(not exists(select 1 from pg_policy where polrelid=('public.'||name)::regclass),name||' has no client policy') from surfaces;
select ok(not has_table_privilege(r,('public.'||name),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),r||' has no table access: '||name)
from surfaces cross join unnest(array['anon','authenticated','service_role']) r;
select ok(not exists(select 1 from aclexplode(c.relacl) a where a.grantee=0),'PUBLIC has no grant: '||name)
from surfaces join pg_class c on c.oid=('public.'||name)::regclass;
select ok(not p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public'] and not has_function_privilege(r,p.oid,'EXECUTE'),r||' cannot execute '||p.proname)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join unnest(array['anon','authenticated','service_role']) r
where n.nspname='public' and p.proname like 'billing_v2_%';
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'billing_v2_%' and p.prorettype<>'trigger'::regtype),0::bigint,'no v2 callable writer API');
select ok(not has_table_privilege(r,'public.'||v,'SELECT,INSERT,UPDATE,DELETE'),r||' cannot access view '||v)
from unnest(array['billing_mapping_catalogue_v2','billing_subscription_catalogue_v2','billing_open_operations_v2']) v
cross join unnest(array['anon','authenticated','service_role']) r;
select ok(c.reloptions @> array['security_invoker=true'],'invoker view '||c.relname) from pg_class c where c.relname in ('billing_mapping_catalogue_v2','billing_subscription_catalogue_v2','billing_open_operations_v2');
select is((select count(*) from pg_constraint c join surfaces s on c.conrelid=('public.'||s.name)::regclass
 where c.contype='f' and c.confrelid='auth.users'::regclass and s.name not in ('billing_checkouts_v2','billing_operations_v2')),0::bigint,'only creator FKs reference auth.users');
select is((select count(*) from billing_runtime_policy where id=1 and entitlement_environment='test' and not paddle_sales_enabled and not paddle_reconciliation_enabled),1::bigint,'dormant singleton defaults');
select throws_ok($$insert into billing_runtime_policy(id,entitlement_environment) values(2,'test')$$,'23514',null,'second policy row rejected');
select throws_ok($$update billing_runtime_policy set entitlement_environment='staging'$$,'23514',null,'policy environment allowlist');
select throws_ok($$delete from billing_runtime_policy$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','policy cannot disappear');
select lives_ok($$select repeat('x',512)::billing_v2_ref$$,'512-byte opaque reference accepted');
select throws_ok($$select repeat('x',513)::billing_v2_ref$$,'23514',null,'513-byte reference rejected');
select throws_ok($$select repeat('é',257)::billing_v2_ref$$,'23514',null,'byte bound includes multibyte strings');
select throws_ok($$select '   '::billing_v2_ref$$,'23514',null,'whitespace-only reference rejected');
select throws_ok($$select ''::billing_v2_ref$$,'23514',null,'empty reference rejected');
select is(' AbC /:opaque? '::billing_v2_ref::text,' AbC /:opaque? ','opaque reference bytes retained');

-- Fixture owners have explicit pre-existing canonical subscriptions. New v2
-- writes must not alter their rows, effective entitlements, or capacity.
create temp table owners(u uuid,a uuid,s uuid);
do $$
declare u uuid; a uuid; s uuid;
begin
  for i in 1..3 loop
    u:=gen_random_uuid();
    insert into auth.users(id,email) values(u,u||'@example.test');
    insert into pt_profiles(user_id,workspace_id,full_name) values(u,null,'DB01 synthetic');
    a:=ensure_commercial_billing_account(u,'manual');
    insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at)
      select a,id,'paid','active','billing_provider',now()-interval '1 day',now()+interval '30 days' from commercial_plan_versions where plan_key='growth' and status='active' returning id into s;
    insert into owners values(u,a,s);
  end loop;
end $$;
create temp table canonical_before as
select a,to_jsonb(b) account,to_jsonb(cs) subscription,resolve_account_entitlements(a) entitlements,resolve_account_capacity(u,a) capacity
from owners o join billing_accounts b on b.id=o.a join account_subscriptions cs on cs.id=o.s;
create function pg_temp.legacy_state() returns jsonb language plpgsql as $$
declare n text; rows jsonb; result jsonb:='{}';
begin
  foreach n in array array['billing_accounts','account_subscriptions','account_subscription_events','account_feature_entitlement_overrides',
    'commercial_plan_versions','commercial_plan_feature_entitlements','commercial_features','commercial_trial_policy_versions',
    'account_capacity_reservations','account_capacity_events','commercial_addon_versions','billing_provider_variant_mappings','billing_quantity_price_contracts',
    'billing_provider_customers','billing_provider_subscriptions','billing_checkout_attempts','billing_provider_webhook_deliveries',
    'billing_plan_change_operations','billing_plan_change_events','billing_seat_quantity_operations','billing_seat_quantity_events'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',n) into rows;
    result:=result||jsonb_build_object(n,rows);
  end loop;
  return result;
end $$;
create temp table legacy_before as select pg_temp.legacy_state() value;

-- Immutable evidence and catalogue fixture builders.
create function pg_temp.evidence(env text,kind text,identity jsonb,body jsonb,sid uuid default null) returns uuid language plpgsql as $$
declare p jsonb; j jsonb;
begin
  p:=jsonb_build_object('schema','billing-foundation-v1','provider','paddle','environment',env,'kind',kind,'identity',identity,
    case when kind='catalogue' then 'catalogue' else 'observation' end,body);
  j:=jsonb_build_object('provider','paddle','environment',env,'source_kind',case when kind='catalogue' then 'catalogue_verification' else 'api_reconciliation' end,
    'proof_kind',kind,'proof_schema','billing-foundation-v1','validator_version','structure-only-v1','replay_algorithm',case when kind='catalogue' then 'catalogue-evidence-v1' else 'api-evidence-v1' end,
    'replay_key',pg_temp.sha(p),'normalized_sha256',pg_temp.sha(p),'proof',p,'verified_at',now(),'subscription_id',sid,
    'provider_transaction_ref',identity->>'transactionRef');
  return pg_temp.put('billing_evidence_v2',j);
end $$;
create function pg_temp.mapping(k text,cad text,env text,ref text,st text default 'active') returns uuid language plpgsql as $$
declare p commercial_plan_versions%rowtype; a commercial_addon_versions%rowtype; j jsonb; proof jsonb; eid uuid; amount bigint; kind text;
begin
  if k='coach-seat' then select * into strict a from commercial_addon_versions where status='active'; kind:='addon';
    amount:=case cad when 'monthly' then a.monthly_unit_amount_minor else a.annual_unit_amount_minor end;
  else select * into strict p from commercial_plan_versions where plan_key=k and status='active'; kind:='plan';
    amount:=case cad when 'monthly' then p.monthly_price_minor else p.annual_price_minor end;
  end if;
  proof:=jsonb_build_object('canonicalKey',k,'identityKind',kind,'planVersionId',p.id,'addonVersionId',a.id,'cadence',cad,
    'productRef',null,'priceRef',ref,'currency','USD','unitAmountMinor',amount,'recurrenceUnit',case cad when 'monthly' then 'month' else 'year' end,
    'recurrenceCount',1,'quantityModel','separate_recurring_item','trial',false);
  eid:=pg_temp.evidence(env,'catalogue',jsonb_build_object('priceRef',ref),proof);
  j:=jsonb_build_object('provider','paddle','environment',env,'identity_kind',kind,'canonical_key',k,'cadence',cad,'plan_version_id',p.id,'addon_version_id',a.id,
    'provider_price_ref',ref,'currency_code','USD','unit_amount_minor',amount,'recurrence_unit',proof->>'recurrenceUnit','recurrence_count',1,
    'status',st,'verified_at',now(),'verification_sha256',(select normalized_sha256 from billing_evidence_v2 where id=eid),'verification_evidence_id',eid);
  return pg_temp.put('billing_price_mappings',j);
end $$;
select lives_ok(format('select pg_temp.mapping(%L,%L,%L,%L)',k,c,e,' Synthetic/'||k||'/'||c||' '),'mapping '||k||'/'||c||'/'||e)
from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c cross join unnest(array['test','live']) e;
select is((select count(*) from billing_price_mappings),16::bigint,'eight canonical mappings in each environment');
select throws_ok($$select pg_temp.mapping('growth','monthly','test','second-price')$$,'23505',null,'only one active mapping per canonical identity');
select throws_ok($$select pg_temp.mapping('growth','monthly','test',' Synthetic/growth/monthly ')$$,'23505',null,'same scoped price cannot repeat');
select throws_ok($$update billing_price_mappings set provider_price_ref='other' where environment='test'$$,'P0001','BILLING_V2_MAPPING_IMMUTABLE','published identity immutable');
select throws_ok($$delete from billing_price_mappings$$,'P0001','BILLING_V2_HISTORY_IMMUTABLE','mapping history retained');
select pg_temp.mapping('launch','monthly','test','draft-only','draft');
select lives_ok($$update billing_price_mappings set provider_product_ref='opaque product' where status='draft'$$,'draft can be edited');
select throws_ok($$update billing_price_mappings set status='active' where status='draft'$$,'P0001','BILLING_V2_MAPPING_EVIDENCE_MISMATCH','publication requires matching evidence');
select lives_ok($$update billing_price_mappings set status='retired',retired_at=now() where canonical_key='launch' and cadence='monthly' and environment='test' and status='active'$$,'active mapping can retire');
select throws_ok($$update billing_price_mappings set status='active',retired_at=null where status='retired'$$,'P0001','BILLING_V2_MAPPING_IMMUTABLE','retirement cannot be undone');
select throws_ok($$select pg_temp.mapping('launch','monthly','test',' Synthetic/launch/monthly ')$$,'23505',null,'retired price cannot be reused');
select pg_temp.reject('billing_price_mappings',to_jsonb(m)-'id','23505','same price cannot bypass uniqueness with existing evidence')
from billing_price_mappings m where environment='test' and (status='retired' or (canonical_key='growth' and cadence='monthly'));

create temp table examples(t text primary key,j jsonb);
insert into examples select 'billing_price_mappings',to_jsonb(m)-'id'||jsonb_build_object('provider_price_ref','new-draft','status','draft','retired_at',null) from billing_price_mappings m where provider_price_ref='draft-only';
select pg_temp.reject(t,j||'{"provider":"lemonsqueezy"}','23514','wrong provider rejected') from examples;
select pg_temp.reject(t,j||'{"environment":"staging"}','23514','wrong environment rejected') from examples;
select pg_temp.reject(t,j||'{"unit_amount_minor":1}','P0001','canonical amount mismatch rejected') from examples;
select pg_temp.reject(t,j||'{"recurrence_unit":"year"}','23514','cadence/recurrence mismatch rejected') from examples;

create temp table subs(env text,owner_id uuid,a uuid,canonical_id uuid,c uuid,s uuid,e uuid);
do $$
declare o record; env text; cid uuid; sid uuid; eid uuid; ident jsonb;
begin
  for o in select * from owners order by a loop
    foreach env in array array['test','live'] loop
      cid:=pg_temp.put('billing_customers_v2',jsonb_build_object('billing_account_id',o.a,'provider','paddle','environment',env,'provider_customer_ref',' Customer /'||o.a));
      sid:=pg_temp.put('billing_subscriptions_v2',jsonb_build_object('billing_account_id',o.a,'customer_id',cid,'provider','paddle','environment',env,'provider_subscription_ref',' Subscription /'||o.a,'provider_status','future.unknown-status'));
      ident:=jsonb_build_object('customerRef',' Customer /'||o.a,'subscriptionRef',' Subscription /'||o.a);
      eid:=pg_temp.evidence(env,'subscription',ident,'{}',sid);
      insert into subs values(env,o.u,o.a,o.s,cid,sid,eid);
    end loop;
  end loop;
end $$;
insert into examples select 'billing_customers_v2',to_jsonb(c)-'id' from billing_customers_v2 c limit 1;
insert into examples select 'billing_subscriptions_v2',to_jsonb(s)-'id'||'{"provider_subscription_ref":"another subscription"}' from billing_subscriptions_v2 s limit 1;
select pg_temp.reject(t,j,'23505','duplicate scoped customer/account rejected') from examples where t='billing_customers_v2';
select throws_ok($$update billing_customers_v2 set billing_account_id=gen_random_uuid()$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','customer cannot be reassigned');
select pg_temp.reject(t,j||jsonb_build_object('environment',case j->>'environment' when 'test' then 'live' else 'test' end),'23503','customer/subscription environment scope') from examples where t='billing_subscriptions_v2';
select pg_temp.reject(t,j||jsonb_build_object('billing_account_id',(select a from owners where a<>(j->>'billing_account_id')::uuid limit 1)),'23503','customer/subscription account scope') from examples where t='billing_subscriptions_v2';
select pg_temp.reject(t,j||jsonb_build_object('account_subscription_id',(select s from owners where a=(j->>'billing_account_id')::uuid)),'23514','canonical linkage disabled') from examples where t='billing_subscriptions_v2';
select pg_temp.reject(t,j||'{"approved_additional_coach_seats":1}','23514','seat approval disabled') from examples where t='billing_subscriptions_v2';
select throws_ok($$select pg_temp.run('update billing_subscriptions_v2 set reconciliation_status=''processed''')$$,'P0001','BILLING_V2_RECONCILED_ITEMS_REQUIRED','processed requires base item and evidence');

-- Explicit base and seat roles; no item order assumptions.
select lives_ok(format('select pg_temp.put(''billing_subscription_items_v2'',%L)',jsonb_build_object('subscription_id',s.s,'billing_account_id',s.a,'provider','paddle','environment',s.env,
  'item_role','base_plan','mapping_id',m.id,'cadence','monthly','mapping_kind','plan','quantity',1,'evidence_id',s.e)),'base item '||s.env)
from subs s join billing_price_mappings m on m.environment=s.env and m.canonical_key='growth' and m.cadence='monthly';
insert into examples select 'billing_subscription_items_v2',to_jsonb(i)-'id' from billing_subscription_items_v2 i limit 1;
select pg_temp.reject(t,j||'{"quantity":2}','23514','base quantity must be one') from examples where t='billing_subscription_items_v2';
select pg_temp.reject(t,j,'23505','only one base role') from examples where t='billing_subscription_items_v2';
select pg_temp.reject(t,j||jsonb_build_object('item_role','coach_seat','mapping_kind','addon','quantity',1,'cadence','annual','mapping_id',
 (select id from billing_price_mappings where environment=j->>'environment' and canonical_key='coach-seat' and cadence='annual')),'P0001','seat cadence must match base') from examples where t='billing_subscription_items_v2';
select pg_temp.reject(t,j||jsonb_build_object('item_role','coach_seat','mapping_kind','addon','quantity',0,'mapping_id',
 (select id from billing_price_mappings where environment=j->>'environment' and canonical_key='coach-seat' and cadence='monthly')),'23514','zero seats requires no seat row') from examples where t='billing_subscription_items_v2';
select lives_ok($$update billing_subscriptions_v2 s set reconciliation_status='processed',latest_evidence_id=x.e,latest_snapshot_sha256=e.normalized_sha256,last_reconciled_at=now()
 from subs x join billing_evidence_v2 e on e.id=x.e where s.id=x.s; set constraints all immediate; set constraints all deferred$$,'complete structural observations can be stored without canonical effect');
select throws_ok($$select pg_temp.run('update billing_subscriptions_v2 set latest_snapshot_sha256=repeat(''0'',64)')$$,'P0001','BILLING_V2_SUBSCRIPTION_EVIDENCE_MISMATCH','snapshot hash bound to evidence');

-- Checkout/operation templates exercise ownership, cadence and terminal intent.
insert into examples select 'billing_checkouts_v2',jsonb_build_object('billing_account_id',s.a,'created_by_user_id',s.owner_id,'operation_id',gen_random_uuid(),
 'provider','paddle','environment',s.env,'plan_version_id',m.plan_version_id,'cadence','monthly','base_mapping_id',m.id,'status','creating',
 'expected_expires_at',now()+interval '30 minutes','creation_lease_expires_at',now()+interval '2 minutes')
from subs s join billing_price_mappings m on m.environment=s.env and m.canonical_key='growth' and m.cadence='monthly' where s.env='test' limit 1;
select pg_temp.reject(t,j||jsonb_build_object('created_by_user_id',(select u from owners where u<>(j->>'created_by_user_id')::uuid limit 1)),'P0001','checkout owner required') from examples where t='billing_checkouts_v2';
select pg_temp.reject(t,j||'{"cadence":"annual"}','23503','checkout mapping cadence bound') from examples where t='billing_checkouts_v2';
select pg_temp.reject(t,j||'{"environment":"live"}','23503','checkout mapping environment bound') from examples where t='billing_checkouts_v2';
select pg_temp.reject(t,j||'{"requested_additional_seats":1}','23514','checkout seats require mapping') from examples where t='billing_checkouts_v2';
select pg_temp.reject(t,j||jsonb_build_object('requested_additional_seats',1,'seat_mapping_kind','addon','seat_mapping_id',
 (select id from billing_price_mappings where environment='test' and canonical_key='coach-seat' and cadence='annual')),'23503','checkout seat cadence bound') from examples where t='billing_checkouts_v2';
select pg_temp.reject(t,j||'{"status":"ready"}','23514','ready requires external reference') from examples where t='billing_checkouts_v2';
select pg_temp.put(t,j) from examples where t='billing_checkouts_v2';
select pg_temp.reject(t,j||jsonb_build_object('operation_id',gen_random_uuid()),'23505','one open checkout per account') from examples where t='billing_checkouts_v2';
select lives_ok($$update billing_checkouts_v2 set status='failed',failed_at=now()$$,'checkout terminal transition');
select throws_ok($$update billing_checkouts_v2 set status='creating',failed_at=null$$,'P0001','BILLING_V2_TERMINAL_IMMUTABLE','checkout terminal immutable');
insert into examples select 'billing_operations_v2',jsonb_build_object('operation_id',gen_random_uuid(),'billing_account_id',s.a,'subscription_id',s.s,'provider','paddle','environment',s.env,
 'source_account_subscription_id',s.canonical_id,'operation_kind','plan_change','source_base_mapping_id',m.id,'target_base_mapping_id',t.id,
 'source_cadence','monthly','target_cadence','monthly','source_additional_seats',0,'target_additional_seats',0,'effective_timing','immediate','status','requested',
 'preflight_snapshot',jsonb_build_object('schemaVersion',1,'dimensions','[]'::jsonb,'hasAnyDataQualityIssue',false),'change_kind','tier_upgrade','created_by_user_id',s.owner_id)
from subs s join billing_price_mappings m on m.environment=s.env and m.canonical_key='growth' and m.cadence='monthly'
join billing_price_mappings t on t.environment=s.env and t.canonical_key='scale' and t.cadence='monthly' where s.env='test' limit 1;
select pg_temp.reject(t,j||'{"change_kind":null}','P0001','plan direction required') from examples where t='billing_operations_v2';
select pg_temp.reject(t,j||'{"preflight_snapshot":{}}','23514','missing preflight members rejected') from examples where t='billing_operations_v2';
select pg_temp.reject(t,j||'{"effective_timing":"period_end","effective_at":"2099-01-01"}','P0001','canonical direction/timing enforced') from examples where t='billing_operations_v2';
select pg_temp.put(t,j) from examples where t='billing_operations_v2';
select pg_temp.reject(t,j||jsonb_build_object('operation_id',gen_random_uuid()),'23505','one shared open operation') from examples where t='billing_operations_v2';
insert into billing_operation_events_v2(operation_id,event_type) select id,'requested' from billing_operations_v2;
select throws_ok($$insert into billing_operation_events_v2(operation_id,event_type) select id,'requested' from billing_operations_v2$$,'23505',null,'operation event idempotency');
select lives_ok($$update billing_operations_v2 set status='failed',failed_at=now()$$,'operation terminal transition');
select throws_ok($$update billing_operations_v2 set status='requested',failed_at=null$$,'P0001','BILLING_V2_TERMINAL_IMMUTABLE','operation terminal immutable');
select lives_ok(format('select pg_temp.put(%L,%L)',t,j||jsonb_build_object('operation_id',gen_random_uuid(),'operation_kind','seat_quantity','change_kind',null,
 'target_base_mapping_id',j->>'source_base_mapping_id','target_additional_seats',1,'target_seat_mapping_kind','addon',
 'target_seat_mapping_id',(select id from billing_price_mappings where canonical_key='coach-seat' and cadence='monthly' and environment='test'))),'seat operation uses shared ledger')
from examples where t='billing_operations_v2';
select pg_temp.reject(t,j||jsonb_build_object('operation_id',gen_random_uuid()),'23505','open seat operation blocks plan operation') from examples where t='billing_operations_v2';
select lives_ok($$update billing_operations_v2 set status='canceled',canceled_at=now() where status='requested'$$,'seat cancellation becomes terminal');

-- Logical inbox and transport attempts have distinct replay identities.
insert into billing_webhook_events_v2(provider,environment,provider_event_ref,provider_event_name,resource_type,resource_ref,occurred_at,first_payload_sha256)
select 'paddle',e,'same opaque event','future.event-name','unknown-resource','opaque/resource',now(),repeat('1',64) from unnest(array['test','live']) e;
insert into examples select 'billing_webhook_events_v2',to_jsonb(e)-'id' from billing_webhook_events_v2 e where environment='test';
select pg_temp.reject(t,j,'23505','same logical event deduplicated') from examples where t='billing_webhook_events_v2';
select is((select count(*) from billing_webhook_events_v2),2::bigint,'logical event isolated across environments');
select lives_ok($$update billing_webhook_events_v2 set processing_status='ignored',attempt_count=2,processed_at=now(),last_attempt_at=now(),last_error_code='unsupported'$$,'only processing fields mutable');
select throws_ok($$update billing_webhook_events_v2 set first_payload_sha256=repeat('2',64)$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','original payload digest immutable');
select throws_ok($$update billing_webhook_events_v2 set provider_event_name='subscription_payment_success'$$,'P0001','BILLING_V2_IDENTITY_IMMUTABLE','event name immutable and never translated');
do $$
declare e record; p jsonb; j jsonb;
begin
  for e in select * from billing_webhook_events_v2 loop
    p:=jsonb_build_object('schema','billing-foundation-v1','provider','paddle','environment',e.environment,'kind','event',
      'identity',jsonb_build_object('eventRef',e.provider_event_ref,'resourceRef',e.resource_ref),'observation','{}'::jsonb);
    j:=jsonb_build_object('provider','paddle','environment',e.environment,'source_kind','webhook','proof_kind','event','proof_schema','billing-foundation-v1',
      'validator_version','structure-only-v1','replay_algorithm','delivery-evidence-v1','replay_key',pg_temp.sha(jsonb_build_array(e.provider_event_ref,null,repeat('1',64))),
      'normalized_sha256',pg_temp.sha(p),'proof',p,'verified_at',now(),'event_id',e.id,'raw_payload_sha256',repeat('1',64));
    perform pg_temp.put('billing_evidence_v2',j);
    if e.environment='test' then insert into examples values('billing_evidence_v2',j); end if;
  end loop;
end $$;
select pg_temp.reject(t,j,'23505','identical delivery replay deduplicated') from examples where t='billing_evidence_v2';
select pg_temp.reject(t,j||'{"proof_schema":"paddle.v1"}','23514','foundation does not claim paddle.v1 proof') from examples where t='billing_evidence_v2';
select pg_temp.reject(t,j||jsonb_build_object('normalized_sha256',repeat('0',64)),'P0001','tampered evidence hash rejected') from examples where t='billing_evidence_v2';
select pg_temp.reject(t,j||jsonb_build_object('replay_key',repeat('0',64)),'P0001','delivery fingerprint checked') from examples where t='billing_evidence_v2';
select pg_temp.reject(t,j||jsonb_build_object('proof',(j->'proof')||'{"paid":true}','normalized_sha256',pg_temp.sha((j->'proof')||'{"paid":true}')),'23514','arbitrary top-level payment claims rejected') from examples where t='billing_evidence_v2';
select pg_temp.reject(t,j||jsonb_build_object('proof',(j->'proof')-'observation','normalized_sha256',pg_temp.sha((j->'proof')-'observation')),'23514','missing proof body cannot bypass CHECK') from examples where t='billing_evidence_v2';
select lives_ok(format('select pg_temp.put(%L,%L)',t,j||jsonb_build_object('provider_notification_ref','next notification','replay_key',pg_temp.sha(jsonb_build_array('same opaque event','next notification',repeat('1',64))))),'second transport notification retained separately') from examples where t='billing_evidence_v2';

-- Ledger tests establish uniqueness only. These synthetic structural rows do
-- not certify payment, perform reconciliation, or grant canonical capacity.
do $$
declare s record; co uuid; ev uuid;
begin
  for s in select * from subs where a=(select min(a::text)::uuid from subs) loop
    select pg_temp.put('billing_checkouts_v2',j||jsonb_build_object('billing_account_id',s.a,'created_by_user_id',s.owner_id,'operation_id',gen_random_uuid(),
      'environment',s.env,'base_mapping_id',(select id from billing_price_mappings where canonical_key='growth' and cadence='monthly' and environment=s.env),
      'status','completed','completed_subscription_id',s.s,'completed_at',now())) into co from examples where t='billing_checkouts_v2';
    ev:=pg_temp.evidence(s.env,'transaction',jsonb_build_object('customerRef',' Customer /'||s.a,'subscriptionRef',' Subscription /'||s.a,'transactionRef','same transaction'),'{}',s.s);
    perform pg_temp.put('billing_payment_applications_v2',jsonb_build_object('provider','paddle','environment',s.env,'provider_transaction_ref','same transaction',
      'billing_account_id',s.a,'subscription_id',s.s,'evidence_id',ev,'application_kind','initial','checkout_id',co));
  end loop;
end $$;
insert into examples select 'billing_payment_applications_v2',to_jsonb(p)-'id' from billing_payment_applications_v2 p where environment='test';
select is((select count(*) from billing_payment_applications_v2),2::bigint,'transaction identity isolated by environment');
select pg_temp.reject(t,j,'23505','same transaction cannot be applied twice') from examples where t='billing_payment_applications_v2';
select pg_temp.reject(p.t,p.j||jsonb_build_object('checkout_id',
 pg_temp.put(c.t,c.j||jsonb_build_object('billing_account_id',p.j->>'billing_account_id','created_by_user_id',
 (select owner_user_id from billing_accounts where id=(p.j->>'billing_account_id')::uuid),'operation_id',gen_random_uuid(),'status','failed','failed_at',now()))),
 '23505','same transaction cannot fund a different checkout') from examples p cross join examples c where p.t='billing_payment_applications_v2' and c.t='billing_checkouts_v2';
select pg_temp.reject(p.t,p.j||jsonb_build_object('provider_transaction_ref','other transaction','checkout_id',
 pg_temp.put(c.t,c.j||jsonb_build_object('billing_account_id',p.j->>'billing_account_id','created_by_user_id',
 (select owner_user_id from billing_accounts where id=(p.j->>'billing_account_id')::uuid),'operation_id',gen_random_uuid(),'status','failed','failed_at',now()))),
 '23503','transaction must match evidence') from examples p cross join examples c where p.t='billing_payment_applications_v2' and c.t='billing_checkouts_v2';

-- Every stored example must reject a foreign provider or unknown environment,
-- whether the earliest rejection is a structural trigger or scoped constraint.
select pg_temp.reject(t,j||'{"provider":"lemonsqueezy"}',null,t||' rejects legacy provider') from examples;
select pg_temp.reject(t,j||'{"environment":"staging"}',null,t||' rejects unknown environment') from examples;
select is((select count(*) from pg_constraint c join surfaces s on c.conrelid=('public.'||s.name)::regclass
 where c.contype='f' and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indpred is null and i.indisvalid
 and (i.indkey::smallint[])[0:array_length(c.conkey,1)-1]=c.conkey)),0::bigint,'all new FK lookups have supporting indexes');

select throws_ok(format('delete from public.%I',name),'P0001',null,'history delete denied: '||name) from surfaces where name<>'billing_runtime_policy';
select throws_ok(format('truncate public.%I cascade',name),'P0001',null,'history truncate denied: '||name) from surfaces;
select throws_ok(format('update public.%I set id=gen_random_uuid()',name),'P0001',null,'history identity update denied: '||name) from surfaces where name<>'billing_runtime_policy';

-- Actually execute denied statements as all application roles, not just ACL
-- introspection. The role changes are isolated to the helper's subtransaction.
create function pg_temp.denied(r text,q text) returns boolean language plpgsql as $$
begin
  execute format('set local role %I',r);
  execute q;
  reset role;
  return false;
exception when insufficient_privilege then reset role; return true;
end $$;
select ok(pg_temp.denied(r,format(q,name)),r||' actual denial '||q||' / '||name)
from surfaces cross join unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['select * from public.%I','insert into public.%I default values','update public.%I set id=id where false','delete from public.%I where false','truncate public.%I']) q;

select is((select to_jsonb(b) from billing_accounts b where b.id=c.a),c.account,'canonical account unchanged') from canonical_before c;
select is((select to_jsonb(s) from account_subscriptions s where s.id=(c.subscription->>'id')::uuid),c.subscription,'canonical subscription unchanged') from canonical_before c;
select is(resolve_account_entitlements(c.a),c.entitlements,'entitlements unchanged by all v2 writes') from canonical_before c;
select is(resolve_account_capacity(o.u,c.a),c.capacity,'capacity unchanged by all v2 writes') from canonical_before c join owners o on o.a=c.a;
select is((select count(*) from billing_subscriptions_v2 where account_subscription_id is not null or approved_additional_coach_seats<>0),0::bigint,'no v2 canonical authority');
select is((select count(*) from billing_runtime_policy where paddle_sales_enabled or paddle_reconciliation_enabled),0::bigint,'Paddle flags remain off');
select is(pg_temp.legacy_state(),(select value from legacy_before),'all legacy rows, IDs, proofs and replay fingerprints unchanged');
select ok((select count(*) from billing_provider_webhook_deliveries)>0,'legacy replay comparison is non-vacuous');
select is((select count(*) from billing_mapping_catalogue_v2 where storage_contract='lemonsqueezy.v1'),(select count(*) from billing_provider_variant_mappings),'all legacy mappings projected');
select is((select count(*) from billing_mapping_catalogue_v2 where storage_contract='lemonsqueezy.quantity-contract.v1'),(select count(*) from billing_quantity_price_contracts),'legacy graduated seat contracts projected separately');
select is((select count(*) from billing_mapping_catalogue_v2 where storage_contract='lemonsqueezy.quantity-contract.v1' and provider_price_ref is not null),0::bigint,'no fake standalone legacy seat price');
select is((select count(*) from billing_mapping_catalogue_v2 where storage_contract='lemonsqueezy.v1' and status='retired'),1::bigint,'retired legacy mapping retained');
select is((select count(*) from billing_subscription_catalogue_v2 where storage_contract='lemonsqueezy.v1'),(select count(*) from billing_provider_subscriptions),'all legacy subscriptions projected');
select results_eq($$select id,provider,environment,plan_version_id,cadence,provider_price_ref,status from billing_mapping_catalogue_v2 where storage_contract='lemonsqueezy.v1' order by id$$,
 $$select id,provider,environment,plan_version_id,cadence,provider_price_id collate "C",status from billing_provider_variant_mappings order by id$$,'legacy mapping projection preserves identity and lifecycle exactly');
select results_eq($$select id,billing_account_id,provider,environment,provider_subscription_ref,account_subscription_id,approved_additional_coach_seats,reconciliation_status,provider_status from billing_subscription_catalogue_v2 where storage_contract='lemonsqueezy.v1' order by id$$,
 $$select id,billing_account_id,provider,environment,provider_subscription_id collate "C",account_subscription_id,approved_additional_coach_seats,reconciliation_status,provider_status from billing_provider_subscriptions order by id$$,'legacy subscription projection preserves identity and approved state exactly');
select is((select count(*) from billing_open_operations_v2 where storage_contract='lemonsqueezy.v1' and operation_kind='plan_change'),1::bigint,'open legacy plan operation projected');
select is((select count(*) from billing_open_operations_v2 where storage_contract='lemonsqueezy.v1' and operation_kind='seat_quantity'),1::bigint,'open legacy seat operation projected');
select is((select count(*) from billing_mapping_catalogue_v2 where storage_contract='billing.v2'),(select count(*) from billing_price_mappings),'all new mappings projected');
select is((select count(*) from billing_subscription_catalogue_v2 where storage_contract='billing.v2'),(select count(*) from billing_subscriptions_v2),'all new subscriptions projected');
select is((select count(*) from billing_open_operations_v2 where storage_contract='billing.v2'),0::bigint,'terminal operations excluded');

set constraints all immediate;
select * from finish();
rollback;
