"""Renewal races against the fixed disposable local proof database only.

Requires a clean migrated database. Real transaction lock barriers, no sleeps
as correctness assertions. Committed fixtures must be reset after this run.
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
    assert r.sql("select count(*) from auth.users;") == "0", "Reset disposable DB first"
    before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    auto.setup()
    r.sql((ROOT / "supabase/tests/fixtures/paddle_lifecycle_fixture.psql").read_text().replace("pg_temp.", "paddle_auto_test."))

    def observation(u, kind):
        label = "paid" if kind == "transaction.completed" else "renew"
        value = f"paddle_auto_test.lifecycle_observation('{u}','{label}','{kind}')"
        # Exercise semantic period matching under contention as well as pgTAP.
        if kind == "transaction.completed":
            value = "(" + value + """||'{"billingPeriod":{"startsAt":"2026-10-20T03:00:00+03:00","endsAt":"2026-11-20T00:00:00.000Z"}}'::jsonb)"""
        return value

    def ingest(u, kind):
        return f"select paddle_auto_test.lifecycle_ingest({observation(u, kind)});"

    def dispatch(u, kind):
        ev = r.sql(f"select id from billing_webhook_events_v2 where provider_event_ref={observation(u, kind)}->>'eventRef';")
        return f"set local role service_role; select reconcile_paddle_initial_purchase_event_v1('{ev}');"

    def verify(u, canonical):
        value = json.loads(r.sql(f"select paddle_auto_test.lifecycle_counts('{u}');"))
        assert value == dict(canonical=1, renewals=1, seats=0, status="active", cancel=False, access="full", end="2026-11-20"), "Renewal effect mismatch"
        assert r.sql(f"select account_subscription_id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/{u}';") == canonical

    for first, second in (("transaction.completed", "subscription.updated"), ("subscription.updated", "transaction.completed")):
        u = r.sql("select paddle_auto_test.lifecycle_owner();")
        canonical = r.sql(f"select account_subscription_id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/{u}';")
        r.race("concurrent complementary lifecycle ingress " + first, ingest(u, first), ingest(u, second))
        r.race("paired lifecycle dispatch " + first, dispatch(u, first), dispatch(u, second))
        verify(u, canonical)
        r.race("duplicate renewal delivery " + first, ingest(u, first), ingest(u, first))
        r.race("duplicate renewal application " + first, dispatch(u, first), dispatch(u, first))
        verify(u, canonical)

        u = r.sql("select paddle_auto_test.lifecycle_owner();")
        canonical = r.sql(f"select account_subscription_id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/{u}';")
        r.sql(ingest(u, first))
        assert '"pending"' in r.sql(dispatch(u, first))
        r.race("pending retry versus complementary ingress " + first, ingest(u, second), dispatch(u, first))
        verify(u, canonical)

    after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert before == after, "Application deadlock detected"
    print(json.dumps(dict(cases=len(r.RESULTS), deadlocks=after-before, maximumRenewalsPerTransaction=1, providerCalls=0)))


if __name__ == "__main__":
    main()
