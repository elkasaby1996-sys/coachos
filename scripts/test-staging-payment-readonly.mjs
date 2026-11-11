// Local-only regression: copy the prepared local DB into a disposable database.
// No connection URL, remote project or staging input is accepted.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import {
  sandboxPaymentQuery,
  summarizeSandboxPayment,
} from "./staging-sandbox-payment-status.mjs";

const database = `payment_inspect_${randomBytes(8).toString("hex")}`;
const container = "supabase_db_coachos";
const childEnv = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete childEnv[key];
function docker(args, input) {
  return execFileSync(
    "docker",
    ["--host=unix:///var/run/docker.sock", "exec", "-i", container, ...args],
    {
      input,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}
const sql = (query, db = database) =>
  docker(
    [
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      db,
    ],
    query,
  );
const fixture = (name) =>
  readFileSync(
    new URL(`../supabase/tests/fixtures/${name}.psql`, import.meta.url),
    "utf8",
  );
const queryFor = (uid) => sandboxPaymentQuery(uid);
let created = false;
try {
  const dump = docker(["pg_dump", "-U", "supabase_admin", "-d", "postgres"]);
  docker(["createdb", "-U", "supabase_admin", "-T", "template0", database]);
  created = true;
  sql(dump);
  const installed = new Set(
    sql("select version from supabase_migrations.schema_migrations;")
      .trim()
      .split("\n"),
  );
  for (const name of readdirSync(
    new URL("../supabase/migrations/", import.meta.url),
  ).sort()) {
    if (name.endsWith(".sql") && !installed.has(name.split("_")[0]))
      sql(
        readFileSync(
          new URL(`../supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
  }
  const permissions = `select has_function_privilege('supabase_read_only_user','public.resolve_account_entitlements(uuid)','EXECUTE'),has_function_privilege('supabase_read_only_user','public.billing_seat_effective_limit(uuid,boolean)','EXECUTE');`;
  assert.equal(sql(permissions).trim(), "f|f");
  for (const call of [
    "public.resolve_account_entitlements('00000000-0000-4000-8000-000000000099')",
    "public.billing_seat_effective_limit('00000000-0000-4000-8000-000000000099',false)",
  ]) {
    assert.throws(
      () =>
        sql(
          `\\set VERBOSITY verbose\nbegin read only; set local role supabase_read_only_user; select ${call};`,
        ),
      (error) =>
        error.stderr.includes("42501") &&
        error.stderr.includes("permission denied for function"),
    );
  }
  console.log(
    "PASS: both original private helper calls reproduce SQLSTATE 42501 under the restricted read-only role",
  );
  const setup = `begin; set local search_path=public,extensions;\n${fixture("billing_catalogue_fixture")}\n${fixture("billing_cross_ledger_helpers")}\n${fixture("paddle_webhook_fixture")}\n
select pg_temp.catalogue_publish(pg_temp.catalogue(k,c)) from unnest(array['launch','growth','scale','coach-seat']) k cross join unnest(array['monthly','annual']) c;
update billing_runtime_policy set paddle_sales_enabled=true,paddle_reconciliation_enabled=true;
create temp table attempt as select u,begin_paddle_checkout_v1(u,'growth','monthly',0,gen_random_uuid(),true,true,'2026-09-18','2026-09-18') result from (select pg_temp.guard_owner() u) x;
select mark_paddle_checkout_ready_v1(u,(result->>'attemptReference')::uuid,(result->>'operationReference')::uuid,'synthetic/transaction','ready','USD',jsonb_build_array(result->'base')) from attempt;
select pg_temp.webhook_ingest(pg_temp.webhook_observation());
select pg_temp.webhook_ingest(pg_temp.webhook_observation('subscription.created','synthetic/create','synthetic/create'));
select reconcile_paddle_initial_purchase_v1((select id from billing_subscriptions_v2 where provider_subscription_ref='synthetic/subscription'));
select 'OWNER='||u from attempt; commit;`;
  const uid = /OWNER=([0-9a-f-]{36})/.exec(sql(setup))?.[1];
  assert.ok(uid);
  function read(owner = uid) {
    return summarizeSandboxPayment(
      JSON.parse(
        sql(
          `begin read only; set local role supabase_read_only_user; ${queryFor(owner)} commit;`,
        ).trim(),
      ),
    );
  }
  const paid = read();
  assert.equal(paid.subscriptionPaymentVerified, true);
  assert.equal(paid.subscription.storedCoachSeatLimit, 2);
  assert.equal(paid.runtimeEntitlementsEvaluated, false);
  assert.equal(read("00000000-0000-4000-8000-000000000099").accountCount, 0);
  // Administrator-only synthetic stored-state variants in the disposable copy;
  // bypass fixture guards here, never widen the inspector's role or permissions.
  sql(`begin; set local session_replication_role=replica;
update billing_subscriptions_v2 set approved_additional_coach_seats=1 where provider_subscription_ref='synthetic/subscription';
insert into billing_operations_v2(operation_id,billing_account_id,subscription_id,provider,environment,source_account_subscription_id,operation_kind,source_base_mapping_id,target_base_mapping_id,source_seat_mapping_id,source_seat_mapping_kind,source_cadence,target_cadence,source_additional_seats,target_additional_seats,effective_timing,status,preflight_snapshot,created_by_user_id,effective_at)
select gen_random_uuid(),s.billing_account_id,s.id,'paddle','test',s.account_subscription_id,'seat_quantity',i.mapping_id,i.mapping_id,(select id from billing_price_mappings where canonical_key='coach-seat' and cadence='monthly' and environment='test' and status='active'),'addon','monthly','monthly',1,0,'period_end','scheduled','{"schemaVersion":1,"dimensions":[],"hasAnyDataQualityIssue":false}',a.owner_user_id,'2026-12-11T12:00:00Z'
from billing_subscriptions_v2 s join billing_accounts a on a.id=s.billing_account_id join billing_subscription_items_v2 i on i.subscription_id=s.id and i.item_role='base_plan' where s.provider_subscription_ref='synthetic/subscription'; commit;`);
  const scheduled = read();
  assert.equal(scheduled.subscription.storedCoachSeatLimit, 3);
  assert.equal(scheduled.subscription.approvedExtraSeats, 1);
  assert.equal(scheduled.seatOperations[0].targetExtraSeats, 0);
  assert.equal(
    scheduled.seatOperations[0].effectiveAt,
    "2026-12-11T12:00:00+00:00",
  );
  sql(
    `begin; set local session_replication_role=replica; update billing_operations_v2 set status='completed',completed_at=now(),provider_applied_at=now() where operation_kind='seat_quantity'; update billing_subscriptions_v2 set approved_additional_coach_seats=0 where provider_subscription_ref='synthetic/subscription'; commit;`,
  );
  assert.equal(read().subscription.storedCoachSeatLimit, 2);
  sql(
    `begin; set local session_replication_role=replica; update billing_subscriptions_v2 set account_subscription_id=null where provider_subscription_ref='synthetic/subscription'; commit;`,
  );
  assert.equal(read().subscriptionPaymentVerified, false);
  assert.equal(read().subscription.storedCoachSeatLimit, null);
  assert.equal(sql(permissions).trim(), "f|f");
  console.log(
    "PASS: actual stored payment proof, missing account, 0/1 approved seats, scheduled/completed reduction and missing link under BEGIN READ ONLY; private EXECUTE grants unchanged",
  );
} catch (error) {
  // These are synthetic local fixtures; still avoid printing raw SQL/data.
  console.error(
    "FAIL: local restricted-role payment regression",
    error.code ?? error.name,
  );
  process.exitCode = 1;
} finally {
  if (created) docker(["dropdb", "-U", "supabase_admin", "--force", database]);
}
