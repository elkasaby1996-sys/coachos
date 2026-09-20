"""Real-session webhook races; disposable local container only. Reset afterward."""
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('races',ROOT/'scripts/test-billing-cross-ledger-concurrency.py')
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.COMMAND[3]='supabase_db_repsync_checkout01'
r.SETUP=r.SETUP.replace('billing_db02_test','paddle_webhook_test')

def main():
    assert r.sql('select count(*) from auth.users;')=='0','Reset isolated DB first'
    before=int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    fixtures='\n'.join((ROOT/'supabase/tests/fixtures'/f).read_text(encoding='utf-8-sig') for f in ['billing_v2_legacy_seed.psql','billing_cross_ledger_helpers.psql','billing_catalogue_fixture.psql','paddle_webhook_fixture.psql'])
    fixtures=fixtures.replace('pg_temp.','paddle_webhook_test.').replace('create temp table actors','create table paddle_webhook_test.actors').replace('create temp table catalogue_vector','create table paddle_webhook_test.catalogue_vector')
    r.sql('begin; create schema paddle_webhook_test;\n'+fixtures+"\nselect paddle_webhook_test.catalogue_publish(paddle_webhook_test.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c; update billing_runtime_policy set paddle_sales_enabled=true; create table paddle_webhook_test.attempt as select u,begin_paddle_checkout_v1(u,'growth','monthly',0,gen_random_uuid(),true,true,'2026-09-18','2026-09-18') result from (select paddle_webhook_test.guard_owner() u) x; update billing_runtime_policy set paddle_sales_enabled=false; commit;")
    ready="select mark_paddle_checkout_ready_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/transaction','ready','USD',jsonb_build_array(result->'base')) from paddle_webhook_test.attempt;"
    def event(k,e,n=None):
        return f"select paddle_webhook_test.webhook_ingest(paddle_webhook_test.webhook_observation('{k}','synthetic/{e}','synthetic/{n or e}'));"
    # Uncommitted checkout identity is invisible: retain pending, never guess.
    a,b=r.Session(),r.Session()
    try:
        a.execute(ready)
        b.execute(event('transaction.completed','race-checkout'))
        b.execute('commit;')
        a.execute('commit;')
        assert r.sql("select disposition from billing_paddle_event_observations where observation->>'eventRef'='synthetic/race-checkout';")=='pending'
        r.RESULTS.append({'case':'checkout correlation race','result':'pending safely'})
        print('PASS: checkout correlation race retains pending evidence',flush=True)
    finally:
        a.close();b.close()
    r.race('same delivery concurrent',event('transaction.completed','same'),event('transaction.completed','same'))
    r.race('same event new delivery concurrent',event('transaction.completed','logical','delivery-a'),event('transaction.completed','logical','delivery-b'))
    r.race('transaction and subscription race',event('transaction.completed','transaction'),event('subscription.created','created'))
    r.sql("update billing_runtime_policy set paddle_sales_enabled=true; create table paddle_webhook_test.second_attempt as select u,begin_paddle_checkout_v1(u,'growth','monthly',0,gen_random_uuid(),true,true,'2026-09-18','2026-09-18') result from (select paddle_webhook_test.guard_owner() u) x; select mark_paddle_checkout_ready_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/transaction-2','ready','USD',jsonb_build_array(result->'base')) from paddle_webhook_test.second_attempt; update billing_runtime_policy set paddle_sales_enabled=false;")
    def fresh_shadow(e):
        return f"set local role service_role; select paddle_webhook_test.webhook_ingest(paddle_webhook_test.webhook_observation('subscription.created','synthetic/{e}','synthetic/{e}')||jsonb_build_object('transactionCorrelationRef','synthetic/transaction-2','customerRef','synthetic/customer-2','subscriptionRef','synthetic/subscription-2'));"
    # Grant only access to disposable test helpers, never private billing tables.
    # Session.commit runs after the definer RPC returns, under service_role.
    r.sql('grant usage on schema paddle_webhook_test to service_role;')
    r.race('concurrent insertion of new customer and subscription',fresh_shadow('created-a'),fresh_shadow('created-b'))
    r.race('update before create out of order',event('subscription.updated','updated'),event('subscription.created','late-create'))
    r.sql("begin; set local role service_role; select paddle_webhook_test.webhook_ingest(paddle_webhook_test.webhook_observation('subscription.updated','synthetic/service-commit','synthetic/service-commit','2026-09-21T12:00:00.000Z')||'{\"status\":\"paused\"}'); commit;")
    assert r.sql("select provider_status from billing_subscriptions_v2 where provider_subscription_ref='synthetic/subscription';")=='paused'
    r.RESULTS.append({'case':'service update transaction commit','result':'committed'})
    print('PASS: service update commits deferred validator',flush=True)
    assert r.sql('select count(*) from billing_subscriptions_v2;')=='2'
    assert r.sql('select count(*) from billing_customers_v2;')=='2'
    assert r.sql('select count(*) from billing_payment_applications_v2;')=='0'
    assert r.sql('select count(*) from billing_subscriptions_v2 where account_subscription_id is not null or approved_additional_coach_seats<>0;')=='0'
    after=int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert after==before
    print(json.dumps({'cases':len(r.RESULTS),'deadlocks':after-before,'providerCalls':0}))
if __name__=='__main__':main()
