// One reviewed DDL patch and reconciliation of one genuine retained fixture
// event. No provider writes, new dispatch, synthetic receipts or history repair.
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { installationSource } from "./staging-initial-install.mjs";
import { validatePilotContext } from "./staging-sandbox-pilot.mjs";
import { protectedOwnerQuery } from "./staging-payment-method-fixture.mjs";
import {
  STAGING_PROJECT,
  readBoundedStagingJson,
} from "./staging-billing-status.mjs";
import { BILLING_APPROVED_PATCH_MIGRATIONS } from "./billing-deployment-contract.mjs";
import { verifyPathBoundary } from "./staging-release-artifacts.mjs";
import { hash, validateDryRun } from "./billing-retirement-release.mjs";
import { guardedExitCode } from "./supabase-remote-guard.mjs";

export const METHOD_BEFORE_SHA =
  "b45fa6dc58922407232bcac5a6039f825154487431fddbc40a15e1966089758d";
export const METHOD_AFTER_SHA =
  "8fff54528ed26dd67e3c0f4330ffd1608e89577f795e5d072f0f311e3bb14bee";
export const METHOD_SCHEMA_QUERY = `select encode(extensions.digest(pg_get_functiondef('public.reconcile_billing_payment_method_preparation_v1(uuid)'::regprocedure),'sha256'),'hex') definition_sha256,
 prosecdef,proconfig,proacl::text from pg_proc where oid='public.reconcile_billing_payment_method_preparation_v1(uuid)'::regprocedure;`;
const check = (ok, code) => {
  if (!ok) throw new Error(code);
};
const uuid = (s) =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    s,
  );
export function methodFixtureQuery(owner) {
  check(uuid(owner), "METHOD_PATCH_OWNER_INVALID");
  return `with b as (select b.* from public.billing_accounts b join auth.users u on u.id=b.owner_user_id
    where u.id='${owner}' and u.raw_app_meta_data->>'repsync_sandbox_fixture'='payment-method-v1'),
  p as (select p.* from public.billing_payment_method_preparations_v2 p join b on b.id=p.billing_account_id),
  e as (select e.*,o.observation from public.billing_webhook_events_v2 e join public.billing_paddle_event_observations o on o.event_id=e.id
    join p on p.provider_transaction_ref=o.observation->>'transactionRef'
    where e.provider=p.provider and e.environment=p.environment and e.provider_event_name='transaction.completed'
     and o.observation->>'kind'='transaction.completed' and o.observation->>'origin'='subscription_payment_method_change')
  select (select count(*)::int from b) accounts,(select count(*)::int from p) preparations,
    (select count(*)::int from e) events,(select min(id::text) from e) event_id,
    (select min(status) from p) status,
    (select count(*)::int from public.billing_operations_v2 o join b on b.id=o.billing_account_id where o.status not in ('completed','canceled','failed')) unresolved_operations,
    (select count(*)::int from public.billing_seat_quantity_operations o join b on b.id=o.billing_account_id where o.status not in ('completed','canceled','failed')) unresolved_legacy_operations,
    (select count(*)::int from public.billing_payment_applications_v2 a join b on b.id=a.billing_account_id) payments,
    (select encode(extensions.digest(coalesce(string_agg(to_jsonb(a)::text,'' order by a.id),''),'sha256'),'hex')
     from public.billing_payment_applications_v2 a join b on b.id=a.billing_account_id) payment_fingerprint,
    (select count(*)::int from p join e on p.terminal_event_id=e.id where p.status='completed' and p.completed_at is not null
      and p.mode='update_only' and p.completion_application_id is null and e.processing_status='processed' and e.processed_at is not null) verified_completions,
    (select count(*)::int from p where p.mode='update_only' and p.environment='test' and p.provider='paddle'
      and p.provider_requested_at is not null and p.dispatch_token_sha256 is not null and p.provider_transaction_ref is not null
      and p.validator_version='paddle-payment-method-transaction-v1' and p.expected_obligation_transaction_ref is null) bound_updates;`;
}
export function validateMethodFixture(r, completed = false) {
  check(
    r?.accounts === 1 &&
      r.preparations === 1 &&
      r.events === 1 &&
      uuid(r.event_id) &&
      r.unresolved_operations === 0 &&
      r.unresolved_legacy_operations === 0 &&
      r.payments === 1 &&
      r.bound_updates === 1 &&
      /^[a-f0-9]{64}$/.test(r.payment_fingerprint) &&
      (completed
        ? r.status === "completed" && r.verified_completions === 1
        : r.status === "ready" && r.verified_completions === 0),
    "METHOD_PATCH_FIXTURE_CONFLICT",
  );
}
export function methodReconcileQuery(owner, original, fingerprint, event) {
  check(
    uuid(owner) &&
      uuid(original) &&
      owner !== original &&
      uuid(event) &&
      /^[a-f0-9]{64}$/.test(fingerprint),
    "METHOD_PATCH_SCOPE_INVALID",
  );
  return `begin isolation level read committed;
set local lock_timeout='5s'; set local statement_timeout='30s';
do $repair$ declare fixture record; preserved text; outcome jsonb; begin
 perform 1 from public.billing_runtime_policy where id=1 and entitlement_environment='test' and paddle_reconciliation_enabled for share;
 if not found then raise exception 'METHOD_PATCH_POLICY_CHANGED';end if;
 perform public.billing_guard_lock(id,'test') from public.billing_accounts where owner_user_id='${owner}';
 select fingerprint into preserved from (${protectedOwnerQuery(original).replace(/;$/, "")}) original;
 if preserved is distinct from '${fingerprint}' then raise exception 'METHOD_PATCH_ORIGINAL_CHANGED';end if;
 select * into fixture from (${methodFixtureQuery(owner).replace(/;$/, "")}) checked;
 if fixture.accounts<>1 or fixture.preparations<>1 or fixture.events<>1 or fixture.event_id is distinct from '${event}'
  or fixture.status<>'ready' or fixture.unresolved_operations<>0 or fixture.unresolved_legacy_operations<>0
  or fixture.payments<>1 or fixture.bound_updates<>1 or fixture.verified_completions<>0 then raise exception 'METHOD_PATCH_FIXTURE_CHANGED';end if;
 outcome:=public.reconcile_billing_payment_method_preparation_v1('${event}');
 if outcome->>'status' is distinct from 'completed' then raise exception 'METHOD_PATCH_NOT_COMPLETED';end if;
 -- Replaying the same authenticated receipt must be a no-op in this transaction.
 if public.reconcile_billing_payment_method_preparation_v1('${event}')->>'status' is distinct from 'reused'
 then raise exception 'METHOD_PATCH_RETRY_CONFLICT';end if;
end $repair$; commit;`;
}
export function patchArtifact(root, approved) {
  const directory = mkdtempSync(join(tmpdir(), "repsync-method-patch-"));
  const migrations = [...approved, ...BILLING_APPROVED_PATCH_MIGRATIONS];
  mkdirSync(join(directory, "supabase/migrations"), { recursive: true });
  for (const m of migrations) {
    const source = join(root, "supabase/migrations", m.filename);
    verifyPathBoundary(root, source);
    const contents = readFileSync(source, "utf8").replace(/\r\n/g, "\n");
    check(hash(contents) === m.sha256, "METHOD_PATCH_ARTIFACT_DRIFT");
    writeFileSync(join(directory, "supabase/migrations", m.filename), contents);
  }
  const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
  writeFileSync(join(directory, "supabase/config.toml"), config);
  const verify = () => {
    const names = readdirSync(join(directory, "supabase/migrations")).sort();
    check(
      JSON.stringify(names) ===
        JSON.stringify(migrations.map((m) => m.filename)),
      "METHOD_PATCH_ARTIFACT_DRIFT",
    );
    for (const m of migrations) {
      const path = join(directory, "supabase/migrations", m.filename);
      verifyPathBoundary(directory, path);
      check(
        hash(readFileSync(path, "utf8")) === m.sha256,
        "METHOD_PATCH_ARTIFACT_DRIFT",
      );
    }
    verifyPathBoundary(directory, join(directory, "supabase/config.toml"));
    check(
      readFileSync(join(directory, "supabase/config.toml"), "utf8") === config,
      "METHOD_PATCH_ARTIFACT_DRIFT",
    );
  };
  return {
    directory,
    migrations,
    verify,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
export async function runPaymentMethodPatch({
  env = process.env,
  root = process.cwd(),
  transport = fetch,
  readSource = () => installationSource(root),
  cli = (args, cwd) => {
    const result = spawnSync(
      process.execPath,
      [join(root, "scripts/supabase-remote-guard.mjs"), ...args],
      {
        cwd,
        env,
        encoding: "utf8",
        shell: false,
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    check(guardedExitCode(result) === 0, "METHOD_PATCH_CLI_FAILED");
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  },
} = {}) {
  const report = {
    status: "blocked",
    stage: "context",
    project: STAGING_PROJECT,
    migrationMayHaveApplied: false,
    reconciliationMayHaveCommitted: false,
    originalPreserved: false,
    paymentMethodVerified: false,
    paymentRecoveryVerified: false,
  };
  let artifact;
  try {
    const source = readSource();
    validatePilotContext(env, source, "pause_checkout");
    const owner = env.STAGING_FIXTURE_USER_ID,
      original = env.STAGING_PILOT_USER_ID;
    check(
      uuid(owner) && owner !== original,
      "METHOD_PATCH_DISTINCT_OWNER_REQUIRED",
    );
    check(
      Boolean(env.SUPABASE_DB_PASSWORD?.trim()),
      "METHOD_PATCH_DB_CAPABILITY_REQUIRED",
    );
    const assertSource = () => {
      const current = readSource();
      validatePilotContext(env, current, "pause_checkout");
      check(
        current.identity.payload.digest === source.identity.payload.digest &&
          current.commit === source.commit,
        "METHOD_PATCH_SOURCE_CHANGED",
      );
    };
    const sql = async (query, write = false) => {
      const response = await transport(
        `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/database/query${write ? "" : "/read-only"}`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(45_000),
          headers: {
            Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        },
      );
      check(response.ok, "METHOD_PATCH_DATABASE_REQUEST_FAILED");
      return readBoundedStagingJson(response);
    };
    const historyQuery =
      "select version from supabase_migrations.schema_migrations order by version;";
    const versions = source.identity.manifest.migrations.approved.map((m) =>
      m.filename.slice(0, 14),
    );
    report.commit = source.commit;
    report.payloadSha256 = source.identity.payload.digest;
    report.patch = BILLING_APPROVED_PATCH_MIGRATIONS;
    report.stage = "verify_baseline_and_retained_fixture";
    check(
      JSON.stringify((await sql(historyQuery)).map((r) => r.version)) ===
        JSON.stringify(versions),
      "METHOD_PATCH_LEDGER_MISMATCH",
    );
    const beforeSchema = (await sql(METHOD_SCHEMA_QUERY))?.[0];
    check(
      beforeSchema?.definition_sha256 === METHOD_BEFORE_SHA &&
        beforeSchema.prosecdef === true &&
        JSON.stringify(beforeSchema.proconfig) ===
          '["search_path=pg_catalog, public"]' &&
        beforeSchema.proacl === "{postgres=X/postgres,service_role=X/postgres}",
      "METHOD_PATCH_SCHEMA_MISMATCH",
    );
    const protectedBefore = (await sql(protectedOwnerQuery(original)))?.[0];
    check(
      protectedBefore?.environment === "test" &&
        protectedBefore.accounts === 1 &&
        protectedBefore.users === 1 &&
        protectedBefore.reductions === 1 &&
        /^[a-f0-9]{64}$/.test(protectedBefore.fingerprint),
      "METHOD_PATCH_ORIGINAL_NOT_CONFIRMED",
    );
    const before = (await sql(methodFixtureQuery(owner)))?.[0];
    validateMethodFixture(before);
    artifact = patchArtifact(
      root,
      source.identity.manifest.migrations.approved,
    );
    report.stage = "link_exact_staging_project";
    assertSource();
    artifact.verify();
    cli(["link", "--project-ref", STAGING_PROJECT], artifact.directory);
    report.stage = "dry_run_exact_patch";
    assertSource();
    artifact.verify();
    validateDryRun(
      cli(["db", "push", "--linked", "--dry-run"], artifact.directory),
      BILLING_APPROVED_PATCH_MIGRATIONS.map((m) => m.filename),
    );
    // Fail closed if history moved after dry-run. The DDL has its own exact
    // prior-definition guard; a concurrent deployment cannot silently rebase it.
    check(
      JSON.stringify((await sql(historyQuery)).map((r) => r.version)) ===
        JSON.stringify(versions),
      "METHOD_PATCH_LEDGER_CHANGED",
    );
    report.stage = "apply_exact_patch";
    assertSource();
    artifact.verify();
    report.migrationMayHaveApplied = true;
    cli(["db", "push", "--linked", "--yes"], artifact.directory);
    report.stage = "verify_patched_schema";
    check(
      JSON.stringify((await sql(historyQuery)).map((r) => r.version)) ===
        JSON.stringify(artifact.migrations.map((m) => m.filename.slice(0, 14))),
      "METHOD_PATCH_LEDGER_MISMATCH",
    );
    const afterSchema = (await sql(METHOD_SCHEMA_QUERY))?.[0];
    check(
      afterSchema?.definition_sha256 === METHOD_AFTER_SHA &&
        afterSchema.prosecdef === beforeSchema.prosecdef &&
        afterSchema.proacl === beforeSchema.proacl &&
        JSON.stringify(afterSchema.proconfig) ===
          JSON.stringify(beforeSchema.proconfig),
      "METHOD_PATCH_SCHEMA_MISMATCH",
    );
    check(
      (await sql(protectedOwnerQuery(original)))?.[0]?.fingerprint ===
        protectedBefore.fingerprint,
      "METHOD_PATCH_ORIGINAL_CHANGED",
    );
    report.stage = "reconcile_only_retained_fixture_completion";
    assertSource();
    artifact.verify();
    report.reconciliationMayHaveCommitted = true;
    await sql(
      methodReconcileQuery(
        owner,
        original,
        protectedBefore.fingerprint,
        before.event_id,
      ),
      true,
    );
    report.stage = "verify_provider_and_server_completion";
    const after = (await sql(methodFixtureQuery(owner)))?.[0];
    validateMethodFixture(after, true);
    check(
      after.payment_fingerprint === before.payment_fingerprint &&
        after.event_id === before.event_id,
      "METHOD_PATCH_FINANCIAL_HISTORY_CHANGED",
    );
    check(
      (await sql(protectedOwnerQuery(original)))?.[0]?.fingerprint ===
        protectedBefore.fingerprint,
      "METHOD_PATCH_ORIGINAL_CHANGED",
    );
    report.originalPreserved = true;
    report.originalFingerprint = protectedBefore.fingerprint;
    report.paymentMethodVerified = true;
    report.nonfinancialCompletion = true;
    report.exactRetryReused = true;
    report.definitionSha256 = afterSchema.definition_sha256;
    report.status = "payment_method_completion_verified";
    report.stage = "complete";
  } catch (error) {
    report.code = /^(METHOD_PATCH_|PILOT_|RETIREMENT_DRY_RUN_)[A-Z_]+$/.test(
      error?.message ?? "",
    )
      ? error.message
      : "METHOD_PATCH_FAILED";
  } finally {
    artifact?.cleanup();
  }
  return report;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await runPaymentMethodPatch();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "payment_method_completion_verified")
    process.exitCode = 1;
}
