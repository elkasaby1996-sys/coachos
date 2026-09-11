begin;
select no_plan();

insert into public.billing_provider_variant_mappings(plan_version_id,cadence,environment,provider_store_id,provider_product_id,provider_variant_id,provider_price_id,currency_code,unit_amount_minor,renewal_interval_unit,renewal_interval_quantity,status,verified_at)
select p.id,c.cadence,'test','97001','97002',(97010+row_number() over(order by p.plan_key,c.cadence))::text,(97110+row_number() over(order by p.plan_key,c.cadence))::text,'USD',case c.cadence when 'annual' then p.annual_price_minor else p.monthly_price_minor end,case c.cadence when 'annual' then 'year' else 'month' end,1,'active',now()
from public.commercial_plan_versions p cross join (values('monthly'),('annual')) c(cadence) where p.plan_key in ('launch','growth','scale') and p.status='active';
create function pg_temp.coach(p_plan text,p_cadence text default 'monthly') returns uuid language plpgsql as $$
declare u uuid:=gen_random_uuid(); a uuid; s uuid; m public.billing_provider_variant_mappings%rowtype; sid text;
begin
  insert into auth.users(id,email) values(u,u::text||'@example.test');
  insert into public.pt_profiles(user_id,workspace_id,full_name) values(u,null,'Plan test');
  a:=public.ensure_commercial_billing_account(u,'manual');
  select v.* into strict m from public.billing_provider_variant_mappings v join public.commercial_plan_versions p on p.id=v.plan_version_id where p.plan_key=p_plan and v.cadence=p_cadence and v.status='active';
  insert into public.account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at) values(a,m.plan_version_id,'paid','active','billing_provider',now()-interval '1 day',now()+interval '30 days') returning id into s;
  sid:=(98000+(select count(*) from public.billing_provider_subscriptions))::text;
  insert into public.billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id) values(a,'lemonsqueezy','test','97001',sid);
  insert into public.billing_provider_subscriptions(billing_account_id,account_subscription_id,variant_mapping_id,provider,environment,provider_store_id,provider_customer_id,provider_subscription_id,provider_order_id,provider_order_item_id,provider_product_id,provider_variant_id,provider_price_id,first_subscription_item_id,quantity,provider_status,provider_cancelled,provider_renews_at,provider_created_at,provider_updated_at,latest_snapshot_sha256,last_reconciled_at,reconciliation_status)
  values(a,s,m.id,'lemonsqueezy','test','97001',sid,sid,sid,sid,m.provider_product_id,m.provider_variant_id,m.provider_price_id,sid,1,'active',false,now()+interval '30 days',now()-interval '1 day',now()-interval '1 second',repeat('0',64),now(),'processed');
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
insert into actors(name,id) values('upgrade',pg_temp.coach('launch')),('cadence',pg_temp.coach('launch')),('downgrade',pg_temp.coach('scale')),('failure',pg_temp.coach('launch')),('blocked',pg_temp.coach('scale')),('paypal',pg_temp.coach('launch'));

select is(public.classify_billing_plan_change('launch','monthly','growth','monthly')->>'effectiveTiming','immediate','tier upgrade immediate');
select is(public.classify_billing_plan_change('launch','monthly','launch','annual')->>'changeKind','cadence_upgrade','annual cadence upgrade');
select is(public.classify_billing_plan_change('launch','monthly','scale','annual')->>'changeKind','combined_upgrade','combined upgrade');
select is(public.classify_billing_plan_change('scale','monthly','growth','annual')->>'effectiveTiming','period_end','lower rank wins');
select is(public.classify_billing_plan_change('scale','annual','scale','monthly')->>'changeKind','cadence_downgrade','annual to monthly scheduled');
select throws_ok($$select public.classify_billing_plan_change('launch','annual','growth','monthly')$$,'P0001','BILLING_PLAN_CHANGE_MIXED_DIRECTION_UNSUPPORTED','mixed direction rejected');
select throws_ok($$select public.classify_billing_plan_change('launch','monthly','launch','monthly')$$,'P0001','BILLING_PLAN_CHANGE_NOOP','no-op rejected');
select throws_ok($$select public.preview_billing_plan_change(id,'test','growth','monthly',pg_temp.snapshot(id)||'{"payment_processor":"paypal"}') from actors where name='paypal'$$,'P0001','BILLING_PLAN_CHANGE_PAYPAL_UNSUPPORTED','PayPal preview denied');
select is((select count(*)::integer from public.billing_plan_change_operations),0,'PayPal creates no operation');
select throws_ok($$select public.preview_billing_plan_change(id,'test','growth','monthly',pg_temp.snapshot(id)||'{"status":"past_due"}') from actors where name='paypal'$$,'P0001','BILLING_PLAN_CHANGE_NOT_ELIGIBLE','past due denied');
select throws_ok($$select public.preview_billing_plan_change(id,'test','growth','monthly',pg_temp.snapshot(id)||'{"status":"unpaid"}') from actors where name='paypal'$$,'P0001','BILLING_PLAN_CHANGE_NOT_ELIGIBLE','unpaid denied');
select throws_ok($$select public.preview_billing_plan_change(id,'test','growth','monthly',pg_temp.snapshot(id)||'{"status":"paused"}') from actors where name='paypal'$$,'P0001','BILLING_PLAN_CHANGE_NOT_ELIGIBLE','paused denied');
select throws_ok($$select public.preview_billing_plan_change(id,'test','growth','monthly',pg_temp.snapshot(id)||'{"cancelled":true}') from actors where name='paypal'$$,'P0001','BILLING_PLAN_CHANGE_NOT_ELIGIBLE','cancellation denied');
select throws_ok($$select public.billing_plan_change_context(gen_random_uuid(),'test')$$,'42501','BILLING_PLAN_CHANGE_OWNER_REQUIRED','nonowner denied');

select lives_ok($$select public.begin_billing_plan_change(id,'test','growth','monthly',operation,pg_temp.snapshot(id)) from actors where name='upgrade'$$,'begin upgrade');
select is((select public.begin_billing_plan_change(id,'test','growth','monthly',operation,pg_temp.snapshot(id))->>'dispatch' from actors where name='upgrade'),'false','same operation never redispatches');
select throws_ok($$select public.begin_billing_plan_change(id,'test','scale','monthly',operation,pg_temp.snapshot(id)) from actors where name='upgrade'$$,'P0001','BILLING_PLAN_CHANGE_OPERATION_CONFLICT','changed intent conflicts');
select throws_ok($$select public.begin_billing_plan_change(id,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(id)) from actors where name='upgrade'$$,'P0001','BILLING_PLAN_CHANGE_ALREADY_PENDING','one open operation');
select throws_ok($$update public.billing_plan_change_operations set target_cadence='annual'$$,'P0001','BILLING_PLAN_CHANGE_OPERATION_CONFLICT','operation intent immutable');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth')) from actors where name='upgrade'),'processed','approved provider target accepted');
select is((select pg_temp.plan(id) from actors where name='upgrade'),'launch','provider response alone cannot expand plan');
select is((select pg_temp.op(id) from actors where name='upgrade'),'awaiting_payment','awaiting payment persisted');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth'),pg_temp.invoice(id,'renewal')) from actors where name='upgrade'),'processed','wrong invoice reason processed without upgrade');
select is((select pg_temp.plan(id) from actors where name='upgrade'),'launch','renewal invoice cannot pay for upgrade');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth'),pg_temp.invoice(id)||jsonb_build_object('created_at',now()-interval '1 day')) from actors where name='upgrade'),'processed','old paid invoice does not complete new operation');
select is((select pg_temp.plan(id) from actors where name='upgrade'),'launch','invoice predating dispatch grants no upgrade');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth'),pg_temp.invoice(id)||'{"customer_id":"99999"}') from actors where name='upgrade'),'processed','foreign customer invoice cannot establish proof');
select is((select pg_temp.plan(id) from actors where name='upgrade'),'launch','foreign invoice preserves source');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth'),pg_temp.invoice(id)) from actors where name='upgrade'),'processed','updated paid invoice accepted');
select is((select pg_temp.plan(id) from actors where name='upgrade'),'growth','verified invoice activates Growth');
select is((select pg_temp.op(id) from actors where name='upgrade'),'completed','operation complete');
select is((select count(*)::integer from public.account_subscriptions where status='superseded'),1,'source superseded once');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth'),pg_temp.invoice(id)) from actors where name='upgrade'),'replayed','duplicate invoice idempotent');
select throws_ok($$update public.billing_plan_change_operations set status='provider_pending',completed_at=null where status='completed'$$,'P0001','BILLING_PLAN_CHANGE_OPERATION_CONFLICT','terminal operation cannot reactivate');

select lives_ok($$select public.begin_billing_plan_change(id,'test','launch','annual',operation,pg_temp.snapshot(id)) from actors where name='cadence'$$,'begin cadence upgrade');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'launch','annual'),pg_temp.invoice(id)) from actors where name='cadence'),'processed','cadence payment completes');
select is((select count(*)::integer from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id join actors x on x.id=a.owner_user_id where x.name='cadence'),1,'cadence does not duplicate local row');

select lives_ok($$select public.begin_billing_plan_change(id,'test','growth','monthly',operation,pg_temp.snapshot(id)) from actors where name='downgrade'$$,'fitting downgrade accepted');
select is((select public.resolve_account_capacity(x.id,a.id)#>>'{dimensions,0,limit}' from actors x join public.billing_accounts a on a.owner_user_id=x.id where name='downgrade'),'50','provider_pending target ceiling');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth')) from actors where name='downgrade'),'processed','downgrade scheduled');
select is((select pg_temp.plan(id) from actors where name='downgrade'),'scale','source plan remains before date');
select is((select pg_temp.op(id) from actors where name='downgrade'),'scheduled','scheduled operation');
select lives_ok($$select public.begin_cancel_billing_plan_change(id,'test',operation) from actors where name='downgrade'$$,'begin scheduled cancellation');
select public.fail_billing_plan_change(x.id,o.id,true) from actors x join public.billing_plan_change_operations o on o.created_by_user_id=x.id where x.name='downgrade';
select is((select public.resolve_account_capacity(x.id,a.id)#>>'{dimensions,0,limit}' from actors x join public.billing_accounts a on a.owner_user_id=x.id where name='downgrade'),'50','ambiguous cancellation retains ceiling');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'scale','monthly','active',2)) from actors where name='downgrade'),'processed','source restoration verified');
select is((select pg_temp.op(id) from actors where name='downgrade'),'canceled','canceled only after source confirmed');
select is((select public.resolve_account_capacity(x.id,a.id)#>>'{dimensions,0,limit}' from actors x join public.billing_accounts a on a.owner_user_id=x.id where name='downgrade'),'100','source ceiling restored');

select lives_ok($$select public.begin_billing_plan_change(id,'test','growth','monthly',operation,pg_temp.snapshot(id)) from actors where name='failure'$$,'begin failed upgrade');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth','monthly','past_due'),pg_temp.invoice(id,'updated','pending')) from actors where name='failure'),'processed','failed payment reconciles status');
select is((select pg_temp.plan(id) from actors where name='failure'),'launch','failed payment retains source');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth','monthly','active',2),pg_temp.invoice(id)) from actors where name='failure'),'processed','recovered paid invoice completes');
select is((select pg_temp.plan(id) from actors where name='failure'),'growth','recovery expands once');

-- All four blockers use the canonical reservation ledger, not UI counts.
insert into actors(name,id) values('quality',pg_temp.coach('scale')),('pending',pg_temp.coach('scale'));
insert into public.workspaces(id,name,owner_user_id) select gen_random_uuid(),'Preflight workspace',id from actors where name in ('quality','pending');
insert into public.invites(workspace_id,code,max_uses,uses,created_by_user_id,expires_at) select w.id,'PLANQUALITY',1,0,x.id,now()+interval '1 day' from public.workspaces w join actors x on x.id=w.owner_user_id where x.name='quality';
select throws_ok($$select public.begin_billing_plan_change(id,'test','launch','monthly',operation,pg_temp.snapshot(id)) from actors where name='quality'$$,'P0001','BILLING_PLAN_CHANGE_DATA_QUALITY_BLOCKED','unreconciled invitation data quality blocks apply');
insert into public.workspace_member_invites(workspace_id,email,role,token_hash,status,invited_by_user_id,expires_at) select w.id,'pending-plan-'||n||'@example.test','coach','plan-pending-'||n,'pending',x.id,now()+interval '1 day' from public.workspaces w join actors x on x.id=w.owner_user_id cross join generate_series(1,2)n where x.name='pending';
select is((select public.preview_billing_plan_change(id,'test','launch','monthly',pg_temp.snapshot(id))#>>'{blockers,0,committed}' from actors where name='pending'),'3','pending staff plus owner block target seats');
select public.reserve_account_capacity(a.id,d.dimension,d.quantity,d.dimension,'operation','operation:'||gen_random_uuid(),null,'pgtap',now()+interval '1 minute')
from actors x join public.billing_accounts a on a.owner_user_id=x.id cross join (values('counted_clients',51),('coach_seats',5),('active_workspaces',4),('published_packages',4)) d(dimension,quantity) where x.name='blocked';
select is((select jsonb_array_length(public.preview_billing_plan_change(id,'test','launch','monthly',pg_temp.snapshot(id))->'blockers') from actors where name='blocked'),4,'all dimensions include reserved commitments');
select throws_ok($$select public.begin_billing_plan_change(id,'test','launch','monthly',operation,pg_temp.snapshot(id)) from actors where name='blocked'$$,'P0001','BILLING_PLAN_CHANGE_CAPACITY_BLOCKED','blockers prevent durable provider operation');
select is((select count(*)::integer from public.billing_plan_change_operations o join actors x on x.id=o.created_by_user_id where x.name='blocked'),0,'blocked downgrade creates no operation');
select is((select pg_temp.plan(id) from actors where name='blocked'),'scale','blocked downgrade leaves plan intact');
select public.release_account_capacity_reservation(r.id,'pgtap') from public.account_capacity_reservations r join public.billing_accounts a on a.id=r.billing_account_id join actors x on x.id=a.owner_user_id where x.name='blocked';
select lives_ok($$select public.begin_billing_plan_change(id,'test','launch','monthly',operation,pg_temp.snapshot(id)) from actors where name='blocked'$$,'remediated downgrade can schedule');
select is((select public.billing_plan_change_capacity_limit(a.id,'published_packages',null) from public.billing_accounts a join actors x on x.id=a.owner_user_id where x.name='blocked'),3,'unlimited current becomes finite target ceiling');
select is((select public.billing_plan_change_capacity_limit(a.id,'counted_clients',5) from public.billing_accounts a join actors x on x.id=a.owner_user_id where x.name='blocked'),5,'finite lower current limit stays lower');
select is((select public.resolve_account_capacity(x.id,a.id)#>>'{dimensions,1,included}' from actors x join public.billing_accounts a on a.owner_user_id=x.id where name='blocked'),'2','included seats never exceed admission ceiling');
select is((select public.reserve_account_capacity(a.id,'counted_clients',11,'ceiling-denied','operation','operation:'||gen_random_uuid(),null,'pgtap',now()+interval '1 minute')->>'granted' from actors x join public.billing_accounts a on a.owner_user_id=x.id where name='blocked'),'false','target ceiling blocks positive admission');
select public.fail_billing_plan_change(x.id,o.id,false) from actors x join public.billing_plan_change_operations o on o.created_by_user_id=x.id where x.name='blocked';
select is((select public.billing_plan_change_capacity_limit(a.id,'published_packages',null) from public.billing_accounts a join actors x on x.id=a.owner_user_id where x.name='blocked'),null::integer,'definitive failure removes target ceiling');

-- Model an already scheduled period reaching its due date inside this fixed-time transaction.
insert into actors(name,id) values('shifted-date',pg_temp.coach('scale'));
select public.begin_billing_plan_change(id,'test','growth','annual',operation,pg_temp.snapshot(id)) from actors where name='shifted-date';
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth','annual')||jsonb_build_object('renews_at',now()+interval '5 days')) from actors where name='shifted-date'),'ignored','unexpected provider renewal shift enters review');
select is((select pg_temp.op(id) from actors where name='shifted-date'),'manual_review','period-end date drift is never silently scheduled');
select is((select public.resolve_account_capacity(x.id,a.id)#>>'{dimensions,0,limit}' from actors x join public.billing_accounts a on a.owner_user_id=x.id where name='shifted-date'),'50','date ambiguity retains target ceiling');
insert into actors(name,id) values('due',pg_temp.coach('scale')),('due-cancel',pg_temp.coach('scale')),('rollback',pg_temp.coach('launch')),('retired',pg_temp.coach('launch'));
insert into public.billing_plan_change_operations(billing_account_id,billing_provider_subscription_id,source_account_subscription_id,source_plan_version_id,source_variant_mapping_id,source_cadence,target_plan_version_id,target_variant_mapping_id,target_cadence,change_kind,effective_timing,proration_mode,operation_id,status,provider_payment_processor,preflight_snapshot,provider_requested_at,provider_applied_at,effective_at,created_by_user_id)
select b.billing_account_id,b.id,b.account_subscription_id,s.plan_version_id,b.variant_mapping_id,'monthly',m.plan_version_id,m.id,'monthly','tier_downgrade','period_end','disable_prorations',x.operation,'scheduled','card','{}',now()-interval '1 day',now()-interval '1 hour',now()-interval '1 minute',x.id
from actors x join public.billing_accounts a on a.owner_user_id=x.id join public.billing_provider_subscriptions b on b.billing_account_id=a.id join public.account_subscriptions s on s.id=b.account_subscription_id cross join public.billing_provider_variant_mappings m join public.commercial_plan_versions p on p.id=m.plan_version_id where x.name in ('due','due-cancel') and p.plan_key='growth' and m.cadence='monthly';
update public.billing_provider_subscriptions b set variant_mapping_id=m.id,provider_product_id=m.provider_product_id,provider_variant_id=m.provider_variant_id,provider_price_id=m.provider_price_id from public.billing_plan_change_operations o join public.billing_provider_variant_mappings m on m.id=o.target_variant_mapping_id join actors x on x.id=o.created_by_user_id where b.id=o.billing_provider_subscription_id and x.name in ('due','due-cancel');
select is((select pg_temp.plan(id) from actors where name='due'),'growth','due-time read resolves target without webhook');
update public.account_subscriptions s set status='past_due' from public.billing_accounts a join actors x on x.id=a.owner_user_id where s.billing_account_id=a.id and x.name='due';
select is((select public.resolve_account_entitlements(a.id)#>>'{subscription,effectiveStatus}' from actors x join public.billing_accounts a on a.owner_user_id=x.id where name='due'),'past_due','due target retains payment status');
update public.account_subscriptions s set cancel_at_period_end=true from public.billing_accounts a join actors x on x.id=a.owner_user_id where s.billing_account_id=a.id and x.name='due-cancel';
select is((select pg_temp.plan(id) from actors where name='due-cancel'),'scale','cancellation wins over scheduled plan renewal');
update public.account_subscriptions s set current_period_ends_at=now()-interval '1 minute' from public.billing_accounts a join actors x on x.id=a.owner_user_id where s.billing_account_id=a.id and x.name='due-cancel';
select is((select public.resolve_account_entitlements(a.id)#>>'{subscription,effectiveStatus}' from actors x join public.billing_accounts a on a.owner_user_id=x.id where name='due-cancel'),'expired','elapsed cancellation has no renewed access without webhook');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth','monthly','past_due',2)) from actors where name='due'),'processed','delayed reconciliation persists due target');
select is((select pg_temp.op(id) from actors where name='due'),'completed','due operation completed');

select public.begin_billing_plan_change(id,'test','growth','monthly',operation,pg_temp.snapshot(id)) from actors where name='rollback';
create function pg_temp.reject_supersession() returns trigger language plpgsql as $$ begin if new.event_type='subscription.plan_superseded' then raise exception 'injected'; end if; return new; end $$;
create trigger plan_test_rollback before insert on public.account_subscription_events for each row execute function pg_temp.reject_supersession();
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth'),pg_temp.invoice(id)) from actors where name='rollback'),'failed','conversion failure is retryable');
select is((select pg_temp.plan(id) from actors where name='rollback'),'launch','failed conversion rolls source back');
select is((select count(*)::integer from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id join actors x on x.id=a.owner_user_id where x.name='rollback'),1,'failed conversion leaves no target row');
drop trigger plan_test_rollback on public.account_subscription_events;
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth'),pg_temp.invoice(id)) from actors where name='rollback'),'processed','retry completes atomic conversion');

select public.begin_billing_plan_change(id,'test','growth','monthly',operation,pg_temp.snapshot(id)) from actors where name='retired';
update public.billing_provider_variant_mappings set status='retired',retired_at=now() where id in(select target_variant_mapping_id from public.billing_plan_change_operations where created_by_user_id=(select id from actors where name='retired'));
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth'),pg_temp.invoice(id)) from actors where name='retired'),'processed','historical approved target can retire before completion');
select throws_ok($$select public.preview_billing_plan_change(id,'test','growth','monthly',pg_temp.snapshot(id)) from actors where name='paypal'$$,'P0001','BILLING_PLAN_CHANGE_TARGET_MAPPING_UNAVAILABLE','new target cannot use retired mapping');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'scale','monthly','active',3)) from actors where name='retired'),'ignored','unapproved third mapping still rejected');
select is((select pg_temp.plan(id) from actors where name='retired'),'growth','unapproved third mapping preserves plan');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'growth','monthly','active',4)) from actors where name='retired'),'processed','verified exact historical mapping clears review');
select lives_ok($$select public.begin_billing_plan_change(id,'test','scale','monthly',gen_random_uuid(),pg_temp.snapshot(id,'growth','monthly','active',5)) from actors where name='retired'$$,'retired source mapping remains valid for new operation');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'scale','monthly','active',0)||'{"payment_processor":"unknown"}') from actors where name='retired'),'ignored','stale unsupported-processor snapshot ignored');
select is((select pg_temp.op(id) from actors where name='retired'),'provider_pending','stale snapshot leaves approved operation intact');
select is((select public.finish_billing_plan_change(id,'test',pg_temp.snapshot(id,'scale','monthly','active',6)||'{"payment_processor":"paypal"}',pg_temp.invoice(id)) from actors where name='retired'),'ignored','processor change cannot complete approved card operation');
select is((select pg_temp.plan(id) from actors where name='retired'),'growth','unsupported processor retains source plan');
select throws_ok($$update public.billing_plan_change_events set event_type='forged'$$,'P0001','Plan change history is append-only.','events append-only');

select set_config('request.jwt.claim.sub',(select id::text from actors where name='upgrade'),true);
set local role authenticated;
select lives_ok($$select public.get_my_billing_plan_change_state()$$,'owner safe state readable');
select throws_ok($$select * from public.billing_plan_change_operations$$,'42501',null,'owner cannot read operations directly');
select throws_ok($$select * from public.billing_plan_change_events$$,'42501',null,'events private');
select throws_ok($$select public.begin_billing_plan_change(auth.uid(),'test','scale','monthly',gen_random_uuid(),'{}')$$,'42501',null,'owner cannot forge provider snapshot');
reset role;
select * from finish();
rollback;
