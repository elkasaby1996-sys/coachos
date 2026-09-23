"""Concurrent Sandbox certification supersession; disposable local DB only."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "races", ROOT / "scripts/test-billing-cross-ledger-concurrency.py"
)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.COMMAND[3] = "supabase_db_coachos"
r.SETUP = r.SETUP.replace("billing_db02_test", "paddle_identity_race")


def main():
    assert r.sql("select count(*) from auth.users;") == "0", "Reset isolated DB first"
    before = int(
        r.sql("select deadlocks from pg_stat_database where datname=current_database();")
    )
    fixtures = "\n".join(
        (ROOT / "supabase/tests/fixtures" / name).read_text(encoding="utf-8-sig")
        for name in (
            "billing_v2_legacy_seed.psql",
            "billing_cross_ledger_helpers.psql",
            "billing_catalogue_fixture.psql",
            "paddle_webhook_fixture.psql",
        )
    )
    fixtures = fixtures.replace("pg_temp.", "paddle_identity_race.")
    fixtures = fixtures.replace(
        "create temp table actors", "create table paddle_identity_race.actors"
    ).replace(
        "create temp table catalogue_vector",
        "create table paddle_identity_race.catalogue_vector",
    )
    r.sql(
        "begin; create schema paddle_identity_race;\n"
        + fixtures
        + """
select paddle_identity_race.catalogue_publish(paddle_identity_race.catalogue(k,c))
from unnest(array['launch','growth','scale','coach-seat']) k
cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_sales_enabled=true;
create table paddle_identity_race.actor as
select paddle_identity_race.guard_owner() owner,gen_random_uuid() cert_run,gen_random_uuid() real_run;
create table paddle_identity_race.cert_attempt as
select owner,cert_run,begin_paddle_checkout_v1(owner,'growth','monthly',0,cert_run,true,true,'2026-09-18','2026-09-18') result
from paddle_identity_race.actor;
select mark_paddle_checkout_ready_v1(owner,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/certification-transaction','ready','USD',jsonb_build_array(result->'base'))
from paddle_identity_race.cert_attempt;
insert into billing_paddle_checkout_certification_fixtures(run_id,checkout_id)
select cert_run,(result->>'attemptReference')::uuid from paddle_identity_race.cert_attempt;
update billing_paddle_checkout_certification_fixtures set closed_at=clock_timestamp();
update billing_checkouts_v2 set status='expired',expired_at=clock_timestamp(),error_code='PADDLE_CERTIFICATION_CLOSED',updated_at=clock_timestamp()
where id=(select (result->>'attemptReference')::uuid from paddle_identity_race.cert_attempt);
create table paddle_identity_race.real_attempt as
select owner,real_run,begin_paddle_checkout_v1(owner,'growth','monthly',0,real_run,true,true,'2026-09-18','2026-09-18') result
from paddle_identity_race.actor;
select mark_paddle_checkout_ready_v1(owner,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/real-transaction','ready','USD',jsonb_build_array(result->'base'))
from paddle_identity_race.real_attempt;
update billing_runtime_policy set paddle_sales_enabled=false;
with customer as (
 insert into billing_customers_v2(billing_account_id,provider,environment,provider_customer_ref,identity_source)
 select a.id,'paddle','test','synthetic/certification-customer','certification_fixture'
 from paddle_identity_race.actor x join billing_accounts a on a.owner_user_id=x.owner
 returning id,billing_account_id
)
insert into billing_subscriptions_v2(billing_account_id,customer_id,provider,environment,provider_subscription_ref,provider_status,provider_updated_at)
select billing_account_id,id,'paddle','test','synthetic/certification-subscription','active','2026-09-20T09:00:00Z'::timestamptz from customer;
select paddle_identity_race.webhook_ingest(
 paddle_identity_race.webhook_observation('subscription.created','synthetic/certification-created','synthetic/certification-delivery','2026-09-20T09:00:00.000Z') ||
 jsonb_build_object('transactionCorrelationRef','synthetic/certification-transaction','customerRef','synthetic/certification-customer','subscriptionRef','synthetic/certification-subscription')
);
grant usage on schema paddle_identity_race to service_role;
commit;
"""
    )

    statement = """set local role service_role;
select paddle_identity_race.webhook_ingest(
 paddle_identity_race.webhook_observation('subscription.created','synthetic/real-created','synthetic/real-delivery','2026-09-21T10:00:00.000Z') ||
 jsonb_build_object('transactionCorrelationRef','synthetic/real-transaction','customerRef','synthetic/real-customer','subscriptionRef','synthetic/real-subscription')
);"""
    r.race("concurrent certification identity supersession", statement, statement)
    assert r.sql(
        "select count(*) from billing_customers_v2 where identity_status='current';"
    ) == "1"
    assert r.sql(
        "select count(*) from billing_customers_v2 where identity_status='superseded';"
    ) == "1"
    assert r.sql(
        "select count(*) from billing_subscriptions_v2 where shadow_status='current';"
    ) == "1"
    assert r.sql(
        "select count(*) from billing_subscriptions_v2 where shadow_status='superseded';"
    ) == "1"
    assert r.sql("select count(*) from billing_provider_identity_transitions_v2;") == "1"
    assert r.sql("select count(*) from billing_payment_applications_v2;") == "0"
    assert r.sql(
        "select count(*) from billing_subscriptions_v2 where account_subscription_id is not null or approved_additional_coach_seats<>0;"
    ) == "0"
    assert r.sql(
        "select (paddle_sales_enabled or paddle_reconciliation_enabled)::int from billing_runtime_policy where id=1;"
    ) == "0"
    after = int(
        r.sql("select deadlocks from pg_stat_database where datname=current_database();")
    )
    assert after == before
    print(
        json.dumps(
            {
                "cases": len(r.RESULTS),
                "deadlocks": after - before,
                "currentCustomers": 1,
                "transitions": 1,
                "providerCalls": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
