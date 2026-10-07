"""Offline cold-install proof in the FIXED disposable reconciliation container.

No remote URLs/targets accepted. Never touches the application container.
The caller must supply the already cached CLI 2.109.1; nothing is downloaded.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import sys

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(tempfile.gettempdir()) / "repsync-paddle-reconciliation01"
CONTAINER = "supabase_db_repsync_reconciliation01"


def node(code, value=None):
    result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT,
                            input=None if value is None else json.dumps(value), capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def main():
    assert WORK.resolve().parent == Path(tempfile.gettempdir()).resolve()
    config = (WORK / "supabase/config.toml").read_text()
    assert "project_id = 'repsync_reconciliation01'" in config and "enabled = false" in config
    binary = Path(os.environ["PAY05_LOCAL_SUPABASE_CLI"])
    assert binary.is_absolute() and binary.is_file() and binary.name == "supabase.exe"
    for key in list(os.environ):
        if key.startswith(("SUPABASE_", "STAGING_", "PRODUCTION_", "PADDLE_", "LEMON_")) or key == "ALLOW_REMOTE_SUPABASE":
            os.environ.pop(key, None)
    os.environ.update(SUPABASE_TELEMETRY_DISABLED="1", DO_NOT_TRACK="1", SUPABASE_NO_KEYRING="1", SUPABASE_SKIP_UPDATE_CHECK="true")
    assert subprocess.run([str(binary), "--version"], capture_output=True, text=True, timeout=30).stdout.strip() == "2.109.1"
    spec = importlib.util.spec_from_file_location("local_db", ROOT / "scripts/test-billing-cross-ledger-concurrency.py")
    db = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(db)
    db.COMMAND[3] = CONTAINER
    identity = node('import {releaseIdentity} from "./scripts/staging-release-artifacts.mjs"; console.log(JSON.stringify(releaseIdentity()));')
    inventory = node('import {INVENTORY_QUERY} from "./scripts/billing-retirement-remote-inventory.mjs"; console.log(JSON.stringify(INVENTORY_QUERY));')
    checkpoints = json.loads((ROOT / "config/staging-release-checkpoints.json").read_text())
    assert sys.argv[1:] in ([], ["--record-local-profiles"])
    record = sys.argv[1:] == ["--record-local-profiles"]
    profile_path = ROOT / "config/staging-bootstrap-database.json"
    profiles = json.loads(profile_path.read_text())
    catalog_sql = node('import {BOOTSTRAP_CATALOG_QUERY} from "./scripts/staging-bootstrap-database.mjs";console.log(JSON.stringify(BOOTSTRAP_CATALOG_QUERY));')
    seeds_sql = node('import {BOOTSTRAP_SEEDS_QUERY} from "./scripts/staging-bootstrap-database.mjs";console.log(JSON.stringify(BOOTSTRAP_SEEDS_QUERY));')

    def probe_sql(statement):
        prior = db.COMMAND[6]
        try:
            db.COMMAND[6] = "supabase_admin"
            return db.sql(statement)
        finally:
            db.COMMAND[6] = prior

    def proof(count):
        value = json.loads(db.sql(catalog_sql))
        assert value.pop("platformComplete") is True, "Platform row proof incomplete"
        if count == 180:
            value["seedDigest"] = db.sql(seeds_sql)
        if record:
            prefix = catalog_sql.split("select jsonb_build_object('catalogDigest'")[0]
            (WORK / f"bootstrap-catalog-{count}.json").write_text(db.sql(prefix + "select jsonb_agg(jsonb_build_array(kind,name,definition) order by kind,name,definition::text) from objects;"))
            (WORK / f"bootstrap-platform-{count}.json").write_text(db.sql(prefix + "select jsonb_agg(to_jsonb(p) order by name) from platform p;"))
            profiles["checkpoints"][str(count)] = value
            profile_path.write_text(json.dumps(profiles, indent=2) + "\n")
        node('import {assertDatabaseProof} from "./scripts/staging-bootstrap-database.mjs";let s="";for await(const c of process.stdin)s+=c;const v=JSON.parse(s);assertDatabaseProof(v.proof,v.count);console.log("true");', {"proof":value,"count":count})
        return value

    directories = []
    timings = {}

    def cli(directory, *args):
        started = time.monotonic()
        result = subprocess.run([str(binary), *args, "--local", "--workdir", str(directory)], capture_output=True, text=True, timeout=600)
        (WORK / "bootstrap-local-cli.log").write_text(result.stdout + result.stderr)
        assert result.returncode == 0, "Local CLI failed; inspect disposable bootstrap-local-cli.log"
        return result.stdout + "\n" + result.stderr, time.monotonic() - started

    def local_artifact(stage):
        code = ('import {releaseIdentity,disposableArtifact} from "./scripts/staging-release-artifacts.mjs";'
                'import {disposableBootstrap} from "./scripts/staging-bootstrap-artifacts.mjs";'
                'const i=releaseIdentity(); const a=' +
                ('disposableBootstrap(process.cwd(),i)' if stage == "bootstrap" else 'disposableArtifact(process.cwd(),i,"' + stage + '")') +
                ';console.log(JSON.stringify({directory:a.directory}));')
        directory = Path(node(code)["directory"])
        assert directory.parent.resolve() == Path(tempfile.gettempdir()).resolve()
        assert directory.name.startswith(("repsync-bootstrap-", "repsync-release-"))
        directories.append(directory)
        # Local-only connection configuration; generated copies, never canonical.
        (directory / "supabase/config.toml").write_text(config)
        return directory

    def observation():
        facts = json.loads(db.sql(inventory))
        tables = [t["name"] for t in facts["tables"]]
        history_sql = node('import {historyQuery} from "./scripts/staging-release-observation.mjs"; let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(historyQuery(JSON.parse(s))));', tables)
        facts["history"] = json.loads(db.sql(history_sql))
        work_sql = node('import {workQuery} from "./scripts/staging-release-observation.mjs"; let s="";for await(const c of process.stdin)s+=c; const t=JSON.parse(s);console.log(JSON.stringify(workQuery(t.includes("billing_payment_method_preparations_v2"),t)));', tables)
        work = json.loads(db.sql("select to_jsonb(w) from (" + work_sql + ") w;"))
        facts.update(work=work["work"], scheduled=work["scheduled"])
        facts["webhookHistory"] = node('import {classifyWebhookHistory} from "./scripts/staging-release-webhook-history.mjs";import {EMPTY_WEBHOOK_REVIEW} from "./scripts/staging-release-observation.mjs";let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(classifyWebhookHistory(JSON.parse(s),EMPTY_WEBHOOK_REVIEW)));', work["webhook_history"])
        facts["contractDigest"] = node('import {databaseContract} from "./scripts/staging-release-observation.mjs";let s="";for await(const c of process.stdin)s+=c;console.log(JSON.stringify(databaseContract(JSON.parse(s))));', facts)
        return {"facts": facts, "functions": []}

    try:
        empty = Path(tempfile.mkdtemp(prefix="repsync-bootstrap-empty-"))
        directories.append(empty)
        (empty / "supabase/migrations").mkdir(parents=True)
        (empty / "supabase/config.toml").write_text(config)
        cli(empty, "db", "reset", "--yes", "--no-seed")
        empty_sql = node('import {EMPTY_DATABASE_QUERY} from "./scripts/staging-bootstrap-observation.mjs";console.log(JSON.stringify(EMPTY_DATABASE_QUERY));')
        facts = json.loads(db.sql(empty_sql))
        ledger_sql = node('import {EMPTY_LEDGER_QUERY} from "./scripts/staging-bootstrap-observation.mjs";console.log(JSON.stringify(EMPTY_LEDGER_QUERY));')
        facts["databaseProof"] = proof(0)
        facts["versions"] = json.loads(db.sql(ledger_sql)) if facts["ledgerPresent"] else []
        node('import {assertEmptySnapshot} from "./scripts/staging-bootstrap-observation.mjs";let s="";for await(const c of process.stdin)s+=c;assertEmptySnapshot({facts:JSON.parse(s),functions:[]});console.log("true");', facts)
        for statement in (
            "create table extensions.imported_history(id int); insert into extensions.imported_history values(1);",
            "create table auth.imported_history(id int); insert into auth.imported_history values(1);",
            "create schema if not exists supabase_migrations;create table supabase_migrations.imported_history(id int); insert into supabase_migrations.imported_history values(1);",
            "create schema if not exists supabase_migrations;create type supabase_migrations.imported_type as enum ('unexpected');",
            "create schema if not exists supabase_migrations;create function supabase_migrations.imported_function() returns integer language sql as 'select 1';",
            "create cast (text as uuid) with inout as implicit;",
            "create type public.onboarding_source as enum ('imported');",
            "alter table auth.identities disable trigger all;",
        ):
            altered = json.loads(probe_sql("begin;" + statement + catalog_sql + "rollback;"))
            assert altered["catalogDigest"] != facts["databaseProof"]["catalogDigest"], "Hidden object/type was admitted"
        altered = json.loads(probe_sql("begin;insert into auth.schema_migrations(version) values('pay05-local-probe');" + catalog_sql + "rollback;"))
        assert altered["catalogDigest"] == facts["databaseProof"]["catalogDigest"]
        assert altered["platformDigest"] != facts["databaseProof"]["platformDigest"], "Unexpected platform rows were admitted"
        altered = json.loads(probe_sql("begin;update _realtime.tenants set id=gen_random_uuid(),updated_at=updated_at+interval '1 second';update _realtime.extensions set id=gen_random_uuid(),updated_at=updated_at+interval '1 second';" + catalog_sql + "rollback;"))
        assert altered["platformDigest"] == facts["databaseProof"]["platformDigest"], "Generated managed startup fields were not normalized"
        for statement in (
            "update _realtime.tenants set max_concurrent_users=max_concurrent_users+1;",
            "set local session_replication_role=replica;update _realtime.extensions set tenant_external_id='unrelated-local';set local session_replication_role=origin;",
        ):
            altered = json.loads(probe_sql("begin;" + statement + catalog_sql + "rollback;"))
            assert altered["catalogDigest"] == facts["databaseProof"]["catalogDigest"]
            assert altered["platformDigest"] != facts["databaseProof"]["platformDigest"], "Managed state/relationship change was admitted"
        print("PASS local rollback probes: hidden extension/auth data and standalone enum rejected", flush=True)
        print("PASS cold local database: no application objects, users, storage or migration rows", flush=True)
        before = None
        for stage, start, end in (("bootstrap", 0, 180), ("baseline", 180, 184), ("retirement", 184, 185), ("activation", 185, 186)):
            directory = local_artifact(stage)
            dry, _ = cli(directory, "db", "push", "--dry-run")
            pending = [m["filename"] for m in identity["manifest"]["migrations"]["approved"][start:end]]
            node('import {validateDryRun} from "./scripts/billing-retirement-release.mjs";let s="";for await(const c of process.stdin)s+=c;const p=JSON.parse(s);validateDryRun(p.output,p.pending);console.log("true");', {"output": dry, "pending": pending})
            _, timings[stage] = cli(directory, "db", "push", "--yes")
            current = observation()
            assert current["facts"]["versions"] == [m["filename"][:14] for m in identity["manifest"]["migrations"]["approved"][:end]]
            assert current["facts"]["contractDigest"] == checkpoints["checkpoints"][str(end)]["digest"], "Cold schema contract mismatch"
            assert current["facts"]["policy"]["sales"] is False and current["facts"]["policy"]["reconciliation"] is False
            assert all(v == 0 for v in current["facts"]["work"].values())
            assert current["facts"]["scheduled"]["count"] == 0
            if stage == "bootstrap":
                current["facts"]["databaseProof"] = proof(180)
                altered = json.loads(probe_sql("begin;update supabase_migrations.schema_migrations set name='unexpected-name' where version=(select min(version) from supabase_migrations.schema_migrations);" + catalog_sql + "rollback;"))
                assert altered["platformDigest"] != current["facts"]["databaseProof"]["platformDigest"], "Changed ledger metadata was admitted"
                node('import {verifyBootstrapCheckpoint} from "./scripts/staging-bootstrap-contracts.mjs";let s="";for await(const c of process.stdin)s+=c;const p=JSON.parse(s);console.log(JSON.stringify(verifyBootstrapCheckpoint(p.o,p.i,p.c)));', {"o": current, "i": identity, "c": checkpoints})
                seed_changes = (
                    "update public.commercial_features set display_name='Changed seed' where feature_key=(select min(feature_key) from public.commercial_features);",
                    "update public.billing_runtime_policy set entitlement_environment='live' where id=1;",
                    "update public.commercial_plan_versions set monthly_price_minor=monthly_price_minor+1 where plan_key='growth';",
                    "update public.commercial_addon_versions set monthly_unit_amount_minor=monthly_unit_amount_minor+1;",
                    "update public.commercial_trial_policy_versions set feature_plan_version_id=(select id from public.commercial_plan_versions where plan_key='scale' and version=1);",
                    "update public.commercial_plan_feature_entitlements set configuration='{\"unexpected\":true}'::jsonb;",
                    "update public.commercial_plan_versions set effective_at=effective_at+interval '1 day' where plan_key='growth';",
                    "delete from public.commercial_features where feature_key=(select min(feature_key) from public.commercial_features);",
                    "alter table public.commercial_plan_feature_entitlements drop constraint commercial_plan_feature_entitlements_pkey;insert into public.commercial_plan_feature_entitlements select * from public.commercial_plan_feature_entitlements limit 1;",
                )
                for statement in seed_changes:
                    altered = probe_sql("begin;set local session_replication_role=replica;" + statement + "set local session_replication_role=origin;" + seeds_sql + "rollback;")
                    assert altered != current["facts"]["databaseProof"]["seedDigest"], "Noncanonical seed was admitted"
                altered = json.loads(probe_sql("begin;alter type public.onboarding_source add value 'unexpected';" + catalog_sql + "rollback;"))
                assert altered["catalogDigest"] != current["facts"]["databaseProof"]["catalogDigest"], "Changed enum labels were admitted"
                print("PASS local rollback probes: all six reference tables, effective date and enum labels rejected", flush=True)
                before = current["facts"]["history"]
            else:
                assert all(current["facts"]["history"][k] == v for k, v in before.items()), "Cold reference/history state changed unexpectedly"
            if end == 184:
                assert db.sql("select relrowsecurity and not has_table_privilege('authenticated',oid,'SELECT') from pg_class where oid='billing_payment_method_preparations_v2'::regclass;") == "t"
            if end >= 185:
                node('import {assertRetiredDatabaseAuthority} from "./scripts/billing-retirement-release.mjs";import {readFileSync} from "node:fs";let s="";for await(const c of process.stdin)s+=c;assertRetiredDatabaseAuthority(JSON.parse(s),JSON.parse(readFileSync("supabase/tests/fixtures/lemon_squeezy_retired_functions.json")));console.log("true");', current["facts"]["functions"])
            print("PASS cold fixed " + str(start) + " -> " + str(end) + ": exact ledger/schema/ACL, empty drain and flags disabled", flush=True)
        print(json.dumps({"localOnly": True, "providerCalls": 0, "localApplySeconds": timings, "remoteTiming": "NOT_ASSESSED"}), flush=True)
    finally:
        for directory in directories:
            assert directory.resolve().parent == Path(tempfile.gettempdir()).resolve()
            assert directory.name.startswith(("repsync-bootstrap-", "repsync-release-"))
            shutil.rmtree(directory)
        # Leave disposable state observed, never repair a failed migration ledger.
        print("CLEAN generated local artifacts removed; disposable DB left at observed checkpoint", flush=True)


if __name__ == "__main__":
    main()
