"""Real-session DB-02 races, restricted to the disposable local proof container.

Run after clean reconstruction and pgTAP. Fixtures commit, so reset this isolated
database afterward. No URL, remote project, credentials, or container override.
"""

import json
import queue
import subprocess
import threading
import time
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CONTAINER = "supabase_db_repsync_billing_db02"
COMMAND = [
    "docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d",
    "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
]
SETUP = r"""
set search_path=public,extensions,billing_db02_test;
set statement_timeout='15s';
set lock_timeout='10s';
set client_min_messages=warning;
\set VERBOSITY verbose
"""


def sql(statement):
    result = subprocess.run(COMMAND, input=SETUP + statement, text=True,
                            capture_output=True, timeout=40)
    if result.returncode:
        raise AssertionError(result.stderr + result.stdout)
    return result.stdout.strip()


class Session:
    def __init__(self):
        self.name = "db02_" + uuid.uuid4().hex
        self.process = subprocess.Popen(COMMAND, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                        text=True, bufsize=1)
        self.lines = queue.Queue()
        threading.Thread(target=self.read, daemon=True).start()
        self.send(SETUP + f"set application_name='{self.name}'; begin;")
        self.collect()

    def read(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip())
        self.lines.put(None)

    def send(self, statement):
        self.marker = "done_" + uuid.uuid4().hex
        self.process.stdin.write(statement + "\n\\echo " + self.marker + "\n")
        self.process.stdin.flush()

    def collect(self, error=None):
        output = []
        while True:
            line = self.lines.get(timeout=25)
            if line is None or line == self.marker:
                break
            output.append(line)
        text = "\n".join(output)
        assert "40P01" not in text, "Deadlock: " + text
        if error:
            assert error in text, (error, text)
        else:
            assert "ERROR:" not in text and line is not None, text
        return text

    def execute(self, statement):
        self.send(statement)
        return self.collect()

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write("rollback;\n\\q\n")
                self.process.stdin.flush()
            except OSError:
                pass
        self.process.wait(timeout=20)


RESULTS = []


def blocked(session):
    deadline = time.monotonic() + 7
    while time.monotonic() < deadline:
        state = sql(f"select wait_event_type from pg_stat_activity where application_name='{session.name}';")
        if state == "Lock":
            return
        if session.process.poll() is not None:
            raise AssertionError("Contender exited before lock barrier: " + session.collect())
        time.sleep(0.05)
    raise AssertionError("Contender did not reach a real lock wait")


def race(name, first, second, failure=None):
    a, b = Session(), Session()
    try:
        a.execute(first)
        b.send(second)
        blocked(b)
        a.execute("commit;")
        b.collect(failure)
        if failure is None:
            b.execute("commit;")
        RESULTS.append({"case": name, "result": "pass", "wait_observed": True,
                        "contender": failure or "committed"})
        print("PASS: " + name, flush=True)
    finally:
        a.close()
        b.close()


def owner(paid=False):
    return sql("select billing_db02_test." + ("coach('growth')" if paid else "guard_owner()") + ";")


def account(u):
    return sql(f"select id from billing_accounts where owner_user_id='{u}';")


def checkout(u, contract, op=None):
    return f"select billing_db02_test.guard_checkout('{u}','{contract}','{op or uuid.uuid4()}');"


def operation(u, contract, kind, op=None):
    return f"select billing_db02_test.guard_operation('{u}','{contract}','{kind}','{op or uuid.uuid4()}');"


def main():
    # A dedicated name AND the absence of existing test/customer data are required.
    assert sql("select count(*) from auth.users;") == "0", "Reset the isolated proof database first"
    deadlocks_before = int(sql("select deadlocks from pg_stat_database where datname=current_database();"))
    seed = (ROOT / "supabase/tests/fixtures/billing_v2_legacy_seed.psql").read_text()
    helper = (ROOT / "supabase/tests/fixtures/billing_cross_ledger_helpers.psql").read_text()
    fixture = (seed + helper).replace("pg_temp.", "billing_db02_test.")
    fixture = fixture.replace("create temp table actors", "create table billing_db02_test.actors")
    sql("begin; create schema billing_db02_test;\n" + fixture + """
      select billing_db02_test.mapping(k,c,'test','synthetic-concurrency/'||k||'/'||c)
      from unnest(array['launch','growth','scale','coach-seat']) k
      cross join unnest(array['monthly','annual']) c;
      commit;
    """)

    for first, second in [("ls", "v2"), ("v2", "ls")]:
        u = owner()
        race(f"checkout {first} wins against {second}", checkout(u, first), checkout(u, second),
             "BILLING_GUARD_CHECKOUT_ALREADY_OPEN")
        assert sql(f"select (select count(*) from billing_checkout_attempts where billing_account_id='{account(u)}') + (select count(*) from billing_checkouts_v2 where billing_account_id='{account(u)}');") == "1"
        u, op = owner(), str(uuid.uuid4())
        race(f"checkout UUID reuse {first} to {second}", checkout(u, first, op), checkout(u, second, op),
             "BILLING_GUARD_OPERATION_CONFLICT")
        u, op = owner(), str(uuid.uuid4())
        race(f"compatible concurrent {first} checkout retry", checkout(u, first, op), checkout(u, first, op))
        assert sql(f"select (select count(*) from billing_checkout_attempts where billing_account_id='{account(u)}') + (select count(*) from billing_checkouts_v2 where billing_account_id='{account(u)}');") == "1"

    for first, second in [("ls", "v2"), ("v2", "ls")]:
        for kind, other in [("plan", "seat"), ("seat", "plan")]:
            u = owner(True)
            race(f"{first} {kind} excludes {second} {other}", operation(u, first, kind),
                 operation(u, second, other), "BILLING_GUARD_OPERATION_ALREADY_OPEN")

    # Foundation still forbids actual v2 links. Exercise the shared origin claim
    # race separately, without disabling the NULL-link constraint even in tests.
    for first, second in [("lemonsqueezy.v1", "billing.v2"), ("billing.v2", "lemonsqueezy.v1")]:
        u = owner()
        a = account(u)
        canonical = sql(f"""insert into account_subscriptions(billing_account_id,plan_version_id,
          subscription_kind,status,source,current_period_started_at,current_period_ends_at)
          select '{a}',id,'paid','active','manual',now(),now()+interval '30 days'
          from commercial_plan_versions where plan_key='growth' and status='active' returning id;""")
        race(f"canonical origin {first} excludes {second}",
             f"select billing_guard_claim_canonical('{a}','{canonical}','{first}');",
             f"select billing_guard_claim_canonical('{a}','{canonical}','{second}');",
             "BILLING_GUARD_CANONICAL_ALREADY_OWNED")
        assert sql(f"select storage_contract from billing_canonical_origins where account_subscription_id='{canonical}';") == first

    u = owner()
    mapping = sql("select id from billing_price_mappings where canonical_key='growth' and cadence='monthly' and environment='test' and status='active';")
    retire = f"update billing_price_mappings set status='retired',retired_at=now() where id='{mapping}';"
    race("admission locks mapping before retirement", checkout(u, "v2"), retire)
    # New active mapping, then retire while an admission has read it and waits.
    mapping = sql("select billing_db02_test.mapping('growth','monthly','test','synthetic-concurrency/replacement');")
    race("retirement wins before admission", f"update billing_price_mappings set status='retired',retired_at=now() where id='{mapping}';",
         checkout(owner(), "v2"), "BILLING_V2_MAPPING_UNAVAILABLE")
    sql("select billing_db02_test.mapping('growth','monthly','test','synthetic-concurrency/replacement-2');")

    seat = sql("select id from billing_price_mappings where canonical_key='coach-seat' and cadence='monthly' and environment='test' and status='active';")
    race("seat add-on retirement wins before admission",
         f"update billing_price_mappings set status='retired',retired_at=now() where id='{seat}';",
         f"select billing_v2_admit_checkout('{owner()}','test','growth','monthly',1,gen_random_uuid());",
         "BILLING_V2_MAPPING_UNAVAILABLE")
    sql("select billing_db02_test.mapping('coach-seat','monthly','test','synthetic-concurrency/seat-replacement');")

    # Same mapping retirement ordering applies to the legacy checkout entry.
    mapping = sql("select m.id from billing_provider_variant_mappings m join commercial_plan_versions p on p.id=m.plan_version_id where p.plan_key='growth' and m.cadence='monthly' and m.status='active';")
    race("legacy admission locks mapping before retirement", checkout(owner(), "ls"),
         f"update billing_provider_variant_mappings set status='retired',retired_at=now() where id='{mapping}';")
    # Restore synthetic fixture status for the remaining independent races.
    # Legacy mapping history rejects reactivation, so use scale for no further LS
    # admission: stale expiry race below starts v2 then has LS fail cross-ledger.

    u = owner()
    a = account(u)
    stale = sql(f"""insert into billing_checkouts_v2(billing_account_id,created_by_user_id,operation_id,
      provider,environment,plan_version_id,cadence,base_mapping_id,status,created_at,expected_expires_at,creation_lease_expires_at)
      select '{a}','{u}',gen_random_uuid(),'paddle','test',plan_version_id,'monthly',id,'creating',
      now()-interval '1 hour',now()-interval '1 minute',now()-interval '30 minutes'
      from billing_price_mappings where canonical_key='growth' and cadence='monthly' and status='active' returning id;""")
    race("stale expiration and competing admission", checkout(u, "v2"), checkout(u, "ls"),
         "BILLING_GUARD_CHECKOUT_ALREADY_OPEN")
    assert sql(f"select status from billing_checkouts_v2 where id='{stale}';") == "expired"
    assert sql(f"select count(*) from billing_checkouts_v2 where billing_account_id='{a}' and status='creating';") == "1"

    # Unsupported row-first writer must fail NOWAIT, not form a row/account cycle.
    u = owner()
    intent = sql(checkout(u, "v2"))
    a, b = Session(), Session()
    try:
        a.execute(f"select billing_guard_lock('{account(u)}');")
        b.send(f"update billing_checkouts_v2 set status='failed',failed_at=now() where id='{intent}';")
        b.collect("55P03")
        a.execute(f"update billing_checkouts_v2 set status='failed',failed_at=now() where id='{intent}'; commit;")
        RESULTS.append({"case": "row-first inversion fails NOWAIT", "result": "pass", "contender": "55P03"})
    finally:
        a.close()
        b.close()

    race("policy flip waits for admitted transaction", checkout(owner(), "v2"),
         "update billing_runtime_policy set entitlement_environment='live';")
    a = Session()
    try:
        a.send(checkout(owner(), "v2"))
        a.collect("BILLING_GUARD_ENVIRONMENT_MISMATCH")
    finally:
        a.close()
    sql("update billing_runtime_policy set entitlement_environment='test';")

    for isolation in ["repeatable read", "serializable"]:
        a = Session()
        try:
            a.send(f"set transaction isolation level {isolation}; select billing_guard_lock('{account(u)}');")
            a.collect("25001")
            RESULTS.append({"case": isolation + " fails closed", "result": "pass", "contender": "25001"})
        finally:
            a.close()

    assert sql("select count(*) from billing_runtime_policy where paddle_sales_enabled or paddle_reconciliation_enabled;") == "0"
    assert sql("select count(*) from billing_subscriptions_v2 where account_subscription_id is not null or approved_additional_coach_seats<>0;") == "0"
    deadlocks = int(sql("select deadlocks from pg_stat_database where datname=current_database();")) - deadlocks_before
    assert deadlocks == 0, deadlocks
    print(json.dumps({"container": CONTAINER, "cases": RESULTS, "deadlocks": deadlocks,
                      "paddle_flags_disabled": True, "canonical_and_seat_hard_stops": True}, indent=2))


if __name__ == "__main__":
    main()
