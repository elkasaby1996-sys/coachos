"""Populated retirement proof; only the fixed disposable local proof container.

Reconstruct through 20260920221934 first. Runs historical pgTAP and fixture
races, checks open-fixture rollback, then applies the real retirement migration.
Never accepts a URL or remote/container override. Reset local DB afterward.
"""
import importlib.util
import json
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    'fixture_races', ROOT / 'scripts/test-paddle-cert-fixture-concurrency.py')
fixture_races = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture_races)
r = fixture_races.r
MIGRATION = ROOT / 'supabase/migrations/20260922094541_paddle_certification_fixture_authority_retirement.sql'


def expand(path):
    return re.sub(r'^\\ir (.+)$', lambda m: expand(path.parent / m[1].strip()),
                  path.read_text(encoding='utf-8-sig'), flags=re.M)


def snapshot():
    # Compare every public table's complete rows, not merely counts. This also
    # freezes LS, canonical subscriptions, policy, checkout and all evidence.
    tables = r.sql("select tablename from pg_tables where schemaname='public' order by tablename;").splitlines()
    rows = {t: r.sql(f'''select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public."{t}" t;''') for t in tables}
    rows['auth_metadata'] = r.sql('select jsonb_agg(jsonb_build_array(id,raw_app_meta_data) order by id) from auth.users;')
    rows['entitlements'] = r.sql("select jsonb_agg(resolve_account_entitlements(id)-'computedAt' order by id) from billing_accounts;")
    rows['capacity'] = r.sql("select jsonb_agg(resolve_account_capacity(owner_user_id,id)-'computedAt' order by id) from billing_accounts;")
    rows['table_security'] = r.sql("select jsonb_agg(jsonb_build_array(oid,relname,relacl,relrowsecurity,relforcerowsecurity) order by oid) from pg_class where relnamespace='public'::regnamespace;")
    rows['triggers'] = r.sql("select jsonb_agg(jsonb_build_array(t.oid,pg_get_triggerdef(t.oid),t.tgenabled) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace;")
    rows['policies'] = r.sql("select jsonb_agg(to_jsonb(p) order by policyname,tablename) from pg_policies p where schemaname='public';")
    rows['surviving_functions'] = r.sql("select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),proacl) order by p.oid) from pg_proc p where pronamespace='public'::regnamespace and prokind='f' and proname not in ('create_paddle_checkout_certification_fixture_v1','close_paddle_checkout_certification_fixture_v1','billing_paddle_certification_gate_v1');")
    return rows


def main():
    assert r.sql('select count(*) from auth.users;') == '0', 'Reset isolated proof DB first'
    historical = r.sql(expand(ROOT / 'supabase/tests/fixtures/paddle_certification_before_retirement.psql'))
    assert not re.search(r'(?m)^not ok', historical), historical
    historical_total = len(re.findall(r'(?m)^ok \d+', historical))
    assert historical_total > 0
    print(f'Historical pgTAP: {historical_total} passed', flush=True)
    fixture_races.main()
    migration = MIGRATION.read_text(encoding='utf-8-sig')
    before = snapshot()
    try:
        r.sql(migration)
        raise AssertionError('Open fixtures unexpectedly admitted retirement')
    except AssertionError as error:
        assert 'PADDLE_CERTIFICATION_OPEN_FIXTURE_BLOCKS_RETIREMENT' in str(error), str(error)
    assert before == snapshot(), 'Rejected migration changed evidence or authority'
    r.sql('select close_paddle_checkout_certification_fixture_v1(run_id) from billing_paddle_checkout_certification_fixtures where closed_at is null;')

    # A write that has not committed must also block retirement. Observe a real
    # table-lock wait, commit the fixture, and require migration failure.
    owner = r.sql('select paddle_cert_fixture_test.cert_owner();')
    run = uuid.uuid4()
    a, b = r.Session(), r.Session()
    try:
        a.execute(f"select create_paddle_checkout_certification_fixture_v1('{owner}','growth','monthly',0,'{run}');")
        b.send(migration)
        r.blocked(b)
        a.execute('commit;')
        b.collect('PADDLE_CERTIFICATION_OPEN_FIXTURE_BLOCKS_RETIREMENT')
    finally:
        a.close()
        b.close()
    r.sql(f"select close_paddle_checkout_certification_fixture_v1('{run}');")
    before = snapshot()
    assert int(r.sql('select count(*) from billing_paddle_checkout_certification_fixtures;')) > 0
    assert r.sql('select count(*) from billing_paddle_checkout_certification_fixtures where closed_at is null;') == '0'
    r.sql(migration)
    assert before == snapshot(), 'Retirement modified historical data, grants, triggers, policy or surviving routines'

    deadlocks = r.sql('select deadlocks from pg_stat_database where datname=current_database();')
    # Concurrent attempts against retired authority/history must all fail.
    attempts = [
        ("select create_paddle_checkout_certification_fixture_v1(null::uuid,'growth','monthly',0,null::uuid);", '42883'),
        ('select close_paddle_checkout_certification_fixture_v1(null::uuid);', '42883'),
        ('update billing_paddle_checkout_certification_fixtures set closed_at=null;', '42501'),
        ('delete from billing_paddle_checkout_certification_fixtures;', '42501'),
        ('truncate billing_paddle_checkout_certification_fixtures;', '42501'),
    ]
    for role in ('service_role', 'authenticated', 'anon'):
        for statement, code in attempts:
            sessions = [r.Session(), r.Session()]
            try:
                for session in sessions:
                    session.send(f'set local role {role}; {statement}')
                for session in sessions:
                    session.collect(code)
            finally:
                for session in sessions:
                    session.close()
    assert before == snapshot()
    assert deadlocks == r.sql('select deadlocks from pg_stat_database where datname=current_database();')
    print(json.dumps({'historicalPgTap': historical_total, 'fixtureRaces': len(r.RESULTS),
                      'retirementLockRaces': 1, 'concurrentDenialPairs': 15,
                      'deadlocks': 0, 'changedHistoricalRows': 0, 'privilegeChanges': 0,
                      'entitlementCapacityChanges': 0, 'providerCalls': 0}), flush=True)


if __name__ == '__main__':
    main()
