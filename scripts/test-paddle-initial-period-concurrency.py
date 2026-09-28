"""Period bootstrap races in the fixed disposable local DB; no provider IO."""
import importlib.util
import json
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
    for name in ("paddle_lifecycle_fixture.psql", "paddle_initial_period_fixture.psql"):
        r.sql((ROOT / "supabase/tests/fixtures" / name).read_text().replace("pg_temp.", "paddle_auto_test."))

    def owner(trial=None):
        argument = "null" if trial is None else "'" + trial + "'"
        u = r.sql(f"select paddle_auto_test.period_owner({argument},true);")
        sid = r.sql(f"select paddle_auto_test.period_subscription('{u}');")
        return u, sid

    def bootstrap(sid):
        return f"set local role service_role; select bootstrap_paddle_initial_period_v1('{sid}');"

    def verify(sid, records=1):
        assert r.sql(f"select count(*) from billing_paddle_initial_period_bootstraps where subscription_id='{sid}';") == str(records)
        assert r.sql(f"select s.current_period_started_at=a.current_period_started_at and s.current_period_ends_at=a.current_period_ends_at from billing_subscriptions_v2 s join account_subscriptions a on a.id=s.account_subscription_id where s.id='{sid}';") == "t"
        assert r.sql(f"select count(*) from billing_payment_applications_v2 where subscription_id='{sid}';") == "1"

    for trial in (None, "trialing", "trial_recovery"):
        u, sid = owner(trial)
        r.race("duplicate bootstrap " + str(trial), bootstrap(sid), bootstrap(sid))
        verify(sid)
        snapshot = r.sql(f"select paddle_auto_test.period_snapshot('{u}');")
        r.sql(bootstrap(sid))
        assert snapshot == r.sql(f"select paddle_auto_test.period_snapshot('{u}');")

    for bootstrap_first in (True, False):
        u, sid = owner()
        lifecycle = f"select paddle_auto_test.lifecycle_dispatch(paddle_auto_test.lifecycle_observation('{u}','racing','subscription.updated','active','2026-09-21T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z'));"
        if bootstrap_first:
            r.race("bootstrap before lifecycle", bootstrap(sid), lifecycle)
        else:
            r.race("lifecycle supersedes bootstrap", lifecycle, bootstrap(sid), "PADDLE_INITIAL_PERIOD_INELIGIBLE")
        verify(sid, int(bootstrap_first))

    u = r.sql("select paddle_auto_test.auto_checkout('trialing');")
    r.sql(f"select paddle_auto_test.webhook_ingest(paddle_auto_test.auto_observation('{u}','transaction.completed')||'{{\"origin\":\"web\",\"billingPeriod\":{{\"startsAt\":\"2026-09-20T00:00:00Z\",\"endsAt\":\"2026-10-20T00:00:00Z\"}}}}'::jsonb); select paddle_auto_test.auto_ingest('{u}','subscription.created');")
    events = json.loads(r.sql(f"select jsonb_agg(id) from billing_webhook_events_v2 where subscription_ref='synthetic/sub/{u}';"))
    dispatch = lambda event: f"set local role service_role; select reconcile_paddle_initial_purchase_event_v1('{event}');"
    r.race("initial dispatch atomically bootstraps trial purchase", dispatch(events[0]), dispatch(events[1]))
    verify(r.sql(f"select paddle_auto_test.period_subscription('{u}');"))
    after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert before == after, "Deadlock detected"
    print(json.dumps(dict(cases=len(r.RESULTS), deadlocks=after-before, providerCalls=0)))


if __name__ == "__main__":
    main()
