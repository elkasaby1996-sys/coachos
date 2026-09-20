"""Checkout races on the disposable local checkout database only. No HTTP.
Reuses DB-02's observed lock-wait barrier, without a second lock protocol.
Run after clean reconstruction; fixture rows are synthetic and committed.
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
r.SETUP=r.SETUP.replace('billing_db02_test','paddle_checkout_test')
def main():
    assert r.sql('select count(*) from auth.users;')=='0','Reset isolated checkout DB first'
    before=int(r.sql('select deadlocks from pg_stat_database where datname=current_database();'))
    seed=(ROOT/'supabase/tests/fixtures/billing_v2_legacy_seed.psql').read_text(encoding='utf8')
    helpers=(ROOT/'supabase/tests/fixtures/billing_cross_ledger_helpers.psql').read_text(encoding='utf8')
    catalogue=(ROOT/'supabase/tests/fixtures/billing_catalogue_fixture.psql').read_text(encoding='utf8')
    fixture=(seed+helpers+catalogue).replace('pg_temp.','paddle_checkout_test.').replace('create temp table actors','create table paddle_checkout_test.actors').replace('create temp table catalogue_vector','create table paddle_checkout_test.catalogue_vector')
    r.sql('begin; create schema paddle_checkout_test;\n'+fixture+"\nselect paddle_checkout_test.catalogue_publish(paddle_checkout_test.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c; update billing_runtime_policy set paddle_sales_enabled=true where id=1; commit;")
    def owner(): return r.sql('select paddle_checkout_test.guard_owner();')
    def begin(u,op=None,plan='growth'):
        return f"select begin_paddle_checkout_v1('{u}','{plan}','monthly',0,'{op or uuid.uuid4()}',true,true,'2026-09-18','2026-09-18');"
    u=owner();op=uuid.uuid4()
    r.race('same operation replay dispatches once',begin(u,op),begin(u,op))
    assert r.sql(f"select count(*) from billing_checkouts_v2 where created_by_user_id='{u}';")=='1'
    u=owner();r.race('different operations same snapshot reuse',begin(u),begin(u))
    assert r.sql(f"select count(*) from billing_checkouts_v2 where created_by_user_id='{u}';")=='1'
    u=owner();r.race('different snapshots conflict',begin(u),begin(u,plan='scale'),'PADDLE_CHECKOUT_CONFLICT')
    u=owner();ls=f"select paddle_checkout_test.guard_checkout('{u}','ls');"
    r.race('Paddle wins against legacy checkout',begin(u),ls,'BILLING_GUARD_CHECKOUT_ALREADY_OPEN')
    u=owner();ls=f"select paddle_checkout_test.guard_checkout('{u}','ls');"
    r.race('legacy wins against Paddle checkout',ls,begin(u),'BILLING_GUARD_CHECKOUT_ALREADY_OPEN')
    after=int(r.sql('select deadlocks from pg_stat_database where datname=current_database();'))
    assert after==before,'Unexpected deadlock'
    print(json.dumps({'cases':len(r.RESULTS),'deadlocks':after-before,'realProviderCalls':0}))
if __name__=='__main__': main()
