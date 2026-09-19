"""Compare a populated merged DB-02 baseline with PROOF-01.

Usage: python scripts/verify-billing-proof-manifest.py before.json after.json
All existing rows, table definitions/ACLs, function bodies/ACLs, and canonical
outputs must match exactly. Only the explicit new function names are allowed.
"""

import json
import sys
from pathlib import Path

ADDED = {
    "billing_v2_proof_object", "billing_v2_proof_ref", "billing_v2_proof_stamp",
    "billing_v2_proof_money", "billing_v2_proof_items", "billing_v2_proof_validate",
    "billing_v2_proof_record", "record_verified_billing_event_v2",
    "record_verified_billing_subscription_v2", "record_verified_billing_transaction_v2",
}


def compare(before, after):
    assert before.keys() == after.keys(), "Manifest surfaces differ"
    previous = {r[0]: r for r in before["legacy_functions"]}
    current = {r[0]: r for r in after["legacy_functions"]}
    added = set(current) - set(previous)
    assert len(added) == len(ADDED) and {name.split("(")[0] for name in added} == ADDED
    assert all(previous[k] == current[k] for k in previous), "Existing function/ACL changed"
    for name in before:
        if name != "legacy_functions":
            assert before[name] == after[name], "Existing rows/schema/output differs: " + name
    print(json.dumps({
        "semantic_differences": 0,
        "tables": len(before) - 3,
        "rows": sum(len(v["rows"]) for v in before.values() if isinstance(v, dict)),
        "existing_functions_unchanged": len(previous),
        "new_functions_only": len(added),
        "accounts": len(before["entitlements"]),
    }, indent=2))


if __name__ == "__main__":
    compare(*(json.loads(Path(p).read_text(encoding="utf-8-sig")) for p in sys.argv[1:]))
