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
    os.environ.update(SUPABASE_TELEMETRY_DISABLED="1", DO_NOT_TRACK="1", SUPABASE_NO_KEYRING="1")
    assert subprocess.run([str(binary), "--version"], capture_output=True, text=True, timeout=30).stdout.strip() == "2.109.1"
    spec = importlib.util.spec_from_file_location("local_db", ROOT / "scripts/test-billing-cross-ledger-concurrency.py")
    db = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(db)
    db.COMMAND[3] = CONTAINER
    identity = node('import {releaseIdentity} from "./scripts/staging-release-artifacts.mjs"; console.log(JSON.stringify(releaseIdentity()));')
    inventory = node('import {INVENTORY_QUERY} from "./scripts/billing-retirement-remote-inventory.mjs"; console.log(JSON.stringify(INVENTORY_QUERY));')
    checkpoints = json.loads((ROOT / "config/staging-release-checkpoints.json").read_text())
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
        facts["versions"] = json.loads(db.sql(ledger_sql)) if facts["ledgerPresent"] else []
        node('import {assertEmptySnapshot} from "./scripts/staging-bootstrap-observation.mjs";let s="";for await(const c of process.stdin)s+=c;assertEmptySnapshot({facts:JSON.parse(s),functions:[]});console.log("true");', facts)
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
                node('import {verifyBootstrapCheckpoint} from "./scripts/staging-bootstrap-contracts.mjs";let s="";for await(const c of process.stdin)s+=c;const p=JSON.parse(s);console.log(JSON.stringify(verifyBootstrapCheckpoint(p.o,p.i,p.c)));', {"o": current, "i": identity, "c": checkpoints})
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
