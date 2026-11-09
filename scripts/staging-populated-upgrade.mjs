// Feature-branch staging upgrade authorized by the existing GitHub environment
// review. The disabled legacy signed-founder release path remains separate.
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  installationSource,
  INITIAL_PUBLIC_SETTINGS,
} from "./staging-initial-install.mjs";
import {
  STAGING_PROJECT,
  STAGING_ORIGIN,
  inspectStagingBilling,
  readBoundedStagingJson,
} from "./staging-billing-status.mjs";
import {
  disposableArtifact,
  verifyMigrationDirectory,
  verifyFunctionDirectory,
} from "./staging-release-artifacts.mjs";
import { INVENTORY_QUERY } from "./billing-retirement-remote-inventory.mjs";
import {
  historyQuery,
  workQuery,
  normalizeFunctionInventory,
} from "./staging-release-observation.mjs";
import { WORK_DETAIL_QUERY } from "./staging-upgrade-readiness.mjs";
import { LS_TOMBSTONES } from "./billing-deployment-contract.mjs";
import { ledgerRowsDigest } from "./staging-backup-ledger.mjs";
import {
  verifyUpgradeSchema,
  safeSchemaResult,
  REVIEWED_STAGING_SCHEMA,
} from "./staging-upgrade-schema.mjs";
import {
  captureUpgradeRows,
  encryptUpgradeBackup,
  decryptUpgradeBackup,
  verifyUpgradeBackupLocally,
} from "./staging-upgrade-backup.mjs";
import { hash, validateDryRun } from "./billing-retirement-release.mjs";

export const UPGRADE_SCOPE = Object.freeze({
  repository: "elkasaby1996-sys/coachos",
  branch: "Ahmed-billing",
  environment: "supabase-staging",
  project: STAGING_PROJECT,
  origin: STAGING_ORIGIN,
  workflow: "Supabase Staging Billing Upgrade",
  workflowPath: ".github/workflows/supabase-staging-billing-upgrade.yml",
  cliVersion: "2.109.1",
});
const check = (condition, code) => {
  if (!condition) throw new Error(code);
};
const canonical = (value) => JSON.stringify(value);
const sorted = (value) =>
  Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
const one = (rows) => {
  check(
    Array.isArray(rows) && rows.length === 1 && rows[0],
    "UPGRADE_RESPONSE_INVALID",
  );
  return rows[0];
};
export const SEQUENCE_QUERY =
  "select count(*)::integer as count from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S';";
export const LEDGER_ROWS_QUERY =
  "select jsonb_agg(to_jsonb(m) order by version) as rows from supabase_migrations.schema_migrations m;";
const nowIso = () => new Date().toISOString();

export function validateUpgradeContext(env, source, action) {
  check(
    env.GITHUB_ACTIONS === "true" &&
      ["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) &&
      env.GITHUB_REPOSITORY === UPGRADE_SCOPE.repository &&
      env.GITHUB_REF === `refs/heads/${UPGRADE_SCOPE.branch}` &&
      env.GITHUB_WORKFLOW === UPGRADE_SCOPE.workflow &&
      env.GITHUB_WORKFLOW_REF ===
        `${UPGRADE_SCOPE.repository}/${UPGRADE_SCOPE.workflowPath}@refs/heads/${UPGRADE_SCOPE.branch}` &&
      env.STAGING_UPGRADE_ENVIRONMENT === UPGRADE_SCOPE.environment,
    "UPGRADE_PROTECTED_WORKFLOW_REQUIRED",
  );
  check(
    source.clean &&
      /^[a-f0-9]{40}$/.test(source.commit) &&
      env.GITHUB_SHA === source.commit,
    "UPGRADE_EXECUTION_COMMIT_MISMATCH",
  );
  check(
    env.STAGING_SUPABASE_PROJECT_REF === UPGRADE_SCOPE.project &&
      env.STAGING_APPLICATION_ORIGIN === UPGRADE_SCOPE.origin,
    "UPGRADE_TARGET_MISMATCH",
  );
  check(/^[0-9]+$/.test(env.GITHUB_RUN_ID ?? ""), "UPGRADE_RUN_ID_REQUIRED");
  check(
    /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? ""),
    "UPGRADE_RUN_ID_REQUIRED",
  );
  check(
    Boolean(env.SUPABASE_ACCESS_TOKEN?.trim()),
    "SUPABASE_ACCESS_TOKEN_MISSING",
  );
  check(Boolean(env.SUPABASE_DB_PASSWORD), "SUPABASE_DB_PASSWORD_MISSING");
  if (action === "apply") {
    check(
      env.ALLOW_REMOTE_SUPABASE === "I_UNDERSTAND_THIS_TOUCHES_REMOTE" &&
        env.SUPABASE_PROJECT_REF === UPGRADE_SCOPE.project,
      "UPGRADE_REMOTE_WRITE_NOT_ENABLED",
    );
    check(
      /^[1-9][0-9]*$/.test(env.STAGING_BACKUP_ARTIFACT_ID ?? "") &&
        /^[a-f0-9]{64}$/.test(env.STAGING_BACKUP_ARTIFACT_DIGEST ?? ""),
      "UPGRADE_UPLOADED_BACKUP_REQUIRED",
    );
  }
}

export function assertRetainedTestWork(work, details) {
  check(
    work &&
      details &&
      Array.isArray(details.webhooks) &&
      Array.isArray(details.scheduled) &&
      Array.isArray(details.subscriptions),
    "UPGRADE_WORK_INVENTORY_INVALID",
  );
  const keys = [
    "legacyCheckouts",
    "paddleCheckouts",
    "legacyPlans",
    "legacySeats",
    "paddleOperations",
    "paymentMethods",
    "legacyWebhooks",
    "certificationFixtures",
  ];
  check(
    keys.every((name) => work.work?.[name] === 0),
    "UPGRADE_RUNNABLE_BILLING_WORK_PRESENT",
  );
  check(
    Number.isSafeInteger(work.work.paddleWebhooks) &&
      work.work.paddleWebhooks >= 0 &&
      details.webhooks.every(
        (row) =>
          row.environment === "test" &&
          ["deferred", "manual_review"].includes(row.status) &&
          Number.isSafeInteger(row.count) &&
          row.count >= 0,
      ) &&
      details.webhooks.reduce((sum, row) => sum + row.count, 0) ===
        work.work.paddleWebhooks,
    "UPGRADE_UNREVIEWED_WEBHOOK_WORK",
  );
  check(
    work.scheduled?.invalidBoundaries === 0 &&
      Number.isSafeInteger(work.scheduled.count) &&
      details.scheduled.every(
        (row) =>
          row.environment === "test" &&
          row.source === "paddle" &&
          row.timing === "overdue" &&
          Number.isSafeInteger(row.count) &&
          row.count >= 0,
      ) &&
      details.scheduled.reduce((sum, row) => sum + row.count, 0) ===
        work.scheduled.count,
    "UPGRADE_UNREVIEWED_SCHEDULED_WORK",
  );
  check(
    details.subscriptions.every(
      (row) =>
        row.environment === "test" &&
        ["paddle", "lemonsqueezy"].includes(row.provider) &&
        [
          "active",
          "trialing",
          "on_trial",
          "past_due",
          "paused",
          "canceled",
          "cancelled",
          "expired",
          "unpaid",
        ].includes(row.status) &&
        Number.isSafeInteger(row.count) &&
        row.count >= 0,
    ),
    "UPGRADE_NON_SANDBOX_SUBSCRIPTIONS_PRESENT",
  );
}

export function assertRetainedRows(
  snapshot,
  current,
  includeFunctions = false,
) {
  check(
    ledgerRowsDigest(snapshot.ledger) ===
      ledgerRowsDigest(current.ledger.slice(0, snapshot.ledger.length)),
    "UPGRADE_MIGRATION_HISTORY_CHANGED",
  );
  check(
    Object.entries(snapshot.history).every(
      ([name, digest]) => current.history[name] === digest,
    ),
    "UPGRADE_RETAINED_HISTORY_CHANGED",
  );
  check(
    canonical(snapshot.schema.grants) === canonical(current.schema.grants),
    "UPGRADE_EXISTING_PERMISSIONS_CHANGED",
  );
  check(
    canonical(snapshot.work) === canonical(current.work) &&
      canonical(snapshot.details) === canonical(current.details),
    "UPGRADE_RETAINED_WORK_CHANGED",
  );
  if (includeFunctions)
    check(
      canonical(snapshot.functions) === canonical(current.functions),
      "UPGRADE_FUNCTION_GENERATION_CHANGED",
    );
}

function childEnvironment(env) {
  const names = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "RUNNER_TEMP",
    "RUNNER_TRACKING_ID",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
  ];
  return {
    ...Object.fromEntries(
      names
        .filter((name) => typeof env[name] === "string")
        .map((name) => [name, env[name]]),
    ),
    CI: "true",
    NO_COLOR: "1",
    SUPABASE_TELEMETRY_DISABLED: "1",
    SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN.trim(),
    SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD,
    SUPABASE_PROJECT_REF: UPGRADE_SCOPE.project,
    ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
  };
}

export async function runPopulatedUpgrade({
  action = "plan",
  env = process.env,
  root = process.cwd(),
  transport = fetch,
  execute = spawnSync,
  readSource = () => installationSource(root),
  readReference = () =>
    JSON.parse(readFileSync(env.STAGING_SCHEMA_REFERENCE_PATH, "utf8")),
  readCheckpoints = () =>
    JSON.parse(
      readFileSync(
        join(root, "config/staging-release-checkpoints.json"),
        "utf8",
      ),
    ),
  artifactFactory = disposableArtifact,
  verifyRecovery = verifyUpgradeBackupLocally,
  saveBackup = (bytes) =>
    writeFileSync(env.STAGING_UPGRADE_BACKUP_PATH, bytes, {
      mode: 0o600,
      flag: "wx",
    }),
  loadBackup = () => readFileSync(env.STAGING_UPGRADE_BACKUP_PATH),
  onProgress = () => {},
  now = Date.now,
} = {}) {
  const report = {
    status: "blocked",
    action,
    project: UPGRADE_SCOPE.project,
    origin: UPGRADE_SCOPE.origin,
    authorization: "github_environment_review",
    remoteWritesMayHaveOccurred: false,
    backupVerified: false,
    migrationCount: null,
    containedFunctions: [],
    deployedFunctions: [],
    providerCalls: 0,
    providerPaymentsVerified: false,
    frontendDeployed: false,
    gatesEnabled: false,
  };
  const artifacts = [];
  const stage = (name) => {
    report.stage = name;
    onProgress(report);
  };
  try {
    stage("source");
    check(
      ["plan", "prepare", "apply"].includes(action),
      "UPGRADE_ACTION_INVALID",
    );
    const source = readSource(),
      identity = source.identity;
    report.commit = source.commit;
    report.payloadCommit = identity.payload.frozenCommit;
    report.plan = {
      supportedStartingMigrations: [
        180, 181, 182, 183, 184, 185, 186, 187, 188,
      ],
      targetMigrations: 188,
      stages: [
        { name: "baseline", target: 184 },
        { name: "retirement", target: 185 },
        { name: "activation", target: 188 },
      ],
      functions: identity.functions.map(({ name, verifyJwt }) => ({
        name,
        verifyJwt,
      })),
      reviewedInstalledSchema: REVIEWED_STAGING_SCHEMA,
      preservedData:
        "Every public table, Auth users, existing migration rows, deferred/manual-review test webhooks and overdue test operations",
      backup:
        "Encrypted with this run's existing Supabase database password; restored and verified on disposable local Postgres before any hosted write",
      publicSettings: INITIAL_PUBLIC_SETTINGS,
    };
    if (action === "plan") {
      report.status = "plan";
      return report;
    }
    stage("context");
    validateUpgradeContext(env, source, action);
    const reference = readReference(),
      checkpoints = readCheckpoints();
    const binding = {
      project: UPGRADE_SCOPE.project,
      commit: source.commit,
      runId: env.GITHUB_RUN_ID,
      attempt: env.GITHUB_RUN_ATTEMPT,
    };
    const assertSource = () => {
      const current = readSource();
      validateUpgradeContext(env, current, action);
      check(
        current.commit === source.commit &&
          current.identity.payload.digest === identity.payload.digest,
        "UPGRADE_SOURCE_DRIFT",
      );
    };
    async function request(resource, query) {
      const controller = new AbortController(),
        timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await transport(
          `https://api.supabase.com/v1/projects/${UPGRADE_SCOPE.project}/${resource}`,
          {
            method: query === undefined ? "GET" : "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}`,
              "Content-Type": "application/json",
            },
            ...(query === undefined ? {} : { body: JSON.stringify({ query }) }),
          },
        );
        if (!response.ok) {
          const error = new Error("UPGRADE_READ_ONLY_REQUEST_FAILED");
          error.httpStatus = response.status;
          throw error;
        }
        return await readBoundedStagingJson(response, 8 * 1024 * 1024);
      } catch (cause) {
        const error = new Error("UPGRADE_READ_ONLY_REQUEST_FAILED");
        if (Number.isInteger(cause.httpStatus))
          error.httpStatus = cause.httpStatus;
        throw error;
      } finally {
        clearTimeout(timeout);
        controller.abort();
      }
    }
    const sql = (query) => request("database/query/read-only", query);
    async function observe() {
      const start = now();
      const inventory = await inspectStagingBilling({ env, transport });
      check(inventory.status === "inspected", "UPGRADE_INVENTORY_FAILED");
      check(
        inventory.migrations.matchesApprovedVersionPrefix &&
          inventory.migrations.appliedCount >= 180 &&
          inventory.migrations.appliedCount <= 188,
        "UPGRADE_UNSUPPORTED_LEDGER",
      );
      check(
        inventory.billingPolicy?.environment === "test" &&
          inventory.billingPolicy.salesEnabled === false &&
          inventory.billingPolicy.reconciliationEnabled === false,
        "UPGRADE_DISABLED_SANDBOX_POLICY_REQUIRED",
      );
      check(
        inventory.configuration.missingServerSettings.length === 0 &&
          inventory.configuration.livePaddleSettingCount === 0,
        "UPGRADE_SANDBOX_SETTINGS_REQUIRED",
      );
      check(
        inventory.functions.inactive.length === 0 &&
          inventory.functions.jwtMismatch.length === 0,
        "UPGRADE_FUNCTION_CONFIGURATION_INVALID",
      );
      const facts = one(await sql(INVENTORY_QUERY)).facts;
      check(
        facts.policy?.sales === false && facts.policy.reconciliation === false,
        "UPGRADE_DISABLED_SANDBOX_POLICY_REQUIRED",
      );
      const schema = verifyUpgradeSchema(
        facts,
        reference,
        identity,
        checkpoints,
        UPGRADE_SCOPE.project,
      );
      check(
        schema.count === inventory.migrations.appliedCount,
        "UPGRADE_LEDGER_CHANGED",
      );
      const tables = facts.tables.map((table) => table.name).sort();
      const history = one(await sql(historyQuery(tables))).history;
      check(
        history &&
          Object.keys(history).length === tables.length + 1 &&
          [...tables, "auth.users"].every((name) =>
            /^[a-f0-9]{32}$/.test(history[name] ?? ""),
          ),
        "UPGRADE_HISTORY_INVALID",
      );
      const work = one(
        await sql(
          workQuery(tables.includes("billing_payment_method_preparations_v2")),
        ),
      );
      const details = one(await sql(WORK_DETAIL_QUERY)).details;
      assertRetainedTestWork(work, details);
      check(
        one(await sql(SEQUENCE_QUERY)).count === 0,
        "UPGRADE_UNSUPPORTED_APPLICATION_SEQUENCES",
      );
      const functions = normalizeFunctionInventory(await request("functions"));
      const ledger = one(await sql(LEDGER_ROWS_QUERY)).rows;
      ledgerRowsDigest(ledger);
      check(
        canonical(ledger.map((row) => row.version)) ===
          canonical(facts.versions),
        "UPGRADE_LEDGER_CHANGED",
      );
      const allowed = new Set(
        [...identity.functions, ...identity.outsideFunctions].map(
          (f) => f.name,
        ),
      );
      check(
        functions.every((f) => allowed.has(f.name)),
        "UPGRADE_UNCLASSIFIED_FUNCTIONS_PRESENT",
      );
      check(
        now() - start >= 0 && now() - start < 60_000,
        "UPGRADE_OBSERVATION_TOO_OLD",
      );
      return {
        inventory,
        facts,
        schema,
        history,
        work,
        details,
        functions,
        ledger,
      };
    }
    stage("observe_installed_staging");
    let current = await observe();
    report.migrationCount = current.schema.count;
    report.schema = safeSchemaResult(current.schema);
    report.retainedTestWork = {
      deferredOrManualReviewWebhooks: current.work.work.paddleWebhooks,
      overdueScheduledOperations: current.work.scheduled.count,
      legacySubscriptions: current.facts.lsRoots.subscriptions,
    };
    if (action === "prepare") {
      stage("capture_private_recovery_snapshot");
      const createdAt = nowIso();
      const data = await captureUpgradeRows(
        sql,
        current.facts.tables.map((table) => table.name).sort(),
      );
      const snapshot = {
        ...binding,
        schemaVersion: 1,
        createdAt,
        payloadCommit: identity.payload.frozenCommit,
        ...current,
        data,
      };
      check(
        ledgerRowsDigest(data["supabase_migrations.schema_migrations"]) ===
          ledgerRowsDigest(current.ledger),
        "UPGRADE_MIGRATION_HISTORY_CHANGED",
      );
      stage("verify_snapshot_stability");
      const closing = await observe();
      check(
        current.schema.observedDigest === closing.schema.observedDigest,
        "UPGRADE_SCHEMA_CHANGED_DURING_BACKUP",
      );
      assertRetainedRows(snapshot, closing, true);
      stage("verify_recovery_on_disposable_local_database");
      snapshot.recovery = await verifyRecovery(snapshot, {
        identity,
        reference,
        checkpoints,
        root,
      });
      check(
        snapshot.recovery?.verified === true &&
          snapshot.recovery.allRetainedRowsIdentical === true &&
          snapshot.recovery.authUsersIncluded === true &&
          snapshot.recovery.migrationLedgerIncluded === true,
        "UPGRADE_RECOVERY_NOT_VERIFIED",
      );
      stage("recheck_staging_after_recovery_test");
      assertRetainedRows(snapshot, await observe(), true);
      assertSource();
      stage("encrypt_verified_backup");
      const encrypted = encryptUpgradeBackup(
        snapshot,
        env.SUPABASE_DB_PASSWORD,
      );
      saveBackup(encrypted);
      report.backupVerified = true;
      report.backup = {
        sha256: hash(encrypted),
        bytes: encrypted.length,
        publicTableCount: snapshot.recovery.publicTableCount,
        authUsersIncluded: true,
        migrationLedgerIncluded: true,
        recoveryVerifiedAt: snapshot.recovery.verifiedAt,
        encryption: "AES-256-GCM with scrypt; existing database password",
      };
      report.status = "prepared";
      return report;
    }
    stage("load_uploaded_verified_backup");
    const encrypted = loadBackup();
    const snapshot = decryptUpgradeBackup(
      encrypted,
      env.SUPABASE_DB_PASSWORD,
      binding,
    );
    check(
      snapshot.schemaVersion === 1 &&
        snapshot.payloadCommit === identity.payload.frozenCommit &&
        snapshot.recovery?.verified === true &&
        snapshot.recovery.allRetainedRowsIdentical === true &&
        snapshot.recovery.authUsersIncluded === true &&
        snapshot.recovery.migrationLedgerIncluded === true,
      "UPGRADE_RECOVERY_NOT_VERIFIED",
    );
    check(
      Number.isFinite(Date.parse(snapshot.createdAt)) &&
        now() >= Date.parse(snapshot.createdAt) &&
        now() - Date.parse(snapshot.createdAt) < 60 * 60_000,
      "UPGRADE_BACKUP_EXPIRED",
    );
    verifyUpgradeSchema(
      snapshot.facts,
      reference,
      identity,
      checkpoints,
      UPGRADE_SCOPE.project,
    );
    check(
      current.schema.count === snapshot.schema.count,
      "UPGRADE_LEDGER_CHANGED_AFTER_BACKUP",
    );
    assertRetainedRows(snapshot, current, true);
    report.backupVerified = true;
    report.backup = {
      sha256: hash(encrypted),
      artifactId: env.STAGING_BACKUP_ARTIFACT_ID,
      artifactDigest: env.STAGING_BACKUP_ARTIFACT_DIGEST,
      recoveryVerifiedAt: snapshot.recovery.verifiedAt,
    };
    const commandEnv = childEnvironment(env);
    const configurationDigest = identity.payload.records.find(
      (record) => record.path === "supabase/config.toml",
    ).sha256;
    const createArtifact = (phase, mode) => {
      const artifact = artifactFactory(root, identity, phase, mode);
      artifacts.push(artifact);
      verifyMigrationDirectory(
        artifact.directory,
        artifact.artifact,
        configurationDigest,
      );
      return artifact;
    };
    const command = (artifact, args) => {
      assertSource();
      verifyMigrationDirectory(
        artifact.directory,
        artifact.artifact,
        configurationDigest,
      );
      const result = execute(
        process.execPath,
        [resolve(root, "scripts/supabase-remote-guard.mjs"), ...args],
        {
          cwd: artifact.directory,
          env: commandEnv,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 16 * 1024 * 1024,
          timeout: 5 * 60_000,
          shell: false,
        },
      );
      check(
        !result.error && !result.signal && result.status === 0,
        "UPGRADE_GUARDED_CLI_FAILED",
      );
      return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    };
    stage("cli_version");
    const version = execute("supabase", ["--version"], {
      cwd: root,
      env: commandEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      shell: false,
    });
    check(
      !version.error &&
        !version.signal &&
        version.status === 0 &&
        version.stdout.trim() === UPGRADE_SCOPE.cliVersion,
      "UPGRADE_PINNED_CLI_REQUIRED",
    );
    const final = createArtifact("activation", "final");
    stage("link_and_validate_pending_migrations");
    command(final, ["link", "--project-ref", UPGRADE_SCOPE.project]);
    validateDryRun(
      command(final, ["db", "push", "--linked", "--dry-run"]),
      identity.manifest.migrations.approved
        .slice(current.schema.count)
        .map((m) => m.filename),
    );
    assertRetainedRows(snapshot, await observe(), true);
    stage("disable_checkout_and_select_sandbox");
    report.remoteWritesMayHaveOccurred = true;
    onProgress(report);
    command(final, [
      "secrets",
      "set",
      ...Object.entries(INITIAL_PUBLIC_SETTINGS).map(
        ([name, value]) => `${name}=${value}`,
      ),
      "--project-ref",
      UPGRADE_SCOPE.project,
    ]);
    const containment = createArtifact("activation", "containment");
    const containedNames = new Set(identity.containment.map((f) => f.name));
    for (const name of LS_TOMBSTONES) containedNames.add(name);
    const billingFunctions = identity.functions
      .filter((f) => containedNames.has(f.name))
      .sort(
        (a, b) =>
          Number(b.name === "billing-paddle-webhook") -
          Number(a.name === "billing-paddle-webhook"),
      );
    for (const f of billingFunctions) {
      stage(`contain_${f.name}`);
      verifyFunctionDirectory(containment.directory, f, "containment");
      command(containment, [
        "functions",
        "deploy",
        f.name,
        "--project-ref",
        UPGRADE_SCOPE.project,
        "--use-api",
        ...(f.verifyJwt ? [] : ["--no-verify-jwt"]),
      ]);
      report.containedFunctions.push(f.name);
      onProgress(report);
    }
    stage("verify_containment_and_retained_data");
    current = await observe();
    assertRetainedRows(snapshot, current);
    check(
      billingFunctions.every((f) =>
        current.functions.some(
          (remote) =>
            remote.name === f.name &&
            remote.status === "ACTIVE" &&
            remote.verify_jwt === f.verifyJwt,
        ),
      ),
      "UPGRADE_CONTAINMENT_INVENTORY_INVALID",
    );
    for (const [phase, target] of [
      ["baseline", 184],
      ["retirement", 185],
      ["activation", 188],
    ]) {
      if (current.schema.count >= target) continue;
      stage(`migrate_to_${target}`);
      const artifact = createArtifact(phase, "none");
      command(artifact, ["link", "--project-ref", UPGRADE_SCOPE.project]);
      validateDryRun(
        command(artifact, ["db", "push", "--linked", "--dry-run"]),
        identity.manifest.migrations.approved
          .slice(current.schema.count, target)
          .map((m) => m.filename),
      );
      assertRetainedRows(snapshot, await observe());
      command(artifact, ["db", "push", "--linked", "--yes"]);
      stage(`verify_migration_${target}`);
      current = await observe();
      check(
        current.schema.count === target,
        "UPGRADE_MIGRATION_COUNT_MISMATCH",
      );
      assertRetainedRows(snapshot, current);
      for (const name of Object.keys(current.history))
        if (!Object.hasOwn(snapshot.history, name))
          check(
            current.history[name] === "d751713988987e9331980363e24189ce",
            "UPGRADE_NEW_TABLE_NOT_EMPTY",
          );
      report.migrationCount = current.schema.count;
      report.schema = safeSchemaResult(current.schema);
      onProgress(report);
    }
    // Restore webhook ingestion last, once all supporting functions are deployed.
    const functions = [...identity.functions].sort(
      (a, b) =>
        Number(a.name === "billing-paddle-webhook") -
        Number(b.name === "billing-paddle-webhook"),
    );
    for (const f of functions) {
      stage(`deploy_${f.name}`);
      verifyFunctionDirectory(final.directory, f, "final");
      command(final, [
        "functions",
        "deploy",
        f.name,
        "--project-ref",
        UPGRADE_SCOPE.project,
        "--use-api",
        ...(f.verifyJwt ? [] : ["--no-verify-jwt"]),
      ]);
      report.deployedFunctions.push(f.name);
      onProgress(report);
    }
    stage("verify_final_backend");
    current = await observe();
    assertRetainedRows(snapshot, current);
    check(
      current.schema.count === 188 &&
        identity.functions.every((f) =>
          current.functions.some(
            (remote) =>
              remote.name === f.name &&
              remote.status === "ACTIVE" &&
              remote.verify_jwt === f.verifyJwt,
          ),
        ),
      "UPGRADE_FINAL_FUNCTION_INVENTORY_INVALID",
    );
    for (const f of snapshot.functions.filter((f) =>
      identity.outsideFunctions.some((outside) => outside.name === f.name),
    ))
      check(
        canonical(
          current.functions.find((remote) => remote.name === f.name),
        ) === canonical(f),
        "UPGRADE_OUTSIDE_FUNCTION_CHANGED",
      );
    report.schema = safeSchemaResult(current.schema);
    report.status = "backend_upgraded_sandbox_disabled";
    report.nextSteps = [
      "Deploy the matching staging frontend",
      "Verify Paddle catalogue and prepare a dedicated sandbox test owner",
      "Run real sandbox subscription, seat, portal, recovery and cancellation tests before merging main",
    ];
  } catch (error) {
    report.status = "blocked";
    report.code =
      /^(UPGRADE_[A-Z0-9_]+|SUPABASE_(ACCESS_TOKEN|DB_PASSWORD)_MISSING)$/.test(
        error.message ?? "",
      )
        ? error.message
        : "UPGRADE_OPERATION_FAILED";
    if (Number.isInteger(error.httpStatus))
      report.httpStatus = error.httpStatus;
    if (/^[a-z_]+$/.test(error.localStage ?? ""))
      report.localStage = error.localStage;
    if (/^[0-9A-Z]{5}$/.test(error.sqlState ?? ""))
      report.sqlState = error.sqlState;
  } finally {
    for (const artifact of artifacts.reverse()) {
      try {
        artifact.cleanup();
      } catch {
        report.status = "blocked";
        report.code = "UPGRADE_LOCAL_ARTIFACT_CLEANUP_FAILED";
      }
    }
    onProgress(report);
  }
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = "output/staging-upgrade";
  mkdirSync(directory, { recursive: true });
  const report = await runPopulatedUpgrade({
    action: process.argv[2] ?? "plan",
    onProgress: (value) =>
      writeFileSync(
        join(directory, "report.json"),
        JSON.stringify(value, null, 2),
      ),
  });
  console.log(JSON.stringify(report, null, 2));
  console.error(
    `::${report.status === "blocked" ? "error" : "notice"} title=Staging billing upgrade::status=${report.status}; stage=${report.stage}; code=${report.code ?? "none"}; migrations=${report.migrationCount ?? "unobserved"}/188; backupVerified=${report.backupVerified}; remoteWritesMayHaveOccurred=${report.remoteWritesMayHaveOccurred}${report.httpStatus ? `; httpStatus=${report.httpStatus}` : ""}${report.localStage ? `; localStage=${report.localStage}` : ""}${report.sqlState ? `; sqlState=${report.sqlState}` : ""}`,
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Staging billing upgrade\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`,
    );
  if (report.status === "blocked") process.exitCode = 1;
}
