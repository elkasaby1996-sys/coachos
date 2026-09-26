"""Forward migration proof in the fixed disposable local DB; no provider IO.

Preserves populated awaiting-payment and expired accounts, all public rows and
table contracts, and every function except the two intentionally corrected.
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = "20260926195242_paddle_proration_settlement.sql"


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
    previous = max(p.name.split("_")[0] for p in (ROOT / "supabase/migrations").glob("*.sql") if p.name < MIGRATION)

    def rows():
        tables = json.loads(r.sql("select jsonb_agg(quote_ident(tablename) order by tablename) from pg_tables where schemaname='public';"))
        queries = [f"select '{name}' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from public.{name} t" for name in tables]
        return r.sql("select jsonb_object_agg(name,digest) from (" + " union all ".join(queries) + ") q;")

    def functions():
        return json.loads(r.sql("""select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
 'body',pg_get_functiondef(p.oid),'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig,'owner',p.proowner))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';"""))

    def tables():
        return r.sql("""select jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,
 'columns',(select jsonb_agg(to_jsonb(a) order by attnum) from pg_attribute a where a.attrelid=c.oid and attnum>0),
 'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid=c.oid)) order by c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';""")

    try:
        h.reset(previous)
        auto.setup()
        for name in ("paddle_lifecycle_fixture.psql", "paddle_plan_change_fixture.psql"):
            r.sql((ROOT / "supabase/tests/fixtures" / name).read_text().replace("pg_temp.", "paddle_auto_test."))
        r.sql("""begin;
 create temp table owners(label text,u uuid);
 insert into owners values('waiting',paddle_auto_test.plan_owner()),('expired',paddle_auto_test.plan_owner());
 select paddle_auto_test.plan_begin(u) from owners where label='waiting';
 select paddle_auto_test.lifecycle_dispatch(paddle_auto_test.plan_observation(u,'target')) from owners where label='waiting';
 select paddle_auto_test.lifecycle_dispatch(paddle_auto_test.lifecycle_observation(u,'cancel','subscription.updated','canceled')) from owners where label='expired';
 update billing_runtime_policy set paddle_sales_enabled=false,paddle_reconciliation_enabled=false;
 commit;""")
        assert r.sql("select count(*) from billing_operations_v2 where status='awaiting_payment';") == "1"
        assert r.sql("select count(*) from account_subscriptions where status='expired';") == "1"
        before_rows, before_functions, before_tables = rows(), functions(), tables()
        r.sql((ROOT / "supabase/migrations" / MIGRATION).read_text())
        assert rows() == before_rows, "Migration changed existing rows"
        assert tables() == before_tables, "Migration changed table contracts"
        after_functions = functions()
        assert before_functions.keys() == after_functions.keys(), "Unexpected function creation/removal"
        changed = [name for name in before_functions if before_functions[name] != after_functions[name]]
        assert sorted(changed) == sorted(["ingest_verified_paddle_event_v1(jsonb,text,text,jsonb)", "billing_paddle_plan_facts_v1(uuid,uuid,uuid)"]), "Unexpected function changes"
        for name in changed:
            assert {k: v for k, v in before_functions[name].items() if k != "body"} == {k: v for k, v in after_functions[name].items() if k != "body"}, "Function security posture changed"
        try:
            r.sql((ROOT / "supabase/migrations" / MIGRATION).read_text())
            raise AssertionError("Migration shape guard did not reject reapplication")
        except AssertionError as error:
            assert "PADDLE_PRORATION_MIGRATION_SHAPE" in str(error)
        assert rows() == before_rows and functions() == after_functions
        print(json.dumps(dict(publicRowsUnchanged=True, tableContractsUnchanged=True, changedFunctions=2, functionSecurityUnchanged=True, awaitingPaymentPreserved=True, expiredAccountPreserved=True, shapeGuardVerified=True, providerCalls=0)))
    finally:
        h.reset()


if __name__ == "__main__":
    main()
