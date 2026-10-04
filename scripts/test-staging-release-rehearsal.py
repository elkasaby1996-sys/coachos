"""PAY-05B populated, fixed disposable LOCAL Supabase rehearsal. No remote IO.

Uses the existing reconciliation harness/container, never the application DB.
Exports only source-bound database contract digests, counts and safe outcomes.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(tempfile.gettempdir()) / "repsync-paddle-reconciliation01"
CONTAINER = "supabase_db_repsync_reconciliation01"


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def node(code, value=None):
    result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT,
                            input=None if value is None else json.dumps(value), capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, "Local source contract check failed"
    return json.loads(result.stdout)


def main():
    assert WORK.resolve() == (Path(tempfile.gettempdir()) / "repsync-paddle-reconciliation01").resolve()
    local_config = (WORK / "supabase/config.toml").read_text()
    assert "project_id = 'repsync_reconciliation01'" in local_config
    binary = Path(os.environ["PAY05_LOCAL_SUPABASE_CLI"])
    assert binary.is_absolute() and binary.is_file() and binary.name == "supabase.exe"
    version = subprocess.run([str(binary), "--version"], capture_output=True, text=True, timeout=30)
    assert version.returncode == 0 and version.stdout.strip() == "2.109.1", "Pinned local CLI required"
    h = load("test-paddle-reconciliation-regressions")
    r = load("test-billing-cross-ledger-concurrency")
    r.COMMAND[3] = CONTAINER
    os.environ["PAY03B_SUPABASE_LOCAL_CLI"] = str(binary)
    for key in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "ALLOW_REMOTE_SUPABASE"):
        os.environ.pop(key, None)
    identity = node('import {releaseIdentity} from "./scripts/staging-release-artifacts.mjs"; const i=releaseIdentity();console.log(JSON.stringify({frozenPayloadCommit:i.payload.frozenCommit,manifest:i.manifest}));')
    inventory_sql = node('import {INVENTORY_QUERY} from "./scripts/billing-retirement-remote-inventory.mjs";console.log(JSON.stringify(INVENTORY_QUERY));')
    artifacts = []

    def facts():
        return json.loads(r.sql(inventory_sql))

    def contract(f):
        return node('import {databaseContract} from "./scripts/staging-release-observation.mjs";let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(databaseContract(JSON.parse(s))));', f)

    def data():
        tables = json.loads(r.sql("select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public';"))
        query = node('import {historyQuery} from "./scripts/staging-release-observation.mjs";let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(historyQuery(JSON.parse(s))));', tables)
        return json.loads(r.sql(query))

    def cli(directory, *args):
        result = subprocess.run([str(binary), *args, "--local", "--workdir", str(directory)], capture_output=True, text=True, timeout=240)
        (WORK / "pay05-cli.log").write_text(result.stdout + result.stderr)
        assert result.returncode == 0, "Bounded local CLI failed; private local log retained"
        return result.stdout + "\n" + result.stderr

    def bounded(stage):
        artifact = node('import {releaseIdentity,disposableArtifact} from "./scripts/staging-release-artifacts.mjs";const a=disposableArtifact(process.cwd(),releaseIdentity(),"' + stage + '");console.log(JSON.stringify({directory:a.directory,target:a.artifact.target}));')
        directory = Path(artifact["directory"])
        assert directory.parent.resolve() == Path(tempfile.gettempdir()).resolve() and directory.name.startswith("repsync-release-")
        artifacts.append(directory)
        (directory / "supabase/config.toml").write_text(local_config)
        start = {"baseline": 180, "retirement": 184, "activation": 185}[stage]
        assert facts()["versions"] == [m["filename"][:14] for m in identity["manifest"]["migrations"]["approved"][:start]]
        dry_run = cli(directory, "db", "push", "--dry-run")
        pending = [m["filename"] for m in identity["manifest"]["migrations"]["approved"][start:artifact["target"]]]
        node('import {validateDryRun} from "./scripts/billing-retirement-release.mjs";let s="";for await(const c of process.stdin)s+=c;const p=JSON.parse(s);validateDryRun(p.output,p.migrations);console.log(JSON.stringify(true));', {"output": dry_run, "migrations": pending})
        cli(directory, "db", "push", "--yes")
        assert int(r.sql("select count(*) from supabase_migrations.schema_migrations;")) == artifact["target"]

    try:
        for m in identity["manifest"]["migrations"]["approved"]:
            shutil.copyfile(ROOT / "supabase/migrations" / m["filename"], WORK / "supabase/migrations" / m["filename"])
        h.reset("20260928072848")
        print("PASS local exact migration 180 reconstruction", flush=True)
        auto = load("test-paddle-auto-reconciliation-concurrency")
        auto.r.COMMAND[3] = CONTAINER
        auto.setup()
        r.sql("""begin;
select paddle_auto_test.coach('growth') from generate_series(1,6);
create temp table cohort as select paddle_auto_test.auto_checkout() u union all select paddle_auto_test.auto_checkout('trialing');
select paddle_auto_test.webhook_ingest(paddle_auto_test.auto_observation(u,'transaction.completed')||'{"origin":"web","billingPeriod":{"startsAt":"2026-09-20T00:00:00Z","endsAt":"2026-10-20T00:00:00Z"}}'::jsonb),paddle_auto_test.auto_ingest(u,'subscription.created') from cohort;
select paddle_auto_test.auto_dispatch(u,'subscription.created') from cohort;
update billing_runtime_policy set paddle_sales_enabled=false,paddle_reconciliation_enabled=false;
commit;
drop schema paddle_auto_test cascade;""")
        shape = json.loads(r.sql("select jsonb_build_object('lsPaid',(select count(*) from billing_provider_subscriptions),'paddlePaid',(select count(*) from billing_subscriptions_v2),'payments',(select count(*) from billing_payment_applications_v2),'canceledTrials',(select count(*) from account_subscriptions where subscription_kind='trial' and status='canceled'),'webhooks',(select count(*) from billing_webhook_events_v2));"))
        print(json.dumps({"populatedShape": shape}), flush=True)
        # The existing legacy seed also supplies ten retained actors. Preserve
        # those instead of deleting fixture history to match a remote row count.
        assert shape["lsPaid"] == 16 and shape["paddlePaid"] == 2 and shape["payments"] == 2 and shape["canceledTrials"] == 1 and shape["webhooks"] >= 4
        before = data()
        checkpoints = {"180": {"digest": contract(facts())}}
        bounded("baseline")
        after = data()
        assert all(after[k] == v for k, v in before.items()), "Baseline rewrote retained history"
        assert r.sql("select count(*) from billing_payment_method_preparations_v2;") == "0"
        assert r.sql("select relrowsecurity from pg_class where oid='billing_payment_method_preparations_v2'::regclass;") == "t"
        assert r.sql("select has_table_privilege('authenticated','billing_payment_method_preparations_v2','SELECT');") == "f"
        assert r.sql("select to_regprocedure('public.billing_workflow_provider_v1(uuid)') is null;") == "t"
        checkpoints["184"] = {"digest": contract(facts())}
        print("PASS bounded 181-184, empty preparation table, private ACL/RLS, retained rows unchanged", flush=True)
        work_sql = node('import {workQuery} from "./scripts/staging-release-observation.mjs";console.log(JSON.stringify(workQuery(true)));')
        actual_work = json.loads(r.sql("select to_jsonb(w) from (" + work_sql + ") w;"))
        assert actual_work["scheduled"]["invalidBoundaries"] == 0
        # Exercise the actual aggregate against mixed future, NULL and infinite
        # boundaries. MIN alone silently ignores the NULL row.
        aggregate = work_sql.split(") work, (select ", 1)[1].split(" from (", 1)[0]
        mixed = json.loads(r.sql("select " + aggregate + " from (values ('2099-01-01'::timestamptz),(null::timestamptz),('infinity'::timestamptz)) s(effective_at);"))
        assert mixed["count"] == 3 and mixed["invalidBoundaries"] == 2
        node('import {assertScheduled} from "./scripts/staging-release-contracts.mjs";import assert from "node:assert/strict";let s="";for await(const c of process.stdin)s+=c;assert.throws(()=>assertScheduled({facts:{scheduled:JSON.parse(s)}},{operational:{scheduledOperationsCount:3},expiresAt:"2098-01-01T00:00:00Z"}),/SCHEDULED_BOUNDARY/);console.log("true");', mixed)
        # Round-trip full local ledger rows through an isolated temporary SQL
        # table, never the real ledger. No backup file or remote restore occurs.
        connection = node('''
import {captureBackupLedger} from "./scripts/staging-logical-backup.mjs";
import assert from "node:assert/strict";
const staging="a".repeat(20), stop=new Error("local_options_only");
let captured;
try {
  captureBackupLedger("ledger-before", {
    STAGING_SUPABASE_PROJECT_REF:staging, PRODUCTION_SUPABASE_PROJECT_REF:"b".repeat(20),
    CONFIRM_PROJECT_REF:staging, EVIDENCE_LABEL:"local-contract", GITHUB_SHA:"c".repeat(40),
    STAGING_SUPABASE_DB_URL:`postgres://postgres:synthetic@db.${staging}.supabase.co:5432/postgres`,
    GITHUB_ACTIONS:"true", GITHUB_REF:"refs/heads/main", GITHUB_WORKFLOW:"Supabase Staging Logical Backup",
    PGHOSTADDR:"192.0.2.1", PGSERVICE:"unwanted", PGSERVICEFILE:"unwanted",
  }, "unused", (command,args,options)=>{
    assert.equal(command,"psql");
    for(const key of ["PGHOSTADDR","PGSERVICE","PGSERVICEFILE"]) assert.equal(Object.hasOwn(options.env,key),false);
    captured={args,env:Object.fromEntries(["PGDATABASE","PGPORT","PGUSER","PGSSLMODE","PGCLIENTENCODING","PGOPTIONS","PGCONNECT_TIMEOUT"].map(key=>[key,options.env[key]]))};
    throw stop;
  });
} catch(error) { assert.equal(error,stop); }
assert.ok(captured);console.log(JSON.stringify(captured));
''')
        probe_command = ["docker", "exec", "-i", "-e", "PGHOST=/var/run/postgresql"]
        for key, value in connection["env"].items():
            probe_command.extend(["-e", key + "=" + value])
        probe_command.extend([CONTAINER, "psql", *connection["args"]])
        probe = subprocess.run(probe_command, input="select current_database(), current_setting('default_transaction_read_only');", capture_output=True, text=True, timeout=40)
        assert probe.returncode == 0 and probe.stdout.strip() == "postgres|on", "Private ledger capture connection contract failed"
        ledger_sql = node('import {LEDGER_QUERY} from "./scripts/staging-backup-ledger.mjs";console.log(JSON.stringify(LEDGER_QUERY));')
        ledger_rows = json.loads(r.sql(ledger_sql))
        escaped = json.dumps(ledger_rows).replace("'", "''")
        restored_rows = json.loads(r.sql("begin; create temp table pay05_ledger_roundtrip (like supabase_migrations.schema_migrations including all) on commit drop; insert into pay05_ledger_roundtrip select * from jsonb_populate_recordset(null::pay05_ledger_roundtrip,'" + escaped + "'::jsonb); select jsonb_agg(to_jsonb(m) order by version) from pay05_ledger_roundtrip m; rollback;"))
        node('import {verifyRestoredLedger} from "./scripts/staging-backup-ledger.mjs";import assert from "node:assert/strict";let s="";for await(const c of process.stdin)s+=c;const p=JSON.parse(s),binding={commit:p.commit,projectSha256:"a".repeat(64)},stamp=new Date().toISOString();const bytes=Buffer.from(JSON.stringify({schemaVersion:1,executionCommit:binding.commit,projectSha256:binding.projectSha256,startedAt:stamp,completedAt:stamp,rows:p.before}));assert.equal(verifyRestoredLedger(bytes,p.after,binding).ledgerCount,184);p.after[0].statements=["-- altered historical statement"];assert.throws(()=>verifyRestoredLedger(bytes,p.after,binding),/RESTORED_LEDGER_MISMATCH/);console.log("true");', {"before": ledger_rows, "after": restored_rows, "commit": identity["frozenPayloadCommit"]})
        assert data() == after, "Recovery verification changed retained history"
        print("PASS mixed scheduled-boundary rejection, private psql contract and full ledger SQL round-trip/tamper rejection", flush=True)
        # Containment has no database runtime. Exact static source is tested by the JS suites.
        bounded("retirement")
        f185 = facts()
        result = node('import {assertRetiredDatabaseAuthority} from "./scripts/billing-retirement-release.mjs";import {readFileSync} from "node:fs";let s="";for await(const c of process.stdin)s+=c;assertRetiredDatabaseAuthority(JSON.parse(s).functions,JSON.parse(readFileSync("supabase/tests/fixtures/lemon_squeezy_retired_functions.json")));console.log(JSON.stringify(true));', f185)
        retained185 = data()
        assert result and all(retained185[k] == v for k, v in before.items())
        checkpoints["185"] = {"digest": contract(f185)}
        print("PASS bounded 185 direct/indirect authority retirement, retained history", flush=True)
        bounded("activation")
        f186 = facts()
        retained186 = data()
        assert all(retained186[k] == v for k, v in before.items()), "Activation rewrote retained history"
        assert r.sql("select to_regprocedure('public.billing_workflow_provider_v1(uuid)') is not null;") == "t"
        assert r.sql("select has_function_privilege('authenticated','public.billing_workflow_provider_v1(uuid)','EXECUTE');") == "f"
        checkpoints["186"] = {"digest": contract(f186)}
        manifest_digest = node('import {hash} from "./scripts/billing-retirement-release.mjs";let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(hash(JSON.stringify(JSON.parse(s)))));', identity["manifest"])
        # Fixed partial-baseline recovery contracts. Reset is disposable LOCAL only;
        # no migration-ledger repair or arbitrary remote target is introduced.
        for count, version in ((181, "20260929073334"), (182, "20260930201815"), (183, "20261001063502")):
            h.reset(version)
            checkpoints[str(count)] = {"digest": contract(facts())}
        output = {"schemaVersion": 2, "frozenPayloadCommit": identity["frozenPayloadCommit"], "manifestDigest": manifest_digest, "checkpoints": checkpoints}
        path = ROOT / "config/staging-release-checkpoints.json"
        if path.exists():
            assert json.loads(path.read_text()) == output, "Reviewed checkpoint fixture drift; never silently replace"
        else:
            path.write_text(json.dumps(output, indent=2) + "\n")
        print(json.dumps({"migrationCount": 186, "retainedShape": shape, "retainedHistoryUnchanged": True, "authorityRetired": True, "providerBoundaryPresent": True, "remoteRequests": 0, "providerRequests": 0}), flush=True)
    finally:
        for directory in artifacts:
            assert directory.parent.resolve() == Path(tempfile.gettempdir()).resolve() and directory.name.startswith("repsync-release-")
            shutil.rmtree(directory)
        h.reset()
        print("CLEAN local disposable database reconstructed at 186, flags disabled", flush=True)


if __name__ == "__main__":
    main()
