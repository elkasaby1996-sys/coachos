"""Certification authority races in the disposable local proof database only.

No remote URL or container override. Reset after committed synthetic fixtures.
"""
import importlib.util
import json
import uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('races',ROOT/'scripts/test-billing-cross-ledger-concurrency.py')
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.COMMAND[3]='supabase_db_repsync_checkout01'
r.SETUP=r.SETUP.replace('billing_db02_test','paddle_cert_fixture_test')

def main():
    assert r.sql('select count(*) from auth.users;')=='0','Reset isolated local DB first'
    before=int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    fixture='\n'.join((ROOT/'supabase/tests/fixtures'/f).read_text(encoding='utf-8-sig') for f in ['billing_v2_legacy_seed.psql','billing_cross_ledger_helpers.psql','billing_catalogue_fixture.psql','paddle_certification_fixture.psql'])
    fixture=fixture.replace('pg_temp.','paddle_cert_fixture_test.').replace('create temp table actors','create table paddle_cert_fixture_test.actors').replace('create temp table catalogue_vector','create table paddle_cert_fixture_test.catalogue_vector')
    r.sql('begin; create schema paddle_cert_fixture_test;\n'+fixture+"\nselect paddle_cert_fixture_test.catalogue_publish(paddle_cert_fixture_test.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c; commit;")
    def owner(): return r.sql('select paddle_cert_fixture_test.cert_owner();')
    def create(u,run): return f"select create_paddle_checkout_certification_fixture_v1('{u}','growth','monthly',1,'{run}');"
    def close(run): return f"select close_paddle_checkout_certification_fixture_v1('{run}');"
    u=owner();run=uuid.uuid4()
    r.race('duplicate create same run',create(u,run),create(u,run))
    assert r.sql(f"select count(*) from billing_paddle_checkout_certification_fixtures where run_id='{run}';")=='1'
    u=owner();r.race('different runs same account',create(u,uuid.uuid4()),create(u,uuid.uuid4()),'BILLING_GUARD_CHECKOUT_ALREADY_OPEN')
    u=owner();r.race('fixture wins legacy checkout',create(u,uuid.uuid4()),f"select paddle_cert_fixture_test.guard_checkout('{u}','ls');",'BILLING_GUARD_CHECKOUT_ALREADY_OPEN')
    u=owner();r.race('legacy wins fixture checkout',f"select paddle_cert_fixture_test.guard_checkout('{u}','ls');",create(u,uuid.uuid4()),'BILLING_GUARD_CHECKOUT_ALREADY_OPEN')
    u=owner();run=uuid.uuid4();r.sql(create(u,run))
    r.race('retry create then close',create(u,run),close(run))
    u=owner();run=uuid.uuid4();r.sql(create(u,run))
    r.race('close then retry create',close(run),create(u,run),'PADDLE_CERTIFICATION_CLOSED')
    u=owner();run=uuid.uuid4();r.sql(create(u,run))
    r.race('duplicate close',close(run),close(run))
    u,v=owner(),owner();run=uuid.uuid4()
    r.race('same run different accounts',create(u,run),create(v,run),'PADDLE_CERTIFICATION_CONFLICT')
    # A never-committed marker is not visible to close; do not acquire a run
    # lock and then discover/acquire an account in reverse order.
    u=owner();run=uuid.uuid4();a,b=r.Session(),r.Session()
    try:
        a.execute(create(u,run));b.send(close(run));b.collect('PADDLE_CERTIFICATION_NOT_FOUND');a.execute('commit;')
        r.RESULTS.append({'case':'close before create commit','result':'retry required'})
        print('PASS: close before create commit fails closed',flush=True)
    finally:a.close();b.close()
    r.sql(close(run))
    assert r.sql('select count(*) from billing_payment_applications_v2;')=='0'
    assert r.sql('select count(*) from billing_subscriptions_v2 where account_subscription_id is not null or approved_additional_coach_seats<>0;')=='0'
    assert r.sql('select (not paddle_sales_enabled and not paddle_reconciliation_enabled)::text from billing_runtime_policy;')=='true'
    after=int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert after==before
    print(json.dumps({'cases':len(r.RESULTS),'deadlocks':after-before,'providerCalls':0}))
if __name__=='__main__':main()
