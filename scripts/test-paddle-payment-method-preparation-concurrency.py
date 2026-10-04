"""Durable preparation races on the disposable reconciliation database only.

No provider requests are made. A real PostgreSQL lock wait is required for
each race; every fixture is synthetic and local to repsync_reconciliation01.
"""
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "auto", ROOT / "scripts/test-paddle-auto-reconciliation-concurrency.py"
)
auto = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto)
r = auto.r


def main():
    expected = "supabase_db_repsync_pay04_v2" if os.environ.get("PAY04_DISPOSABLE_LOCAL") == "1" else "supabase_db_repsync_reconciliation01"
    assert r.COMMAND[3] == expected, "Only the explicitly selected fixed disposable local project is allowed"
    assert r.sql("select count(*) from auth.users;") == "0", "Reset disposable DB first"
    before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    auto.setup()
    for filename in (
        "paddle_lifecycle_fixture.psql",
        "paddle_plan_change_fixture.psql",
        "paddle_seat_fixture.psql",
    ):
        body = (ROOT / "supabase/tests/fixtures" / filename).read_text()
        r.sql(body.replace("pg_temp.", "paddle_auto_test."))

    owner = r.sql("select paddle_auto_test.plan_owner();")
    call = (
        "set local role service_role; "
        f"select begin_billing_payment_method_preparation_v1('{owner}');"
    )
    r.race("simultaneous owner activation reuses one reservation", call, call)
    row = json.loads(r.sql(
        "select jsonb_build_object('count',count(*),'id',min(id::text)) "
        "from billing_payment_method_preparations_v2 "
        f"where created_by_user_id='{owner}';"
    ))
    assert row["count"] == 1
    preparation = row["id"]
    first = (
        "set local role service_role; "
        f"select claim_billing_payment_method_dispatch_v1('{owner}','{preparation}','{'a' * 64}');"
    )
    second = (
        "set local role service_role; "
        f"select claim_billing_payment_method_dispatch_v1('{owner}','{preparation}','{'b' * 64}');"
    )
    r.race("only one committed provider dispatch permit", first, second,
           "BILLING_PAYMENT_METHOD_UNAVAILABLE")
    assert r.sql(
        "select count(*) from billing_payment_method_preparations_v2 "
        f"where id='{preparation}' and dispatch_token_sha256='{'a' * 64}' "
        "and provider_requested_at is not null;"
    ) == "1"
    assert r.sql(
        "select count(*) from billing_payment_method_preparations_v2 "
        f"where id='{preparation}';"
    ) == "1"
    after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert after == before
    print(json.dumps({"cases": 2, "deadlocks": after - before, "providerCalls": 0}))


if __name__ == "__main__":
    main()
