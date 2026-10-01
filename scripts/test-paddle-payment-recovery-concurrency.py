"""Recovery races on the fixed disposable reconciliation database, no provider IO.

Uses the existing observed-lock barrier. Reset disposable fixtures after running.
No remote URL or application database override is accepted.
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("auto", ROOT / "scripts/test-paddle-auto-reconciliation-concurrency.py")
auto = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto)
r = auto.r


def main():
    assert r.COMMAND[3] == "supabase_db_repsync_reconciliation01"
    assert r.sql("select count(*) from auth.users;") == "0", "Reset disposable DB first"
    before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    auto.setup()
    for filename in ("paddle_lifecycle_fixture.psql", "paddle_plan_change_fixture.psql", "paddle_seat_fixture.psql", "paddle_recovery_fixture.psql"):
        body = (ROOT / "supabase/tests/fixtures" / filename).read_text()
        if filename == "paddle_recovery_fixture.psql":
            body = body[body.index("create function pg_temp.recovery_observation"):]
        r.sql(body.replace("pg_temp.", "paddle_auto_test."))

    def observation(u, kind):
        stamp = "2026-10-21T13:00:00Z" if kind == "subscription.updated" else "2026-10-21T12:00:00Z"
        return f"paddle_auto_test.recovery_observation('{u}','{kind}','{kind}','{stamp}')"

    def ingest(u, kind):
        return f"select paddle_auto_test.recovery_ingest({observation(u, kind)});"

    def dispatch(u, kind):
        ev = r.sql(f"select id from billing_webhook_events_v2 where provider_event_ref={observation(u, kind)}->>'eventRef';")
        name = "reconcile_paddle_initial_purchase_event_v1" if kind == "subscription.updated" else "reconcile_paddle_payment_recovery_event_v1"
        return f"set local role service_role;select {name}('{ev}');"

    def verify(u, extras):
        actual = json.loads(r.sql(f"select paddle_auto_test.recovery_counts('{u}');"))
        assert actual['renewal'] == 1 and actual['seatPayments'] == extras
        assert actual['approved'] == extras and actual['capacity'] == 2 + extras
        assert actual['status'] == 'active'

    for extras in (0, 1):
        for first, second in (("transaction.completed", "subscription.updated"), ("subscription.updated", "transaction.completed")):
            u = r.sql(f"select paddle_auto_test.recovery_owner({extras});")
            r.sql(f"select paddle_auto_test.recovery_dispatch(paddle_auto_test.recovery_observation('{u}','debt'));")
            r.race(f"recovery ingress {extras}/{first}", ingest(u, first), ingest(u, second))
            r.race(f"recovery dispatch {extras}/{first}", dispatch(u, first), dispatch(u, second))
            verify(u, extras)
            r.race(f"recovery duplicate {extras}/{first}", dispatch(u, first), dispatch(u, first))
            verify(u, extras)

        # A resolver held behind committed financial ingress must see paid knowledge.
        u = r.sql(f"select paddle_auto_test.recovery_owner({extras});")
        r.sql(f"select paddle_auto_test.recovery_dispatch(paddle_auto_test.recovery_observation('{u}','debt'));")
        canonical = r.sql(f"select account_subscription_id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/{u}';")
        r.race(f"paid ingress versus resolver {extras}", ingest(u, "transaction.paid"), f"set local role service_role;select resolve_billing_outstanding_obligation_v1('{canonical}');")
        result = json.loads(r.sql(f"select resolve_billing_outstanding_obligation_v1('{canonical}');"))
        assert result == dict(available=False, reason="settlement_pending")
        assert json.loads(r.sql(f"select paddle_auto_test.recovery_counts('{u}');"))['renewal'] == 0
    after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert after == before
    print(json.dumps(dict(cases=len(r.RESULTS), deadlocks=after-before, providerCalls=0)))


if __name__ == "__main__":
    main()
