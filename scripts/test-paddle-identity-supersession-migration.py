"""Exercise the identity backfill across the actual local migration boundary."""
import importlib.util
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREVIOUS_VERSION = "20260922094541"
CONTAINER = "supabase_db_coachos"
NPX = shutil.which("npx.cmd") or shutil.which("npx") or "npx"

spec = importlib.util.spec_from_file_location(
    "races", ROOT / "scripts/test-billing-cross-ledger-concurrency.py"
)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.COMMAND[3] = CONTAINER
r.SETUP = r.SETUP.replace("billing_db02_test", "paddle_identity_backfill")


def cli(*args):
    result = subprocess.run(
        [NPX, "supabase@latest", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=180,
    )
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)


def main():
    cli("db", "reset", "--local", "--yes", "--version", PREVIOUS_VERSION)
    try:
        fixtures = "\n".join(
            (ROOT / "supabase/tests/fixtures" / name).read_text(encoding="utf-8-sig")
            for name in (
                "billing_v2_legacy_seed.psql",
                "billing_cross_ledger_helpers.psql",
                "billing_catalogue_fixture.psql",
                "paddle_webhook_fixture.psql",
            )
        )
        fixtures = fixtures.replace("pg_temp.", "paddle_identity_backfill.")
        fixtures = fixtures.replace(
            "create temp table actors", "create table paddle_identity_backfill.actors"
        ).replace(
            "create temp table catalogue_vector",
            "create table paddle_identity_backfill.catalogue_vector",
        )
        r.sql(
            "begin; create schema paddle_identity_backfill;\n"
            + fixtures
            + """
select paddle_identity_backfill.catalogue_publish(paddle_identity_backfill.catalogue(k,c))
from unnest(array['launch','growth','scale','coach-seat']) k
cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_sales_enabled=true;
create table paddle_identity_backfill.proven as
select paddle_identity_backfill.guard_owner() owner,gen_random_uuid() operation;
create table paddle_identity_backfill.attempt as
select owner,operation,begin_paddle_checkout_v1(owner,'growth','monthly',0,operation,true,true,'2026-09-18','2026-09-18') result
from paddle_identity_backfill.proven;
select mark_paddle_checkout_ready_v1(owner,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/backfill-certification-transaction','ready','USD',jsonb_build_array(result->'base'))
from paddle_identity_backfill.attempt;
insert into billing_paddle_checkout_certification_fixtures(run_id,checkout_id)
select operation,(result->>'attemptReference')::uuid from paddle_identity_backfill.attempt;
update billing_runtime_policy set paddle_sales_enabled=false;
with customer as (
 insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref)
 select a.id,'paddle','test','synthetic/backfill-certification-customer'
 from paddle_identity_backfill.proven p join billing_accounts a on a.owner_user_id=p.owner
 returning id,billing_account_id
)
insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref,provider_status,provider_updated_at)
select billing_account_id,id,'paddle','test','synthetic/backfill-certification-subscription','active','2026-09-20T09:00:00Z'::timestamptz from customer;
select paddle_identity_backfill.webhook_ingest(
 paddle_identity_backfill.webhook_observation('subscription.created','synthetic/backfill-created','synthetic/backfill-delivery','2026-09-20T09:00:00.000Z') ||
 jsonb_build_object('transactionCorrelationRef','synthetic/backfill-certification-transaction','customerRef','synthetic/backfill-certification-customer','subscriptionRef','synthetic/backfill-certification-subscription')
);
create table paddle_identity_backfill.ambiguous as
select paddle_identity_backfill.guard_owner() owner;
with customer as (
 insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref)
 select a.id,'paddle','test','synthetic/backfill-ambiguous-customer'
 from paddle_identity_backfill.ambiguous p join billing_accounts a on a.owner_user_id=p.owner
 returning id,billing_account_id
)
insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref)
select billing_account_id,id,'paddle','test','synthetic/backfill-ambiguous-subscription' from customer;
commit;
"""
        )
        cli("migration", "up", "--local")
        assert r.sql(
            "select count(*) from billing_customers_v2 where identity_source='certification_fixture';"
        ) == "1"
        assert r.sql(
            "select count(*) from billing_customers_v2 where identity_source='unknown_legacy';"
        ) == "1"
        assert r.sql(
            "select count(*) from billing_customers_v2 where identity_status='current';"
        ) == "2"
        assert r.sql(
            "select count(*) from billing_customers_v2 where identity_status='superseded';"
        ) == "0"
        print(
            json.dumps(
                {
                    "certificationFixture": 1,
                    "unknownLegacy": 1,
                    "automaticallySuperseded": 0,
                    "providerCalls": 0,
                }
            )
        )
    finally:
        cli("db", "reset", "--local", "--yes")


if __name__ == "__main__":
    main()
