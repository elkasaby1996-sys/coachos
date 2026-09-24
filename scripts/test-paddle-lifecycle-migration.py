"""Preserve two historical paid subscriptions across a local populated upgrade.

Uses only the fixed disposable reconciliation workdir/container. Existing app
databases and remote targets cannot be supplied. No private snapshots printed.
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = "20260924100007_paddle_subscription_lifecycle.sql"


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    h = load("test-paddle-reconciliation-regressions")
    auto = load("test-paddle-auto-reconciliation-concurrency")
    r = auto.r
    assert (h.WORK / "supabase/migrations" / MIGRATION).read_bytes() == (ROOT / "supabase/migrations" / MIGRATION).read_bytes(), "Synchronize disposable migration copy first"

    def data():
        tables = json.loads(r.sql("select jsonb_agg(quote_ident(tablename) order by tablename) from pg_tables where schemaname='public';"))
        queries = [f"select '{name}' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from public.{name} t" for name in tables]
        return r.sql("select jsonb_object_agg(name,digest) from (" + " union all ".join(queries) + ") q;")

    def functions():
        return json.loads(r.sql("""select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('body',pg_get_functiondef(p.oid),'acl',p.proacl))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';"""))

    try:
        h.reset("20260923220540")
        auto.setup()
        r.sql("""begin;
create temp table prior as select paddle_auto_test.auto_checkout() u from generate_series(1,2);
select paddle_auto_test.auto_ingest(u,'transaction.completed'),paddle_auto_test.auto_ingest(u,'subscription.created') from prior;
select paddle_auto_test.auto_dispatch(u,'subscription.created') from prior;
update billing_runtime_policy set paddle_reconciliation_enabled=false;
commit;""")
        assert r.sql("select count(*) from billing_subscriptions_v2 where account_subscription_id is not null;") == "2"
        assert r.sql("select count(*) from account_subscriptions a join billing_subscriptions_v2 s on s.account_subscription_id=a.id where a.current_period_started_at is null and a.current_period_ends_at is null;") == "2"
        before_data, before_functions = data(), functions()
        r.sql((ROOT / "supabase/migrations" / MIGRATION).read_text())
        assert data() == before_data, "Migration changed existing rows"
        after_functions = functions()
        changed = [name for name in before_functions if before_functions[name] != after_functions.get(name)]
        assert sorted(changed) == sorted([
            "ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)",
            "reconcile_paddle_initial_purchase_event_v1(uuid)",
            "billing_paddle_initial_link_guard_v1()",
        ]), "Unexpected existing function change"
        assert all(before_functions[name]["acl"] == after_functions[name]["acl"] for name in changed), "Existing ACL changed"
        assert r.sql("select count(*) from billing_runtime_policy where paddle_sales_enabled or paddle_reconciliation_enabled;") == "0"
        print(json.dumps(dict(existingPaidSubscriptions=2, allExistingRowsUnchanged=True, existingACLsUnchanged=True, policyDisabled=True, providerCalls=0)))
    finally:
        h.reset()


if __name__ == "__main__":
    main()
