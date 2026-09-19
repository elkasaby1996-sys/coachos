"""Real session publication races. Only the disposable local catalogue container.

Run after clean reconstruction/pgTAP; reset this local database afterward.
Reuses DB-02's session barrier (pg_stat_activity lock wait), not timing guesses.
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("local_races", ROOT / "scripts/test-billing-cross-ledger-concurrency.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.COMMAND[3] = "supabase_db_repsync_paddle_catalogue01"
r.SETUP = r.SETUP.replace("billing_db02_test", "billing_catalogue_test")


def main():
    assert r.sql("select count(*) from auth.users;") == "0", "Reset the isolated database first"
    assert r.sql("select count(*) from billing_price_mappings;") == "0", "Reset the isolated database first"
    deadlocks_before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    fixture = (ROOT / "supabase/tests/fixtures/billing_catalogue_fixture.psql").read_text()
    fixture = fixture.replace("create temp table catalogue_vector", "create table billing_catalogue_test.catalogue_vector").replace("pg_temp.", "billing_catalogue_test.")
    r.sql("create schema billing_catalogue_test;\n" + fixture)
    record = "select record_verified_paddle_catalogue_v1(billing_catalogue_test.catalogue());"
    r.race("same observation recording deduplicates", record, record)
    assert r.sql("select count(*) from billing_catalogue_evidence_v1") == "1"
    r.race("conflicting observation fails after lock", record,
           "select record_verified_paddle_catalogue_v1(jsonb_set(billing_catalogue_test.catalogue(),'{catalogue,unitAmountMinor}','1901'));",
           "BILLING_CATALOGUE_REPLAY_CONFLICT")
    draft = "select billing_catalogue_test.catalogue_draft(billing_catalogue_test.catalogue());"
    r.race("same draft reuses price claim", draft, draft)
    assert r.sql("select count(*) from billing_price_mappings") == "1"
    second = r.sql("select billing_catalogue_test.catalogue_draft(jsonb_set(billing_catalogue_test.catalogue(),'{catalogue,priceRef}','\"synthetic/concurrent/other-launch\"'));")
    first = r.sql("select id from billing_price_mappings where provider_price_ref='synthetic/price/launch/monthly';")

    def activate(mapping):
        return f"select activate_paddle_catalogue_mapping_v1(id,catalogue_evidence_id,verification_sha256) from billing_price_mappings where id='{mapping}';"

    r.race("only one active price per canonical pair", activate(first), activate(second), "23505")
    r.sql("select billing_catalogue_test.catalogue_publish(billing_catalogue_test.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c where not(k='launch' and c='monthly');")
    r.race("completeness holds publication lock against retirement",
           "select validate_paddle_catalogue_v1('test');", f"select retire_paddle_catalogue_mapping_v1('{first}');")
    # Replace the retired monthly mapping; the draft already retained its price.
    r.sql(activate(second))
    r.race("retirement first makes subsequent completeness fail",
           f"select retire_paddle_catalogue_mapping_v1('{second}');", "select validate_paddle_catalogue_v1('test');",
           "BILLING_CATALOGUE_INCOMPLETE")
    deadlocks = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();")) - deadlocks_before
    assert deadlocks == 0
    print(json.dumps({"passed": len(r.RESULTS), "deadlocks": deadlocks, "cases": r.RESULTS}, indent=2))


if __name__ == "__main__":
    main()
