// User-selected initial staging installation under GitHub environment review.
// This is separate from the legacy signed founder certification workflows.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  disposableArtifact,
  releaseIdentity,
  verifyMigrationDirectory,
  verifyFunctionDirectory,
} from "./staging-release-artifacts.mjs";
import { validateDryRun } from "./billing-retirement-release.mjs";
import {
  STAGING_PROJECT,
  STAGING_ORIGIN,
  inspectStagingBilling,
  readBoundedStagingJson,
} from "./staging-billing-status.mjs";

export const INSTALL_SCOPE = Object.freeze({
  repository: "elkasaby1996-sys/coachos",
  branch: "Ahmed-billing",
  environment: "supabase-staging",
  project: STAGING_PROJECT,
  origin: STAGING_ORIGIN,
  workflow: "Supabase Staging Empty Bootstrap",
  workflowPath: ".github/workflows/supabase-staging-bootstrap.yml",
  cliVersion: "2.109.1",
});
export const INITIAL_AUTH_CONFIGURATION = Object.freeze({
  site_url: INSTALL_SCOPE.origin,
  uri_allow_list: `${INSTALL_SCOPE.origin}/auth/callback`,
  disable_signup: false,
  mailer_autoconfirm: false,
});
export const INITIAL_PUBLIC_SETTINGS = Object.freeze({
  PADDLE_ENVIRONMENT: "sandbox",
  PADDLE_CHECKOUT_ACCESS_MODE: "disabled",
  PADDLE_SANDBOX_PAYMENT_PAGE_URL: `${INSTALL_SCOPE.origin}/billing/checkout`,
});
export const FRESH_APPLICATION_QUERY = `select
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')) as public_relations,
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')) as public_routines,
  (select count(*)::integer from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('c','d','e','r','m') and not exists (select 1 from pg_depend d where d.classid='pg_type'::regclass and d.objid=t.oid and d.deptype='e')) as public_types,
  (select count(*)::integer from pg_namespace where nspname !~ '^pg_' and nspname not in ('information_schema','public','auth','storage','realtime','_realtime','extensions','graphql','graphql_public','net','vault','supabase_functions','supabase_migrations','pgbouncer','pgsodium','pgsodium_masks','cron','pgmq','_analytics')) as other_schemas,
  (select count(*)::integer from auth.users) as auth_users,
  (select count(*)::integer from storage.buckets) as storage_buckets,
  (select count(*)::integer from storage.objects) as storage_objects;`;
const freshFields = [
  "public_relations",
  "public_routines",
  "public_types",
  "other_schemas",
  "auth_users",
  "storage_buckets",
  "storage_objects",
];
class InstallError extends Error {
  constructor(code, httpStatus) {
    super(code);
    this.httpStatus = httpStatus;
  }
}
const check = (condition, code) => {
  if (!condition) throw new InstallError(code);
};
export function validateFreshApplication(rows) {
  check(
    Array.isArray(rows) &&
      rows.length === 1 &&
      rows[0] !== null &&
      typeof rows[0] === "object",
    "INITIAL_INVENTORY_INVALID",
  );
  const counts = Object.fromEntries(
    freshFields.map((key) => [key, rows[0][key]]),
  );
  check(
    Object.values(counts).every((n) => Number.isSafeInteger(n) && n >= 0),
    "INITIAL_INVENTORY_INVALID",
  );
  check(
    Object.values(counts).every((n) => n === 0),
    "INITIAL_PROJECT_NOT_EMPTY",
  );
  return counts;
}
export function installationSource(root = process.cwd()) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  return {
    commit: git(["rev-parse", "HEAD"]),
    clean: git(["status", "--porcelain=v1", "--untracked-files=normal"]) === "",
    identity: releaseIdentity(root),
  };
}
export function validateInstallContext(env, source, mode) {
  check(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      env.GITHUB_REPOSITORY === INSTALL_SCOPE.repository &&
      env.GITHUB_REF === `refs/heads/${INSTALL_SCOPE.branch}` &&
      env.GITHUB_WORKFLOW === INSTALL_SCOPE.workflow &&
      env.GITHUB_WORKFLOW_REF ===
        `${INSTALL_SCOPE.repository}/${INSTALL_SCOPE.workflowPath}@refs/heads/${INSTALL_SCOPE.branch}` &&
      env.STAGING_INSTALL_ENVIRONMENT === INSTALL_SCOPE.environment,
    "INITIAL_PROTECTED_WORKFLOW_REQUIRED",
  );
  check(
    source.clean &&
      /^[a-f0-9]{40}$/.test(source.commit) &&
      env.GITHUB_SHA === source.commit &&
      env.CONFIRM_COMMIT_SHA === source.commit,
    "INITIAL_COMMIT_CONFIRMATION_MISMATCH",
  );
  check(
    env.STAGING_SUPABASE_PROJECT_REF === INSTALL_SCOPE.project &&
      env.CONFIRM_PROJECT_REF === INSTALL_SCOPE.project &&
      env.STAGING_APPLICATION_ORIGIN === INSTALL_SCOPE.origin &&
      env.CONFIRM_APP_ORIGIN === INSTALL_SCOPE.origin,
    "INITIAL_TARGET_CONFIRMATION_MISMATCH",
  );
  check(
    Boolean(env.SUPABASE_ACCESS_TOKEN?.trim()),
    "SUPABASE_ACCESS_TOKEN_MISSING",
  );
  if (mode === "apply") {
    check(
      Boolean(env.SUPABASE_DB_PASSWORD?.trim()),
      "SUPABASE_DB_PASSWORD_MISSING",
    );
    check(
      env.ALLOW_REMOTE_SUPABASE === "I_UNDERSTAND_THIS_TOUCHES_REMOTE" &&
        env.SUPABASE_PROJECT_REF === INSTALL_SCOPE.project,
      "INITIAL_REMOTE_OPERATION_NOT_ENABLED",
    );
  }
}
function cliEnvironment(env) {
  // Keep credentials private and discard inherited CLI/database routing overrides.
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
    SUPABASE_PROJECT_REF: INSTALL_SCOPE.project,
    ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
  };
}

export async function runInitialInstall({
  mode = "plan",
  env = process.env,
  root = process.cwd(),
  transport = fetch,
  execute = spawnSync,
  readSource = () => installationSource(root),
  artifactFactory = disposableArtifact,
  now = Date.now,
} = {}) {
  let stage = "local_source",
    artifact;
  const report = {
    status: "blocked",
    mode,
    project: INSTALL_SCOPE.project,
    authorization: "github_environment_review",
    remoteCommandsAttempted: 0,
    remoteWritesMayHaveOccurred: false,
    migrationsApplied: false,
    deployedFunctions: [],
    authConfigured: false,
    publicSettingsConfigured: false,
    frontendDeployed: false,
    providerPaymentsVerified: false,
  };
  try {
    check(
      ["plan", "preflight", "apply"].includes(mode),
      "INITIAL_MODE_INVALID",
    );
    const source = readSource();
    const identity = source.identity;
    const migrations = identity.manifest.migrations.approved;
    check(
      migrations.length === 188 && identity.functions.length === 17,
      "INITIAL_PAYLOAD_INVALID",
    );
    report.commit = source.commit;
    report.plan = {
      origin: INSTALL_SCOPE.origin,
      payloadCommit: identity.payload.frozenCommit,
      payloadDigest: identity.payload.digest,
      migrationCount: migrations.length,
      firstMigration: migrations[0].filename,
      lastMigration: migrations.at(-1).filename,
      functions: identity.functions.map(({ name, verifyJwt }) => ({
        name,
        verifyJwt,
      })),
      publicSettings: INITIAL_PUBLIC_SETTINGS,
      authConfiguration: INITIAL_AUTH_CONFIGURATION,
      requiresFreshApplicationState: true,
    };
    if (mode === "plan") return Object.assign(report, { status: "plan" });
    stage = "context";
    validateInstallContext(env, source, mode);
    const assertSource = () => {
      const current = readSource();
      validateInstallContext(env, current, mode);
      check(
        current.identity.payload.digest === identity.payload.digest &&
          current.commit === source.commit,
        "INITIAL_SOURCE_CHANGED",
      );
    };
    async function request(resource, method = "GET", body) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await transport(
          `https://api.supabase.com/v1/projects/${INSTALL_SCOPE.project}/${resource}`,
          {
            method,
            redirect: "error",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}`,
              "Content-Type": "application/json",
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
        );
        if (!response.ok)
          throw new InstallError(
            "INITIAL_MANAGEMENT_REQUEST_FAILED",
            response.status,
          );
        if (method === "PATCH") {
          await response.body?.cancel();
          return;
        }
        return await readBoundedStagingJson(response);
      } catch (error) {
        if (error instanceof InstallError) throw error;
        throw new InstallError("INITIAL_MANAGEMENT_RESPONSE_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
        controller.abort();
      }
    }
    const inventory = async () => {
      const result = await inspectStagingBilling({ env, transport });
      if (result.status !== "inspected")
        throw new InstallError(
          "INITIAL_STATUS_INSPECTION_FAILED",
          result.httpStatus,
        );
      return result;
    };
    const fresh = async () => {
      const started = now();
      stage = "initial_inventory";
      const result = await inventory();
      check(
        result.migrations.appliedCount === 0 &&
          result.migrations.matchesApprovedVersionPrefix &&
          result.billingPolicy === null &&
          result.functions.totalDeployedCount === 0,
        "INITIAL_INSTALL_REQUIRES_UNINSTALLED_PROJECT",
      );
      check(
        result.configuration.livePaddleSettingCount === 0,
        "INITIAL_LIVE_PADDLE_SETTINGS_PRESENT",
      );
      report.missingPrivatePaddleSettings =
        result.configuration.missingServerSettings.filter(
          (name) => !Object.hasOwn(INITIAL_PUBLIC_SETTINGS, name),
        );
      check(
        report.missingPrivatePaddleSettings.length === 0,
        "INITIAL_PADDLE_SETTINGS_MISSING",
      );
      stage = "fresh_application_check";
      report.freshApplicationCounts = validateFreshApplication(
        await request("database/query/read-only", "POST", {
          query: FRESH_APPLICATION_QUERY,
        }),
      );
      check(now() - started < 60_000, "INITIAL_OBSERVATION_TOO_OLD");
      return started;
    };
    await fresh();
    if (mode === "preflight")
      return Object.assign(report, { status: "preflight_passed" });

    stage = "prepare_artifacts";
    artifact = artifactFactory(root, identity, "activation", "final");
    const configurationDigest = identity.payload.records.find(
      (r) => r.path === "supabase/config.toml",
    ).sha256;
    const verifyArtifact = () => {
      verifyMigrationDirectory(
        artifact.directory,
        artifact.artifact,
        configurationDigest,
      );
      for (const f of identity.functions)
        verifyFunctionDirectory(artifact.directory, f, "final");
    };
    verifyArtifact();
    const commandEnv = cliEnvironment(env);
    const options = {
      cwd: artifact.directory,
      env: commandEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
    };
    const command = (args) => {
      report.remoteCommandsAttempted++;
      let result;
      try {
        result = execute(
          process.execPath,
          [resolve(root, "scripts/supabase-remote-guard.mjs"), ...args],
          options,
        );
      } catch {
        throw new InstallError("INITIAL_CLI_FAILED");
      }
      check(
        !result.error && !result.signal && result.status === 0,
        "INITIAL_CLI_FAILED",
      );
      return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    };
    stage = "cli_version";
    const version = execute("supabase", ["--version"], options);
    check(
      !version.error &&
        !version.signal &&
        version.status === 0 &&
        version.stdout.trim() === INSTALL_SCOPE.cliVersion,
      "INITIAL_PINNED_CLI_REQUIRED",
    );
    stage = "link";
    command(["link", "--project-ref", INSTALL_SCOPE.project]);
    stage = "migration_dry_run";
    const dryRun = command(["db", "push", "--linked", "--dry-run"]);
    try {
      validateDryRun(
        dryRun,
        migrations.map((m) => m.filename),
      );
    } catch {
      throw new InstallError("INITIAL_DRY_RUN_MISMATCH");
    }
    verifyArtifact();
    assertSource();
    const observed = await fresh();
    assertSource();
    verifyArtifact();
    check(now() - observed < 60_000, "INITIAL_OBSERVATION_TOO_OLD");
    stage = "apply_migrations";
    report.remoteWritesMayHaveOccurred = true;
    command(["db", "push", "--linked", "--yes"]);
    stage = "verify_migrations";
    const migrated = await inventory();
    check(
      migrated.migrations.appliedCount === 188 &&
        migrated.migrations.matchesApprovedVersionPrefix &&
        migrated.migrations.pending.length === 0 &&
        migrated.billingPolicy?.environment === "test" &&
        migrated.billingPolicy.salesEnabled === false &&
        migrated.billingPolicy.reconciliationEnabled === false,
      "INITIAL_MIGRATION_VERIFICATION_FAILED",
    );
    report.migrationsApplied = true;
    assertSource();
    verifyArtifact();
    stage = "configure_public_settings";
    command([
      "secrets",
      "set",
      ...Object.entries(INITIAL_PUBLIC_SETTINGS).map(
        ([key, value]) => `${key}=${value}`,
      ),
      "--project-ref",
      INSTALL_SCOPE.project,
    ]);
    report.publicSettingsConfigured = true;
    stage = "configure_auth";
    await request("config/auth", "PATCH", INITIAL_AUTH_CONFIGURATION);
    const auth = await request("config/auth");
    check(
      Object.entries(INITIAL_AUTH_CONFIGURATION).every(
        ([key, value]) => auth?.[key] === value,
      ),
      "INITIAL_AUTH_VERIFICATION_FAILED",
    );
    report.authConfigured = true;
    for (const f of identity.functions) {
      stage = `deploy_${f.name}`;
      verifyFunctionDirectory(artifact.directory, f, "final");
      command([
        "functions",
        "deploy",
        f.name,
        "--project-ref",
        INSTALL_SCOPE.project,
        "--use-api",
        ...(f.verifyJwt ? [] : ["--no-verify-jwt"]),
      ]);
      report.deployedFunctions.push(f.name);
    }
    stage = "verify_functions";
    const functions = await request("functions");
    check(
      Array.isArray(functions) &&
        functions.length === identity.functions.length &&
        identity.functions.every((f) =>
          functions.some(
            (actual) =>
              actual.name === f.name &&
              actual.status === "ACTIVE" &&
              actual.verify_jwt === f.verifyJwt,
          ),
        ),
      "INITIAL_FUNCTION_VERIFICATION_FAILED",
    );
    stage = "final_inventory";
    const final = await inventory();
    check(
      final.migrations.appliedCount === 188 &&
        final.migrations.matchesApprovedVersionPrefix &&
        final.billingPolicy?.environment === "test" &&
        final.billingPolicy.salesEnabled === false &&
        final.billingPolicy.reconciliationEnabled === false &&
        final.configuration.missingServerSettings.length === 0 &&
        final.configuration.livePaddleSettingCount === 0 &&
        final.functions.missing.length === 0 &&
        final.functions.inactive.length === 0 &&
        final.functions.jwtMismatch.length === 0,
      "INITIAL_FINAL_VERIFICATION_FAILED",
    );
    report.inventory = final;
    return Object.assign(report, { status: "installed", stage: "complete" });
  } catch (error) {
    return Object.assign(report, {
      status: "blocked",
      stage,
      code:
        error instanceof InstallError
          ? error.message
          : "INITIAL_INSTALL_FAILED",
      ...(error instanceof InstallError && error.httpStatus !== undefined
        ? { httpStatus: error.httpStatus }
        : {}),
      retryAutomatically: false,
    });
  } finally {
    try {
      artifact?.cleanup();
    } catch {
      report.artifactCleanupFailed = true;
      // Preserve progress and the original failure instead of losing the report
      // (or leaking a filesystem error) while cleaning up the linked artifact.
      if (report.status !== "blocked")
        Object.assign(report, {
          status: "blocked",
          stage: "artifact_cleanup",
          code: "INITIAL_ARTIFACT_CLEANUP_FAILED",
          retryAutomatically: false,
        });
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await runInitialInstall({ mode: process.argv[2] ?? "plan" });
  const json = JSON.stringify(report, null, 2);
  mkdirSync("output/staging-release", { recursive: true });
  writeFileSync(
    "output/staging-release/initial-install-report.json",
    `${json}\n`,
  );
  console.log(json);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Initial staging installation\n\n\`\`\`json\n${json}\n\`\`\`\n`,
    );
  if (report.status === "blocked") {
    console.error(
      `::error title=Initial staging installation::stage=${report.stage}; code=${report.code}${report.httpStatus === undefined ? "" : `; httpStatus=${report.httpStatus}`}`,
    );
    process.exitCode = 1;
  }
}
