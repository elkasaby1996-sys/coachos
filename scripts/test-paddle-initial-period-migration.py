"""Populated 179 -> 180 upgrade in the fixed disposable local DB only."""
import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = "20260928072848_paddle_initial_period_bootstrap.sql"


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    h = load("test-paddle-reconciliation-regressions")
    auto = load("test-paddle-auto-reconciliation-concurrency")
    r = auto.r
    assert (h.WORK / "supabase/migrations" / MIGRATION).read_bytes() == (ROOT / "supabase/migrations" / MIGRATION).read_bytes()

    def cli(*args):
        result = subprocess.run([h.NPX, "supabase@latest", *args, "--workdir", str(h.WORK)], capture_output=True, text=True, timeout=240)
        assert result.returncode == 0, result.stderr
        return result.stdout

    def rows():
        names = json.loads(r.sql("select jsonb_agg(quote_ident(tablename) order by tablename) from pg_tables where schemaname='public';"))
        queries = [f"select '{name}' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from public.{name} t" for name in names]
        return json.loads(r.sql("select jsonb_object_agg(name,digest) from (" + " union all ".join(queries) + ") q;"))

    def functions():
        return json.loads(r.sql("select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('body',pg_get_functiondef(p.oid),'acl',p.proacl)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';"))

    def warnings(output):
        obj = next(json.loads(line) for line in output.splitlines() if line.startswith("{"))
        return sorted(x["cacheKey"] for x in obj["results"])

    try:
        h.reset("20260927195317")
        baseline = cli("db", "advisors", "--local", "--level", "warn")
        (h.WORK / "codex41-advisors-before.log").write_text(baseline)
        auto.setup()
        for name in ("paddle_lifecycle_fixture.psql", "paddle_plan_change_fixture.psql"):
            r.sql((ROOT / "supabase/tests/fixtures" / name).read_text().replace("pg_temp.", "paddle_auto_test."))
        r.sql("""begin;
create temp table pending as select paddle_auto_test.auto_checkout('trialing') u;
select paddle_auto_test.webhook_ingest(paddle_auto_test.auto_observation(u,'transaction.completed')||'{"origin":"web","billingPeriod":{"startsAt":"2026-09-20T00:00:00Z","endsAt":"2026-10-20T00:00:00Z"}}'::jsonb) from pending;
select paddle_auto_test.auto_ingest(u,'subscription.created') from pending;
select paddle_auto_test.auto_dispatch(u,'subscription.created') from pending;
select paddle_auto_test.lifecycle_owner();
select paddle_auto_test.plan_begin(paddle_auto_test.plan_owner(),'launch');
update billing_runtime_policy set paddle_sales_enabled=false,paddle_reconciliation_enabled=false;
commit;
drop schema paddle_auto_test cascade;""")
        before_rows, before_functions = rows(), functions()
        before_acl = r.sql("select jsonb_object_agg(relname,jsonb_build_object('acl',relacl,'rls',relrowsecurity)) from pg_class where relnamespace='public'::regnamespace and relkind='r';")
        cli("migration", "up", "--local", "--yes")
        after_rows, after_functions = rows(), functions()
        assert all(after_rows[k] == v for k, v in before_rows.items()), "Existing data changed"
        assert set(after_rows) - set(before_rows) == {"billing_paddle_initial_period_bootstraps"}
        assert r.sql("select count(*) from billing_paddle_initial_period_bootstraps;") == "0", "Migration backfilled data"
        changed = [k for k in before_functions if before_functions[k] != after_functions.get(k)]
        assert changed == ["reconcile_paddle_initial_purchase_v1(uuid,text)"], changed
        assert before_functions[changed[0]]["acl"] == after_functions[changed[0]]["acl"]
        assert len(set(after_functions) - set(before_functions)) == 4
        after_acl = r.sql("select jsonb_object_agg(relname,jsonb_build_object('acl',relacl,'rls',relrowsecurity)) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname<>'billing_paddle_initial_period_bootstraps';")
        assert before_acl == after_acl, "Existing table ACL/RLS changed"
        assert r.sql("select count(*) from supabase_migrations.schema_migrations;") == "180"
        current = cli("db", "advisors", "--local", "--level", "warn")
        (h.WORK / "codex41-advisors-after.log").write_text(current)
        assert warnings(baseline) == warnings(current), "New advisor finding"
        print(json.dumps(dict(dataUnchanged=True, historicalEvidenceCompatible=True, existingACLsUnchanged=True,
                              migrationCount=180, bootstrapRecords=0, advisorWarnings=len(warnings(current)), newAdvisorWarnings=0)), flush=True)
    finally:
        h.reset()
        print("CLEAN: reconstructed 180 migrations; flags disabled", flush=True)


if __name__ == "__main__":
    main()
