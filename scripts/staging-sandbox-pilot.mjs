// Bounded staging activation through the existing GitHub environment review.
// No account creation, catalogue publication, provider writes or webhook replay.
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installationSource } from "./staging-initial-install.mjs";
import { guardedExitCode } from "./supabase-remote-guard.mjs";
import {
  STAGING_PROJECT,
  STAGING_ORIGIN,
  inspectStagingBilling,
  readBoundedStagingJson,
} from "./staging-billing-status.mjs";
import {
  CATALOGUE_QUERY,
  inspectSandboxCatalogue,
} from "./staging-sandbox-readiness.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
class PilotError extends Error {
  constructor(code, httpStatus) {
    super(code);
    this.httpStatus = httpStatus;
  }
}
const check = (condition, code) => {
  if (!condition) throw new PilotError(code);
};
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    value,
  );

export function validatePilotContext(env, source, mode) {
  check(
    ["enable_pilot", "pause_checkout"].includes(mode),
    "PILOT_MODE_INVALID",
  );
  check(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      env.GITHUB_REPOSITORY === "elkasaby1996-sys/coachos" &&
      env.GITHUB_REF === "refs/heads/Ahmed-billing" &&
      env.GITHUB_WORKFLOW === "Paddle Staging Readiness" &&
      env.GITHUB_WORKFLOW_REF ===
        "elkasaby1996-sys/coachos/.github/workflows/paddle-staging-readiness.yml@refs/heads/Ahmed-billing" &&
      env.STAGING_PILOT_ENVIRONMENT === "supabase-staging",
    "PILOT_PROTECTED_WORKFLOW_REQUIRED",
  );
  check(
    source.clean &&
      /^[a-f0-9]{40}$/.test(source.commit) &&
      env.GITHUB_SHA === source.commit &&
      env.CONFIRM_COMMIT_SHA === source.commit,
    "PILOT_COMMIT_MISMATCH",
  );
  check(
    env.STAGING_SUPABASE_PROJECT_REF === STAGING_PROJECT &&
      env.SUPABASE_PROJECT_REF === STAGING_PROJECT &&
      env.PADDLE_ENVIRONMENT === "sandbox" &&
      env.ALLOW_REMOTE_SUPABASE === "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
    "PILOT_TARGET_MISMATCH",
  );
  check(
    Boolean(env.SUPABASE_ACCESS_TOKEN?.trim()),
    "SUPABASE_ACCESS_TOKEN_MISSING",
  );
  check(uuid(env.STAGING_PILOT_USER_ID), "PILOT_USER_ID_INVALID");
  check(
    source.identity.manifest.migrations.approved.length === 188 &&
      source.identity.functions.length === 17,
    "PILOT_PAYLOAD_INVALID",
  );
}

export function pilotOwnerQuery(userId) {
  check(uuid(userId), "PILOT_USER_ID_INVALID");
  return `select
    exists(select 1 from auth.users where id='${userId}'::uuid and email_confirmed_at is not null
      and deleted_at is null and (banned_until is null or banned_until < now())) as confirmed,
    (select count(*)::integer from public.billing_accounts where owner_user_id='${userId}'::uuid) as accounts,
    (select count(*)::integer from public.workspaces w join public.billing_accounts a on a.owner_user_id=w.owner_user_id
      where w.owner_user_id='${userId}'::uuid) as workspaces,
    (select count(*)::integer from public.billing_subscriptions_v2 s join public.billing_accounts a on a.id=s.billing_account_id
      where a.owner_user_id='${userId}'::uuid) as provider_subscriptions,
    (select count(*)::integer from public.account_subscriptions s join public.billing_accounts a on a.id=s.billing_account_id
      where a.owner_user_id='${userId}'::uuid and s.subscription_kind<>'trial'
      and s.status in ('active','past_due','grace','restricted')) as paid_subscriptions,
    (select count(*)::integer from public.billing_checkouts_v2 c join public.billing_accounts a on a.id=c.billing_account_id
      where a.owner_user_id='${userId}'::uuid and c.status in ('creating','ready','ambiguous')) as pending_checkouts`;
}
export function validatePilotOwner(rows) {
  check(
    Array.isArray(rows) && rows.length === 1,
    "PILOT_OWNER_RESPONSE_INVALID",
  );
  const r = rows[0];
  check(
    r?.confirmed === true &&
      r.accounts === 1 &&
      Number.isSafeInteger(r.workspaces) &&
      r.workspaces > 0,
    "PILOT_CONFIRMED_WORKSPACE_OWNER_REQUIRED",
  );
  check(
    r.provider_subscriptions === 0 &&
      r.paid_subscriptions === 0 &&
      r.pending_checkouts === 0,
    "PILOT_EXISTING_PURCHASE_REQUIRES_REVIEW",
  );
  return {
    confirmed: true,
    billingAccount: true,
    workspace: true,
    initialPurchaseEligible: true,
  };
}

const snapshotSql = `select encode(extensions.digest(catalogue::text,'sha256'),'hex') as fingerprint
  from (${CATALOGUE_QUERY.trim().replace(/;$/, "")}) snapshot`;
export const PILOT_SNAPSHOT_QUERY = `${snapshotSql};`;

export function pilotPolicyQuery(userId, fingerprint) {
  check(
    uuid(userId) && /^[a-f0-9]{64}$/.test(fingerprint),
    "PILOT_SNAPSHOT_INVALID",
  );
  return `begin isolation level read committed;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $pilot$
declare owner_state record; observed text;
begin
  perform 1 from public.billing_runtime_policy where id=1 and entitlement_environment='test' for update;
  if not found then raise exception 'PILOT_TEST_POLICY_REQUIRED'; end if;
  perform public.validate_paddle_catalogue_v1('test');
  select fingerprint into observed from (${snapshotSql}) checked_snapshot;
  if observed is distinct from '${fingerprint}' then raise exception 'PILOT_CATALOGUE_CHANGED'; end if;
  perform 1 from public.billing_accounts where owner_user_id='${userId}'::uuid for update;
  select * into owner_state from (${pilotOwnerQuery(userId)}) checked_owner;
  if owner_state.confirmed is distinct from true or owner_state.accounts<>1 or owner_state.workspaces<1
    or owner_state.provider_subscriptions<>0 or owner_state.paid_subscriptions<>0 or owner_state.pending_checkouts<>0
    then raise exception 'PILOT_OWNER_CHANGED'; end if;
  update public.billing_runtime_policy set paddle_sales_enabled=true,
    paddle_reconciliation_enabled=true,updated_at=clock_timestamp() where id=1;
end $pilot$;
commit;`;
}
export const PAUSE_CHECKOUT_QUERY = `update public.billing_runtime_policy
 set paddle_sales_enabled=false,updated_at=clock_timestamp()
 where id=1 and entitlement_environment='test';`;

function settingMatches(settings, name, value) {
  // Management API exposes SHA-256 digests, never the stored secret value.
  return settings.some(
    (s) => s.name === name && (s.value ?? s.digest) === hash(value),
  );
}
export function validatePilotSettings(settings, userId, mode) {
  check(
    Array.isArray(settings) &&
      settings.every((s) => typeof s?.name === "string"),
    "PILOT_SETTINGS_RESPONSE_INVALID",
  );
  check(
    !settings.some(
      (s) =>
        s.name.startsWith("PADDLE_LIVE_") ||
        ["PADDLE_API_KEY", "PADDLE_API_BASE_URL"].includes(s.name),
    ),
    "PILOT_UNSCOPED_OR_LIVE_SETTINGS_PRESENT",
  );
  check(
    settingMatches(settings, "PADDLE_ENVIRONMENT", "sandbox") &&
      settingMatches(
        settings,
        "PADDLE_SANDBOX_PAYMENT_PAGE_URL",
        `${STAGING_ORIGIN}/billing/checkout`,
      ),
    "PILOT_RUNTIME_TARGET_MISMATCH",
  );
  const disabled = settingMatches(
    settings,
    "PADDLE_CHECKOUT_ACCESS_MODE",
    "disabled",
  );
  const ownPilot =
    settingMatches(settings, "PADDLE_CHECKOUT_ACCESS_MODE", "pilot") &&
    settingMatches(settings, "PADDLE_CHECKOUT_PILOT_USER_ID", userId);
  check(
    mode === "disabled"
      ? disabled
      : mode === "pilot"
        ? ownPilot
        : disabled || ownPilot,
    "PILOT_CHECKOUT_SCOPE_MISMATCH",
  );
}

export async function runSandboxPilot({
  mode,
  env = process.env,
  root = process.cwd(),
  transport = fetch,
  execute = spawnSync,
  readSource = () => installationSource(root),
  inspect = inspectStagingBilling,
  readiness = inspectSandboxCatalogue,
} = {}) {
  const report = {
    status: "blocked",
    stage: "context",
    mode,
    project: STAGING_PROJECT,
    authorization: "github_environment_review",
    remoteWritesMayHaveOccurred: false,
    checkoutConfigured: false,
    policyConfigured: false,
    paymentsVerified: false,
  };
  try {
    const source = readSource();
    validatePilotContext(env, source, mode);
    report.commit = source.commit;
    report.pilotUserSha256 = hash(env.STAGING_PILOT_USER_ID);
    const assertSource = () => {
      const current = readSource();
      validatePilotContext(env, current, mode);
      check(
        current.identity.payload.digest === source.identity.payload.digest,
        "PILOT_SOURCE_CHANGED",
      );
    };
    async function request(resource, query) {
      const response = await transport(
        `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/${resource}`,
        {
          method: query === undefined ? "GET" : "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}`,
            "Content-Type": "application/json",
          },
          ...(query === undefined ? {} : { body: JSON.stringify({ query }) }),
        },
      );
      if (!response.ok)
        throw new PilotError(
          "PILOT_MANAGEMENT_REQUEST_FAILED",
          response.status,
        );
      return readBoundedStagingJson(response);
    }
    const sql = (query) => request("database/query/read-only", query);
    report.stage = "verify_staging_backend";
    const inventory = await inspect({ env, transport });
    check(
      inventory.status === "inspected" &&
        inventory.project === STAGING_PROJECT &&
        inventory.migrations.appliedCount === 188 &&
        inventory.migrations.matchesApprovedVersionPrefix &&
        inventory.functions.missing.length === 0 &&
        inventory.functions.inactive.length === 0 &&
        inventory.functions.jwtMismatch.length === 0 &&
        inventory.configuration.missingServerSettings.length === 0 &&
        inventory.configuration.livePaddleSettingCount === 0 &&
        inventory.billingPolicy?.environment === "test",
      "PILOT_BACKEND_NOT_READY",
    );
    const settings = await request("secrets");
    validatePilotSettings(settings, env.STAGING_PILOT_USER_ID, "before");
    let fingerprint;
    if (mode === "enable_pilot") {
      report.stage = "verify_confirmed_workspace_owner";
      report.owner = validatePilotOwner(
        await sql(pilotOwnerQuery(env.STAGING_PILOT_USER_ID)),
      );
      report.stage = "verify_current_sandbox_prices";
      const snapshot = await sql(PILOT_SNAPSHOT_QUERY);
      fingerprint = snapshot?.[0]?.fingerprint;
      check(
        Array.isArray(snapshot) &&
          snapshot.length === 1 &&
          /^[a-f0-9]{64}$/.test(fingerprint),
        "PILOT_SNAPSHOT_INVALID",
      );
      const ready = await readiness({ env, transport });
      report.catalogue = ready.catalogue;
      check(
        ready.status === "inspected" &&
          ready.catalogue?.readiness ===
            "existing_mappings_match_provider_facts" &&
          ready.catalogue.matchedActiveMappings === 8,
        "PILOT_CATALOGUE_NOT_READY",
      );
      report.catalogueSnapshotSha256 = fingerprint;
    }
    // Pin the installed CLI and pass only needed credentials to the guarded wrapper.
    const cliEnv = Object.fromEntries(
      [
        "PATH",
        "HOME",
        "TMPDIR",
        "TEMP",
        "TMP",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "no_proxy",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "NODE_EXTRA_CA_CERTS",
        "SUPABASE_ACCESS_TOKEN",
        "SUPABASE_PROJECT_REF",
        "ALLOW_REMOTE_SUPABASE",
      ]
        .filter((k) => typeof env[k] === "string")
        .map((k) => [k, env[k]]),
    );
    const options = {
      cwd: root,
      env: { ...cliEnv, CI: "true", NO_COLOR: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    };
    report.stage = "verify_cli";
    const version = execute("supabase", ["--version"], options);
    check(
      guardedExitCode(version) === 0 && version.stdout.trim() === "2.109.1",
      "PILOT_PINNED_CLI_REQUIRED",
    );
    assertSource();
    report.stage = "configure_checkout_scope";
    const access = mode === "enable_pilot" ? "pilot" : "disabled";
    const values = {
      PADDLE_CHECKOUT_ACCESS_MODE: access,
      ...(access === "pilot"
        ? { PADDLE_CHECKOUT_PILOT_USER_ID: env.STAGING_PILOT_USER_ID }
        : {}),
    };
    report.remoteWritesMayHaveOccurred = true;
    const set = execute(
      process.execPath,
      [
        resolve(root, "scripts/supabase-remote-guard.mjs"),
        "secrets",
        "set",
        ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
        "--project-ref",
        STAGING_PROJECT,
      ],
      options,
    );
    check(guardedExitCode(set) === 0, "PILOT_SETTING_UPDATE_FAILED");
    validatePilotSettings(
      await request("secrets"),
      env.STAGING_PILOT_USER_ID,
      access,
    );
    report.checkoutConfigured = true;
    assertSource();
    report.stage = "configure_test_policy";
    await request(
      "database/query",
      mode === "enable_pilot"
        ? pilotPolicyQuery(env.STAGING_PILOT_USER_ID, fingerprint)
        : PAUSE_CHECKOUT_QUERY,
    );
    report.stage = "verify_final_policy";
    const rows = await sql(
      "select entitlement_environment as environment,paddle_sales_enabled as sales,paddle_reconciliation_enabled as reconciliation from public.billing_runtime_policy where id=1;",
    );
    check(
      Array.isArray(rows) &&
        rows.length === 1 &&
        rows[0].environment === "test" &&
        rows[0].sales === (mode === "enable_pilot") &&
        rows[0].reconciliation ===
          (mode === "enable_pilot"
            ? true
            : inventory.billingPolicy.reconciliationEnabled),
      "PILOT_FINAL_POLICY_MISMATCH",
    );
    report.policyConfigured = true;
    report.policy = rows[0];
    report.status = access === "pilot" ? "pilot_enabled" : "checkout_paused";
    report.stage = "complete";
  } catch (error) {
    report.code =
      error instanceof PilotError ? error.message : "PILOT_ACTIVATION_FAILED";
    if (error instanceof PilotError && Number.isInteger(error.httpStatus))
      report.httpStatus = error.httpStatus;
  }
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await runSandboxPilot({
    mode: process.env.STAGING_PILOT_MODE,
  });
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Staging sandbox pilot\n\nNo account creation, provider writes or payment verification.\n\n\`\`\`json\n${json}\n\`\`\`\n`,
    );
  console.error(
    `::${report.status === "blocked" ? "error" : "notice"} title=Staging sandbox pilot::status=${report.status}; stage=${report.stage}; code=${report.code ?? "none"}; remoteWritesMayHaveOccurred=${report.remoteWritesMayHaveOccurred}; paymentsVerified=false`,
  );
  if (report.status === "blocked") process.exitCode = 1;
}
