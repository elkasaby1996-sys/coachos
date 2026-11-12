begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/paddle_recovery_fixture.psql

create temp table reduction_owner as select pg_temp.plan_owner() u;
select pg_temp.paddle_seat_buy(u,1) from reduction_owner;
create temp table before_reduction as
select u,(begin_billing_payment_method_preparation_v1(u)->>'preparationId')::uuid preparation
from reduction_owner;
select pg_temp.paddle_seat_begin(u,0) from reduction_owner;
select is(pg_temp.lifecycle_dispatch(pg_temp.paddle_seat_observation(u,'method-scheduled-reduction')),
 'applied','verified provider reduction is scheduled through production reconciliation') from reduction_owner;

create temp table retained_reduction as select o.id,to_jsonb(o) snapshot
from billing_operations_v2 o join billing_accounts b on b.id=o.billing_account_id
join reduction_owner r on r.u=b.owner_user_id where o.status='scheduled';
select is((select count(*)::int from retained_reduction),1,'one confirmed future reduction');
select is(pg_temp.paddle_seat_counts(u)->>'approved','1','paid extra seat is preserved until renewal') from reduction_owner;
select is(billing_paddle_recovery_candidate_v1(s.account_subscription_id)->>'reason','operation_conflict',
 'recovery authority independently blocks scheduled seat operations')
from billing_subscriptions_v2 s join billing_accounts b on b.id=s.billing_account_id join reduction_owner r on r.u=b.owner_user_id;

select set_config('request.jwt.claim.sub',u::text,true) from reduction_owner;
set local role authenticated;
select is(get_my_billing_payment_method_state_v1()->>'available','false','owner cannot act during scheduled reduction');
reset role;
select throws_ok(format('select begin_billing_payment_method_preparation_v1(%L)',u),
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','retry cannot prepare through the scheduled operation') from reduction_owner;
select throws_ok(format('select claim_billing_payment_method_dispatch_v1(%L,%L,%L)',u,preparation,repeat('a',64)),
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','reduction winning after begin fences dispatch of the earlier reservation') from before_reduction;
select throws_ok(format('select authorize_billing_payment_method_continuation_v1(%L,%L)',u,preparation),
 'P0001','BILLING_PAYMENT_METHOD_UNAVAILABLE','continuation rechecks authority after a scheduled reduction') from before_reduction;
select is((select count(*)::int from billing_payment_method_preparations_v2),1,'blocked retries never add reservations');
select ok((select dispatch_token_sha256 is null from billing_payment_method_preparations_v2 where id=preparation),
 'blocked dispatch never obtains a provider permit') from before_reduction;
select is(to_jsonb(o),r.snapshot,'all scheduled-operation fields remain identical after inspection and retries')
from retained_reduction r join billing_operations_v2 o on o.id=r.id;
select is(pg_temp.paddle_seat_counts(u)->>'payments','1','seat payment history retained') from reduction_owner;
select * from finish();
rollback;
