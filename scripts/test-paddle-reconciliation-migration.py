"""Populated upgrade and advisor baseline proof, isolated local project only."""
import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    harness = load("test-paddle-reconciliation-regressions")
    r = load("test-billing-cross-ledger-concurrency")
    r.COMMAND[3] = harness.CONTAINER

    def snapshot():
        return json.loads(r.sql("""select jsonb_object_agg(signature,definition) from (
select p.oid::regprocedure::text signature,jsonb_build_object('body',pg_get_functiondef(p.oid),'acl',p.proacl) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') q;"""))

    def data():
        tables = json.loads(r.sql("select jsonb_agg(quote_ident(tablename) order by tablename) from pg_tables where schemaname='public';"))
        queries = [f"select '{name}' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from public.{name} t" for name in tables]
        return r.sql("select jsonb_object_agg(name,digest) from (" + " union all ".join(queries) + ") q;")

    def cli(*args):
        result = subprocess.run([harness.NPX, "supabase@latest", *args, "--workdir", str(harness.WORK)],
                                capture_output=True, text=True, timeout=240)
        assert result.returncode == 0, result.stderr
        return result.stdout

    try:
        harness.reset("20260923102850")
        baseline = cli("db", "advisors", "--local", "--level", "warn")
        (harness.WORK / "advisors-baseline.log").write_text(baseline)
        seed = (ROOT / "supabase/tests/fixtures/billing_v2_legacy_seed.psql").read_text(encoding="utf-8-sig")
        r.sql("begin;" + seed + "commit;")
        before_functions, before_data = snapshot(), data()
        cli("migration", "up", "--local", "--yes")
        after_functions, after_data = snapshot(), data()
        assert before_data == after_data, "Migration changed existing data"
        changed = [name for name in before_functions if before_functions[name] != after_functions.get(name)]
        assert changed == ["billing_v2_protect_subscription_lifecycle()"], changed
        name = changed[0]
        assert before_functions[name]["acl"] == after_functions[name]["acl"]
        assert before_functions[name]["body"].replace("array['reconciliation_status'", "array['account_subscription_id','reconciliation_status'") == after_functions[name]["body"]
        current = cli("db", "advisors", "--local", "--level", "warn")
        (harness.WORK / "advisors-upgrade.log").write_text(current)
        def warnings(text):
            obj = next(json.loads(line) for line in text.splitlines() if line.startswith("{"))
            return sorted(x["cacheKey"] for x in obj["results"])
        assert warnings(baseline) == warnings(current), "New advisor finding"
        print(json.dumps({"dataUnchanged": True, "legacyFunctionsAndACLsUnchanged": True,
                          "reviewedLifecycleChangeOnly": True, "advisorWarnings": len(warnings(current)),
                          "newAdvisorWarnings": 0, "providerCalls": 0}))
    finally:
        harness.reset()


if __name__ == "__main__":
    main()
