"""Initial purchase races. Dedicated disposable local container; no providers."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "races", ROOT / "scripts/test-billing-cross-ledger-concurrency.py"
)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.COMMAND[3] = "supabase_db_repsync_reconciliation01"
r.SETUP = r.SETUP.replace("billing_db02_test", "paddle_reconciliation_test")


def main():
    assert r.sql("select count(*) from auth.users;") == "0", "Reset isolated DB first"
    before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    fixtures = "\n".join(
        (ROOT / "supabase/tests/fixtures" / name).read_text(encoding="utf-8-sig")
        for name in (
            "billing_v2_legacy_seed.psql", "billing_cross_ledger_helpers.psql",
            "billing_catalogue_fixture.psql", "paddle_webhook_fixture.psql",
        )
    )
    fixtures = fixtures.replace("pg_temp.", "paddle_reconciliation_test.")
    fixtures = fixtures.replace("create temp table actors", "create table paddle_reconciliation_test.actors")
    fixtures = fixtures.replace("create temp table catalogue_vector", "create table paddle_reconciliation_test.catalogue_vector")
    r.sql("begin; create schema paddle_reconciliation_test;\n" + fixtures + """
select paddle_reconciliation_test.catalogue_publish(paddle_reconciliation_test.catalogue(k,c))
from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
create function paddle_reconciliation_test.fixture() returns uuid language plpgsql as $$
declare u uuid:=paddle_reconciliation_test.guard_owner(); j jsonb; sid uuid; o jsonb;
begin
 update billing_runtime_policy set paddle_sales_enabled=true;
 j:=begin_paddle_checkout_v1(u,'growth','monthly',0,gen_random_uuid(),true,true,'2026-09-18','2026-09-18');
 perform mark_paddle_checkout_ready_v1(u,(j->>'attemptReference')::uuid,(j->>'operationReference')::uuid,
 'synthetic/txn/'||u,'ready','USD',jsonb_build_array(j->'base'));
 update billing_runtime_policy set paddle_sales_enabled=false,paddle_reconciliation_enabled=true;
 o:=jsonb_build_object('customerRef','synthetic/customer/'||u,'subscriptionRef','synthetic/sub/'||u);
 perform paddle_reconciliation_test.webhook_ingest(paddle_reconciliation_test.webhook_observation(
 'transaction.completed','synthetic/paid/'||u,'synthetic/paid/'||u)||o||jsonb_build_object('transactionRef','synthetic/txn/'||u));
 perform paddle_reconciliation_test.webhook_ingest(paddle_reconciliation_test.webhook_observation(
 'subscription.created','synthetic/created/'||u,'synthetic/created/'||u)||o||jsonb_build_object('transactionCorrelationRef','synthetic/txn/'||u));
 select id into sid from billing_subscriptions_v2 where provider_subscription_ref='synthetic/sub/'||u;
 return sid;
end $$;
grant usage on schema paddle_reconciliation_test to service_role;
commit;
""")

    def fixture():
        return r.sql("select paddle_reconciliation_test.fixture();")

    def reconcile(sid):
        return f"set local role service_role; select reconcile_paddle_initial_purchase_v1('{sid}');"

    def account(sid):
        return r.sql(f"select billing_account_id from billing_subscriptions_v2 where id='{sid}';")

    sid = fixture()
    r.race("two identical reconciliations", reconcile(sid), reconcile(sid))
    assert r.sql(f"select count(*) from billing_payment_applications_v2 where subscription_id='{sid}';") == "1"
    assert r.sql(f"select count(*) from account_subscriptions where billing_account_id='{account(sid)}';") == "1"

    sid = fixture()
    other = r.sql(f"""insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref,provider_status,provider_updated_at)
select billing_account_id,customer_id,provider,environment,'synthetic/competing/'||id,provider_status,provider_updated_at
from billing_subscriptions_v2 where id='{sid}' returning id;""")
    r.race("same account competing shadow has no payment authority", reconcile(sid), reconcile(other),
           "PADDLE_RECONCILIATION_SUBSCRIPTION_PROOF")

    sid = fixture()
    a, b = r.Session(), r.Session()
    try:
        a.execute(reconcile(sid))
        b.send(reconcile(sid))
        r.blocked(b)
        a.execute("rollback;")
        assert '"reused": false' in b.collect()
        b.execute("commit;")
        r.RESULTS.append({"case": "rollback then waiting retry", "result": "pass"})
    finally:
        a.close()
        b.close()

    for ls in (False, True):
        sid = fixture()
        acct = account(sid)
        canonical = f"""select billing_guard_lock('{acct}','test');
insert into account_subscriptions(billing_account_id,plan_version_id,subscription_kind,status,source)
select '{acct}',id,'paid','active','billing_provider' from commercial_plan_versions where plan_key='growth' and status='active';"""
        if ls:
            canonical += f"""
insert into billing_provider_customers(billing_account_id,provider,environment,provider_store_id,provider_customer_id)
values('{acct}','lemonsqueezy','test','96001','synthetic/ls/{sid}');
select paddle_reconciliation_test.put('billing_provider_subscriptions',
to_jsonb(b)||jsonb_build_object('id',gen_random_uuid(),'billing_account_id','{acct}',
'account_subscription_id',(select id from account_subscriptions where billing_account_id='{acct}'),
'provider_customer_id','synthetic/ls/{sid}','provider_subscription_id','synthetic/ls/{sid}',
'provider_order_id','synthetic/ls/{sid}','provider_order_item_id','synthetic/ls/{sid}',
'first_subscription_item_id','synthetic/ls/{sid}','quantity',1,'approved_additional_coach_seats',0))
from billing_provider_subscriptions b join billing_provider_variant_mappings m on m.id=b.variant_mapping_id
join commercial_plan_versions p on p.id=m.plan_version_id where p.plan_key='growth' and m.cadence='monthly' limit 1;"""
        r.race("LS canonical winner" if ls else "canonical winner", canonical, reconcile(sid), "PADDLE_RECONCILIATION_CANONICAL_CONFLICT")
        assert r.sql(f"select count(*) from billing_payment_applications_v2 where subscription_id='{sid}';") == "0"

    sid = fixture()
    acct = account(sid)
    r.race("Paddle winner excludes LS origin", reconcile(sid),
           f"select billing_guard_lock('{acct}','test'); select billing_guard_claim_canonical('{acct}',(select account_subscription_id from billing_subscriptions_v2 where id='{sid}'),'lemonsqueezy.v1');",
           "BILLING_GUARD_CANONICAL_ALREADY_OWNED")

    sid = fixture()
    duplicate = f"""select billing_guard_lock('{account(sid)}','test');
insert into billing_payment_applications_v2(provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind,checkout_id)
select provider,environment,provider_transaction_ref,billing_account_id,subscription_id,evidence_id,application_kind,checkout_id
from billing_payment_applications_v2 where subscription_id='{sid}';"""
    r.race("payment uniqueness after competing activation", reconcile(sid), duplicate, "23505")

    # Row-first callers fail NOWAIT instead of waiting backwards on the account.
    sid = fixture()
    a, b = r.Session(), r.Session()
    try:
        a.execute(f"select billing_guard_lock('{account(sid)}','test');")
        b.send(f"update billing_subscriptions_v2 set provider_status='paused' where id='{sid}';")
        b.collect("55P03")
        a.execute("rollback;")
        r.RESULTS.append({"case": "account lock order NOWAIT", "result": "pass"})
    finally:
        a.close()
        b.close()
    after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert after == before
    assert r.sql("select bool_and(approved_additional_coach_seats=0) from billing_subscriptions_v2;") == "t"
    print(json.dumps({"cases": len(r.RESULTS), "deadlocks": after-before, "providerCalls": 0}))


if __name__ == "__main__":
    main()
