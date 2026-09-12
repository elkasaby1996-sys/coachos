begin;
select no_plan();

insert into public.billing_provider_variant_mappings(plan_version_id,cadence,environment,provider_store_id,provider_product_id,provider_variant_id,provider_price_id,currency_code,unit_amount_minor,renewal_interval_unit,renewal_interval_quantity,status,verified_at)
select p.id,c.cadence,'test','96001','96002',(96010+row_number() over(order by p.plan_key,c.cadence))::text,(96110+row_number() over(order by p.plan_key,c.cadence))::text,'USD',case c.cadence when 'annual' then p.annual_price_minor else p.monthly_price_minor end,case c.cadence when 'annual' then 'year' else 'month' end,1,'active',now()
from public.commercial_plan_versions p cross join (values('monthly'),('annual')) c(cadence) where p.plan_key in ('launch','growth','scale') and p.status='active';
create function pg_temp.coach(p_plan text,p_cadence text default 'monthly') returns uuid language plpgsql as $$
declare u uuid:=gen_random_uuid(); a uuid; s uuid; m public.billing_provider_variant_mappings%rowtype; sid text;
begin
  insert into auth.users(id,email) values(u,u::text||'@example.test');
  insert into public.pt_profiles(user_id,workspace_id,full_name) values(u,null,'Plan test');
  a:=public.ensure_commercial_billing_account(u,'manual');
  select v.* into strict m from public.billing_provider_variant_mappings v join public.commercial_plan_versions p on p.id=v.plan_version_id where p.plan_key=p_plan and v.cadence=p_cadence and v.status='active';
  insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at) values(a,m.plan_version_id,'paid','active','billing_provider',now()-interval '1 day',now()+interval '30 days') returning id into s;
  sid:=(96500+(select count(*) from public.billing_provider_subscriptions))::text;
  insert into public.billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id) values(a,'lemonsqueezy','test','96001',sid);
  insert into public.billing_provider_subscriptions(billing_account_id,account_subscription_id,variant_mapping_id,provider,environment,provider_store_id,provider_customer_id,provider_subscription_id,provider_order_id,provider_order_item_id,provider_product_id,provider_variant_id,provider_price_id,first_subscription_item_id,quantity,provider_status,provider_cancelled,provider_renews_at,provider_created_at,provider_updated_at,latest_snapshot_sha256,last_reconciled_at,reconciliation_status)
  values(a,s,m.id,'lemonsqueezy','test','96001',sid,sid,sid,sid,m.provider_product_id,m.provider_variant_id,m.provider_price_id,sid,1,'active',false,now()+interval '30 days',now()-interval '1 day',now()-interval '1 second',repeat('0',64),now(),'processed');
  return u;
end $$;
create function pg_temp.snapshot(p_owner uuid,p_plan text default null,p_cadence text default 'monthly',p_status text default 'active',p_stamp integer default 1) returns jsonb language plpgsql as $$
declare b public.billing_provider_subscriptions%rowtype; m public.billing_provider_variant_mappings%rowtype;
begin
  select v.* into strict b from public.billing_provider_subscriptions v join public.billing_accounts a on a.id=v.billing_account_id where a.owner_user_id=p_owner;
  if p_plan is null then select * into m from public.billing_provider_variant_mappings where id=b.variant_mapping_id;
  else select v.* into m from public.billing_provider_variant_mappings v join public.commercial_plan_versions p on p.id=v.plan_version_id where p.plan_key=p_plan and v.cadence=p_cadence; end if;
  return jsonb_build_object('provider',b.provider,'environment',b.environment,'store_id',b.provider_store_id,'subscription_id',b.provider_subscription_id,'customer_id',b.provider_customer_id,'order_id',b.provider_order_id,'order_item_id',b.provider_order_item_id,'product_id',m.provider_product_id,'variant_id',m.provider_variant_id,'price_id',m.provider_price_id,'first_subscription_item_id',b.first_subscription_item_id,'quantity',1,'status',p_status,'cancelled',p_status='cancelled','renews_at',now()+interval '30 days','ends_at',case when p_status in ('cancelled','expired') then now()+interval '30 days' else null end,'trial_ends_at',null,'created_at',b.provider_created_at,'updated_at',now()+make_interval(secs=>p_stamp),'payment_processor','card');
end $$;
create function pg_temp.invoice(p_owner uuid,p_reason text default 'updated',p_status text default 'paid') returns jsonb language sql as $$
select jsonb_build_object('store_id',s->>'store_id','subscription_id',s->>'subscription_id','customer_id',s->>'customer_id','test_mode',true,'billing_reason',p_reason,'status',p_status,'created_at',now()+interval '1 second','updated_at',now()+interval '2 seconds') from (select pg_temp.snapshot(p_owner) s) t
$$;
create function pg_temp.plan(p_owner uuid) returns text language sql as $$ select public.resolve_account_entitlements(id)#>>'{subscription,planKey}' from public.billing_accounts where owner_user_id=p_owner $$;
create function pg_temp.op(p_owner uuid) returns text language sql as $$ select status from public.billing_plan_change_operations where created_by_user_id=p_owner order by (status not in ('completed','canceled','failed')) desc,provider_requested_at desc,id desc limit 1 $$;
create temp table actors(name text primary key,id uuid,operation uuid default gen_random_uuid());

-- Six exact graduated contracts, private and transaction-scoped.
insert into public.billing_quantity_price_contracts(variant_mapping_id,addon_version_id,status,pricing_scheme,base_quantity,normalized_price_contract,price_contract_sha256,verified_at)
select m.id,a.id,'active','graduated',1,j.contract,encode(extensions.digest(j.contract::text,'sha256'),'hex'),now()
from public.billing_provider_variant_mappings m cross join public.commercial_addon_versions a cross join lateral (
select jsonb_build_object('price_id',m.provider_price_id,'variant_id',m.provider_variant_id,'category','subscription','scheme','graduated','usage_aggregation',null,'setup_fee_enabled',false,'setup_fee',null,'package_size',1,'trial_interval_unit',null,'trial_interval_quantity',null,'renewal_interval_unit',m.renewal_interval_unit,'renewal_interval_quantity',1,
 'tiers',jsonb_build_array(jsonb_build_object('last_unit',1,'unit_price',m.unit_amount_minor,'fixed_fee',0,'unit_price_decimal',null),jsonb_build_object('last_unit','inf','unit_price',case m.cadence when 'monthly' then a.monthly_unit_amount_minor else a.annual_unit_amount_minor end,'fixed_fee',0,'unit_price_decimal',null))) contract
) j where a.status='active';
create function pg_temp.seat_snapshot(u uuid,q integer,stamp integer default 1,plan text default null,cadence text default 'monthly') returns jsonb language sql as $$
select s||jsonb_build_object('quantity',q,'verified_item',jsonb_build_object('item_id',s->>'first_subscription_item_id','subscription_id',s->>'subscription_id','price_id',s->>'price_id','quantity',q,'is_usage_based',false,'created_at',s->>'created_at','updated_at',s->>'updated_at')) from (select pg_temp.snapshot(u,plan,cadence,'active',stamp) s) x
$$;
create function pg_temp.seat_limit(u uuid,growth boolean default false) returns integer language sql as $$ select public.billing_seat_effective_limit(id,growth) from public.billing_accounts where owner_user_id=u $$;
create function pg_temp.seat_status(u uuid) returns text language sql as $$ select status from public.billing_seat_quantity_operations where created_by_user_id=u order by created_at desc,id desc limit 1 $$;
create function pg_temp.buy(u uuid,n integer) returns text language plpgsql as $$
begin
 perform public.begin_billing_seat_quantity(u,'test',n,gen_random_uuid(),pg_temp.seat_snapshot(u,1));
 return public.finish_billing_plan_change(u,'test',pg_temp.seat_snapshot(u,1+n),pg_temp.invoice(u));
end $$;
insert into actors(name,id) values('increase',pg_temp.coach('growth')),('failure',pg_temp.coach('growth')),('reduce',pg_temp.coach('growth')),('drift',pg_temp.coach('growth')),('plan',pg_temp.coach('growth')),('annual',pg_temp.coach('growth','annual')),('maximum',pg_temp.coach('scale')),('rollback',pg_temp.coach('launch')),('wrong-item',pg_temp.coach('growth')),('reserved',pg_temp.coach('growth'));
select is((select monthly_unit_amount_minor from public.commercial_addon_versions where status='active'),1200,'monthly add-on exact');
select is((select annual_unit_amount_minor from public.commercial_addon_versions where status='active'),12000,'annual add-on exact');
select is((select count(*)::integer from public.billing_quantity_price_contracts),6,'all six graduated contracts validated');
select throws_ok(format('insert into public.billing_quantity_price_contracts(variant_mapping_id,addon_version_id,status,pricing_scheme,base_quantity,normalized_price_contract,price_contract_sha256,verified_at) values(%L,%L,%L,%L,1,%L,%L,now())',c.variant_mapping_id,c.addon_version_id,'active','graduated',jsonb_set(c.normalized_price_contract,'{tiers,1,unit_price}','1')::text,c.price_contract_sha256),'P0001','BILLING_SEAT_QUANTITY_PRICE_CONTRACT_MISMATCH','wrong graduated add-on amount rejected for '||p.plan_key||' '||m.cadence)
from public.billing_quantity_price_contracts c join public.billing_provider_variant_mappings m on m.id=c.variant_mapping_id join public.commercial_plan_versions p on p.id=m.plan_version_id;
select throws_ok(format('insert into public.billing_quantity_price_contracts(variant_mapping_id,addon_version_id,status,pricing_scheme,base_quantity,normalized_price_contract,price_contract_sha256,verified_at) values(%L,%L,%L,%L,1,%L,%L,now())',c.variant_mapping_id,c.addon_version_id,'active','graduated',jsonb_set(c.normalized_price_contract,'{scheme}','"standard"')::text,c.price_contract_sha256),'P0001','BILLING_SEAT_QUANTITY_PRICE_CONTRACT_MISMATCH','fixed price cannot sell seats for '||p.plan_key||' '||m.cadence)
from public.billing_quantity_price_contracts c join public.billing_provider_variant_mappings m on m.id=c.variant_mapping_id join public.commercial_plan_versions p on p.id=m.plan_version_id;

select throws_ok($$update public.commercial_addon_versions set monthly_unit_amount_minor=1$$,'P0001','Billing seat catalogue is immutable.','active add-on immutable');
select throws_ok($$update public.billing_quantity_price_contracts set base_quantity=2$$,'P0001','Billing seat catalogue is immutable.','active contract immutable');
select throws_ok($$select public.billing_seat_quantity_context(gen_random_uuid(),'test')$$,'42501','BILLING_SEAT_QUANTITY_OWNER_REQUIRED','team/client denied');
select throws_ok($$select public.billing_seat_quantity_context(id,'live') from actors where name='increase'$$,'P0001','BILLING_SEAT_QUANTITY_NOT_ELIGIBLE','environment separated');
select is((select pg_temp.seat_limit(id) from actors where name='increase'),2,'paid starts with included seats');
select is((select public.preview_billing_seat_quantity(id,'test',0,pg_temp.seat_snapshot(id,1))->>'direction' from actors where name='increase'),'no-op','no-op preview');
select is((select public.begin_billing_seat_quantity(id,'test',0,operation,pg_temp.seat_snapshot(id,1))->>'dispatch' from actors where name='increase'),'false','no-op does not dispatch');
select is((select public.preview_billing_seat_quantity(id,'test',1,pg_temp.seat_snapshot(id,1))->>'targetTotalMinor' from actors where name='increase'),'7100','Growth plus one monthly list total');
select is((select public.preview_billing_seat_quantity(id,'test',3,pg_temp.seat_snapshot(id,1))->>'targetTotalMinor' from actors where name='annual'),'95000','annual total includes annual add-ons');
select is((select public.preview_billing_seat_quantity(id,'test',1,pg_temp.seat_snapshot(id,1)||'{"payment_processor":"paypal"}')->>'errorCode' from actors where name='increase'),'BILLING_SEAT_QUANTITY_PAYPAL_UNSUPPORTED','PayPal denied');
select throws_ok($$select public.begin_billing_seat_quantity(id,'test',4,operation,pg_temp.seat_snapshot(id,1)) from actors where name='increase'$$,'P0001','BILLING_SEAT_QUANTITY_TARGET_INVALID','Growth maximum enforced');
select lives_ok($$select public.begin_billing_seat_quantity(id,'test',1,operation,pg_temp.seat_snapshot(id,1)) from actors where name='increase'$$,'increase begins');
select is((select public.begin_billing_seat_quantity(id,'test',1,operation,pg_temp.seat_snapshot(id,1))->>'dispatch' from actors where name='increase'),'false','same intent no repeat dispatch');
select throws_ok($$select public.begin_billing_seat_quantity(id,'test',2,operation,pg_temp.seat_snapshot(id,1)) from actors where name='increase'$$,'P0001','BILLING_SEAT_QUANTITY_OPERATION_CONFLICT','changed intent conflicts');
select throws_ok($$select public.begin_billing_plan_change(id,'test','scale','monthly',gen_random_uuid(),pg_temp.seat_snapshot(id,1)) from actors where name='increase'$$,'P0001','BILLING_PLAN_CHANGE_OPERATION_CONFLICT','seat blocks plan operation');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2)) from actors where name='increase'),'processed','target snapshot reconciles');
select is((select pg_temp.seat_limit(id) from actors where name='increase'),2,'provider response cannot expand capacity');
select is((select pg_temp.seat_status(id) from actors where name='increase'),'awaiting_payment','increase awaits payment');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2),pg_temp.invoice(id,'renewal')) from actors where name='increase'),'processed','renewal invoice processed');
select is((select pg_temp.seat_limit(id) from actors where name='increase'),2,'renewal invoice cannot approve increase');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2),pg_temp.invoice(id)||jsonb_build_object('created_at',now()-interval '1 day')) from actors where name='increase'),'processed','old invoice ignored for capacity');
select is((select pg_temp.seat_limit(id) from actors where name='increase'),2,'old invoice grants no seat');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2),pg_temp.invoice(id)) from actors where name='increase'),'processed','updated paid invoice completes');
select is((select pg_temp.seat_limit(id) from actors where name='increase'),3,'verified payment expands capacity');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2),pg_temp.invoice(id)) from actors where name='increase'),'replayed','duplicate invoice idempotent');
select throws_ok($$update public.billing_seat_quantity_operations set status='provider_pending',completed_at=null where status='completed'$$,'P0001','BILLING_SEAT_QUANTITY_OPERATION_CONFLICT','terminal cannot reactivate');
select public.begin_billing_seat_quantity(id,'test',1,operation,pg_temp.seat_snapshot(id,1)) from actors where name='failure';
select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2)||'{"status":"past_due"}',pg_temp.invoice(id,'updated','pending')) from actors where name='failure';
select is((select pg_temp.seat_limit(id) from actors where name='failure'),2,'failed payment retains source');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2,2),pg_temp.invoice(id)) from actors where name='failure'),'processed','recovery reconciles');
select is((select pg_temp.seat_limit(id) from actors where name='failure'),3,'recovery completes once');
select is((select pg_temp.buy(id,3) from actors where name='reduce'),'processed','buy capacity for reduction');
select lives_ok($$select public.begin_billing_seat_quantity(id,'test',0,operation,pg_temp.seat_snapshot(id,4,2)) from actors where name='reduce'$$,'fitting reduction begins');
select is((select pg_temp.seat_limit(id) from actors where name='reduce'),5,'reduction keeps current entitlement');
select is((select pg_temp.seat_limit(id,true) from actors where name='reduce'),2,'reduction immediately lowers growth ceiling');
select is((select public.reserve_account_capacity(a.id,'coach_seats',2,'lower-ceiling','operation','operation:'||gen_random_uuid(),null,'pgtap',now()+interval '1 minute')->>'granted' from actors x join public.billing_accounts a on a.owner_user_id=x.id where x.name='reduce'),'false','lower ceiling denies reservation');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,1,3)) from actors where name='reduce'),'processed','reduction schedules');
select lives_ok($$select public.begin_cancel_billing_seat_quantity(x.id,'test',o.id) from actors x join public.billing_seat_quantity_operations o on o.created_by_user_id=x.id and o.status='scheduled' where x.name='reduce'$$,'cancel enters pending');
select public.fail_billing_seat_quantity(x.id,o.id,true) from actors x join public.billing_seat_quantity_operations o on o.created_by_user_id=x.id and o.status='cancel_pending' where x.name='reduce';
select is((select pg_temp.seat_limit(id,true) from actors where name='reduce'),2,'ambiguous cancel retains lower ceiling');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,4,4)) from actors where name='reduce'),'processed','verified source restoration');
select is((select pg_temp.seat_limit(id,true) from actors where name='reduce'),5,'verified cancellation restores ceiling');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,3)) from actors where name='drift'),'ignored','unapproved quantity enters review');
select is((select pg_temp.seat_limit(id) from actors where name='drift'),2,'drift never grants seats');
select is((select b.reconciliation_status from actors x join public.billing_accounts a on a.owner_user_id=x.id join public.billing_provider_subscriptions b on b.billing_account_id=a.id where x.name='drift'),'manual_review','drift persisted');
select is((select pg_temp.buy(id,3) from actors where name='plan'),'processed','buy plan carry seats');
select throws_ok($$select public.begin_billing_plan_change(id,'test','launch','monthly',operation,pg_temp.seat_snapshot(id,4,2)) from actors where name='plan'$$,'P0001','BILLING_PLAN_CHANGE_CAPACITY_BLOCKED','incompatible add-on downgrade blocked');
select lives_ok($$select public.begin_billing_plan_change(id,'test','scale','monthly',operation,pg_temp.seat_snapshot(id,4,2)) from actors where name='plan'$$,'compatible upgrade carries seats');
select throws_ok($$select public.begin_billing_seat_quantity(id,'test',2,gen_random_uuid(),pg_temp.seat_snapshot(id,4,2)) from actors where name='plan'$$,'P0001','BILLING_SEAT_QUANTITY_OPERATION_CONFLICT','plan blocks seats');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,4,3,'scale'),pg_temp.invoice(id)) from actors where name='plan'),'processed','target plan and quantity validated');
select is((select pg_temp.seat_limit(id) from actors where name='plan'),8,'Scale includes five and preserves three purchased');
select is((select pg_temp.buy(id,5) from actors where name='maximum'),'processed','final allowed Scale seat');
select is((select pg_temp.seat_limit(id) from actors where name='maximum'),10,'Scale maximum ten');
select throws_ok($$select public.begin_billing_seat_quantity(id,'test',6,operation,pg_temp.seat_snapshot(id,6,2)) from actors where name='maximum'$$,'P0001','BILLING_SEAT_QUANTITY_TARGET_INVALID','over-maximum denied');
select public.begin_billing_seat_quantity(id,'test',1,operation,pg_temp.seat_snapshot(id,1)) from actors where name='wrong-item';
select is((select public.finish_billing_plan_change(id,'test',jsonb_set(pg_temp.seat_snapshot(id,2),'{verified_item,item_id}','"999999"'),pg_temp.invoice(id)) from actors where name='wrong-item'),'ignored','wrong current item rejected');
select is((select pg_temp.seat_limit(id) from actors where name='wrong-item'),2,'wrong item grants no capacity');
select public.begin_billing_seat_quantity(id,'test',1,operation,pg_temp.seat_snapshot(id,1)) from actors where name='rollback';
create function pg_temp.reject_seat_completion() returns trigger language plpgsql as $$ begin if new.status='completed' then raise exception 'injected'; end if; return new; end $$;
create trigger seat_test_rollback before update on public.billing_seat_quantity_operations for each row execute function pg_temp.reject_seat_completion();
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2),pg_temp.invoice(id)) from actors where name='rollback'),'failed','injected failure rolls back');
select is((select pg_temp.seat_limit(id) from actors where name='rollback'),1,'approved increase rolled back atomically');
drop trigger seat_test_rollback on public.billing_seat_quantity_operations;
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2),pg_temp.invoice(id)) from actors where name='rollback'),'processed','same evidence recovers atomic rollback');
select is((select pg_temp.seat_limit(id) from actors where name='rollback'),2,'retry completes once');
select pg_temp.buy(id,3) from actors where name='reserved';
select public.reserve_account_capacity(a.id,'coach_seats',3,'reserved-blocker','operation','operation:'||gen_random_uuid(),null,'pgtap',now()+interval '1 minute') from actors x join public.billing_accounts a on a.owner_user_id=x.id where x.name='reserved';
select throws_ok($$select public.begin_billing_seat_quantity(id,'test',0,operation,pg_temp.seat_snapshot(id,4,2)) from actors where name='reserved'$$,'P0001','BILLING_SEAT_QUANTITY_CAPACITY_BLOCKED','reserved commitments block reduction');
select ok(not has_table_privilege('authenticated','public.billing_seat_quantity_operations','SELECT'),'runtime cannot read private operations');
select ok(not has_table_privilege('service_role','public.billing_seat_quantity_operations','UPDATE'),'service role cannot directly update operations');
select ok(not has_table_privilege('anon','public.commercial_addon_versions','SELECT'),'catalogue private');
select ok(not has_function_privilege('authenticated','public.begin_billing_seat_quantity(uuid,text,integer,uuid,jsonb)','EXECUTE'),'browser cannot call service transition');

-- Due-time resolution and persistence are tested without changing immutable operation dates.
insert into actors(name,id) values('due',pg_temp.coach('growth')),('pending-blocker',pg_temp.coach('growth')),('actual-blocker',pg_temp.coach('growth')),('reset',pg_temp.coach('growth'));
select pg_temp.buy(id,3) from actors where name in ('due','pending-blocker','actual-blocker','reset');
insert into public.billing_seat_quantity_operations(operation_id,billing_account_id,billing_provider_subscription_id,account_subscription_id,variant_mapping_id,quantity_price_contract_id,direction,effective_timing,source_additional_seats,target_additional_seats,source_quantity,target_quantity,source_effective_limit,target_effective_limit,status,proration_mode,preflight_snapshot,provider_requested_at,provider_applied_at,effective_at,created_by_user_id)
select x.operation,b.billing_account_id,b.id,b.account_subscription_id,b.variant_mapping_id,c.id,'reduction','period_end',3,0,4,1,5,2,'scheduled','disable_prorations','{}',now()-interval '1 day',now()-interval '1 hour',now()-interval '1 minute',x.id
from actors x join public.billing_accounts a on a.owner_user_id=x.id join public.billing_provider_subscriptions b on b.billing_account_id=a.id join public.billing_quantity_price_contracts c on c.variant_mapping_id=b.variant_mapping_id where x.name='due';
update public.billing_provider_subscriptions b set quantity=1 from actors x join public.billing_accounts a on a.owner_user_id=x.id where b.billing_account_id=a.id and x.name='due';
select is((select pg_temp.seat_limit(id) from actors where name='due'),2,'due reduction resolves target without punctual webhook');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,1,3)) from actors where name='due'),'processed','due reduction persists target');
select is((select b.approved_additional_coach_seats from actors x join public.billing_accounts a on a.owner_user_id=x.id join public.billing_provider_subscriptions b on b.billing_account_id=a.id where x.name='due'),0,'due target approved persisted');
insert into public.workspaces(id,name,owner_user_id) select gen_random_uuid(),'Seat fixture',id from actors where name in ('pending-blocker','actual-blocker');
insert into public.workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at)
select w.id,'seat-pending-'||n||'@example.test','coach','seat-pending-'||n,'pending',x.id,now()+interval '1 day' from public.workspaces w join actors x on x.id=w.owner_user_id cross join generate_series(1,2)n where x.name='pending-blocker';
select throws_ok($$select public.begin_billing_seat_quantity(id,'test',0,operation,pg_temp.seat_snapshot(id,4,2)) from actors where name='pending-blocker'$$,'P0001','BILLING_SEAT_QUANTITY_CAPACITY_BLOCKED','pending invitations block reduction');
insert into auth.users(id,email) select gen_random_uuid(),'seat-active-'||n||'@example.test' from generate_series(1,2)n;
insert into public.workspace_members(workspace_id,user_id,role,status) select w.id,u.id,'coach','active' from public.workspaces w join actors x on x.id=w.owner_user_id cross join auth.users u where x.name='actual-blocker' and u.email like 'seat-active-%';
select throws_ok($$select public.begin_billing_seat_quantity(id,'test',0,operation,pg_temp.seat_snapshot(id,4,2)) from actors where name='actual-blocker'$$,'P0001','BILLING_SEAT_QUANTITY_CAPACITY_BLOCKED','active identities block reduction');
select is((select count(*)::integer from public.workspace_member_invites where token_hash like 'seat-pending-%'),2,'blocked reduction preserves invitations');
select public.begin_billing_plan_change(id,'test','scale','monthly',operation,pg_temp.seat_snapshot(id,4,2)) from actors where name='reset';
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,1,3,'scale'),pg_temp.invoice(id)) from actors where name='reset'),'ignored','provider reset during plan change enters review');
select is((select pg_temp.seat_limit(id) from actors where name='reset'),5,'quantity reset preserves approved source plan capacity');
-- Retiring a contract cannot make a new operation eligible or rewrite its price.
update public.billing_quantity_price_contracts set status='retired',retired_at=now() where variant_mapping_id=(select b.variant_mapping_id from actors x join public.billing_accounts a on a.owner_user_id=x.id join public.billing_provider_subscriptions b on b.billing_account_id=a.id where x.name='increase');
select throws_ok($$update public.billing_quantity_price_contracts set status='active',retired_at=null where status='retired'$$,'P0001','Billing seat catalogue is immutable.','retired contract cannot reactivate');
select is((select public.preview_billing_seat_quantity(id,'test',2,pg_temp.seat_snapshot(id,2,2))->>'errorCode' from actors where name='increase'),'BILLING_SEAT_QUANTITY_MAPPING_UNAVAILABLE','retired contracts cannot sell seats');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.seat_snapshot(id,2,3)) from actors where name='increase'),'processed','historical retired contract reconciles');

select * from finish();
rollback;
