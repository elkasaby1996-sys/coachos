"""Paddle seat races in the fixed disposable local DB; no provider/network IO.

Run after local reconstruction. Fixtures commit; reconstruct afterward.
Uses the existing runner's observed database lock barrier, not timing sleeps.
"""
import importlib.util
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("auto", ROOT / "scripts/test-paddle-auto-reconciliation-concurrency.py")
auto = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto)
r = auto.r


def main():
    assert r.sql("select count(*) from auth.users;") == "0", "Reset disposable DB first"
    before = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    auto.setup()
    for name in ("paddle_lifecycle_fixture.psql", "paddle_plan_change_fixture.psql", "paddle_seat_fixture.psql"):
        r.sql((ROOT / "supabase/tests/fixtures" / name).read_text().replace("pg_temp.", "paddle_auto_test."))

    def owner():
        return r.sql("select paddle_auto_test.plan_owner();")

    def seat(u, n, op=None):
        return f"select paddle_auto_test.paddle_seat_begin('{u}',{n},'{op or uuid.uuid4()}');"

    def dispatch(ev):
        return f"set local role service_role; select reconcile_paddle_initial_purchase_event_v1('{ev}');"

    for exact in (True, False):
        u, op = owner(), str(uuid.uuid4())
        r.race("seat exact retry" if exact else "seat changed intent", seat(u, 1, op),
               seat(u, 1 if exact else 2, op), None if exact else "BILLING_SEAT_QUANTITY_OPERATION_CONFLICT")
        assert r.sql(f"select count(*) from billing_operations_v2 where created_by_user_id='{u}';") == "1"
        events = [r.sql(f"select paddle_auto_test.lifecycle_ingest(paddle_auto_test.paddle_seat_observation('{u}','{kind}','{kind}')); ")
                  for kind in ("subscription.updated", "transaction.completed")]
        if not exact:
            events.reverse()
        r.race("paired seat payment dispatch", dispatch(events[0]), dispatch(events[1]))
        r.race("duplicate seat payment dispatch", dispatch(events[1]), dispatch(events[1]))
        ledger = r.sql(f"select id from billing_operations_v2 where created_by_user_id='{u}';")
        r.race("late ambiguity cannot overwrite payment", dispatch(events[0]),
               f"select fail_paddle_seat_quantity_v1('{u}','{ledger}',true);")
        facts = json.loads(r.sql(f"select paddle_auto_test.paddle_seat_counts('{u}');"))
        assert facts["approved"] == 1 and facts["payments"] == 1 and facts["operation"] == "completed"

    u = owner()
    r.race("different simultaneous seat intents", seat(u, 1), seat(u, 2), "BILLING_SEAT_QUANTITY_OPERATION_CONFLICT")
    for seats_first in (True, False):
        u = owner()
        plan = f"select paddle_auto_test.plan_begin('{u}','scale');"
        change = seat(u, 1)
        r.race("seat blocks plan" if seats_first else "plan blocks seat",
               change if seats_first else plan, plan if seats_first else change,
               "BILLING_PLAN_CHANGE_ALREADY_PENDING" if seats_first else "BILLING_SEAT_QUANTITY_OPERATION_CONFLICT")

    # Real invitation acceptance RPC races the reduction's account lock in both
    # orders. Pending-to-active conversion must not double count or oversubscribe.
    for reduction_first in (True, False):
        u, member, workspace = owner(), str(uuid.uuid4()), str(uuid.uuid4())
        token = "synthetic-seat-" + uuid.uuid4().hex
        r.sql(f"""select paddle_auto_test.paddle_seat_buy('{u}',2);
insert into workspaces(id,owner_user_id,name) values('{workspace}','{u}','Seat concurrency');
insert into auth.users(id,email,email_confirmed_at) values('{member}','{member}@example.test',now());
insert into workspace_member_invites(workspace_id,email,role,token_hash,invited_by_user_id,expires_at)
values('{workspace}','{member}@example.test','coach',hash_workspace_team_invite_token('{token}'),'{u}',now()+interval '1 day');""")
        accept = f"select set_config('request.jwt.claim.sub','{member}',true); set local role authenticated; select accept_workspace_team_invite('{token}');"
        change = seat(u, 0)
        r.race("reduction then invitation acceptance" if reduction_first else "invitation acceptance then reduction",
               change if reduction_first else accept, accept if reduction_first else change)
        assert r.sql(f"select status from workspace_member_invites where workspace_id='{workspace}';") == "accepted"
        account = r.sql(f"select id from billing_accounts where owner_user_id='{u}';")
        facts = json.loads(r.sql(f"select value from jsonb_array_elements(resolve_account_capacity('{u}','{account}')->'dimensions') where value->>'key'='coach_seats';"))
        assert facts["committed"] == 2
        assert r.sql(f"select billing_seat_effective_limit('{account}',true);") == "2"

    # A committed reservation wins against a reduction, or the lower ceiling
    # makes a new reservation return denied. Both paths serialize on the account.
    for reduction_first in (True, False):
        u = owner()
        r.sql(f"select paddle_auto_test.paddle_seat_buy('{u}',3);")
        account = r.sql(f"select id from billing_accounts where owner_user_id='{u}';")
        reserve = f"select reserve_account_capacity('{account}','coach_seats',3,'synthetic-{uuid.uuid4()}','operation','operation:{uuid.uuid4()}',null,'pgtap',now()+interval '2 minutes');"
        change = seat(u, 0)
        r.race("reduction blocks reservation" if reduction_first else "reservation blocks reduction",
               change if reduction_first else reserve, reserve if reduction_first else change,
               None if reduction_first else "BILLING_SEAT_QUANTITY_CAPACITY_BLOCKED")
        active = int(r.sql(f"select count(*) from account_capacity_reservations where billing_account_id='{account}' and status='active';"))
        assert active == (0 if reduction_first else 1)
    after = int(r.sql("select deadlocks from pg_stat_database where datname=current_database();"))
    assert after == before, "Application deadlock detected"
    print(json.dumps(dict(cases=len(r.RESULTS), deadlocks=after-before, providerCalls=0)))


if __name__ == "__main__":
    main()
