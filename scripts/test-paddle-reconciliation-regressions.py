"""Run existing concurrency proofs against the isolated reconciliation database.

Requires the dedicated Supabase workdir in the OS temp directory. Never accepts
a connection URL, remote project, arbitrary container or existing app database.
The retired certification harness runs at its historical migration boundary.
"""
import importlib.util
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(tempfile.gettempdir()) / "repsync-paddle-reconciliation01"
NPX = shutil.which("npx.cmd") or shutil.which("npx")
CONTAINER = "supabase_db_repsync_reconciliation01"


def reset(version=None):
    assert "project_id = 'repsync_reconciliation01'" in (WORK / "supabase/config.toml").read_text()
    args = [NPX, "supabase@latest", "db", "reset", "--local", "--workdir", str(WORK), "--yes"]
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
            module.main()
            print("PASS " + name, flush=True)
    finally:
        reset()
        print("CLEAN: disposable DB reconstructed; flags disabled", flush=True)


if __name__ == "__main__":
    main()
