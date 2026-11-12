"""Zero-authorization completion races in a disposable copy of local coachos.

The existing race harness observes PostgreSQL lock waits. No provider IO, remote
URL, fixture injection in staging, or override of the fixed local container.
"""
import importlib.util
import json
import subprocess
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("races", ROOT / "scripts/test-billing-cross-ledger-concurrency.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
CONTAINER = "supabase_db_coachos"
database = "method_zero_race_" + uuid.uuid4().hex
r.COMMAND[3] = CONTAINER
r.COMMAND[8] = database
r.SETUP = r.SETUP.replace("billing_db02_test", "method_zero_test")


def docker(args, data=None):
    return subprocess.run(["docker", "exec", "-i", CONTAINER, *args], input=data,
                          text=True, capture_output=True, check=True, timeout=120).stdout


def main():
    created = False
    try:
        dump = docker(["pg_dump", "-U", "supabase_admin", "-d", "postgres"])
        docker(["createdb", "-U", "supabase_admin", "-O", "postgres", "-T", "template0", database])
        created = True
        docker(["psql", "-U", "supabase_admin", "-d", database, "-X", "-q", "-v", "ON_ERROR_STOP=1"], dump)
        assert r.sql("select count(*) from auth.users;") == "0", "Start with the reset local DB"
        before = r.sql("select deadlocks from pg_stat_database where datname=current_database();")
        fixtures = "\n".join((ROOT / "supabase/tests/fixtures" / (name + ".psql")).read_text() for name in (
            "billing_catalogue_fixture", "billing_v2_legacy_seed", "billing_cross_ledger_helpers",
            "paddle_webhook_fixture", "paddle_auto_reconciliation_fixture", "paddle_lifecycle_fixture",
            "paddle_plan_change_fixture", "paddle_seat_fixture", "paddle_recovery_fixture"))
        fixtures = "\n".join(line for line in fixtures.splitlines() if not line.startswith("\\ir "))
        helper = (ROOT / "supabase/tests/payment_method_zero_authorization.sql").read_text().split("create function pg_temp.zero_method", 1)[1].split("create temp table zero_cases", 1)[0]
        fixtures += "\ncreate function pg_temp.zero_method" + helper
        fixtures = fixtures.replace("pg_temp.", "method_zero_test.")
        fixtures = fixtures.replace("create temp table actors", "create table method_zero_test.actors")
        fixtures = fixtures.replace("create temp table catalogue_vector", "create table method_zero_test.catalogue_vector")
        r.sql("begin; create schema method_zero_test;" + fixtures + "\ngrant usage on schema method_zero_test to service_role; commit;")

        def setup(attach=True):
            owner = r.sql("select method_zero_test.plan_owner();")
            prep = json.loads(r.sql(f"select begin_billing_payment_method_preparation_v1('{owner}');"))["preparationId"]
            tx = "txn_" + uuid.uuid4().hex[:26]
            r.sql(f"select claim_billing_payment_method_dispatch_v1('{owner}','{prep}','{'a'*64}');")
            attach_sql = f"set local role service_role; select record_billing_payment_method_preparation_result_v1('{owner}','{prep}','{'a'*64}','{tx}','paddle-payment-method-transaction-v1','{'b'*64}');"
            if attach:
                r.sql("begin;" + attach_sql + "commit;")
            attempts = json.dumps([dict(attemptReference="local/verify", amount="0", status="authorized")])
            event = r.sql(f"select method_zero_test.recovery_ingest(method_zero_test.zero_method('{owner}','{tx}','race','{attempts}'::jsonb));")
            return owner, prep, tx, event, attach_sql

        def complete(event):
            return f"set local role service_role; select reconcile_billing_payment_method_preparation_v1('{event}');"

        def verify(prep, tx, event):
            assert r.sql(f"select count(*) from billing_payment_method_preparations_v2 where id='{prep}' and status='completed' and terminal_event_id='{event}' and completion_application_id is null;") == "1"
            assert r.sql(f"select count(*) from billing_webhook_events_v2 where id='{event}' and processing_status='processed';") == "1"
            assert r.sql(f"select count(*) from billing_payment_applications_v2 where provider_transaction_ref='{tx}';") == "0"

        owner, prep, tx, event, _ = setup()
        r.race("duplicate zero-authorization completion", complete(event), complete(event))
        verify(prep, tx, event)
        for completion_first in (False, True):
            owner, prep, tx, event, _ = setup()
            begin = f"set local role service_role; select begin_billing_payment_method_preparation_v1('{owner}');"
            first, second = (complete(event), begin) if completion_first else (begin, complete(event))
            r.race("explicit retry racing completion " + str(completion_first), first, second)
            verify(prep, tx, event)
            assert r.sql(f"select count(*) from billing_payment_method_preparations_v2 where created_by_user_id='{owner}';") == ("2" if completion_first else "1")
        owner, prep, tx, event, attachment = setup(False)
        # The transaction reference is not visible until attachment commits.
        # Concurrent delivery correctly returns not_applicable without a lock;
        # the original attachment already reconciles the retained signed event.
        a, b = r.Session(), r.Session()
        try:
            a.execute(attachment)
            assert "not_applicable" in b.execute(complete(event))
            b.execute("commit;")
            a.execute("commit;")
        finally:
            a.close()
            b.close()
        print("PASS: uncommitted attachment snapshot miss retains exact completion", flush=True)
        verify(prep, tx, event)
        # Execute the exact hosted runner's read/lock/reconcile SQL locally too,
        # rather than only mocking its HTTP transport in unit tests.
        owner, prep, tx, event, _ = setup()
        original = r.sql("select method_zero_test.plan_owner();")
        r.sql(f"update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{{}}'::jsonb)||'{{\"repsync_sandbox_fixture\":\"payment-method-v1\"}}'::jsonb where id='{owner}';")
        script = """import {methodFixtureQuery,methodReconcileQuery} from './scripts/staging-payment-method-patch.mjs';
import {protectedOwnerQuery} from './scripts/staging-payment-method-fixture.mjs';
const [owner,original,event,fingerprint]=process.argv.slice(1);
console.log(JSON.stringify({fixture:methodFixtureQuery(owner),original:protectedOwnerQuery(original),
repair:methodReconcileQuery(owner,original,fingerprint,event)}));"""

        def queries(fingerprint):
            return json.loads(subprocess.run(["node", "--no-warnings", "--experimental-transform-types", "--input-type=module", "-e", script,
                owner, original, event, fingerprint], cwd=ROOT, text=True, capture_output=True, check=True, timeout=30).stdout)

        def record(query):
            return json.loads(r.sql("select to_jsonb(q) from (" + query.rstrip().rstrip(";") + ") q;"))

        q = queries("a"*64)
        preserved = record(q["original"])
        q = queries(preserved["fingerprint"])
        fixture_before = record(q["fixture"])
        assert fixture_before["events"] == 1 and fixture_before["payments"] == 1, fixture_before
        r.sql(q["repair"])
        fixture_after = record(q["fixture"])
        assert fixture_after["verified_completions"] == 1
        assert fixture_after["payment_fingerprint"] == fixture_before["payment_fingerprint"]
        assert record(q["original"]) == preserved
        verify(prep, tx, event)
        print("PASS: exact reviewed fixture SQL preserves original and financial rows", flush=True)
        after = r.sql("select deadlocks from pg_stat_database where datname=current_database();")
        assert before == after
        print(json.dumps(dict(cases=5, deadlocks=0, providerCalls=0)))
    finally:
        if created:
            docker(["dropdb", "-U", "supabase_admin", "--force", database])


if __name__ == "__main__":
    main()
