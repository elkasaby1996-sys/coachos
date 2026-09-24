"""Plan-change races in the fixed disposable local database; no provider IO."""
import importlib.util
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("auto", ROOT / "scripts/test-paddle-auto-reconciliation-concurrency.py")
auto = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto)
r = auto.r


def main():
    assert r.sql("select count(*) from auth.users;") == "0", "Reset disposable DB first"
    before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    auto.setup()
    for name in ("paddle_lifecycle_fixture.psql", "paddle_plan_change_fixture.psql"):
        r.sql((ROOT / "supabase/tests/fixtures" / name).read_text().replace("pg_temp.", "paddle_auto_test."))
    for exact in (True, False):
        u = r.sql("select paddle_auto_test.plan_owner();")
        op = str(uuid.uuid4())
        first = f"select paddle_auto_test.plan_begin('{u}','scale','{op}');"
        second = first if exact else f"select paddle_auto_test.plan_begin('{u}','launch');"
        r.race("exact retry" if exact else "conflicting plan requests", first, second, None if exact else "BILLING_PLAN_CHANGE_ALREADY_PENDING")
        assert r.sql(f"select count(*) from billing_operations_v2 where created_by_user_id='{u}';") == "1"
        events = []
        for kind in ("subscription.updated", "transaction.completed"):
            events.append(r.sql(f"select paddle_auto_test.lifecycle_ingest(paddle_auto_test.plan_observation('{u}','{kind}','{kind}'));"))
        dispatch = lambda ev: f"set local role service_role; select reconcile_paddle_initial_purchase_event_v1('{ev}');"
        r.race("complementary paid upgrade dispatch", dispatch(events[0]), dispatch(events[1]))
        r.race("duplicate upgrade dispatch", dispatch(events[1]), dispatch(events[1]))
        # A late timeout must not overwrite webhook-completed authority.
        ledger = r.sql(f"select id from billing_operations_v2 where created_by_user_id='{u}';")
        r.race("late ambiguous response versus proof", dispatch(events[0]), f"set local role service_role; select fail_paddle_plan_change_v1('{u}','{ledger}',true);")
        result = json.loads(r.sql(f"select paddle_auto_test.plan_status('{u}');"))
        assert result['plan'] == 'scale' and result['payments'] == 1 and result['operation'] == 'completed'
    after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert before == after, "Application deadlock detected"
    print(json.dumps(dict(cases=len(r.RESULTS), deadlocks=after-before, providerCalls=0)))


if __name__ == "__main__":
    main()
