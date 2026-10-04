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
\ir fixtures/paddle_existing_historical_owner.psql
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
create temp table retired_state_owners(label text,u uuid);
insert into retired_state_owners values('ls',pg_temp.coach('growth')),('paddle',pg_temp.plan_owner()),
 ('trial',pg_temp.guard_owner()),('free',pg_temp.guard_owner()),('complimentary',pg_temp.guard_owner()),('unknown',pg_temp.guard_owner()),('mixed',pg_temp.coach('growth'));
select start_account_trial_for_owner(u,'first_workspace') from retired_state_owners where label='trial';
insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source,current_period_started_at,current_period_ends_at)
select a.id,p.id,case r.label when 'unknown' then 'paid' else 'complimentary' end,'active','manual',now(),now()+interval '30 days'
from billing_accounts a join retired_state_owners r on r.u=a.owner_user_id cross join commercial_plan_versions p
where r.label in ('complimentary','unknown') and p.plan_key='scale' and p.status='active';
grant select on retired_state_owners to authenticated;
select ok((resolve_account_entitlements(a.id)->>'billingUnavailable')::boolean,'LS/unknown paid authority is unavailable: '||label)
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label in ('ls','unknown');
select is(resolve_account_entitlements(a.id)#>>'{subscription,accessMode}','read_only','unsupported paid authority fails closed: '||label)
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label in ('ls','unknown');
select is(billing_seat_effective_limit(a.id),0,'unsupported paid state has no executable seat allowance: '||label)
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label in ('ls','unknown');
select is(resolve_account_entitlements(a.id)->'enabledFeatureKeys','[]'::jsonb,'unsupported history cannot grant features: '||label)
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label in ('ls','unknown');
select set_config('request.jwt.claim.sub',u::text,true) from retired_state_owners where label='ls';
set local role authenticated;
select is(get_my_billing_plan_change_state(),'{"provider":null,"linked":false,"eligible":false,"cadence":null,"operation":null}'::jsonb,'shared definer plan reader cannot bypass retirement');
select is(get_my_billing_seat_quantity_state(),'{"available":false,"provider":null,"summary":null,"operation":null}'::jsonb,'shared definer seat reader cannot bypass retirement');
reset role;
select set_config('request.jwt.claim.sub',u::text,true) from retired_state_owners where label='free';
set local role authenticated;
select is(get_my_billing_plan_change_state()->>'linked','false','no paid subscription is explicitly unlinked');
select is(get_my_billing_seat_quantity_state()->>'available','false','no paid subscription has no seat mutation authority');
reset role;
select set_config('request.jwt.claim.sub',u::text,true) from retired_state_owners where label='unknown';
set local role authenticated;
select is(get_my_billing_plan_change_state()->>'linked','false','unproven paid origin cannot become plan authority');
select is(get_my_billing_seat_quantity_state()->>'available','false','unproven paid origin cannot become seat authority');
reset role;
select set_config('request.jwt.claim.sub',u::text,true) from retired_state_owners where label='paddle';
set local role authenticated;
select is(get_my_billing_plan_change_state()->>'provider','paddle','Paddle plan authority preserved');
select is(get_my_billing_seat_quantity_state()->>'provider','paddle','Paddle seat authority preserved');
reset role;
select is(resolve_account_entitlements(a.id)#>>'{subscription,effectiveStatus}','active','Paddle entitlements preserved')
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label='paddle';
select is(billing_seat_effective_limit(a.id),2,'trial seat capacity preserved')
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label='trial';
select is(billing_legacy_seat_effective_limit(a.id),2,'legacy-named helper retains generic trial capacity only')
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label='trial';
select is(billing_seat_effective_limit(a.id),10,'complimentary Scale capacity preserved')
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label='complimentary';
select is(billing_seat_effective_limit(a.id),null::integer,'free capacity remains explicitly unavailable')
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label='free';
select pg_temp.historical_plan(u) from retired_state_owners where label='ls';
select is(billing_plan_change_capacity_limit(a.id,'coach_seats',2),2,'LS operation is not capacity authority')
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u where label='ls';
select throws_ok(format('select billing_guard_claim_canonical(%L,%L,''billing.v2'')',b.billing_account_id,b.account_subscription_id),
 'P0001','BILLING_GUARD_CANONICAL_ALREADY_OWNED','LS history still blocks unsafe Paddle attribution')
from billing_provider_subscriptions b join billing_accounts a on a.id=b.billing_account_id
join retired_state_owners r on r.u=a.owner_user_id where r.label='ls';
-- Expiry no longer rewrites retained LS checkout state, even when stale.
insert into billing_checkout_attempts(billing_account_id,plan_version_id,variant_mapping_id,environment,cadence,operation_id,status,expected_expires_at,creation_lease_expires_at,created_by_user_id,created_at)
select a.id,m.plan_version_id,m.id,'test','monthly',gen_random_uuid(),'creating',now()-interval '1 hour',now()-interval '2 hours',r.u,now()-interval '3 hours'
from retired_state_owners r join billing_accounts a on a.owner_user_id=r.u cross join billing_provider_variant_mappings m
where r.label='free' and m.cadence='monthly' and m.status='active' and m.plan_version_id=(select id from commercial_plan_versions where plan_key='growth' and status='active');
create temp table native_before as select jsonb_agg(to_jsonb(c) order by id) rows from billing_checkout_attempts c;
select billing_guard_expire_checkouts(a.id) from billing_accounts a join retired_state_owners r on r.u=a.owner_user_id where r.label='free';
select is((select jsonb_agg(to_jsonb(c) order by id) from billing_checkout_attempts c),(select rows from native_before),'shared housekeeping does not mutate LS history');
-- Terminal LS history on the same account neither supplies authority nor
-- prevents a distinct, proven Paddle canonical origin. Original LS rows stay inert.
update account_subscriptions s set status='expired',expired_at=now(),status_changed_at=now()
from billing_accounts a join retired_state_owners r on r.u=a.owner_user_id where s.billing_account_id=a.id and r.label='mixed';
update billing_provider_subscriptions b set provider_status='expired',provider_ends_at=now(),provider_renews_at=null
from billing_accounts a join retired_state_owners r on r.u=a.owner_user_id where b.billing_account_id=a.id and r.label='mixed';
create temp table mixed_before as select to_jsonb(b) row from billing_provider_subscriptions b join billing_accounts a on a.id=b.billing_account_id join retired_state_owners r on r.u=a.owner_user_id where r.label='mixed';
select is(pg_temp.paddle_existing_historical_owner(u),'applied','terminal history permits separately proven Paddle ownership') from retired_state_owners where label='mixed';
select is(resolve_account_entitlements(a.id)#>>'{subscription,effectiveStatus}','active','only Paddle canonical supplies active mixed-account entitlements') from billing_accounts a join retired_state_owners r on r.u=a.owner_user_id where r.label='mixed';
select is(to_jsonb(b),(select row from mixed_before),'Paddle attribution leaves terminal LS row unchanged') from billing_provider_subscriptions b join billing_accounts a on a.id=b.billing_account_id join retired_state_owners r on r.u=a.owner_user_id where r.label='mixed';
set constraints all immediate;
select * from finish();
rollback;
