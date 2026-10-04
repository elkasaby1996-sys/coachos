"""Run existing concurrency proofs against the isolated reconciliation database.

Requires the dedicated Supabase workdir in the OS temp directory. Never accepts
a connection URL, remote project, arbitrary container or existing app database.
The retired certification harness runs at its historical migration boundary.
"""
import importlib.util
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(tempfile.gettempdir()) / "repsync-paddle-reconciliation01"
NPX = shutil.which("npx.cmd") or shutil.which("npx")
CONTAINER = "supabase_db_repsync_reconciliation01"
if os.environ.get("PAY04_DISPOSABLE_LOCAL") == "1":
    WORK = Path(tempfile.gettempdir()) / "repsync-pay04-v2-local"
    CONTAINER = "supabase_db_repsync_pay04_v2"


def assert_local():
    expected = "repsync_pay04_v2" if CONTAINER == "supabase_db_repsync_pay04_v2" else "repsync_reconciliation01"
    assert WORK.resolve() == (Path(tempfile.gettempdir()) / ("repsync-pay04-v2-local" if expected == "repsync_pay04_v2" else "repsync-paddle-reconciliation01")).resolve()
    assert f"project_id = '{expected}'" in (WORK / "supabase/config.toml").read_text()


def cli_command(*args):
    # Optional installed/cached local CLI for offline, reproducible proofs.
    binary = os.environ.get("PAY03B_SUPABASE_LOCAL_CLI")
    if binary:
        path = Path(binary)
        assert path.is_absolute() and path.is_file() and path.name in ("supabase", "supabase.exe")
        return [str(path), *args]
    return [NPX, "supabase@latest", *args]


def reset(version=None):
    assert_local()
    args = cli_command("db", "reset", "--local", "--workdir", str(WORK), "--yes")
    if version:
        args += ["--version", version]
    result = subprocess.run(args, capture_output=True, text=True, timeout=240)
    (WORK / "regression-reset.log").write_text(result.stdout + result.stderr)
    assert result.returncode == 0, "Isolated reset failed; see regression-reset.log"


def main():
    cases = [
        ("test-billing-cross-ledger-concurrency.py", None),
        ("test-billing-catalogue-concurrency.py", None),
        ("test-paddle-checkout-concurrency.py", None),
        ("test-paddle-webhook-concurrency.py", None),
        ("test-paddle-identity-supersession-concurrency.py", None),
        ("test-paddle-reconciliation-concurrency.py", None),
        ("test-paddle-auto-reconciliation-concurrency.py", None),
        ("test-paddle-lifecycle-concurrency.py", None),
        ("test-paddle-plan-change-concurrency.py", None),
        ("test-paddle-seat-concurrency.py", None),
        ("test-paddle-initial-period-concurrency.py", None),
        ("test-paddle-payment-recovery-concurrency.py", None),
        ("test-paddle-payment-method-preparation-concurrency.py", None),
        ("test-paddle-cert-fixture-concurrency.py", "20260920221934"),
    ]
    try:
        for name, version in cases:
            print("START " + name, flush=True)
            reset(version)
            spec = importlib.util.spec_from_file_location("regression", ROOT / "scripts" / name)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            runner = getattr(module, "r", module)
            runner.COMMAND[3] = CONTAINER
            if hasattr(runner, "CONTAINER"):
                runner.CONTAINER = CONTAINER
            module.main()
            print("PASS " + name, flush=True)
    finally:
        reset()
        print("CLEAN: disposable DB reconstructed; flags disabled", flush=True)


if __name__ == "__main__":
    main()
