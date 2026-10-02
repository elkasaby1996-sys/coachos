"""PAY-03B populated upgrade proof. Dedicated disposable local DB only."""
import importlib.util
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = "20261001224659_lemon_squeezy_retirement_disposition.sql"
FUNCTION = "inspect_lemon_squeezy_retirement_disposition_v1(timestamp with time zone)"


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    harness = load("test-paddle-reconciliation-regressions")
    r = load("test-billing-cross-ledger-concurrency")
    r.COMMAND[3] = harness.CONTAINER
    # Never accepts URLs, project refs, arbitrary workdirs or containers.
    assert "project_id = 'repsync_reconciliation01'" in (harness.WORK / "supabase/config.toml").read_text()
    destination = harness.WORK / "supabase/migrations"
    assert destination.resolve().is_relative_to(harness.WORK.resolve())
    source = ROOT / "supabase/migrations"
    paths = sorted(source.glob("*.sql"))
    assert len(paths) == 185 and paths[-1].name == MIGRATION
    # The candidate is corrected in place; every reviewed predecessor is immutable.
    for path in paths[:-1]:
        original = subprocess.run(["git", "show", "HEAD:supabase/migrations/" + path.name],
                                  cwd=ROOT, capture_output=True, check=True).stdout
        assert original.replace(b"\r\n", b"\n") == path.read_bytes().replace(b"\r\n", b"\n"), path.name
    assert not ({p.name for p in destination.glob("*.sql")} - {p.name for p in source.glob("*.sql")})
    for path in source.glob("*.sql"):
        shutil.copyfile(path, destination / path.name)

    def functions():
        return json.loads(r.sql("""select jsonb_object_agg(signature,definition) from (
select p.oid::regprocedure::text signature,jsonb_build_object('body',pg_get_functiondef(p.oid),'acl',p.proacl) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') q;"""))

    def data():
        tables = json.loads(r.sql("select jsonb_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='public' or schemaname='auth' and tablename='users';"))
        queries = [f"select '{name}' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from {name} t" for name in tables]
        return r.sql("select jsonb_object_agg(name,digest) from (" + " union all ".join(queries) + ") q;")

    def authority():
        return r.sql("""select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_array(c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v')),
 'constraints',(select jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid)) order by conrelid::regclass::text,conname) from pg_constraint where connamespace='public'::regnamespace),
 'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by oid) from pg_trigger where tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace) and not tgisinternal));""")

    try:
        results = []
        for population in ("terminal", "blocked", "mixed-environment-terminal"):
            harness.reset("20261001162923")
            fixture = (ROOT / "supabase/tests/fixtures/lemon_squeezy_retirement_history.psql").read_text()
            extra = ""
            if population == "mixed-environment-terminal":
                extra = """select pg_temp.retirement_live_mappings();
update billing_runtime_policy set entitlement_environment='live';
insert into actors(name,id) values('live-terminal',pg_temp.coach('growth','monthly','live'));
select pg_temp.retirement_close(id) from actors where name='live-terminal';
update billing_runtime_policy set entitlement_environment='test';"""
            if population == "blocked":
                extra = """insert into actors(name,id) values('pending',pg_temp.coach('growth'));
select public.begin_billing_plan_change(id,'test','scale','monthly',operation,pg_temp.snapshot(id)) from actors where name='pending';
update billing_provider_webhook_deliveries set processing_status='deferred',processed_at=null,last_error_code='BILLING_RECONCILIATION_DEFERRED' where delivery_fingerprint=repeat('b',64);"""
            r.sql("begin;" + fixture + extra + "commit;")
            before_functions, before_data, before_authority = functions(), data(), authority()
            result = subprocess.run([harness.NPX, "supabase@latest", "migration", "up", "--local", "--yes", "--workdir", str(harness.WORK)], capture_output=True, text=True, timeout=240)
            assert result.returncode == 0, result.stderr
            after_functions = functions()
            assert before_data == data(), "Upgrade rewrote populated evidence/identity/history"
            assert before_authority == authority(), "Upgrade changed existing ACLs, checks or triggers"
            assert all(after_functions.get(k) == v for k, v in before_functions.items()), "Existing RPC definition/ACL changed"
            assert set(after_functions) - set(before_functions) == {FUNCTION}
            report = json.loads(r.sql("select inspect_lemon_squeezy_retirement_disposition_v1(now());"))
            assert report["safeToRetire"] == (population != "blocked"), report
            expected = dict.fromkeys(report["blockers"], 0)
            if population == "blocked":
                expected.update(subscriptions=1, planOperations=1, webhookWork=1, ambiguousDispatches=1, canonicalConflicts=1)
            assert report["blockers"] == expected, report
            assert r.sql("select count(*) from billing_plan_change_operations where status='completed';") == "1"
            assert r.sql("select count(*) from billing_seat_quantity_operations where status='completed';") == "1"
            # Reading the gate is independently proven not to mutate any row.
            assert before_data == data()
            results.append({"population": population, "dataAndIdentityHashesUnchanged": True,
                            "existingFunctionsACLsConstraintsTriggersUnchanged": True,
                            "terminalOperationsReadable": True, "report": report})
        print(json.dumps({"historicalMigrationsUnchanged": 184, "migrationCount": 185,
                          "populations": results, "providerCalls": 0}))
    finally:
        harness.reset()


if __name__ == "__main__":
    main()
