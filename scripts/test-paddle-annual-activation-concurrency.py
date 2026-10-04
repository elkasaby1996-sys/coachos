"""PAY-04 annual activation races in the fixed disposable LOCAL project only."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    harness = load("test-paddle-reconciliation-regressions")
    harness.assert_local()
    assert harness.CONTAINER == "supabase_db_repsync_pay04_v2"
    r = load("test-billing-cross-ledger-concurrency")
    r.COMMAND[3] = harness.CONTAINER
    r.SETUP = r.SETUP.replace("billing_db02_test", "pay04_annual_race")
    harness.reset()
    before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    try:
        source = (ROOT / "supabase/tests/paddle_catalogue_initial_activation.sql").read_text()
        source = source.split("create temp table matrix")[0]
        lines = []
        for line in source.splitlines():
            if line.startswith("\\ir "):
                lines.append((ROOT / "supabase/tests" / line[4:]).read_text(encoding="utf-8-sig"))
            elif line not in ("begin;", "select no_plan();"):
                lines.append(line)
        source = "\n".join(lines).replace("pg_temp.", "pay04_annual_race.")
        source = source.replace("set local search_path=public,extensions;", "set local search_path=public,extensions,pay04_annual_race;")
        source = source.replace("create temp table ", "create table pay04_annual_race.")
        r.sql("begin; create schema pay04_annual_race;" + source + "commit;")

        def fixture(plan):
            return r.sql(f"""do $$ declare u uuid:=pay04_annual_race.catalogue_checkout('{plan}','annual'); begin
perform pay04_annual_race.webhook_ingest(pay04_annual_race.catalogue_observation(u,'transaction.completed'));
perform pay04_annual_race.webhook_ingest(pay04_annual_race.catalogue_observation(u,'subscription.created'));
end $$;
select id from billing_subscriptions_v2 order by created_at desc,id desc limit 1;""")

        def reconcile(sid):
            return f"set local role service_role; select reconcile_paddle_initial_purchase_v1('{sid}');"

        def assert_single(sid, plan):
            assert r.sql(f"select count(*) from billing_payment_applications_v2 where subscription_id='{sid}';") == '1'
            assert r.sql(f"select count(*) from billing_subscription_items_v2 where subscription_id='{sid}' and cadence='annual' and quantity=1;") == '1'
            assert r.sql(f"select resolve_account_entitlements(billing_account_id)#>>'{{subscription,planKey}}' from billing_subscriptions_v2 where id='{sid}';") == plan
            assert r.sql(f"select current_period_ends_at='2027-09-20T00:00:00Z'::timestamptz from account_subscriptions where id=(select account_subscription_id from billing_subscriptions_v2 where id='{sid}');") == 't'

        for plan in ('launch', 'growth', 'scale'):
            sid = fixture(plan)
            r.race(plan + ' annual duplicate activation', reconcile(sid), reconcile(sid))
            # The canonical activation reconciler and the period installer are
            # separately serialized; install the period from the same evidence.
            r.sql(f"set role service_role; select bootstrap_paddle_initial_period_v1('{sid}');")
            assert_single(sid, plan)
            sid = fixture(plan)
            a, b = r.Session(), r.Session()
            try:
                a.execute(reconcile(sid))
                b.send(reconcile(sid))
                r.blocked(b)
                a.execute('rollback;')
                assert '"reused": false' in b.collect()
                b.execute('commit;')
                r.RESULTS.append({'case': plan + ' annual rollback/waiting retry', 'result': 'pass'})
            finally:
                a.close()
                b.close()
            r.sql(f"set role service_role; select bootstrap_paddle_initial_period_v1('{sid}');")
            assert_single(sid, plan)
        after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
        assert before == after
        print(json.dumps({'annualCases': r.RESULTS, 'deadlocks': after-before, 'providerRequests': 0}))
    finally:
        harness.reset()


if __name__ == '__main__':
    main()
