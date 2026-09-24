"""Automatic initial purchase races; fixed disposable local DB, no provider IO.

Each ingestion COMMIT precedes dispatch, matching separate PostgREST requests.
Uses real lock waits; never injects sleeps as a concurrency correctness oracle.
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("races", ROOT / "scripts/test-billing-cross-ledger-concurrency.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.COMMAND[3] = "supabase_db_repsync_reconciliation01"
r.SETUP = r.SETUP.replace("billing_db02_test", "paddle_auto_test")


def setup(include_dispatch=True):
    fixtures = "\n".join((ROOT / "supabase/tests/fixtures" / f).read_text(encoding="utf-8-sig") for f in (
        "billing_v2_legacy_seed.psql", "billing_cross_ledger_helpers.psql", "billing_catalogue_fixture.psql",
        "paddle_webhook_fixture.psql", "paddle_auto_reconciliation_fixture.psql"))
    if not include_dispatch:
        start = fixtures.index("create function pg_temp.auto_dispatch(")
        end = fixtures.index("create function pg_temp.auto_counts(", start)
        fixtures = fixtures[:start] + fixtures[end:]
    fixtures = fixtures.replace("pg_temp.", "paddle_auto_test.")
    fixtures = fixtures.replace("create temp table actors", "create table paddle_auto_test.actors")
    fixtures = fixtures.replace("create temp table catalogue_vector", "create table paddle_auto_test.catalogue_vector")
    r.sql("begin; create schema paddle_auto_test;" + fixtures + """
select paddle_auto_test.catalogue_publish(paddle_auto_test.catalogue(k,c)) from
unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
grant usage on schema paddle_auto_test to service_role;
commit;
""")


def main():
    assert r.sql("select count(*) from auth.users;") == "0", "Reset disposable DB first"
    before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    setup()

    def fixture():
        return r.sql("select paddle_auto_test.auto_checkout();")

    def ingest(u, kind):
        return f"select paddle_auto_test.auto_ingest('{u}','{kind}');"

    # Resolve the internal event ID outside the service call; the dispatcher
    # receives only that UUID, exactly as it would from the committed ingress.
    def dispatch(u, kind="transaction.completed"):
        ev = r.sql(f"select id from billing_webhook_events_v2 where provider_event_ref='synthetic/{kind}/{u}';")
        assert ev
        return f"set local role service_role; select reconcile_paddle_initial_purchase_event_v1('{ev}');"

    def verify(u):
        actual = json.loads(r.sql(f"select paddle_auto_test.auto_counts('{u}');"))
        assert actual == dict(payments=1, canonical=1, links=1, items=1, seats=0, checkout="completed"), actual

    for first, second in (("transaction.completed", "subscription.created"), ("subscription.created", "transaction.completed")):
        u = fixture()
        r.race("simultaneous deliveries " + first, ingest(u, first), ingest(u, second))
        r.race("dispatcher race after " + first, dispatch(u, first), dispatch(u, second))
        verify(u)

    for kind, complement in (("transaction.completed", "subscription.created"), ("subscription.created", "transaction.completed")):
        u = fixture()
        r.sql(ingest(u, complement))
        r.race("duplicate " + kind, ingest(u, kind), ingest(u, kind))
        r.race("duplicate dispatch " + kind, dispatch(u, kind), dispatch(u, kind))
        verify(u)
        assert r.sql(f"select count(*) from billing_webhook_events_v2 where provider_event_ref='synthetic/{kind}/{u}';") == "1"

    u = fixture()
    r.sql(ingest(u, "transaction.completed"))
    assert '"pending"' in r.sql(dispatch(u))
    # Subscription ingress owns the account; retry dispatch waits, then sees its
    # committed complement under READ COMMITTED without an ingress-lock cycle.
    r.race("retry races complementary committed ingress", ingest(u, "subscription.created"), dispatch(u))
    verify(u)

    for ls in (False, True):
        u = fixture()
        r.sql(ingest(u, "transaction.completed") + ingest(u, "subscription.created"))
        acct = r.sql(f"select billing_account_id from billing_checkouts_v2 where provider_transaction_ref='synthetic/txn/{u}';")
        canonical = f"""select billing_guard_lock('{acct}','test');
insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
select '{acct}',id,'paid','active','billing_provider' from commercial_plan_versions where plan_key='growth' and status='active';"""
        if ls:
            canonical += f"""
insert into billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id)
values('{acct}','lemonsqueezy','test','96001','synthetic/ls/{u}');
select paddle_auto_test.put('billing_provider_subscriptions',to_jsonb(b)||jsonb_build_object('id',gen_random_uuid(),
'billing_account_id','{acct}','account_subscription_id',(select id from account_subscriptions where billing_account_id='{acct}'),
'provider_customer_id','synthetic/ls/{u}','provider_subscription_id','synthetic/ls/{u}',
'provider_order_id','synthetic/ls/{u}','provider_order_item_id','synthetic/ls/{u}',
'first_subscription_item_id','synthetic/ls/{u}','quantity',1,'approved_additional_coach_seats',0))
from billing_provider_subscriptions b join billing_provider_variant_mappings m on m.id=b.variant_mapping_id
join commercial_plan_versions p on p.id=m.plan_version_id where p.plan_key='growth' and m.cadence='monthly' limit 1;"""
        r.race("LS conflict" if ls else "canonical conflict", canonical, dispatch(u), "PADDLE_RECONCILIATION_CANONICAL_CONFLICT")
        counts = json.loads(r.sql(f"select paddle_auto_test.auto_counts('{u}');"))
        assert counts == dict(payments=0, canonical=1, links=0, items=0, seats=0, checkout="ready"), counts

    after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert after == before
    print(json.dumps(dict(cases=len(r.RESULTS), deadlocks=after-before, providerCalls=0)))


if __name__ == "__main__":
    main()
