"""PAY-03B pre-launch authority retirement/populated upgrade. Local only."""
import importlib.util
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = "20261001224659_lemon_squeezy_retirement_disposition.sql"
CHANGED = {
    "billing_guard_expire_checkouts", "resolve_account_entitlements",
    "billing_legacy_seat_effective_limit", "billing_seat_effective_limit",
    "billing_plan_change_capacity_limit", "billing_plan_change_preflight",
    "get_my_billing_plan_change_state", "get_my_billing_seat_quantity_state",
}


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    harness = load("test-paddle-reconciliation-regressions")
    r = load("test-billing-cross-ledger-concurrency")
    r.COMMAND[3] = harness.CONTAINER
    # Never accepts URLs, project refs, arbitrary workdirs or containers.
    harness.assert_local()
    destination = harness.WORK / "supabase/migrations"
    assert destination.resolve().is_relative_to(harness.WORK.resolve())
    source = ROOT / "supabase/migrations"
    paths = sorted(source.glob("*.sql"))
    assert len(paths) == 186 and paths[184].name == MIGRATION
    # The candidate is corrected in place; every reviewed predecessor is immutable.
    for path in paths[:184]:
        original = subprocess.run(["git", "show", "HEAD:supabase/migrations/" + path.name],
                                  cwd=ROOT, capture_output=True, check=True).stdout
        assert original.replace(b"\r\n", b"\n") == path.read_bytes().replace(b"\r\n", b"\n"), path.name
    assert not ({p.name for p in destination.glob("*.sql")} - {p.name for p in source.glob("*.sql")})
    for path in source.glob("*.sql"):
        shutil.copyfile(path, destination / path.name)
    # Exercise the retirement boundary alone before the independent PAY-04
    # commercial upgrade. Hold only the known 186 copy outside migrations.
    later = destination / paths[185].name
    held = harness.WORK / "held-pay04-migration-186.sql"
    assert later.resolve().is_relative_to(harness.WORK.resolve()) and not held.exists()
    shutil.move(later, held)

    def functions():
        return json.loads(r.sql("""select jsonb_object_agg(signature,definition) from (
select p.oid::regprocedure::text signature,jsonb_build_object('body',pg_get_functiondef(p.oid),'acl',p.proacl) definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') q;"""))

    def data():
        tables = json.loads(r.sql("select jsonb_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='public' or schemaname='auth' and tablename='users';"))
        queries = [f"select '{name}' name,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from {name} t" for name in tables]
        return r.sql("select jsonb_object_agg(name,digest) from (" + " union all ".join(queries) + ") q;")

    def authority():
        return r.sql("""select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_array(c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v')),
 'constraints',(select jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid)) order by conrelid::regclass::text,conname) from pg_constraint where connamespace='public'::regnamespace),
 'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by oid) from pg_trigger where tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace) and not tgisinternal));""")

    try:
        results = []
        for population in ("terminal", "nonterminal", "mixed-environment-terminal"):
            harness.reset("20261001162923")
            fixture = (ROOT / "supabase/tests/fixtures/lemon_squeezy_retirement_history.psql").read_text()
            extra = ""
            if population == "mixed-environment-terminal":
                extra = """select pg_temp.retirement_live_mappings();
update billing_runtime_policy set entitlement_environment='live';
insert into actors(name,id) values('live-terminal',pg_temp.coach('growth','monthly','live'));
select pg_temp.retirement_close(id) from actors where name='live-terminal';
update billing_runtime_policy set entitlement_environment='test';"""
            if population == "nonterminal":
                extra = """insert into actors(name,id) values('pending',pg_temp.coach('growth'));
select public.begin_billing_plan_change(id,'test','scale','monthly',operation,pg_temp.snapshot(id)) from actors where name='pending';
update billing_provider_webhook_deliveries set processing_status='deferred',processed_at=null,last_error_code='BILLING_RECONCILIATION_DEFERRED' where id=(select delivery from retirement_anchor);"""
            # All legacy servicing is fixture creation at the immutable 184
            # boundary, never application authority after retirement.
            paddle = """
create temp table upgrade_owners(name text,u uuid);
insert into upgrade_owners values('trial',pg_temp.guard_owner()),('free',pg_temp.guard_owner()),('paddle',pg_temp.plan_owner());
select public.start_account_trial_for_owner(u,'first_workspace') from upgrade_owners where name='trial';
"""
            includes = ["billing_catalogue_fixture", "billing_cross_ledger_helpers", "paddle_webhook_fixture",
                        "paddle_auto_reconciliation_fixture", "paddle_lifecycle_fixture", "paddle_plan_change_fixture",
                        "paddle_existing_historical_owner"]
            setup = "\n".join((ROOT / "supabase/tests/fixtures" / (name + ".psql")).read_text() for name in includes)
            r.sql("begin;" + fixture + extra + setup + """
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_reconciliation_enabled=true;
""" + paddle + "select pg_temp.paddle_existing_historical_owner(id) from actors where name='terminal-checkout';commit;")
            before_functions, before_data, before_authority = functions(), data(), authority()
            result = subprocess.run(harness.cli_command("migration", "up", "--local", "--yes", "--workdir", str(harness.WORK)), capture_output=True, text=True, timeout=240)
            assert result.returncode == 0, result.stderr
            after_functions = functions()
            assert before_data == data(), "Upgrade rewrote populated evidence/identity/history"
            assert before_authority == authority(), "Upgrade changed existing ACLs, checks or triggers"
            assert set(after_functions) == set(before_functions), "Unexpected function addition/removal"
            actual_changed = {k.split('(')[0] for k,v in before_functions.items() if after_functions[k]['body'] != v['body']}
            assert actual_changed == CHANGED, actual_changed
            retired = set(json.loads((ROOT / "supabase/tests/fixtures/lemon_squeezy_retired_functions.json").read_text()))
            for signature,v in before_functions.items():
                if signature not in retired:
                    assert after_functions[signature]['acl'] == v['acl'], signature
            assert r.sql("select count(*) from pg_proc where proname='inspect_lemon_squeezy_retirement_disposition_v1';") == '0'
            assert r.sql("select count(*) from pg_proc where oid in (" + ','.join("'public."+x+"'::regprocedure" for x in retired) + ") and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute') or has_function_privilege('service_role',oid,'execute'));") == '0'
            assert r.sql("select bool_and((resolve_account_entitlements(a.id)->>'billingUnavailable')::boolean) from billing_accounts a join billing_provider_subscriptions b on b.billing_account_id=a.id where b.account_subscription_id=(resolve_account_entitlements(a.id)#>>'{subscription,id}')::uuid;") == 't'
            assert r.sql("select bool_and(resolve_account_entitlements(a.id)#>>'{subscription,effectiveStatus}'='active') from billing_accounts a join billing_subscriptions_v2 s on s.billing_account_id=a.id where s.account_subscription_id is not null;") == 't'
            assert r.sql("select count(*) from billing_plan_change_operations where status='completed';") == "1"
            assert r.sql("select count(*) from billing_seat_quantity_operations where status='completed';") == "1"
            # Reading shared state is independently proven not to mutate any row.
            assert before_data == data()
            mixed_origins = r.sql("select count(*) from (select billing_account_id from billing_canonical_origins group by billing_account_id having count(distinct storage_contract)=2) q;")
            assert mixed_origins == '1', 'Same-account mixed-history fixture must be non-vacuous'
            results.append({"population": population, "dataAndIdentityHashesUnchanged": True,
                            "tableACLsConstraintsTriggersUnchanged": True,
                            "onlyReviewedFunctionBodiesChanged": sorted(actual_changed),
                            "nativeApplicationAuthority": 0, "terminalOperationsReadable": True,
                            "sameAccountMixedHistoricalOrigins": True,
                            "allTableValueHashesBefore": json.loads(before_data),
                            "allTableValueHashesAfter": json.loads(data())})
            # Independent commercial 185 -> 186 upgrade: no retirement scope
            # expansion, row rewrite, existing ACL change or table redesign.
            shutil.copyfile(held, later)
            commercial_before, commercial_data, commercial_authority = functions(), data(), authority()
            result = subprocess.run(harness.cli_command("migration", "up", "--local", "--yes", "--workdir", str(harness.WORK)), capture_output=True, text=True, timeout=240)
            assert result.returncode == 0, result.stderr
            commercial_after = functions()
            assert commercial_data == data(), "Commercial upgrade rewrote retained rows"
            assert commercial_authority == authority(), "Commercial upgrade altered table security/schema"
            expected_changed = {"billing_paddle_initial_proof_v1", "billing_paddle_initial_item_guard_v1",
                "reconcile_paddle_initial_purchase_v1", "billing_paddle_initial_period_facts_v1",
                "resolve_account_entitlements", "billing_plan_change_preflight", "billing_seat_effective_limit",
                "get_my_billing_plan_change_state", "get_my_billing_seat_quantity_state"}
            actual_commercial_changed = {k.split('(')[0] for k,v in commercial_before.items() if commercial_after[k]['body'] != v['body']}
            assert actual_commercial_changed == expected_changed, actual_commercial_changed
            for signature,v in commercial_before.items():
                assert commercial_after[signature]['acl'] == v['acl'], signature
            new_helpers = {k.split('(')[0] for k in set(commercial_after)-set(commercial_before)}
            assert new_helpers == {"billing_paddle_initial_period_matches_v1", "billing_paddle_paid_state_v1",
                "billing_paid_state_v1", "billing_workflow_provider_v1", "billing_paddle_plan_state_v1", "billing_paddle_seat_state_v1"}, new_helpers
            assert r.sql("select count(*) from pg_proc where oid in (" + ','.join("'public."+x+"'::regprocedure" for x in retired) + ") and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute') or has_function_privilege('service_role',oid,'execute'));") == '0'
            assert r.sql("select bool_and(resolve_account_entitlements(a.id)#>>'{subscription,effectiveStatus}'='active') from billing_accounts a join billing_subscriptions_v2 s on s.billing_account_id=a.id where s.account_subscription_id is not null;") == 't'
            assert commercial_data == data(), "Normalized shared readers mutated rows"
            results[-1]['commercial185to186'] = {"allTableHashesBefore": json.loads(commercial_data), "allTableHashesAfter": json.loads(data()),
                "existingFunctionACLsUnchanged": True, "tableACLsConstraintsTriggersUnchanged": True,
                "changedBodies": sorted(actual_commercial_changed), "newBoundedHelpers": sorted(new_helpers), "nativeApplicationAuthority": 0}
            later.unlink()
        evidence = os.environ.get('PAY03B_EVIDENCE_DIR')
        if evidence:
            target = Path(evidence).resolve()
            assert target.is_absolute() and target.is_dir() and not target.is_relative_to(ROOT)
            (target / 'populated-upgrade-retirement-results.json').write_text(json.dumps(results,indent=2)+'\n')
        print(json.dumps({"historicalMigrationsUnchanged": 184, "migrationCount": 186, "retirementScope": "prelaunch-authority",
                          "populations": [{k:({ck:cv for ck,cv in v.items() if not ck.startswith('allTableHashes')} if k=='commercial185to186' else v) for k,v in result.items() if not k.startswith('allTableValueHashes')} for result in results], "providerCalls": 0}))
    finally:
        if later.exists():
            later.unlink()
        shutil.move(held, later)
        harness.reset()


if __name__ == "__main__":
    main()
