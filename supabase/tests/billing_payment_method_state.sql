begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/paddle_recovery_fixture.psql

create function pg_temp.method_state(u uuid) returns jsonb language plpgsql as $$
declare result jsonb;
begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('role','authenticated',true);
 result:=public.get_my_billing_payment_method_state_v1();
 perform set_config('role','none',true);
 return result;
end $$;
create temp table state_owners(label text,u uuid);
insert into state_owners values('active',pg_temp.plan_owner()),('debt',pg_temp.recovery_owner()),('incomplete',pg_temp.recovery_owner());
select pg_temp.recovery_dispatch(pg_temp.recovery_observation(u,'safe-state-debt')) from state_owners where label='debt';
select is((select count(*)::integer from billing_provider_subscriptions p join billing_accounts b on b.id=p.billing_account_id join state_owners o on o.u=b.owner_user_id),0,
 'Paddle-only fixtures have no legacy provider rows');
select is(pg_temp.method_state(u),jsonb_build_object('available',true,'status',case label when 'active' then 'active' else 'past_due' end,
 'maySettleExistingBalance',label='debt'),'owner state matches private eligibility: '||label) from state_owners where label in ('active','debt');
select is(pg_temp.method_state(u)->>'available','false','incomplete debt is not advertised') from state_owners where label='incomplete';
select ok(not has_function_privilege('authenticated','billing_payment_method_context_authority_v1(uuid)','execute'), 'shared private context cannot expose references');
select ok(not has_function_privilege('authenticated','billing_paddle_recovery_candidate_v1(uuid)','execute'), 'recovery accounting projection remains private');
select ok(not has_function_privilege('authenticated','resolve_owned_billing_payment_method_context_v1(uuid)','execute'), 'service resolver remains private');
select ok(pg_temp.method_state(u)::text !~ 'synthetic|Reference|authorityRevision|accountId|subscriptionId|customerId','safe state has no private identity: '||label) from state_owners;

savepoint state_case;
select is(pg_temp.lifecycle_dispatch(jsonb_set(pg_temp.lifecycle_observation(u,'state-manual-review'),'{items,0,quantity}','2')),'manual_review','invalid current item evidence reaches production review guard') from state_owners where label='active';
select is(pg_temp.method_state(u)->>'available','false','manual review unavailable') from state_owners where label='active';
rollback to state_case;

select pg_temp.plan_begin(u) from state_owners where label='active';
select is(pg_temp.method_state(u)->>'available','false','open plan operation unavailable') from state_owners where label='active';
rollback to state_case;
select pg_temp.paddle_seat_begin(u,1) from state_owners where label='active';
select is(pg_temp.method_state(u)->>'available','false','open seat operation unavailable') from state_owners where label='active';
rollback to state_case;
select pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'state-cancel')||jsonb_build_object('nextBilledAt',null,'scheduledChange',jsonb_build_object('action','cancel','effectiveAt','2026-10-20T00:00:00Z'))) from state_owners where label='active';
select is(pg_temp.method_state(u)->>'available','false','scheduled cancellation unavailable') from state_owners where label='active';
rollback to state_case;
select throws_ok($q$update billing_subscriptions_v2 set provider_status='past_due' where provider_subscription_ref='synthetic/sub/'||(select u from state_owners where label='active')$q$,
 'P0001','PADDLE_LIFECYCLE_LINK_PROOF','production guard rejects fabricated canonical/shadow conflict');
select pg_temp.lifecycle_dispatch(pg_temp.lifecycle_observation(u,'state-conflict')||'{"nextBilledAt":null,"scheduledChange":{"action":"cancel","effectiveAt":"2026-10-19T00:00:00Z"}}'::jsonb) from state_owners where label='active';
select is(pg_temp.method_state(u)->>'available','false','retained conflicting subscription evidence unavailable') from state_owners where label='active';
rollback to state_case;

select pg_temp.recovery_dispatch(pg_temp.recovery_observation(u,'safe-state-active','subscription.updated','2026-10-21T12:00:00Z')) from state_owners where label='debt';
select is(pg_temp.method_state(u)->>'available','false','active observation cannot advertise recovery while debt remains') from state_owners where label='debt';
select pg_temp.recovery_dispatch(pg_temp.recovery_observation(u,'safe-state-completed','transaction.completed','2026-10-21T12:00:00Z')) from state_owners where label='debt';
select is(pg_temp.method_state(u),jsonb_build_object('available',true,'status','active','maySettleExistingBalance',false), 'authenticated renewal settlement confirms recovery without legacy rows') from state_owners where label='debt';
select is(pg_temp.recovery_counts(u)->>'renewal','1','one authenticated renewal application') from state_owners where label='debt';

create temp table state_preparation as select u,(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid id from state_owners where label='active';
select is(pg_temp.method_state(u)->>'available','true','unclaimed current reservation remains eligible') from state_preparation;
select claim_billing_payment_method_dispatch_v1(u,id,repeat('a',64)) from state_preparation;
select is(pg_temp.method_state(u)->>'available','false','claimed creating preparation cannot advertise another dispatch') from state_preparation;
select fail_billing_payment_method_preparation_v1(id,repeat('a',64),'provider_ambiguous') from state_preparation;
select is(pg_temp.method_state(u)->>'available','false','ambiguous preparation is unavailable') from state_preparation;

select is(pg_temp.method_state(pg_temp.guard_owner())->>'available','false','nonowner with no paid billing authority has no action');
select * from finish();
rollback;
