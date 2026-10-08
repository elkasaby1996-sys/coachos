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


def rehearsal(run):
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
    assert sys.argv[1:] == [], "Recording/enrollment modes are not supported"
    baseline = None
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
        nonlocal baseline
        value = json.loads(db.sql(catalog_sql))
        assert value["platformComplete"] is True, "Platform row proof incomplete"
        seeds = None
        if count == 180:
            seeds = json.loads(db.sql(seeds_sql))["seedDigest"]
        value = node('import {databaseProof} from "./scripts/staging-bootstrap-database.mjs";let s="";for await(const c of process.stdin)s+=c;const v=JSON.parse(s);console.log(JSON.stringify(databaseProof(v.catalog,v.seeds??undefined)));', {"catalog":value,"seeds":seeds})
        if count == 0:
            # Local test baseline only, no hosted identity or approval is created.
            baseline = {"databaseProof": value}
        node('import {assertDatabaseProof} from "./scripts/staging-bootstrap-database.mjs";let s="";for await(const c of process.stdin)s+=c;const v=JSON.parse(s);assertDatabaseProof(v.proof,v.count,v.baseline);console.log("true");', {"proof":value,"count":count,"baseline":baseline})
        return value

    def rejects(statement, count=0):
        raw = probe_sql("begin;" + statement + catalog_sql + (seeds_sql if count == 180 else "") + "rollback;").splitlines()
        value = {"catalog":json.loads(raw[0]),"count":count,"baseline":baseline}
        if count == 180:
            value["seeds"] = json.loads(raw[1])["seedDigest"]
        rejected = node('import {databaseProof,assertDatabaseProof} from "./scripts/staging-bootstrap-database.mjs";let s="";for await(const c of process.stdin)s+=c;const p=JSON.parse(s);try{assertDatabaseProof(databaseProof(p.catalog,p.seeds),p.count,p.baseline);console.log("false");}catch(e){if(!/^BOOTSTRAP_/.test(e.message))throw e;console.log("true");}',value)
        assert rejected is True, "Customer/provider overlay was admitted"

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
        facts["versions"] = json.loads(db.sql(ledger_sql))["versions"] if facts["ledgerPresent"] else []
        assert facts["versions"] == [] and all(facts[k] == 0 for k in ("applicationRelations","applicationFunctions","authUsers","storageObjects","storageBuckets"))
        # Outer SQL is parsed BEFORE context materialization. No helper/operator
        # may resolve through the caller's customer-controlled search path.
        shadow = """create schema pay05_shadow;
create function pay05_shadow.set_config(text,text,boolean) returns text language plpgsql as $$begin raise exception 'SHADOW_CALLED';end$$;
create function pay05_shadow.query_to_xml(text,boolean,boolean,text) returns xml language plpgsql as $$begin raise exception 'SHADOW_CALLED';end$$;
create function pay05_shadow.xpath(text,xml) returns xml[] language plpgsql as $$begin raise exception 'SHADOW_CALLED';end$$;
create function pay05_shadow.current_setting(text) returns text language plpgsql as $$begin raise exception 'SHADOW_CALLED';end$$;
create function pay05_shadow.concat(jsonb,jsonb) returns jsonb language plpgsql as $$begin raise exception 'SHADOW_CALLED';end$$;
create operator pay05_shadow.|| (leftarg=jsonb,rightarg=jsonb,procedure=pay05_shadow.concat);
create function pay05_shadow.equal(text,text) returns boolean language plpgsql as $$begin raise exception 'SHADOW_CALLED';end$$;
create operator pay05_shadow.= (leftarg=text,rightarg=text,procedure=pay05_shadow.equal);
set local search_path=pay05_shadow,pg_catalog;
set local TimeZone='Europe/Paris';set local DateStyle='SQL, DMY';
set local IntervalStyle='sql_standard';set local extra_float_digits=0;
set local bytea_output='escape';set local standard_conforming_strings=off;
"""
        rejects(shadow)
        print("PASS canonical single-request context: customer shadow helpers/operators never invoked; noncanonical caller settings replaced",flush=True)
        owner_probe = probe_sql("begin;create unique index pay05_customer_unique on storage.objects(id,bucket_id);select (i.relowner=t.relowner) and x.indisunique from pg_class i join pg_index x on x.indexrelid=i.oid join pg_class t on t.oid=x.indrelid where i.relname='pay05_customer_unique';rollback;")
        assert owner_probe == "t", "Unique-index owner inheritance not exercised"
        overlays = (
            "create unique index pay05_customer_unique on storage.objects(id,bucket_id);",
            "create function auth.pay05_customer_trigger() returns trigger language plpgsql as 'begin return NEW;end';create trigger pay05_customer_trigger after insert on auth.users for each row execute function auth.pay05_customer_trigger();",
            "create policy pay05_customer_policy on storage.objects for select using(true);",
            "create policy pay05_customer_policy on realtime.messages for select using(true);",
            "create function auth.pay05_customer_function() returns integer language sql as 'select 1';",
            "create type realtime.pay05_customer_type as enum ('customer');",
            "create function auth.pay05_extension_camouflage() returns integer language sql as 'select 1';alter extension pgcrypto add function auth.pay05_extension_camouflage();",
            "create cast (text as uuid) with inout as implicit;",
            "create view auth.pay05_cross_boundary as select id from storage.objects;",
            "create publication pay05_customer_publication;",
            "alter table storage.objects replica identity full;",
            "alter table storage.objects disable row level security;",
            "grant select on storage.objects to public;",
        )
        for statement in overlays:
            rejects(statement)
        print("PASS local complete baseline validator: 13 customer overlays rejected; Storage UNIQUE index inherited table owner",flush=True)
        # Equality to a candidate baseline must not bless customer privileges.
        # Rollback probes run only as the disposable container's provider admin.
        for statement in (
            "grant update on storage.objects to anon with grant option;",
            "grant select on auth.users to anon;",
            "grant select(email) on auth.users to anon;",
            "grant create on schema storage to anon;",
            "alter default privileges for role postgres in schema auth grant select on tables to anon;",
            "alter table storage.objects owner to authenticated;",
            "alter table storage.objects disable row level security;",
            "alter table storage.objects force row level security;",
            "create role pay05_inherited;grant select on auth.users to pay05_inherited;grant pay05_inherited to anon;",
            "alter role anon bypassrls;",
            "grant select on storage.objects to public;",
            "grant usage on type auth.aal_level to anon with grant option;",
        ):
            altered = json.loads(probe_sql("begin;" + statement + catalog_sql + "rollback;"))
            code = node('import {databaseProof,assertDatabaseProof} from "./scripts/staging-bootstrap-database.mjs";let s="";for await(const c of process.stdin)s+=c;const p=databaseProof(JSON.parse(s));try{assertDatabaseProof(p,0,{databaseProof:p});console.log("ADMITTED");}catch(e){console.log(JSON.stringify(e.message));}',altered)
            assert code == "BOOTSTRAP_CUSTOMER_SECURITY_MISMATCH", "Matching unsafe baseline bypassed independent privilege policy"
        print("PASS 12 matching-baseline ACL/column/default/inheritance/owner/RLS probes rejected independently of B",flush=True)
        for statement in (
            "grant set on parameter session_replication_role to anon;",
            "grant set on parameter session_replication_role to authenticated with grant option;",
            "grant alter system on parameter session_replication_role to public;",
            "grant alter system on parameter session_replication_role to service_role with grant option;",
        ):
            altered = json.loads(probe_sql("begin;" + statement + catalog_sql + "rollback;"))
            code = node('import {databaseProof,assertDatabaseProof} from "./scripts/staging-bootstrap-database.mjs";let s="";for await(const c of process.stdin)s+=c;const p=databaseProof(JSON.parse(s));try{assertDatabaseProof(p,0,{databaseProof:p});console.log("ADMITTED");}catch(e){console.log(JSON.stringify(e.message));}',altered)
            assert code == "BOOTSTRAP_CUSTOMER_PARAMETER_ACL_MISMATCH", "Matching baseline admitted customer parameter authority"
        print("PASS four matching-baseline parameter privilege probes rejected independently of B",flush=True)
        for statement, kind in (
            ("alter role authenticated in database postgres set search_path=public,auth;", "role_setting"),
            ("alter role authenticated set work_mem='8MB';", "role_setting"),
            ("alter database postgres set work_mem='8MB';", "role_setting"),
            ("alter role authenticated in database template1 set work_mem='8MB';", "role_setting"),
            ("grant set on parameter session_replication_role to authenticated;", "parameter_acl"),
            ("grant set on parameter session_replication_role to authenticated with grant option;", "parameter_acl"),
        ):
            altered = json.loads(probe_sql("begin;" + statement + catalog_sql + "rollback;"))
            assert altered["sqlCatalogDigest"] != facts["databaseProof"]["sqlCatalogDigest"]
            assert [r for r in altered["catalog"] if r[0] == kind] != [r for r in facts["databaseProof"]["catalog"] if r[0] == kind]
            rejects(statement)
        assert json.loads(db.sql(catalog_sql))["sqlCatalogDigest"] == facts["databaseProof"]["sqlCatalogDigest"], "Rollback probe left catalog drift"
        print("PASS six persistent role/database/parameter privilege probes detected; rollback verified",flush=True)
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
            assert altered["sqlCatalogDigest"] != facts["databaseProof"]["sqlCatalogDigest"], "Hidden object/type was admitted"
        altered = json.loads(probe_sql("begin;insert into auth.schema_migrations(version) values('pay05-local-probe');" + catalog_sql + "rollback;"))
        assert altered["sqlCatalogDigest"] == facts["databaseProof"]["sqlCatalogDigest"]
        assert altered["sqlPlatformDigest"] != facts["databaseProof"]["sqlPlatformDigest"], "Unexpected platform rows were admitted"
        altered = json.loads(probe_sql("begin;update _realtime.tenants set id=gen_random_uuid(),updated_at=updated_at+interval '1 second';update _realtime.extensions set id=gen_random_uuid(),updated_at=updated_at+interval '1 second';" + catalog_sql + "rollback;"))
        assert altered["sqlPlatformDigest"] == facts["databaseProof"]["sqlPlatformDigest"], "Generated managed startup fields were not normalized"
        for statement in (
            "update _realtime.tenants set max_concurrent_users=max_concurrent_users+1;",
            "set local session_replication_role=replica;update _realtime.extensions set tenant_external_id='unrelated-local';set local session_replication_role=origin;",
        ):
            altered = json.loads(probe_sql("begin;" + statement + catalog_sql + "rollback;"))
            assert altered["sqlCatalogDigest"] == facts["databaseProof"]["sqlCatalogDigest"]
            assert altered["sqlPlatformDigest"] != facts["databaseProof"]["sqlPlatformDigest"], "Managed state/relationship change was admitted"
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
                assert altered["sqlPlatformDigest"] != current["facts"]["databaseProof"]["sqlPlatformDigest"], "Changed ledger metadata was admitted"
                node('import {verifyBootstrapCheckpoint} from "./scripts/staging-bootstrap-contracts.mjs";let s="";for await(const c of process.stdin)s+=c;const p=JSON.parse(s);console.log(JSON.stringify(verifyBootstrapCheckpoint(p.o,p.i,p.c,p.b)));', {"o": current, "i": identity, "c": checkpoints,"b":baseline})
                for statement in overlays:
                    rejects(statement,180)
                rejects("update storage.buckets set public=true where id='medical_documents';",180)
                rejects("drop policy \"" + node('import {bootstrapDatabaseProfiles} from "./scripts/staging-bootstrap-database.mjs";const p=bootstrapDatabaseProfiles().delta180.storagePolicies[0];console.log(JSON.stringify(p[1].slice("storage.objects.".length)));') + "\" on storage.objects;",180)
                rejects("alter publication supabase_realtime drop table public.clients;",180)
                print("PASS exact B + delta180 validator: all 13 overlays, bucket configuration, missing policy and publication member rejected",flush=True)
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
                    assert json.loads(altered)["seedDigest"] != current["facts"]["databaseProof"]["seedDigest"], "Noncanonical seed was admitted"
                altered = json.loads(probe_sql("begin;alter type public.onboarding_source add value 'unexpected';" + catalog_sql + "rollback;"))
                assert altered["sqlCatalogDigest"] != current["facts"]["databaseProof"]["sqlCatalogDigest"], "Changed enum labels were admitted"
                print("PASS local rollback probes: all six reference tables, effective date and enum labels rejected", flush=True)
                before = current["facts"]["history"]
            else:
                assert all(current["facts"]["history"][k] == v for k, v in before.items()), "Cold reference/history state changed unexpectedly"
            if end == 184:
                assert db.sql("select relrowsecurity and not has_table_privilege('authenticated',oid,'SELECT') from pg_class where oid='billing_payment_method_preparations_v2'::regclass;") == "t"
            if end >= 185:
                node('import {assertRetiredDatabaseAuthority} from "./scripts/billing-retirement-release.mjs";import {readFileSync} from "node:fs";let s="";for await(const c of process.stdin)s+=c;assertRetiredDatabaseAuthority(JSON.parse(s),JSON.parse(readFileSync("supabase/tests/fixtures/lemon_squeezy_retired_functions.json")));console.log("true");', current["facts"]["functions"])
            print("PASS cold fixed " + str(start) + " -> " + str(end) + ": exact ledger/schema/ACL, empty drain and flags disabled", flush=True)
        print(json.dumps({"run":run,"localOnly": True, "providerCalls": 0, "localApplySeconds": timings, "remoteTiming": "NOT_ASSESSED"}), flush=True)
    finally:
        for directory in directories:
            assert directory.resolve().parent == Path(tempfile.gettempdir()).resolve()
            assert directory.name.startswith(("repsync-bootstrap-", "repsync-release-"))
            shutil.rmtree(directory)
        # Leave disposable state observed, never repair a failed migration ledger.
        print("CLEAN generated local artifacts removed; disposable DB left at observed checkpoint", flush=True)


if __name__ == "__main__":
    for run in (1,2):
        rehearsal(run)
