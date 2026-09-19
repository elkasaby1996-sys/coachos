"""Compare populated PROOF-01 and CATALOGUE-01 local manifests.

Usage: python scripts/verify-billing-catalogue-manifest.py before.json after.json
No legacy changes allowed. Only the exact additive v2 mapping branch is normalized.
"""
import copy
import json
import sys
from pathlib import Path

ADDED = {
    "billing_catalogue_validate_v1", "billing_catalogue_authorize_v1",
    "billing_catalogue_assert_mapping_v1", "record_verified_paddle_catalogue_v1",
    "draft_paddle_catalogue_mapping_v1", "activate_paddle_catalogue_mapping_v1",
    "retire_paddle_catalogue_mapping_v1", "validate_paddle_catalogue_v1",
}
IDENTITY_GUARD = """  if tg_op='UPDATE' and old.catalogue_evidence_id is not null and
    (new.catalogue_evidence_id is null or (new.provider,new.environment,new.provider_price_ref,new.provider_product_ref,new.identity_kind,new.canonical_key,new.cadence,new.plan_version_id,new.addon_version_id)
      is distinct from (old.provider,old.environment,old.provider_price_ref,old.provider_product_ref,old.identity_kind,old.canonical_key,old.cadence,old.plan_version_id,old.addon_version_id)) then
    raise exception 'BILLING_CATALOGUE_PRICE_CLAIMED';
  end if;
"""
EVIDENCE_BRANCH = """  if new.catalogue_evidence_id is not null then
    perform public.billing_catalogue_assert_mapping_v1(new);
  elsif new.status in ('active','retired') then"""
FK = ["billing_catalogue_mapping_evidence_fk", "FOREIGN KEY (catalogue_evidence_id, provider, environment) REFERENCES billing_catalogue_evidence_v1(id, provider, environment) ON UPDATE RESTRICT ON DELETE RESTRICT"]
CHECK = ["billing_catalogue_mapping_provenance", "CHECK ((((catalogue_evidence_id IS NULL) OR (verification_evidence_id IS NULL)) AND ((status <> 'active'::text) OR ((verified_at IS NOT NULL) AND (verification_sha256 IS NOT NULL) AND ((verification_evidence_id IS NOT NULL) OR (catalogue_evidence_id IS NOT NULL))))))"]
INDEX = "CREATE INDEX billing_catalogue_mapping_evidence ON public.billing_price_mappings USING btree (catalogue_evidence_id, provider, environment)"


def compare(before, after):
    assert before.keys() == after.keys(), "Manifest surfaces differ"
    previous = {r[0]: r for r in before["legacy_functions"]}
    current = {r[0]: r for r in after["legacy_functions"]}
    added = current.keys() - previous.keys()
    assert len(added) == len(ADDED) and {n.split("(")[0] for n in added} == ADDED
    guard = current["billing_v2_protect_mapping()"]
    guard[1] = guard[1].replace("\r\n", "\n")
    previous["billing_v2_protect_mapping()"][1] = previous["billing_v2_protect_mapping()"][1].replace("\r\n", "\n")
    assert guard[1].count(IDENTITY_GUARD) == 1 and guard[1].count(EVIDENCE_BRANCH) == 1
    guard[1] = guard[1].replace(IDENTITY_GUARD, "").replace(EVIDENCE_BRANCH, "  if new.status in ('active','retired') then")
    assert all(previous[k] == current[k] for k in previous), "Unexpected existing function or grant change"

    definition = copy.deepcopy(after["billing_price_mappings"]["definition"])
    definition["columns"].remove(["catalogue_evidence_id", "uuid", False])
    definition["indexes"].remove(INDEX)
    definition["constraints"].remove(FK)
    definition["constraints"].remove(CHECK)
    old_constraint = next(c for c in before["billing_price_mappings"]["definition"]["constraints"] if c[0] == "billing_price_mappings_check3")
    definition["constraints"].append(old_constraint)
    definition["constraints"].sort(key=lambda c: c[0])
    assert definition == before["billing_price_mappings"]["definition"], "Unexpected mapping schema/grant change"
    assert after["billing_price_mappings"]["rows"] == before["billing_price_mappings"]["rows"], "Historical mapping rewrite"
    for key in before.keys() - {"legacy_functions", "billing_price_mappings"}:
        assert before[key] == after[key], "Legacy data/schema/output change: " + key
    print(json.dumps({
        "legacy_semantic_differences": 0,
        "tables": len(before) - 3,
        "rows": sum(len(v["rows"]) for v in before.values() if isinstance(v, dict)),
        "existing_functions_unchanged": len(previous) - 1,
        "v2_mapping_function_exact_additive_branch_only": True,
        "new_functions": len(added),
        "accounts": len(before["entitlements"]),
    }, indent=2))


if __name__ == "__main__":
    compare(*(json.loads(Path(p).read_text(encoding="utf-8-sig")) for p in sys.argv[1:]))
